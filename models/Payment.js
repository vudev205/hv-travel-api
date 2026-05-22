import mongoose from "mongoose";

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    transactionId: {
      type: String,
      default: "",
    },
    provider: {
      type: String,
      enum: ["Internal", "MoMo", "ZaloPay"],
      default: "Internal",
      index: true,
    },
    providerOrderId: {
      type: String,
    },
    providerRequestId: {
      type: String,
    },
    providerTransId: {
      type: String,
      default: "",
    },
    providerResultCode: {
      type: Number,
      default: null,
    },
    providerMessage: {
      type: String,
      default: "",
    },
    paymentUrl: {
      type: String,
      default: "",
    },
    deeplink: {
      type: String,
      default: "",
    },
    qrCodeUrl: {
      type: String,
      default: "",
    },
    rawCreateResponse: {
      type: Schema.Types.Mixed,
      default: null,
    },
    rawIpnPayload: {
      type: Schema.Types.Mixed,
      default: null,
    },
    rawQueryResponse: {
      type: Schema.Types.Mixed,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: ["CreditCard", "BankTransfer", "Cash", "MoMo", "ZaloPay"],
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Success", "Failed"],
      default: "Pending",
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, collection: "Payments" }
);

// Indexes
paymentSchema.index({ status: 1 });
paymentSchema.index({ provider: 1, providerOrderId: 1 });
paymentSchema.index({ providerOrderId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ providerRequestId: 1 }, { unique: true, sparse: true });

const Payment =
  mongoose.models.Payment || mongoose.model("Payment", paymentSchema);

export default Payment;
