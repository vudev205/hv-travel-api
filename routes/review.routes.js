import express from "express";
import { createReview, listReviewsByTour } from "../controllers/review.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Public: list reviews for a tour (no auth required)
router.get("/", listReviewsByTour);

// Protected: create a review
router.post("/", customerAuth, createReview);

export default router;
