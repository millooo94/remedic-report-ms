import { createApp } from "./app.js";
import { env, getDriveConfigStatus, getMissingDriveEnv } from "./config/env.js";
import { initDatabase } from "./db/mysql.js";
import { initBrowserPool } from "./services/browser-pool.service.js";

export async function startServer() {
  await initDatabase();
  const app = createApp();
  const missingDriveEnv = getMissingDriveEnv();

  app.listen(env.port, async () => {
    console.log(`Remedic Report MS attivo su porta ${env.port}`);
    console.log("Drive config status:", getDriveConfigStatus());
    console.log(
      `MySQL connected: ${env.mysqlUser}@${env.mysqlHost}:${env.mysqlPort}/${env.mysqlDatabase}`,
    );

    if (missingDriveEnv.length > 0) {
      console.warn(
        `Drive upload disabled: missing env vars: ${missingDriveEnv.join(", ")}`,
      );
    }

    await initBrowserPool();
  });
}
