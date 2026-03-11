import mongoose from "mongoose";

const { Schema } = mongoose;

const favouriteSchema = new Schema(
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
  },
  { timestamps: true, collection: "Favourites" }
);

// One favourite per customer per tour
favouriteSchema.index({ customerId: 1, tourId: 1 }, { unique: true });

const Favourite =
  mongoose.models.Favourite || mongoose.model("Favourite", favouriteSchema);

export default Favourite;
