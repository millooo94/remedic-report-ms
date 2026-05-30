import crypto from "node:crypto";
import { getDb } from "../db/sqlite.js";

export function createDraftEmailDelivery({
  draftId,
  sentByUserId,
  recipientEmail,
  subject,
  status,
  errorMessage = null,
}) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO draft_email_deliveries (
        id,
        draft_id,
        sent_by_user_id,
        recipient_email_masked,
        recipient_email_hash,
        subject,
        status,
        error_message,
        created_at
      ) VALUES (
        @id,
        @draft_id,
        @sent_by_user_id,
        @recipient_email_masked,
        @recipient_email_hash,
        @subject,
        @status,
        @error_message,
        @created_at
      )
    `,
  ).run({
    id: crypto.randomUUID(),
    draft_id: draftId,
    sent_by_user_id: sentByUserId,
    recipient_email_masked: maskEmail(recipientEmail),
    recipient_email_hash: hashEmail(recipientEmail),
    subject,
    status,
    error_message: errorMessage,
    created_at: now,
  });
}

export function listDraftEmailDeliveries(draftId, limit = 10) {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT
          id,
          draft_id,
          sent_by_user_id,
          recipient_email_masked,
          recipient_email_hash,
          subject,
          status,
          error_message,
          created_at
        FROM draft_email_deliveries
        WHERE draft_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
    .all(draftId, limit);

  return rows.map((row) => ({
    id: row.id,
    draft_id: row.draft_id,
    sent_by_user_id: row.sent_by_user_id,
    recipient_email_masked: row.recipient_email_masked,
    recipient_email_hash: row.recipient_email_hash,
    subject: row.subject,
    status: row.status,
    error_message: row.error_message,
    created_at: row.created_at,
  }));
}

function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(String(email || "").trim().toLowerCase())
    .digest("hex");
}

function maskEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const [local, domain] = normalized.split("@");

  if (!local || !domain) {
    return "***";
  }

  const safeLocal =
    local.length <= 2
      ? `${local[0] || "*"}*`
      : `${local.slice(0, 2)}***${local.slice(-1)}`;

  return `${safeLocal}@${domain}`;
}
