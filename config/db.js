import mongoose from "mongoose";

let cached = global._mongoose;
if (!cached) cached = global._mongoose = { conn: null, promise: null };

export default async function connectDB() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("Missing MONGO_URI");

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(mongoUri, {
        dbName: "HV-Travel",
        serverSelectionTimeoutMS: 10000,
      })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null; // lần sau retry lại được
    throw err; // ✅ quan trọng: fail rõ ràng
  }
}
