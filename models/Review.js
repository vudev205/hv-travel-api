import mongoose from "mongoose";

const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    tourId: {
      type: Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1.0,
      max: 5.0,
    },
    comment: {
      type: String,
      default: "",
      trim: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, collection: "Reviews" }
);

// One review per customer per tour
reviewSchema.index({ tourId: 1, customerId: 1 }, { unique: true });

const Review =
  mongoose.models.Review || mongoose.model("Review", reviewSchema);

export default Review;
