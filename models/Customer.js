import mongoose from "mongoose";
import validator from "validator";

const { Schema } = mongoose;

const AddressSchema = new Schema(
  {
    street: { type: String, default: "" },
    city: { type: String, default: "" },
    country: { type: String, default: "" },
  },
  { _id: false }
);

const StatsSchema = new Schema(
  {
    loyaltyPoints: { type: Number, default: 0 },
    lastActivity: { type: Date, default: null },
  },
  { _id: false }
);

const customerSchema = new Schema(
  {
    customerCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, "Email không hợp lệ"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    phoneNumber: {
      type: String,
      default: "",
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    address: {
      type: AddressSchema,
      default: () => ({}),
    },
    segment: {
      type: String,
      enum: ["VIP", "New", "Standard", "ChurnRisk", "Inactive"],
      default: "New",
    },
    status: {
      type: String,
      enum: ["Active", "Banned"],
      default: "Active",
    },
    stats: {
      type: StatsSchema,
      default: () => ({}),
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true, collection: "Customers" }
);

// Auto-generate customerCode before saving
customerSchema.pre("save", async function (next) {
  if (!this.customerCode) {
    const count = await mongoose.model("Customer").countDocuments();
    this.customerCode = `CUS${String(count + 1).padStart(6, "0")}`;
  }
  next();
});

// Indexes
customerSchema.index({ status: 1, segment: 1 });

const Customer =
  mongoose.models.Customer || mongoose.model("Customer", customerSchema);

export default Customer;
