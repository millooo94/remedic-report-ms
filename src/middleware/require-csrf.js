import { env } from "../config/env.js";
import { verifyCsrfForSession } from "../services/auth.service.js";

export function requireCsrf(req, res, next) {
  if (!req.authSession) {
    return res.status(401).json({ error: "Autenticazione richiesta." });
  }

  const csrfHeader = String(req.headers["x-csrf-token"] || "").trim();
  const csrfCookie = String(req.authCookies?.[env.authCsrfCookieName] || "").trim();

  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return res.status(403).json({ error: "Token CSRF non valido." });
  }

  if (!verifyCsrfForSession(req.authSession.id, csrfHeader)) {
    return res.status(403).json({ error: "Token CSRF non valido." });
  }

  next();
}
