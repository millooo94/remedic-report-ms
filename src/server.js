import { createApp } from "./app.js";
import { env, getDriveConfigStatus, getMissingDriveEnv } from "./config/env.js";
import { initDraftsStore } from "./db/sqlite.js";
import { initBrowserPool } from "./services/browser-pool.service.js";

export async function startServer() {
  initDraftsStore();
  const app = createApp();
  const missingDriveEnv = getMissingDriveEnv();

  app.listen(env.port, async () => {
    console.log(`Remedic Report MS attivo su porta ${env.port}`);
    console.log("Drive config status:", getDriveConfigStatus());
    console.log(`Drafts SQLite path: ${env.draftsDbPath}`);

    if (missingDriveEnv.length > 0) {
      console.warn(
        `Drive upload disabled: missing env vars: ${missingDriveEnv.join(", ")}`,
      );
    }

    await initBrowserPool();
  });
}
