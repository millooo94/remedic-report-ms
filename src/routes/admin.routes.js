import { Router } from "express";
import {
  createAdminUserController,
  listAdminDraftEmailDeliveriesController,
  listAdminArchiveController,
  listAdminAuditLogsController,
  listAdminDraftsController,
  listAdminUsersController,
  sendAdminDraftToPatientController,
  updateAdminUserController,
  updateAdminUserStatusController,
} from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middleware/require-auth.js";
import { requireCsrf } from "../middleware/require-csrf.js";

const router = Router();

router.use("/admin", requireAuth, requireRole("admin"));

router.get("/admin/users", listAdminUsersController);
router.post("/admin/users", requireCsrf, createAdminUserController);
router.put("/admin/users/:id", requireCsrf, updateAdminUserController);
router.patch("/admin/users/:id/status", requireCsrf, updateAdminUserStatusController);
router.get("/admin/drafts", listAdminDraftsController);
router.get("/admin/archive", listAdminArchiveController);
router.get("/admin/drafts/:id/email-deliveries", listAdminDraftEmailDeliveriesController);
router.post("/admin/drafts/:id/send-to-patient", requireCsrf, sendAdminDraftToPatientController);
router.get("/admin/audit-logs", listAdminAuditLogsController);

export default router;
