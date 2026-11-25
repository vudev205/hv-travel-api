import crypto from "node:crypto";
import OtpVerification from "../models/OtpVerification.js";
import { sendOTPEmail } from "./emailService.js";

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

export function generateSecureOTP() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtpValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function timingSafeHashEqual(expectedHex, actualHex) {
  if (typeof expectedHex !== "string" || typeof actualHex !== "string") {
    return false;
  }
  const expectedBuf = Buffer.from(expectedHex, "utf8");
  const actualBuf = Buffer.from(actualHex, "utf8");
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// Encode OTP ID để gửi client
export function encodeOtpId(id) {
  return Buffer.from(id.toString()).toString("base64");
}

// Decode OTP ID từ client
export function decodeOtpId(encoded) {
  if (typeof encoded !== "string" || !encoded.trim()) return null;
  try {
    const str = Buffer.from(encoded, "base64").toString("utf8").trim();
    return str || null;
  } catch {
    return null;
  }
}

// Tạo và gửi OTP (lưu SHA-256 hash thay vì plaintext)
export const createAndSendOTP = async (email, type, deps = {}) => {
  const model = deps.model || OtpVerification;
  const sendEmail = deps.sendEmail || sendOTPEmail;
  const normalizedEmail = String(email || "").trim().toLowerCase();

  try {
    const otp = generateSecureOTP();
    const otpHash = hashOtpValue(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    // Xóa OTP cũ chưa sử dụng của email này (cùng type)
    await model.deleteMany({
      email: normalizedEmail,
      type,
      isUsed: false,
    });

    // Lưu hash của OTP mới
    const newOtp = await model.create({
      email: normalizedEmail,
      otp: otpHash,
      type,
      expiresAt,
      attempts: 0,
      isUsed: false,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      resetTokenUsedAt: null,
    });

    // Gửi email chứa mã OTP gốc
    await sendEmail(normalizedEmail, otp, type);

    // Trả về ID đã mã hóa để client cầm
    return encodeOtpId(newOtp._id);
  } catch (error) {
    console.error("Error creating OTP:", error);
    throw error;
  }
};

// Verify OTP (constant-time comparison, max 5 failed attempts, issues single-use CSPRNG resetToken)
export const verifyOTP = async (encodedOtpId, otp, type, deps = {}) => {
  const model = deps.model || OtpVerification;

  try {
    const id = decodeOtpId(encodedOtpId);
    if (!id) {
      return { success: false, message: "otpId không hợp lệ" };
    }

    const otpRecord = await model.findOne({
      _id: id,
      type,
      isUsed: false,
    });

    if (!otpRecord) {
      return {
        success: false,
        message: "Mã OTP không tồn tại hoặc đã được sử dụng",
      };
    }

    // Check hết hạn
    if (new Date() > new Date(otpRecord.expiresAt)) {
      return {
        success: false,
        message: "Mã OTP đã hết hạn",
      };
    }

    // Check số lần thử tối đa
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      return {
        success: false,
        message: "Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.",
      };
    }

    const candidateOtp = String(otp ?? "").trim();
    const candidateHash = hashOtpValue(candidateOtp);
    const isMatch = timingSafeHashEqual(otpRecord.otp, candidateHash);

    if (!isMatch) {
      otpRecord.attempts += 1;
      if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
        otpRecord.isUsed = true;
      }
      await otpRecord.save();

      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - otpRecord.attempts);
      return {
        success: false,
        message:
          remaining > 0
            ? `Mã OTP không đúng. Còn ${remaining} lần thử.`
            : "Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.",
      };
    }

    // OTP đúng -> sinh CSPRNG resetToken dùng một lần (hiệu lực 10 phút)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = hashResetToken(resetToken);
    const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    const updated = await model.findOneAndUpdate(
      {
        _id: otpRecord._id,
        type,
        isUsed: false,
        attempts: { $lt: MAX_OTP_ATTEMPTS },
      },
      {
        $set: {
          isUsed: true,
          resetTokenHash,
          resetTokenExpiresAt,
          resetTokenUsedAt: null,
          expiresAt: resetTokenExpiresAt,
        },
      },
      { new: true }
    );

    if (!updated) {
      return {
        success: false,
        message: "Mã OTP không tồn tại hoặc đã được sử dụng",
      };
    }

    return {
      success: true,
      otpId: encodedOtpId,
      resetToken,
      message: "Xác thực thành công",
    };
  } catch (error) {
    console.error("Error verifying OTP:", error);
    throw error;
  }
};

// Tiêu thụ (consume & delete) single-use resetToken một cách nguyên tử để chống replay
export async function consumeVerifiedResetToken(resetToken, type, deps = {}) {
  const model = deps.model || OtpVerification;

  if (!resetToken || typeof resetToken !== "string" || !resetToken.trim()) {
    return null;
  }

  const tokenHash = hashResetToken(resetToken.trim());
  const now = new Date();

  const consumedDoc = await model.findOneAndDelete({
    resetTokenHash: tokenHash,
    type,
    isUsed: true,
    resetTokenUsedAt: null,
    resetTokenExpiresAt: { $gt: now },
  });

  return consumedDoc ? consumedDoc.email : null;
}
