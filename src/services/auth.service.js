import crypto from "node:crypto";
import { env } from "../config/env.js";
import { getDb } from "../db/mysql.js";
import { parseMysqlDateTimeUtc } from "../utils/mysql-datetime.js";
import {
  changeUserPassword,
  getUserByEmail,
  getUserById,
  markUserLogin,
  verifyUserPasswordById,
  verifyUserCredentials,
} from "./users.service.js";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  validatePasswordStrength,
} from "./password.service.js";
import {
  beginTwoFactorLogin,
  beginTwoFactorSetup,
  completeTwoFactorSetup,
  getTwoFactorSetupPayload,
  regenerateTwoFactorRecoveryCodes,
  verifyTwoFactorChallenge,
  verifyTwoFactorRecoveryCode,
} from "./two-factor.service.js";

const RESET_TTL_MS = 30 * 60 * 1000;

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function buildAuthUserResponse(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    role: user.role,
    professionalId: user.professional_id || null,
    email: user.email,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    displayName: user.display_name,
    specializzazione: user.specializzazione,
    avatarDataUrl: user.avatar_data_url || null,
    active: user.active,
    mustChangePassword: user.must_change_password,
    twoFactorEnabled: !!user.two_factor_enabled,
    assignedTypes: user.assignedTypes || [],
  };
}

export function loginWithPassword({
  email,
  password,
}) {
  const user = verifyUserCredentials(email, password);

  if (!user) {
    throw createHttpError(401, "Credenziali non valide.");
  }

  if (user.two_factor_enabled) {
    const challenge = beginTwoFactorLogin(user.id);
    return {
      nextStep: "two_factor_challenge",
      challengeToken: challenge.challengeToken,
      expiresAt: challenge.expiresAt,
      user: buildAuthUserResponse(user),
    };
  }

  const setupChallenge = beginTwoFactorSetup(user.id);
  return {
    nextStep: "two_factor_setup",
    challengeToken: setupChallenge.challengeToken,
    expiresAt: setupChallenge.expiresAt,
    user: buildAuthUserResponse(user),
  };
}

export function getTwoFactorSetupForLogin(challengeToken) {
  return getTwoFactorSetupPayload(challengeToken);
}

export function verifyTwoFactorSetupForLogin({
  challengeToken,
  code,
  ipAddress,
  userAgent,
}) {
  const result = completeTwoFactorSetup(challengeToken, code);
  markUserLogin(result.user.id);
  const session = createSessionForUser({
    user: result.user,
    ipAddress,
    userAgent,
  });

  return {
    ...session,
    user: buildAuthUserResponse(result.user),
    recoveryCodes: result.recoveryCodes,
  };
}

export function verifyTwoFactorLoginChallenge({
  challengeToken,
  code,
  ipAddress,
  userAgent,
}) {
  const user = verifyTwoFactorChallenge(challengeToken, code);
  markUserLogin(user.id);
  const session = createSessionForUser({ user, ipAddress, userAgent });
  return {
    ...session,
    user: buildAuthUserResponse(user),
  };
}

export function verifyTwoFactorLoginRecoveryCode({
  challengeToken,
  recoveryCode,
  ipAddress,
  userAgent,
}) {
  const user = verifyTwoFactorRecoveryCode(challengeToken, recoveryCode);
  markUserLogin(user.id);
  const session = createSessionForUser({ user, ipAddress, userAgent });
  return {
    ...session,
    user: buildAuthUserResponse(user),
  };
}

export function regenerateAuthenticatedRecoveryCodes(userId) {
  return regenerateTwoFactorRecoveryCodes(userId);
}

export function getSessionUser(sessionCookieValue) {
  const session = parseAndVerifySessionCookie(sessionCookieValue);
  if (!session) {
    return null;
  }

  const user = getUserById(session.user_id);
  if (!user.active) {
    return null;
  }

  touchSession(session.id);
  return {
    user: buildAuthUserResponse(user),
    session,
  };
}

export function verifyCsrfForSession(sessionId, csrfToken) {
  const row = getDb()
    .prepare("SELECT csrf_token_hash FROM auth_sessions WHERE id = ?")
    .get(sessionId);

  if (!row?.csrf_token_hash) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(row.csrf_token_hash, "hex"),
    Buffer.from(hashOpaqueToken(csrfToken), "hex"),
  );
}

export function revokeSession(sessionCookieValue) {
  const parsed = parseSessionCookie(sessionCookieValue);
  if (!parsed) {
    return;
  }

  getDb()
    .prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?")
    .run(new Date().toISOString(), parsed.sessionId);
}

export function createPasswordResetRequest(email) {
  const user = getUserByEmail(email);
  if (!user || !user.active) {
    return null;
  }

  const rawToken = generateOpaqueToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS).toISOString();

  getDb()
    .prepare(
      `
        INSERT INTO password_reset_tokens (
          id,
          user_id,
          token_hash,
          expires_at,
          used_at,
          created_at
        ) VALUES (?, ?, ?, ?, NULL, ?)
      `,
    )
    .run(
      crypto.randomUUID(),
      user.id,
      hashOpaqueToken(rawToken),
      expiresAt,
      now.toISOString(),
    );

  return {
    user: buildAuthUserResponse(getUserById(user.id)),
    token: rawToken,
    expiresAt,
  };
}

export function resetPasswordWithToken(token, newPassword) {
  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    throw createHttpError(400, passwordError);
  }

  const tokenHash = hashOpaqueToken(token);
  const row = getDb()
    .prepare(
      `
        SELECT *
        FROM password_reset_tokens
        WHERE token_hash = ?
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .get(tokenHash);

  if (!row || parseMysqlDateTimeUtc(row.expires_at).getTime() < Date.now()) {
    throw createHttpError(400, "Token di reset non valido o scaduto.");
  }

  changeUserPassword(row.user_id, newPassword, { mustChangePassword: false });

  getDb()
    .prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?")
    .run(new Date().toISOString(), row.id);

  revokeAllUserSessions(row.user_id);
  return getUserById(row.user_id);
}

export function changeAuthenticatedPassword({
  userId,
  currentPassword,
  newPassword,
  currentSessionId = null,
}) {
  const normalizedCurrent = String(currentPassword || "");
  const normalizedNext = String(newPassword || "");

  if (!normalizedCurrent || !normalizedNext) {
    throw createHttpError(400, "Password attuale e nuova password sono obbligatorie.");
  }

  if (!verifyUserPasswordById(userId, normalizedCurrent)) {
    throw createHttpError(400, "La password attuale non e corretta.");
  }

  if (normalizedCurrent === normalizedNext) {
    throw createHttpError(400, "La nuova password deve essere diversa da quella attuale.");
  }

  const updatedUser = changeUserPassword(userId, normalizedNext, {
    mustChangePassword: false,
  });

  revokeOtherUserSessions(userId, currentSessionId);
  return updatedUser;
}

function createSessionForUser({ user, ipAddress, userAgent }) {
  const sessionId = crypto.randomUUID();
  const sessionSecret = generateOpaqueToken(32);
  const csrfToken = generateOpaqueToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + buildSessionTtlMs()).toISOString();

  getDb()
    .prepare(
      `
        INSERT INTO auth_sessions (
          id,
          user_id,
          session_hash,
          role,
          csrf_token_hash,
          ip_address,
          user_agent,
          expires_at,
          revoked_at,
          created_at,
          last_seen_at
        ) VALUES (
          @id,
          @user_id,
          @session_hash,
          @role,
          @csrf_token_hash,
          @ip_address,
          @user_agent,
          @expires_at,
          NULL,
          @created_at,
          @last_seen_at
        )
      `,
    )
    .run({
      id: sessionId,
      user_id: user.id,
      session_hash: hashOpaqueToken(sessionSecret),
      role: user.role,
      csrf_token_hash: hashOpaqueToken(csrfToken),
      ip_address: ipAddress || null,
      user_agent: sanitizeUserAgent(userAgent),
      expires_at: expiresAt,
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    });

  return {
    sessionId,
    sessionCookieValue: `${sessionId}.${sessionSecret}`,
    csrfToken,
    expiresAt,
  };
}

function buildSessionTtlMs() {
  return Number(env.sessionTtlHours || 8) * 60 * 60 * 1000;
}

function revokeAllUserSessions(userId) {
  getDb()
    .prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), userId);
}

function revokeOtherUserSessions(userId, currentSessionId) {
  if (!currentSessionId) {
    revokeAllUserSessions(userId);
    return;
  }

  getDb()
    .prepare(
      "UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?",
    )
    .run(new Date().toISOString(), userId, currentSessionId);
}

function parseAndVerifySessionCookie(sessionCookieValue) {
  const parsed = parseSessionCookie(sessionCookieValue);
  if (!parsed) {
    return null;
  }

  const row = getDb()
    .prepare("SELECT * FROM auth_sessions WHERE id = ?")
    .get(parsed.sessionId);

  if (!row || row.revoked_at) {
    return null;
  }

  if (parseMysqlDateTimeUtc(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const expectedHash = Buffer.from(row.session_hash, "hex");
  const actualHash = Buffer.from(hashOpaqueToken(parsed.sessionSecret), "hex");

  if (expectedHash.length !== actualHash.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedHash, actualHash)) {
    return null;
  }

  return row;
}

function parseSessionCookie(sessionCookieValue) {
  const rawValue = String(sessionCookieValue || "").trim();
  if (!rawValue.includes(".")) {
    return null;
  }

  const [sessionId, sessionSecret] = rawValue.split(".");
  if (!sessionId || !sessionSecret) {
    return null;
  }

  return { sessionId, sessionSecret };
}

function touchSession(sessionId) {
  getDb()
    .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?")
    .run(new Date().toISOString(), sessionId);
}

function sanitizeUserAgent(value) {
  const userAgent = String(value || "").trim();
  return userAgent ? userAgent.slice(0, 500) : null;
}
