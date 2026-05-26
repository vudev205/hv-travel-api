import mongoose from "mongoose";

const TourInteractionSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    tourId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["view"],
      default: "view",
      index: true,
    },
    viewCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastViewedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

TourInteractionSchema.index({ customerId: 1, tourId: 1, type: 1 }, { unique: true });

export default mongoose.model("TourInteraction", TourInteractionSchema, "TourInteractions");
