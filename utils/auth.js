import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import validator from "validator";

// Secret key cho JWT (nên lưu trong .env)
const JWT_SECRET = process.env.JWT_SECRET || "HV-Travel-Vip-Pro";
const JWT_EXPIRES_IN = "365d"; // Token hết hạn sau 7 ngày

// Hash password
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

// So sánh password
export async function comparePassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

// Tạo JWT token
export function generateToken(user) {
  return jwt.sign({ 
    id: user._id,
    tokenVersion: user.tokenVersion
  }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

// Verify JWT token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Validate registration data
export function validateRegister(data) {
  const errors = {};

  // Check full name
  if (!data.fullName || data.fullName.trim().length < 2) {
    errors.fullName = "Họ tên phải có ít nhất 2 ký tự";
  }

  // Check email
  if (!data.email) {
    errors.email = "Vui lòng nhập email";
  } else if (!validator.isEmail(data.email)) {
    errors.email = "Email không hợp lệ";
  }

  // Check password
  if (!data.password) {
    errors.password = "Vui lòng nhập mật khẩu";
  } else if (data.password.length < 6) {
    errors.password = "Mật khẩu phải có ít nhất 6 ký tự";
  }

  // Check re-password
  if (!data.rePassword) {
    errors.rePassword = "Vui lòng nhập lại mật khẩu";
  } else if (data.password !== data.rePassword) {
    errors.rePassword = "Mật khẩu nhập lại không khớp";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

// Validate login data
export function validateLogin(data) {
  const errors = {};

  if (!data.email) {
    errors.email = "Vui lòng nhập email";
  } else if (!validator.isEmail(data.email)) {
    errors.email = "Email không hợp lệ";
  }

  if (!data.password) {
    errors.password = "Vui lòng nhập mật khẩu";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}