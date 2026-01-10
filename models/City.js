import mongoose from "mongoose";

const citySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("City", citySchema);
