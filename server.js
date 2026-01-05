import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// CORS cho phép gọi từ frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Connection state
let isConnected = false;

// Connect to MongoDB
async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI not defined");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'HV-Travel',
      serverSelectionTimeoutMS: 10000,
    });
    isConnected = true;
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
    isConnected = false;
    throw err;
  }
}

// Schemas
const tourSchema = new mongoose.Schema({}, { collection: 'tours', strict: false });
const citySchema = new mongoose.Schema({}, { collection: 'cities', strict: false });
const categorySchema = new mongoose.Schema({}, { collection: 'categories', strict: false });

const Tour = mongoose.models.Tour || mongoose.model('Tour', tourSchema);
const City = mongoose.models.City || mongoose.model('City', citySchema);
const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: true, 
    message: "HV-Travel API is running",
    endpoints: {
      test: "/api/test",
      tours: "/api/tours",
      cities: "/api/cities",
      categories: "/api/categories"
    }
  });
});

// Test endpoint
app.get("/api/test", async (req, res) => {
  try {
    await connectDB();
    
    const readyState = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    let collections = [];
    if (readyState === 1) {
      const db = mongoose.connection.db;
      const colls = await db.listCollections().toArray();
      collections = colls.map(c => c.name);
    }
    
    res.json({ 
      status: true,
      connectionState: states[readyState],
      database: mongoose.connection.name,
      collections: collections
    });
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

// Tours endpoint
app.get("/api/tours", async (req, res) => {
  try {
    await connectDB();
    
    const tours = await Tour.find({}).lean().maxTimeMS(5000);
    tours.forEach(t => {
      if (t._id) t._id = t._id.toString();
    });
    
    res.json({ status: true, count: tours.length, data: tours });
  } catch (err) {
    console.error("Tours error:", err);
    res.status(500).json({ status: false, error: err.message });
  }
});

// Cities endpoint
app.get("/api/cities", async (req, res) => {
  try {
    await connectDB();
    
    const cities = await City.find({}).lean().maxTimeMS(5000);
    cities.forEach(c => {
      if (c._id) c._id = c._id.toString();
    });

    res.json({ status: true, count: cities.length, data: cities });
  } catch (err) {
    console.error("Cities error:", err);
    res.status(500).json({ status: false, error: err.message });
  }
});

// Categories endpoint
app.get("/api/categories", async (req, res) => {
  try {
    await connectDB();
    
    const categories = await Category.find({}).lean().maxTimeMS(5000);
    categories.forEach(c => {
      if (c._id) c._id = c._id.toString();
    });

    res.json({ status: true, count: categories.length, data: categories });
  } catch (err) {
    console.error("Categories error:", err);
    res.status(500).json({ status: false, error: err.message });
  }
});

// Vercel cần export app
export default app;

// Local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
}