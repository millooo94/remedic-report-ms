import { env } from "../config/env.js";
import { getSessionUser } from "../services/auth.service.js";
import { evaluateCreationAccess, resolveCreationReportType } from "../services/creation-access.service.js";

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

export function getCreationAccessController(req, res) {
  const cookies = parseCookies(req);
  const sessionValue = cookies[env.authSessionCookieName];
  const sessionUser = sessionValue ? getSessionUser(sessionValue) : null;
  const access = evaluateCreationAccess({
    ipAddress: req.ip,
    authUser: sessionUser?.user || null,
    reportType: resolveCreationReportType(req),
  });

  return res.json(access);
}
