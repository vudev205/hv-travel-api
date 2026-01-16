import express from "express";
import { listFavourites } from "../controllers/favourite.controller.js";
import { auth } from "../middlewares/authMiddleware";

const router = express.Router();

router.get("/list", auth, listFavourites);

export default router;