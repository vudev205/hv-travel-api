import Tour from "../models/Tour.js";
import connectDB from "../config/db.js";

export const listTours = async (req, res) => {
  try {
    await connectDB();

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 999);
    const start = Math.max(parseInt(req.query.start, 10) || 0, 0);
    const { category, city } = req.query;

    const query = { deleted: { $ne: true }, status: { $ne: "inactive" } };

    // Filter by category name (string)
    if (category) query.category = category;

    // Filter by destination city (string)
    if (city) query["destination.city"] = city;

    const tours = await Tour.find(query)
      .skip(start)
      .limit(limit)
      .select("_id name category destination images duration price rating reviewCount maxParticipants currentParticipants startDate")
      .lean();

    // Transform Decimal128 to Number
    const transformedTours = tours.map(t => ({
      ...t,
      price: {
        adult: Number(t.price.adult),
        child: Number(t.price.child),
        infant: Number(t.price.infant),
        discount: Number(t.price.discount || 0)
      }
    }));

    return res.json({ status: true, count: transformedTours.length, data: transformedTours });
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
      deleted: { $ne: true },
      status: { $ne: "inactive" },
    }).lean();

    if (!tour) {
      return res.status(404).json({ status: false, message: "Tour không tồn tại" });
    }

    // Transform Decimal128 to Number
    if (tour.price) {
      tour.price = {
        adult: Number(tour.price.adult || 0),
        child: Number(tour.price.child || 0),
        infant: Number(tour.price.infant || 0),
        discount: Number(tour.price.discount || 0)
      };
    }

    return res.json({ status: true, data: tour });
  } catch (e) {
    console.error("tourDetail error:", e);
    return res.status(500).json({ status: false, message: "Không lấy được chi tiết tour" });
  }
};
