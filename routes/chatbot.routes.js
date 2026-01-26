import express from "express";
import { chatWithTour } from "../controllers/chatbot.controller.js";

const router = express.Router();

router.post("/tour", chatWithTour);

export default router;
