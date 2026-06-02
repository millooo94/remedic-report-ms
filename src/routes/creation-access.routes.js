import { Router } from "express";
import { getCreationAccessController } from "../controllers/creation-access.controller.js";
import { requireApiKey } from "../middleware/require-api-key.js";

const router = Router();

router.get("/creation-access", requireApiKey, getCreationAccessController);

export default router;
