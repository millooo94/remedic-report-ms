import { Router } from "express";
import {
  createDraftController,
  deleteDraftController,
  getDraftController,
  listDraftsController,
  updateDraftController,
  updateDraftStatusController,
} from "../controllers/drafts.controller.js";
import { requireApiKey } from "../middleware/require-api-key.js";
import {
  validateCreateDraftRequest,
  validateDraftStatusRequest,
  validateUpdateDraftRequest,
} from "../middleware/validate-draft-request.js";

const router = Router();

router.use("/drafts", requireApiKey);

router.post("/drafts", validateCreateDraftRequest, createDraftController);
router.get("/drafts", listDraftsController);
router.get("/drafts/:id", getDraftController);
router.put("/drafts/:id", validateUpdateDraftRequest, updateDraftController);
router.patch(
  "/drafts/:id/status",
  validateDraftStatusRequest,
  updateDraftStatusController,
);
router.delete("/drafts/:id", deleteDraftController);

export default router;
