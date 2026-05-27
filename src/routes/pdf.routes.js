import { Router } from "express";
import { requireApiKey } from "../middleware/require-api-key.js";
import { validatePdfRequest } from "../middleware/validate-pdf-request.js";
import { generatePdfController } from "../controllers/pdf.controller.js";

const router = Router();

router.post("/pdf", requireApiKey, validatePdfRequest, generatePdfController);

export default router;
