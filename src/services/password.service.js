import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const normalized = String(password || "");
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(normalized, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

export function verifyPassword(password, passwordHash) {
  const normalized = String(password || "");
  const [scheme, salt, expectedHash] = String(passwordHash || "").split("$");

  if (scheme !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto
    .scryptSync(normalized, salt, SCRYPT_KEYLEN)
    .toString("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function validatePasswordStrength(password) {
  const value = String(password || "");

  if (value.length < 10) {
    return "La password deve contenere almeno 10 caratteri.";
  }

  if (!/[A-Z]/.test(value)) {
    return "La password deve contenere almeno una lettera maiuscola.";
  }

  if (!/[a-z]/.test(value)) {
    return "La password deve contenere almeno una lettera minuscola.";
  }

  if (!/[0-9]/.test(value)) {
    return "La password deve contenere almeno un numero.";
  }

  if (!/[^A-Za-z0-9]/.test(value)) {
    return "La password deve contenere almeno un simbolo.";
  }

  return null;
}

export function hashOpaqueToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function generateOpaqueToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("base64url");
}
