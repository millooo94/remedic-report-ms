import crypto from "node:crypto";
import { getDb } from "../db/sqlite.js";

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_CHANGED_AUTHENTICATED: "PASSWORD_CHANGED_AUTHENTICATED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  PROFILE_AVATAR_UPDATED: "PROFILE_AVATAR_UPDATED",
  PROFESSIONAL_CREATED: "PROFESSIONAL_CREATED",
  PROFESSIONAL_UPDATED: "PROFESSIONAL_UPDATED",
  PROFESSIONAL_DISABLED: "PROFESSIONAL_DISABLED",
  REFERTATORE_CREATED: "REFERTATORE_CREATED",
  REFERTATORE_UPDATED: "REFERTATORE_UPDATED",
  REFERTATORE_DISABLED: "REFERTATORE_DISABLED",
  DRAFT_SENT_TO_REFERTATORE: "DRAFT_SENT_TO_REFERTATORE",
  REFERTATORE_NOTIFICATION_SENT: "REFERTATORE_NOTIFICATION_SENT",
  DRAFT_REASSIGNED: "DRAFT_REASSIGNED",
  REFERTATORE_DRAFT_COMPLETED: "REFERTATORE_DRAFT_COMPLETED",
  PDF_PREVIEW_EXPORTED: "PDF_PREVIEW_EXPORTED",
  SIGNED_PDF_UPLOADED: "SIGNED_PDF_UPLOADED",
  SIGNED_PDF_NOTIFICATION_SENT: "SIGNED_PDF_NOTIFICATION_SENT",
  EMAIL_SEND_FAILED: "EMAIL_SEND_FAILED",
  SIGNED_REPORT_SENT_TO_PATIENT: "SIGNED_REPORT_SENT_TO_PATIENT",
  DRAFT_COMPLETED: "DRAFT_COMPLETED",
  DRAFT_DELETED: "DRAFT_DELETED",
};

export function createAuditLog({
  userId = null,
  role = null,
  action,
  entityType = null,
  entityId = null,
  ipAddress = null,
  userAgent = null,
  metadata = null,
} = {}) {
  if (!action) {
    return;
  }

  const db = getDb();
  db.prepare(
    `
      INSERT INTO audit_logs (
        id,
        user_id,
        role,
        action,
        entity_type,
        entity_id,
        ip_address,
        user_agent,
        metadata_json,
        created_at
      ) VALUES (
        @id,
        @user_id,
        @role,
        @action,
        @entity_type,
        @entity_id,
        @ip_address,
        @user_agent,
        @metadata_json,
        @created_at
      )
    `,
  ).run({
    id: crypto.randomUUID(),
    user_id: userId,
    role,
    action,
    entity_type: entityType,
    entity_id: entityId,
    ip_address: ipAddress,
    user_agent: sanitizeUserAgent(userAgent),
    metadata_json: metadata ? JSON.stringify(metadata) : null,
    created_at: new Date().toISOString(),
  });
}

export function listAuditLogs(filters = {}) {
  const db = getDb();
  const clauses = [];
  const params = {};

  if (filters.action) {
    clauses.push("action = @action");
    params.action = filters.action;
  }

  if (filters.role) {
    clauses.push("role = @role");
    params.role = filters.role;
  }

  if (filters.entity_type) {
    clauses.push("entity_type = @entity_type");
    params.entity_type = filters.entity_type;
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const pageSize = sanitizePaginationValue(
    filters.pageSize ?? filters.limit,
    20,
    1,
    200,
  );
  const page = sanitizePaginationValue(filters.page, 1, 1, 1000000);
  const offset = sanitizePaginationValue(
    filters.offset,
    (page - 1) * pageSize,
    0,
    1000000,
  );
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`)
    .get(params);

  const rows = db
    .prepare(
      `
        SELECT *
        FROM audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT @pageSize
        OFFSET @offset
      `,
    )
    .all({
      ...params,
      pageSize,
      offset,
    });

  return {
    items: rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      role: row.role,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      metadata: safeParseJson(row.metadata_json),
        created_at: row.created_at,
    })),
    total: Number(totalRow?.total || 0),
    page,
    pageSize,
    limit: pageSize,
    offset,
  };
}

function sanitizeUserAgent(userAgent) {
  const value = String(userAgent || "").trim();
  return value ? value.slice(0, 500) : null;
}

function safeParseJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizePaginationValue(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
