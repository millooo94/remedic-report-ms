import { AUDIT_ACTIONS, createAuditLog, listAuditLogs } from "../services/audit.service.js";
import { listDrafts } from "../services/drafts.service.js";
import {
  createUser,
  listUsers,
  updateUser,
  updateUserStatus,
} from "../services/users.service.js";

function handleError(res, error, fallbackMessage) {
  const status = Number(error?.status || 500);
  const message = status >= 500 ? fallbackMessage : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Admin error:", error?.message || error);
  }

  return res.status(status).json({ error: message });
}

export function listAdminUsersController(req, res) {
  try {
    return res.json({
      items: listUsers(req.query),
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento utenti.");
  }
}

export function createAdminUserController(req, res) {
  try {
    const user = createUser(req.body);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.REFERTATORE_CREATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { role: user.role, assignedTypes: user.assignedTypes },
    });
    return res.status(201).json(user);
  } catch (error) {
    return handleError(res, error, "Errore interno nella creazione utente.");
  }
}

export function updateAdminUserController(req, res) {
  try {
    const user = updateUser(req.params.id, req.body);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.REFERTATORE_UPDATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { role: user.role, assignedTypes: user.assignedTypes },
    });
    return res.json(user);
  } catch (error) {
    return handleError(res, error, "Errore interno nell'aggiornamento utente.");
  }
}

export function updateAdminUserStatusController(req, res) {
  try {
    const user = updateUserStatus(req.params.id, req.body?.active !== false);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.REFERTATORE_UPDATED,
      entityType: "user",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { active: user.active },
    });
    return res.json(user);
  } catch (error) {
    return handleError(res, error, "Errore interno nell'aggiornamento stato utente.");
  }
}

export function listAdminDraftsController(req, res) {
  try {
    return res.json(listDrafts({ ...req.query, scope: "active" }));
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento referti in lavorazione.");
  }
}

export function listAdminArchiveController(req, res) {
  try {
    return res.json(listDrafts({ ...req.query, scope: "archive" }));
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento archivio referti.");
  }
}

export function listAdminAuditLogsController(req, res) {
  try {
    return res.json(listAuditLogs(req.query));
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento audit log.");
  }
}
