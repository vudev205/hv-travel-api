import axios from "axios";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import {
  assertMomoIpnMatchesPayment,
  assertMoMoConfig,
  buildMomoCreatePayload,
  buildMomoQueryPayload,
  generateMoMoOrderId,
  generateMoMoRequestId,
  getMoMoConfig,
  isSuccessfulMoMoResult,
  toVndAmount,
} from "../utils/momoPayment.js";

const MOMO_TIMEOUT_MS = 30000;
const MOMO_PENDING_RESULT_CODES = new Set([1000, 9000]);

const paidPaymentStatuses = new Set(["Paid", "Full"]);

function getMoMoEndpoint(config, path) {
  return `${config.apiBase.replace(/\/$/, "")}${path}`;
}

function toId(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function toMomoPaymentResponse(payment, providerResponse = null) {
  return {
    paymentId: toId(payment?._id ?? payment?.id),
    bookingId: toId(payment?.bookingId),
    orderId: payment?.providerOrderId || "",
    requestId: payment?.providerRequestId || "",
    amount: toVndAmount(payment?.amount),
    status: payment?.status || "Pending",
    payUrl: payment?.paymentUrl || "",
    deeplink: payment?.deeplink || "",
    qrCodeUrl: payment?.qrCodeUrl || "",
    transId: payment?.providerTransId || "",
    resultCode: payment?.providerResultCode ?? null,
    message: payment?.providerMessage || "",
    providerResponse,
  };
}

async function markBookingPaid(payment, momoPayload) {
  const booking = await Booking.findById(payment.bookingId);
  if (!booking || paidPaymentStatuses.has(booking.payment_status)) {
    return;
  }

  const transId = momoPayload?.transId ? String(momoPayload.transId) : "";
  const amount = toVndAmount(payment.amount);
  const user = booking.contact_info?.name || "";

  booking.payment_status = "Full";
  booking.status = "Confirmed";
  booking.history_log.push({
    action: "Thanh toán MoMo thành công",
    timestamp: new Date(),
    user,
    note: `MoMo ${transId || payment.providerOrderId} - ${amount.toLocaleString("vi-VN")} VND`,
  });

  await booking.save();
}

async function applyMomoResultToPayment(payment, momoPayload, source) {
  const resultCode = Number(momoPayload?.resultCode);
  const transId = momoPayload?.transId ? String(momoPayload.transId) : "";

  payment.providerResultCode = Number.isFinite(resultCode) ? resultCode : null;
  payment.providerMessage = momoPayload?.message || "";
  if (transId) {
    payment.providerTransId = transId;
    payment.transactionId = transId;
  }
  if (source === "ipn") {
    payment.rawIpnPayload = momoPayload;
  } else {
    payment.rawQueryResponse = momoPayload;
  }

  if (isSuccessfulMoMoResult(resultCode)) {
    payment.status = "Success";
    await payment.save();
    await markBookingPaid(payment, momoPayload);
    return payment;
  }

  if (payment.status !== "Success" && !MOMO_PENDING_RESULT_CODES.has(resultCode)) {
    payment.status = "Failed";
  }

  await payment.save();
  return payment;
}

async function getCustomerMomoPayment({ paymentId, orderId, customerId }) {
  const filter = { provider: "MoMo" };

  if (paymentId) {
    if (!mongoose.isValidObjectId(paymentId)) {
      const error = new Error("paymentId không hợp lệ");
      error.statusCode = 400;
      throw error;
    }
    filter._id = paymentId;
  } else if (orderId) {
    filter.providerOrderId = orderId;
  } else {
    const error = new Error("Thiếu paymentId hoặc orderId");
    error.statusCode = 400;
    throw error;
  }

  const payment = await Payment.findOne(filter);
  if (!payment) {
    const error = new Error("Không tìm thấy thanh toán MoMo");
    error.statusCode = 404;
    throw error;
  }

  const booking = await Booking.findOne({
    _id: payment.bookingId,
    customer_id: customerId,
    is_deleted: false,
  }).lean();

  if (!booking) {
    const error = new Error("Không tìm thấy booking");
    error.statusCode = 404;
    throw error;
  }

  return payment;
}

export const createMomoPayment = async (req, res) => {
  try {
    await connectDB();

    const { bookingId } = req.body;
    if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ status: false, message: "bookingId không hợp lệ" });
    }

    const config = getMoMoConfig();
    assertMoMoConfig(config);

    const booking = await Booking.findOne({
      _id: bookingId,
      customer_id: req.customer._id,
      is_deleted: false,
    });

    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking không tồn tại" });
    }

    if (paidPaymentStatuses.has(booking.payment_status)) {
      return res.status(400).json({ status: false, message: "Booking đã được thanh toán" });
    }

    const reusablePendingPayment = await Payment.findOne({
      bookingId,
      provider: "MoMo",
      status: "Pending",
      $or: [{ paymentUrl: { $ne: "" } }, { deeplink: { $ne: "" } }],
    }).sort({ createdAt: -1 });

    if (reusablePendingPayment) {
      return res.status(200).json({
        status: true,
        message: "Đã có phiên thanh toán MoMo đang chờ",
        data: toMomoPaymentResponse(reusablePendingPayment),
      });
    }

    const amount = toVndAmount(booking.total_amount);
    if (amount <= 0) {
      return res.status(400).json({ status: false, message: "Số tiền không hợp lệ" });
    }

    const orderId = generateMoMoOrderId(booking);
    const requestId = generateMoMoRequestId();
    const orderInfo = `Thanh toan booking ${booking.booking_code}`;

    const payment = await Payment.create({
      bookingId,
      amount,
      paymentMethod: "MoMo",
      provider: "MoMo",
      providerOrderId: orderId,
      providerRequestId: requestId,
      status: "Pending",
      paymentDate: new Date(),
    });

    const momoPayload = buildMomoCreatePayload({
      config,
      amount,
      orderId,
      requestId,
      orderInfo,
    });

    try {
      const momoResponse = await axios.post(
        getMoMoEndpoint(config, "/v2/gateway/api/create"),
        momoPayload,
        {
          timeout: MOMO_TIMEOUT_MS,
          headers: { "Content-Type": "application/json" },
        }
      );

      const responseData = momoResponse.data || {};
      payment.rawCreateResponse = responseData;
      payment.paymentUrl = responseData.payUrl || "";
      payment.deeplink = responseData.deeplink || "";
      payment.qrCodeUrl = responseData.qrCodeUrl || "";
      payment.providerResultCode =
        responseData.resultCode === undefined ? null : Number(responseData.resultCode);
      payment.providerMessage = responseData.message || "";

      if (
        responseData.resultCode !== undefined &&
        !isSuccessfulMoMoResult(responseData.resultCode)
      ) {
        payment.status = "Failed";
      }

      await payment.save();

      return res.status(201).json({
        status: true,
        message: "Tạo thanh toán MoMo thành công",
        data: toMomoPaymentResponse(payment, responseData),
      });
    } catch (err) {
      payment.status = "Failed";
      payment.providerMessage = err?.response?.data?.message || err?.message || "MoMo request failed";
      payment.rawCreateResponse = err?.response?.data || { message: err?.message };
      await payment.save();

      return res.status(502).json({
        status: false,
        message: "Không thể tạo thanh toán MoMo",
        error: payment.providerMessage,
      });
    }
  } catch (err) {
    console.error("createMomoPayment error:", err);
    return res.status(err.statusCode || 500).json({
      status: false,
      message: err.message || "Lỗi server",
    });
  }
};

export const handleMomoIpn = async (req, res) => {
  try {
    await connectDB();

    const payload = req.body || {};
    const config = getMoMoConfig();
    assertMoMoConfig(config);

    const payment = await Payment.findOne({
      provider: "MoMo",
      providerOrderId: payload.orderId,
    });

    if (!payment) {
      return res.status(404).json({ status: false, message: "Không tìm thấy thanh toán" });
    }

    assertMomoIpnMatchesPayment(payload, payment, config);
    await applyMomoResultToPayment(payment, payload, "ipn");

    return res.status(204).send();
  } catch (err) {
    console.error("handleMomoIpn error:", err);
    return res.status(err.statusCode || 500).json({
      status: false,
      message: err.message || "Lỗi server",
    });
  }
};

export const queryMomoPayment = async (req, res) => {
  try {
    await connectDB();

    const config = getMoMoConfig();
    assertMoMoConfig(config);

    const payment = await getCustomerMomoPayment({
      paymentId: req.body?.paymentId,
      orderId: req.body?.orderId,
      customerId: req.customer._id,
    });

    const requestId = generateMoMoRequestId();
    const momoPayload = buildMomoQueryPayload({
      config,
      orderId: payment.providerOrderId,
      requestId,
    });

    const momoResponse = await axios.post(
      getMoMoEndpoint(config, "/v2/gateway/api/query"),
      momoPayload,
      {
        timeout: MOMO_TIMEOUT_MS,
        headers: { "Content-Type": "application/json" },
      }
    );
    const responseData = momoResponse.data || {};

    await applyMomoResultToPayment(payment, responseData, "query");

    return res.json({
      status: true,
      data: toMomoPaymentResponse(payment, responseData),
    });
  } catch (err) {
    console.error("queryMomoPayment error:", err);
    return res.status(err.statusCode || err.response?.status || 500).json({
      status: false,
      message: err.message || "Lỗi server",
      error: err.response?.data,
    });
  }
};

export const getMomoPaymentStatus = async (req, res) => {
  try {
    await connectDB();

    const payment = await getCustomerMomoPayment({
      paymentId: req.params.paymentId,
      customerId: req.customer._id,
    });

    return res.json({
      status: true,
      data: toMomoPaymentResponse(payment),
    });
  } catch (err) {
    console.error("getMomoPaymentStatus error:", err);
    return res.status(err.statusCode || 500).json({
      status: false,
      message: err.message || "Lỗi server",
    });
  }
};
