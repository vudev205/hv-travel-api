import City from "../models/City.js";
import connectDB from "../config/db.js";

export const getCities = async (req, res) => {
  try {
    await connectDB();

    const cities = await City.find().sort({ name: 1 }).lean();

    res.json({
      status: true,
      data: cities
    });
  } catch (err) {
    console.error("getCities error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server"
    });
  }
};

export const createCity = async (req, res) => {
  try {
    await connectDB();

    const { name } = req.body;

    const city = await City.create({ name });

    res.json({
      status: true,
      data: city
    });
  } catch (err) {
    console.error("createCity error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server"
    });
  }
};
