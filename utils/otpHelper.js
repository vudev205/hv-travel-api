import OtpVerification from "../models/OtpVerification.js";
import { generateOTP, sendOTPEmail } from "./emailService.js";

// Encode OTP ID để gửi client
export function encodeOtpId(id) {
  return Buffer.from(id.toString()).toString("base64");
}

// Decode OTP ID từ client
export function decodeOtpId(encoded) {
  try {
    const str = Buffer.from(encoded, "base64").toString();
    return str;
  } catch {
    return null;
  }
}

// Tạo và gửi OTP
export const createAndSendOTP = async (email, type) => {
  try {
    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

    // Xóa OTP cũ chưa sử dụng của email này (cùng type)
    await OtpVerification.deleteMany({ 
      email, 
      type, 
      isUsed: false 
    });

    // Lưu OTP mới
    const newOtp = await OtpVerification.create({
      email,
      otp,
      type,
      expiresAt
    });

    // Gửi email
    await sendOTPEmail(email, otp, type);

    // Trả về ID đã mã hóa để client cầm
    return encodeOtpId(newOtp._id); 
  } catch (error) {
    console.error("Error creating OTP:", error);
    throw error;
  }
};

// Verify OTP
export const verifyOTP = async (encodedOtpId, otp, type) => {
  try {
    const id = decodeOtpId(encodedOtpId);
    if (!id) return { success: false, message: "otpId không hợp lệ" };

    // SỬA LỖI Ở ĐÂY: Tìm bằng _id, không tìm bằng email (vì không có email)
    const otpRecord = await OtpVerification.findOne({
      _id: id,
      type,
      isUsed: false
    });
    
    if (!otpRecord) {
      return {
        success: false,
        message: "Mã OTP không tồn tại hoặc đã được sử dụng"
      };
    }

    // Check hết hạn
    if (new Date() > otpRecord.expiresAt) {
      return {
        success: false,
        message: "Mã OTP đã hết hạn"
      };
    }

    // Check số lần thử
    if (otpRecord.attempts >= 5) {
      return {
        success: false,
        message: "Bạn đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới."
      };
    }

    // Kiểm tra OTP
    if (otpRecord.otp !== otp) { // So sánh string
      // Tăng số lần thử sai
      otpRecord.attempts += 1;
      await otpRecord.save();

      return {
        success: false,
        message: `Mã OTP không đúng. Còn ${5 - otpRecord.attempts} lần thử.`
      };
    }

    // OTP đúng → đánh dấu đã sử dụng
    otpRecord.isUsed = true;
    await otpRecord.save();

    return {
      success: true,
      otpId: encodedOtpId, // Trả lại ID để dùng cho bước reset pass
      message: "Xác thực thành công"
    };

  } catch (error) {
    console.error("Error verifying OTP:", error);
    throw error;
  }
};

// Hàm mới: Lấy thông tin từ OtpId (Dùng cho bước Reset Password)
export async function getVerifiedEmailByOtpId(encodedOtpId, type) {
    const id = decodeOtpId(encodedOtpId);
    if (!id) return null;
    
    // Tìm bản ghi đã verify thành công (isUsed: true)
    const otpDoc = await OtpVerification.findOne({ 
        _id: id, 
        type, 
        isUsed: true 
    });

    // Kiểm tra thêm thời gian nếu cần (ví dụ: chỉ cho phép reset trong vòng 15p sau khi verify)
    // Ở đây trả về email nếu tìm thấy
    return otpDoc ? otpDoc.email : null;
}