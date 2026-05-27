function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateString(value) {
  if (!isNonEmptyString(value)) return false;

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export function validatePdfRequest(req, res, next) {
  const {
    html,
    specializzazione,
    medico,
    paziente_nome,
    data_nascita,
    titolo_visita,
    data_visita,
  } = req.body ?? {};

  const errors = [];

  if (!isNonEmptyString(html)) {
    errors.push("html is required");
  }

  if (!isNonEmptyString(specializzazione)) {
    errors.push("specializzazione is required");
  }

  if (!isNonEmptyString(medico)) {
    errors.push("medico is required");
  }

  if (!isNonEmptyString(paziente_nome)) {
    errors.push("paziente_nome is required");
  }

  if (!isValidDateString(data_nascita)) {
    errors.push("data_nascita must be a valid date");
  }

  if (!isNonEmptyString(titolo_visita)) {
    errors.push("titolo_visita is required");
  }

  if (!isValidDateString(data_visita)) {
    errors.push("data_visita must be a valid date");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  next();
}
