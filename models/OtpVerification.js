import mongoose from "mongoose";

const otpVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otp: {
    type: String,
    required: true,
    length: 6
  },
  type: {
    type: String,
    enum: ['register', 'forgot_password', 'change_email'],
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000) // 5 phút
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'otp_verifications' // <- thêm dòng này
});

// Index để tự động xóa OTP đã hết hạn (TTL)
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index để query nhanh
otpVerificationSchema.index({ email: 1, type: 1, isUsed: 1 });

// Dùng lại model nếu đã tồn tại, không thì tạo mới
const OtpVerification = mongoose.models.OtpVerification || 
  mongoose.model('OtpVerification', otpVerificationSchema);

export default OtpVerification;
