import mongoose from "mongoose";

const { Schema } = mongoose;

const TourSnapshotSchema = new Schema(
  {
    date: { type: Date },
    name: { type: String },
    duration: { type: String },
  },
  { _id: false }
);

const PassengerSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Adult", "Child", "Infant"],
      required: true,
    },
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female", "other"], default: "other" },
    birthday: { type: Date, default: null },
  },
  { _id: false }
);

const ContactInfoSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phoneNumber: { type: String, required: true },
    address: { type: String, default: "" },
  },
  { _id: false }
);

const HistoryLogSchema = new Schema(
  {
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const bookingSchema = new Schema(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    tourId: {
      type: Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    tourSnapshot: {
      type: TourSnapshotSchema,
      default: () => ({}),
    },
    passengers: {
      type: [PassengerSchema],
      default: [],
    },
    contactInfo: {
      type: ContactInfoSchema,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Cancelled", "Completed"],
      default: "Pending",
    },
    historyLog: {
      type: [HistoryLogSchema],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Indexes
bookingSchema.index({ customerId: 1, status: 1 });
bookingSchema.index({ tourId: 1 });
bookingSchema.index({ isDeleted: 1 });

const Booking =
  mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

export default Booking;
