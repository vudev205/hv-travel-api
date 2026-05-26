import express from "express";
import { recordTourView } from "../controllers/tourInteraction.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/tours/:tourId/view", customerAuth, recordTourView);

export default router;
