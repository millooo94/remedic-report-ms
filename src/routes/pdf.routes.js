import { Router } from "express";
import { requireCreationAccess } from "../middleware/require-creation-access.js";
import { requireApiKey } from "../middleware/require-api-key.js";
import { validatePdfRequest } from "../middleware/validate-pdf-request.js";
import {
  generatePdfController,
  generatePdfPreviewController,
} from "../controllers/pdf.controller.js";

const router = Router();

router.post("/pdf", requireApiKey, requireCreationAccess, validatePdfRequest, generatePdfController);
router.post(
  "/pdf/preview",
  requireApiKey,
  validatePdfRequest,
  generatePdfPreviewController,
);

export default router;
