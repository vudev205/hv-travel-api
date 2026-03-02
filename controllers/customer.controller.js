import connectDB from "../config/db.js";
import Customer from "../models/Customer.js";

// Get current customer profile
export const getProfile = async (req, res) => {
  try {
    await connectDB();
    return res.json({ status: true, data: req.customer });
  } catch (err) {
    console.error("getProfile error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// Update current customer profile
export const updateProfile = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer._id;
    const { fullName, phoneNumber, avatarUrl, address } = req.body;

    const updateData = {};

    if (fullName !== undefined) {
      if (fullName.trim().length < 2) {
        return res.status(400).json({ status: false, message: "Họ tên phải có ít nhất 2 ký tự" });
      }
      updateData.fullName = fullName.trim();
    }

    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    if (address !== undefined) {
      updateData.address = {
        street: address.street || "",
        city: address.city || "",
        country: address.country || "",
      };
    }

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!customer) {
      return res.status(404).json({ status: false, message: "Tài khoản không tồn tại" });
    }

    return res.json({
      status: true,
      message: "Cập nhật thông tin thành công",
      data: customer,
    });
  } catch (err) {
    console.error("updateProfile error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
