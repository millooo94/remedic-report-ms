import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { env } from "../config/env.js";
import { getDb } from "../db/mysql.js";
import { generateOpaqueToken, hashOpaqueToken } from "./password.service.js";
import { getUserById } from "./users.service.js";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

function createHttpError(status, message, fieldErrors = null) {
  const error = new Error(message);
  error.status = status;
  if (fieldErrors && typeof fieldErrors === "object") {
    error.fieldErrors = fieldErrors;
  }
  return error;
}

authenticator.options = {
  window: 1,
};

export function beginTwoFactorLogin(userId) {
  return createChallenge({
    userId,
    purpose: "login_2fa",
    secretEncrypted: null,
  });
}

export function beginTwoFactorSetup(userId) {
  const secret = authenticator.generateSecret();
  return createChallenge({
    userId,
    purpose: "setup_2fa",
    secretEncrypted: encryptSecret(secret),
  });
}

export async function getTwoFactorSetupPayload(challengeToken) {
  const challenge = getValidChallenge(challengeToken, "setup_2fa");
  const user = getUserById(challenge.user_id);
  const secret = decryptSecret(challenge.secret_encrypted);
  const otpauth = authenticator.keyuri(
    user.email,
    env.totpIssuer,
    secret,
  );

  return {
    challengeToken,
    manualEntryKey: secret,
    otpauthUrl: otpauth,
    qrCodeDataUrl: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }),
  };
}

export function completeTwoFactorSetup(challengeToken, code) {
  const challenge = getValidChallenge(challengeToken, "setup_2fa");
  const user = getUserById(challenge.user_id);
  const secret = decryptSecret(challenge.secret_encrypted);

  if (!authenticator.check(normalizeOtp(code), secret)) {
    throw createHttpError(400, "Codice di autenticazione non valido.", {
      code: "Inserisci un codice a 6 cifre valido.",
    });
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
        UPDATE users
        SET
          two_factor_enabled = 1,
          two_factor_secret_encrypted = ?,
          two_factor_confirmed_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
    )
    .run(challenge.secret_encrypted, now, now, user.id);

  consumeChallenge(challenge.id);
  const recoveryCodes = replaceRecoveryCodes(user.id);

  return {
    user: getUserById(user.id),
    recoveryCodes,
  };
}

export function verifyTwoFactorChallenge(challengeToken, code) {
  const challenge = getValidChallenge(challengeToken, "login_2fa");
  const user = getUserById(challenge.user_id);
  const secret = decryptSecret(user.two_factor_secret_encrypted);

  if (!authenticator.check(normalizeOtp(code), secret)) {
    throw createHttpError(400, "Codice di autenticazione non valido.", {
      code: "Inserisci un codice a 6 cifre valido.",
    });
  }

  consumeChallenge(challenge.id);
  return getUserById(user.id);
}

export function verifyTwoFactorRecoveryCode(challengeToken, recoveryCode) {
  const challenge = getValidChallenge(challengeToken, "login_2fa");
  const user = getUserById(challenge.user_id);
  const normalizedCode = normalizeRecoveryCode(recoveryCode);
  const hash = hashOpaqueToken(normalizedCode);

  const row = getDb()
    .prepare(
      `
        SELECT id
        FROM user_recovery_codes
        WHERE user_id = ?
          AND code_hash = ?
          AND used_at IS NULL
        LIMIT 1
      `,
    )
    .get(user.id, hash);

  if (!row) {
    throw createHttpError(400, "Codice di recupero non valido.", {
      recoveryCode: "Il codice di recupero non e valido o e gia stato usato.",
    });
  }

  getDb()
    .prepare("UPDATE user_recovery_codes SET used_at = ? WHERE id = ?")
    .run(new Date().toISOString(), row.id);

  consumeChallenge(challenge.id);
  return getUserById(user.id);
}

export function regenerateTwoFactorRecoveryCodes(userId) {
  const user = getUserById(userId);
  if (!user.two_factor_enabled) {
    throw createHttpError(409, "Configura prima l'autenticazione a due fattori.");
  }

  return replaceRecoveryCodes(user.id);
}

export function assertTwoFactorMandatoryForDisable(userId) {
  const user = getUserById(userId);
  if (user.two_factor_enabled) {
    throw createHttpError(
      403,
      "L'autenticazione a due fattori e obbligatoria per l'Area Riservata.",
    );
  }
}

function createChallenge({ userId, purpose, secretEncrypted = null }) {
  const challengeId = crypto.randomUUID();
  const rawToken = generateOpaqueToken(32);
  const tokenHash = hashOpaqueToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();

  getDb()
    .prepare(
      `
        INSERT INTO auth_challenges (
          id,
          user_id,
          token_hash,
          purpose,
          secret_encrypted,
          expires_at,
          consumed_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
      `,
    )
    .run(
      challengeId,
      userId,
      tokenHash,
      purpose,
      secretEncrypted,
      expiresAt,
      now.toISOString(),
    );

  return {
    challengeToken: rawToken,
    expiresAt,
  };
}

function getValidChallenge(challengeToken, purpose) {
  const tokenHash = hashOpaqueToken(challengeToken);
  const row = getDb()
    .prepare(
      `
        SELECT *
        FROM auth_challenges
        WHERE token_hash = ?
          AND purpose = ?
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .get(tokenHash, purpose);

  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    throw createHttpError(400, "Verifica a due fattori non valida o scaduta.");
  }

  return row;
}

function consumeChallenge(challengeId) {
  getDb()
    .prepare("UPDATE auth_challenges SET consumed_at = ? WHERE id = ?")
    .run(new Date().toISOString(), challengeId);
}

function replaceRecoveryCodes(userId) {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    generateReadableRecoveryCode(),
  );
  const now = new Date().toISOString();

  getDb()
    .prepare("DELETE FROM user_recovery_codes WHERE user_id = ?")
    .run(userId);

  const insert = getDb().prepare(
    `
      INSERT INTO user_recovery_codes (
        id,
        user_id,
        code_hash,
        used_at,
        created_at
      ) VALUES (?, ?, ?, NULL, ?)
    `,
  );

  codes.forEach((code) => {
    insert.run(crypto.randomUUID(), userId, hashOpaqueToken(code), now);
  });

  return codes;
}

function generateReadableRecoveryCode() {
  return crypto
    .randomBytes(6)
    .toString("hex")
    .toUpperCase()
    .match(/.{1,4}/g)
    .join("-");
}

function normalizeOtp(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^0-9]/g, "");
}

function normalizeRecoveryCode(value) {
  return String(value || "").trim().toUpperCase();
}

function encryptSecret(secret) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(secret || ""), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(payload) {
  if (!payload) {
    throw createHttpError(500, "Secret TOTP non disponibile.");
  }

  const [ivRaw, tagRaw, encryptedRaw] = String(payload).split(".");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function getEncryptionKey() {
  if (!env.appEncryptionKey) {
    throw createHttpError(
      500,
      "APP_ENCRYPTION_KEY non configurata per la sicurezza 2FA.",
    );
  }

  return crypto.createHash("sha256").update(env.appEncryptionKey).digest();
}
