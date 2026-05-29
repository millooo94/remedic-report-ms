import crypto from "node:crypto";
import { getDb } from "../db/sqlite.js";

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PROFESSIONAL_CREATED: "PROFESSIONAL_CREATED",
  PROFESSIONAL_UPDATED: "PROFESSIONAL_UPDATED",
  REFERTATORE_CREATED: "REFERTATORE_CREATED",
  REFERTATORE_UPDATED: "REFERTATORE_UPDATED",
  DRAFT_SENT_TO_REFERTATORE: "DRAFT_SENT_TO_REFERTATORE",
  DRAFT_REASSIGNED: "DRAFT_REASSIGNED",
  PDF_PREVIEW_EXPORTED: "PDF_PREVIEW_EXPORTED",
  SIGNED_PDF_UPLOADED: "SIGNED_PDF_UPLOADED",
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
  const limit = sanitizePaginationValue(filters.limit, 50, 1, 200);
  const offset = sanitizePaginationValue(filters.offset, 0, 0, 1000000);

  const rows = db
    .prepare(
      `
        SELECT *
        FROM audit_logs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT @limit
        OFFSET @offset
      `,
    )
    .all({
      ...params,
      limit,
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
    limit,
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
