import express from "express";
import {
  register,
  login,
  me,
  forgotPassword,
  resendOtp,
  verifyOtp,
  resetPassword,
  changePassword,
  logout,
  dbCheck,
  refreshToken,
  getSessions,
  logoutSession,
  logoutAll,
  resolveWebQrLogin,
  approveWebQrLogin,
  denyWebQrLogin,
} from "../controllers/auth.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/qr-login/resolve", resolveWebQrLogin);
router.post("/qr-login/approve", customerAuth, approveWebQrLogin);
router.post("/qr-login/deny", customerAuth, denyWebQrLogin);
router.post("/logout", customerAuth, logout);
router.get("/sessions", customerAuth, getSessions);
router.delete("/sessions/:sessionId", customerAuth, logoutSession);
router.post("/logout-all", customerAuth, logoutAll);
router.get("/me", customerAuth, me);
router.post("/forgot-password", forgotPassword);
router.post("/resend-otp", resendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/change-password", customerAuth, changePassword);
router.get("/db", dbCheck);

export default router;
