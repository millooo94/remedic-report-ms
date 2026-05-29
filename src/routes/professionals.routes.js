import { Router } from "express";
import {
  createProfessionalController,
  getProfessionalController,
  listAdminProfessionalsController,
  listOperationalProfessionalsController,
  listOperationalRefertatoriController,
  updateProfessionalController,
  updateProfessionalStatusController,
} from "../controllers/professionals.controller.js";
import { requireApiKey } from "../middleware/require-api-key.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";
import { requireCsrf } from "../middleware/require-csrf.js";

const router = Router();

router.get("/professionals", requireApiKey, listOperationalProfessionalsController);
router.get("/professionals/:id", requireApiKey, getProfessionalController);
router.get("/refertatori", requireApiKey, listOperationalRefertatoriController);

router.get("/admin/professionals", requireAuth, requireRole("admin"), listAdminProfessionalsController);
router.post("/admin/professionals", requireAuth, requireRole("admin"), requireCsrf, createProfessionalController);
router.put("/admin/professionals/:id", requireAuth, requireRole("admin"), requireCsrf, updateProfessionalController);
router.patch("/admin/professionals/:id/status", requireAuth, requireRole("admin"), requireCsrf, updateProfessionalStatusController);

export default router;
