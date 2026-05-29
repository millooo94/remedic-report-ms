import crypto from "node:crypto";
import { deleteAllDraftAttachments, listDraftAttachments } from "./draft-attachments.service.js";
import { getDb } from "../db/sqlite.js";
import { sendDraftAssignedEmail } from "./email.service.js";

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeSummary(summary = {}, tipoReferto = "standard") {
  const medicoRefertatore = normalizeNullableString(summary.medico_refertatore);
  const medicoRefertatoreId = normalizeNullableString(summary.medico_refertatore_id);
  const specializzazione = normalizeNullableString(summary.specializzazione);
  const assignedRefertatoreId = normalizeNullableString(summary.assigned_refertatore_id);
  const assignedRefertatoreEmail = normalizeNullableString(summary.assigned_refertatore_email);
  const assignedRefertatoreName = normalizeNullableString(summary.assigned_refertatore_name);
  const assignedRefertatoreSpecializzazione = normalizeNullableString(
    summary.assigned_refertatore_specializzazione,
  );
  const shouldMirrorMedico = tipoReferto === "emg" || tipoReferto === "psg";

  return {
    paziente_nome: normalizeNullableString(summary.paziente_nome),
    paziente_cognome: normalizeNullableString(summary.paziente_cognome),
    paziente_nome_completo: normalizeNullableString(summary.paziente_nome_completo),
    data_nascita: normalizeNullableString(summary.data_nascita),
    codice_fiscale: normalizeNullableString(summary.codice_fiscale),
    telefono: normalizeNullableString(summary.telefono),
    email: normalizeNullableString(summary.email),
    medico_refertatore: medicoRefertatore,
    medico_refertatore_id: medicoRefertatoreId,
    assigned_refertatore_id:
      assignedRefertatoreId || (shouldMirrorMedico ? medicoRefertatoreId : null),
    assigned_refertatore_email: assignedRefertatoreEmail,
    assigned_refertatore_name:
      assignedRefertatoreName || (shouldMirrorMedico ? medicoRefertatore : null),
    assigned_refertatore_specializzazione:
      assignedRefertatoreSpecializzazione ||
      (shouldMirrorMedico ? specializzazione : null),
    specializzazione,
    prestazione: normalizeNullableString(summary.prestazione),
    data_esame: normalizeNullableString(summary.data_esame),
  };
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
      assigned_refertatore_id: row.assigned_refertatore_id,
      assigned_refertatore_email: row.assigned_refertatore_email,
      assigned_refertatore_name: row.assigned_refertatore_name,
      assigned_refertatore_specializzazione:
        row.assigned_refertatore_specializzazione,
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
    assigned_refertatore_id: row.assigned_refertatore_id,
    assigned_refertatore_email: row.assigned_refertatore_email,
    assigned_refertatore_name: row.assigned_refertatore_name,
    assigned_refertatore_specializzazione: row.assigned_refertatore_specializzazione,
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
  const summary = normalizeSummary(payload.summary, payload.tipo_referto);
  const formDataJson = JSON.stringify(payload.form_data);
  const schemaVersion = Number(payload.form_data?.meta?.schemaVersion || 1);

  db.prepare(
    `
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
        assigned_refertatore_id,
        assigned_refertatore_email,
        assigned_refertatore_name,
        assigned_refertatore_specializzazione,
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
        @assigned_refertatore_id,
        @assigned_refertatore_email,
        @assigned_refertatore_name,
        @assigned_refertatore_specializzazione,
        @specializzazione,
        @prestazione,
        @data_esame,
        @form_data_json,
        @schema_version,
        @created_at,
        @updated_at,
        @completed_at
      )
    `,
  ).run({
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
  const scope = String(filters.scope || "").trim().toLowerCase();

  if (filters.tipo_referto) {
    clauses.push("tipo_referto = @tipo_referto");
    params.tipo_referto = filters.tipo_referto;
  }

  if (scope === "active") {
    clauses.push("stato NOT IN ('completato', 'firmato_caricato')");
  } else if (scope === "archive") {
    clauses.push("stato IN ('completato', 'firmato_caricato')");
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
    .prepare(
      `
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
          assigned_refertatore_id,
          assigned_refertatore_email,
          assigned_refertatore_name,
          assigned_refertatore_specializzazione,
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
      `,
    )
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
  const summary = normalizeSummary(payload.summary, payload.tipo_referto);
  const formDataJson = JSON.stringify(payload.form_data);
  const schemaVersion = Number(payload.form_data?.meta?.schemaVersion || 1);

  db.prepare(
    `
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
        assigned_refertatore_id = @assigned_refertatore_id,
        assigned_refertatore_email = @assigned_refertatore_email,
        assigned_refertatore_name = @assigned_refertatore_name,
        assigned_refertatore_specializzazione = @assigned_refertatore_specializzazione,
        specializzazione = @specializzazione,
        prestazione = @prestazione,
        data_esame = @data_esame,
        form_data_json = @form_data_json,
        schema_version = @schema_version,
        updated_at = @updated_at,
        completed_at = @completed_at
      WHERE id = @id
    `,
  ).run({
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

  db.prepare(
    `
      UPDATE report_drafts
      SET
        stato = @stato,
        updated_at = @updated_at,
        completed_at = @completed_at
      WHERE id = @id
    `,
  ).run({
    id,
    stato,
    updated_at: now,
    completed_at: stato === "completato" ? now : null,
  });

  return getDraftById(id);
}

export function deleteDraft(id) {
  const draft = getDraftById(id);

  if (draft.stato === "completato" || draft.stato === "firmato_caricato") {
    throw createHttpError(
      409,
      "I referti completati non possono essere eliminati dalla UI operativa.",
    );
  }

  deleteAllDraftAttachments(id);

  const db = getDb();
  const result = db.prepare("DELETE FROM report_drafts WHERE id = ?").run(id);

  if (!result.changes) {
    throw createHttpError(404, "Bozza non trovata.");
  }
}

export async function sendDraftToAssignedRefertatore(id) {
  const draft = getDraftById(id);
  const assignedEmail = draft.summary.assigned_refertatore_email;
  const assignedName = draft.summary.assigned_refertatore_name;

  if (!draft.summary.assigned_refertatore_id || !assignedEmail || !assignedName) {
    throw createHttpError(
      400,
      "Seleziona prima un refertatore assegnato prima dell'invio.",
    );
  }

  const nextStatus =
    draft.tipo_referto === "emg" ? "in_attesa_neurologo" : "in_refertazione";
  const nextMeta = {
    ...(draft.form_data?.meta ?? {}),
    sentToRefertatore: true,
    draftStatus: nextStatus,
  };
  const updatedDraft = updateDraft(id, {
    tipo_referto: draft.tipo_referto,
    stato: nextStatus,
    summary: draft.summary,
    form_data: {
      form: draft.form_data?.form ?? {},
      sections: draft.form_data?.sections ?? {},
      meta: nextMeta,
    },
  });

  const patientName =
    draft.summary.paziente_nome_completo ||
    [draft.summary.paziente_nome, draft.summary.paziente_cognome]
      .filter(Boolean)
      .join(" ") ||
    "Paziente";

  const referenceDate =
    draft.summary.data_esame ||
    draft.form_data?.form?.dataVisita ||
    draft.form_data?.form?.psg?.dataRegistrazioneInizio ||
    "";

  const emailResult = await sendDraftAssignedEmail({
    email: assignedEmail,
    displayName: assignedName,
    reportType: draft.tipo_referto,
    patientName,
    referenceDate,
  });

  return {
    draft: updatedDraft,
    emailSent: !!emailResult?.sent,
  };
}

export function listNeurologistEmgDrafts() {
  return listRefertatoreDraftsLegacy("emg");
}

export function getNeurologistEmgDraftById(id) {
  const draft = getDraftById(id);

  if (draft.tipo_referto !== "emg") {
    throw createHttpError(404, "Bozza EMG non trovata.");
  }

  if (
    draft.stato !== "in_attesa_neurologo" &&
    draft.stato !== "in_refertazione_neurologo" &&
    draft.stato !== "pronto_per_firma" &&
    draft.stato !== "completato"
  ) {
    throw createHttpError(404, "Bozza EMG non disponibile per l'area neurologo.");
  }

  if (draft.stato === "in_attesa_neurologo") {
    updateDraftStatus(id, "in_refertazione_neurologo");
    return getNeurologistEmgDraftById(id);
  }

  return {
    ...draft,
    attachments: listDraftAttachments(id),
  };
}

export function updateNeurologistEmgDraft(id, payload) {
  const currentDraft = getDraftById(id);

  if (currentDraft.tipo_referto !== "emg") {
    throw createHttpError(404, "Bozza EMG non trovata.");
  }

  const nextForm = structuredClone(currentDraft.form_data?.form ?? {});
  const nextSections = structuredClone(currentDraft.form_data?.sections ?? {});
  const nextMeta = structuredClone(currentDraft.form_data?.meta ?? {});
  const payloadForm = payload?.form_data?.form ?? {};
  const incomingEmg = payloadForm?.emg ?? {};

  nextForm.emg = {
    ...(nextForm.emg ?? {}),
    repertiElettrofisiologici:
      normalizeNullableString(incomingEmg.repertiElettrofisiologici) || "",
    conclusioni: normalizeNullableString(incomingEmg.conclusioni) || "",
  };
  nextMeta.currentStep = Number(payload?.form_data?.meta?.currentStep || nextMeta.currentStep || 3);
  nextMeta.draftStatus = "in_refertazione_neurologo";
  nextMeta.schemaVersion = Number(nextMeta.schemaVersion || 1);

  return updateDraft(id, {
    tipo_referto: "emg",
    stato: "in_refertazione_neurologo",
    summary: normalizeSummary(payload?.summary ?? currentDraft.summary, "emg"),
    form_data: {
      form: nextForm,
      sections: nextSections,
      meta: nextMeta,
    },
  });
}

export function listRefertatoreDrafts(userId, tipoReferto) {
  const db = getDb();
  const clauses = [
    "assigned_refertatore_id = @user_id",
    "tipo_referto = @tipo_referto",
  ];
  const params = {
    user_id: userId,
    tipo_referto: tipoReferto,
  };

  if (tipoReferto === "emg") {
    clauses.push(
      "stato IN ('in_attesa_neurologo', 'in_refertazione_neurologo', 'pronto_per_firma')",
    );
  } else if (tipoReferto === "psg") {
    clauses.push("stato IN ('in_refertazione', 'pronto_per_firma')");
    clauses.push(
      "COALESCE(json_extract(form_data_json, '$.meta.sentToRefertatore'), 0) = 1",
    );
  }

  const rows = db
    .prepare(
      `
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
          assigned_refertatore_id,
          assigned_refertatore_email,
          assigned_refertatore_name,
          assigned_refertatore_specializzazione,
          specializzazione,
          prestazione,
          data_esame,
          created_at,
          updated_at,
          completed_at
        FROM report_drafts
        WHERE ${clauses.join(" AND ")}
        ORDER BY updated_at DESC
      `,
    )
    .all(params);

  return rows.map(toDraftSummary);
}

export function listRefertatoreArchive(userId, tipoReferto) {
  const db = getDb();
  const rows = db
    .prepare(
      `
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
          assigned_refertatore_id,
          assigned_refertatore_email,
          assigned_refertatore_name,
          assigned_refertatore_specializzazione,
          specializzazione,
          prestazione,
          data_esame,
          created_at,
          updated_at,
          completed_at
        FROM report_drafts
        WHERE assigned_refertatore_id = ?
          AND tipo_referto = ?
          AND stato IN ('completato', 'firmato_caricato')
        ORDER BY completed_at DESC, updated_at DESC
      `,
    )
    .all(userId, tipoReferto);

  return rows.map(toDraftSummary);
}

export function getRefertatoreDraftById(userId, id) {
  const draft = getDraftById(id);

  if (draft.summary.assigned_refertatore_id !== userId) {
    throw createHttpError(403, "Il referto non e assegnato a questo refertatore.");
  }

  if (
    draft.tipo_referto === "psg" &&
    !isDraftSentToRefertatore(draft)
  ) {
    throw createHttpError(404, "Bozza PSG non ancora inviata al refertatore.");
  }

  if (draft.tipo_referto === "emg" && draft.stato === "in_attesa_neurologo") {
    updateDraftStatus(id, "in_refertazione_neurologo");
    return getRefertatoreDraftById(userId, id);
  }

  return {
    ...getDraftById(id),
    attachments: listDraftAttachments(id),
  };
}

export function updateRefertatoreDraft(userId, id, payload) {
  const currentDraft = getRefertatoreDraftById(userId, id);
  const nextForm = structuredClone(currentDraft.form_data?.form ?? {});
  const nextSections = structuredClone(currentDraft.form_data?.sections ?? {});
  const nextMeta = structuredClone(currentDraft.form_data?.meta ?? {});
  const payloadForm = payload?.form_data?.form ?? {};

  if (currentDraft.tipo_referto === "emg") {
    const incomingEmg = payloadForm?.emg ?? {};
    nextForm.emg = {
      ...(nextForm.emg ?? {}),
      repertiElettrofisiologici:
        normalizeNullableString(incomingEmg.repertiElettrofisiologici) || "",
      conclusioni: normalizeNullableString(incomingEmg.conclusioni) || "",
    };
    nextMeta.currentStep = Number(payload?.form_data?.meta?.currentStep || 3);
    nextMeta.draftStatus = "in_refertazione_neurologo";

    return updateDraft(id, {
      tipo_referto: "emg",
      stato: "in_refertazione_neurologo",
      summary: currentDraft.summary,
      form_data: {
        form: nextForm,
        sections: nextSections,
        meta: nextMeta,
      },
    });
  }

  if (currentDraft.tipo_referto === "psg") {
    const incomingPsg = payloadForm?.psg ?? {};
    nextForm.psg = {
      ...(nextForm.psg ?? {}),
      interpretazioneMedico:
        normalizeNullableString(incomingPsg.interpretazioneMedico) || "",
      conclusioneDiagnostica:
        normalizeNullableString(incomingPsg.conclusioneDiagnostica) || "",
      indicazioniCliniche:
        normalizeNullableString(incomingPsg.indicazioniCliniche) || "",
      notaDocumentale:
        normalizeNullableString(incomingPsg.notaDocumentale) || "",
    };
    nextMeta.currentStep = Number(payload?.form_data?.meta?.currentStep || 3);
    nextMeta.draftStatus = "in_refertazione";

    return updateDraft(id, {
      tipo_referto: "psg",
      stato: currentDraft.stato === "completato" ? "completato" : "in_refertazione",
      summary: currentDraft.summary,
      form_data: {
        form: nextForm,
        sections: nextSections,
        meta: nextMeta,
      },
    });
  }

  throw createHttpError(400, "Tipo referto non gestito in area refertatore.");
}

function listRefertatoreDraftsLegacy(tipoReferto) {
  const db = getDb();
  const rows = db
    .prepare(
      `
        SELECT
          d.id,
          d.stato,
          d.paziente_nome_completo,
          d.data_nascita,
          d.data_esame,
          d.medico_refertatore,
          d.updated_at,
          json_extract(d.form_data_json, '$.form.emg.tecnicoEsecutore') AS tecnico_esecutore,
          COUNT(a.id) AS attachment_count
        FROM report_drafts d
        LEFT JOIN draft_attachments a
          ON a.draft_id = d.id
        WHERE d.tipo_referto = @tipo_referto
          AND d.stato IN ('in_attesa_neurologo', 'in_refertazione_neurologo', 'pronto_per_firma')
        GROUP BY
          d.id,
          d.stato,
          d.paziente_nome_completo,
          d.data_nascita,
          d.data_esame,
          d.medico_refertatore,
          d.updated_at
        ORDER BY d.updated_at DESC
      `,
    )
    .all({ tipo_referto: tipoReferto });

  return rows.map((row) => ({
    id: row.id,
    stato: row.stato,
    paziente_nome_completo: row.paziente_nome_completo,
    data_nascita: row.data_nascita,
    data_esame: row.data_esame,
    medico_refertatore: row.medico_refertatore,
    tecnico_esecutore: row.tecnico_esecutore || null,
    updated_at: row.updated_at,
    attachment_count: Number(row.attachment_count || 0),
  }));
}

function isDraftSentToRefertatore(draft) {
  return Boolean(draft?.form_data?.meta?.sentToRefertatore);
}

function sanitizePaginationValue(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
