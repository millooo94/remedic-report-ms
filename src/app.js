import express from "express";
import { env } from "./config/env.js";
import { corsMiddleware } from "./middleware/cors.js";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import creationAccessRoutes from "./routes/creation-access.routes.js";
import draftsRoutes from "./routes/drafts.routes.js";
import healthRoutes from "./routes/health.routes.js";
import pdfRoutes from "./routes/pdf.routes.js";
import professionalsRoutes from "./routes/professionals.routes.js";
import refertatoreRoutes from "./routes/refertatore.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", env.trustProxy);

  app.use(corsMiddleware);
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use(authRoutes);
  app.use(adminRoutes);
  app.use(creationAccessRoutes);
  app.use(healthRoutes);
  app.use(draftsRoutes);
  app.use(pdfRoutes);
  app.use(professionalsRoutes);
  app.use(refertatoreRoutes);

  return app;
}
