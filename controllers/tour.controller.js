import mongoose from "mongoose";
import connectDB from "../config/db.js";

const Tour = mongoose.models.Tour || mongoose.model(
  "Tour",
  new mongoose.Schema({}, { collection: "tours", strict: false })
);

export const listTours = async (req, res) => {
  await connectDB();

  const limit = +req.query.limit || 999;
  const start = +req.query.start || 0;

  const tours = await Tour.find({})
    .skip(start)
    .limit(limit)
    .select("_id name category city thumbnail_url time vehicle price newPrice")
    .lean();

  res.json({ status: true, count: tours.length, data: tours });
};

export const tourDetail = async (req, res) => {
  await connectDB();

  const tour = await Tour.findById(req.params.id).lean();
  if (!tour)
    return res.status(404).json({ status: false, message: "Tour không tồn tại" });

  res.json({ status: true, data: tour });
};
