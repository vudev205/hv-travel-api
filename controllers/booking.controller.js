import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Booking from "../models/Booking.js";
import Tour from "../models/Tour.js";

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
  try {
    await connectDB();

    const customerId = req.customer._id;
    const customerName = req.customer.fullName || req.customer.name || "";
    const { tour_id, passengers, contact_info, notes } = req.body;

    // Validate tour_id
    if (!tour_id || !mongoose.isValidObjectId(tour_id)) {
      return res.status(400).json({ status: false, message: "tour_id không hợp lệ" });
    }

    // Validate required fields
    if (!contact_info || !contact_info.name || !contact_info.email || !contact_info.phone) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin liên hệ" });
    }

    // Check tour exists and is active
    const tour = await Tour.findOne({
      _id: tour_id,
      is_deleted: { $ne: true },
      status: { $ne: "Inactive" },
    }).lean();
    if (!tour) {
      return res.status(404).json({ status: false, message: "Tour không tồn tại hoặc không khả dụng" });
    }

    // Build passengers with full schema
    const passengerList = passengers || [];
    const formattedPassengers = passengerList.map((p) => ({
      full_name: p.full_name || "",
      birth_date: p.birth_date || null,
      type: p.type || "Adult",
      gender: p.gender || null,
      passport_number: p.passport_number || null,
    }));

    // SERVER-SIDE PRICE CALCULATION
    const adultCount = formattedPassengers.filter((p) => p.type === "Adult").length;
    const childCount = formattedPassengers.filter((p) => p.type === "Child").length;
    const infantCount = formattedPassengers.filter((p) => p.type === "Infant").length;

    const baseAdult = tour.price?.adult || 0;
    const baseChild = tour.price?.child || 0;
    const baseInfant = tour.price?.infant || 0;
    const discountPercent = tour.price?.discount || 0;

    const priceAdult = discountPercent > 0 ? Math.round(baseAdult * (1 - discountPercent / 100)) : baseAdult;

    // Subtotal
    const subtotal = (adultCount * priceAdult) + (childCount * baseChild) + (infantCount * baseInfant);

    // Hardcoded fees matching app for now (should come from settings/config later)
    const serviceFee = 6000000;
    const promoDiscount = 5500000;
    const finalTotal = subtotal + serviceFee - promoDiscount;

    // Check capacity
    const passengerCount = formattedPassengers.length;
    if (tour.max_participants > 0 && (tour.current_participants + passengerCount) > tour.max_participants) {
      return res.status(400).json({ status: false, message: "Tour đã hết chỗ" });
    }

    // Build tour snapshot
    const tour_snapshot = {
      code: tour.code || "",
      name: tour.name,
      start_date: (tour.start_dates && tour.start_dates.length > 0) ? tour.start_dates[0] : null,
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
      total_amount: mongoose.Types.Decimal128.fromString(String(Math.max(0, finalTotal))),
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

    // Update current_participants on Tour
    if (passengerCount > 0) {
      await Tour.findByIdAndUpdate(tour_id, {
        $inc: { current_participants: passengerCount },
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

    const filter = { customer_id: customerId, is_deleted: false };
    if (status) filter.status = status;

    const skip = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit) || 20, 50);
    const limitNum = Math.min(parseInt(limit) || 20, 50);

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limitNum)
        .select('_id tour_id tour_snapshot status booking_date created_at booking_code')
        .lean(),
      Booking.countDocuments(filter),
    ]);

    const normalizedBookings = bookings.map((booking) => ({
      ...booking,
      tourId: booking.tour_id,
    }));

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
      customer_id: req.customer._id,
      is_deleted: false,
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
      data: booking,
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
    const subtotal = (adult_count * priceAdult) + (child_count * baseChild) + (infant_count * baseInfant);

    const serviceFee = 6000000;
    const promoDiscount = 5500000;
    const total = subtotal + serviceFee - promoDiscount;

    return res.json({
      status: true,
      data: {
        subtotal,
        service_fee: serviceFee,
        promo_discount: promoDiscount,
        total: Math.max(0, total),
        price_per_adult: priceAdult,
        price_per_child: baseChild,
        price_per_infant: baseInfant,
        discount_percent: discountPercent
      }
    });
  } catch (err) {
    console.error("calculatePrice error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
