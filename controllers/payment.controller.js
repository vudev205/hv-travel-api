import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Payment from "../models/Payment.js";
import Booking from "../models/Booking.js";

// Create a payment for a booking
export const createPayment = async (req, res) => {
  try {
    await connectDB();

    const { bookingId, amount, transactionId, paymentMethod } = req.body;

    // Validate bookingId
    if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ status: false, message: "bookingId không hợp lệ" });
    }

    // Validate paymentMethod
    const validMethods = ["CreditCard", "BankTransfer", "Cash"];
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
      return res.status(400).json({ status: false, message: "Phương thức thanh toán không hợp lệ" });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ status: false, message: "Số tiền không hợp lệ" });
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

    if (booking.payment_status === "Paid") {
      return res.status(400).json({ status: false, message: "Booking đã được thanh toán" });
    }

    const payment = await Payment.create({
      bookingId,
      amount,
      transactionId: transactionId || "",
      paymentMethod,
      status: "Pending",
      paymentDate: new Date(),
    });

    const customerName = req.customer.fullName || req.customer.name || "";

    // Update booking payment status
    booking.payment_status = "Paid";
    booking.status = "Confirmed";
    booking.history_log.push({
      action: "Thanh toán thành công",
      timestamp: new Date(),
      user: customerName,
      note: `Thanh toán ${paymentMethod} - ${amount.toLocaleString("vi-VN")} VND`,
    });
    await booking.save();

    // Update payment status to Success
    payment.status = "Success";
    await payment.save();

    return res.status(201).json({
      status: true,
      message: "Thanh toán thành công",
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
