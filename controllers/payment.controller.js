import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";

// Create a manual payment request for a booking (always Pending until admin/gateway reconciliation)
export const createPayment = async (req, res) => {
  try {
    await connectDB();

    const { bookingId, transactionId, paymentMethod } = req.body;

    // Validate bookingId
    if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ status: false, message: "bookingId không hợp lệ" });
    }

    // Only manual offline methods are accepted on this endpoint; gateway methods require provider verification
    const manualMethods = ["BankTransfer", "Cash"];
    if (paymentMethod === "CreditCard") {
      return res.status(400).json({
        status: false,
        message: "Thanh toán thẻ phải được thực hiện qua cổng thanh toán được xác thực",
      });
    }
    if (!paymentMethod || !manualMethods.includes(paymentMethod)) {
      return res.status(400).json({ status: false, message: "Phương thức thanh toán không hợp lệ" });
    }

    // Check booking exists and belongs to customer
    const booking = await Booking.findOne({
      _id: bookingId,
      customer_id: req.customer._id,
      is_deleted: false,
    });

    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking không tồn tại" });
    }

    if (booking.status === "Cancelled" || booking.status === "Completed") {
      return res.status(400).json({ status: false, message: "Không thể thanh toán cho booking này" });
    }

    const paidStatuses = new Set(["Paid", "Full"]);
    if (paidStatuses.has(booking.payment_status)) {
      return res.status(400).json({ status: false, message: "Booking đã được thanh toán" });
    }

    // Always derive payable amount from server-side booking.total_amount (never trust client amount)
    const serverAmount = Number(booking.total_amount?.toString?.() ?? booking.total_amount);
    if (!Number.isFinite(serverAmount) || serverAmount <= 0) {
      return res.status(400).json({ status: false, message: "Số tiền thanh toán của booking không hợp lệ" });
    }

    const safeTransactionId = typeof transactionId === "string" ? transactionId.trim().slice(0, 128) : "";

    const payment = await Payment.create({
      bookingId: booking._id,
      amount: serverAmount,
      transactionId: safeTransactionId,
      provider: "Internal",
      paymentMethod,
      status: "Pending",
      paymentDate: new Date(),
    });

    const customerName = req.customer.fullName || req.customer.name || "";

    // Record audit entry only — do NOT mark booking Confirmed/Full or payment Success from client POST
    booking.history_log.push({
      action: "Tạo yêu cầu thanh toán (Chờ xác nhận)",
      timestamp: new Date(),
      user: customerName,
      note: `Yêu cầu thanh toán ${paymentMethod} - ${serverAmount.toLocaleString("vi-VN")} VND (Chờ đối soát)`,
    });
    await booking.save();

    return res.status(201).json({
      status: true,
      message: "Đã ghi nhận yêu cầu thanh toán, đang chờ xác nhận",
      data: payment,
    });
  } catch (err) {
    console.error("createPayment error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// List payments for a booking or all customer payments
export const listPayments = async (req, res) => {
  try {
    await connectDB();

    const { bookingId } = req.query;

    let filter = {};

    if (bookingId) {
      if (!mongoose.isValidObjectId(bookingId)) {
        return res.status(400).json({ status: false, message: "bookingId không hợp lệ" });
      }

      // Verify booking belongs to customer
      const booking = await Booking.findOne({
        _id: bookingId,
        customer_id: req.customer._id,
      }).lean();

      if (!booking) {
        return res.status(404).json({ status: false, message: "Booking không tồn tại" });
      }

      filter.bookingId = bookingId;
    } else {
      // Get all bookings for customer, then filter payments
      const customerBookings = await Booking.find({ customer_id: req.customer._id })
        .select("_id")
        .lean();
      const bookingIds = customerBookings.map((b) => b._id);
      filter.bookingId = { $in: bookingIds };
    }

    const payments = await Payment.find(filter)
      .sort({ paymentDate: -1 })
      .lean();

    return res.json({
      status: true,
      data: payments,
      total: payments.length,
    });
  } catch (err) {
    console.error("listPayments error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
