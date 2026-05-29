import "../src/db/sqlite.js";
import { createUser, getUserByEmail, updateUser } from "../src/services/users.service.js";

const args = parseArgs(process.argv.slice(2));
const email = normalizeEmail(args.email);
const password = String(args.password || "");
const displayName = String(args.name || "").trim();
const specializzazione = String(args.specializzazione || "Neurologia").trim();

if (!email || !password || !displayName) {
  console.error(
    "Uso: npm run neurologist:upsert -- --email <email> --password <password> --name <nome>",
  );
  process.exit(1);
}

const existing = getUserByEmail(email);

if (existing) {
  updateUser(existing.id, {
    role: "refertatore",
    email,
    password,
    display_name: displayName,
    specializzazione,
    active: true,
    assignedTypes: ["emg", "psg"],
  });
  console.log(`Refertatore aggiornato: ${email}`);
  process.exit(0);
}

createUser({
  role: "refertatore",
  email,
  password,
  display_name: displayName,
  specializzazione,
  active: true,
  assignedTypes: ["emg", "psg"],
});

console.log(`Refertatore creato: ${email}`);

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

  if (!result.email && positional[0]) {
    result.email = positional[0];
  }

  if (!result.password && positional[1]) {
    result.password = positional[1];
  }

  if (!result.name && positional.length >= 3) {
    result.name = positional.slice(2).join(" ");
  }

  return result;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
