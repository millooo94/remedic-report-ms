import { Router } from "express";
import {
  csrfController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  resetPasswordController,
} from "../controllers/auth.controller.js";
import {
  validateForgotPasswordRequest,
  validateLoginRequest,
  validateResetPasswordRequest,
} from "../middleware/validate-auth-request.js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireCsrf } from "../middleware/require-csrf.js";
import { createRateLimitMiddleware } from "../middleware/rate-limit.js";

const router = Router();

const loginRateLimit = createRateLimitMiddleware({
  scope: "auth-login",
  limit: 5,
  windowMs: 15 * 60 * 1000,
  deriveExtraKey: (req) => String(req.body?.email || "").trim().toLowerCase(),
});

const forgotRateLimit = createRateLimitMiddleware({
  scope: "auth-forgot-password",
  limit: 3,
  windowMs: 30 * 60 * 1000,
  deriveExtraKey: (req) => String(req.body?.email || "").trim().toLowerCase(),
});

const resetRateLimit = createRateLimitMiddleware({
  scope: "auth-reset-password",
  limit: 5,
  windowMs: 30 * 60 * 1000,
  deriveExtraKey: (req) => String(req.body?.token || "").slice(0, 24),
});

router.post("/auth/login", loginRateLimit, validateLoginRequest, loginController);
router.post("/auth/forgot-password", forgotRateLimit, validateForgotPasswordRequest, forgotPasswordController);
router.post("/auth/reset-password", resetRateLimit, validateResetPasswordRequest, resetPasswordController);
router.get("/auth/me", requireAuth, meController);
router.get("/auth/csrf", requireAuth, csrfController);
router.post("/auth/logout", requireAuth, requireCsrf, logoutController);

export default router;
