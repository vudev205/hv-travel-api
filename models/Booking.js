import mongoose from "mongoose";

const { Schema } = mongoose;

const TourSnapshotSchema = new Schema(
  {
    code: { type: String, default: "" },
    name: { type: String, default: "" },
    start_date: { type: Date, default: null },
    duration: { type: String, default: "" },
  },
  { _id: false }
);

const PassengerSchema = new Schema(
  {
    full_name: { type: String, required: true, trim: true },
    birth_date: { type: Date, default: null },
    type: {
      type: String,
      enum: ["Adult", "Child", "Infant"],
      required: true,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", null],
      default: null,
    },
    passport_number: { type: String, default: null },
  },
  { _id: false }
);

const ContactInfoSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true },
  },
  { _id: false }
);

const HistoryLogSchema = new Schema(
  {
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    user: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const bookingSchema = new Schema(
  {
    booking_code: {
      type: String,
      unique: true,
      required: true,
    },
    tour_id: {
      type: Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    tour_snapshot: {
      type: TourSnapshotSchema,
      default: () => ({}),
    },
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    booking_date: {
      type: Date,
      default: Date.now,
    },
    total_amount: {
      type: Schema.Types.Decimal128,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Paid", "Cancelled", "Completed"],
      default: "Pending",
    },
    payment_status: { type: String, enum: ["Unpaid", "Full", "Refunded"], default: "Unpaid" },
    participants_count: {
      type: Number,
      default: 0,
    },
    passengers: {
      type: [PassengerSchema],
      default: [],
    },
    contact_info: {
      type: ContactInfoSchema,
      required: true,
    },
    notes: {
      type: String,
      default: "",
    },
    history_log: {
      type: [HistoryLogSchema],
      default: [],
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    deleted_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: false, collection: "Bookings" }
);

// Auto-update updated_at on save
bookingSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

// Indexes
bookingSchema.index({ customer_id: 1, status: 1 });
bookingSchema.index({ is_deleted: 1 });

// toJSON: convert Decimal128 to string for API response
bookingSchema.set("toJSON", {
  transform: (doc, ret) => {
    if (ret.total_amount) {
      ret.total_amount = parseFloat(ret.total_amount.toString());
    }
    return ret;
  },
});

bookingSchema.set("toObject", {
  transform: (doc, ret) => {
    if (ret.total_amount) {
      ret.total_amount = parseFloat(ret.total_amount.toString());
    }
    return ret;
  },
});

const Booking =
  mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

export default Booking;
