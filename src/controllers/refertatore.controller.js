import {
  assertRefertatoreDraftReadyForSignature,
  completeRefertatoreDraft,
  getRefertatoreDraftById,
  listRefertatoreArchive,
  listRefertatoreDrafts,
  updateRefertatoreDraft,
} from "../services/drafts.service.js";
import { AUDIT_ACTIONS, createAuditLog } from "../services/audit.service.js";

function handleError(res, error, fallbackMessage) {
  const status = Number(error?.status || 500);
  const message = status >= 500 ? fallbackMessage : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Refertatore error:", error?.message || error);
  }

  return res.status(status).json({
    error: message,
    ...(error?.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
  });
}

function normalizeReportType(value) {
  const reportType = String(value || "").trim();
  if (reportType !== "emg" && reportType !== "psg") {
    throw Object.assign(new Error("tipo_referto non valido."), { status: 400 });
  }
  return reportType;
}

export function meRefertatoreController(req, res) {
  return res.json({ user: req.authUser });
}

export function listRefertatoreDraftsController(req, res) {
  try {
    const tipoReferto = normalizeReportType(req.query?.tipo_referto);
    return res.json({
      items: listRefertatoreDrafts(req.authUser.id, tipoReferto),
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento referti assegnati.");
  }
}

export function listRefertatoreArchiveController(req, res) {
  try {
    const tipoReferto = normalizeReportType(req.query?.tipo_referto);
    return res.json({
      items: listRefertatoreArchive(req.authUser.id, tipoReferto),
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento archivio refertatore.");
  }
}

export function getRefertatoreDraftController(req, res) {
  try {
    return res.json(getRefertatoreDraftById(req.authUser.id, req.params.id));
  } catch (error) {
    return handleError(res, error, "Errore interno nell'apertura referto assegnato.");
  }
}

export function updateRefertatoreDraftController(req, res) {
  try {
    return res.json(updateRefertatoreDraft(req.authUser.id, req.params.id, req.body));
  } catch (error) {
    return handleError(res, error, "Errore interno nel salvataggio referto assegnato.");
  }
}

export function completeRefertatoreDraftController(req, res) {
  try {
    const draft = completeRefertatoreDraft(req.authUser.id, req.params.id, req.body);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.REFERTATORE_DRAFT_COMPLETED,
      entityType: "draft",
      entityId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        stato: draft.stato,
        tipo_referto: draft.tipo_referto,
      },
    });
    return res.json(draft);
  } catch (error) {
    return handleError(res, error, "Errore interno nel completamento referto assegnato.");
  }
}

export function exportPreviewRefertatoreDraftController(req, res) {
  try {
    assertRefertatoreDraftReadyForSignature(req.authUser.id, req.params.id);
  } catch (error) {
    return handleError(res, error, "Errore interno nell'export temporaneo del referto.");
  }

  createAuditLog({
    userId: req.authUser?.id,
    role: req.authUser?.role,
    action: AUDIT_ACTIONS.PDF_PREVIEW_EXPORTED,
    entityType: "draft",
    entityId: req.params.id,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return res.status(204).send();
}
