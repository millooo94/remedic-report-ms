import crypto from "node:crypto";
import { getDb } from "../db/sqlite.js";

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeSummary(summary = {}) {
  return {
    paziente_nome: normalizeNullableString(summary.paziente_nome),
    paziente_cognome: normalizeNullableString(summary.paziente_cognome),
    paziente_nome_completo: normalizeNullableString(summary.paziente_nome_completo),
    data_nascita: normalizeNullableString(summary.data_nascita),
    codice_fiscale: normalizeNullableString(summary.codice_fiscale),
    telefono: normalizeNullableString(summary.telefono),
    email: normalizeNullableString(summary.email),
    medico_refertatore: normalizeNullableString(summary.medico_refertatore),
    medico_refertatore_id: normalizeNullableString(summary.medico_refertatore_id),
    specializzazione: normalizeNullableString(summary.specializzazione),
    prestazione: normalizeNullableString(summary.prestazione),
    data_esame: normalizeNullableString(summary.data_esame),
  };
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

function parseDraftRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    tipo_referto: row.tipo_referto,
    stato: row.stato,
    summary: {
      paziente_nome: row.paziente_nome,
      paziente_cognome: row.paziente_cognome,
      paziente_nome_completo: row.paziente_nome_completo,
      data_nascita: row.data_nascita,
      codice_fiscale: row.codice_fiscale,
      telefono: row.telefono,
      email: row.email,
      medico_refertatore: row.medico_refertatore,
      medico_refertatore_id: row.medico_refertatore_id,
      specializzazione: row.specializzazione,
      prestazione: row.prestazione,
      data_esame: row.data_esame,
    },
    form_data: JSON.parse(row.form_data_json),
    schema_version: row.schema_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

function toDraftSummary(row) {
  return {
    id: row.id,
    tipo_referto: row.tipo_referto,
    stato: row.stato,
    paziente_nome: row.paziente_nome,
    paziente_cognome: row.paziente_cognome,
    paziente_nome_completo: row.paziente_nome_completo,
    data_nascita: row.data_nascita,
    codice_fiscale: row.codice_fiscale,
    telefono: row.telefono,
    email: row.email,
    medico_refertatore: row.medico_refertatore,
    medico_refertatore_id: row.medico_refertatore_id,
    specializzazione: row.specializzazione,
    prestazione: row.prestazione,
    data_esame: row.data_esame,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

export function createDraft(payload) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const summary = normalizeSummary(payload.summary);
  const formDataJson = JSON.stringify(payload.form_data);
  const schemaVersion = Number(payload.form_data?.meta?.schemaVersion || 1);

  const statement = db.prepare(`
    INSERT INTO report_drafts (
      id,
      tipo_referto,
      stato,
      paziente_nome,
      paziente_cognome,
      paziente_nome_completo,
      data_nascita,
      codice_fiscale,
      telefono,
      email,
      medico_refertatore,
      medico_refertatore_id,
      specializzazione,
      prestazione,
      data_esame,
      form_data_json,
      schema_version,
      created_at,
      updated_at,
      completed_at
    ) VALUES (
      @id,
      @tipo_referto,
      @stato,
      @paziente_nome,
      @paziente_cognome,
      @paziente_nome_completo,
      @data_nascita,
      @codice_fiscale,
      @telefono,
      @email,
      @medico_refertatore,
      @medico_refertatore_id,
      @specializzazione,
      @prestazione,
      @data_esame,
      @form_data_json,
      @schema_version,
      @created_at,
      @updated_at,
      @completed_at
    )
  `);

  statement.run({
    id,
    tipo_referto: payload.tipo_referto,
    stato: payload.stato,
    ...summary,
    form_data_json: formDataJson,
    schema_version: schemaVersion,
    created_at: now,
    updated_at: now,
    completed_at: payload.stato === "completato" ? now : null,
  });

  return getDraftById(id);
}

export function listDrafts(filters = {}) {
  const db = getDb();
  const clauses = [];
  const params = {};

  if (filters.tipo_referto) {
    clauses.push("tipo_referto = @tipo_referto");
    params.tipo_referto = filters.tipo_referto;
  }

  if (filters.stato) {
    clauses.push("stato = @stato");
    params.stato = filters.stato;
  }

  if (filters.q) {
    clauses.push(
      "(LOWER(COALESCE(paziente_nome_completo, '')) LIKE @query OR LOWER(COALESCE(codice_fiscale, '')) LIKE @query)",
    );
    params.query = `%${String(filters.q).trim().toLowerCase()}%`;
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = sanitizePaginationValue(filters.limit, 20, 1, 100);
  const offset = sanitizePaginationValue(filters.offset, 0, 0, 1000000);

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM report_drafts ${whereClause}`)
    .get(params);

  const rows = db
    .prepare(`
      SELECT
        id,
        tipo_referto,
        stato,
        paziente_nome,
        paziente_cognome,
        paziente_nome_completo,
        data_nascita,
        codice_fiscale,
        telefono,
        email,
        medico_refertatore,
        medico_refertatore_id,
        specializzazione,
        prestazione,
        data_esame,
        created_at,
        updated_at,
        completed_at
      FROM report_drafts
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT @limit
      OFFSET @offset
    `)
    .all({
      ...params,
      limit,
      offset,
    });

  return {
    items: rows.map(toDraftSummary),
    total: Number(countRow?.total || 0),
    limit,
    offset,
  };
}

export function getDraftById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM report_drafts WHERE id = ?").get(id);

  if (!row) {
    throw createHttpError(404, "Bozza non trovata.");
  }

  return parseDraftRow(row);
}

export function updateDraft(id, payload) {
  getDraftById(id);

  const db = getDb();
  const now = new Date().toISOString();
  const summary = normalizeSummary(payload.summary);
  const formDataJson = JSON.stringify(payload.form_data);
  const schemaVersion = Number(payload.form_data?.meta?.schemaVersion || 1);

  db.prepare(`
    UPDATE report_drafts
    SET
      tipo_referto = @tipo_referto,
      stato = @stato,
      paziente_nome = @paziente_nome,
      paziente_cognome = @paziente_cognome,
      paziente_nome_completo = @paziente_nome_completo,
      data_nascita = @data_nascita,
      codice_fiscale = @codice_fiscale,
      telefono = @telefono,
      email = @email,
      medico_refertatore = @medico_refertatore,
      medico_refertatore_id = @medico_refertatore_id,
      specializzazione = @specializzazione,
      prestazione = @prestazione,
      data_esame = @data_esame,
      form_data_json = @form_data_json,
      schema_version = @schema_version,
      updated_at = @updated_at,
      completed_at = @completed_at
    WHERE id = @id
  `).run({
    id,
    tipo_referto: payload.tipo_referto,
    stato: payload.stato,
    ...summary,
    form_data_json: formDataJson,
    schema_version: schemaVersion,
    updated_at: now,
    completed_at: payload.stato === "completato" ? now : null,
  });

  return getDraftById(id);
}

export function updateDraftStatus(id, stato) {
  getDraftById(id);

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE report_drafts
    SET
      stato = @stato,
      updated_at = @updated_at,
      completed_at = @completed_at
    WHERE id = @id
  `).run({
    id,
    stato,
    updated_at: now,
    completed_at: stato === "completato" ? now : null,
  });

  return getDraftById(id);
}

export function deleteDraft(id) {
  const db = getDb();
  const result = db.prepare("DELETE FROM report_drafts WHERE id = ?").run(id);

  if (!result.changes) {
    throw createHttpError(404, "Bozza non trovata.");
  }
}

function sanitizePaginationValue(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
