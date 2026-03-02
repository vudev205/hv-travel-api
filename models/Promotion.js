import mongoose from "mongoose";

const { Schema } = mongoose;

const promotionSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    discountPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    maxUses: {
      type: Number,
      default: 0, // 0 = unlimited
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validTo: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Indexes
promotionSchema.index({ code: 1 });
promotionSchema.index({ isActive: 1, validFrom: 1, validTo: 1 });

const Promotion =
  mongoose.models.Promotion || mongoose.model("Promotion", promotionSchema);

export default Promotion;
