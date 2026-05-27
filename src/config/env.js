import fs from "node:fs";
import path from "node:path";

const LOCAL_ENV_FILES = [".env.local", ".env"];
const DRIVE_ENV_KEYS = [
  "ROOT_FOLDER",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
];
const DEFAULT_LOCAL_ORIGINS = ["http://localhost:4200", "http://127.0.0.1:4200"];

loadLocalEnvFiles();

const frontendUrl =
  process.env.FRONTEND_URL?.trim() || "https://report.remedic.it";
const configuredCorsOrigins = parseOrigins(process.env.CORS_ORIGIN);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4010),
  rootFolder: process.env.ROOT_FOLDER?.trim() || "",
  pdfApiKey: process.env.PDF_API_KEY || "",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  driveDebug:
    process.env.DRIVE_DEBUG === "true" || process.env.DRIVE_DEBUG === "1",
  chromiumPath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  pagePoolSize: Number(process.env.PAGE_POOL_SIZE || 5),
  frontendUrl,
  corsOrigin: process.env.CORS_ORIGIN || "",
  allowedOrigins: buildAllowedOrigins(frontendUrl, configuredCorsOrigins),
};

export function getMissingEnv(keys) {
  return keys.filter((key) => !process.env[key]?.trim());
}

export function getMissingDriveEnv() {
  return getMissingEnv(DRIVE_ENV_KEYS);
}

export function getDriveConfigStatus() {
  return {
    rootFolder: env.rootFolder,
    driveDebug: env.driveDebug,
    hasGoogleClientId: Boolean(env.googleClientId),
    hasGoogleClientSecret: Boolean(env.googleClientSecret),
    hasGoogleRefreshToken: Boolean(env.googleRefreshToken),
    missingDriveEnv: getMissingDriveEnv(),
  };
}

function buildAllowedOrigins(frontendUrl, configuredOrigins) {
  const origins = [...DEFAULT_LOCAL_ORIGINS];

  if (frontendUrl) {
    origins.push(frontendUrl);
  }

  origins.push(...configuredOrigins);
  return [...new Set(origins.map((origin) => origin.trim()).filter(Boolean))];
}

function parseOrigins(rawOrigins) {
  if (!rawOrigins?.trim()) {
    return [];
  }

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function loadLocalEnvFiles() {
  for (const fileName of LOCAL_ENV_FILES) {
    const filePath = path.resolve(process.cwd(), fileName);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(filePath);
      continue;
    }

    loadEnvFileFallback(filePath);
  }
}

function loadEnvFileFallback(filePath) {
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (process.env[key] !== undefined) {
      continue;
    }

    let value = rawValue.trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
