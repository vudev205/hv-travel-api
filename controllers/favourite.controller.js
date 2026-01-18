import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Favourite from "../models/Favourite.js"; // <- đổi path đúng theo project bạn

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

    // ✅ Idempotent upsert: đã có thì không tạo trùng, chưa có thì tạo mới
    const doc = await Favourite.findOneAndUpdate(
      { user: userId, tour: tourId },
      {
        $setOnInsert: {
          user: userId,
          tour: tourId,
          
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
