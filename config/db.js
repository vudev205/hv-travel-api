import mongoose from "mongoose";

let isConnected = false;

export default async function connectDB() {
    if (isConnected && mongoose.connection.readyState === 1) return;
    console.log("Connecting MongoDB...");
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
    try {
        await mongoose.connect(mongoUri, {
            dbName: "HV-Travel",
            serverSelectionTimeoutMS: 10000
        });
        isConnected = true;
        console.log("MongoDB connected")
    }
    catch (err){
        console.log("MongoDB connection failed: ", err.message);
        isConnected = false;
    }
  
}
