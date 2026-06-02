import { env } from "../config/env.js";
import { getSessionUser } from "../services/auth.service.js";
import { AUDIT_ACTIONS, createAuditLog } from "../services/audit.service.js";
import {
  evaluateCreationAccess,
  resolveCreationReportType,
} from "../services/creation-access.service.js";

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

export function requireCreationAccess(req, res, next) {
  const cookies = parseCookies(req);
  const sessionValue = cookies[env.authSessionCookieName];
  const sessionUser = sessionValue ? getSessionUser(sessionValue) : null;
  const reportType = resolveCreationReportType(req);
  const access = evaluateCreationAccess({
    ipAddress: req.ip,
    authUser: sessionUser?.user || null,
    reportType,
  });

  if (!access.allowed) {
    createAuditLog({
      userId: sessionUser?.user?.id || null,
      role: sessionUser?.user?.role || null,
      action: AUDIT_ACTIONS.CREATION_ACCESS_DENIED,
      entityType: "creation_access",
      entityId: null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        reportType,
      },
    });
    return res.status(403).json({
      error:
        "La creazione dei referti e consentita solo da postazioni autorizzate o da utenti abilitati.",
      allowed: false,
      allowedTypes: [],
    });
  }

  if (sessionUser) {
    req.authUser = sessionUser.user;
    req.authSession = sessionUser.session;
    req.authCookies = cookies;
  }

  createAuditLog({
    userId: sessionUser?.user?.id || null,
    role: sessionUser?.user?.role || null,
    action:
      access.reason === "ip_allowed" || access.reason === "admin_allowed"
        ? AUDIT_ACTIONS.CREATION_ACCESS_GRANTED_IP
        : AUDIT_ACTIONS.CREATION_ACCESS_GRANTED_REFERTATORE,
    entityType: "creation_access",
    entityId: null,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      reportType,
      allowedTypes: access.allowedTypes,
    },
  });

  req.creationAccess = access;
  next();
}
