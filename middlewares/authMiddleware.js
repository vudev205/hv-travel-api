import User from "../models/User.js";
import Customer from "../models/Customer.js";
import { verifyToken } from "../utils/auth.js";
import connectDB from "../config/db.js"

// Admin/Staff auth middleware — looks up User model
export async function auth(req, res, next) {
  try {
    await connectDB();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (e) {
      return res.status(401).json({ status: false, message: "Token không hợp lệ" });
    }

    if (!decoded?.id) {
      return res.status(401).json({ status: false, message: "Token không hợp lệ" });
    }

    const user = await User.findById(decoded.id).select("_id tokenVersion role email fullName");
    if (!user) {
      return res.status(401).json({ status: false, message: "User không tồn tại" });
    }

    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ status: false, message: "Phiên đã hết hạn" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("auth middleware error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
}

// Customer auth middleware — looks up Customer model (for mobile app)
export async function customerAuth(req, res, next) {
  try {
    await connectDB();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (e) {
      return res.status(401).json({ status: false, message: "Token không hợp lệ" });
    }

    if (!decoded?.id) {
      return res.status(401).json({ status: false, message: "Token không hợp lệ" });
    }

    // Must be a customer-role token
    if (decoded.role !== "customer") {
      return res.status(403).json({ status: false, message: "Không có quyền truy cập" });
    }

    const customer = await Customer.findById(decoded.id).select(
      "_id tokenVersion email fullName phoneNumber avatarUrl address segment status stats customerCode"
    );

    if (!customer) {
      return res.status(401).json({ status: false, message: "Tài khoản không tồn tại" });
    }

    if (customer.status === "Banned") {
      return res.status(403).json({ status: false, message: "Tài khoản đã bị khóa" });
    }

    if (decoded.tokenVersion !== customer.tokenVersion) {
      return res.status(401).json({ status: false, message: "Phiên đã hết hạn" });
    }

    req.customer = customer;
    next();
  } catch (err) {
    console.error("customerAuth middleware error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
}
