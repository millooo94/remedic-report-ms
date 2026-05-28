function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const MAX_ATTACHMENT_PDFS = 10;
const MAX_ATTACHMENT_PDF_SIZE_BYTES = 10 * 1024 * 1024;

function isValidDateString(value) {
  if (!isNonEmptyString(value)) return false;

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function getBase64SizeBytes(base64Value) {
  try {
    return Buffer.from(base64Value, "base64").length;
  } catch {
    return NaN;
  }
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
    attachments,
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

  if (attachments !== undefined) {
    if (typeof attachments !== "object" || attachments === null) {
      errors.push("attachments must be an object");
    } else if (
      attachments.pdfs !== undefined &&
      !Array.isArray(attachments.pdfs)
    ) {
      errors.push("attachments.pdfs must be an array");
    } else if (Array.isArray(attachments.pdfs)) {
      if (attachments.pdfs.length > MAX_ATTACHMENT_PDFS) {
        errors.push(
          `attachments.pdfs must contain at most ${MAX_ATTACHMENT_PDFS} files`,
        );
      }

      attachments.pdfs.forEach((pdf, index) => {
        const fileLabel = isNonEmptyString(pdf?.fileName)
          ? pdf.fileName.trim()
          : `attachments.pdfs[${index}]`;

        if (!isNonEmptyString(pdf?.fileName)) {
          errors.push(`${fileLabel}: fileName is required`);
        }

        if (pdf?.mimeType !== "application/pdf") {
          errors.push(`${fileLabel}: mimeType must be application/pdf`);
        }

        if (!isNonEmptyString(pdf?.base64)) {
          errors.push(`${fileLabel}: base64 is required`);
          return;
        }

        const sizeBytes = getBase64SizeBytes(pdf.base64);
        if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
          errors.push(`${fileLabel}: base64 content is not a valid PDF payload`);
          return;
        }

        if (sizeBytes > MAX_ATTACHMENT_PDF_SIZE_BYTES) {
          errors.push(
            `${fileLabel}: PDF exceeds max size of ${MAX_ATTACHMENT_PDF_SIZE_BYTES} bytes`,
          );
        }
      });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  next();
}
