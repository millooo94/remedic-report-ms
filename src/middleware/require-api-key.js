import { env } from "../config/env.js";

export function requireApiKey(req, res, next) {
  const apiKey = req.header("x-api-key");

  if (!env.pdfApiKey) {
    return res.status(500).send("Server misconfigured");
  }

  // Requests arrivano da un frontend browser: questa chiave va trattata come
  // un identificatore pubblico di compatibilita, non come un vero segreto.
  if (apiKey !== env.pdfApiKey) {
    return res.status(403).send("Forbidden");
  }

  next();
}
