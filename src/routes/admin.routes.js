import { Router } from "express";
import {
  createAdminUserController,
  deleteAdminDraftController,
  deleteAdminArchiveDraftController,
  deleteAdminUserController,
  listAdminDraftEmailDeliveriesController,
  listAdminArchiveController,
  listAdminAuditLogsController,
  listAdminDraftsController,
  listAdminUsersController,
  saveAdminArchiveDraftToDriveController,
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
router.delete("/admin/users/:id", requireCsrf, deleteAdminUserController);
router.get("/admin/drafts", listAdminDraftsController);
router.delete("/admin/drafts/:id", requireCsrf, deleteAdminDraftController);
router.get("/admin/archive", listAdminArchiveController);
router.delete("/admin/archive/:id", requireCsrf, deleteAdminArchiveDraftController);
router.post("/admin/archive/:id/save-to-drive", requireCsrf, saveAdminArchiveDraftToDriveController);
router.get("/admin/drafts/:id/email-deliveries", listAdminDraftEmailDeliveriesController);
router.post("/admin/drafts/:id/send-to-patient", requireCsrf, sendAdminDraftToPatientController);
router.get("/admin/audit-logs", listAdminAuditLogsController);

export default router;
