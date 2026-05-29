import crypto from "node:crypto";
import { getDb } from "../db/sqlite.js";
import { env } from "../config/env.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 8;

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function hashNeurologistPassword(password) {
  const normalizedPassword = String(password || "");

  if (!normalizedPassword.trim()) {
    throw createHttpError(400, "Password neurologo mancante.");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto
    .scryptSync(normalizedPassword, salt, 64)
    .toString("hex");

  return `scrypt:${salt}:${derivedKey}`;
}

export function verifyNeurologistPassword(password, passwordHash) {
  const [algorithm, salt, storedHash] = String(passwordHash || "").split(":");

  if (algorithm !== "scrypt" || !salt || !storedHash) {
    return false;
  }

  const candidate = crypto
    .scryptSync(String(password || ""), salt, 64)
    .toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(candidate, "hex"),
    Buffer.from(storedHash, "hex"),
  );
}

export function loginNeurologistUser(email, password) {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);
  const user = db
    .prepare(
      `
        SELECT
          id,
          email,
          password_hash,
          display_name,
          specializzazione,
          active
        FROM neurologist_users
        WHERE email = ?
      `,
    )
    .get(normalizedEmail);

  if (!user || !user.active || !verifyNeurologistPassword(password, user.password_hash)) {
    throw createHttpError(401, "Credenziali neurologo non valide.");
  }

  return {
    token: createNeurologistToken({
      sub: user.id,
      email: user.email,
      displayName: user.display_name,
      specializzazione: user.specializzazione,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      specializzazione: user.specializzazione,
    },
  };
}

export function verifyNeurologistToken(token) {
  const normalizedToken = String(token || "").trim();

  if (!normalizedToken) {
    throw createHttpError(401, "Token neurologo mancante.");
  }

  const [payloadPart, signaturePart] = normalizedToken.split(".");

  if (!payloadPart || !signaturePart) {
    throw createHttpError(401, "Token neurologo non valido.");
  }

  const expectedSignature = signTokenPayload(payloadPart);

  if (
    !safeCompareBase64url(signaturePart, expectedSignature)
  ) {
    throw createHttpError(401, "Token neurologo non valido.");
  }

  let payload;

  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    throw createHttpError(401, "Token neurologo non valido.");
  }

  if (!payload?.sub || !payload?.email || !payload?.exp) {
    throw createHttpError(401, "Token neurologo non valido.");
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw createHttpError(401, "Sessione neurologo scaduta.");
  }

  const db = getDb();
  const user = db
    .prepare(
      `
        SELECT
          id,
          email,
          display_name,
          specializzazione,
          active
        FROM neurologist_users
        WHERE id = ? AND email = ?
      `,
    )
    .get(payload.sub, normalizeEmail(payload.email));

  if (!user || !user.active) {
    throw createHttpError(401, "Utente neurologo non autorizzato.");
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    specializzazione: user.specializzazione,
  };
}

function createNeurologistToken(payload) {
  if (!env.neurologistAuthSecret?.trim()) {
    throw createHttpError(
      500,
      "NEUROLOGIST_AUTH_SECRET non configurato sul backend.",
    );
  }

  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signaturePart = signTokenPayload(payloadPart);
  return `${payloadPart}.${signaturePart}`;
}

function signTokenPayload(payloadPart) {
  return crypto
    .createHmac("sha256", env.neurologistAuthSecret)
    .update(payloadPart)
    .digest("base64url");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function safeCompareBase64url(left, right) {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(left, "base64url"),
      Buffer.from(right, "base64url"),
    );
  } catch {
    return false;
  }
}
