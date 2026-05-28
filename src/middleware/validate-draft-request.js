const ALLOWED_REPORT_TYPES = new Set(["standard", "emg", "psg"]);
const ALLOWED_DRAFT_STATUSES = new Set([
  "bozza",
  "anamnesi_raccolta",
  "in_refertazione",
  "completato",
]);
const MAX_FORM_DATA_BYTES = 1024 * 1024;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function validateCommonDraftPayload(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return ["Il payload draft deve essere un oggetto JSON."];
  }

  if (!ALLOWED_REPORT_TYPES.has(body.tipo_referto)) {
    errors.push("tipo_referto obbligatorio e non valido.");
  }

  if (!ALLOWED_DRAFT_STATUSES.has(body.stato)) {
    errors.push("stato obbligatorio e non valido.");
  }

  if (!isPlainObject(body.summary)) {
    errors.push("summary obbligatorio.");
  }

  if (!isPlainObject(body.form_data)) {
    errors.push("form_data obbligatorio.");
  } else {
    const serialized = JSON.stringify(body.form_data);

    if (!serialized || serialized === "{}") {
      errors.push("form_data non puo essere vuoto.");
    } else if (Buffer.byteLength(serialized, "utf8") > MAX_FORM_DATA_BYTES) {
      errors.push("form_data supera la dimensione massima consentita.");
    }
  }

  return errors;
}

export function validateCreateDraftRequest(req, res, next) {
  const errors = validateCommonDraftPayload(req.body);

  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  next();
}

export function validateUpdateDraftRequest(req, res, next) {
  const errors = validateCommonDraftPayload(req.body);

  if (!normalizeText(req.params.id)) {
    errors.push("id bozza mancante.");
  }

  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  next();
}

export function validateDraftStatusRequest(req, res, next) {
  const id = normalizeText(req.params.id);
  const stato = normalizeText(req.body?.stato);

  if (!id) {
    return res.status(400).json({ error: "id bozza mancante." });
  }

  if (!ALLOWED_DRAFT_STATUSES.has(stato)) {
    return res.status(400).json({ error: "stato obbligatorio e non valido." });
  }

  next();
}
