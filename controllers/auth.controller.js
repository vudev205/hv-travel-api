import Customer from "../models/Customer.js";
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

export const register = async (req, res) => {
  try {
    await connectDB();
    const { fullName, email, password, rePassword } = req.body;

    const validation = validateRegister({ fullName, email, password, rePassword });
    if (!validation.isValid)
      return res.status(400).json({ status: false, errors: validation.errors });

    const exists = await Customer.findOne({ email: email.toLowerCase() });
    if (exists)
      return res.status(400).json({ status: false, message: "Email đã tồn tại" });

    const customer = await Customer.create({
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      password: await hashPassword(password),
      phoneNumber: "",
      avatarUrl: null,
      address: {},
      segment: "New",
      status: "Active",
      stats: { loyaltyPoints: 0, lastActivity: new Date() },
      emailVerified: false,
      tokenVersion: 0
    });

    const token = generateToken(customer, "customer");

    // Don't return password
    const customerData = customer.toObject();
    delete customerData.password;

    res.status(201).json({
      status: true,
      data: { customer: customerData, token }
    });
  }
  catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    await connectDB();
    const { email, password } = req.body;

    const validation = validateLogin({ email, password });
    if (!validation.isValid)
      return res.status(400).json({ status: false, errors: validation.errors });

    const customer = await Customer.findOne({ email: email.toLowerCase() }).select("+password");
    if (!customer || !(await comparePassword(password, customer.password)))
      return res.status(401).json({ status: false, message: "Sai thông tin đăng nhập" });

    if (customer.status === "Banned")
      return res.status(403).json({ status: false, message: "Tài khoản đã bị khóa" });

    // Update last activity
    customer.stats.lastActivity = new Date();
    await customer.save();

    const token = generateToken(customer, "customer");

    // Don't return password
    const customerData = customer.toObject();
    delete customerData.password;

    res.json({ status: true, data: { customer: customerData, token } });
  }
  catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
};

export const me = async (req, res) => {
  try {
    await connectDB();
    res.json({ status: true, data: req.customer });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
};

export const logout = async (req, res) => {
  try {
    await connectDB();
    const customer = req.customer;
    if (!customer) return res.status(401).json({ status: false, message: "Không tìm thấy tài khoản" });
    customer.tokenVersion = (customer.tokenVersion || 0) + 1;
    await customer.save();
    res.status(200).json({ status: true, message: "Đăng xuất thành công" });
  }
  catch (err) {
    console.log("Lỗi khi đăng xuất: " + err);
    res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

// Forgot Password (OTP)
export const forgotPassword = async (req, res) => {
  try {
    await connectDB();
    const { email } = req.body;
    if (!email) return res.status(400).json({ status: false, message: "Vui lòng nhập email" });

    const customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) return res.status(404).json({ status: false, message: "Email chưa được đăng ký trên hệ thống!" });

    const otpId = await createAndSendOTP(email, 'forgot_password');

    res.status(200).json({ status: true, otpId: otpId, message: "Mã OTP đã được gửi đến email của bạn." });
  }
  catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

// Resend OTP
export const resendOtp = async (req, res) => {
  try {
    await connectDB();
    const { email } = req.body;
    if (!email) return res.status(400).json({ status: false, message: "Vui lòng nhập email" });

    const customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) return res.status(404).json({ status: false, message: "Email chưa được đăng ký trên hệ thống!" });

    const otpId = await createAndSendOTP(email, 'forgot_password');

    res.status(200).json({ status: true, otpId: otpId, message: "Mã OTP đã được gửi đến email của bạn." });
  }
  catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

//Verify OTP
export const verifyOtp = async (req, res) => {
  try {
    await connectDB();
    const { otpId, otp } = req.body;
    if (!otpId || !otp) return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin" });

    const result = await verifyOTP(otpId, otp, 'forgot_password');
    if (!result.success) return res.status(400).json({ status: false, message: result.message });

    res.json({ status: true, message: "Xác thực OTP thành công", otpId: result.otpId });
  }
  catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

// Reset Password (OTP)
export const resetPassword = async (req, res) => {
  try {
    await connectDB();
    const { otpId, newPassword } = req.body;
    if (!otpId || !newPassword) return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin" });
    if (newPassword.length < 6) return res.status(400).json({ status: false, message: "Mật khẩu phải có ít nhất 6 ký tự" });

    const email = await getVerifiedEmailByOtpId(otpId, 'forgot_password');
    if (!email) {
      return res.status(400).json({ status: false, message: "Phiên xác thực không hợp lệ hoặc đã hết hạn. Vui lòng làm lại." });
    }

    const hashedPassword = await hashPassword(newPassword);
    const customer = await Customer.findOneAndUpdate({ email: email.toLowerCase() }, { password: hashedPassword }, { new: true });
    if (!customer) return res.status(404).json({ status: false, message: "Không tìm thấy tài khoản" });

    res.status(200).json({ status: true, message: "Đặt lại mật khẩu thành công!" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

// Change Password
export const changePassword = async (req, res) => {
  try {
    await connectDB();
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword) return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin" });
    if (newPassword.length < 6) return res.status(400).json({ status: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
    if (currentPassword === newPassword) return res.status(400).json({ status: false, message: "Mật khẩu mới không được trùng mật khẩu cũ" });

    const customer = await Customer.findOne({ email: email.toLowerCase() }).select('+password');
    if (!customer) return res.status(404).json({ status: false, message: "Không tìm thấy tài khoản" });

    const isPasswordValid = await comparePassword(currentPassword, customer.password);
    if (!isPasswordValid) return res.status(401).json({ status: false, message: "Mật khẩu hiện tại không đúng" });

    customer.password = await hashPassword(newPassword);
    await customer.save();

    res.status(200).json({ status: true, message: "Đổi mật khẩu thành công!" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

export const dbCheck = async (req, res) => {
  await connectDB();
  try {
    const state = mongoose.connection.readyState;

    if (state !== 1) {
      return res.status(503).json({
        ok: false,
        message: "Chua ket noi...",
        readyState: state,
      });
    }

    const pingResult = await mongoose.connection.db.admin().ping();

    return res.status(200).json({
      ok: true,
      message: "Da ket noi thanh cong...",
      readyState: state,
      ping: pingResult,
    })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Loi server",
      error: err?.message || String(err),
    })
  }
}