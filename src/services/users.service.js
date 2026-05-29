import crypto from "node:crypto";
import { getDb } from "../db/sqlite.js";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "./password.service.js";

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function listUsers({ role = "", active = "", q = "" } = {}) {
  const db = getDb();
  const clauses = [];
  const params = {};

  if (role) {
    clauses.push("u.role = @role");
    params.role = role;
  }

  if (active !== "" && active !== undefined) {
    clauses.push("u.active = @active");
    params.active = active === true || active === "1" || active === 1 ? 1 : 0;
  }

  if (q?.trim()) {
    clauses.push(
      "(LOWER(u.display_name) LIKE @query OR LOWER(u.email) LIKE @query)",
    );
    params.query = `%${q.trim().toLowerCase()}%`;
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `
        SELECT
          u.*,
          GROUP_CONCAT(CASE WHEN a.active = 1 THEN a.tipo_referto END) AS assigned_types
        FROM users u
        LEFT JOIN refertatore_assignments a
          ON a.user_id = u.id
        ${whereClause}
        GROUP BY u.id
        ORDER BY u.role ASC, u.display_name ASC
      `,
    )
    .all(params);

  return rows.map(mapUserRow);
}

export function getUserById(id) {
  const db = getDb();
  const row = db
    .prepare(
      `
        SELECT
          u.*,
          GROUP_CONCAT(CASE WHEN a.active = 1 THEN a.tipo_referto END) AS assigned_types
        FROM users u
        LEFT JOIN refertatore_assignments a
          ON a.user_id = u.id
        WHERE u.id = ?
        GROUP BY u.id
      `,
    )
    .get(id);

  if (!row) {
    throw createHttpError(404, "Utente non trovato.");
  }

  return mapUserRow(row);
}

export function getUserByEmail(email) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").trim().toLowerCase());
  return row || null;
}

export function createUser(payload) {
  const normalized = normalizeUserPayload(payload, true);
  const db = getDb();
  const now = new Date().toISOString();

  if (getUserByEmail(normalized.email)) {
    throw createHttpError(409, "Esiste gia un utente con questa email.");
  }

  db.prepare(
    `
      INSERT INTO users (
        id,
        role,
        email,
        password_hash,
        display_name,
        specializzazione,
        active,
        must_change_password,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (
        @id,
        @role,
        @email,
        @password_hash,
        @display_name,
        @specializzazione,
        @active,
        @must_change_password,
        @created_at,
        @updated_at,
        NULL
      )
    `,
  ).run({
    id: normalized.id,
    role: normalized.role,
    email: normalized.email,
    password_hash: normalized.password_hash,
    display_name: normalized.display_name,
    specializzazione: normalized.specializzazione,
    active: normalized.active,
    must_change_password: normalized.must_change_password,
    created_at: now,
    updated_at: now,
  });

  saveAssignments(normalized.id, normalized.assignedTypes, now);
  return getUserById(normalized.id);
}

export function updateUser(id, payload) {
  const current = getUserById(id);
  const normalized = normalizeUserPayload(
    {
      ...current,
      ...payload,
      email: payload.email ?? current.email,
      display_name: payload.display_name ?? current.display_name,
      specializzazione: payload.specializzazione ?? current.specializzazione,
      role: payload.role ?? current.role,
      active: payload.active ?? current.active,
      must_change_password:
        payload.must_change_password ?? current.must_change_password,
      assignedTypes: payload.assignedTypes ?? current.assignedTypes,
    },
    false,
  );
  const db = getDb();
  const now = new Date().toISOString();

  const conflict = db
    .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
    .get(normalized.email, id);
  if (conflict) {
    throw createHttpError(409, "Esiste gia un utente con questa email.");
  }

  db.prepare(
    `
      UPDATE users
      SET
        role = @role,
        email = @email,
        password_hash = COALESCE(@password_hash, password_hash),
        display_name = @display_name,
        specializzazione = @specializzazione,
        active = @active,
        must_change_password = @must_change_password,
        updated_at = @updated_at
      WHERE id = @id
    `,
  ).run({
    id,
    role: normalized.role,
    email: normalized.email,
    password_hash: normalized.password_hash || null,
    display_name: normalized.display_name,
    specializzazione: normalized.specializzazione,
    active: normalized.active,
    must_change_password: normalized.must_change_password,
    updated_at: now,
  });

  saveAssignments(id, normalized.assignedTypes, now);
  return getUserById(id);
}

export function updateUserStatus(id, active) {
  getUserById(id);
  const db = getDb();
  db.prepare(
    "UPDATE users SET active = ?, updated_at = ? WHERE id = ?",
  ).run(active ? 1 : 0, new Date().toISOString(), id);
  return getUserById(id);
}

export function markUserLogin(id) {
  const db = getDb();
  db.prepare(
    "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?",
  ).run(new Date().toISOString(), new Date().toISOString(), id);
}

export function changeUserPassword(id, newPassword, { mustChangePassword = false } = {}) {
  const validationError = validatePasswordStrength(newPassword);
  if (validationError) {
    throw createHttpError(400, validationError);
  }

  const db = getDb();
  db.prepare(
    `
      UPDATE users
      SET
        password_hash = ?,
        must_change_password = ?,
        updated_at = ?
      WHERE id = ?
    `,
  ).run(
    hashPassword(newPassword),
    mustChangePassword ? 1 : 0,
    new Date().toISOString(),
    id,
  );

  return getUserById(id);
}

export function verifyUserCredentials(email, password) {
  const user = getUserByEmail(email);

  if (!user || !user.active) {
    return null;
  }

  if (!verifyPassword(password, user.password_hash)) {
    return null;
  }

  return getUserById(user.id);
}

export function listRefertatoriByType(tipoReferto) {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT
          u.id,
          u.email,
          u.display_name,
          u.specializzazione,
          GROUP_CONCAT(CASE WHEN a.active = 1 THEN a.tipo_referto END) AS assigned_types
        FROM users u
        INNER JOIN refertatore_assignments a
          ON a.user_id = u.id
        WHERE u.role = 'refertatore'
          AND u.active = 1
          AND a.active = 1
          AND a.tipo_referto = ?
        GROUP BY u.id
        ORDER BY u.display_name ASC
      `,
    )
    .all(tipoReferto);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    specializzazione: row.specializzazione,
    assignedTypes: parseAssignedTypes(row.assigned_types),
  }));
}

function normalizeUserPayload(payload, requirePassword) {
  const role = String(payload?.role || "").trim();
  const email = String(payload?.email || "").trim().toLowerCase();
  const displayName = String(payload?.display_name || payload?.displayName || "").trim();
  const specializzazione = normalizeNullableString(payload?.specializzazione);
  const password = payload?.password == null ? "" : String(payload.password);
  const assignedTypes = normalizeAssignedTypes(payload?.assignedTypes);

  if (role !== "admin" && role !== "refertatore") {
    throw createHttpError(400, "role non valido.");
  }

  if (!email) {
    throw createHttpError(400, "email obbligatoria.");
  }

  if (!displayName) {
    throw createHttpError(400, "display_name obbligatorio.");
  }

  if (role === "refertatore" && assignedTypes.length === 0) {
    throw createHttpError(400, "Assegna almeno una tipologia EMG o PSG al refertatore.");
  }

  let passwordHash = null;
  if (requirePassword || password) {
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      throw createHttpError(400, passwordError);
    }
    passwordHash = hashPassword(password);
  }

  return {
    id: payload?.id || crypto.randomUUID(),
    role,
    email,
    password_hash: passwordHash,
    display_name: displayName,
    specializzazione,
    active: payload?.active === false || payload?.active === 0 || payload?.active === "0" ? 0 : 1,
    must_change_password:
      payload?.must_change_password === true ||
      payload?.must_change_password === 1 ||
      payload?.must_change_password === "1"
        ? 1
        : 0,
    assignedTypes,
  };
}

function saveAssignments(userId, assignedTypes, now) {
  const db = getDb();
  db.prepare("DELETE FROM refertatore_assignments WHERE user_id = ?").run(userId);

  if (!assignedTypes.length) {
    return;
  }

  const insert = db.prepare(
    `
      INSERT INTO refertatore_assignments (
        id,
        user_id,
        tipo_referto,
        active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 1, ?, ?)
    `,
  );

  assignedTypes.forEach((tipoReferto) => {
    insert.run(crypto.randomUUID(), userId, tipoReferto, now, now);
  });
}

function mapUserRow(row) {
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    display_name: row.display_name,
    specializzazione: row.specializzazione,
    active: !!row.active,
    must_change_password: !!row.must_change_password,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
    assignedTypes: parseAssignedTypes(row.assigned_types),
  };
}

function parseAssignedTypes(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAssignedTypes(value) {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map((item) => String(item || "").trim()).filter((item) => item === "emg" || item === "psg"))];
}

function normalizeNullableString(value) {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
}
