import User from "../models/User.js";
import { verifyToken } from "../utils/auth.js";
import connectDB from "../config/db.js"

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
      decoded = verifyToken(token); // nếu hàm này throw thì catch ở đây
    } catch (e) {
      return res.status(401).json({ status: false, message: "Token không hợp lệ" });
    }

    // decoded nên có { id, tokenVersion }
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
