import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env.js";

let db;

const CREATE_REPORT_DRAFTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS report_drafts (
    id TEXT PRIMARY KEY,
    tipo_referto TEXT NOT NULL CHECK (tipo_referto IN ('standard', 'emg', 'psg')),
    stato TEXT NOT NULL CHECK (stato IN ('bozza', 'anamnesi_raccolta', 'in_refertazione', 'completato')),
    paziente_nome TEXT,
    paziente_cognome TEXT,
    paziente_nome_completo TEXT,
    data_nascita TEXT,
    codice_fiscale TEXT,
    telefono TEXT,
    email TEXT,
    medico_refertatore TEXT,
    medico_refertatore_id TEXT,
    specializzazione TEXT,
    prestazione TEXT,
    data_esame TEXT,
    form_data_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT NULL
  );
`;

const CREATE_REPORT_DRAFTS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_tipo_referto ON report_drafts (tipo_referto);",
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_stato ON report_drafts (stato);",
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_paziente_nome_completo ON report_drafts (paziente_nome_completo);",
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_codice_fiscale ON report_drafts (codice_fiscale);",
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_updated_at ON report_drafts (updated_at DESC);",
];

export function initDraftsStore() {
  getDb();
}

export function getDb() {
  if (db) {
    return db;
  }

  const dbPath = resolveDbPath(env.draftsDbPath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(CREATE_REPORT_DRAFTS_TABLE_SQL);

  for (const sql of CREATE_REPORT_DRAFTS_INDEXES_SQL) {
    db.exec(sql);
  }

  return db;
}

function resolveDbPath(dbPath) {
  if (!dbPath) {
    throw new Error("DRAFTS_DB_PATH non configurato.");
  }

  return path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);
}
