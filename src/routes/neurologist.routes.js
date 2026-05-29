import { Router } from "express";
import {
  getNeurologistEmgDraftController,
  listNeurologistEmgDraftsController,
  updateNeurologistEmgDraftController,
} from "../controllers/neurologist.controller.js";
import { requireNeurologistAuth } from "../middleware/require-neurologist-auth.js";
import { validateNeurologistEmgUpdateRequest } from "../middleware/validate-neurologist-request.js";

const router = Router();

router.use("/neurologist", requireNeurologistAuth);

router.get("/neurologist/emg-drafts", listNeurologistEmgDraftsController);
router.get("/neurologist/emg-drafts/:id", getNeurologistEmgDraftController);
router.put(
  "/neurologist/emg-drafts/:id",
  validateNeurologistEmgUpdateRequest,
  updateNeurologistEmgDraftController,
);

export default router;
