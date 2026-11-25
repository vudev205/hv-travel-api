import "dotenv/config";
import express from "express";
import cors from "cors";

import tourRoutes from "./routes/tour.routes.js";
import authRoutes from "./routes/auth.routes.js";
import favouriteRoutes from "./routes/favourite.route.js";
import bookingRoutes from "./routes/booking.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import testRoutes from "./routes/test.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import tourInteractionRoutes from "./routes/tourInteraction.routes.js";
import connectDB from "./config/db.js";
import { debugEndpointGuard } from "./middlewares/authMiddleware.js";
import {
  createRateLimiter,
  globalErrorHandler,
  ipBlocklist,
  mongoSanitize,
  securityHeaders,
} from "./middlewares/securityMiddleware.js";

const app = express();
app.set("trust proxy", 1);

// 1. Security Headers & Strict CORS
const isProduction = process.env.NODE_ENV === "production";
const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => Boolean(o) && o !== "*");

app.use(securityHeaders);
app.use(
  cors({
    origin(origin, callback) {
      // Allow mobile apps / server-to-server calls without Origin header
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // In non-production dev environments, allow localhost when CORS_ORIGINS is unset
      if (!isProduction && allowedOrigins.length === 0 && LOCALHOST_ORIGIN_REGEX.test(origin)) {
        return callback(null, true);
      }
      const err = new Error("Origin không được phép bởi chính sách CORS");
      err.status = 403;
      return callback(err, false);
    },
    credentials: true,
  })
);

// 2. Bounded Body Parser & NoSQL Injection Sanitizer
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(ipBlocklist.middleware);
app.use(mongoSanitize);

// 3. Rate Limiting (Global API + Strict Auth Brute-Force Limiter)
const globalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 150,
  keyPrefix: "api-global",
  message: "Bạn gửi quá nhiều yêu cầu. Vui lòng chờ 1 phút và thử lại.",
});
const authStrictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyPrefix: "auth-strict",
  message: "Quá nhiều lần thử đăng nhập/xác thực từ IP của bạn. Vui lòng thử lại sau 15 phút.",
});

app.use("/api", globalApiLimiter);
app.use("/api/auth/login", authStrictLimiter);
app.use("/api/auth/register", authStrictLimiter);
app.use("/api/auth/forgot-password", authStrictLimiter);
app.use("/api/auth/verify-otp", authStrictLimiter);
app.use("/api/auth/reset-password", authStrictLimiter);
app.use("/api/auth/resend-otp", authStrictLimiter);

app.use("/api/tours", tourRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/favourites", favouriteRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/test", debugEndpointGuard, testRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/interactions", tourInteractionRoutes);

app.get("/", (_, res) => {
  res.json({
    status: true,
    message: "HV-Travel API running",
    status_mongodb: connectDB ? "Connected" : "Not Connected",
    endpoints: {
      tours: "GET /api/tours/list",
      tourSearch: "GET /api/tours/search",
      tourSearchBootstrap: "GET /api/tours/search/bootstrap",
      tourDetail: "GET /api/tours/:id",
      register: "POST /api/auth/register",
      login: "POST /api/auth/login",
      me: "GET /api/auth/me",
      favourites: "GET /api/favourites/list",
      bookings: "GET/POST /api/bookings",
      payments: "GET/POST /api/payments",
      reviews: "GET/POST /api/reviews",
      customerProfile: "GET/PUT /api/customers/profile",
      chat: "GET /api/chat/conversations",
      chatBootstrap: "POST /api/chat/conversations/bootstrap",
      chatAdminQueue: "GET /api/chat/admin/queue",
      aiRecommendation: "POST /api/ai/recommend",
      aiOptimizeRoute: "POST /api/ai/optimize-route",
      tourView: "POST /api/interactions/tours/:tourId/view",
    },
  });
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
});
