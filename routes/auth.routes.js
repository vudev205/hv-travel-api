import express from "express";
import { register, login, me, forgotPassword, resendOtp, verifyOtp, resetPassword, changePassword, logout } from "../controllers/auth.controller.js";
import { auth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", auth, logout)
router.get("/me", auth, me);
router.post("/forgot-password", forgotPassword);
router.post("/resend-otp", resendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/change-password", changePassword);


export default router;
