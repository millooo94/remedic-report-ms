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
  let {
    html,
    specializzazione,
    medico,
    paziente_nome,
    data_nascita,
    titolo_visita,
    data_visita,
    attachments,
  } = payload;

  specializzazione = normalizeName(specializzazione);
  paziente_nome = normalizeName(paziente_nome);
  titolo_visita = normalizeName(titolo_visita);
  medico = normalizeDoctorName(medico);

  let page;

  try {
    page = await getPage();

    await page.setContent(html, {
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

    const finalPdf = await mergePdfAttachments(pdf, attachments?.pdfs ?? []);

    const dataNascitaITA = formatItalianDate(data_nascita);
    const dataVisitaITA = formatItalianDate(data_visita);

    const fileName = `${titolo_visita} - ${dataVisitaITA} - ${paziente_nome} (${dataNascitaITA}).pdf`;
    const missingDriveEnv = getMissingDriveEnv();

    if (missingDriveEnv.length > 0) {
      console.warn(
        `Drive upload skipped: missing env vars: ${missingDriveEnv.join(", ")}`,
      );
    } else {
      try {
        if (env.driveDebug) {
          console.log("[drive-debug] upload-context", {
            fileName,
            specializzazione,
            medico,
            paziente: `${paziente_nome} (${dataNascitaITA})`,
            rootFolder: env.rootFolder,
          });
        }

        const specializzazioneFolder = await findOrCreateFolder(
          specializzazione,
          env.rootFolder,
        );

        const medicoFolder = await findOrCreateFolder(
          medico,
          specializzazioneFolder,
        );

        const pazienteFolder = await findOrCreateFolder(
          `${paziente_nome} (${dataNascitaITA})`,
          medicoFolder,
        );

        await uploadOrReplaceFile(fileName, pazienteFolder, finalPdf);
      } catch (driveError) {
        console.error("Drive upload failed but PDF generation continued:", {
          fileName,
          specializzazione,
          medico,
          paziente: `${paziente_nome} (${dataNascitaITA})`,
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
      }
    }

    const base64Pdf = Buffer.from(finalPdf).toString("base64");
    return buildPrintPage(fileName, base64Pdf);
  } finally {
    if (page) {
      releasePage(page);
    }
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
