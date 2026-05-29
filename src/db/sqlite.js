import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ALLOWED_DRAFT_STATUSES, ALLOWED_REPORT_TYPES } from "../constants/drafts.js";
import { env } from "../config/env.js";
import { DEFAULT_PROFESSIONALS } from "../constants/default-professionals.js";

let db;

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

const NEUROLOGIST_USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS neurologist_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    specializzazione TEXT NOT NULL DEFAULT 'Neurologia',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const NEUROLOGIST_USERS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_neurologist_users_email ON neurologist_users (email);",
  "CREATE INDEX IF NOT EXISTS idx_neurologist_users_active ON neurologist_users (active);",
];

const USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'refertatore')),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    specializzazione TEXT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT NULL
  );
`;

const USERS_INDEXES_SQL = [
  "CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);",
  "CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);",
  "CREATE INDEX IF NOT EXISTS idx_users_active ON users (active);",
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
    professional_type TEXT NOT NULL DEFAULT 'medico' CHECK (professional_type IN ('medico', 'tecnico')),
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
  db.exec(NEUROLOGIST_USERS_TABLE_SQL);
  db.exec(USERS_TABLE_SQL);
  db.exec(REFERTATORE_ASSIGNMENTS_TABLE_SQL);
  db.exec(AUTH_SESSIONS_TABLE_SQL);
  db.exec(PASSWORD_RESET_TOKENS_TABLE_SQL);
  db.exec(PROFESSIONALS_TABLE_SQL);
  db.exec(AUDIT_LOGS_TABLE_SQL);
  ensureAuthSessionsSchema(db);
  ensureProfessionalsSchema(db);

  for (const sql of REPORT_DRAFTS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of DRAFT_ATTACHMENTS_INDEXES_SQL) {
    db.exec(sql);
  }

  for (const sql of NEUROLOGIST_USERS_INDEXES_SQL) {
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

  migrateLegacyNeurologists(db);
  seedProfessionals(db);

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
    "in_attesa_neurologo",
    "in_refertazione_neurologo",
    "pronto_per_firma",
    "firmato_caricato",
  ];
  const needsMigration = expectedStatuses.some((status) => !currentSql.includes(status));

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
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }

  ensureReportDraftsColumns(database);
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

function migrateLegacyNeurologists(database) {
  const hasLegacyTable = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'neurologist_users'",
    )
    .get();

  if (!hasLegacyTable) {
    return;
  }

  const legacyUsers = database.prepare("SELECT * FROM neurologist_users").all();

  if (!legacyUsers.length) {
    return;
  }

  const insertUser = database.prepare(`
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
      'refertatore',
      @email,
      @password_hash,
      @display_name,
      @specializzazione,
      @active,
      0,
      @created_at,
      @updated_at,
      NULL
    )
  `);

  const insertAssignment = database.prepare(`
    INSERT OR IGNORE INTO refertatore_assignments (
      id,
      user_id,
      tipo_referto,
      active,
      created_at,
      updated_at
    ) VALUES (
      @id,
      @user_id,
      @tipo_referto,
      1,
      @created_at,
      @updated_at
    )
  `);

  const insertProfessional = database.prepare(`
    INSERT OR IGNORE INTO professionals (
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
    ) VALUES (
      @id,
      @first_name,
      @last_name,
      @display_name,
      NULL,
      @email,
      NULL,
      @specializzazione,
      'Medico refertatore',
      'medico',
      1,
      1,
      @active,
      0,
      @created_at,
      @updated_at
    )
  `);

  for (const legacyUser of legacyUsers) {
    const existingUser = database
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(legacyUser.email);

    const userId = existingUser?.id || legacyUser.id;

    if (!existingUser) {
      insertUser.run({
        id: userId,
        email: legacyUser.email,
        password_hash: legacyUser.password_hash,
        display_name: legacyUser.display_name,
        specializzazione: legacyUser.specializzazione || "Neurologia",
        active: legacyUser.active ?? 1,
        created_at: legacyUser.created_at,
        updated_at: legacyUser.updated_at,
      });
    }

    insertAssignment.run({
      id: `${userId}-emg`,
      user_id: userId,
      tipo_referto: "emg",
      created_at: legacyUser.created_at,
      updated_at: legacyUser.updated_at,
    });

    insertAssignment.run({
      id: `${userId}-psg`,
      user_id: userId,
      tipo_referto: "psg",
      created_at: legacyUser.created_at,
      updated_at: legacyUser.updated_at,
    });

    const { firstName, lastName } = splitDisplayName(legacyUser.display_name);
    insertProfessional.run({
      id: `legacy-prof-${userId}`,
      first_name: firstName,
      last_name: lastName,
      display_name: legacyUser.display_name,
      email: legacyUser.email,
      specializzazione: legacyUser.specializzazione || "Neurologia",
      active: legacyUser.active ?? 1,
      created_at: legacyUser.created_at,
      updated_at: legacyUser.updated_at,
    });
  }
}

function seedProfessionals(database) {
  const total = Number(
    database.prepare("SELECT COUNT(*) AS total FROM professionals").get()?.total || 0,
  );

  if (total > 0) {
    return;
  }

  const now = new Date().toISOString();
  const insertProfessional = database.prepare(`
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
    ) VALUES (
      @id,
      @first_name,
      @last_name,
      @display_name,
      @title,
      @email,
      @phone,
      @specializzazione,
      @role_label,
      @professional_type,
      @visible_in_standard,
      @is_refertatore,
      @active,
      @sort_order,
      @created_at,
      @updated_at
    )
  `);

  DEFAULT_PROFESSIONALS.forEach((professional, index) => {
    insertProfessional.run({
      id: professional.id,
      first_name: professional.first_name || null,
      last_name: professional.last_name || null,
      display_name: professional.display_name,
      title: professional.title || null,
      email: professional.email || null,
      phone: professional.phone || null,
      specializzazione: professional.specializzazione || null,
      role_label: professional.role_label || null,
      professional_type: professional.professional_type || "medico",
      visible_in_standard: professional.visible_in_standard ?? 1,
      is_refertatore: professional.is_refertatore ?? 0,
      active: professional.active ?? 1,
      sort_order: professional.sort_order ?? index,
      created_at: now,
      updated_at: now,
    });
  });
}

function splitDisplayName(displayName) {
  const parts = String(displayName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: null, lastName: null };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
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
