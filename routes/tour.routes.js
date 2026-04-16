import express from "express";
import { listTours, tourDetail } from "../controllers/tour.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/list", customerAuth, listTours);
router.get("/:id", tourDetail);

export default router;
