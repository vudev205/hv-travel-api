import User from "../models/User.js";
import {
  hashPassword,
  comparePassword,
  generateToken,
  validateRegister,
  validateLogin
} from "../utils/auth.js";
import { createAndSendOTP, verifyOTP, getVerifiedEmailByOtpId } from "../utils/otpHelper.js";
import connectDB from "../config/db.js";

export const register = async (req, res) => {
  try {
    await connectDB();
    const { fullName, email, password, rePassword } = req.body;

    const validation = validateRegister({ fullName, email, password, rePassword });
    if (!validation.isValid)
      return res.status(400).json({ status: false, errors: validation.errors });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists)
      return res.status(400).json({ status: false, message: "Email đã tồn tại" });

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase(),
      password: await hashPassword(password),

      phone: "",
      gender: "",
      birthDay: null,
      address: "",
      favourite_tours: [],

      emailVerified: false,
      phoneVerified: false,
      tokenVersion: 0
    });

    const token = generateToken(user._id, user.tokenVersion);

    res.status(201).json({
      status: true,
      data: { user, token }
    });
  } 
  catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    await connectDB();
    const { email, password } = req.body;

    const validation = validateLogin({ email, password });
    if (!validation.isValid)
      return res.status(400).json({ status: false, errors: validation.errors });

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user || !(await comparePassword(password, user.password)))
      return res.status(401).json({ status: false, message: "Sai thông tin đăng nhập" });

    const token = generateToken(user);

    res.json({ status: true, data: { user, token } });
  } 
  catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
};

export const me = async (req, res) => {
  res.json({ status: true, data: req.user });
};

export const logout = async (req, res) => {
  try {

  await connectDB();
  const user = req.user;
  if (!user) return res.status(401).json({status: false, message: "Không tìm thấy người dùng"});
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  res.status(200).json({status: true, message: "Đăng xuất thành công" });
  }
  catch (err){
    console.log("Lỗi khi đăng xuất: " + err);
    res.status(500).json({status: false, message: "Lỗi server"});
  }
};

// Forgot Password (OTP)
export const forgotPassword = async (req,res)=>{
  try {
    await connectDB();
    const { email } = req.body;
    if(!email) return res.status(400).json({ status:false, message:"Vui lòng nhập email" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if(!user) return res.status(404).json({ status:false, message:"Email chưa được đăng ký trên hệ thống!" });

    const otpId = await createAndSendOTP(email,'forgot_password');

    res.status(200).json({ status:true, otpId: otpId, message:"Mã OTP đã được gửi đến email của bạn." });
  } 
  catch(err){
    console.error("Forgot password error:", err);
    res.status(500).json({ status:false, message:"Lỗi server", error:err.message });
  }
};

// Resend OTP
export const resendOtp = async (req,res)=>{
  try {
    await connectDB();
    const { email } = req.body;
    if(!email) return res.status(400).json({ status:false, message:"Vui lòng nhập email" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if(!user) return res.status(404).json({ status:false, message:"Email chưa được đăng ký trên hệ thống!" });

    const otpId = await createAndSendOTP(email,'forgot_password');

    res.status(200).json({ status:true, otpId: otpId, message:"Mã OTP đã được gửi đến email của bạn." });
  } 
  catch(err){
    console.error("Forgot password error:", err);
    res.status(500).json({ status:false, message:"Lỗi server", error:err.message });
  }
};

//Verify OTP
export const verifyOtp = async(req,res)=>{
  try{
    await connectDB();
    const {otpId, otp}=req.body;
    if(!otpId||!otp) return res.status(400).json({status:false,message:"Vui lòng nhập đầy đủ thông tin"});

    const result = await verifyOTP(otpId, otp,'forgot_password');
    if(!result.success) return res.status(400).json({status:false,message:result.message});

    res.json({status:true,message:"Xác thực OTP thành công", otpId: result.otpId});
  }
  catch(err){
    console.error("Verify OTP error:",err);
    res.status(500).json({status:false,message:"Lỗi server",error:err.message});
  }
};

// Reset Password (OTP)
export const resetPassword = async (req,res)=>{
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
};

// Change Password
export const changePassword = async (req,res)=>{
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
};
