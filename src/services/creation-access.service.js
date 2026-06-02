import { env } from "../config/env.js";
import { getDraftById } from "./drafts.service.js";

const ALL_REPORT_TYPES = ["standard", "emg", "psg"];

export function evaluateCreationAccess({ ipAddress, authUser, reportType = null }) {
  const normalizedType = normalizeReportType(reportType);
  const ipAllowed = isAllowedCreationIp(ipAddress);

  if (authUser?.role === "admin") {
    return {
      allowed: !normalizedType || ALL_REPORT_TYPES.includes(normalizedType),
      reason: "admin_allowed",
      allowedTypes: [...ALL_REPORT_TYPES],
    };
  }

  if (ipAllowed) {
    return {
      allowed: !normalizedType || ALL_REPORT_TYPES.includes(normalizedType),
      reason: "ip_allowed",
      allowedTypes: [...ALL_REPORT_TYPES],
    };
  }

  if (authUser?.role === "refertatore") {
    const allowedTypes = buildRefertatoreAllowedTypes(authUser);
    return {
      allowed:
        !normalizedType || allowedTypes.includes(normalizedType),
      reason: "refertatore_allowed",
      allowedTypes,
    };
  }

  return {
    allowed: false,
    reason: "denied",
    allowedTypes: [],
  };
}

export function isAllowedCreationIp(ipAddress) {
  const normalized = normalizeIp(ipAddress);
  return env.allowedCreationIps.includes(normalized);
}

export function resolveCreationReportType(req) {
  const direct =
    req.body?.tipo_referto ||
    req.body?.reportType ||
    req.query?.tipo_referto ||
    req.query?.reportType ||
    null;

  if (direct) {
    return normalizeReportType(direct);
  }

  if (req.params?.id) {
    try {
      return getDraftById(req.params.id)?.tipo_referto || "standard";
    } catch {
      return "standard";
    }
  }

  return "standard";
}

function buildRefertatoreAllowedTypes(authUser) {
  const assignedTypes = Array.isArray(authUser?.assignedTypes)
    ? authUser.assignedTypes.filter((item) => item === "emg" || item === "psg")
    : [];

  return [...new Set(["standard", ...assignedTypes])];
}

function normalizeIp(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function normalizeReportType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "emg" || normalized === "psg" || normalized === "standard") {
    return normalized;
  }
  return null;
}
