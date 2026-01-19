import express from "express";
import dotenv from "dotenv";
dotenv.config();

import categoryRoutes from "./routes/category.routes.js";
import cityRoutes from "./routes/city.routes.js";
import tourRoutes from "./routes/tour.routes.js";
import authRoutes from "./routes/auth.routes.js";
import connectDB from "./config/db.js";
import favouriteRoutes from "./routes/favourite.route.js";
import testRoutes from "./routes/test.routes.js";

const app = express();
app.use(express.json());


app.use("/api/tours", tourRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cities", cityRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/favourites", favouriteRoutes);
app.use("/api/test", testRoutes);

app.get("/", (_, res) => {
  res.json({ 
    status: true, 
    message: "HV-Travel API running, Vu dep trai",
    endpoints: {
      test: "/api/test",
      tours: "/api/tours/list",
      cities: "/api/cities/list",
      categories: "/api/categories/list",
      register: "POST /api/auth/register",
      login: "POST /api/auth/login",
      favourites: "/api/favourites/list",
    }
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
});

