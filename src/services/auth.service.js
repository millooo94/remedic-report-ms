import crypto from "node:crypto";
import { env } from "../config/env.js";
import { getDb } from "../db/sqlite.js";
import {
  changeUserPassword,
  getUserByEmail,
  getUserById,
  markUserLogin,
  verifyUserCredentials,
} from "./users.service.js";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  validatePasswordStrength,
} from "./password.service.js";

const SESSION_TTL_MS = Number(env.sessionTtlHours || 8) * 60 * 60 * 1000;
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
    email: user.email,
    displayName: user.display_name,
    specializzazione: user.specializzazione,
    active: user.active,
    mustChangePassword: user.must_change_password,
    assignedTypes: user.assignedTypes || [],
  };
}

export function loginWithPassword({ email, password, ipAddress, userAgent }) {
  const user = verifyUserCredentials(email, password);

  if (!user) {
    throw createHttpError(401, "Credenziali non valide.");
  }

  const sessionId = crypto.randomUUID();
  const sessionSecret = generateOpaqueToken(32);
  const csrfToken = generateOpaqueToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

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

  markUserLogin(user.id);

  return {
    user: buildAuthUserResponse(user),
    sessionId,
    sessionCookieValue: `${sessionId}.${sessionSecret}`,
    csrfToken,
    expiresAt,
  };
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

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    throw createHttpError(400, "Token di reset non valido o scaduto.");
  }

  changeUserPassword(row.user_id, newPassword, { mustChangePassword: false });

  getDb()
    .prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?")
    .run(new Date().toISOString(), row.id);

  revokeAllUserSessions(row.user_id);
  return getUserById(row.user_id);
}

function revokeAllUserSessions(userId) {
  getDb()
    .prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), userId);
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

  if (new Date(row.expires_at).getTime() <= Date.now()) {
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
