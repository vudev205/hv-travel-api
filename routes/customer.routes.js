import express from "express";
import { getProfile, updateProfile } from "../controllers/customer.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/profile", customerAuth, getProfile);
router.put("/profile", customerAuth, updateProfile);

export default router;
