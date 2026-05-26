import mongoose from "mongoose";
import TourInteraction from "../models/TourInteraction.js";

export const recordTourView = async (req, res) => {
  try {
    const customerId = req.customer?._id;
    const { tourId } = req.params;

    if (!customerId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(tourId)) {
      return res.status(400).json({ status: false, message: "Invalid tourId" });
    }

    const interaction = await TourInteraction.findOneAndUpdate(
      {
        customerId,
        tourId,
        type: "view",
      },
      {
        $set: { lastViewedAt: new Date() },
        $inc: { viewCount: 1 },
        $setOnInsert: {
          customerId,
          tourId,
          type: "view",
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return res.json({ status: true, data: interaction });
  } catch (error) {
    console.error("recordTourView error:", error);
    return res.status(500).json({ status: false, message: "Could not record tour view" });
  }
};
