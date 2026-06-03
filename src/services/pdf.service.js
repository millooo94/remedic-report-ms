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

const MERGEABLE_ATTACHMENT_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

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

    const buffer = await mergeDocumentAttachments(pdf, payload.attachments);

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

async function mergeDocumentAttachments(mainPdfBuffer, attachments) {
  const normalizedAttachments = normalizeMergeAttachments(attachments);

  if (normalizedAttachments.length === 0) {
    return mainPdfBuffer;
  }

  const mergedDocument = await PDFDocument.load(mainPdfBuffer);

  for (const attachment of normalizedAttachments) {
    if (attachment?.mimeType === "application/pdf") {
      await appendPdfAttachment(mergedDocument, attachment);
      continue;
    }

    if (MERGEABLE_ATTACHMENT_IMAGE_TYPES.has(attachment?.mimeType)) {
      await appendImageAttachment(mergedDocument, attachment);
      continue;
    }

    throw createPdfAttachmentError(
      attachment?.fileName,
      "Attachment type is not supported for final PDF merge.",
    );
  }

  const mergedPdfBytes = await mergedDocument.save();
  return Buffer.from(mergedPdfBytes);
}

function normalizeMergeAttachments(attachments) {
  if (!attachments || typeof attachments !== "object") {
    return [];
  }

  if (Array.isArray(attachments.files) && attachments.files.length > 0) {
    return attachments.files;
  }

  if (Array.isArray(attachments.pdfs) && attachments.pdfs.length > 0) {
    return attachments.pdfs;
  }

  return [];
}

async function appendPdfAttachment(mergedDocument, attachment) {
  const attachmentBuffer = decodeAttachmentBase64(
    attachment,
    "PDF attachment content is not valid.",
  );

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

async function appendImageAttachment(mergedDocument, attachment) {
  const attachmentBuffer = decodeAttachmentBase64(
    attachment,
    "Image attachment content is not valid.",
  );

  let imagePdfBuffer;

  try {
    imagePdfBuffer = await renderImageAttachmentPdfBuffer(
      attachment,
      attachmentBuffer,
    );
  } catch {
    throw createPdfAttachmentError(
      attachment?.fileName,
      "Unable to prepare attached image for the final PDF.",
    );
  }

  try {
    const imagePdfDocument = await PDFDocument.load(imagePdfBuffer);
    const pages = await mergedDocument.copyPages(
      imagePdfDocument,
      imagePdfDocument.getPageIndices(),
    );
    pages.forEach((page) => mergedDocument.addPage(page));
  } catch {
    throw createPdfAttachmentError(
      attachment?.fileName,
      "Unable to merge attached image into the final PDF.",
    );
  }
}

function decodeAttachmentBase64(attachment, invalidMessage) {
  try {
    const buffer = Buffer.from(String(attachment?.base64 || ""), "base64");
    if (!buffer.length) {
      throw new Error("empty");
    }
    return buffer;
  } catch {
    throw createPdfAttachmentError(attachment?.fileName, invalidMessage);
  }
}

async function renderImageAttachmentPdfBuffer(attachment, buffer) {
  let page;

  try {
    page = await getPage();

    const dataUrl = `data:${attachment.mimeType};base64,${buffer.toString("base64")}`;
    await page.setContent(
      `
        <!DOCTYPE html>
        <html lang="it">
          <head>
            <meta charset="utf-8" />
            <style>
              @page {
                size: A4;
                margin: 18mm 14mm 16mm;
              }

              html, body {
                margin: 0;
                padding: 0;
                font-family: Arial, Helvetica, sans-serif;
                color: #16313a;
              }

              .attachment-sheet {
                display: flex;
                flex-direction: column;
                gap: 12px;
              }

              .attachment-title {
                font-size: 14px;
                font-weight: 700;
                color: #1c3d47;
                word-break: break-word;
              }

              .attachment-image-wrap {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 240mm;
                border: 1px solid rgba(22, 49, 58, 0.12);
                border-radius: 12px;
                overflow: hidden;
                background: #ffffff;
              }

              .attachment-image {
                max-width: 100%;
                max-height: 238mm;
                object-fit: contain;
                display: block;
              }
            </style>
          </head>
          <body>
            <main class="attachment-sheet">
              <div class="attachment-title">${escapeHtml(attachment.fileName || "Allegato")}</div>
              <div class="attachment-image-wrap">
                <img class="attachment-image" src="${dataUrl}" alt="${escapeHtml(
                  attachment.fileName || "Allegato",
                )}" />
              </div>
            </main>
          </body>
        </html>
      `,
      {
        waitUntil: "domcontentloaded",
        timeout: 0,
      },
    );

    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: {
        top: "0mm",
        bottom: "0mm",
        left: "0mm",
        right: "0mm",
      },
    });
  } finally {
    if (page) {
      releasePage(page);
    }
  }
}

function createPdfAttachmentError(fileName, message) {
  const err = new Error(
    fileName ? `${message} Problematic file: ${fileName}.` : message,
  );
  err.statusCode = 400;
  return err;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
