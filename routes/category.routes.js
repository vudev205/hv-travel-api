import express from "express";
import {
  getCategories,
  createCategory
} from "../controllers/category.controller.js";

const router = express.Router();

router.get("/list", getCategories);
// router.post("/", createCategory);

export default router;
