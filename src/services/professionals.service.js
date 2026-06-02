import crypto from "node:crypto";
import { getDb } from "../db/sqlite.js";
import { normalizeProfessionalSpecialization } from "../constants/professional-taxonomy.js";

function createHttpError(status, message, fieldErrors = null) {
  const error = new Error(message);
  error.status = status;
  if (fieldErrors && typeof fieldErrors === "object") {
    error.fieldErrors = fieldErrors;
  }
  return error;
}

export function listProfessionals({
  activeOnly = true,
  visibleInStandardOnly = false,
  q = "",
} = {}) {
  const db = getDb();
  const clauses = [];
  const params = {};

  if (activeOnly) {
    clauses.push("active = 1");
  }

  if (visibleInStandardOnly) {
    clauses.push("visible_in_standard = 1");
  }

  if (String(q || "").trim()) {
    clauses.push(`
      (
        LOWER(COALESCE(first_name, '')) LIKE @query OR
        LOWER(COALESCE(last_name, '')) LIKE @query OR
        LOWER(display_name) LIKE @query OR
        LOWER(COALESCE(specializzazione, '')) LIKE @query OR
        LOWER(COALESCE(email, '')) LIKE @query
      )
    `);
    params.query = `%${String(q).trim().toLowerCase()}%`;
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `
        SELECT *
        FROM professionals
        ${whereClause}
        ORDER BY sort_order ASC, display_name ASC
      `,
    )
    .all(params);

  return rows.map(mapProfessional);
}

export function getProfessionalById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM professionals WHERE id = ?").get(id);

  if (!row) {
    throw createHttpError(404, "Professionista non trovato.");
  }

  return mapProfessional(row);
}

export function createProfessional(payload) {
  const normalized = normalizeProfessionalPayload(payload);
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT INTO professionals (
        id,
        first_name,
        last_name,
        display_name,
        email,
        specializzazione,
        role_label,
        visible_in_standard,
        is_refertatore,
        active,
        sort_order,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @first_name,
        @last_name,
        @display_name,
        @email,
        @specializzazione,
        @role_label,
        @visible_in_standard,
        @is_refertatore,
        @active,
        @sort_order,
        @created_at,
        @updated_at
      )
    `,
  ).run({
    ...normalized,
    created_at: now,
    updated_at: now,
  });

  return getProfessionalById(normalized.id);
}

export function updateProfessional(id, payload) {
  getProfessionalById(id);
  const normalized = normalizeProfessionalPayload({ ...payload, id });

  getDb()
    .prepare(
      `
        UPDATE professionals
        SET
          first_name = @first_name,
          last_name = @last_name,
          display_name = @display_name,
          email = @email,
          specializzazione = @specializzazione,
          role_label = @role_label,
          visible_in_standard = @visible_in_standard,
          is_refertatore = @is_refertatore,
          active = @active,
          sort_order = @sort_order,
          updated_at = @updated_at
        WHERE id = @id
      `,
    )
    .run({
      ...normalized,
      updated_at: new Date().toISOString(),
    });

  return getProfessionalById(id);
}

export function updateProfessionalStatus(id, active) {
  getProfessionalById(id);
  getDb()
    .prepare("UPDATE professionals SET active = ?, updated_at = ? WHERE id = ?")
    .run(active ? 1 : 0, new Date().toISOString(), id);
  return getProfessionalById(id);
}

export function deleteProfessional(id) {
  return updateProfessionalStatus(id, false);
}

function normalizeProfessionalPayload(payload) {
  const displayName = String(payload?.display_name || payload?.displayName || "").trim();
  const firstName = normalizeNullableString(payload?.first_name || payload?.firstName);
  const lastName = normalizeNullableString(payload?.last_name || payload?.lastName);
  const email = normalizeNullableString(payload?.email);

  if (!displayName) {
    throw createHttpError(400, "display_name obbligatorio.", {
      display_name: "Il nome visualizzato e obbligatorio.",
    });
  }

  const specializzazione = normalizeProfessionalSpecialization(
    payload?.specializzazione,
  );
  if (!specializzazione) {
    throw createHttpError(400, "specializzazione obbligatoria e non valida.", {
      specializzazione:
        "Seleziona una specializzazione valida dall'elenco disponibile.",
    });
  }

  assertProfessionalEmailAvailable(email, payload?.id || payload?.professionalId || null);

  const inferredRefertatore =
    specializzazione === "Neurologia" ||
    specializzazione === "Pneumologia" ||
    specializzazione === "Allergologia";

  const normalizedDisplayName =
    displayName || [firstName, lastName].filter(Boolean).join(" ").trim();

  if (!normalizedDisplayName) {
    throw createHttpError(400, "display_name obbligatorio.", {
      display_name: "Il nome visualizzato e obbligatorio.",
    });
  }

  return {
    id: payload?.id || crypto.randomUUID(),
    first_name: firstName,
    last_name: lastName,
    display_name: normalizedDisplayName,
    email,
    specializzazione,
    role_label: normalizeNullableString(payload?.role_label || payload?.roleLabel),
    visible_in_standard:
      payload?.visible_in_standard === false ||
      payload?.visible_in_standard === 0 ||
      payload?.visible_in_standard === "0"
        ? 0
        : 1,
    is_refertatore:
      payload?.is_refertatore === false ||
      payload?.is_refertatore === 0 ||
      payload?.is_refertatore === "0"
        ? 0
        : inferredRefertatore ||
            payload?.is_refertatore === true ||
            payload?.is_refertatore === 1 ||
            payload?.is_refertatore === "1"
        ? 1
        : 0,
    active:
      payload?.active === false || payload?.active === 0 || payload?.active === "0"
        ? 0
        : 1,
    sort_order: Number.isFinite(Number(payload?.sort_order))
      ? Number(payload.sort_order)
      : 0,
  };
}

function mapProfessional(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    display_name: row.display_name,
    email: row.email,
    specializzazione: row.specializzazione,
    role_label: row.role_label,
    visible_in_standard: !!row.visible_in_standard,
    is_refertatore: !!row.is_refertatore,
    active: !!row.active,
    sort_order: Number(row.sort_order || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeNullableString(value) {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
}

function assertProfessionalEmailAvailable(email, excludeId = null) {
  if (!email) {
    return;
  }

  const db = getDb();
  const existing = db
    .prepare(
      `
        SELECT id
        FROM professionals
        WHERE LOWER(email) = LOWER(?)
          AND (? IS NULL OR id <> ?)
        LIMIT 1
      `,
    )
    .get(email, excludeId, excludeId);

  if (existing) {
    throw createHttpError(
      409,
      "Esiste gia un professionista con questa email.",
      {
        email: "Esiste gia un professionista con questa email.",
      },
    );
  }
}
