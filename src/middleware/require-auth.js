import { env } from "../config/env.js";
import { getSessionUser } from "../services/auth.service.js";

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

export function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const sessionValue = cookies[env.authSessionCookieName];
  const sessionUser = getSessionUser(sessionValue);

  if (!sessionUser) {
    return res.status(401).json({ error: "Sessione non valida o scaduta." });
  }

  req.authUser = sessionUser.user;
  req.authSession = sessionUser.session;
  req.authCookies = cookies;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.authUser) {
      return res.status(401).json({ error: "Autenticazione richiesta." });
    }

    if (!roles.includes(req.authUser.role)) {
      return res.status(403).json({ error: "Permessi insufficienti." });
    }

    next();
  };
}
