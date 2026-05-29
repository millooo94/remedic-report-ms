import { env } from "../config/env.js";
import { getSessionUser } from "../services/auth.service.js";
import { getDraftById } from "../services/drafts.service.js";

function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  return raw.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

export function requireNeurologistAuth(req, res, next) {
  const cookies = parseCookies(req);
  const sessionValue = cookies[env.authSessionCookieName];
  const sessionUser = getSessionUser(sessionValue);

  if (!sessionUser || (sessionUser.user.role !== "refertatore" && sessionUser.user.role !== "admin")) {
    return res.status(401).json({
      error: "Sessione area riservata mancante o non valida.",
    });
  }

  req.authUser = sessionUser.user;
  req.authSession = sessionUser.session;
  req.authCookies = cookies;
  next();
}

export function requireDraftReadAccess(req, res, next) {
  const apiKey = String(req.header("x-api-key") || "").trim();

  if (env.pdfApiKey && apiKey === env.pdfApiKey) {
    return next();
  }

  return requireNeurologistAuth(req, res, () => {
    if (!req.params?.id) {
      return next();
    }

    try {
      const draft = getDraftById(req.params.id);
      if (
        req.authUser?.role === "admin" ||
        draft.summary.assigned_refertatore_id === req.authUser?.id
      ) {
        return next();
      }

      return res.status(403).json({
        error: "Il referto non e assegnato a questo refertatore.",
      });
    } catch (error) {
      const status = Number(error?.status || 500);
      return res.status(status).json({
        error: error?.message || "Errore accesso allegato bozza.",
      });
    }
  });
}

export function requireDraftWriteAccess(req, res, next) {
  return requireDraftReadAccess(req, res, next);
}
