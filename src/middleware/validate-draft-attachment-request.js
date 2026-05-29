function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

export function validateCreateDraftAttachmentRequest(req, res, next) {
  const draftId = normalizeText(req.params.id);
  const kind = normalizeText(req.body?.kind);
  const fileName = normalizeText(req.body?.fileName);
  const mimeType = normalizeText(req.body?.mimeType);
  const base64 = normalizeText(req.body?.base64);

  if (!draftId) {
    return res.status(400).json({ error: "id bozza mancante." });
  }

  if (!kind || !fileName || !mimeType || !base64) {
    return res.status(400).json({
      error: "kind, fileName, mimeType e base64 sono obbligatori.",
    });
  }

  next();
}

export function validateSignedDraftPdfRequest(req, res, next) {
  const draftId = normalizeText(req.params.id);
  const fileName = normalizeText(req.body?.fileName);
  const mimeType = normalizeText(req.body?.mimeType);
  const base64 = normalizeText(req.body?.base64);

  if (!draftId) {
    return res.status(400).json({ error: "id bozza mancante." });
  }

  if (!fileName || !mimeType || !base64) {
    return res.status(400).json({
      error: "fileName, mimeType e base64 sono obbligatori per il PDF firmato.",
    });
  }

  if (mimeType !== "application/pdf") {
    return res.status(400).json({
      error: "Il PDF firmato deve avere mimeType application/pdf.",
    });
  }

  next();
}
