import User from "../models/User.js";
import { verifyToken } from "../utils/auth.js";

export async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    return res.status(401).json({ message: "User không tồn tại" });
  }

  if (decoded.tokenVersion !== user.tokenVersion) {
    return res.status(401).json({ message: "Phiên đã hết hạn" });
  }

  req.user = user;
  next();
}
