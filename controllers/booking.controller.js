import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Booking from "../models/Booking.js";
import Tour from "../models/Tour.js";

// Create a new booking
export const createBooking = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer._id;
    const { tourId, passengers, contactInfo, totalAmount } = req.body;

    // Validate tourId
    if (!tourId || !mongoose.isValidObjectId(tourId)) {
      return res.status(400).json({ status: false, message: "tourId không hợp lệ" });
    }

    // Validate required fields
    if (!contactInfo || !contactInfo.fullName || !contactInfo.email || !contactInfo.phoneNumber) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin liên hệ" });
    }

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ status: false, message: "Tổng tiền không hợp lệ" });
    }

    // Check tour exists and is active
    const tour = await Tour.findOne({
      _id: tourId,
      deleted: { $ne: true },
      status: { $ne: "inactive" },
    }).lean();
    if (!tour) {
      return res.status(404).json({ status: false, message: "Tour không tồn tại hoặc không khả dụng" });
    }

    // Check capacity
    const passengerCount = passengers ? passengers.length : 0;
    if (tour.maxParticipants > 0 && (tour.currentParticipants + passengerCount) > tour.maxParticipants) {
      return res.status(400).json({ status: false, message: "Tour đã hết chỗ" });
    }

    // Create tour snapshot
    const tourSnapshot = {
      date: tour.startDate,
      name: tour.name,
      duration: tour.duration?.text || "",
    };

    const booking = await Booking.create({
      customerId,
      tourId,
      tourSnapshot,
      passengers: passengers || [],
      contactInfo,
      totalAmount,
      paymentStatus: "Pending",
      status: "Pending",
      historyLog: [
        {
          status: "Pending",
          timestamp: new Date(),
          note: "Đặt tour mới",
        },
      ],
    });

    // Update currentParticipants on Tour
    if (passengerCount > 0) {
      await Tour.findByIdAndUpdate(tourId, {
        $inc: { currentParticipants: passengerCount },
      });
    }

    return res.status(201).json({
      status: true,
      message: "Đặt tour thành công",
      data: booking,
    });
  } catch (err) {
    console.error("createBooking error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// List bookings for current customer
export const listBookings = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer._id;
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { customerId, isDeleted: false };
    if (status) filter.status = status;

    const skip = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit) || 20, 50);
    const limitNum = Math.min(parseInt(limit) || 20, 50);

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(filter),
    ]);

    return res.json({
      status: true,
      data: bookings,
      total,
      page: parseInt(page) || 1,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error("listBookings error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// Get single booking detail
export const getBooking = async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Id không hợp lệ" });
    }

    const booking = await Booking.findOne({
      _id: id,
      customerId: req.customer._id,
      isDeleted: false,
    }).lean();

    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking không tồn tại" });
    }

    return res.json({ status: true, data: booking });
  } catch (err) {
    console.error("getBooking error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// Update booking status (cancel by customer)
export const updateBookingStatus = async (req, res) => {
  try {
    await connectDB();

    const { id } = req.params;
    const { status, note } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ status: false, message: "Id không hợp lệ" });
    }

    // Customer can only cancel
    if (status !== "Cancelled") {
      return res.status(400).json({ status: false, message: "Bạn chỉ có thể hủy booking" });
    }

    const booking = await Booking.findOne({
      _id: id,
      customerId: req.customer._id,
      isDeleted: false,
    });

    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking không tồn tại" });
    }

    if (booking.status === "Cancelled" || booking.status === "Completed") {
      return res.status(400).json({ status: false, message: "Không thể hủy booking này" });
    }

    // Restore participants count
    const passengerCount = booking.passengers ? booking.passengers.length : 0;
    if (passengerCount > 0) {
      await Tour.findByIdAndUpdate(booking.tourId, {
        $inc: { currentParticipants: -passengerCount },
      });
    }

    booking.status = "Cancelled";
    booking.historyLog.push({
      status: "Cancelled",
      timestamp: new Date(),
      note: note || "Khách hàng hủy booking",
    });

    await booking.save();

    return res.json({
      status: true,
      message: "Đã hủy booking",
      data: booking,
    });
  } catch (err) {
    console.error("updateBookingStatus error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
