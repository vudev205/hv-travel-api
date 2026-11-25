import express from "express";
import { chatWithTour, health, checkGeminiKey } from "../controllers/chatbot.controller.js";
import { debugEndpointGuard } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/health", health);
router.get("/check-gemini-key", debugEndpointGuard, checkGeminiKey);
router.post("/tour", chatWithTour);

export default router;
