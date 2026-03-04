import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Favourite from "../models/Favourite.js";
import Tour from "../models/Tour.js";

export const listFavourites = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer?._id;
    if (!customerId) {
      return res.status(401).json({
        status: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    const favourites = await Favourite.find({ customerId })
      .populate({
        path: "tourId",
        select: "_id name category destination images duration price rating reviewCount",
        match: { deleted: { $ne: true }, status: { $ne: "inactive" } },
      })
      .sort({ createdAt: -1 })
      .lean();

    // Filter out any where tour was deleted/inactive (populated as null)
    const validFavourites = favourites
      .filter((f) => f.tourId !== null && typeof f.tourId === 'object')
      .map((f) => {
        const tour = f.tourId;
        if (tour && tour.price) {
          tour.price = {
            adult: Number(tour.price.adult || 0),
            child: Number(tour.price.child || 0),
            infant: Number(tour.price.infant || 0),
            discount: Number(tour.price.discount || 0),
          };
        }
        return f;
      });

    return res.status(200).json({
      status: true,
      message: "OK",
      data: validFavourites,
      total: validFavourites.length,
    });
  } catch (err) {
    console.error("listFavourites error:", err);
    return res.status(500).json({
      status: false,
      message: "Lỗi server",
    });
  }
};

export const addFavouriteByTourId = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer?._id;
    if (!customerId) {
      return res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    }

    const { tourId } = req.params;
    if (!mongoose.isValidObjectId(tourId)) {
      return res.status(400).json({ status: false, message: "tourId không hợp lệ" });
    }

    // Check tour exists
    const tour = await Tour.findOne({
      _id: tourId,
      deleted: { $ne: true },
      status: { $ne: "inactive" },
    }).lean();
    if (!tour) {
      return res.status(404).json({ status: false, message: "Không tìm thấy tour" });
    }

    // Upsert favourite (only store references)
    const doc = await Favourite.findOneAndUpdate(
      { customerId, tourId: tour._id },
      { $setOnInsert: { customerId, tourId: tour._id } },
      { new: true, upsert: true }
    ).lean();

    return res.status(200).json({
      status: true,
      message: "Đã thêm vào yêu thích",
      data: doc,
    });
  } catch (err) {
    console.error("addFavouriteByTourId error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const deleteFavouriteByTourId = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer?._id;
    if (!customerId) {
      return res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    }

    const { tourId } = req.params;
    if (!mongoose.isValidObjectId(tourId)) {
      return res.status(400).json({ status: false, message: "tourId không hợp lệ" });
    }

    const deleted = await Favourite.findOneAndDelete({
      customerId,
      tourId,
    }).lean();

    return res.status(200).json({
      status: true,
      message: deleted ? "Đã xoá khỏi yêu thích" : "Tour này chưa nằm trong yêu thích",
    });
  } catch (err) {
    console.error("deleteFavouriteByTourId error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
