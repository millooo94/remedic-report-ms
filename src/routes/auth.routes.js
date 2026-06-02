import { Router } from "express";
import {
  changePasswordController,
  csrfController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  regenerateRecoveryCodesController,
  resetPasswordController,
  twoFactorChallengeController,
  twoFactorRecoveryCodeController,
  twoFactorSetupController,
  twoFactorVerifySetupController,
  updateProfileController,
  uploadProfileAvatarController,
} from "../controllers/auth.controller.js";
import {
  validateChangePasswordRequest,
  validateForgotPasswordRequest,
  validateLoginRequest,
  validateProfileAvatarRequest,
  validateProfileUpdateRequest,
  validateResetPasswordRequest,
  validateTwoFactorCodeRequest,
  validateTwoFactorRecoveryCodeRequest,
  validateTwoFactorSetupRequest,
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

const twoFactorRateLimit = createRateLimitMiddleware({
  scope: "auth-two-factor",
  limit: 8,
  windowMs: 10 * 60 * 1000,
  deriveExtraKey: (req) =>
    String(req.body?.challengeToken || "").slice(0, 24) ||
    String(req.body?.email || "").trim().toLowerCase(),
});

router.post("/auth/login", loginRateLimit, validateLoginRequest, loginController);
router.post("/auth/2fa/setup", validateTwoFactorSetupRequest, twoFactorSetupController);
router.post("/auth/2fa/verify-setup", twoFactorRateLimit, validateTwoFactorCodeRequest, twoFactorVerifySetupController);
router.post("/auth/2fa/challenge", twoFactorRateLimit, validateTwoFactorCodeRequest, twoFactorChallengeController);
router.post("/auth/2fa/recovery-code", twoFactorRateLimit, validateTwoFactorRecoveryCodeRequest, twoFactorRecoveryCodeController);
router.post("/auth/forgot-password", forgotRateLimit, validateForgotPasswordRequest, forgotPasswordController);
router.post("/auth/reset-password", resetRateLimit, validateResetPasswordRequest, resetPasswordController);
router.get("/auth/me", requireAuth, meController);
router.get("/auth/csrf", requireAuth, csrfController);
router.put("/auth/profile", requireAuth, requireCsrf, validateProfileUpdateRequest, updateProfileController);
router.post("/auth/profile/avatar", requireAuth, requireCsrf, validateProfileAvatarRequest, uploadProfileAvatarController);
router.post("/auth/2fa/recovery-codes/regenerate", requireAuth, requireCsrf, regenerateRecoveryCodesController);
router.post("/auth/logout", requireAuth, requireCsrf, logoutController);
router.post(
  "/auth/change-password",
  requireAuth,
  requireCsrf,
  validateChangePasswordRequest,
  changePasswordController,
);

export default router;
