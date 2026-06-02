import {
  createProfessional,
  deleteProfessional,
  getProfessionalById,
  listProfessionals,
  updateProfessional,
  updateProfessionalStatus,
} from "../services/professionals.service.js";
import { AUDIT_ACTIONS, createAuditLog } from "../services/audit.service.js";
import { listRefertatoriByType, upsertProfessionalReservedUser } from "../services/users.service.js";

function handleError(res, error, fallbackMessage) {
  const status = Number(error?.status || 500);
  const message = status >= 500 ? fallbackMessage : error.message || "Richiesta non valida.";

  if (status >= 500) {
    console.error("Professionals error:", error?.message || error);
  }

  return res.status(status).json({
    error: message,
    message,
    ...(error?.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
  });
}

export function listOperationalProfessionalsController(req, res) {
  try {
    const items = listProfessionals({
      activeOnly: req.query?.active === "0" ? false : true,
      visibleInStandardOnly:
        req.query?.visible_in_standard === "1" ||
        req.query?.visibleInStandard === "1",
      q: req.query?.q || "",
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
      items: listProfessionals({
        activeOnly:
          req.query?.active === undefined ? true : req.query?.active !== "0",
        visibleInStandardOnly: false,
        q: req.query?.q || "",
      }),
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
    syncProfessionalReservedAreaIfRequested(professional, req.body, true);
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
    syncProfessionalReservedAreaIfRequested(professional, req.body, false);
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
      action: professional.active ? AUDIT_ACTIONS.PROFESSIONAL_UPDATED : AUDIT_ACTIONS.PROFESSIONAL_DISABLED,
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

export function deleteProfessionalController(req, res) {
  try {
    const professional = deleteProfessional(req.params.id);
    createAuditLog({
      userId: req.authUser?.id,
      role: req.authUser?.role,
      action: AUDIT_ACTIONS.PROFESSIONAL_DISABLED,
      entityType: "professional",
      entityId: professional.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        active: professional.active,
      },
    });
    return res.json({
      ok: true,
      professional,
      message: "Professionista disattivato. I referti storici restano conservati.",
    });
  } catch (error) {
    return handleError(res, error, "Errore interno nella disattivazione professionista.");
  }
}

function syncProfessionalReservedAreaIfRequested(professional, payload, isCreate) {
  const shouldCreateReservedArea =
    payload?.create_reserved_area === true ||
    payload?.create_reserved_area === 1 ||
    payload?.create_reserved_area === "1";

  if (!shouldCreateReservedArea && !professional?.reserved_user_id) {
    return professional;
  }

  return upsertProfessionalReservedUser(professional.id, {
    email: payload?.reserved_email ?? professional.email,
    password: String(payload?.reserved_password || ""),
    active: professional.active,
    mustChangePassword: isCreate || !!String(payload?.reserved_password || "").trim(),
  });
}
