// models/Tour.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const DestinationSchema = new Schema(
  {
    city: { type: String, default: "", trim: true },
    country: { type: String, default: "Việt Nam", trim: true },
    region: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const DurationSchema = new Schema(
  {
    days: { type: Number, default: 1 },
    nights: { type: Number, default: 0 },
    text: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const PriceSchema = new Schema(
  {
    adult: { type: Number, default: 0 },
    child: { type: Number, default: 0 },
    infant: { type: Number, default: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 }, // percentage
  },
  { _id: false }
);

const ScheduleSchema = new Schema(
  {
    day: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    activities: { type: [String], default: [] },
  },
  { _id: false }
);

const TourSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    // Inline string instead of ObjectId ref
    category: { type: String, default: "", trim: true },

    // Inline destination object instead of City ObjectId ref
    destination: { type: DestinationSchema, default: () => ({}) },

    description: { type: String, default: "", trim: true },

    // Replaces thumbnail_url + gallery
    images: { type: [String], default: [] },

    // Replaces `time` string
    duration: { type: DurationSchema, default: () => ({}) },

    // Unified price (replaces price + newPrice)
    price: { type: PriceSchema, default: () => ({}) },

    // Replaces itinerary
    schedule: { type: [ScheduleSchema], default: [] },

    // Replaces stock
    max_participants: { type: Number, default: 0 },
    current_participants: { type: Number, default: 0 },

    // Replaces vehicle and accomodations
    inclusions: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },

    // Cached from Reviews collection
    review_count: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },

    start_dates: { type: [Date], default: [] },

    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

// Indexes
TourSchema.index({ "destination.city": 1 });
TourSchema.index({ category: 1 });
TourSchema.index({ status: 1, deleted: 1 });

export default mongoose.models.Tour || mongoose.model("Tour", TourSchema);
