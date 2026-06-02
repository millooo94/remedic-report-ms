import { env } from "../config/env.js";
import {
  buildAuthUserResponse,
  changeAuthenticatedPassword,
  createPasswordResetRequest,
  getTwoFactorSetupForLogin,
  loginWithPassword,
  regenerateAuthenticatedRecoveryCodes,
  resetPasswordWithToken,
  revokeSession,
  verifyTwoFactorLoginChallenge,
  verifyTwoFactorLoginRecoveryCode,
  verifyTwoFactorSetupForLogin,
} from "../services/auth.service.js";
import { saveUserAvatar, updateOwnProfile } from "../services/users.service.js";
import { AUDIT_ACTIONS, createAuditLog } from "../services/audit.service.js";
import {
  sendPasswordChangedSecurityEmail,
  sendPasswordResetEmail,
  sendRecoveryCodeUsedEmail,
  sendTwoFactorEnabledEmail,
} from "../services/email.service.js";

function handleAuthError(res, error, fallbackMessage = "Errore interno di autenticazione.") {
  const status = Number(error?.status || 500);
  const message =
    status >= 500 ? fallbackMessage : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Auth error:", error?.message || error);
  }

  return res.status(status).json({
    error: message,
    message,
    ...(error?.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
  });
}

export function loginController(req, res) {
  try {
    const result = loginWithPassword({
      email: req.body?.email,
      password: req.body?.password,
    });
    return res.json({
      user: result.user,
      nextStep: result.nextStep,
      challengeToken: result.challengeToken,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    createAuditLog({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      role: null,
      entityType: "user",
      entityId: null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        email: String(req.body?.email || "").trim().toLowerCase() || null,
      },
    });
    return handleAuthError(res, error, "Errore interno durante il login.");
  }
}

export async function twoFactorSetupController(req, res) {
  try {
    const payload = await getTwoFactorSetupForLogin(req.body?.challengeToken);
    createAuditLog({
      action: AUDIT_ACTIONS.TWO_FACTOR_SETUP_STARTED,
      role: null,
      entityType: "session",
      entityId: null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.json(payload);
  } catch (error) {
    return handleAuthError(res, error, "Errore interno durante la configurazione 2FA.");
  }
}

export function twoFactorVerifySetupController(req, res) {
  try {
    const result = verifyTwoFactorSetupForLogin({
      challengeToken: req.body?.challengeToken,
      code: req.body?.code,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    setSessionCookies(res, result.sessionCookieValue, result.csrfToken, result.expiresAt);
    createAuditLog({
      userId: result.user.id,
      role: result.user.role,
      action: AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
      entityType: "user",
      entityId: result.user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    void sendTwoFactorEnabledEmail({
      email: result.user.email,
      displayName: result.user.displayName,
    }).catch((error) => {
      console.error("2FA enabled email error:", error?.message || error);
    });
    return res.json({
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
      recoveryCodes: result.recoveryCodes,
    });
  } catch (error) {
    createAuditLog({
      action: AUDIT_ACTIONS.TWO_FACTOR_CHALLENGE_FAILED,
      role: null,
      entityType: "session",
      entityId: null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return handleAuthError(res, error, "Errore interno durante l'attivazione 2FA.");
  }
}

export function twoFactorChallengeController(req, res) {
  try {
    const result = verifyTwoFactorLoginChallenge({
      challengeToken: req.body?.challengeToken,
      code: req.body?.code,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    setSessionCookies(res, result.sessionCookieValue, result.csrfToken, result.expiresAt);
    createAuditLog({
      userId: result.user.id,
      role: result.user.role,
      action: AUDIT_ACTIONS.TWO_FACTOR_CHALLENGE_SUCCESS,
      entityType: "user",
      entityId: result.user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    createAuditLog({
      userId: result.user.id,
      role: result.user.role,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entityType: "user",
      entityId: result.user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.json({
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    createAuditLog({
      action: AUDIT_ACTIONS.TWO_FACTOR_CHALLENGE_FAILED,
      role: null,
      entityType: "session",
      entityId: null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return handleAuthError(res, error, "Errore interno durante la verifica 2FA.");
  }
}

export function twoFactorRecoveryCodeController(req, res) {
  try {
    const result = verifyTwoFactorLoginRecoveryCode({
      challengeToken: req.body?.challengeToken,
      recoveryCode: req.body?.recoveryCode,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    setSessionCookies(res, result.sessionCookieValue, result.csrfToken, result.expiresAt);
    createAuditLog({
      userId: result.user.id,
      role: result.user.role,
      action: AUDIT_ACTIONS.TWO_FACTOR_RECOVERY_CODE_USED,
      entityType: "user",
      entityId: result.user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    void sendRecoveryCodeUsedEmail({
      email: result.user.email,
      displayName: result.user.displayName,
    }).catch((error) => {
      console.error("Recovery code email error:", error?.message || error);
    });
    createAuditLog({
      userId: result.user.id,
      role: result.user.role,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entityType: "user",
      entityId: result.user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.json({
      user: result.user,
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return handleAuthError(res, error, "Errore interno durante l'uso del codice di recupero.");
  }
}

export function regenerateRecoveryCodesController(req, res) {
  try {
    const recoveryCodes = regenerateAuthenticatedRecoveryCodes(req.authUser?.id);
    createAuditLog({
      userId: req.authUser?.id || null,
      role: req.authUser?.role || null,
      action: AUDIT_ACTIONS.TWO_FACTOR_RECOVERY_CODES_REGENERATED,
      entityType: "user",
      entityId: req.authUser?.id || null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.json({ recoveryCodes });
  } catch (error) {
    return handleAuthError(res, error, "Errore interno durante la rigenerazione dei codici.");
  }
}

export function logoutController(req, res) {
  try {
    const sessionCookieValue = req.authCookies?.[env.authSessionCookieName] || "";
    revokeSession(sessionCookieValue);

    createAuditLog({
      userId: req.authUser?.id || null,
      role: req.authUser?.role || null,
      action: AUDIT_ACTIONS.LOGOUT,
      entityType: "session",
      entityId: req.authSession?.id || null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    clearSessionCookies(res);
    return res.status(204).send();
  } catch (error) {
    return handleAuthError(res, error, "Errore interno durante il logout.");
  }
}

export function meController(req, res) {
  return res.json({
    user: buildAuthUserResponse(req.authUser),
  });
}

export function csrfController(req, res) {
  const csrfToken = req.authCookies?.[env.authCsrfCookieName] || "";
  return res.json({ csrfToken });
}

export async function forgotPasswordController(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const result = createPasswordResetRequest(email);

    if (result?.user?.email) {
      const resetUrl = `${env.appPublicUrl}?resetToken=${encodeURIComponent(result.token)}`;
      await sendPasswordResetEmail({
        email: result.user.email,
        displayName: result.user.displayName,
        resetUrl,
      });
    }

    createAuditLog({
      userId: result?.user?.id || null,
      role: result?.user?.role || null,
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      entityType: "user",
      entityId: result?.user?.id || null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      message:
        "Se l'email e associata a un account attivo, riceverai le istruzioni per reimpostare la password.",
    });
  } catch (error) {
    return handleAuthError(
      res,
      error,
      "Errore interno durante la richiesta di reimpostazione password.",
    );
  }
}

export function resetPasswordController(req, res) {
  try {
    const user = resetPasswordWithToken(req.body?.token, req.body?.newPassword);

    createAuditLog({
      userId: user.id,
      role: user.role,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    void sendPasswordChangedSecurityEmail({
      email: user.email,
      displayName: user.display_name || user.displayName,
    }).catch((error) => {
      console.error("Reset password security email error:", error?.message || error);
    });

    clearSessionCookies(res);
    return res.json({
      message: "Password aggiornata correttamente. Effettua di nuovo l'accesso.",
    });
  } catch (error) {
    return handleAuthError(
      res,
      error,
      "Errore interno durante la reimpostazione della password.",
    );
  }
}

export function changePasswordController(req, res) {
  try {
    const user = changeAuthenticatedPassword({
      userId: req.authUser?.id,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
      currentSessionId: req.authSession?.id || null,
    });

    createAuditLog({
      userId: user.id,
      role: user.role,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED_AUTHENTICATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    void sendPasswordChangedSecurityEmail({
      email: user.email,
      displayName: user.display_name || user.displayName,
    }).catch((error) => {
      console.error("Change password security email error:", error?.message || error);
    });

    return res.json({
      message:
        "Password aggiornata correttamente. Le altre sessioni attive sono state revocate.",
    });
  } catch (error) {
    return handleAuthError(
      res,
      error,
      "Errore interno durante l'aggiornamento della password.",
    );
  }
}

export function updateProfileController(req, res) {
  try {
    const user = updateOwnProfile(req.authUser?.id, req.body);

    createAuditLog({
      userId: user.id,
      role: user.role,
      action: AUDIT_ACTIONS.PROFILE_UPDATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      user: buildAuthUserResponse(user),
      message: "Profilo aggiornato correttamente.",
    });
  } catch (error) {
    return handleAuthError(
      res,
      error,
      "Errore interno durante l'aggiornamento del profilo.",
    );
  }
}

export function uploadProfileAvatarController(req, res) {
  try {
    const user = saveUserAvatar(req.authUser?.id, req.body);

    createAuditLog({
      userId: user.id,
      role: user.role,
      action: AUDIT_ACTIONS.PROFILE_AVATAR_UPDATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.status(201).json({
      user: buildAuthUserResponse(user),
      message: "Immagine profilo aggiornata correttamente.",
    });
  } catch (error) {
    return handleAuthError(
      res,
      error,
      "Errore interno durante l'aggiornamento dell'immagine profilo.",
    );
  }
}

function setSessionCookies(res, sessionValue, csrfToken, expiresAt) {
  const secure = env.authCookieSecure;
  const sameSite = env.authCookieSameSite;
  const expires = new Date(expiresAt);

  res.cookie(env.authSessionCookieName, sessionValue, {
    httpOnly: true,
    secure,
    sameSite,
    expires,
    path: "/",
  });

  res.cookie(env.authCsrfCookieName, csrfToken, {
    httpOnly: false,
    secure,
    sameSite,
    expires,
    path: "/",
  });
}

function clearSessionCookies(res) {
  const secure = env.authCookieSecure;
  const sameSite = env.authCookieSameSite;

  res.clearCookie(env.authSessionCookieName, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
  });
  res.clearCookie(env.authCsrfCookieName, {
    httpOnly: false,
    secure,
    sameSite,
    path: "/",
  });
}
