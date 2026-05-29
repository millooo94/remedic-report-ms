import {
  createDraft,
  deleteDraft,
  getDraftById,
  listDrafts,
  sendDraftToAssignedRefertatore,
  updateDraft,
  updateDraftStatus,
} from "../services/drafts.service.js";
import { AUDIT_ACTIONS, createAuditLog } from "../services/audit.service.js";

function handleDraftError(res, error) {
  const status = Number(error?.status || 500);
  const message =
    status >= 500
      ? "Errore interno nella gestione delle bozze."
      : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Drafts error:", error?.message || error);
  }

  return res.status(status).json({ error: message });
}

export function createDraftController(req, res) {
  try {
    const draft = createDraft(req.body);
    return res.status(201).json(draft);
  } catch (error) {
    return handleDraftError(res, error);
  }
}

export function listDraftsController(req, res) {
  try {
    const result = listDrafts(req.query);
    return res.json(result);
  } catch (error) {
    return handleDraftError(res, error);
  }
}

export function getDraftController(req, res) {
  try {
    const draft = getDraftById(req.params.id);
    return res.json(draft);
  } catch (error) {
    return handleDraftError(res, error);
  }
}

export function updateDraftController(req, res) {
  try {
    const draft = updateDraft(req.params.id, req.body);
    return res.json(draft);
  } catch (error) {
    return handleDraftError(res, error);
  }
}

export function updateDraftStatusController(req, res) {
  try {
    const draft = updateDraftStatus(req.params.id, req.body.stato);
    return res.json(draft);
  } catch (error) {
    return handleDraftError(res, error);
  }
}

export function deleteDraftController(req, res) {
  try {
    deleteDraft(req.params.id);
    createAuditLog({
      userId: req.authUser?.id || null,
      role: req.authUser?.role || null,
      action: AUDIT_ACTIONS.DRAFT_DELETED,
      entityType: "draft",
      entityId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.status(204).send();
  } catch (error) {
    return handleDraftError(res, error);
  }
}

export async function sendDraftToRefertatoreController(req, res) {
  try {
    const result = await sendDraftToAssignedRefertatore(req.params.id);
    createAuditLog({
      userId: req.authUser?.id || null,
      role: req.authUser?.role || null,
      action: AUDIT_ACTIONS.DRAFT_SENT_TO_REFERTATORE,
      entityType: "draft",
      entityId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        emailSent: result.emailSent,
        stato: result.draft?.stato || null,
      },
    });
    return res.json(result);
  } catch (error) {
    return handleDraftError(res, error);
  }
}
