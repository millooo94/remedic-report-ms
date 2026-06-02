import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ALLOWED_ATTACHMENT_KINDS,
  EMG_ATTACHMENT_KINDS,
  PSG_ATTACHMENT_KINDS,
} from "../constants/drafts.js";
import { env } from "../config/env.js";
import { getDb, resolveUploadsRoot } from "../db/mysql.js";
import { uploadSignedPdfToDrive } from "./pdf.service.js";
import { sendSignedPdfNotificationEmail } from "./email.service.js";

const TRACE_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const SIGNATURE_ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const SIGNED_PDF_ALLOWED_MIME_TYPES = new Set(["application/pdf"]);
const PSG_REPORT_ALLOWED_MIME_TYPES = new Set(["application/pdf"]);
const MAX_TRACE_FILES = 10;
const MAX_TRACE_FILE_BYTES = 15 * 1024 * 1024;
const MAX_SIGNATURE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SIGNED_PDF_BYTES = 30 * 1024 * 1024;
const MAX_PSG_REPORT_BYTES = 30 * 1024 * 1024;

function createHttpError(status, message, fieldErrors = null) {
  const error = new Error(message);
  error.status = status;
  if (fieldErrors && typeof fieldErrors === "object") {
    error.fieldErrors = fieldErrors;
  }
  return error;
}

export function saveDraftAttachment(draftId, payload) {
  const db = getDb();
  const draft = getDraftRowForAttachments(draftId);
  const attachment = normalizeIncomingAttachment(payload);
  const config = getAttachmentConfig(attachment.kind);
  const contentBuffer = decodeBase64ToBuffer(attachment.base64, attachment.fileName);

  if (draft.tipo_referto !== config.reportType) {
    throw createHttpError(
      400,
      `Il tipo allegato ${attachment.kind} non e compatibile con la bozza ${draft.tipo_referto}.`,
    );
  }

  if (!config.allowedMimeTypes.has(attachment.mimeType)) {
    throw createHttpError(
      400,
      `Mime type non supportato per ${attachment.kind}.`,
      attachment.kind === EMG_ATTACHMENT_KINDS.SIGNED_PDF ||
        attachment.kind === PSG_ATTACHMENT_KINDS.SIGNED_PDF
        ? { pdf: "Il file selezionato deve essere un PDF valido." }
        : null,
    );
  }

  if (contentBuffer.byteLength > config.maxBytes) {
    throw createHttpError(
      400,
      `Il file ${attachment.fileName} supera la dimensione massima consentita.`,
      attachment.kind === EMG_ATTACHMENT_KINDS.SIGNED_PDF ||
        attachment.kind === PSG_ATTACHMENT_KINDS.SIGNED_PDF
        ? { pdf: "Il PDF firmato supera la dimensione massima consentita." }
        : null,
    );
  }

  if (config.maxCount != null) {
    const existingCount = Number(
      db
        .prepare(
          "SELECT COUNT(*) AS total FROM draft_attachments WHERE draft_id = ? AND kind = ?",
        )
        .get(draftId, attachment.kind)?.total || 0,
    );

    if (existingCount >= config.maxCount) {
      throw createHttpError(
        400,
        `Puoi salvare al massimo ${config.maxCount} allegati di tipo ${attachment.kind} per questa bozza.`,
      );
    }
  }

  if (config.replaceExisting) {
    deleteAttachmentsByKind(draftId, attachment.kind);
  }

  const uploadsRoot = resolveUploadsRoot(env.draftsUploadDir);
  const attachmentId = crypto.randomUUID();
  const fileName = buildStoredFileName(attachment.fileName, attachment.mimeType);
  const relativePath = path.join(
    config.reportType,
    draftId,
    config.subdirectory,
    fileName,
  );
  const absolutePath = path.join(uploadsRoot, relativePath);
  const now = new Date().toISOString();

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contentBuffer);

  db.prepare(
    `
      INSERT INTO draft_attachments (
        id,
        draft_id,
        kind,
        file_name,
        original_name,
        mime_type,
        size_bytes,
        storage_path,
        drive_file_id,
        drive_web_view_link,
        drive_folder_id,
        created_at
      ) VALUES (
        @id,
        @draft_id,
        @kind,
        @file_name,
        @original_name,
        @mime_type,
        @size_bytes,
        @storage_path,
        @drive_file_id,
        @drive_web_view_link,
        @drive_folder_id,
        @created_at
      )
    `,
  ).run({
    id: attachmentId,
    draft_id: draftId,
    kind: attachment.kind,
    file_name: fileName,
    original_name: attachment.fileName,
    mime_type: attachment.mimeType,
    size_bytes: contentBuffer.byteLength,
    storage_path: relativePath,
    drive_file_id: null,
    drive_web_view_link: null,
    drive_folder_id: null,
    created_at: now,
  });

  return getAttachmentMetadataById(draftId, attachmentId);
}

export async function saveSignedDraftPdfAndUpload(draftId, payload) {
  const draft = getDraftRowForAttachments(draftId);

  if (draft.tipo_referto !== "emg" && draft.tipo_referto !== "psg") {
    throw createHttpError(
      400,
      "Il caricamento del PDF firmato e supportato solo per EMG e PSG.",
    );
  }

  const requestedReportType = String(payload?.tipo_referto || "").trim();
  if (requestedReportType && requestedReportType !== draft.tipo_referto) {
    throw createHttpError(
      400,
      "tipo_referto del PDF firmato non coerente con la bozza.",
    );
  }

  if (draft.stato !== "pronto_per_firma") {
    throw createHttpError(
      409,
      "Il PDF firmato puo essere caricato solo per referti pronti per firma.",
      {
        pdf: "Il PDF firmato puo essere caricato solo per referti pronti per firma.",
      },
    );
  }

  const kind =
    draft.tipo_referto === "emg"
      ? EMG_ATTACHMENT_KINDS.SIGNED_PDF
      : PSG_ATTACHMENT_KINDS.SIGNED_PDF;

  const attachment = saveDraftAttachment(draftId, {
    kind,
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    base64: payload.base64,
  });
  const updatedDraft = setDraftStatus(draftId, "firmato_caricato");

  return {
    draft: updatedDraft,
    attachment: getAttachmentMetadataById(draftId, attachment.id),
    drive: null,
    notification: {
      sent: false,
      reason: "admin_drive_archive_required",
    },
  };
}

export async function archiveExistingSignedDraftPdfToDrive(draftId) {
  const draft = getDraftRowForAttachments(draftId);

  if (draft.tipo_referto !== "emg" && draft.tipo_referto !== "psg") {
    throw createHttpError(
      409,
      "Il salvataggio su Drive e disponibile solo per i referti asincroni firmati.",
    );
  }

  const attachment = getSignedDraftAttachmentForDraft(draftId);

  if (!attachment) {
    throw createHttpError(404, "PDF firmato non disponibile per questo referto.");
  }

  if (attachment.drive_file_id || attachment.drive_web_view_link) {
    return {
      draft: setDraftStatus(draftId, draft.stato === "completato" ? "completato" : "firmato_caricato"),
      attachment,
      drive: {
        fileName: attachment.original_name || attachment.file_name,
        specializzazione:
          draft.assigned_refertatore_specializzazione || draft.specializzazione || "",
        medico:
          draft.assigned_refertatore_name || draft.medico_refertatore || "",
        pazienteFolder: null,
        driveFileId: attachment.drive_file_id || null,
        driveWebViewLink: attachment.drive_web_view_link || null,
      },
      alreadySaved: true,
    };
  }

  const { buffer } = getDraftAttachmentContent(draftId, attachment.id);
  const driveContext = buildDriveContextFromDraft(draft);
  const driveInfo = await uploadSignedPdfToDrive(driveContext, buffer);
  persistAttachmentDriveMetadata(draftId, attachment.id, driveInfo);
  const notification = await sendSignedPdfNotificationEmail({
    reportType: draft.tipo_referto,
    patientName:
      draft.paziente_nome_completo ||
      `${draft.paziente_nome || ""} ${draft.paziente_cognome || ""}`.trim(),
    refertatoreName:
      draft.assigned_refertatore_name || draft.medico_refertatore || null,
    driveLink: driveInfo?.driveWebViewLink || null,
  });

  return {
    draft: setDraftStatus(draftId, "completato"),
    attachment: getAttachmentMetadataById(draftId, attachment.id),
    drive: driveInfo,
    alreadySaved: false,
    notification,
  };
}

export function listDraftAttachments(draftId) {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT
          id,
          draft_id,
          kind,
          file_name,
          original_name,
          mime_type,
          size_bytes,
          storage_path,
          drive_file_id,
          drive_web_view_link,
          drive_folder_id,
          created_at
        FROM draft_attachments
        WHERE draft_id = ?
        ORDER BY created_at ASC
      `,
    )
    .all(draftId)
    .map(toAttachmentMetadata);
}

export function getAttachmentMetadataById(draftId, attachmentId) {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          id,
          draft_id,
          kind,
          file_name,
          original_name,
          mime_type,
          size_bytes,
          storage_path,
          drive_file_id,
          drive_web_view_link,
          drive_folder_id,
          created_at
        FROM draft_attachments
        WHERE draft_id = ? AND id = ?
      `,
    )
    .get(draftId, attachmentId);

  if (!row) {
    throw createHttpError(404, "Allegato bozza non trovato.");
  }

  return toAttachmentMetadata(row);
}

export function getDraftAttachmentContent(draftId, attachmentId) {
  const metadata = getAttachmentMetadataById(draftId, attachmentId);
  const uploadsRoot = resolveUploadsRoot(env.draftsUploadDir);
  const absolutePath = path.join(uploadsRoot, metadata.storage_path);

  if (!fs.existsSync(absolutePath)) {
    throw createHttpError(404, "File allegato non disponibile.");
  }

  return {
    metadata,
    buffer: fs.readFileSync(absolutePath),
  };
}

export function getSignedDraftAttachmentForDraft(draftId) {
  const attachments = listDraftAttachments(draftId);
  return (
    attachments.find((attachment) => attachment.kind === EMG_ATTACHMENT_KINDS.SIGNED_PDF) ||
    attachments.find((attachment) => attachment.kind === PSG_ATTACHMENT_KINDS.SIGNED_PDF) ||
    null
  );
}

export function getSignedDraftAttachmentContentForDraft(draftId) {
  const attachment = getSignedDraftAttachmentForDraft(draftId);

  if (!attachment) {
    throw createHttpError(404, "PDF firmato non disponibile per questo referto.");
  }

  return getDraftAttachmentContent(draftId, attachment.id);
}

export function deleteDraftAttachment(draftId, attachmentId) {
  const metadata = getAttachmentMetadataById(draftId, attachmentId);

  if (
    metadata.kind === EMG_ATTACHMENT_KINDS.SIGNED_PDF ||
    metadata.kind === PSG_ATTACHMENT_KINDS.SIGNED_PDF
  ) {
    throw createHttpError(
      403,
      "Il PDF firmato definitivo non puo essere eliminato da questa endpoint.",
    );
  }

  const db = getDb();
  const uploadsRoot = resolveUploadsRoot(env.draftsUploadDir);
  const absolutePath = path.join(uploadsRoot, metadata.storage_path);

  db.prepare("DELETE FROM draft_attachments WHERE id = ? AND draft_id = ?").run(
    attachmentId,
    draftId,
  );

  removeFileIfExists(absolutePath);
  cleanupDirectoriesUpward(path.dirname(absolutePath), uploadsRoot);
}

export function deleteAllDraftAttachments(draftId) {
  const attachments = listDraftAttachments(draftId);
  const db = getDb();
  const uploadsRoot = resolveUploadsRoot(env.draftsUploadDir);

  db.prepare("DELETE FROM draft_attachments WHERE draft_id = ?").run(draftId);

  attachments.forEach((attachment) => {
    removeFileIfExists(path.join(uploadsRoot, attachment.storage_path));
  });

  const emgDraftRoot = path.join(uploadsRoot, "emg", draftId);
  const psgDraftRoot = path.join(uploadsRoot, "psg", draftId);
  cleanupDirectoriesUpward(emgDraftRoot, uploadsRoot);
  cleanupDirectoriesUpward(psgDraftRoot, uploadsRoot);
}

export function deleteAttachmentsByKind(draftId, kind) {
  const attachments = listDraftAttachments(draftId).filter(
    (attachment) => attachment.kind === kind,
  );

  attachments.forEach((attachment) => {
    const db = getDb();
    const uploadsRoot = resolveUploadsRoot(env.draftsUploadDir);
    const absolutePath = path.join(uploadsRoot, attachment.storage_path);

    db.prepare("DELETE FROM draft_attachments WHERE id = ? AND draft_id = ?").run(
      attachment.id,
      draftId,
    );

    removeFileIfExists(absolutePath);
    cleanupDirectoriesUpward(path.dirname(absolutePath), uploadsRoot);
  });
}

function getDraftRowForAttachments(draftId) {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          id,
          tipo_referto,
          stato,
          paziente_nome,
          paziente_cognome,
          paziente_nome_completo,
          data_nascita,
          codice_fiscale,
          telefono,
          email,
          medico_refertatore,
          medico_refertatore_id,
          assigned_refertatore_id,
          assigned_refertatore_email,
          assigned_refertatore_name,
          assigned_refertatore_specializzazione,
          specializzazione,
          prestazione,
          data_esame,
          form_data_json,
          schema_version,
          created_at,
          updated_at,
          completed_at
        FROM report_drafts
        WHERE id = ?
      `,
    )
    .get(draftId);

  if (!row) {
    throw createHttpError(404, "Bozza non trovata.");
  }

  return {
    ...row,
    form_data: row.form_data_json ? JSON.parse(row.form_data_json) : null,
  };
}

function buildDriveContextFromDraft(draft) {
  const form = draft.form_data?.form ?? {};
  const summary = {
    specializzazione:
      draft.assigned_refertatore_specializzazione ||
      draft.specializzazione ||
      form.medico?.specialita ||
      "Neurologia",
    medico:
      draft.assigned_refertatore_name ||
      draft.medico_refertatore ||
      `${form.medico?.nome ?? ""} ${form.medico?.cognome ?? ""}`.trim(),
    paziente_nome:
      draft.paziente_nome_completo ||
      `${form.anagrafica?.nome ?? ""} ${form.anagrafica?.cognome ?? ""}`.trim(),
    data_nascita:
      draft.data_nascita || form.anagrafica?.dataNascita || "",
    titolo_visita:
      form.titoloVisita ||
      (draft.tipo_referto === "emg"
        ? "Referto di Elettroneurografia / Elettromiografia"
        : "Refertazione polisonnografica cardio-respiratoria (PSG)"),
    data_visita:
      draft.data_esame ||
      form.dataVisita ||
      extractDatePart(form.psg?.dataRegistrazioneInizio) ||
      "",
  };

  return {
    html: "<html></html>",
    ...summary,
  };
}

function extractDatePart(value) {
  if (!value) return "";
  return String(value).includes("T")
    ? String(value).split("T")[0]
    : String(value).slice(0, 10);
}

function setDraftStatus(draftId, stato) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `
      UPDATE report_drafts
      SET
        stato = @stato,
        updated_at = @updated_at,
        completed_at = @completed_at
      WHERE id = @id
    `,
  ).run({
    id: draftId,
    stato,
    updated_at: now,
    completed_at: stato === "completato" ? now : null,
  });

  return {
    id: draftId,
    stato,
    updated_at: now,
    completed_at: stato === "completato" ? now : null,
  };
}

function normalizeIncomingAttachment(payload) {
  const kind = String(payload?.kind || "").trim();
  const fileName = String(payload?.fileName || "").trim();
  const mimeType = String(payload?.mimeType || "").trim().toLowerCase();
  const base64 = String(payload?.base64 || "").trim();

  if (!ALLOWED_ATTACHMENT_KINDS.includes(kind)) {
    throw createHttpError(400, "kind allegato non valido.");
  }

  if (!fileName) {
    throw createHttpError(400, "fileName allegato obbligatorio.");
  }

  if (!mimeType) {
    throw createHttpError(400, "mimeType allegato obbligatorio.");
  }

  if (!base64) {
    throw createHttpError(400, "base64 allegato obbligatorio.");
  }

  return {
    kind,
    fileName,
    mimeType,
    base64,
  };
}

function getAttachmentConfig(kind) {
  switch (kind) {
    case EMG_ATTACHMENT_KINDS.SIGNATURE:
      return {
        reportType: "emg",
        allowedMimeTypes: SIGNATURE_ALLOWED_MIME_TYPES,
        maxBytes: MAX_SIGNATURE_FILE_BYTES,
        subdirectory: "firma-tnfp",
        replaceExisting: true,
      };
    case EMG_ATTACHMENT_KINDS.SIGNED_PDF:
      return {
        reportType: "emg",
        allowedMimeTypes: SIGNED_PDF_ALLOWED_MIME_TYPES,
        maxBytes: MAX_SIGNED_PDF_BYTES,
        subdirectory: "firmati",
        replaceExisting: true,
      };
    case PSG_ATTACHMENT_KINDS.SIGNED_PDF:
      return {
        reportType: "psg",
        allowedMimeTypes: SIGNED_PDF_ALLOWED_MIME_TYPES,
        maxBytes: MAX_SIGNED_PDF_BYTES,
        subdirectory: "firmati",
        replaceExisting: true,
      };
    case PSG_ATTACHMENT_KINDS.REPORT:
      return {
        reportType: "psg",
        allowedMimeTypes: PSG_REPORT_ALLOWED_MIME_TYPES,
        maxBytes: MAX_PSG_REPORT_BYTES,
        subdirectory: "report-strumentale",
        replaceExisting: true,
      };
    case EMG_ATTACHMENT_KINDS.TRACE:
    default:
      return {
        reportType: "emg",
        allowedMimeTypes: TRACE_ALLOWED_MIME_TYPES,
        maxBytes: MAX_TRACE_FILE_BYTES,
        subdirectory: "tracciati",
        maxCount: MAX_TRACE_FILES,
        replaceExisting: false,
      };
  }
}

function decodeBase64ToBuffer(rawBase64, fileName) {
  const normalized = rawBase64.includes(",")
    ? rawBase64.split(",").pop() || ""
    : rawBase64;

  if (!normalized) {
    throw createHttpError(400, `Base64 non valido per il file ${fileName}.`);
  }

  try {
    return Buffer.from(normalized, "base64");
  } catch {
    throw createHttpError(400, `Base64 non valido per il file ${fileName}.`);
  }
}

function buildStoredFileName(originalName, mimeType) {
  const safeBaseName = sanitizeFileName(
    path.basename(originalName, path.extname(originalName)),
  );
  const extension = extensionFromMimeType(mimeType) || path.extname(originalName) || "";
  return `${Date.now()}-${safeBaseName || "file"}${extension}`;
}

function sanitizeFileName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function extensionFromMimeType(mimeType) {
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    default:
      return "";
  }
}

function toAttachmentMetadata(row) {
  return {
    id: row.id,
    draft_id: row.draft_id,
    kind: row.kind,
    file_name: row.file_name,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes || 0),
    storage_path: row.storage_path,
    drive_file_id: row.drive_file_id || null,
    drive_web_view_link: row.drive_web_view_link || null,
    drive_folder_id: row.drive_folder_id || null,
    created_at: row.created_at,
  };
}

function persistAttachmentDriveMetadata(draftId, attachmentId, driveInfo) {
  if (!driveInfo) {
    return;
  }

  const db = getDb();
  db.prepare(
    `
      UPDATE draft_attachments
      SET
        drive_file_id = @drive_file_id,
        drive_web_view_link = @drive_web_view_link,
        drive_folder_id = @drive_folder_id
      WHERE draft_id = @draft_id AND id = @id
    `,
  ).run({
    id: attachmentId,
    draft_id: draftId,
    drive_file_id: driveInfo.driveFileId || null,
    drive_web_view_link: driveInfo.driveWebViewLink || null,
    drive_folder_id: driveInfo.pazienteFolder || null,
  });
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function cleanupDirectoriesUpward(startDir, stopDir) {
  let currentDir = startDir;

  while (
    currentDir &&
    currentDir.startsWith(stopDir) &&
    currentDir !== stopDir
  ) {
    if (!fs.existsSync(currentDir)) {
      currentDir = path.dirname(currentDir);
      continue;
    }

    const files = fs.readdirSync(currentDir);
    if (files.length > 0) {
      break;
    }

    fs.rmdirSync(currentDir);
    currentDir = path.dirname(currentDir);
  }
}

