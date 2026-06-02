import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ALLOWED_DRAFT_STATUSES, ALLOWED_REPORT_TYPES } from "../constants/drafts.js";
import { env } from "../config/env.js";

let db;
const PROFESSIONAL_TYPE_VALUES = [
  "medico",
  "dietista",
  "ostetrica",
  "psicoterapeuta",
  "tnfp",
  "altro",
  "tecnico",
  "professionista_sanitario",
  "professionista sanitario",
];

const REPORT_DRAFTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS report_drafts (
    id TEXT PRIMARY KEY,
    tipo_referto TEXT NOT NULL CHECK (tipo_referto IN (${quoted(ALLOWED_REPORT_TYPES)})),
    stato TEXT NOT NULL CHECK (stato IN (${quoted(ALLOWED_DRAFT_STATUSES)})),
    paziente_nome TEXT,
    paziente_cognome TEXT,
    paziente_nome_completo TEXT,
    data_nascita TEXT,
    codice_fiscale TEXT,
    telefono TEXT,
    email TEXT,
    medico_refertatore TEXT,
    medico_refertatore_id TEXT,
    assigned_refertatore_id TEXT NULL,
    assigned_refertatore_email TEXT NULL,
    assigned_refertatore_name TEXT NULL,
    assigned_refertatore_specializzazione TEXT NULL,
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

const REPORT_DRAFTS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_tipo_referto ON report_drafts (tipo_referto);",
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_stato ON report_drafts (stato);",
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_paziente_nome_completo ON report_drafts (paziente_nome_completo);",
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_codice_fiscale ON report_drafts (codice_fiscale);",
  "CREATE INDEX IF NOT EXISTS idx_report_drafts_updated_at ON report_drafts (updated_at DESC);",
];

const DRAFT_ATTACHMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS draft_attachments (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    drive_file_id TEXT NULL,
    drive_web_view_link TEXT NULL,
    drive_folder_id TEXT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (draft_id) REFERENCES report_drafts (id) ON DELETE CASCADE
  );
`;

const DRAFT_ATTACHMENTS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_draft_attachments_draft_id ON draft_attachments (draft_id);",
  "CREATE INDEX IF NOT EXISTS idx_draft_attachments_kind ON draft_attachments (kind);",
];

const USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'refertatore')),
    professional_id TEXT NULL,
    first_name TEXT NULL,
    last_name TEXT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    specializzazione TEXT NULL,
    avatar_path TEXT NULL,
    avatar_mime_type TEXT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT NULL,
    FOREIGN KEY (professional_id) REFERENCES professionals (id) ON DELETE SET NULL
  );
`;

const USERS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);",
  "CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);",
  "CREATE INDEX IF NOT EXISTS idx_users_active ON users (active);",
  "CREATE INDEX IF NOT EXISTS idx_users_professional_id ON users (professional_id);",
];

const REFERTATORE_ASSIGNMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS refertatore_assignments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tipo_referto TEXT NOT NULL CHECK (tipo_referto IN ('emg', 'psg')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE (user_id, tipo_referto)
  );
`;

const REFERTATORE_ASSIGNMENTS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_refertatore_assignments_user_id ON refertatore_assignments (user_id);",
  "CREATE INDEX IF NOT EXISTS idx_refertatore_assignments_tipo_referto ON refertatore_assignments (tipo_referto);",
  "CREATE INDEX IF NOT EXISTS idx_refertatore_assignments_active ON refertatore_assignments (active);",
];

const AUTH_SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'refertatore')),
    csrf_token_hash TEXT NULL,
    ip_address TEXT NULL,
    user_agent TEXT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
`;

const AUTH_SESSIONS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_role ON auth_sessions (role);",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);",
];

const PASSWORD_RESET_TOKENS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
`;

const PASSWORD_RESET_TOKENS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);",
  "CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens (expires_at);",
];

const PROFESSIONALS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS professionals (
    id TEXT PRIMARY KEY,
    first_name TEXT NULL,
    last_name TEXT NULL,
    display_name TEXT NOT NULL,
    title TEXT NULL,
    email TEXT NULL,
    phone TEXT NULL,
    specializzazione TEXT NULL,
    role_label TEXT NULL,
    professional_type TEXT NOT NULL DEFAULT 'medico' CHECK (professional_type IN (${quoted(PROFESSIONAL_TYPE_VALUES)})),
    visible_in_standard INTEGER NOT NULL DEFAULT 1,
    is_refertatore INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const PROFESSIONALS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_professionals_active ON professionals (active);",
  "CREATE INDEX IF NOT EXISTS idx_professionals_visible_standard ON professionals (visible_in_standard);",
  "CREATE INDEX IF NOT EXISTS idx_professionals_sort_order ON professionals (sort_order);",
];

const AUDIT_LOGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NULL,
    role TEXT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NULL,
    entity_id TEXT NULL,
    ip_address TEXT NULL,
    user_agent TEXT NULL,
    metadata_json TEXT NULL,
    created_at TEXT NOT NULL
  );
`;

const AUDIT_LOGS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);",
  "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);",
];

const DRAFT_EMAIL_DELIVERIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS draft_email_deliveries (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL,
    sent_by_user_id TEXT NOT NULL,
    recipient_email_masked TEXT NOT NULL,
    recipient_email_hash TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('sent', 'failed')),
    error_message TEXT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (draft_id) REFERENCES report_drafts(id) ON DELETE CASCADE,
    FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
  );
`;

const DRAFT_EMAIL_DELIVERIES_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_draft_email_deliveries_draft_id ON draft_email_deliveries (draft_id, created_at DESC);",
  "CREATE INDEX IF NOT EXISTS idx_draft_email_deliveries_user_id ON draft_email_deliveries (sent_by_user_id);",
  "CREATE INDEX IF NOT EXISTS idx_draft_email_deliveries_status ON draft_email_deliveries (status);",
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
  fs.mkdirSync(resolveUploadsRoot(env.draftsUploadDir), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  ensureReportDraftsSchema(db);
  db.exec(DRAFT_ATTACHMENTS_TABLE_SQL);
  ensureDraftAttachmentsSchema(db);
  db.exec(USERS_TABLE_SQL);
  db.exec(REFERTATORE_ASSIGNMENTS_TABLE_SQL);
  db.exec(AUTH_SESSIONS_TABLE_SQL);
  db.exec(PASSWORD_RESET_TOKENS_TABLE_SQL);
  db.exec(PROFESSIONALS_TABLE_SQL);
  db.exec(AUDIT_LOGS_TABLE_SQL);
  db.exec(DRAFT_EMAIL_DELIVERIES_TABLE_SQL);
  ensureAuthSessionsSchema(db);
  ensureProfessionalsSchema(db);
  ensureUsersSchema(db);

  for (const sql of REPORT_DRAFTS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of DRAFT_ATTACHMENTS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of USERS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of REFERTATORE_ASSIGNMENTS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of AUTH_SESSIONS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of PASSWORD_RESET_TOKENS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of PROFESSIONALS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of AUDIT_LOGS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of DRAFT_EMAIL_DELIVERIES_INDEXES_SQL) {
    db.exec(sql);
  }

  return db;
}

function ensureReportDraftsSchema(database) {
  const currentSql = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'report_drafts'",
    )
    .get()?.sql;

  if (!currentSql) {
    database.exec(REPORT_DRAFTS_TABLE_SQL);
    return;
  }

  const expectedStatuses = [
    "in_attesa_refertatore",
    "in_refertazione_refertatore",
    "pronto_per_firma",
    "firmato_caricato",
  ];
  const legacyStatuses = [
    "in_attesa_neurologo",
    "in_refertazione_neurologo",
  ];
  const needsMigration =
    expectedStatuses.some((status) => !currentSql.includes(status)) ||
    legacyStatuses.some((status) => currentSql.includes(status));

  if (!needsMigration) {
    ensureReportDraftsColumns(database);
    return;
  }

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN");

  try {
    database.exec("ALTER TABLE report_drafts RENAME TO report_drafts_legacy");
    database.exec(REPORT_DRAFTS_TABLE_SQL);
    database.exec(`
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
      )
      SELECT
        id,
        tipo_referto,
        CASE
          WHEN stato = 'in_attesa_neurologo' THEN 'in_attesa_refertatore'
          WHEN stato = 'in_refertazione_neurologo' THEN 'in_refertazione_refertatore'
          ELSE stato
        END,
        paziente_nome,
        paziente_cognome,
        paziente_nome_completo,
        data_nascita,
        codice_fiscale,
        telefono,
        email,
        medico_refertatore,
        medico_refertatore_id,
        NULL,
        NULL,
        NULL,
        NULL,
        specializzazione,
        prestazione,
        data_esame,
        form_data_json,
        COALESCE(schema_version, 1),
        created_at,
        updated_at,
        completed_at
      FROM report_drafts_legacy
    `);
    database.exec("DROP TABLE report_drafts_legacy");
    database.exec(`
      UPDATE report_drafts
      SET form_data_json = json_set(
        form_data_json,
        '$.meta.draftStatus',
        CASE
          WHEN json_extract(form_data_json, '$.meta.draftStatus') = 'in_attesa_neurologo' THEN 'in_attesa_refertatore'
          WHEN json_extract(form_data_json, '$.meta.draftStatus') = 'in_refertazione_neurologo' THEN 'in_refertazione_refertatore'
          ELSE json_extract(form_data_json, '$.meta.draftStatus')
        END
      )
      WHERE json_valid(form_data_json) = 1
        AND json_extract(form_data_json, '$.meta.draftStatus') IN ('in_attesa_neurologo', 'in_refertazione_neurologo')
    `);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }

  ensureReportDraftsColumns(database);
}

function ensureUsersSchema(database) {
  const columns = database
    .prepare("PRAGMA table_info(users)")
    .all()
    .map((column) => column.name);

  [
    ["professional_id", "TEXT NULL"],
    ["first_name", "TEXT NULL"],
    ["last_name", "TEXT NULL"],
    ["avatar_path", "TEXT NULL"],
    ["avatar_mime_type", "TEXT NULL"],
  ]
    .filter(([name]) => !columns.includes(name))
    .forEach(([name, sqlType]) => {
      database.exec(`ALTER TABLE users ADD COLUMN ${name} ${sqlType}`);
    });
}

function ensureDraftAttachmentsSchema(database) {
  const columns = database
    .prepare("PRAGMA table_info(draft_attachments)")
    .all()
    .map((column) => column.name);

  if (!columns.length) {
    database.exec(DRAFT_ATTACHMENTS_TABLE_SQL);
    return;
  }

  const missingColumns = [
    ["drive_file_id", "TEXT NULL"],
    ["drive_web_view_link", "TEXT NULL"],
    ["drive_folder_id", "TEXT NULL"],
  ].filter(([name]) => !columns.includes(name));

  missingColumns.forEach(([name, sqlType]) => {
    database.exec(`ALTER TABLE draft_attachments ADD COLUMN ${name} ${sqlType}`);
  });
}

function ensureReportDraftsColumns(database) {
  const columns = database
    .prepare("PRAGMA table_info(report_drafts)")
    .all()
    .map((column) => column.name);

  [
    ["assigned_refertatore_id", "TEXT NULL"],
    ["assigned_refertatore_email", "TEXT NULL"],
    ["assigned_refertatore_name", "TEXT NULL"],
    ["assigned_refertatore_specializzazione", "TEXT NULL"],
  ]
    .filter(([name]) => !columns.includes(name))
    .forEach(([name, sqlType]) => {
      database.exec(`ALTER TABLE report_drafts ADD COLUMN ${name} ${sqlType}`);
    });
}

function ensureAuthSessionsSchema(database) {
  const columns = database
    .prepare("PRAGMA table_info(auth_sessions)")
    .all()
    .map((column) => column.name);

  if (!columns.includes("csrf_token_hash")) {
    database.exec("ALTER TABLE auth_sessions ADD COLUMN csrf_token_hash TEXT NULL");
  }
}

function ensureProfessionalsSchema(database) {
  const currentSql = database
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'professionals'",
    )
    .get()?.sql;

  if (!currentSql) {
    database.exec(PROFESSIONALS_TABLE_SQL);
    return;
  }

  const needsConstraintMigration = !currentSql.includes("tnfp");

  if (needsConstraintMigration) {
    database.exec("PRAGMA foreign_keys = OFF");
    database.exec("BEGIN");

    try {
      database.exec("ALTER TABLE professionals RENAME TO professionals_legacy");
      database.exec(PROFESSIONALS_TABLE_SQL);
      database.exec(`
        INSERT INTO professionals (
          id,
          first_name,
          last_name,
          display_name,
          title,
          email,
          phone,
          specializzazione,
          role_label,
          professional_type,
          visible_in_standard,
          is_refertatore,
          active,
          sort_order,
          created_at,
          updated_at
        )
        SELECT
          id,
          first_name,
          last_name,
          display_name,
          title,
          email,
          phone,
          specializzazione,
          role_label,
          COALESCE(NULLIF(professional_type, ''), 'medico'),
          COALESCE(visible_in_standard, 1),
          COALESCE(is_refertatore, 0),
          COALESCE(active, 1),
          COALESCE(sort_order, 0),
          created_at,
          updated_at
        FROM professionals_legacy
      `);
      database.exec("DROP TABLE professionals_legacy");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    } finally {
      database.exec("PRAGMA foreign_keys = ON");
    }
  }

  const columns = database
    .prepare("PRAGMA table_info(professionals)")
    .all()
    .map((column) => column.name);

  [
    ["first_name", "TEXT NULL"],
    ["last_name", "TEXT NULL"],
    ["professional_type", "TEXT NOT NULL DEFAULT 'medico'"],
    ["visible_in_standard", "INTEGER NOT NULL DEFAULT 1"],
  ]
    .filter(([name]) => !columns.includes(name))
    .forEach(([name, sqlType]) => {
      database.exec(`ALTER TABLE professionals ADD COLUMN ${name} ${sqlType}`);
    });
}

function resolveDbPath(dbPath) {
  if (!dbPath) {
    throw new Error("DRAFTS_DB_PATH non configurato.");
  }

  return path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);
}

export function resolveUploadsRoot(uploadsDir) {
  const baseDir = uploadsDir?.trim();

  if (!baseDir) {
    throw new Error("DRAFTS_UPLOAD_DIR non configurato.");
  }

  return path.isAbsolute(baseDir)
    ? baseDir
    : path.resolve(process.cwd(), baseDir);
}

function quoted(values) {
  return values.map((value) => `'${value}'`).join(", ");
}
