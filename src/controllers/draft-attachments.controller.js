import {
  deleteDraftAttachment,
  getDraftAttachmentContent,
  listDraftAttachments,
  saveDraftAttachment,
  saveSignedDraftPdfAndUpload,
} from "../services/draft-attachments.service.js";
import { AUDIT_ACTIONS, createAuditLog } from "../services/audit.service.js";

function handleAttachmentError(res, error) {
  const status = Number(error?.status || 500);
  const message =
    status >= 500
      ? "Errore interno nella gestione degli allegati bozza."
      : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Draft attachment error:", error?.message || error);
  }

  return res.status(status).json({
    error: message,
    message,
    ...(error?.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
  });
}

export function createDraftAttachmentController(req, res) {
  try {
    const attachment = saveDraftAttachment(req.params.id, req.body);
    return res.status(201).json(attachment);
  } catch (error) {
    return handleAttachmentError(res, error);
  }
}

export function listDraftAttachmentsController(req, res) {
  try {
    const attachments = listDraftAttachments(req.params.id);
    return res.json({ items: attachments });
  } catch (error) {
    return handleAttachmentError(res, error);
  }
}

export function getDraftAttachmentController(req, res) {
  try {
    const { metadata, buffer } = getDraftAttachmentContent(
      req.params.id,
      req.params.attachmentId,
    );
    const encoding = String(req.query?.encoding || "").trim().toLowerCase();

    if (encoding === "data-url") {
      return res.json({
        ...metadata,
        dataUrl: `data:${metadata.mime_type};base64,${buffer.toString("base64")}`,
      });
    }

    if (encoding === "base64") {
      return res.json({
        ...metadata,
        base64: buffer.toString("base64"),
      });
    }

    res.setHeader("Content-Type", metadata.mime_type);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${metadata.original_name || metadata.file_name}"`,
    );
    return res.send(buffer);
  } catch (error) {
    return handleAttachmentError(res, error);
  }
}

export function deleteDraftAttachmentController(req, res) {
  try {
    deleteDraftAttachment(req.params.id, req.params.attachmentId);
    return res.status(204).send();
  } catch (error) {
    return handleAttachmentError(res, error);
  }
}

export async function uploadSignedDraftPdfController(req, res) {
  try {
    const result = await saveSignedDraftPdfAndUpload(req.params.id, req.body);
    createAuditLog({
      userId: req.authUser?.id || null,
      role: req.authUser?.role || null,
      action: AUDIT_ACTIONS.SIGNED_PDF_UPLOADED,
      entityType: "draft",
      entityId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        tipo_referto: req.body?.tipo_referto || null,
        storage: "local_signed_pdf",
      },
    });
    if (result?.notification?.sent) {
      createAuditLog({
        userId: req.authUser?.id || null,
        role: req.authUser?.role || null,
        action: AUDIT_ACTIONS.SIGNED_PDF_NOTIFICATION_SENT,
        entityType: "draft",
        entityId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          channel: "email",
          recipient: "humancaretelemedicine@gmail.com",
        },
      });
    } else if (result?.notification?.reason === "email_send_failed") {
      createAuditLog({
        userId: req.authUser?.id || null,
        role: req.authUser?.role || null,
        action: AUDIT_ACTIONS.EMAIL_SEND_FAILED,
        entityType: "draft",
        entityId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          channel: "email",
          reason: result.notification.reason,
        },
      });
    }
    return res.status(201).json(result);
  } catch (error) {
    return handleAttachmentError(res, error);
  }
}
