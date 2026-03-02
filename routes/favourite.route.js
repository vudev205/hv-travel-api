import express from "express";
import { addFavouriteByTourId, deleteFavouriteByTourId, listFavourites } from "../controllers/favourite.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/list", customerAuth, listFavourites);
router.post("/tour/:tourId", customerAuth, addFavouriteByTourId);
router.delete("/tour/:tourId", customerAuth, deleteFavouriteByTourId);

export default router;