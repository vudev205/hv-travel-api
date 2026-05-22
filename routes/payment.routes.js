import express from "express";
import { createPayment, listPayments } from "../controllers/payment.controller.js";
import {
  createMomoPayment,
  getMomoPaymentStatus,
  handleMomoIpn,
  queryMomoPayment,
} from "../controllers/momoPayment.controller.js";
import {
  createZaloPayPayment,
  getZaloPayPaymentStatus,
  handleZaloPayCallback,
  queryZaloPayPayment,
} from "../controllers/zaloPayPayment.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", customerAuth, listPayments);
router.post("/", customerAuth, createPayment);
router.post("/momo/create", customerAuth, createMomoPayment);
router.post("/momo/ipn", handleMomoIpn);
router.post("/momo/query", customerAuth, queryMomoPayment);
router.get("/momo/:paymentId/status", customerAuth, getMomoPaymentStatus);
router.post("/zalopay/create", customerAuth, createZaloPayPayment);
router.post("/zalopay/callback", handleZaloPayCallback);
router.post("/zalopay/query", customerAuth, queryZaloPayPayment);
router.get("/zalopay/:paymentId/status", customerAuth, getZaloPayPaymentStatus);

export default router;
