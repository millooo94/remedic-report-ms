import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";
import { migrateDatabase } from "../src/db/mysql.js";

const TABLES = [
  "draft_email_deliveries",
  "audit_logs",
  "draft_attachments",
  "report_drafts",
  "user_recovery_codes",
  "auth_challenges",
  "password_reset_tokens",
  "auth_sessions",
  "refertatore_assignments",
  "users",
  "professionals",
];

async function main() {
  const pool = mysql.createPool({
    host: env.mysqlHost,
    port: env.mysqlPort,
    database: env.mysqlDatabase,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    connectionLimit: 2,
    charset: "utf8mb4",
    multipleStatements: true,
    timezone: "Z",
  });

  try {
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of TABLES) {
      await pool.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    await pool.end();
    await migrateDatabase();
    console.log("MySQL fresh schema recreated.");
  } catch (error) {
    await pool.end();
    throw error;
  }
}

main().catch((error) => {
  console.error("MySQL fresh failed:", error);
  process.exitCode = 1;
});
