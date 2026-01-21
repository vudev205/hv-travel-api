import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Favourite from "../models/Favourite.js"; // <- đổi path đúng theo project bạn
import Tour from "../models/Tour.js"

export const listFavourites = async (req, res) => {
  try {
    await connectDB();

    const userId = req.user?._id || req.userId;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Bạn chưa đăng nhập",
      });
    }

    // query optional: ?category=beach (nếu bạn lưu category dạng string) 
    // hoặc ?category=<ObjectId> nếu category là ObjectId
    const { category } = req.query;

    const filter = { user: userId };

    // Nếu Favourite có field category thì mới filter theo category
    // (Hiện schema bạn yêu cầu chưa có category, đoạn này chỉ là optional)
    if (category) {
      if (mongoose.isValidObjectId(category)) filter.category = category;
      else filter.category = category; // string
    }

    const favourites = await Favourite.find(filter)
      .select(
        "_id user tour city name time vehicle price newPrice thumbnail_url createdAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: true,
      message: "OK",
      data: favourites,
      total: favourites.length,
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

    const userId = req.user?._id || req.userId;
    if (!userId) {
      return res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    }

    const { tourId } = req.params;
    if (!mongoose.isValidObjectId(tourId)) {
      return res.status(400).json({ status: false, message: "tourId không hợp lệ" });
    }

    // 1) Lấy tour để copy field
    const tour = await Tour.findById(tourId)
      .select("_id city name time vehicle price newPrice thumbnail_url")
      .lean();

    if (!tour) {
      return res.status(404).json({ status: false, message: "Không tìm thấy tour" });
    }

    // 2) Upsert favourite theo (user, tour) để tránh trùng
    const doc = await Favourite.findOneAndUpdate(
      { user: userId, tour: tour._id },
      {
        $set: {
          // nếu tour thay đổi giá / thumbnail, bạn muốn favourite luôn update theo tour:
          city: tour.city,
          name: tour.name,
          time: tour.time,
          vehicle: tour.vehicle,
          price: tour.price,
          newPrice: tour.newPrice,
          thumbnail_url: tour.thumbnail_url,
        },
        $setOnInsert: {
          user: userId,
          tour: tour._id,
        },
      },
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

    const userId = req.user?._id || req.userId;
    if (!userId) {
      return res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    }

    const { tourId } = req.params;
    if (!mongoose.isValidObjectId(tourId)) {
      return res.status(400).json({ status: false, message: "tourId không hợp lệ" });
    }

    const deleted = await Favourite.findOneAndDelete({
      user: userId,
      tour: tourId,
    }).lean();

    // ✅ idempotent: xoá rồi / chưa có cũng coi như OK (UI đỡ phải xử lý 404)
    return res.status(200).json({
      status: true,
      message: deleted ? "Đã xoá khỏi yêu thích" : "Tour này chưa nằm trong yêu thích",
    });
  } catch (err) {
    console.error("deleteFavouriteByTourId error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
