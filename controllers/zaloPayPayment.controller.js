import axios from "axios";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import {
  assertZaloPayCallbackMatchesPayment,
  assertZaloPayConfig,
  buildZaloPayCreatePayload,
  buildZaloPayQueryPayload,
  generateZaloPayAppTransId,
  getZaloPayConfig,
  isSuccessfulZaloPayCreate,
  mapZaloPayReturnCodeToStatus,
  parseZaloPayCallbackData,
  toVndAmount,
  verifyZaloPayCallbackMac,
} from "../utils/zalopayPayment.js";

const ZALOPAY_TIMEOUT_MS = 30000;

const paidPaymentStatuses = new Set(["Paid", "Full"]);

function getZaloPayEndpoint(config, path) {
  return `${config.apiBase.replace(/\/$/, "")}${path}`;
}

function toId(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function toZaloPayPaymentResponse(payment, providerResponse = null) {
  return {
    paymentId: toId(payment?._id ?? payment?.id),
    bookingId: toId(payment?.bookingId),
    appTransId: payment?.providerOrderId || "",
    amount: toVndAmount(payment?.amount),
    status: payment?.status || "Pending",
    zpTransToken: payment?.providerRequestId || "",
    orderUrl: payment?.paymentUrl || "",
    qrCode: payment?.qrCodeUrl || "",
    transId: payment?.providerTransId || "",
    returnCode: payment?.providerResultCode ?? null,
    message: payment?.providerMessage || "",
    providerResponse,
  };
}

function toFormBody(payload) {
  const body = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      body.append(key, String(value));
    }
  });
  return body.toString();
}

async function markBookingPaid(payment, zaloPayPayload) {
  const booking = await Booking.findById(payment.bookingId);
  if (!booking || paidPaymentStatuses.has(booking.payment_status)) {
    return;
  }

  const transId = zaloPayPayload?.zp_trans_id ? String(zaloPayPayload.zp_trans_id) : "";
  const amount = toVndAmount(payment.amount);
  const user = booking.contact_info?.name || "";

  booking.payment_status = "Full";
  booking.status = "Confirmed";
  booking.history_log.push({
    action: "Thanh toan ZaloPay thanh cong",
    timestamp: new Date(),
    user,
    note: `ZaloPay ${transId || payment.providerOrderId} - ${amount.toLocaleString("vi-VN")} VND`,
  });

  await booking.save();
}

async function applyZaloPayResultToPayment(payment, zaloPayPayload, source) {
  const returnCode = Number(zaloPayPayload?.return_code);
  const mappedStatus = mapZaloPayReturnCodeToStatus(returnCode);
  const transId = zaloPayPayload?.zp_trans_id ? String(zaloPayPayload.zp_trans_id) : "";

  payment.providerResultCode = Number.isFinite(returnCode) ? returnCode : null;
  payment.providerMessage =
    zaloPayPayload?.return_message || zaloPayPayload?.sub_return_message || "";
  if (transId) {
    payment.providerTransId = transId;
    payment.transactionId = transId;
  }
  if (source === "callback") {
    payment.rawIpnPayload = zaloPayPayload;
  } else {
    payment.rawQueryResponse = zaloPayPayload;
  }

  if (mappedStatus === "Success") {
    if (
      zaloPayPayload?.amount !== undefined &&
      toVndAmount(zaloPayPayload.amount) !== toVndAmount(payment.amount)
    ) {
      const error = new Error("ZaloPay amount does not match payment amount");
      error.statusCode = 400;
      throw error;
    }

    payment.status = "Success";
    await payment.save();
    await markBookingPaid(payment, zaloPayPayload);
    return payment;
  }

  if (payment.status !== "Success") {
    payment.status = mappedStatus;
  }

  await payment.save();
  return payment;
}

async function getCustomerZaloPayPayment({ paymentId, appTransId, customerId }) {
  const filter = { provider: "ZaloPay" };

  if (paymentId) {
    if (!mongoose.isValidObjectId(paymentId)) {
      const error = new Error("paymentId khong hop le");
      error.statusCode = 400;
      throw error;
    }
    filter._id = paymentId;
  } else if (appTransId) {
    filter.providerOrderId = appTransId;
  } else {
    const error = new Error("Thieu paymentId hoac appTransId");
    error.statusCode = 400;
    throw error;
  }

  const payment = await Payment.findOne(filter);
  if (!payment) {
    const error = new Error("Khong tim thay thanh toan ZaloPay");
    error.statusCode = 404;
    throw error;
  }

  const booking = await Booking.findOne({
    _id: payment.bookingId,
    customer_id: customerId,
    is_deleted: false,
  }).lean();

  if (!booking) {
    const error = new Error("Khong tim thay booking");
    error.statusCode = 404;
    throw error;
  }

  return payment;
}

export const createZaloPayPayment = async (req, res) => {
  try {
    await connectDB();

    const { bookingId } = req.body;
    if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ status: false, message: "bookingId khong hop le" });
    }

    const config = getZaloPayConfig();
    assertZaloPayConfig(config);

    const booking = await Booking.findOne({
      _id: bookingId,
      customer_id: req.customer._id,
      is_deleted: false,
    });

    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking khong ton tai" });
    }

    if (paidPaymentStatuses.has(booking.payment_status)) {
      return res.status(400).json({ status: false, message: "Booking da duoc thanh toan" });
    }

    const reusablePendingPayment = await Payment.findOne({
      bookingId,
      provider: "ZaloPay",
      status: "Pending",
      $or: [{ providerRequestId: { $exists: true, $ne: "" } }, { paymentUrl: { $ne: "" } }],
    }).sort({ createdAt: -1 });

    if (reusablePendingPayment) {
      return res.status(200).json({
        status: true,
        message: "Da co phien thanh toan ZaloPay dang cho",
        data: toZaloPayPaymentResponse(reusablePendingPayment),
      });
    }

    const amount = toVndAmount(booking.total_amount);
    if (amount <= 0) {
      return res.status(400).json({ status: false, message: "So tien khong hop le" });
    }

    const appTransId = generateZaloPayAppTransId(booking);

    const payment = await Payment.create({
      bookingId,
      amount,
      paymentMethod: "ZaloPay",
      provider: "ZaloPay",
      providerOrderId: appTransId,
      status: "Pending",
      paymentDate: new Date(),
    });

    const zaloPayPayload = buildZaloPayCreatePayload({
      config,
      amount,
      appTransId,
      booking,
    });

    try {
      const zaloPayResponse = await axios.post(
        getZaloPayEndpoint(config, "/v2/create"),
        toFormBody(zaloPayPayload),
        {
          timeout: ZALOPAY_TIMEOUT_MS,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      const responseData = zaloPayResponse.data || {};
      payment.rawCreateResponse = responseData;
      payment.paymentUrl = responseData.order_url || responseData.orderUrl || "";
      payment.qrCodeUrl = responseData.qr_code || responseData.qrCode || "";
      if (responseData.zp_trans_token) {
        payment.providerRequestId = String(responseData.zp_trans_token);
      }
      payment.providerResultCode =
        responseData.return_code === undefined ? null : Number(responseData.return_code);
      payment.providerMessage =
        responseData.return_message || responseData.sub_return_message || "";

      if (
        responseData.return_code !== undefined &&
        !isSuccessfulZaloPayCreate(responseData.return_code)
      ) {
        payment.status = "Failed";
      }

      await payment.save();

      return res.status(201).json({
        status: true,
        message: "Tao thanh toan ZaloPay thanh cong",
        data: toZaloPayPaymentResponse(payment, responseData),
      });
    } catch (err) {
      payment.status = "Failed";
      payment.providerMessage =
        err?.response?.data?.return_message ||
        err?.response?.data?.message ||
        err?.message ||
        "ZaloPay request failed";
      payment.rawCreateResponse = err?.response?.data || { message: err?.message };
      await payment.save();

      return res.status(502).json({
        status: false,
        message: "Khong the tao thanh toan ZaloPay",
        error: payment.providerMessage,
      });
    }
  } catch (err) {
    console.error("createZaloPayPayment error:", err);
    return res.status(err.statusCode || 500).json({
      status: false,
      message: err.message || "Loi server",
    });
  }
};

export const handleZaloPayCallback = async (req, res) => {
  try {
    await connectDB();

    const payload = req.body || {};
    const config = getZaloPayConfig();
    assertZaloPayConfig(config);

    if (!verifyZaloPayCallbackMac(payload, config.key2)) {
      return res.json({ return_code: -1, return_message: "mac not equal" });
    }

    const callbackData = parseZaloPayCallbackData(payload.data);
    const payment = await Payment.findOne({
      provider: "ZaloPay",
      providerOrderId: callbackData.app_trans_id,
    });

    if (!payment) {
      return res.json({ return_code: 0, return_message: "payment not found" });
    }

    const verifiedData = assertZaloPayCallbackMatchesPayment(payload, payment, config);
    await applyZaloPayResultToPayment(
      payment,
      {
        ...verifiedData,
        return_code: 1,
        return_message: "success",
      },
      "callback"
    );

    return res.json({ return_code: 1, return_message: "success" });
  } catch (err) {
    console.error("handleZaloPayCallback error:", err);
    const returnCode = err.statusCode === 400 ? -1 : 0;
    return res.json({
      return_code: returnCode,
      return_message: err.message || "callback failed",
    });
  }
};

export const queryZaloPayPayment = async (req, res) => {
  try {
    await connectDB();

    const config = getZaloPayConfig();
    assertZaloPayConfig(config);

    const payment = await getCustomerZaloPayPayment({
      paymentId: req.body?.paymentId,
      appTransId: req.body?.appTransId || req.body?.orderId,
      customerId: req.customer._id,
    });

    const zaloPayPayload = buildZaloPayQueryPayload({
      config,
      appTransId: payment.providerOrderId,
    });

    const zaloPayResponse = await axios.post(
      getZaloPayEndpoint(config, "/v2/query"),
      toFormBody(zaloPayPayload),
      {
        timeout: ZALOPAY_TIMEOUT_MS,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    const responseData = zaloPayResponse.data || {};

    await applyZaloPayResultToPayment(payment, responseData, "query");

    return res.json({
      status: true,
      data: toZaloPayPaymentResponse(payment, responseData),
    });
  } catch (err) {
    console.error("queryZaloPayPayment error:", err);
    return res.status(err.statusCode || err.response?.status || 500).json({
      status: false,
      message: err.message || "Loi server",
      error: err.response?.data,
    });
  }
};

export const getZaloPayPaymentStatus = async (req, res) => {
  try {
    await connectDB();

    const payment = await getCustomerZaloPayPayment({
      paymentId: req.params.paymentId,
      customerId: req.customer._id,
    });

    return res.json({
      status: true,
      data: toZaloPayPaymentResponse(payment),
    });
  } catch (err) {
    console.error("getZaloPayPaymentStatus error:", err);
    return res.status(err.statusCode || 500).json({
      status: false,
      message: err.message || "Loi server",
    });
  }
};
