export function escapeDriveQuery(str) {
  return str.replace(/'/g, "\\'");
}

export function normalizeName(str) {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ");
}

export function normalizeDoctorName(name) {
  name = normalizeName(name);
  name = name.replace(/^dr\.?/i, "").trim();
  return `Dr. ${name}`;
}
