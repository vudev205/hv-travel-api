import express from "express";
import { listTours, tourDetail } from "../controllers/tour.controller.js";

const router = express.Router();

router.get("/list", listTours);
router.get("/:id", tourDetail);

export default router;
