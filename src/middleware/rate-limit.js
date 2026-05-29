const store = new Map();

function buildKey(req, scope, extra = "") {
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  return `${scope}:${ip}:${extra}`;
}

function consume(key, { limit, windowMs }) {
  const now = Date.now();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}

export function createRateLimitMiddleware({ scope, limit, windowMs, deriveExtraKey }) {
  return (req, res, next) => {
    const extra = deriveExtraKey ? deriveExtraKey(req) : "";
    const key = buildKey(req, scope, extra);
    const allowed = consume(key, { limit, windowMs });

    if (!allowed) {
      return res.status(429).json({
        error: "Hai effettuato troppi tentativi. Riprova tra qualche minuto.",
      });
    }

    next();
  };
}
