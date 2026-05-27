import express from "express";
import { corsMiddleware } from "./middleware/cors.js";
import healthRoutes from "./routes/health.routes.js";
import pdfRoutes from "./routes/pdf.routes.js";

export function createApp() {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json({ limit: "5mb" }));

  app.use(healthRoutes);
  app.use(pdfRoutes);

  return app;
}
