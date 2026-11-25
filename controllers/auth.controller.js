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
  consumeVerifiedResetToken,
  createAndSendOTP,
  verifyOTP,
} from "../utils/otpHelper.js";
import connectDB from "../config/db.js";
import mongoose from "mongoose";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const WEB_QR_SESSION_COLLECTION = "webQrLoginSessions";
const QR_STATUS = {
  pending: "pending",
  scanned: "scanned",
  approved: "approved",
  denied: "denied",
  expired: "expired",
  consumed: "consumed",
};

function sendServerError(res, err, message = "Lỗi server") {
  console.error("[AuthController Error]:", err);
  const payload = { status: false, message };
  if (process.env.NODE_ENV !== "production" && err?.message) {
    payload.error = err.message;
  }
  return res.status(500).json(payload);
}

function sanitizeCustomer(customer) {
  const customerData = customer?.toObject ? customer.toObject() : { ...customer };
  delete customerData.password;
  delete customerData.refreshSessions;
  delete customerData.failedLoginAttempts;
  delete customerData.lockUntil;
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

function getWebQrSessionsCollection() {
  return mongoose.connection.db.collection(WEB_QR_SESSION_COLLECTION);
}

async function findWebQrSessionByCode(code) {
  await connectDB();
  return getWebQrSessionsCollection().findOne({ code });
}

async function ensureCurrentQrSession(session) {
  if (!session) {
    return null;
  }

  if (
    session.status === QR_STATUS.consumed ||
    session.status === QR_STATUS.denied ||
    session.status === QR_STATUS.expired
  ) {
    return session;
  }

  const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    const updatedAt = new Date();
    await getWebQrSessionsCollection().updateOne(
      { _id: session._id },
      {
        $set: {
          status: QR_STATUS.expired,
          updatedAt,
        },
      }
    );

    return {
      ...session,
      status: QR_STATUS.expired,
      updatedAt,
    };
  }

  return session;
}

function sanitizeQrResolveResponse(session) {
  return {
    sessionId: session.sessionId,
    browserLabel: session.browserLabel || "",
    expiresAt: session.expiresAt,
    status: session.status,
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
      failedLoginAttempts: 0,
      lockUntil: null,
      refreshSessions: [],
    });

    const issued = issueSessionTokens(customer, { role: "customer", deviceId });
    await customer.save();

    return res.status(201).json({
      status: true,
      data: sanitizeAuthResponse(customer, issued),
    });
  } catch (err) {
    return sendServerError(res, err);
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
    if (!customer) {
      return res.status(401).json({ status: false, message: "Sai thông tin đăng nhập" });
    }

    if (customer.status !== "Active") {
      return res.status(403).json({ status: false, message: "Tài khoản đã bị khóa" });
    }

    const now = new Date();
    if (customer.lockUntil && new Date(customer.lockUntil) > now) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((new Date(customer.lockUntil).getTime() - now.getTime()) / 1000)
      );
      return res.status(423).json({
        status: false,
        message: "Tài khoản tạm thời bị khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau 15 phút.",
        retryAfterSeconds,
      });
    }

    const isPasswordValid = await comparePassword(password, customer.password);
    if (!isPasswordValid) {
      const expiredPreviousLock = Boolean(customer.lockUntil && new Date(customer.lockUntil) <= now);
      const nextAttempts = expiredPreviousLock ? 1 : (customer.failedLoginAttempts || 0) + 1;
      const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      const updateFields = {
        failedLoginAttempts: nextAttempts,
        lockUntil: shouldLock ? new Date(now.getTime() + LOGIN_LOCKOUT_MS) : null,
      };

      await Customer.updateOne({ _id: customer._id }, { $set: updateFields });

      if (shouldLock) {
        return res.status(423).json({
          status: false,
          message: "Tài khoản tạm thời bị khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau 15 phút.",
          retryAfterSeconds: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
        });
      }

      return res.status(401).json({ status: false, message: "Sai thông tin đăng nhập" });
    }

    // Reset failed-login counter & lockout upon successful authentication
    customer.failedLoginAttempts = 0;
    customer.lockUntil = null;
    customer.stats.lastActivity = now;
    const issued = issueSessionTokens(customer, { role: "customer", deviceId });
    await customer.save();

    return res.json({
      status: true,
      data: sanitizeAuthResponse(customer, issued),
    });
  } catch (err) {
    return sendServerError(res, err);
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

    if (customer.status !== "Active") {
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
    const isProd = process.env.NODE_ENV === "production";
    const message =
      !isProd && /invalid|revoked|expired/i.test(err?.message || "")
        ? err.message
        : "Không thể làm mới phiên đăng nhập";
    return res.status(401).json({ status: false, message });
  }
};

export const resolveWebQrLogin = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ status: false, message: "Thiếu mã QR đăng nhập" });
    }

    let session = await findWebQrSessionByCode(code);
    session = await ensureCurrentQrSession(session);

    if (!session) {
      return res.status(404).json({ status: false, message: "Không tìm thấy mã QR đăng nhập" });
    }

    if (
      session.status === QR_STATUS.denied ||
      session.status === QR_STATUS.consumed ||
      session.status === QR_STATUS.expired
    ) {
      return res.status(400).json({
        status: false,
        message: "Mã QR không còn hiệu lực. Vui lòng tạo mã mới trên website.",
      });
    }

    if (session.status === QR_STATUS.pending) {
      const updatedAt = new Date();
      await getWebQrSessionsCollection().updateOne(
        { _id: session._id },
        {
          $set: {
            status: QR_STATUS.scanned,
            updatedAt,
          },
        }
      );

      session = {
        ...session,
        status: QR_STATUS.scanned,
        updatedAt,
      };
    }

    return res.json({ status: true, data: sanitizeQrResolveResponse(session) });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const approveWebQrLogin = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ status: false, message: "Thiếu mã QR đăng nhập" });
    }

    let session = await findWebQrSessionByCode(code);
    session = await ensureCurrentQrSession(session);

    if (!session) {
      return res.status(404).json({ status: false, message: "Không tìm thấy mã QR đăng nhập" });
    }

    if (session.status === QR_STATUS.expired) {
      return res.status(400).json({ status: false, message: "Mã QR đã hết hạn" });
    }

    if (session.status === QR_STATUS.consumed) {
      return res.status(400).json({ status: false, message: "Mã QR này đã được sử dụng" });
    }

    if (session.status === QR_STATUS.denied) {
      return res.status(400).json({ status: false, message: "Yêu cầu đăng nhập đã bị từ chối" });
    }

    const updatedAt = new Date();
    await getWebQrSessionsCollection().updateOne(
      { _id: session._id },
      {
        $set: {
          status: QR_STATUS.approved,
          customerId: String(req.customer?._id ?? ""),
          approvedAt: updatedAt,
          deniedAt: null,
          updatedAt,
        },
      }
    );

    return res.json({
      status: true,
      data: {
        status: QR_STATUS.approved,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
      },
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const denyWebQrLogin = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ status: false, message: "Thiếu mã QR đăng nhập" });
    }

    let session = await findWebQrSessionByCode(code);
    session = await ensureCurrentQrSession(session);

    if (!session) {
      return res.status(404).json({ status: false, message: "Không tìm thấy mã QR đăng nhập" });
    }

    if (session.status === QR_STATUS.expired || session.status === QR_STATUS.consumed) {
      return res.status(400).json({
        status: false,
        message: "Mã QR không còn hiệu lực. Vui lòng tạo mã mới trên website.",
      });
    }

    const updatedAt = new Date();
    await getWebQrSessionsCollection().updateOne(
      { _id: session._id },
      {
        $set: {
          status: QR_STATUS.denied,
          deniedAt: updatedAt,
          updatedAt,
        },
      }
    );

    return res.json({ status: true, data: { status: QR_STATUS.denied } });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const me = async (req, res) => {
  try {
    await connectDB();
    return res.json({ status: true, data: req.customer });
  } catch (err) {
    return sendServerError(res, err);
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
    return sendServerError(res, err);
  }
};

export const getSessions = async (req, res) => {
  try {
    await connectDB();
    const customer = await Customer.findById(req.customer?._id).select("refreshSessions");

    if (!customer) {
      return res.status(401).json({ status: false, message: "Không tìm thấy tài khoản" });
    }

    return res.json({
      status: true,
      data: listCustomerSessions(customer, req.authSessionId),
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const logoutSession = async (req, res) => {
  try {
    await connectDB();
    const customer = await Customer.findById(req.customer?._id);

    if (!customer) {
      return res.status(401).json({ status: false, message: "Không tìm thấy tài khoản" });
    }

    const revokedSession = revokeSessionById(customer, req.params.sessionId);
    if (!revokedSession) {
      return res.status(404).json({ status: false, message: "Không tìm thấy phiên đăng nhập" });
    }

    await customer.save();

    return res.status(200).json({ status: true, message: "Đăng xuất thiết bị thành công" });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const logoutAll = async (req, res) => {
  try {
    await connectDB();
    const customer = await Customer.findById(req.customer?._id);

    if (!customer) {
      return res.status(401).json({ status: false, message: "Không tìm thấy tài khoản" });
    }

    revokeAllCustomerSessions(customer);
    await customer.save();

    return res.status(200).json({ status: true, message: "Đã đăng xuất mọi thiết bị" });
  } catch (err) {
    return sendServerError(res, err);
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
    return sendServerError(res, err);
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
    return sendServerError(res, err);
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
      resetToken: result.resetToken,
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const resetPassword = async (req, res) => {
  try {
    await connectDB();
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ status: false, message: "Mật khẩu phải có ít nhất 8 ký tự" });
    }

    const email = await consumeVerifiedResetToken(resetToken, "forgot_password");
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
    customer.failedLoginAttempts = 0;
    customer.lockUntil = null;
    revokeAllCustomerSessions(customer);
    await customer.save();

    return res.status(200).json({
      status: true,
      message: "Đặt lại mật khẩu thành công!",
    });
  } catch (err) {
    return sendServerError(res, err);
  }
};

export const changePassword = async (req, res) => {
  try {
    await connectDB();
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập đầy đủ thông tin" });
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ status: false, message: "Mật khẩu mới phải có ít nhất 8 ký tự" });
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
    return sendServerError(res, err);
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
    console.error("[AuthController dbCheck Error]:", err);
    const payload = {
      ok: false,
      message: "Loi server",
    };
    if (process.env.NODE_ENV !== "production" && err?.message) {
      payload.error = err.message;
    }
    return res.status(500).json(payload);
  }
};
