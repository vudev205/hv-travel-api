import express from "express";
import {
  listTours,
  searchBootstrap,
  searchTours,
  tourDetail,
} from "../controllers/tour.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/search/bootstrap", customerAuth, searchBootstrap);
router.get("/search", customerAuth, searchTours);
router.get("/list", customerAuth, listTours);
router.get("/:id", tourDetail);

export default router;
