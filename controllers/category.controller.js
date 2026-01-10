import Category from "../models/Category.js";
import connectDB from "../config/db.js";

export const getCategories = async (req, res) => {
  try {
    await connectDB();

    const categories = await Category.find({
      deleted: false,
      status: "active"
    })
      .sort({ position: 1 })
      .lean();

    res.json({
      status: true,
      data: categories
    });
  } catch (err) {
    console.error("getCategories error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server"
    });
  }
};

export const createCategory = async (req, res) => {
  try {
    await connectDB();

    const { name, slug, position } = req.body;

    const exists = await Category.findOne({ slug });
    if (exists) {
      return res.status(400).json({
        status: false,
        message: "Slug đã tồn tại"
      });
    }

    const category = await Category.create({
      name,
      slug,
      position
    });

    res.json({
      status: true,
      data: category
    });
  } catch (err) {
    console.error("createCategory error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server"
    });
  }
};
