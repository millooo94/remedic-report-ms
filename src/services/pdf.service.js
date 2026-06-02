import { env, getDriveConfigStatus, getMissingDriveEnv } from "../config/env.js";
import { PDFDocument } from "pdf-lib";
import { REPORT_LOGO_BASE64 } from "../constants/report-logo.js";
import { buildPageFooterTemplate } from "../templates/build-page-footer.template.js";
import { buildPageHeaderTemplate } from "../templates/build-page-header.template.js";
import { buildPrintPage } from "../templates/print-page.template.js";
import { formatItalianDate } from "../utils/date.js";
import { normalizeDoctorName, normalizeName } from "../utils/strings.js";
import { getPage, releasePage } from "./browser-pool.service.js";
import { findOrCreateFolder, uploadOrReplaceFile } from "./drive.service.js";

export async function generatePdfPrintPage(payload) {
  const { buffer, fileName, context } = await generatePdfDocument(payload);
  let drive = null;

  try {
    drive = await uploadReportPdfToDrive(context, buffer, {
      throwOnError: false,
    });
  } catch {
    // error already handled/logged when throwOnError is false
  }

  const base64Pdf = Buffer.from(buffer).toString("base64");
  return {
    htmlPage: buildPrintPage(fileName, base64Pdf),
    drive,
  };
}

export async function generatePdfPreview(payload) {
  return generatePdfDocument(payload);
}

export async function uploadSignedPdfToDrive(payload, pdfBuffer) {
  const context = normalizePdfContext(payload);
  return uploadReportPdfToDrive(context, pdfBuffer, { throwOnError: true });
}

async function generatePdfDocument(payload) {
  let page;

  try {
    const context = normalizePdfContext(payload);
    page = await getPage();

    await page.setContent(payload.html, {
      waitUntil: "domcontentloaded",
      timeout: 0,
    });

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: buildPageHeaderTemplate(REPORT_LOGO_BASE64),
      footerTemplate: buildPageFooterTemplate(),
      margin: {
        top: "30mm",
        bottom: "12mm",
        left: "0mm",
        right: "0mm",
      },
    });

    const buffer = await mergePdfAttachments(pdf, payload.attachments?.pdfs ?? []);

    return {
      buffer,
      fileName: context.fileName,
      context,
    };
  } finally {
    if (page) {
      releasePage(page);
    }
  }
}

function normalizePdfContext(payload) {
  const specializzazione = normalizeName(payload.specializzazione);
  const paziente_nome = normalizeName(payload.paziente_nome);
  const titolo_visita = normalizeName(payload.titolo_visita);
  const medico = normalizeDoctorName(payload.medico);
  const data_nascita = payload.data_nascita;
  const data_visita = payload.data_visita;
  const dataNascitaITA = formatItalianDate(data_nascita);
  const dataVisitaITA = formatItalianDate(data_visita);
  const fileName = `${titolo_visita} - ${dataVisitaITA} - ${paziente_nome} (${dataNascitaITA}).pdf`;

  return {
    html: payload.html,
    specializzazione,
    medico,
    paziente_nome,
    data_nascita,
    data_visita,
    titolo_visita,
    dataNascitaITA,
    dataVisitaITA,
    fileName,
  };
}

export async function uploadReportPdfToDrive(
  context,
  pdfBuffer,
  { throwOnError = false } = {},
) {
  const missingDriveEnv = getMissingDriveEnv();

  if (missingDriveEnv.length > 0) {
    const message = `Drive upload skipped: missing env vars: ${missingDriveEnv.join(", ")}`;

    if (throwOnError) {
      const error = new Error(message);
      error.statusCode = 500;
      throw error;
    }

    console.warn(message);
    return null;
  }

  try {
    if (env.driveDebug) {
      console.log("[drive-debug] upload-context", {
        fileName: context.fileName,
        specializzazione: context.specializzazione,
        medico: context.medico,
        paziente: `${context.paziente_nome} (${context.dataNascitaITA})`,
        rootFolder: env.rootFolder,
      });
    }

    const specializzazioneFolder = await findOrCreateFolder(
      context.specializzazione,
      env.rootFolder,
    );

    const medicoFolder = await findOrCreateFolder(
      context.medico,
      specializzazioneFolder,
    );

    const pazienteFolder = await findOrCreateFolder(
      `${context.paziente_nome} (${context.dataNascitaITA})`,
      medicoFolder,
    );

    const uploadedFile = await uploadOrReplaceFile(
      context.fileName,
      pazienteFolder,
      pdfBuffer,
    );

    return {
      fileName: uploadedFile?.fileName || context.fileName,
      specializzazione: context.specializzazione,
      medico: context.medico,
      pazienteFolder,
      driveFileId: uploadedFile?.fileId || null,
      driveWebViewLink: uploadedFile?.webViewLink || null,
    };
  } catch (driveError) {
    if (throwOnError) {
      const error = new Error(
        driveError?.response?.data?.error?.message ||
          driveError?.message ||
          "Drive upload failed.",
      );
      error.statusCode = 500;
      throw error;
    }

    console.error("Drive upload failed but PDF generation continued:", {
      fileName: context.fileName,
      specializzazione: context.specializzazione,
      medico: context.medico,
      paziente: `${context.paziente_nome} (${context.dataNascitaITA})`,
      driveConfig: getDriveConfigStatus(),
      error: {
        message:
          driveError?.response?.data?.error?.message ||
          driveError?.message ||
          String(driveError),
        code: driveError?.code || null,
        status: driveError?.status || driveError?.response?.status || null,
        errors: driveError?.response?.data?.error?.errors || null,
      },
    });

    return null;
  }
}

async function mergePdfAttachments(mainPdfBuffer, pdfAttachments) {
  if (!Array.isArray(pdfAttachments) || pdfAttachments.length === 0) {
    return mainPdfBuffer;
  }

  const mergedDocument = await PDFDocument.load(mainPdfBuffer);

  for (const attachment of pdfAttachments) {
    if (attachment?.mimeType !== "application/pdf") {
      continue;
    }

    let attachmentBuffer;

    try {
      attachmentBuffer = Buffer.from(attachment.base64, "base64");
    } catch {
      throw createPdfAttachmentError(
        attachment?.fileName,
        "Base64 PDF attachment is not valid.",
      );
    }

    try {
      const attachmentDocument = await PDFDocument.load(attachmentBuffer);
      const pages = await mergedDocument.copyPages(
        attachmentDocument,
        attachmentDocument.getPageIndices(),
      );

      pages.forEach((page) => mergedDocument.addPage(page));
    } catch {
      throw createPdfAttachmentError(
        attachment?.fileName,
        "Unable to read attached PDF. The file may be corrupted.",
      );
    }
  }

  const mergedPdfBytes = await mergedDocument.save();
  return Buffer.from(mergedPdfBytes);
}

function createPdfAttachmentError(fileName, message) {
  const err = new Error(
    fileName ? `${message} Problematic file: ${fileName}.` : message,
  );
  err.statusCode = 400;
  return err;
}
