import express from "express";
import {
  getCities,
  getCityDetail,
} from "../controllers/city.controller.js";

const router = express.Router();

router.get("/list", getCities);
router.get("/:id", getCityDetail);
//router.post("/", createCity);

export default router;
