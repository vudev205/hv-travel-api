// server.js
import 'dotenv/config'; // tự động load .env
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
import { createAndSendOTP, verifyOTP, getVerifiedEmailByOtpId } from "./utils/otpHelper.js";
import { verifyToken } from "./utils/auth.js";

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
  if (isConnected && mongoose.connection.readyState === 1) return;

  const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  try {
    await mongoose.connect(mongoUri, {
      dbName: 'HV-Travel',
      serverSelectionTimeoutMS: 10000,
    });
    isConnected = true;
    console.log(`✅ MongoDB connected (${mongoUri})`);
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
    isConnected = false;
    throw err;
  }
}

// ==================== SCHEMAS ====================
const tourSchema = new mongoose.Schema({}, { collection: 'tours', strict: false });
const citySchema = new mongoose.Schema({}, { collection: 'cities', strict: false });
const categorySchema = new mongoose.Schema({}, { collection: 'categories', strict: false });

const Tour = mongoose.models.Tour || mongoose.model('Tour', tourSchema);
const City = mongoose.models.City || mongoose.model('City', citySchema);
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

// ==================== ROOT ====================
app.get("/", (req, res) => {
  res.json({ 
    status: true, 
    message: "HV-Travel API is running",
    endpoints: {
      test: "/api/test",
      tours: "/api/tours/list",
      cities: "/api/cities/list",
      categories: "/api/categories/list",
      register: "POST /api/auth/register",
      login: "POST /api/auth/login"
    }
  });
});

// ==================== AUTH ENDPOINTS ====================

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    await connectDB();
    const { fullName, email, password, rePassword } = req.body;

    const validation = validateRegister({ fullName, email, password, rePassword });
    if (!validation.isValid) return res.status(400).json({ status:false, message:"Dữ liệu không hợp lệ", errors: validation.errors });

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ status:false, message:"Email đã được sử dụng", errors:{ email:"Email đã đăng ký" }});

    const hashedPassword = await hashPassword(password);

    const user = await User.create({ fullName: fullName.trim(), email: email.toLowerCase(), password: hashedPassword });
    const token = generateToken(user._id);

    res.status(201).json({ status:true, message:"Đăng ký thành công", data:{ user:{ id:user._id.toString(), fullName:user.fullName, email:user.email, avatar:user.avatar, role:user.role, createdAt:user.createdAt }, token }});
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ status:false, message:"Lỗi server", error:err.message });
  }
});

// Login
app.post("/api/auth/login", async (req,res)=>{
  try {
    await connectDB();
    const { email, password } = req.body;

    const validation = validateLogin({ email, password });
    if (!validation.isValid) return res.status(400).json({ status:false, message:"Dữ liệu không hợp lệ", errors: validation.errors });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) return res.status(401).json({ status:false, message:"Email hoặc mật khẩu không đúng", errors:{ auth:"Thông tin đăng nhập không chính xác" }});

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) return res.status(401).json({ status:false, message:"Email hoặc mật khẩu không đúng", errors:{ auth:"Thông tin đăng nhập không chính xác" }});

    const token = generateToken(user._id);
    res.status(200).json({ status:true, message:"Đăng nhập thành công", data:{ user:{ id:user._id.toString(), fullName:user.fullName, email:user.email, avatar:user.avatar, role:user.role, createdAt:user.createdAt }, token }});
  } catch(err) {
    console.error("Login error:", err);
    res.status(500).json({ status:false, message:"Lỗi server", error:err.message });
  }
});

// Forgot Password (OTP)
app.post("/api/auth/forgot-password", async (req,res)=>{
  try {
    await connectDB();
    const { email } = req.body;
    if(!email) return res.status(400).json({ status:false, message:"Vui lòng nhập email" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if(!user) return res.status(404).json({ status:false, message:"Email chưa được đăng ký trên hệ thống!" });

    const otpId = await createAndSendOTP(email,'forgot_password');

    res.status(200).json({ status:true, otpId: otpId, message:"Mã OTP đã được gửi đến email của bạn." });
  } catch(err){
    console.error("Forgot password error:", err);
    res.status(500).json({ status:false, message:"Lỗi server", error:err.message });
  }
});

// Forgot Password (OTP)
app.post("/api/auth/resend-otp", async (req,res)=>{
  try {
    await connectDB();
    const { email } = req.body;
    if(!email) return res.status(400).json({ status:false, message:"Vui lòng nhập email" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if(!user) return res.status(404).json({ status:false, message:"Email chưa được đăng ký trên hệ thống!" });

    const otpId = await createAndSendOTP(email,'forgot_password');

    res.status(200).json({ status:true, otpId: otpId, message:"Mã OTP đã được gửi đến email của bạn." });
  } catch(err){
    console.error("Forgot password error:", err);
    res.status(500).json({ status:false, message:"Lỗi server", error:err.message });
  }
});

//Verify OTP
app.post("/api/auth/verify-otp", async(req,res)=>{
  try{
    await connectDB();
    const {otpId, otp}=req.body;
    if(!otpId||!otp) return res.status(400).json({status:false,message:"Vui lòng nhập đầy đủ thông tin"});

    const result = await verifyOTP(otpId, otp,'forgot_password');
    if(!result.success) return res.status(400).json({status:false,message:result.message});

    // Nếu xác thực thành công → trả otpId đã dùng (client giữ để đổi password)
    // const tempToken = generateToken(email+':'+Date.now(), '10m');
    res.json({status:true,message:"Xác thực OTP thành công", otpId: result.otpId});
  }catch(err){
    console.error("Verify OTP error:",err);
    res.status(500).json({status:false,message:"Lỗi server",error:err.message});
  }
});

// Reset Password (OTP)
app.post("/api/auth/reset-password", async (req,res)=>{
  try{
    await connectDB();
    const { otpId, newPassword } = req.body;
    if(!otpId||!newPassword) return res.status(400).json({ status:false, message:"Vui lòng nhập đầy đủ thông tin" });
    if(newPassword.length<6) return res.status(400).json({ status:false, message:"Mật khẩu phải có ít nhất 6 ký tự" });

    const email = await getVerifiedEmailByOtpId(otpId, 'forgot_password');
    if(!email) {
        return res.status(400).json({ status:false, message: "Phiên xác thực không hợp lệ hoặc đã hết hạn. Vui lòng làm lại." });
    }

    const hashedPassword = await hashPassword(newPassword);
    const user = await User.findOneAndUpdate({ email: email.toLowerCase() }, { password: hashedPassword }, { new:true });
    if(!user) return res.status(404).json({ status:false, message:"Không tìm thấy người dùng" });

    res.status(200).json({ status:true, message:"Đặt lại mật khẩu thành công!" });
  }catch(err){
    console.error("Reset password error:", err);
    res.status(500).json({ status:false, message:"Lỗi server", error:err.message });
  }
});

// Change Password
app.post("/api/auth/change-password", async (req,res)=>{
  try{
    await connectDB();
    const { email, currentPassword, newPassword } = req.body;
    if(!email||!currentPassword||!newPassword) return res.status(400).json({ status:false, message:"Vui lòng nhập đầy đủ thông tin" });
    if(newPassword.length<6) return res.status(400).json({ status:false, message:"Mật khẩu mới phải có ít nhất 6 ký tự" });
    if(currentPassword===newPassword) return res.status(400).json({ status:false, message:"Mật khẩu mới không được trùng mật khẩu cũ" });

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if(!user) return res.status(404).json({ status:false, message:"Không tìm thấy người dùng" });

    const isPasswordValid = await comparePassword(currentPassword, user.password);
    if(!isPasswordValid) return res.status(401).json({ status:false, message:"Mật khẩu hiện tại không đúng" });

    user.password = await hashPassword(newPassword);
    await user.save();

    res.status(200).json({ status:true, message:"Đổi mật khẩu thành công!" });
  }catch(err){
    console.error("Change password error:", err);
    res.status(500).json({ status:false, message:"Lỗi server", error:err.message });
  }
});

// ==================== TEST & CRUD ====================
app.get("/api/test", async (req,res)=>{
  try{
    await connectDB();
    const readyState = mongoose.connection.readyState;
    const states = ['disconnected','connected','connecting','disconnecting'];
    let collections = [];
    if(readyState===1){
      const db = mongoose.connection.db;
      const colls = await db.listCollections().toArray();
      collections = colls.map(c=>c.name);
    }
    res.json({ status:true, connectionState: states[readyState], database: mongoose.connection.name, collections });
  }catch(err){ res.status(500).json({ status:false, error:err.message }); }
});

app.get("/api/tours/list", async (req, res) => {
  try {
    await connectDB();
    const limit = parseInt(req.query.limit) || 20;
    const start = parseInt(req.query.start) || 0;
    // const end = parseInt(req.query.end as string); // nếu cần lọc theo index hoặc date

    const tours = await Tour.find({})
      .skip(start)
      .limit(limit)
      .select("_id name category thumpnail_url")
      .lean()
      .maxTimeMS(5000);

    tours.forEach(t => t._id && (t._id = t._id.toString()));

    res.json({ status: true, count: tours.length, data: tours });
  } catch (err) {
    console.error("Get All tours error:", err);
    res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
});
app.get("/api/tours/:id", async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    if (!id) return res.status(400).json({ status: false, message: "Tour id không được để trống!" });

    const tour = await Tour.findById(id).lean().maxTimeMS(5000);
    if (!tour) return res.status(404).json({ status: false, message: "Tour không hợp lệ!" });

    if (tour._id) tour._id = tour._id.toString();
    res.json({ status: true, data: tour });
  } catch (err) {
    console.error("Tour detail error:", err);
    res.status(500).json({ status: false, message: "Lỗi server", error: err.message });
  }
});
app.get("/api/cities/list", async(req,res)=>{ await connectDB(); const cities = await City.find({}).lean().maxTimeMS(5000); cities.forEach(c=>c._id && (c._id=c._id.toString())); res.json({ status:true, count:cities.length, data:cities }); });
app.get("/api/categories/list", async(req,res)=>{ await connectDB(); const categories = await Category.find({}).lean().maxTimeMS(5000); categories.forEach(c=>c._id && (c._id=c._id.toString())); res.json({ status:true, count:categories.length, data:categories }); });

// Export cho Vercel
export default app;

// Local dev
if(process.env.NODE_ENV!=='production'){
  app.listen(port, ()=>{ console.log(`🚀 Server running at http://localhost:${port}`); });
}
