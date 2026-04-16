/**
 * Script Bồi Đắp Ma Trận Khoảng Cách (Distance Matrix) + Tham số Kẹt xe (Traffic Delay)
 * ====================================================================================
 * Đọc tọa độ từ collection POIs -> Gọi OpenRouteService API -> Lưu vào collection RouteEdges
 * 
 * Chạy: node scripts/seed-distance-matrix.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// API KEY BẠN VỪA CUNG CẤP
const ORS_API_KEY = process.env.ORS_API_KEY || "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImIyMTE1NDI1OGExOTRjZTM5YmRlZjEzZmUxNTliNDZiIiwiaCI6Im11cm11cjY0In0=";

async function fetchMatrixFromORS(locations) {
  console.log(`\n🌐 Calling OpenRouteService API with ${locations.length} locations...`);
  const url = "https://api.openrouteservice.org/v2/matrix/driving-car";
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": ORS_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      locations: locations, // Format: [[lng, lat], [lng, lat], ...]
      metrics: ["distance", "duration"]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ORS API failed with status ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  return data;
}

// Giả lập mức độ kẹt xe DỰA TRÊN KHOẢNG CÁCH thực tế
// - Nội thành (<10km): Kẹt xe nặng (1.3 → 1.8)
// - Ngoại ô (10-50km): Kẹt xe trung bình (1.1 → 1.4)
// - Liên tỉnh (>50km): Kẹt xe nhẹ (1.02 → 1.15)
function generateTrafficMultiplier(distanceMeters) {
  const distKm = distanceMeters / 1000;
  let min, max;
  if (distKm < 10) {
    min = 1.3; max = 1.8;   // Nội thành: kẹt nặng
  } else if (distKm < 50) {
    min = 1.1; max = 1.4;   // Ngoại ô: kẹt trung bình
  } else {
    min = 1.02; max = 1.15; // Liên tỉnh: kẹt nhẹ
  }
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

async function main() {
  console.log("🚀 Starting Distance Matrix Seeding Script...\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB!\n");

  const db = mongoose.connection.db;
  const poisCollection = db.collection("POIs");
  const routeEdgesCollection = db.collection("RouteEdges");

  // Xóa dữ liệu cũ nếu chạy lại script này
  await routeEdgesCollection.deleteMany({});
  console.log("🗑️ Cleared old RouteEdges.");

  // Lấy danh sách POIs (tối đa lấy tất cả, nếu có quá 50 thì phải chia chunk, nhưng bạn đang có 33)
  const pois = await poisCollection.find({}).toArray();
  console.log(`📦 Found ${pois.length} POIs in DB.`);

  if (pois.length === 0) {
    console.log("⚠️ No POIs found. Run ai-seed.js first.");
    process.exit(0);
  }

  // Chuẩn bị mảng tọa độ [[lng, lat]]
  // Lưu ý: ORS và MongoDB GeoJSON đều sử dụng chuẩn [Longitude, Latitude]
  const locations = pois.map(poi => poi.location.coordinates);

  try {
    const matrixData = await fetchMatrixFromORS(locations);
    const { distances, durations } = matrixData; // distances(mét), durations(giây)

    console.log("✅ ORS API returned data successfully.");
    console.log(`   Dimensions: ${distances.length}x${distances[0].length}`);

    const edgesToInsert = [];
    let skips = 0;

    // Duyệt ma trận 2D
    for (let i = 0; i < pois.length; i++) {
        for (let j = 0; j < pois.length; j++) {
            if (i === j) continue; // Bỏ qua đường đi từ 1 điểm đến chính nó

            const distanceMeters = distances[i][j];
            const durationSeconds = durations[i][j];

            // Nếu ORS không tìm được đường, null sẽ được trả về
            if (distanceMeters === null || durationSeconds === null) {
                skips++;
                continue;
            }

            const trafficDelayMultiplier = generateTrafficMultiplier(distanceMeters);
            const timeAtoB = durationSeconds;

            edgesToInsert.push({
                sourcePoiId: pois[i]._id,
                targetPoiId: pois[j]._id,
                sourceName: pois[i].placeName, // Lưu thêm name để dễ debug
                targetName: pois[j].placeName,
                distanceMeters: distanceMeters,
                baseDurationSeconds: timeAtoB,
                trafficDelayMultiplier: trafficDelayMultiplier, // Dùng cho thuật toán Heuristic Python
                // f(n) = baseDuration * trafficMultiplier + g(n) ...
            });
        }
    }

    console.log(`\n💾 Inserting ${edgesToInsert.length} route edges into MongoDB...`);
    // Insert theo lô
    const batchSize = 1000;
    for (let i = 0; i < edgesToInsert.length; i += batchSize) {
        const batch = edgesToInsert.slice(i, i + batchSize);
        await routeEdgesCollection.insertMany(batch);
    }
    
    console.log(`✅ Successfully seeded ${edgesToInsert.length} edges!`);
    console.log(`⚠️ Skipped ${skips} edges (no route found by ORS).`);

  } catch (error) {
    console.error("❌ Error fetching or saving matrix data:");
    console.error(error.message);
  }

  console.log("\n🎉 DISTANCE MATRIX ENRICHMENT COMPLETE!");
  console.log("💡 The 'RouteEdges' table is now ready for your Python Heuristic TSP Algorithm.\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
