import Tour from "../models/Tour.js";
import connectDB from "../config/db.js";

export const listTours = async (req, res) => {
  try {
    await connectDB();

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 999);
  const start = Math.max(parseInt(req.query.start, 10) || 0, 0);

    const query = { deleted: false, status: "active" };

    const tours = await Tour.find(query)
      .skip(start)
      .limit(limit)
      .select("_id name category city thumbnail_url time vehicle price newPrice")
      .lean();

    return res.json({ status: true, count: tours.length, data: tours });
  } catch (e) {
    console.error("listTours error:", e);
    return res.status(500).json({ status: false, message: "Không lấy được danh sách tour" });
  }
};

export const tourDetail = async (req, res) => {
  try {
    await connectDB();

    const tour = await Tour.findOne({
      _id: req.params.id,
      deleted: false,
      status: "active",
    }).lean();

    if (!tour) {
      return res.status(404).json({ status: false, message: "Tour không tồn tại" });
    }

    return res.json({ status: true, data: tour });
  } catch (e) {
    console.error("tourDetail error:", e);
    return res.status(500).json({ status: false, message: "Không lấy được chi tiết tour" });
  }
};
