import mongoose from "mongoose";
import validator from "validator";

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: [validator.isEmail, 'Email không hợp lệ']
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
    select: false
  },

  phone: {
    type: String,
    default: ""
  },

  gender: {
    type: String,
    enum: ["male", "female", "other", ""],
    default: ""
  },

  birthday: {
    type: Date,
    default: null
  },

  address: {
    type: String,
    default: ""
  },

  avatar: {
    type: String,
    default: null
  },

  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },

  // xác thực riêng
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  tokenVersion: {
    type: Number,
    default: 0,
  }

}, {
  timestamps: true
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
