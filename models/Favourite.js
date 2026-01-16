import mongoose from "mongoose";

const FavouriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tour: { type: mongoose.Schema.Types.ObjectId, ref: "Tour", required: true, index: true },
    city: { type: mongoose.Schema.Types.ObjectId, ref: "City", required: true, index: true },

    name: { type: String, required: true },
    time: { type: String, required: true },
    vehicle: { type: String, required: true },

    price: {
      adult: { type: Number, required: true },
      children: { type: Number, required: true },
      baby: { type: Number, required: true },
    },
    newPrice: {
      adult: { type: Number, required: true },
      children: { type: Number, required: true },
      baby: { type: Number, required: true },
    },

    thumbnail_url: { type: String, required: true },
  },
  { timestamps: true }
);

FavouriteSchema.index({ user: 1, tour: 1 }, { unique: true });

const Favourite =
  mongoose.models.Favourite || mongoose.model("Favourite", FavouriteSchema);

export default Favourite;
