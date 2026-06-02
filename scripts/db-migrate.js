import { closeDatabase, initDatabase, migrateDatabase } from "../src/db/mysql.js";

async function main() {
  await initDatabase();
  await migrateDatabase();
  console.log("MySQL migration completed.");
  await closeDatabase();
}

main().catch((error) => {
  console.error("MySQL migration failed:", error);
  process.exitCode = 1;
});
