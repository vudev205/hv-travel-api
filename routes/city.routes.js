import express from "express";
import {
  getCities,
} from "../controllers/city.controller.js";

const router = express.Router();

router.get("/list", getCities);
//router.post("/", createCity);

export default router;
