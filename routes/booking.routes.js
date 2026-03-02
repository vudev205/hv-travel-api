import express from "express";
import { createBooking, listBookings, getBooking, updateBookingStatus } from "../controllers/booking.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", customerAuth, listBookings);
router.post("/", customerAuth, createBooking);
router.get("/:id", customerAuth, getBooking);
router.put("/:id", customerAuth, updateBookingStatus);

export default router;
