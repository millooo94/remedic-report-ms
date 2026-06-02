import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { getDb, resolveUploadsRoot } from "../db/sqlite.js";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "./password.service.js";
import { getProfessionalById } from "./professionals.service.js";
import {
  canAssignRefertatoreToType,
  isCompatibleRefertatoreSpecialization,
} from "../constants/professional-taxonomy.js";

function createHttpError(status, message, fieldErrors = null) {
  const error = new Error(message);
  error.status = status;
  if (fieldErrors && typeof fieldErrors === "object") {
    error.fieldErrors = fieldErrors;
  }
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
          p.display_name AS professional_display_name,
          p.specializzazione AS professional_specializzazione,
          GROUP_CONCAT(CASE WHEN a.active = 1 THEN a.tipo_referto END) AS assigned_types
        FROM users u
        LEFT JOIN professionals p
          ON p.id = u.professional_id
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
          p.display_name AS professional_display_name,
          p.specializzazione AS professional_specializzazione,
          GROUP_CONCAT(CASE WHEN a.active = 1 THEN a.tipo_referto END) AS assigned_types
        FROM users u
        LEFT JOIN professionals p
          ON p.id = u.professional_id
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

export function getUserPasswordHashById(id) {
  const row = getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(id);

  if (!row?.password_hash) {
    throw createHttpError(404, "Utente non trovato.");
  }

  return row.password_hash;
}

export function createUser(payload) {
  const normalized = normalizeUserPayload(payload, true);
  const db = getDb();
  const now = new Date().toISOString();

  if (getUserByEmail(normalized.email)) {
    throw createHttpError(409, "Esiste gia un utente con questa email.", {
      email: "Esiste gia un refertatore con questa email.",
    });
  }

  if (normalized.role === "refertatore" && normalized.professional_id) {
    const existingProfessionalLink = db
      .prepare("SELECT id FROM users WHERE professional_id = ?")
      .get(normalized.professional_id);
    if (existingProfessionalLink) {
      throw createHttpError(
        409,
        "Questo professionista e gia configurato come refertatore.",
        {
          professional_id:
            "Questo professionista e gia configurato come refertatore.",
        },
      );
    }
  }

  db.prepare(
    `
      INSERT INTO users (
        id,
        role,
        professional_id,
        first_name,
        last_name,
        email,
        password_hash,
        display_name,
        specializzazione,
        avatar_path,
        avatar_mime_type,
        active,
        must_change_password,
        created_at,
        updated_at,
        last_login_at
      ) VALUES (
        @id,
        @role,
        @professional_id,
        @first_name,
        @last_name,
        @email,
        @password_hash,
        @display_name,
        @specializzazione,
        @avatar_path,
        @avatar_mime_type,
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
    professional_id: normalized.professional_id,
    first_name: normalized.first_name,
    last_name: normalized.last_name,
    email: normalized.email,
    password_hash: normalized.password_hash,
    display_name: normalized.display_name,
    specializzazione: normalized.specializzazione,
    avatar_path: normalized.avatar_path,
    avatar_mime_type: normalized.avatar_mime_type,
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
      first_name: payload.first_name ?? current.first_name,
      last_name: payload.last_name ?? current.last_name,
      email: payload.email ?? current.email,
      display_name: payload.display_name ?? current.display_name,
      specializzazione: payload.specializzazione ?? current.specializzazione,
      role: payload.role ?? current.role,
      active: payload.active ?? current.active,
      must_change_password:
        payload.must_change_password ?? current.must_change_password,
      assignedTypes: payload.assignedTypes ?? current.assignedTypes,
      avatar_path: current.avatar_path,
      avatar_mime_type: current.avatar_mime_type,
    },
    false,
  );
  const db = getDb();
  const now = new Date().toISOString();

  const conflict = db
    .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
    .get(normalized.email, id);
  if (conflict) {
    throw createHttpError(409, "Esiste gia un utente con questa email.", {
      email: "Esiste gia un refertatore con questa email.",
    });
  }

  if (
    current.role === "refertatore" &&
    current.professional_id &&
    normalized.professional_id !== current.professional_id
  ) {
    throw createHttpError(
      400,
      "Non e possibile cambiare il professionista collegato dopo la creazione del refertatore.",
      {
        professional_id:
          "Non e possibile cambiare il professionista collegato dopo la creazione del refertatore.",
      },
    );
  }

  if (normalized.role === "refertatore" && normalized.professional_id) {
    const existingProfessionalLink = db
      .prepare("SELECT id FROM users WHERE professional_id = ? AND id != ?")
      .get(normalized.professional_id, id);
    if (existingProfessionalLink) {
      throw createHttpError(
        409,
        "Questo professionista e gia configurato come refertatore.",
        {
          professional_id:
            "Questo professionista e gia configurato come refertatore.",
        },
      );
    }
  }

  db.prepare(
    `
      UPDATE users
      SET
        role = @role,
        professional_id = @professional_id,
        first_name = @first_name,
        last_name = @last_name,
        email = @email,
        password_hash = COALESCE(@password_hash, password_hash),
        display_name = @display_name,
        specializzazione = @specializzazione,
        avatar_path = @avatar_path,
        avatar_mime_type = @avatar_mime_type,
        active = @active,
        must_change_password = @must_change_password,
        updated_at = @updated_at
      WHERE id = @id
    `,
  ).run({
    id,
    role: normalized.role,
    professional_id: normalized.professional_id,
    first_name: normalized.first_name,
    last_name: normalized.last_name,
    email: normalized.email,
    password_hash: normalized.password_hash || null,
    display_name: normalized.display_name,
    specializzazione: normalized.specializzazione,
    avatar_path: normalized.avatar_path,
    avatar_mime_type: normalized.avatar_mime_type,
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
    throw createHttpError(400, validationError, {
      password: validationError,
    });
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

export function verifyUserPasswordById(id, password) {
  return verifyPassword(password, getUserPasswordHashById(id));
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

export function updateOwnProfile(userId, payload) {
  const current = getUserById(userId);
  const firstName = normalizeNullableString(
    payload?.first_name ?? payload?.firstName ?? current.first_name,
  );
  const lastName = normalizeNullableString(
    payload?.last_name ?? payload?.lastName ?? current.last_name,
  );
  const email = String(payload?.email ?? current.email ?? "")
    .trim()
    .toLowerCase();
  const displayName = String(
    payload?.display_name ?? payload?.displayName ?? current.display_name ?? "",
  ).trim();

  if (!email) {
    throw createHttpError(400, "email obbligatoria.", {
      email: "L'email e obbligatoria.",
    });
  }

  if (!displayName) {
    throw createHttpError(400, "display_name obbligatorio.", {
      display_name: "Il nome visualizzato e obbligatorio.",
    });
  }

  const existing = getDb()
    .prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?")
    .get(email, userId);

  if (existing) {
    throw createHttpError(409, "Esiste gia un utente con questa email.", {
      email: "Esiste gia un account con questa email.",
    });
  }

  getDb()
    .prepare(
      `
        UPDATE users
        SET
          first_name = @first_name,
          last_name = @last_name,
          email = @email,
          display_name = @display_name,
          updated_at = @updated_at
        WHERE id = @id
      `,
    )
    .run({
      id: userId,
      first_name: firstName,
      last_name: lastName,
      email,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    });

  return getUserById(userId);
}

export function saveUserAvatar(userId, payload) {
  const user = getUserById(userId);
  const mimeType = String(payload?.mimeType || "").trim().toLowerCase();
  const fileName = String(payload?.fileName || "").trim() || "avatar";
  const base64 = String(payload?.base64 || "").trim();
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  if (!allowedMimeTypes.has(mimeType) || !base64) {
    throw createHttpError(400, "Avatar non valido.", {
      avatar: "Seleziona un'immagine JPG, PNG o WEBP valida.",
    });
  }

  const buffer = decodeBase64ToBuffer(base64, "avatar");
  if (buffer.byteLength > 2 * 1024 * 1024) {
    throw createHttpError(400, "Avatar troppo grande.", {
      avatar: "L'immagine profilo non puo superare 2 MB.",
    });
  }

  const uploadsRoot = resolveUploadsRoot(env.draftsUploadDir);
  const extension = avatarExtensionForMime(mimeType, fileName);
  const relativePath = path.join("profiles", "avatars", `${user.id}.${extension}`);
  const absolutePath = path.join(uploadsRoot, relativePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, buffer);

  getDb()
    .prepare(
      `
        UPDATE users
        SET
          avatar_path = @avatar_path,
          avatar_mime_type = @avatar_mime_type,
          updated_at = @updated_at
        WHERE id = @id
      `,
    )
    .run({
      id: user.id,
      avatar_path: relativePath,
      avatar_mime_type: mimeType,
      updated_at: new Date().toISOString(),
    });

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

  return rows
    .filter((row) =>
      canAssignRefertatoreToType(row.specializzazione, tipoReferto),
    )
    .map((row) => ({
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
  const firstName = normalizeNullableString(payload?.first_name || payload?.firstName);
  const lastName = normalizeNullableString(payload?.last_name || payload?.lastName);
  const specializzazione = normalizeNullableString(payload?.specializzazione);
  const password = payload?.password == null ? "" : String(payload.password);
  const assignedTypes = normalizeAssignedTypes(payload?.assignedTypes);
  const professionalId = normalizeNullableString(
    payload?.professional_id || payload?.professionalId,
  );

  if (role !== "admin" && role !== "refertatore") {
    throw createHttpError(400, "role non valido.");
  }

  if (role === "admin" && !email) {
    throw createHttpError(400, "email obbligatoria.", {
      email: "L'email e obbligatoria.",
    });
  }

  if (role === "admin" && !displayName) {
    throw createHttpError(400, "display_name obbligatorio.", {
      display_name: "Il nome visualizzato e obbligatorio.",
    });
  }

  let professional = null;
  if (role === "refertatore") {
    if (!professionalId) {
      throw createHttpError(
        400,
        "Seleziona un professionista esistente per creare il refertatore.",
        {
          professional_id:
            "Seleziona un professionista esistente per creare il refertatore.",
        },
      );
    }

    professional = getProfessionalById(professionalId);

    if (!professional.active) {
      throw createHttpError(400, "Il professionista selezionato non e attivo.", {
        professional_id: "Il professionista selezionato non e attivo.",
      });
    }

    if (!isCompatibleRefertatoreSpecialization(professional.specializzazione)) {
      throw createHttpError(
        400,
        "Il professionista selezionato non puo essere configurato come refertatore per specializzazione non compatibile.",
        {
          professional_id:
            "Questo professionista non e compatibile con le aree EMG o PSG.",
        },
      );
    }

    if (assignedTypes.length === 0) {
      throw createHttpError(
        400,
        "Assegna almeno una tipologia EMG o PSG al refertatore.",
        {
          assignedTypes:
            "Seleziona almeno una assegnazione EMG o PSG per il refertatore.",
        },
      );
    }

    assignedTypes.forEach((tipoReferto) => {
      if (!canAssignRefertatoreToType(professional.specializzazione, tipoReferto)) {
        throw createHttpError(
          400,
          "Il professionista selezionato non puo essere assegnato a EMG/PSG per specializzazione non compatibile.",
          {
            assignedTypes:
              "Le assegnazioni scelte non sono compatibili con la specializzazione del professionista.",
          },
        );
      }
    });
  }

  let passwordHash = null;
  if (requirePassword || password) {
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      throw createHttpError(400, passwordError, {
        password: passwordError,
      });
    }
    passwordHash = hashPassword(password);
  }

  const effectiveEmail =
    normalizeNullableString(payload?.email) ||
    professional?.email ||
    null;
  const effectiveDisplayName = professional?.display_name || displayName;
  const effectiveSpecializzazione =
    professional?.specializzazione || specializzazione;

  if (!effectiveEmail) {
    throw createHttpError(400, "email obbligatoria.", {
      email: "L'email e obbligatoria.",
    });
  }

  return {
    id: payload?.id || crypto.randomUUID(),
    role,
    professional_id: professionalId,
    first_name: firstName,
    last_name: lastName,
    email: effectiveEmail.toLowerCase(),
    password_hash: passwordHash,
    display_name: effectiveDisplayName,
    specializzazione: effectiveSpecializzazione,
    avatar_path: normalizeNullableString(payload?.avatar_path) || null,
    avatar_mime_type: normalizeNullableString(payload?.avatar_mime_type) || null,
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
    professional_id: row.professional_id || null,
    professional_display_name: row.professional_display_name || null,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    email: row.email,
    display_name: row.display_name,
    specializzazione: row.specializzazione,
    avatar_path: row.avatar_path || null,
    avatar_mime_type: row.avatar_mime_type || null,
    avatar_data_url: buildAvatarDataUrl(row.avatar_path, row.avatar_mime_type),
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

function decodeBase64ToBuffer(base64, label) {
  try {
    return Buffer.from(base64, "base64");
  } catch {
    throw createHttpError(400, `Contenuto ${label} non valido.`);
  }
}

function avatarExtensionForMime(mimeType, fileName) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  const ext = String(fileName || "").split(".").pop()?.toLowerCase();
  return ext || "jpg";
}

function buildAvatarDataUrl(storagePath, mimeType) {
  if (!storagePath || !mimeType) {
    return null;
  }

  try {
    const absolutePath = path.join(resolveUploadsRoot(env.draftsUploadDir), storagePath);
    if (!fs.existsSync(absolutePath)) {
      return null;
    }

    return `data:${mimeType};base64,${fs.readFileSync(absolutePath).toString("base64")}`;
  } catch {
    return null;
  }
}
