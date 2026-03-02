/**
 * One-time Migration Script: Transform old data to new schema
 * 
 * Run: node scripts/migrate.js
 * 
 * This script:
 * 1. Copies User (role='user') documents to the new Customers collection
 * 2. Inlines City/Category names into Tour documents
 * 3. Transforms Tour fields (gallery→images, time→duration, stock→maxParticipants, etc.)
 * 4. Simplifies Favourite documents (removes duplicated tour data)
 */

import dotenv from "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Missing MONGO_URI in .env");
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI, { dbName: "HV-Travel" });
  console.log("✅ Connected to MongoDB");

  const db = mongoose.connection.db;

  // ─── 1. Migrate Users → Customers ───
  console.log("\n📦 Step 1: Migrating Users → Customers...");
  const usersCollection = db.collection("users");
  const customersCollection = db.collection("customers");

  const mobileUsers = await usersCollection.find({ role: "user" }).toArray();
  console.log(`   Found ${mobileUsers.length} mobile users to migrate`);

  let customerCount = 0;
  for (const user of mobileUsers) {
    const exists = await customersCollection.findOne({ email: user.email });
    if (exists) {
      console.log(`   ⏭️  Skipping ${user.email} (already exists)`);
      continue;
    }

    await customersCollection.insertOne({
      customerCode: `CUS${String(customerCount + 1).padStart(6, "0")}`,
      fullName: user.fullName || "",
      email: user.email,
      password: user.password,
      phoneNumber: user.phone || "",
      avatarUrl: user.avatar || null,
      address: {
        street: user.address || "",
        city: "",
        country: "",
      },
      segment: "Standard",
      status: "Active",
      stats: {
        loyaltyPoints: 0,
        lastActivity: user.updatedAt || user.createdAt || new Date(),
      },
      emailVerified: user.emailVerified || false,
      tokenVersion: user.tokenVersion || 0,
      createdAt: user.createdAt || new Date(),
      updatedAt: user.updatedAt || new Date(),
    });
    customerCount++;
    console.log(`   ✅ Migrated: ${user.email}`);
  }
  console.log(`   📊 Total customers created: ${customerCount}`);

  // ─── 2. Inline City/Category into Tours ───
  console.log("\n📦 Step 2: Inlining City/Category into Tours...");
  const toursCollection = db.collection("tours");
  const citiesCollection = db.collection("cities");
  const categoriesCollection = db.collection("categories");

  // Build lookup maps
  const cities = await citiesCollection.find({}).toArray();
  const cityMap = {};
  for (const c of cities) {
    cityMap[c._id.toString()] = c.name;
  }

  const categories = await categoriesCollection.find({}).toArray();
  const categoryMap = {};
  for (const c of categories) {
    categoryMap[c._id.toString()] = c.name;
  }

  const tours = await toursCollection.find({}).toArray();
  console.log(`   Found ${tours.length} tours to transform`);

  for (const tour of tours) {
    const cityName = tour.city ? (cityMap[tour.city.toString()] || "") : "";
    const categoryName = tour.category ? (categoryMap[tour.category.toString()] || "") : "";

    // Transform gallery to images
    const images = [];
    if (tour.thumbnail_url) images.push(tour.thumbnail_url);
    if (tour.gallery && Array.isArray(tour.gallery)) {
      for (const g of tour.gallery) {
        if (g.picture) images.push(g.picture);
      }
    }

    // Transform time to duration
    const timeStr = tour.time || "";
    const dayMatch = timeStr.match(/(\d+)\s*(ngày|day)/i);
    const nightMatch = timeStr.match(/(\d+)\s*(đêm|night)/i);
    const duration = {
      days: dayMatch ? parseInt(dayMatch[1]) : 1,
      nights: nightMatch ? parseInt(nightMatch[1]) : 0,
      text: timeStr,
    };

    // Transform price
    const price = {
      adult: tour.price?.adult || 0,
      child: tour.price?.children || 0,
      infant: tour.price?.baby || 0,
      discount: 0,
    };

    // Calculate discount if newPrice exists and is different
    if (tour.newPrice?.adult && tour.price?.adult && tour.newPrice.adult < tour.price.adult) {
      price.discount = Math.round((1 - tour.newPrice.adult / tour.price.adult) * 100);
      // Use the newPrice as the actual price
      price.adult = tour.newPrice.adult;
      price.child = tour.newPrice.children || price.child;
      price.infant = tour.newPrice.baby || price.infant;
    }

    // Transform stock to maxParticipants
    const maxParticipants = tour.stock
      ? (tour.stock.adult || 0) + (tour.stock.children || 0) + (tour.stock.baby || 0)
      : 0;

    // Transform itinerary to schedule
    const schedule = (tour.itinerary || []).map((item) => ({
      day: item.day,
      title: item.title || "",
      description: item.description || "",
      activities: [],
    }));

    // Transform vehicle → inclusions, accomodations → exclusions
    const inclusions = [];
    if (tour.vehicle) inclusions.push(`Phương tiện: ${tour.vehicle}`);

    const exclusions = [];
    if (tour.accomodations && Array.isArray(tour.accomodations)) {
      for (const acc of tour.accomodations) {
        if (acc.place) exclusions.push(`Lưu trú: ${acc.place}`);
      }
    }

    const updateDoc = {
      $set: {
        category: categoryName,
        destination: { city: cityName, country: "Việt Nam", region: "" },
        images,
        duration,
        price,
        schedule,
        maxParticipants,
        currentParticipants: 0,
        inclusions,
        exclusions,
        reviewCount: 0,
        rating: 0,
      },
      $unset: {
        city: "",
        thumbnail_url: "",
        gallery: "",
        time: "",
        vehicle: "",
        accomodations: "",
        stock: "",
        newPrice: "",
        itinerary: "",
      },
    };

    await toursCollection.updateOne({ _id: tour._id }, updateDoc);
    console.log(`   ✅ Transformed tour: ${tour.name}`);
  }

  // ─── 3. Simplify Favourites ───
  console.log("\n📦 Step 3: Simplifying Favourites...");
  const favouritesCollection = db.collection("favourites");
  const favourites = await favouritesCollection.find({}).toArray();
  console.log(`   Found ${favourites.length} favourites to simplify`);

  for (const fav of favourites) {
    // Map user → customerId
    let customerId = fav.customerId;

    if (!customerId && fav.user) {
      // Find the corresponding customer by old user's email
      const oldUser = await usersCollection.findOne({ _id: fav.user });
      if (oldUser) {
        const customer = await customersCollection.findOne({ email: oldUser.email });
        if (customer) {
          customerId = customer._id;
        }
      }
    }

    if (!customerId) {
      console.log(`   ⏭️  Skipping favourite ${fav._id} (no matching customer)`);
      continue;
    }

    const tourId = fav.tourId || fav.tour;

    await favouritesCollection.updateOne(
      { _id: fav._id },
      {
        $set: { customerId, tourId },
        $unset: {
          user: "",
          tour: "",
          city: "",
          category: "",
          name: "",
          time: "",
          vehicle: "",
          price: "",
          newPrice: "",
          thumbnail_url: "",
        },
      }
    );
    console.log(`   ✅ Simplified favourite: ${fav._id}`);
  }

  console.log("\n🎉 Migration completed successfully!");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
