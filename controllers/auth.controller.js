import Customer from "../models/Customer.js";
import {
  comparePassword,
  hashPassword,
  validateLogin,
  validateRegister,
} from "../utils/auth.js";
import {
  hashRefreshToken,
  issueSessionTokens,
  listCustomerSessions,
  revokeAllCustomerSessions,
  revokeSessionById,
  rotateRefreshSession,
} from "../utils/authSession.js";
import {
  createAndSendOTP,
  getVerifiedEmailByOtpId,
  verifyOTP,
} from "../utils/otpHelper.js";
import connectDB from "../config/db.js";
import mongoose from "mongoose";

function sanitizeCustomer(customer) {
  const customerData = customer?.toObject ? customer.toObject() : { ...customer };
  delete customerData.password;
  delete customerData.refreshSessions;
  return customerData;
}

export function sanitizeCustomerForAuth(customer) {
  const customerData = sanitizeCustomer(customer);
  return {
    id: String(customerData?.id ?? customerData?._id ?? ""),
    fullName: customerData?.fullName || "",
    email: customerData?.email || "",
    phoneNumber: customerData?.phoneNumber || "",
    avatarUrl: customerData?.avatarUrl || null,
    customerCode: customerData?.customerCode || "",
  };
}

export function sanitizeAuthResponse(customer, issued) {
  return {
    customer: sanitizeCustomerForAuth(customer),
    accessToken: issued.accessToken,
    refreshToken: issued.refreshToken,
  };
}

export const register = async (req, res) => {
  try {
    await connectDB();
    const { fullName, email, password, rePassword, deviceId } = req.body;

    const validation = validateRegister({ fullName, email, password, rePassword });
    if (!validation.isValid) {
      return res.status(400).json({ status: false, errors: validation.errors });
    }
    if (!deviceId) {
      return res.status(400).json({ status: false, message: "Thiếu deviceId" });
    }

    const exists = await Customer.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(400).json({ status: false, message: "Email đã tồn tại" });
    }

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
      tokenVersion: 0,
      refreshSessions: [],
    });

    const issued = issueSessionTokens(customer, { role: "customer", deviceId });
    await customer.save();

    return res.status(201).json({
      status: true,
      data: sanitizeAuthResponse(customer, issued),
    });
  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    await connectDB();
    const { email, password, deviceId } = req.body;

    const validation = validateLogin({ email, password });
    if (!validation.isValid) {
      return res.status(400).json({ status: false, errors: validation.errors });
    }
    if (!deviceId) {
      return res.status(400).json({ status: false, message: "Thiếu deviceId" });
    }

    const customer = await Customer.findOne({ email: email.toLowerCase() }).select("+password");
    if (!customer || !(await comparePassword(password, customer.password))) {
      return res.status(401).json({ status: false, message: "Sai thông tin đăng nhập" });
    }

    if (customer.status === "Banned") {
      return res.status(403).json({ status: false, message: "Tài khoản đã bị khóa" });
    }

    customer.stats.lastActivity = new Date();
    const issued = issueSessionTokens(customer, { role: "customer", deviceId });
    await customer.save();

    return res.json({
      status: true,
      data: sanitizeAuthResponse(customer, issued),
    });
  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
};

export const refreshToken = async (req, res) => {
  try {
    await connectDB();
    const { refreshToken: plainRefreshToken } = req.body;

    if (!plainRefreshToken) {
      return res.status(400).json({ status: false, message: "Thiếu refresh token" });
    }

    const customer = await Customer.findOne({
      "refreshSessions.refreshTokenHash": hashRefreshToken(plainRefreshToken),
    });

    if (!customer) {
      return res.status(401).json({ status: false, message: "Refresh token không hợp lệ" });
    }

    if (customer.status === "Banned") {
      return res.status(403).json({ status: false, message: "Tài khoản đã bị khóa" });
    }

    const issued = rotateRefreshSession(customer, plainRefreshToken, { role: "customer" });
    customer.stats.lastActivity = new Date();
    await customer.save();

    return res.json({
      status: true,
      data: sanitizeAuthResponse(customer, issued),
    });
  } catch (err) {
    const message =
      /invalid|revoked|expired/i.test(err?.message || "")
        ? err.message
        : "Không thể làm mới phiên đăng nhập";
    return res.status(401).json({ status: false, message });
  }
};

export const me = async (req, res) => {
  try {
    await connectDB();
    return res.json({ status: true, data: req.customer });
  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
};

export const logout = async (req, res) => {
  try {
    await connectDB();
    const customer = await Customer.findById(req.customer?._id);

    if (!customer) {
      return res.status(401).json({ status: false, message: "Không tìm thấy tài khoản" });
    }

    revokeSessionById(customer, req.authSessionId);
    await customer.save();

    return res.status(200).json({ status: true, message: "Đăng xuất thành công" });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const getSessions = async (req, res) => {
  try {
    await connectDB();
    const customer = await Customer.findById(req.customer?._id).select("refreshSessions");

    if (!customer) {
      return res.status(401).json({ status: false, message: "KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n" });
    }

    return res.json({
      status: true,
      data: listCustomerSessions(customer, req.authSessionId),
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lá»—i server" });
  }
};

export const logoutSession = async (req, res) => {
  try {
    await connectDB();
    const customer = await Customer.findById(req.customer?._id);

    if (!customer) {
      return res.status(401).json({ status: false, message: "KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n" });
    }

    const revokedSession = revokeSessionById(customer, req.params.sessionId);
    if (!revokedSession) {
      return res.status(404).json({ status: false, message: "KhÃ´ng tÃ¬m tháº¥y phiÃªn Ä‘Äƒng nháº­p" });
    }

    await customer.save();

    return res.status(200).json({ status: true, message: "ÄÄƒng xuáº¥t thiáº¿t bá»‹ thÃ nh cÃ´ng" });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lá»—i server" });
  }
};

export const logoutAll = async (req, res) => {
  try {
    await connectDB();
    const customer = await Customer.findById(req.customer?._id);

    if (!customer) {
      return res.status(401).json({ status: false, message: "KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n" });
    }

    revokeAllCustomerSessions(customer);
    await customer.save();

    return res.status(200).json({ status: true, message: "ÄÃ£ Ä‘Äƒng xuáº¥t má»i thiáº¿t bá»‹" });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lá»—i server" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    await connectDB();
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập email" });
    }

    const customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) {
      return res
        .status(404)
        .json({ status: false, message: "Email chưa được đăng ký trên hệ thống!" });
    }

    const otpId = await createAndSendOTP(email, "forgot_password");
    return res.status(200).json({
      status: true,
      otpId,
      message: "Mã OTP đã được gửi đến email của bạn.",
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

export const resendOtp = async (req, res) => {
  try {
    await connectDB();
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập email" });
    }

    const customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) {
      return res
        .status(404)
        .json({ status: false, message: "Email chưa được đăng ký trên hệ thống!" });
    }

    const otpId = await createAndSendOTP(email, "forgot_password");
    return res.status(200).json({
      status: true,
      otpId,
      message: "Mã OTP đã được gửi đến email của bạn.",
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    await connectDB();
    const { otpId, otp } = req.body;
    if (!otpId || !otp) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin" });
    }

    const result = await verifyOTP(otpId, otp, "forgot_password");
    if (!result.success) {
      return res.status(400).json({ status: false, message: result.message });
    }

    return res.json({
      status: true,
      message: "Xác thực OTP thành công",
      otpId: result.otpId,
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    await connectDB();
    const { otpId, newPassword } = req.body;

    if (!otpId || !newPassword) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ status: false, message: "Mật khẩu phải có ít nhất 6 ký tự" });
    }

    const email = await getVerifiedEmailByOtpId(otpId, "forgot_password");
    if (!email) {
      return res.status(400).json({
        status: false,
        message: "Phiên xác thực không hợp lệ hoặc đã hết hạn. Vui lòng làm lại.",
      });
    }

    const customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) {
      return res.status(404).json({ status: false, message: "Không tìm thấy tài khoản" });
    }

    customer.password = await hashPassword(newPassword);
    revokeAllCustomerSessions(customer);
    await customer.save();

    return res.status(200).json({
      status: true,
      message: "Đặt lại mật khẩu thành công!",
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    await connectDB();
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin" });
    }
    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ status: false, message: "Mật khẩu mới phải có ít nhất 6 ký tự" });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({
        status: false,
        message: "Mật khẩu mới không được trùng mật khẩu cũ",
      });
    }

    const customer = await Customer.findById(req.customer?._id).select("+password");
    if (!customer) {
      return res.status(404).json({ status: false, message: "Không tìm thấy tài khoản" });
    }

    const isPasswordValid = await comparePassword(currentPassword, customer.password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ status: false, message: "Mật khẩu hiện tại không đúng" });
    }

    customer.password = await hashPassword(newPassword);
    revokeAllCustomerSessions(customer);
    await customer.save();

    return res.status(200).json({
      status: true,
      message: "Đổi mật khẩu thành công!",
    });
  } catch (err) {
    return res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
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
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Loi server",
      error: err?.message || String(err),
    });
  }
};
