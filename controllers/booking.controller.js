import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Booking from "../models/Booking.js";
import Tour from "../models/Tour.js";
import {
  resolveBookingStatus,
  resolveTourSnapshotStartDate,
  toBookingResponse,
} from "../utils/bookingResponse.js";

const ALLOWED_PASSENGER_TYPES = new Set(["Adult", "Child", "Infant"]);

// Generate booking code: HVyyyyMMddHHmmssSSS
function generateBookingCode() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return (
    "HV" +
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds()) +
    pad(now.getMilliseconds(), 3)
  );
}

// Create a new booking
export const createBooking = async (req, res) => {
  let reservedSeats = 0;
  let reservedTourId = null;

  try {
    await connectDB();

    const customerId = req.customer._id;
    const customerName = req.customer.fullName || req.customer.name || "";
    const { tour_id, passengers, contact_info, notes } = req.body;

    // Validate tour_id
    if (!tour_id || !mongoose.isValidObjectId(tour_id)) {
      return res.status(400).json({ status: false, message: "tour_id không hợp lệ" });
    }

    // Validate required contact fields
    if (!contact_info || !contact_info.name || !contact_info.email || !contact_info.phone) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin liên hệ" });
    }

    // Validate non-empty passengers array with allowed types
    if (!Array.isArray(passengers) || passengers.length === 0) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập ít nhất một hành khách" });
    }

    const formattedPassengers = [];
    for (const p of passengers) {
      if (!p || typeof p !== "object") {
        return res.status(400).json({ status: false, message: "Thông tin hành khách không hợp lệ" });
      }
      const passengerType = typeof p.type === "string" ? p.type.trim() : "";
      if (!ALLOWED_PASSENGER_TYPES.has(passengerType)) {
        return res.status(400).json({
          status: false,
          message: "Loại hành khách không hợp lệ (chỉ chấp nhận Adult, Child, Infant)",
        });
      }
      const fullName = typeof p.full_name === "string" ? p.full_name.trim() : "";
      if (!fullName) {
        return res.status(400).json({ status: false, message: "Vui lòng nhập họ tên cho tất cả hành khách" });
      }

      formattedPassengers.push({
        full_name: fullName,
        birth_date: p.birth_date || null,
        type: passengerType,
        gender: p.gender || null,
        passport_number: p.passport_number || null,
      });
    }

    const passengerCount = formattedPassengers.length;

    // Atomically verify tour availability and reserve seats in a single conditional update
    const tour = await Tour.findOneAndUpdate(
      {
        _id: tour_id,
        is_deleted: { $ne: true },
        status: { $ne: "Inactive" },
        $or: [
          { max_participants: { $lte: 0 } },
          { max_participants: null },
          { max_participants: { $exists: false } },
          {
            $expr: {
              $lte: [
                { $add: [{ $ifNull: ["$current_participants", 0] }, passengerCount] },
                "$max_participants",
              ],
            },
          },
        ],
      },
      {
        $inc: { current_participants: passengerCount },
      },
      { new: true }
    ).lean();

    if (!tour) {
      const existingTour = await Tour.findOne({
        _id: tour_id,
        is_deleted: { $ne: true },
        status: { $ne: "Inactive" },
      })
        .select("_id")
        .lean();

      if (!existingTour) {
        return res.status(404).json({ status: false, message: "Tour không tồn tại hoặc không khả dụng" });
      }
      return res.status(400).json({ status: false, message: "Tour đã hết chỗ" });
    }

    reservedSeats = passengerCount;
    reservedTourId = tour._id;

    // SERVER-SIDE PRICE CALCULATION
    const adultCount = formattedPassengers.filter((p) => p.type === "Adult").length;
    const childCount = formattedPassengers.filter((p) => p.type === "Child").length;
    const infantCount = formattedPassengers.filter((p) => p.type === "Infant").length;

    const baseAdult = tour.price?.adult || 0;
    const baseChild = tour.price?.child || 0;
    const baseInfant = tour.price?.infant || 0;
    const discountPercent = tour.price?.discount || 0;

    const priceAdult = discountPercent > 0 ? Math.round(baseAdult * (1 - discountPercent / 100)) : baseAdult;

    // Subtotal (no hardcoded magic service fee or promo discount)
    const subtotal = adultCount * priceAdult + childCount * baseChild + infantCount * baseInfant;
    const finalTotal = Math.max(0, subtotal);

    // Build tour snapshot
    const tour_snapshot = {
      code: tour.code || "",
      name: tour.name,
      start_date: resolveTourSnapshotStartDate(contact_info?.selected_date, tour.start_dates),
      duration: tour.duration?.text || "",
    };

    const parts = [];
    if (adultCount > 0) parts.push(`${adultCount} người lớn`);
    if (childCount > 0) parts.push(`${childCount} trẻ em`);
    if (infantCount > 0) parts.push(`${infantCount} em bé`);

    const now = new Date();
    const booking_code = generateBookingCode();

    const booking = await Booking.create({
      booking_code,
      tour_id,
      tour_snapshot,
      customer_id: customerId,
      booking_date: now,
      total_amount: mongoose.Types.Decimal128.fromString(String(finalTotal)),
      status: "Pending",
      payment_status: "Unpaid",
      participants_count: passengerCount,
      passengers: formattedPassengers,
      contact_info,
      notes: notes || "",
      history_log: [
        {
          action: "Tạo đơn đặt tour",
          timestamp: now,
          user: contact_info.name || customerName,
          note: parts.length > 0 ? `Đặt ${parts.join(", ")}` : "Đặt tour mới",
        },
      ],
      created_at: now,
      updated_at: now,
      is_deleted: false,
      deleted_by: null,
      deleted_at: null,
    });

    reservedSeats = 0;

    return res.status(201).json({
      status: true,
      message: "Đặt tour thành công",
      data: toBookingResponse(booking),
    });
  } catch (err) {
    if (reservedSeats > 0 && reservedTourId) {
      try {
        await Tour.findByIdAndUpdate(reservedTourId, {
          $inc: { current_participants: -reservedSeats },
        });
      } catch (rollbackErr) {
        console.error("createBooking seat rollback error:", rollbackErr);
      }
    }
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

    const filter = { customer_id: customerId, is_deleted: false };
    if (status) filter.status = status;

    const skip = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit) || 20, 50);
    const limitNum = Math.min(parseInt(limit) || 20, 50);

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .select(
          "_id customer_id tour_id tour_snapshot booking_code booking_date created_at updated_at status payment_status participants_count total_amount is_deleted"
        )
        .lean(),
      Booking.countDocuments(filter),
    ]);

    const normalizedBookings = bookings.map((booking) => toBookingResponse(booking));

    return res.json({
      status: true,
      data: normalizedBookings,
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
      customer_id: req.customer._id,
      is_deleted: false,
    }).lean();

    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking không tồn tại" });
    }

    return res.json({ status: true, data: toBookingResponse(booking) });
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
      customer_id: req.customer._id,
      is_deleted: false,
    });

    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking không tồn tại" });
    }

    const resolvedStatus = resolveBookingStatus(booking);
    if (resolvedStatus === "Cancelled" || resolvedStatus === "Completed") {
      return res.status(400).json({ status: false, message: "Không thể hủy booking này" });
    }

    // Restore participants count
    const passengerCount = booking.passengers ? booking.passengers.length : 0;
    if (passengerCount > 0) {
      await Tour.findByIdAndUpdate(booking.tour_id, {
        $inc: { current_participants: -passengerCount },
      });
    }

    const customerName = req.customer.fullName || req.customer.name || "";

    booking.status = "Cancelled";
    booking.history_log.push({
      action: "Hủy đơn đặt tour",
      timestamp: new Date(),
      user: customerName,
      note: note || "Khách hàng hủy booking",
    });

    await booking.save();

    return res.json({
      status: true,
      message: "Đã hủy booking",
      data: toBookingResponse(booking),
    });
  } catch (err) {
    console.error("updateBookingStatus error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// Calculate price quote
export const calculatePrice = async (req, res) => {
  try {
    await connectDB();
    const { tour_id, adult_count = 0, child_count = 0, infant_count = 0 } = req.body;

    if (!tour_id || !mongoose.isValidObjectId(tour_id)) {
      return res.status(400).json({ status: false, message: "tour_id không hợp lệ" });
    }

    const adults = Number(adult_count);
    const children = Number(child_count);
    const infants = Number(infant_count);

    if (
      !Number.isInteger(adults) ||
      !Number.isInteger(children) ||
      !Number.isInteger(infants) ||
      adults < 0 ||
      children < 0 ||
      infants < 0 ||
      adults + children + infants === 0
    ) {
      return res.status(400).json({ status: false, message: "Số lượng hành khách không hợp lệ" });
    }

    const tour = await Tour.findOne({
      _id: tour_id,
      is_deleted: { $ne: true },
    }).lean();

    if (!tour) {
      return res.status(404).json({ status: false, message: "Tour không tồn tại" });
    }

    const baseAdult = tour.price?.adult || 0;
    const baseChild = tour.price?.child || 0;
    const baseInfant = tour.price?.infant || 0;
    const discountPercent = tour.price?.discount || 0;

    const priceAdult = discountPercent > 0 ? Math.round(baseAdult * (1 - discountPercent / 100)) : baseAdult;
    const subtotal = adults * priceAdult + children * baseChild + infants * baseInfant;

    const serviceFee = 0;
    const promoDiscount = 0;
    const total = Math.max(0, subtotal);

    return res.json({
      status: true,
      data: {
        subtotal,
        service_fee: serviceFee,
        promo_discount: promoDiscount,
        total,
        price_per_adult: priceAdult,
        price_per_child: baseChild,
        price_per_infant: baseInfant,
        discount_percent: discountPercent,
      },
    });
  } catch (err) {
    console.error("calculatePrice error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
