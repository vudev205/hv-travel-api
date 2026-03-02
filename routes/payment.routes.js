import express from "express";
import { createPayment, listPayments } from "../controllers/payment.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", customerAuth, listPayments);
router.post("/", customerAuth, createPayment);

export default router;
