import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Review from "../models/Review.js";
import Tour from "../models/Tour.js";

// Helper: Recalculate and update cached rating/reviewCount on Tour
async function updateTourReviewCache(tourId) {
  const stats = await Review.aggregate([
    { $match: { tourId: new mongoose.Types.ObjectId(tourId), isApproved: true } },
    {
      $group: {
        _id: null,
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const rating = stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;
  const reviewCount = stats.length > 0 ? stats[0].count : 0;

  await Tour.findByIdAndUpdate(tourId, { rating, reviewCount });
}

// Create a review for a tour
export const createReview = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer._id;
    const { tourId, rating, comment } = req.body;

    // Validate tourId
    if (!tourId || !mongoose.isValidObjectId(tourId)) {
      return res.status(400).json({ status: false, message: "tourId không hợp lệ" });
    }

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ status: false, message: "Rating phải từ 1.0 đến 5.0" });
    }

    // Check tour exists
    const tour = await Tour.findById(tourId).lean();
    if (!tour) {
      return res.status(404).json({ status: false, message: "Tour không tồn tại" });
    }

    // Check if already reviewed
    const existing = await Review.findOne({ tourId, customerId });
    if (existing) {
      return res.status(400).json({ status: false, message: "Bạn đã đánh giá tour này rồi" });
    }

    const review = await Review.create({
      tourId,
      customerId,
      rating,
      comment: comment || "",
      isApproved: true, // Auto-approve for now
    });

    // Update cached rating/reviewCount on Tour
    await updateTourReviewCache(tourId);

    return res.status(201).json({
      status: true,
      message: "Đánh giá thành công",
      data: review,
    });
  } catch (err) {
    console.error("createReview error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// List reviews for a tour
export const listReviewsByTour = async (req, res) => {
  try {
    await connectDB();

    const { tourId } = req.query;

    if (!tourId || !mongoose.isValidObjectId(tourId)) {
      return res.status(400).json({ status: false, message: "tourId không hợp lệ" });
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const filter = { tourId, isApproved: true };

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("customerId", "fullName avatarUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);

    return res.json({
      status: true,
      data: reviews,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("listReviewsByTour error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
