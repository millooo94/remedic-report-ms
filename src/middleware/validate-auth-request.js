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

export function validateChangePasswordRequest(req, res, next) {
  const currentPassword = normalizeText(req.body?.currentPassword);
  const newPassword = normalizeText(req.body?.newPassword);

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: "Password attuale e nuova password sono obbligatorie.",
    });
  }

  next();
}

export function validateProfileUpdateRequest(req, res, next) {
  const email = normalizeText(req.body?.email).toLowerCase();
  const displayName = normalizeText(req.body?.display_name || req.body?.displayName);

  if (!email || !displayName) {
    return res.status(400).json({
      error: "Email e nome visualizzato sono obbligatori.",
      fieldErrors: {
        ...(email ? {} : { email: "L'email e obbligatoria." }),
        ...(displayName ? {} : { display_name: "Il nome visualizzato e obbligatorio." }),
      },
    });
  }

  next();
}

export function validateProfileAvatarRequest(req, res, next) {
  const fileName = normalizeText(req.body?.fileName);
  const mimeType = normalizeText(req.body?.mimeType);
  const base64 = normalizeText(req.body?.base64);

  if (!fileName || !mimeType || !base64) {
    return res.status(400).json({
      error: "fileName, mimeType e base64 sono obbligatori per l'avatar.",
      fieldErrors: {
        avatar: "Seleziona un'immagine profilo valida.",
      },
    });
  }

  next();
}
