import { Router } from "express";
import {
  exportPreviewRefertatoreDraftController,
  getRefertatoreDraftController,
  listRefertatoreArchiveController,
  listRefertatoreDraftsController,
  meRefertatoreController,
  updateRefertatoreDraftController,
} from "../controllers/refertatore.controller.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";
import { requireCsrf } from "../middleware/require-csrf.js";
import { uploadSignedDraftPdfController } from "../controllers/draft-attachments.controller.js";
import { validateSignedDraftPdfRequest } from "../middleware/validate-draft-attachment-request.js";
import { requireDraftWriteAccess } from "../middleware/require-neurologist-auth.js";

const router = Router();

router.use("/refertatore", requireAuth, requireRole("refertatore"));

router.get("/refertatore/me", meRefertatoreController);
router.get("/refertatore/drafts", listRefertatoreDraftsController);
router.get("/refertatore/archive", listRefertatoreArchiveController);
router.get("/refertatore/drafts/:id", getRefertatoreDraftController);
router.put("/refertatore/drafts/:id", requireCsrf, updateRefertatoreDraftController);
router.post("/refertatore/drafts/:id/export-preview", requireCsrf, exportPreviewRefertatoreDraftController);
router.post(
  "/refertatore/drafts/:id/signed-pdf",
  requireDraftWriteAccess,
  requireCsrf,
  validateSignedDraftPdfRequest,
  uploadSignedDraftPdfController,
);

export default router;
