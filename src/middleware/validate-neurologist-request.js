function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

export function validateNeurologistEmgUpdateRequest(req, res, next) {
  const draftId = normalizeText(req.params.id);
  const emg = req.body?.form_data?.form?.emg;

  if (!draftId) {
    return res.status(400).json({ error: "id bozza mancante." });
  }

  if (!emg || typeof emg !== "object") {
    return res.status(400).json({
      error: "form_data.form.emg obbligatorio per il salvataggio neurologo.",
    });
  }

  next();
}
