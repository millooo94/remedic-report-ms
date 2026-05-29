import { initDraftsStore } from "../src/db/sqlite.js";
import { getUserByEmail, createUser, updateUser } from "../src/services/users.service.js";

initDraftsStore();

const args = parseArgs(process.argv.slice(2));
const role = String(args.role || "").trim().toLowerCase();
const email = normalizeEmail(args.email);
const password = String(args.password || "");
const displayName = String(args.name || args.displayName || "").trim();
const specializzazione = String(args.specializzazione || "").trim();
const assignedTypes = String(args.assigned || args.assignedTypes || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

if (!role || !email || !password || !displayName) {
  console.error(
    "Uso: npm run user:upsert -- --role <admin|refertatore> --email <email> --password <password> --name <nome> [--specializzazione Neurologia] [--assigned emg,psg]",
  );
  process.exit(1);
}

if (role !== "admin" && role !== "refertatore") {
  console.error("role deve essere admin oppure refertatore.");
  process.exit(1);
}

const existing = getUserByEmail(email);

if (existing) {
  const updated = updateUser(existing.id, {
    role,
    email,
    password,
    display_name: displayName,
    specializzazione: specializzazione || null,
    active: true,
    assignedTypes: role === "refertatore" ? assignedTypes : [],
  });
  console.log(`Utente aggiornato: ${updated.email} (${updated.role})`);
  process.exit(0);
}

const created = createUser({
  role,
  email,
  password,
  display_name: displayName,
  specializzazione: specializzazione || null,
  active: true,
  must_change_password: role === "admin" ? 0 : 1,
  assignedTypes: role === "refertatore" ? assignedTypes : [],
});
console.log(`Utente creato: ${created.email} (${created.role})`);

function parseArgs(argv) {
  const result = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      positional.push(current);
      continue;
    }

    const [rawKey, inlineValue] = current.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      result[rawKey] = inlineValue;
      continue;
    }

    result[rawKey] = argv[index + 1];
    index += 1;
  }

  if (!result.role && positional[0]) result.role = positional[0];
  if (!result.email && positional[1]) result.email = positional[1];
  if (!result.password && positional[2]) result.password = positional[2];
  if (!result.name && positional.length >= 4) {
    result.name = positional.slice(3).join(" ");
  }

  return result;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
