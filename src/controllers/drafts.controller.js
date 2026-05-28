import {
  createDraft,
  deleteDraft,
  getDraftById,
  listDrafts,
  updateDraft,
  updateDraftStatus,
} from "../services/drafts.service.js";

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
    return res.status(204).send();
  } catch (error) {
    return handleDraftError(res, error);
  }
}
