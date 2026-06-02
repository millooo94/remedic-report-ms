import path from "node:path";
import { env } from "../config/env.js";
import { AUDIT_ACTIONS, createAuditLog, listAuditLogs } from "../services/audit.service.js";
import {
  deleteDraft,
  getDraftById,
  hideDraftFromAdminArchive,
  listDrafts,
} from "../services/drafts.service.js";
import {
  createUser,
  getUserById,
  listUsers,
  updateUser,
  updateUserStatus,
} from "../services/users.service.js";
import {
  archiveExistingSignedDraftPdfToDrive,
  getSignedDraftAttachmentContentForDraft,
  getSignedDraftAttachmentForDraft,
} from "../services/draft-attachments.service.js";
import { sendSignedReportToPatient } from "../services/email.service.js";
import {
  createDraftEmailDelivery,
  listDraftEmailDeliveries,
} from "../services/draft-email-deliveries.service.js";
import { resolveUploadsRoot } from "../db/mysql.js";

function handleError(res, error, fallbackMessage) {
  const status = Number(error?.status || 500);
  const message = status >= 500 ? fallbackMessage : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Admin error:", error?.message || error);
  }

  return res.status(status).json({
    error: message,
    message,
    ...(error?.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
  });
}

export function listAdminUsersController(req, res) {
  try {
    return res.json({
      items: listUsers({
        ...req.query,
        active: req.query?.active === undefined ? "1" : req.query.active,
      }),
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
      action: user.active ? AUDIT_ACTIONS.REFERTATORE_UPDATED : AUDIT_ACTIONS.REFERTATORE_DISABLED,
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

export function deleteAdminUserController(req, res) {
  try {
    const existing = getUserById(req.params.id);
    const user = updateUserStatus(req.params.id, false);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.REFERTATORE_DISABLED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { role: existing.role, active: user.active },
    });
    return res.json({
      ok: true,
      user,
      message: "Refertatore disattivato. I referti storici restano conservati.",
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nella disattivazione utente.");
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

export function deleteAdminDraftController(req, res) {
  try {
    const draft = getDraftById(req.params.id);
    deleteDraft(req.params.id);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.DRAFT_DELETED,
      entityType: "draft",
      entityId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        scope: "admin_active",
        tipo_referto: draft.tipo_referto,
      },
    });
    return res.json({
      ok: true,
      message: "Referto in lavorazione eliminato correttamente.",
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nell'eliminazione del referto in lavorazione.");
  }
}

export function deleteAdminArchiveDraftController(req, res) {
  try {
    const draft = hideDraftFromAdminArchive(req.params.id);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.DRAFT_DELETED,
      entityType: "draft",
      entityId: draft.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        scope: "admin_archive",
        softHidden: true,
        tipo_referto: draft.tipo_referto,
      },
    });
    return res.json({
      ok: true,
      draft,
      message: "Referto archiviato rimosso dalla lista admin.",
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nella rimozione del referto archiviato.");
  }
}

export async function saveAdminArchiveDraftToDriveController(req, res) {
  try {
    const draft = getDraftById(req.params.id);
    const result = await archiveExistingSignedDraftPdfToDrive(req.params.id);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.SIGNED_PDF_UPLOADED,
      entityType: "draft",
      entityId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        scope: "admin_archive_drive",
        tipo_referto: draft.tipo_referto,
        alreadySaved: result.alreadySaved === true,
      },
    });
    if (result.notification) {
      createAuditLog({
        userId: req.authUser?.id,
        role: req.authUser?.role,
        action: result.notification.sent
          ? AUDIT_ACTIONS.SIGNED_PDF_NOTIFICATION_SENT
          : AUDIT_ACTIONS.EMAIL_SEND_FAILED,
        entityType: "draft",
        entityId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          target: "humancare_notification",
          reason: result.notification.reason || null,
        },
      });
    }
    return res.json({
      ok: true,
      message:
        result.alreadySaved === true
          ? "Il referto risulta gia archiviato su Drive."
          : "Referto archiviato su Drive correttamente.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error, "Errore interno durante l'archiviazione su Drive.");
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

