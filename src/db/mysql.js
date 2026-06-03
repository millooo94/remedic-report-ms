import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Worker, MessageChannel, receiveMessageOnPort } from "node:worker_threads";
import mysql from "mysql2/promise";
import { ALLOWED_DRAFT_STATUSES, ALLOWED_REPORT_TYPES } from "../constants/drafts.js";
import { env } from "../config/env.js";

let pool;
let worker;
let queryPort;

const CREATE_TABLE_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS professionals (
      id VARCHAR(36) PRIMARY KEY,
      first_name VARCHAR(255) NULL,
      last_name VARCHAR(255) NULL,
      display_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NULL UNIQUE,
      specializzazione VARCHAR(255) NULL,
      role_label VARCHAR(255) NULL,
      visible_in_standard TINYINT(1) NOT NULL DEFAULT 1,
      is_refertatore TINYINT(1) NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      role ENUM('admin','refertatore','professionista') NOT NULL,
      professional_id VARCHAR(36) NULL,
      first_name VARCHAR(255) NULL,
      last_name VARCHAR(255) NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      specializzazione VARCHAR(255) NULL,
      avatar_path TEXT NULL,
      avatar_mime_type VARCHAR(128) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      must_change_password TINYINT(1) NOT NULL DEFAULT 0,
      two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
      two_factor_secret_encrypted TEXT NULL,
      two_factor_confirmed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      last_login_at DATETIME NULL,
      UNIQUE KEY uq_users_professional_id (professional_id),
      CONSTRAINT fk_users_professional
        FOREIGN KEY (professional_id) REFERENCES professionals(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS refertatore_assignments (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      tipo_referto ENUM('emg','psg') NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      CONSTRAINT fk_refertatore_assignments_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      CONSTRAINT uq_refertatore_assignment UNIQUE (user_id, tipo_referto)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      session_hash CHAR(64) NOT NULL,
      role ENUM('admin','refertatore','professionista') NOT NULL,
      csrf_token_hash CHAR(64) NULL,
      ip_address VARCHAR(128) NULL,
      user_agent VARCHAR(500) NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      last_seen_at DATETIME NULL,
      CONSTRAINT fk_auth_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      CONSTRAINT fk_password_reset_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      purpose ENUM('login_2fa','setup_2fa') NOT NULL,
      secret_encrypted TEXT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      CONSTRAINT fk_auth_challenges_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS user_recovery_codes (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      CONSTRAINT fk_user_recovery_codes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS report_drafts (
      id VARCHAR(36) PRIMARY KEY,
      tipo_referto ENUM(${quoted(ALLOWED_REPORT_TYPES)}) NOT NULL,
      stato ENUM(${quoted(ALLOWED_DRAFT_STATUSES)}) NOT NULL,
      paziente_nome VARCHAR(255) NULL,
      paziente_cognome VARCHAR(255) NULL,
      paziente_nome_completo VARCHAR(255) NULL,
      data_nascita VARCHAR(64) NULL,
      codice_fiscale VARCHAR(64) NULL,
      telefono VARCHAR(64) NULL,
      email VARCHAR(255) NULL,
      medico_refertatore VARCHAR(255) NULL,
      medico_refertatore_id VARCHAR(36) NULL,
      assigned_refertatore_id VARCHAR(36) NULL,
      assigned_refertatore_email VARCHAR(255) NULL,
      assigned_refertatore_name VARCHAR(255) NULL,
      assigned_refertatore_specializzazione VARCHAR(255) NULL,
      specializzazione VARCHAR(255) NULL,
      prestazione VARCHAR(255) NULL,
      data_esame VARCHAR(64) NULL,
      form_data_json JSON NOT NULL,
      schema_version INT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      completed_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS draft_attachments (
      id VARCHAR(36) PRIMARY KEY,
      draft_id VARCHAR(36) NOT NULL,
      kind VARCHAR(64) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NULL,
      mime_type VARCHAR(128) NOT NULL,
      size_bytes BIGINT NOT NULL,
      storage_path TEXT NOT NULL,
      drive_file_id VARCHAR(255) NULL,
      drive_web_view_link TEXT NULL,
      drive_folder_id VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      CONSTRAINT fk_draft_attachments_draft
        FOREIGN KEY (draft_id) REFERENCES report_drafts(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      role VARCHAR(64) NULL,
      action VARCHAR(128) NOT NULL,
      entity_type VARCHAR(128) NULL,
      entity_id VARCHAR(36) NULL,
      ip_address VARCHAR(128) NULL,
      user_agent VARCHAR(500) NULL,
      metadata_json JSON NULL,
      created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS draft_email_deliveries (
      id VARCHAR(36) PRIMARY KEY,
      draft_id VARCHAR(36) NOT NULL,
      sent_by_user_id VARCHAR(36) NOT NULL,
      recipient_email_masked VARCHAR(255) NOT NULL,
      recipient_email_hash CHAR(64) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      status ENUM('sent','failed') NOT NULL,
      error_message TEXT NULL,
      created_at DATETIME NOT NULL,
      CONSTRAINT fk_draft_email_deliveries_draft
        FOREIGN KEY (draft_id) REFERENCES report_drafts(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_draft_email_deliveries_user
        FOREIGN KEY (sent_by_user_id) REFERENCES users(id)
        ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
];

const INDEX_STATEMENTS = [
  "CREATE INDEX idx_professionals_active ON professionals (active)",
  "CREATE INDEX idx_professionals_visible_standard ON professionals (visible_in_standard)",
  "CREATE INDEX idx_professionals_sort_order ON professionals (sort_order, display_name)",
  "CREATE INDEX idx_users_role ON users (role)",
  "CREATE INDEX idx_users_active ON users (active)",
  "CREATE INDEX idx_users_professional_id ON users (professional_id)",
  "CREATE INDEX idx_assignments_user ON refertatore_assignments (user_id, active)",
  "CREATE INDEX idx_assignments_type ON refertatore_assignments (tipo_referto, active)",
  "CREATE INDEX idx_auth_sessions_user ON auth_sessions (user_id)",
  "CREATE INDEX idx_auth_sessions_expires ON auth_sessions (expires_at)",
  "CREATE INDEX idx_password_reset_expires ON password_reset_tokens (expires_at)",
  "CREATE INDEX idx_auth_challenges_user ON auth_challenges (user_id, purpose)",
  "CREATE INDEX idx_auth_challenges_expires ON auth_challenges (expires_at)",
  "CREATE INDEX idx_recovery_codes_user ON user_recovery_codes (user_id, used_at)",
  "CREATE INDEX idx_report_drafts_type ON report_drafts (tipo_referto)",
  "CREATE INDEX idx_report_drafts_status ON report_drafts (stato)",
  "CREATE INDEX idx_report_drafts_assigned_refertatore ON report_drafts (assigned_refertatore_id)",
  "CREATE INDEX idx_report_drafts_updated_at ON report_drafts (updated_at)",
  "CREATE INDEX idx_draft_attachments_draft ON draft_attachments (draft_id, kind)",
  "CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at)",
  "CREATE INDEX idx_audit_logs_action ON audit_logs (action)",
  "CREATE INDEX idx_draft_email_deliveries_draft ON draft_email_deliveries (draft_id, created_at)",
];

export async function initDatabase() {
  if (pool) {
    return pool;
  }

  fs.mkdirSync(resolveUploadsRoot(env.draftsUploadDir), { recursive: true });

  pool = mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    database: env.mysqlDatabase,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    connectionLimit: env.mysqlConnectionLimit,
    charset: "utf8mb4",
    namedPlaceholders: false,
    multipleStatements: true,
    supportBigNumbers: true,
    dateStrings: true,
    timezone: "Z",
  });

  await pool.query("SET time_zone = '+00:00'");
  await migrateDatabase();
  initWorker();
  return pool;
}

export async function migrateDatabase() {
  const activePool = pool || mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    database: env.mysqlDatabase,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    connectionLimit: env.mysqlConnectionLimit,
    charset: "utf8mb4",
    namedPlaceholders: false,
    multipleStatements: true,
    supportBigNumbers: true,
    dateStrings: true,
    timezone: "Z",
  });

  try {
    for (const statement of CREATE_TABLE_STATEMENTS) {
      await activePool.query(statement);
    }

    for (const statement of INDEX_STATEMENTS) {
      try {
        await activePool.query(statement);
      } catch (error) {
        if (!String(error?.message || "").includes("Duplicate key name")) {
          throw error;
        }
      }
    }
  } finally {
    if (!pool) {
      await activePool.end();
    }
  }
}

export async function closeDatabase() {
  if (worker) {
    await worker.terminate();
    worker = null;
    queryPort = null;
  }

  if (pool) {
    await pool.end();
    pool = null;
  }
}

export function initDraftsStore() {
  return initDatabase();
}

export function getDb() {
  if (!queryPort || !worker) {
    throw new Error("Database MySQL non inizializzato. Chiama initDatabase() prima dell'uso.");
  }

  return {
    exec(sql) {
      return runWorkerQuery("exec", sql, []);
    },
    prepare(sql) {
      return createStatement(sql);
    },
  };
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

function createStatement(sql) {
  return {
    run(...args) {
      return runWorkerQuery("run", sql, normalizeStatementArgs(args));
    },
    get(...args) {
      return runWorkerQuery("get", sql, normalizeStatementArgs(args));
    },
    all(...args) {
      return runWorkerQuery("all", sql, normalizeStatementArgs(args));
    },
  };
}

function normalizeStatementArgs(args) {
  if (args.length === 1 && isPlainObject(args[0])) {
    return args[0];
  }

  return args;
}

function initWorker() {
  if (worker && queryPort) {
    return;
  }

  const channel = new MessageChannel();
  queryPort = channel.port1;
  worker = new Worker(new URL("./mysql-worker.js", import.meta.url), {
    workerData: {
      host: env.mysqlHost,
      port: env.mysqlPort,
      database: env.mysqlDatabase,
      user: env.mysqlUser,
      password: env.mysqlPassword,
      connectionLimit: env.mysqlConnectionLimit,
    },
  });
  worker.postMessage({ type: "attachPort", port: channel.port2 }, [channel.port2]);
}

function runWorkerQuery(mode, sql, params) {
  const requestId = crypto.randomUUID();
  const signalBuffer = new SharedArrayBuffer(4);
  const signal = new Int32Array(signalBuffer);
  queryPort.postMessage({
    requestId,
    mode,
    sql,
    params,
    signalBuffer,
  });

  Atomics.wait(signal, 0, 0);
  const message = receiveMessageOnPort(queryPort)?.message;

  if (!message || message.requestId !== requestId) {
    throw new Error("Risposta database MySQL non valida.");
  }

  if (!message.ok) {
    const error = new Error(message.error?.message || "Errore MySQL.");
    error.code = message.error?.code;
    error.status = message.error?.status;
    throw error;
  }

  return message.result;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function quoted(values) {
  return values.map((value) => `'${value}'`).join(", ");
}
