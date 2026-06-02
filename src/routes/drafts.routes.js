import { Router } from "express";
import {
  createDraftController,
  deleteDraftController,
  getDraftController,
  listDraftsController,
  sendDraftToRefertatoreController,
  updateDraftController,
  updateDraftStatusController,
} from "../controllers/drafts.controller.js";
import {
  createDraftAttachmentController,
  deleteDraftAttachmentController,
  getDraftAttachmentController,
  listDraftAttachmentsController,
  uploadSignedDraftPdfController,
} from "../controllers/draft-attachments.controller.js";
import { requireApiKey } from "../middleware/require-api-key.js";
import { requireCreationAccess } from "../middleware/require-creation-access.js";
import {
  requireDraftReadAccess,
  requireDraftWriteAccess,
} from "../middleware/require-refertatore-auth.js";
import {
  validateCreateDraftRequest,
  validateDraftStatusRequest,
  validateUpdateDraftRequest,
} from "../middleware/validate-draft-request.js";
import {
  validateCreateDraftAttachmentRequest,
  validateSignedDraftPdfRequest,
} from "../middleware/validate-draft-attachment-request.js";

const router = Router();

router.post("/drafts", requireApiKey, requireCreationAccess, validateCreateDraftRequest, createDraftController);
router.get("/drafts", requireApiKey, requireCreationAccess, listDraftsController);
router.get("/drafts/:id", requireApiKey, requireCreationAccess, getDraftController);
router.put("/drafts/:id", requireApiKey, requireCreationAccess, validateUpdateDraftRequest, updateDraftController);
router.patch(
  "/drafts/:id/status",
  requireApiKey,
  requireCreationAccess,
  validateDraftStatusRequest,
  updateDraftStatusController,
);
router.post("/drafts/:id/send-to-refertatore", requireApiKey, requireCreationAccess, sendDraftToRefertatoreController);
router.delete("/drafts/:id", requireApiKey, requireCreationAccess, deleteDraftController);
router.post(
  "/drafts/:id/attachments",
  requireApiKey,
  requireCreationAccess,
  validateCreateDraftAttachmentRequest,
  createDraftAttachmentController,
);
router.delete(
  "/drafts/:id/attachments/:attachmentId",
  requireApiKey,
  requireCreationAccess,
  deleteDraftAttachmentController,
);

router.get(
  "/drafts/:id/attachments",
  requireDraftReadAccess,
  listDraftAttachmentsController,
);
router.get(
  "/drafts/:id/attachments/:attachmentId",
  requireDraftReadAccess,
  getDraftAttachmentController,
);
router.post(
  "/drafts/:id/signed-pdf",
  requireDraftWriteAccess,
  validateSignedDraftPdfRequest,
  uploadSignedDraftPdfController,
);

export default router;
