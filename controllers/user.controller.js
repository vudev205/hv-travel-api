import User from "../models/User.js";
import {
  hashPassword,
  comparePassword,
  generateToken,
  validateRegister,
  validateLogin
} from "../utils/auth.js";
import { createAndSendOTP, verifyOTP, getVerifiedEmailByOtpId } from "../utils/otpHelper.js";
import connectDB from "../config/db.js";
import mongoose from "mongoose"

export const me = async (req, res) => {
  try {
    await connectDB();
    res.json({ status: true, data: req.user });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    await connectDB();

    const userId = req.user._id;
    const { phone, gender, birthday, address } = req.body;

    // Chỉ update field nào được gửi lên
    const updateData = {};
    if (phone !== undefined) updateData.phone = phone;
    if (gender !== undefined) updateData.gender = gender;
    if (birthday !== undefined) updateData.birthday = birthday;
    if (address !== undefined) updateData.address = address;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: false,
        message: "Không có dữ liệu để cập nhật"
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Không tìm thấy người dùng"
      });
    }

    return res.json({
      status: true,
      message: "Cập nhật thông tin thành công",
      data: user
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: "Lỗi server"
    });
  }
};
