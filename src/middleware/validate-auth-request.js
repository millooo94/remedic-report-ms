function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

export function validateLoginRequest(req, res, next) {
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = normalizeText(req.body?.password);

  if (!email || !password) {
    return res.status(400).json({
      error: "Email e password sono obbligatorie.",
    });
  }

  next();
}

export function validateForgotPasswordRequest(req, res, next) {
  const email = normalizeText(req.body?.email).toLowerCase();

  if (!email) {
    return res.status(400).json({
      error: "Email obbligatoria.",
    });
  }

  next();
}

export function validateResetPasswordRequest(req, res, next) {
  const token = normalizeText(req.body?.token);
  const newPassword = normalizeText(req.body?.newPassword);

  if (!token || !newPassword) {
    return res.status(400).json({
      error: "Token e nuova password sono obbligatori.",
    });
  }

  next();
}
