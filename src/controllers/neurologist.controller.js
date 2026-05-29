import {
  getNeurologistEmgDraftById,
  listNeurologistEmgDrafts,
  updateNeurologistEmgDraft,
} from "../services/drafts.service.js";

function handleNeurologistError(res, error) {
  const status = Number(error?.status || 500);
  const message =
    status >= 500
      ? "Errore interno nell'area neurologo EMG."
      : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Neurologist EMG error:", error?.message || error);
  }

  return res.status(status).json({ error: message });
}

export function listNeurologistEmgDraftsController(_req, res) {
  try {
    return res.json({ items: listNeurologistEmgDrafts() });
  } catch (error) {
    return handleNeurologistError(res, error);
  }
}

export function getNeurologistEmgDraftController(req, res) {
  try {
    return res.json(getNeurologistEmgDraftById(req.params.id));
  } catch (error) {
    return handleNeurologistError(res, error);
  }
}

export function updateNeurologistEmgDraftController(req, res) {
  try {
    return res.json(updateNeurologistEmgDraft(req.params.id, req.body));
  } catch (error) {
    return handleNeurologistError(res, error);
  }
}
