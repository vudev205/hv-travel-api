// models/Tour.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const PriceSchema = new Schema(
  {
    adult: { type: Number, default: 0 },
    children: { type: Number, default: 0 },
    baby: { type: Number, default: 0 },
  },
  { _id: false }
);

const StockSchema = new Schema(
  {
    adult: { type: Number, default: 0 },
    children: { type: Number, default: 0 },
    baby: { type: Number, default: 0 },
  },
  { _id: false }
);

const GallerySchema = new Schema(
  {
    picture: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const ItinerarySchema = new Schema(
  {
    day: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const AccommodationSchema = new Schema(
  {
    place: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const TourSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    // ✅ record của bạn là string id; Mongoose vẫn cast string -> ObjectId
    city: { type: Schema.Types.ObjectId, ref: "City", required: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },

    description: { type: String, default: "", trim: true },
    time: { type: String, default: "", trim: true },

    stock: { type: StockSchema, default: () => ({}) },
    vehicle: { type: String, default: "", trim: true },

    gallery: { type: [GallerySchema], default: [] },
    accomodations: { type: [AccommodationSchema], default: [] },
    itinerary: { type: [ItinerarySchema], default: [] },

    startDate: { type: Date, required: true },

    price: { type: PriceSchema, default: () => ({}) },
    newPrice: { type: PriceSchema, default: () => ({}) },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
    deleted: { type: Boolean, default: false },

    thumbnail_url: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

// Index gợi ý để query list nhanh
TourSchema.index({ city: 1 });
TourSchema.index({ category: 1 });
TourSchema.index({ status: 1, deleted: 1 });

export default mongoose.models.Tour || mongoose.model("Tour", TourSchema);
