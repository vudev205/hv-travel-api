import mongoose from "mongoose";

let isConnected = false;

export default async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("Missing MONGO_URI in environment variables");
  }

  try {
    console.log("Connecting MongoDB...");
    await mongoose.connect(mongoUri, {
      dbName: "HV-Travel",
      serverSelectionTimeoutMS: 10000,
    });
    isConnected = true;
    console.log("MongoDB connected");
  } catch (err) {
    isConnected = false;
    console.error("MongoDB connection failed:", err);
    throw err; // ✅ QUAN TRỌNG
  }
}
