import {
  createProfessional,
  getProfessionalById,
  listProfessionals,
  updateProfessional,
  updateProfessionalStatus,
} from "../services/professionals.service.js";
import { AUDIT_ACTIONS, createAuditLog } from "../services/audit.service.js";
import { listRefertatoriByType } from "../services/users.service.js";

function handleError(res, error, fallbackMessage) {
  const status = Number(error?.status || 500);
  const message = status >= 500 ? fallbackMessage : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Professionals error:", error?.message || error);
  }

  return res.status(status).json({ error: message });
}

export function listOperationalProfessionalsController(req, res) {
  try {
    const items = listProfessionals({
      activeOnly: true,
      visibleInStandardOnly: true,
    });
    return res.json({ items });
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento professionisti.");
  }
}

export function listOperationalRefertatoriController(req, res) {
  try {
    const tipoReferto = String(req.query?.tipo_referto || "").trim();
    if (tipoReferto !== "emg" && tipoReferto !== "psg") {
      return res.status(400).json({ error: "tipo_referto non valido." });
    }
    return res.json({ items: listRefertatoriByType(tipoReferto) });
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento refertatori.");
  }
}

export function listAdminProfessionalsController(req, res) {
  try {
    return res.json({
      items: listProfessionals({ activeOnly: false, visibleInStandardOnly: false }),
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento professionisti.");
  }
}

export function getProfessionalController(req, res) {
  try {
    return res.json(getProfessionalById(req.params.id));
  } catch (error) {
    return handleError(res, error, "Errore interno nel caricamento professionista.");
  }
}

export function createProfessionalController(req, res) {
  try {
    const professional = createProfessional(req.body);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.PROFESSIONAL_CREATED,
      entityType: "professional",
      entityId: professional.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.status(201).json(professional);
  } catch (error) {
    return handleError(res, error, "Errore interno nella creazione professionista.");
  }
}

export function updateProfessionalController(req, res) {
  try {
    const professional = updateProfessional(req.params.id, req.body);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.PROFESSIONAL_UPDATED,
      entityType: "professional",
      entityId: professional.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return res.json(professional);
  } catch (error) {
    return handleError(res, error, "Errore interno nell'aggiornamento professionista.");
  }
}

export function updateProfessionalStatusController(req, res) {
  try {
    const professional = updateProfessionalStatus(req.params.id, req.body?.active !== false);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.PROFESSIONAL_UPDATED,
      entityType: "professional",
      entityId: professional.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        active: professional.active,
      },
    });
    return res.json(professional);
  } catch (error) {
    return handleError(res, error, "Errore interno nell'aggiornamento stato professionista.");
  }
}
