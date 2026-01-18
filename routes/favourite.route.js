import express from "express";
import { addFavouriteByTourId, deleteFavouriteByTourId, listFavourites } from "../controllers/favourite.controller.js";
import { auth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/list", auth, listFavourites);
router.post("/tour/:tourId", auth, addFavouriteByTourId);
router.delete("/tour/:tourId", auth, deleteFavouriteByTourId);

export default router;