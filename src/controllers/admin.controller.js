import path from "node:path";
import { env } from "../config/env.js";
import { AUDIT_ACTIONS, createAuditLog, listAuditLogs } from "../services/audit.service.js";
import { getDraftById, listDrafts } from "../services/drafts.service.js";
import {
  createUser,
  listUsers,
  updateUser,
  updateUserStatus,
} from "../services/users.service.js";
import {
  getSignedDraftAttachmentContentForDraft,
  getSignedDraftAttachmentForDraft,
} from "../services/draft-attachments.service.js";
import { sendSignedReportToPatient } from "../services/email.service.js";
import {
  createDraftEmailDelivery,
  listDraftEmailDeliveries,
} from "../services/draft-email-deliveries.service.js";
import { resolveUploadsRoot } from "../db/sqlite.js";

function handleError(res, error, fallbackMessage) {
  const status = Number(error?.status || 500);
  const message = status >= 500 ? fallbackMessage : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Admin error:", error?.message || error);
  }

  return res.status(status).json({ error: message });
}

export function listAdminUsersController(req, res) {
  try {
    return res.json({
      items: listUsers(req.query),
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento utenti.");
  }
}

export function createAdminUserController(req, res) {
  try {
    const user = createUser(req.body);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.REFERTATORE_CREATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { role: user.role, assignedTypes: user.assignedTypes },
    });
    return res.status(201).json(user);
  } catch (error) {
    return handleError(res, error, "Errore interno nella creazione utente.");
  }
}

export function updateAdminUserController(req, res) {
  try {
    const user = updateUser(req.params.id, req.body);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.REFERTATORE_UPDATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { role: user.role, assignedTypes: user.assignedTypes },
    });
    return res.json(user);
  } catch (error) {
    return handleError(res, error, "Errore interno nell'aggiornamento utente.");
  }
}

export function updateAdminUserStatusController(req, res) {
  try {
    const user = updateUserStatus(req.params.id, req.body?.active !== false);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.REFERTATORE_UPDATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { active: user.active },
    });
    return res.json(user);
  } catch (error) {
    return handleError(res, error, "Errore interno nell'aggiornamento stato utente.");
  }
}

export function listAdminDraftsController(req, res) {
  try {
    return res.json(listDrafts({ ...req.query, scope: "active" }));
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento referti in lavorazione.");
  }
}

export function listAdminArchiveController(req, res) {
  try {
    return res.json(listDrafts({ ...req.query, scope: "archive" }));
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento archivio referti.");
  }
}

export function listAdminAuditLogsController(req, res) {
  try {
    return res.json(listAuditLogs(req.query));
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento audit log.");
  }
}

export function listAdminDraftEmailDeliveriesController(req, res) {
  try {
    return res.json({
      items: listDraftEmailDeliveries(req.params.id),
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento storico email.");
  }
}

export async function sendAdminDraftToPatientController(req, res) {
  const to = String(req.body?.to || "").trim().toLowerCase();
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "").trim();

  try {
    validateSendToPatientPayload({ to, subject, body });

    const draft = getDraftById(req.params.id);

    if (draft.stato !== "completato") {
      return res.status(409).json({
        ok: false,
        message: "Solo i referti completati possono essere inviati al paziente.",
      });
    }

    const signedAttachment = getSignedDraftAttachmentForDraft(draft.id);
    if (!signedAttachment) {
      return res.status(404).json({
        ok: false,
        message: "PDF firmato non disponibile per questo referto.",
      });
    }

    const { metadata } = getSignedDraftAttachmentContentForDraft(draft.id);
    const attachmentPath = buildSignedAttachmentAbsolutePath(metadata.storage_path);
    const attachmentFileName = buildPatientAttachmentFileName(draft);

    const result = await sendSignedReportToPatient({
      to,
      subject,
      body,
      attachmentPath,
      attachmentFileName,
      draft,
    });

    if (!result.sent) {
      createDraftEmailDelivery({
        draftId: draft.id,
        sentByUserId: req.authUser.id,
        recipientEmail: to,
        subject,
        status: "failed",
        errorMessage: "smtp_not_configured",
      });
      return res.status(503).json({
        ok: false,
        message:
          "Impossibile inviare il referto. Verifica configurazione email o disponibilita del PDF firmato.",
      });
    }

    createDraftEmailDelivery({
      draftId: draft.id,
      sentByUserId: req.authUser.id,
      recipientEmail: to,
      subject,
      status: "sent",
    });

    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.SIGNED_REPORT_SENT_TO_PATIENT,
      entityType: "draft",
      entityId: draft.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        tipo_referto: draft.tipo_referto,
        recipient_email_masked: maskEmail(to),
      },
    });

    return res.json({
      ok: true,
      message: "Referto inviato al paziente.",
    });
  } catch (error) {
    const draftId = req.params.id;
    if (to && subject) {
      try {
        createDraftEmailDelivery({
          draftId,
          sentByUserId: req.authUser?.id,
          recipientEmail: to,
          subject,
          status: "failed",
          errorMessage:
            Number(error?.status || 500) >= 500
              ? "internal_error"
              : String(error?.message || "request_error").slice(0, 200),
        });
      } catch {}
    }
    return handleError(
      res,
      error,
      "Impossibile inviare il referto. Verifica configurazione email o disponibilita del PDF firmato.",
    );
  }
}

function validateSendToPatientPayload({ to, subject, body }) {
  if (!isValidEmail(to)) {
    const error = new Error("Email destinatario non valida.");
    error.status = 400;
    throw error;
  }

  if (!subject) {
    const error = new Error("Oggetto email obbligatorio.");
    error.status = 400;
    throw error;
  }

  if (!body) {
    const error = new Error("Corpo email obbligatorio.");
    error.status = 400;
    throw error;
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function buildSignedAttachmentAbsolutePath(storagePath) {
  return path.join(resolveUploadsRoot(env.draftsUploadDir), storagePath);
}

function buildPatientAttachmentFileName(draft) {
  const patientName =
    draft.summary?.paziente_nome_completo ||
    [draft.summary?.paziente_cognome, draft.summary?.paziente_nome]
      .filter(Boolean)
      .join("-") ||
    "Paziente";
  const sanitized = sanitizeFileName(patientName);
  const typeLabel = draft.tipo_referto === "psg" ? "PSG" : "EMG";
  return `Referto-${typeLabel}-${sanitized}.pdf`;
}

function sanitizeFileName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function maskEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) {
    return "***";
  }
  const safeLocal =
    local.length <= 2
      ? `${local[0] || "*"}*`
      : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${safeLocal}@${domain}`;
}
