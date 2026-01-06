import express from "express";
import mongoose from "mongoose";
import User from "./models/User.js";
import { 
  hashPassword, 
  generateToken,
  validateRegister,
  comparePassword,
  validateLogin 
} from "./utils/auth.js";

const app = express();
const port = process.env.PORT || 3000;

// QUAN TRỌNG: Parse JSON body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI not defined");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'HV-Travel',
      serverSelectionTimeoutMS: 10000,
    });
    isConnected = true;
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
    isConnected = false;
    throw err;
  }
}

// Schemas cho tours, cities, categories (giữ nguyên)
const tourSchema = new mongoose.Schema({}, { collection: 'tours', strict: false });
const citySchema = new mongoose.Schema({}, { collection: 'cities', strict: false });
const categorySchema = new mongoose.Schema({}, { collection: 'categories', strict: false });

const Tour = mongoose.models.Tour || mongoose.model('Tour', tourSchema);
const City = mongoose.models.City || mongoose.model('City', citySchema);
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: true, 
    message: "HV-Travel API is running",
    endpoints: {
      test: "/api/test",
      tours: "/api/tours",
      cities: "/api/cities",
      categories: "/api/categories",
      register: "POST /api/auth/register",
      login: "POST /api/auth/login"
    }
  });
});

// ==================== AUTH ENDPOINTS ====================

// Register endpoint
app.post("/api/auth/register", async (req, res) => {
  try {
    await connectDB();

    const { fullName, email, password, rePassword } = req.body;

    // Validate input
    const validation = validateRegister({ fullName, email, password, rePassword });
    if (!validation.isValid) {
      return res.status(400).json({
        status: false,
        message: "Dữ liệu không hợp lệ",
        errors: validation.errors
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: "Email đã được sử dụng",
        errors: { email: "Email này đã được đăng ký" }
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      password: hashedPassword
    });

    // Generate token
    const token = generateToken(user._id);

    // Return user data (without password)
    res.status(201).json({
      status: true,
      message: "Đăng ký thành công",
      data: {
        user: {
          id: user._id.toString(),
          fullName: user.fullName,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          createdAt: user.createdAt
        },
        token
      }
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server",
      error: err.message
    });
  }
});

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    await connectDB();

    const { email, password } = req.body;

    // Validate input
    const validation = validateLogin({ email, password });
    if (!validation.isValid) {
      return res.status(400).json({
        status: false,
        message: "Dữ liệu không hợp lệ",
        errors: validation.errors
      });
    }

    // Find user (include password field)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        status: false,
        message: "Email hoặc mật khẩu không đúng",
        errors: { auth: "Thông tin đăng nhập không chính xác" }
      });
    }

    // Compare password
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        status: false,
        message: "Email hoặc mật khẩu không đúng",
        errors: { auth: "Thông tin đăng nhập không chính xác" }
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Return user data (without password)
    res.status(200).json({
      status: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          id: user._id.toString(),
          fullName: user.fullName,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          createdAt: user.createdAt
        },
        token
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server",
      error: err.message
    });
  }
});

// Get current user (protected route example)
app.get("/api/auth/me", async (req, res) => {
  try {
    await connectDB();

    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: false,
        message: "Vui lòng đăng nhập"
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        status: false,
        message: "Token không hợp lệ hoặc đã hết hạn"
      });
    }

    // Get user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Không tìm thấy người dùng"
      });
    }

    res.status(200).json({
      status: true,
      data: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        createdAt: user.createdAt
      }
    });

  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server",
      error: err.message
    });
  }
});

app.post("/api/auth/resend-otp", async (req, res) => {
  try {
    await connectDB();

    const { email, type } = req.body;

    if (!email) {
      return res.status(400).json({
        status: false,
        message: "Vui lòng nhập email"
      });
    }

    // Check user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Email không tồn tại"
      });
    }

    // Gửi OTP mới
    await createAndSendOTP(email, type || 'register');

    res.status(200).json({
      status: true,
      message: "Đã gửi lại mã OTP. Vui lòng kiểm tra email."
    });

  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server",
      error: err.message
    });
  }
});

// 5. Forgot Password (gửi OTP)
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    await connectDB();

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: false,
        message: "Vui lòng nhập email"
      });
    }

    // Check user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Email không tồn tại"
      });
    }

    // Gửi OTP
    await createAndSendOTP(email, 'forgot_password');

    res.status(200).json({
      status: true,
      message: "Mã OTP đã được gửi đến email của bạn."
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server",
      error: err.message
    });
  }
});

// 6. Reset Password (với OTP)
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    await connectDB();

    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        status: false,
        message: "Vui lòng nhập đầy đủ thông tin"
      });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({
        status: false,
        message: "Mật khẩu phải có ít nhất 6 ký tự"
      });
    }

    // Verify OTP
    const result = await verifyOTP(email, otp, 'forgot_password');

    if (!result.success) {
      return res.status(400).json({
        status: false,
        message: result.message
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { password: hashedPassword },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Không tìm thấy người dùng"
      });
    }

    res.status(200).json({
      status: true,
      message: "Đặt lại mật khẩu thành công!"
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server",
      error: err.message
    });
  }
});

// 7. Change Password (yêu cầu current password)
app.post("/api/auth/change-password", async (req, res) => {
  try {
    await connectDB();

    const { email, currentPassword, newPassword } = req.body;

    // Hoặc dùng token từ header
    // const token = req.headers.authorization?.split(' ')[1];
    // const decoded = verifyToken(token);

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        status: false,
        message: "Vui lòng nhập đầy đủ thông tin"
      });
    }

    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({
        status: false,
        message: "Mật khẩu mới phải có ít nhất 6 ký tự"
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        status: false,
        message: "Mật khẩu mới không được trùng với mật khẩu cũ"
      });
    }

    // Find user with password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Không tìm thấy người dùng"
      });
    }

    // Verify current password
    const isPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: false,
        message: "Mật khẩu hiện tại không đúng"
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({
      status: true,
      message: "Đổi mật khẩu thành công!"
    });

  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({
      status: false,
      message: "Lỗi server",
      error: err.message
    });
  }
});

// ==================== OTHER ENDPOINTS (giữ nguyên) ====================

// Test endpoint
app.get("/api/test", async (req, res) => {
  try {
    await connectDB();
    
    const readyState = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    let collections = [];
    if (readyState === 1) {
      const db = mongoose.connection.db;
      const colls = await db.listCollections().toArray();
      collections = colls.map(c => c.name);
    }
    
    res.json({ 
      status: true,
      connectionState: states[readyState],
      database: mongoose.connection.name,
      collections: collections
    });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// Tours endpoint
app.get("/api/tours", async (req, res) => {
  try {
    await connectDB();
    
    const tours = await Tour.find({}).lean().maxTimeMS(5000);
    tours.forEach(t => {
      if (t._id) t._id = t._id.toString();
    });
    
    res.json({ status: true, count: tours.length, data: tours });
  } catch (err) {
    console.error("Tours error:", err);
    res.status(500).json({ status: false, error: err.message });
  }
});

// Cities endpoint
app.get("/api/cities", async (req, res) => {
  try {
    await connectDB();
    
    const cities = await City.find({}).lean().maxTimeMS(5000);
    cities.forEach(c => {
      if (c._id) c._id = c._id.toString();
    });

    res.json({ status: true, count: cities.length, data: cities });
  } catch (err) {
    console.error("Cities error:", err);
    res.status(500).json({ status: false, error: err.message });
  }
});

// Categories endpoint
app.get("/api/categories", async (req, res) => {
  try {
    await connectDB();
    
    const categories = await Category.find({}).lean().maxTimeMS(5000);
    categories.forEach(c => {
      if (c._id) c._id = c._id.toString();
    });

    res.json({ status: true, count: categories.length, data: categories });
  } catch (err) {
    console.error("Categories error:", err);
    res.status(500).json({ status: false, error: err.message });
  }
});

// Export cho Vercel
export default app;

// Local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`\n🚀 Server running at http://localhost:${port}`);
    console.log(`📊 Test: http://localhost:${port}/api/test`);
    console.log(`🎫 Tours: http://localhost:${port}/api/tours`);
    console.log(`🏙️  Cities: http://localhost:${port}/api/cities`);
    console.log(`📂 Categories: http://localhost:${port}/api/categories`);
    console.log(`🔐 Register: POST http://localhost:${port}/api/auth/register`);
    console.log(`🔑 Login: POST http://localhost:${port}/api/auth/login\n`);
  });
}