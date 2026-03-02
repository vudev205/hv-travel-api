import dotenv from "dotenv/config";
import express from "express";

import tourRoutes from "./routes/tour.routes.js";
import authRoutes from "./routes/auth.routes.js";
import favouriteRoutes from "./routes/favourite.route.js";
import bookingRoutes from "./routes/booking.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import testRoutes from "./routes/test.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js";
import connectDB from "./config/db.js";

const app = express();
app.use(express.json());


app.use("/api/tours", tourRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/favourites", favouriteRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/test", testRoutes);
app.use("/api/chatbot", chatbotRoutes);

app.get("/", (_, res) => {
  res.json({
    status: true,
    message: "HV-Travel API running",
    endpoints: {
      test: "/api/test",
      tours: "GET /api/tours/list",
      tourDetail: "GET /api/tours/:id",
      register: "POST /api/auth/register",
      login: "POST /api/auth/login",
      me: "GET /api/auth/me",
      favourites: "GET /api/favourites/list",
      bookings: "GET/POST /api/bookings",
      payments: "GET/POST /api/payments",
      reviews: "GET/POST /api/reviews",
      customerProfile: "GET/PUT /api/customers/profile",
    }
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
});
