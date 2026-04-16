/**
 * AI Data Enrichment Seed Script
 * ================================
 * Script chạy 1 lần duy nhất để bồi đắp thêm dữ liệu AI/ML vào MongoDB.
 * KHÔNG xóa hay ghi đè dữ liệu cũ - chỉ thêm trường mới.
 *
 * Chạy: node scripts/ai-seed.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ============================================================
// BẢNG TỌA ĐỘ GPS THỰC TẾ CÁC THÀNH PHỐ VIỆT NAM
// ============================================================
const CITY_COORDINATES = {
  "ha noi": { lat: 21.0285, lng: 105.8542 },
  "ho chi minh": { lat: 10.8231, lng: 106.6297 },
  "hcm": { lat: 10.8231, lng: 106.6297 },
  "sai gon": { lat: 10.8231, lng: 106.6297 },
  "da nang": { lat: 16.0544, lng: 108.2022 },
  "hoi an": { lat: 15.8801, lng: 108.3262 },
  "hue": { lat: 16.4637, lng: 107.5909 },
  "nha trang": { lat: 12.2388, lng: 109.1967 },
  "da lat": { lat: 11.9465, lng: 108.4583 },
  "dalat": { lat: 11.9465, lng: 108.4583 },
  "phu quoc": { lat: 10.2270, lng: 103.9571 },
  "ha long": { lat: 20.9101, lng: 107.0353 },
  "sapa": { lat: 22.3363, lng: 103.8438 },
  "sa pa": { lat: 22.3363, lng: 103.8438 },
  "can tho": { lat: 10.0452, lng: 105.7469 },
  "vung tau": { lat: 10.3460, lng: 107.0843 },
  "quy nhon": { lat: 13.7830, lng: 109.2197 },
  "phan thiet": { lat: 10.9804, lng: 108.2615 },
  "mui ne": { lat: 10.9332, lng: 108.2872 },
  "ha giang": { lat: 22.8233, lng: 104.9847 },
  "ninh binh": { lat: 20.2506, lng: 105.9745 },
  "phong nha": { lat: 17.5904, lng: 106.2834 },
  "con dao": { lat: 8.6930, lng: 106.6094 },
  "cat ba": { lat: 20.7254, lng: 107.0473 },
  "tam dao": { lat: 21.4571, lng: 105.6478 },
  "moc chau": { lat: 20.8338, lng: 104.6831 },
  "mai chau": { lat: 20.6607, lng: 105.0866 },
  "ban gioc": { lat: 22.8544, lng: 106.7238 },
  "cao bang": { lat: 22.6666, lng: 106.2640 },
  "dong van": { lat: 23.2767, lng: 105.3633 },
  "tra vinh": { lat: 9.9513, lng: 106.3346 },
  "ben tre": { lat: 10.2434, lng: 106.3756 },
  "my tho": { lat: 10.3601, lng: 106.3600 },
  "long an": { lat: 10.5362, lng: 106.4135 },
  "chau doc": { lat: 10.7070, lng: 105.1179 },
  "rach gia": { lat: 10.0124, lng: 105.0808 },
  "tay ninh": { lat: 11.3352, lng: 106.0988 },
  "buon ma thuot": { lat: 12.6676, lng: 108.0502 },
  "pleiku": { lat: 13.9833, lng: 108.0000 },
  "kon tum": { lat: 14.3500, lng: 108.0000 },
  "quang binh": { lat: 17.4690, lng: 106.6222 },
  "quang ngai": { lat: 15.1214, lng: 108.8044 },
  "binh dinh": { lat: 13.7830, lng: 109.2197 },
  "phu yen": { lat: 13.0882, lng: 109.0929 },
  "tuy hoa": { lat: 13.0882, lng: 109.0929 },
  "dong nai": { lat: 10.9454, lng: 106.8424 },
  "binh duong": { lat: 11.0664, lng: 106.6500 },
  "lam dong": { lat: 11.9465, lng: 108.4583 },
  "khanh hoa": { lat: 12.2388, lng: 109.1967 },
  "quang nam": { lat: 15.5394, lng: 108.0191 },
  "thanh hoa": { lat: 19.8067, lng: 105.7852 },
  "nghe an": { lat: 18.6790, lng: 105.6813 },
  "hai phong": { lat: 20.8449, lng: 106.6881 },
  "bac ninh": { lat: 21.1868, lng: 106.0762 },
  "lang son": { lat: 21.8540, lng: 106.7615 },
  "lao cai": { lat: 22.4856, lng: 103.9707 },
  "yen bai": { lat: 21.7229, lng: 104.9113 },
  "tuyen quang": { lat: 21.8234, lng: 105.2181 },
  "thai nguyen": { lat: 21.5928, lng: 105.8442 },
  "bac giang": { lat: 21.2731, lng: 106.1947 },
  "vinh": { lat: 18.6790, lng: 105.6813 },
  "dong hoi": { lat: 17.4690, lng: 106.6222 },
  "quang ninh": { lat: 20.9101, lng: 107.0353 },
  "thai binh": { lat: 20.4463, lng: 106.3365 },
  "hung yen": { lat: 20.6465, lng: 106.0511 },
  "nam dinh": { lat: 20.4388, lng: 106.1621 },
  "ha tinh": { lat: 18.3559, lng: 105.8876 },
  "quang tri": { lat: 16.7504, lng: 107.1854 },
};

// ============================================================
// HỆ THỐNG TAGS PHÂN LOẠI THÔNG MINH
// ============================================================
const BEACH_CITIES = ["nha trang", "da nang", "phu quoc", "vung tau", "phan thiet", "mui ne", "quy nhon", "con dao", "hoi an", "ha long", "cat ba"];
const MOUNTAIN_CITIES = ["sa pa", "sapa", "da lat", "dalat", "ha giang", "tam dao", "moc chau", "mai chau", "buon ma thuot", "pleiku", "kon tum"];
const CULTURAL_CITIES = ["hue", "hoi an", "ha noi", "ninh binh"];
const MEKONG_CITIES = ["can tho", "ben tre", "tra vinh", "my tho", "chau doc", "long an", "rach gia"];

function inferTagsFromTour(tour) {
  const tags = new Set();
  const city = (tour.destination?.city || "").toLowerCase().trim();
  const region = (tour.destination?.region || "").toLowerCase().trim();
  const name = (tour.name || "").toLowerCase();
  const inclusions = (tour.generatedInclusions || []).map((s) => s.toLowerCase());
  const activities = (tour.schedule || []).flatMap((s) => (s.activities || []).map((a) => a.toLowerCase()));
  const allText = [name, ...inclusions, ...activities].join(" ");
  const days = tour.duration?.days || 1;
  const adultPrice = parseFloat(tour.price?.adult?.$numberDecimal || tour.price?.adult || 0);

  // === Vùng miền ===
  if (region.includes("north") || region.includes("bắc")) tags.add("Miền Bắc");
  if (region.includes("central") || region.includes("trung")) tags.add("Miền Trung");
  if (region.includes("south") || region.includes("nam")) tags.add("Miền Nam");

  // === Biển / Núi / Văn hóa / Đồng bằng ===
  if (BEACH_CITIES.some((c) => city.includes(c) || name.includes(c))) {
    tags.add("Biển");
    tags.add("Nghỉ Dưỡng");
  }
  if (MOUNTAIN_CITIES.some((c) => city.includes(c) || name.includes(c))) {
    tags.add("Núi Rừng");
    tags.add("Khám Phá");
  }
  if (CULTURAL_CITIES.some((c) => city.includes(c) || name.includes(c))) {
    tags.add("Văn Hóa");
    tags.add("Di Sản");
  }
  if (MEKONG_CITIES.some((c) => city.includes(c) || name.includes(c))) {
    tags.add("Sông Nước");
    tags.add("Miền Tây");
  }

  // === Thời lượng ===
  if (days <= 2) { tags.add("Ngắn Ngày"); tags.add("Cuối Tuần"); }
  else if (days >= 5) tags.add("Dài Ngày");

  // === Giá cả ===
  if (adultPrice > 0 && adultPrice < 3000000) tags.add("Bình Dân");
  else if (adultPrice >= 3000000 && adultPrice < 8000000) tags.add("Phổ Thông");
  else if (adultPrice >= 8000000) tags.add("Cao Cấp");

  // === Phong cách từ dịch vụ ===
  if (allText.includes("homestay") || allText.includes("home stay")) tags.add("Trải Nghiệm Địa Phương");
  if (allText.includes("5-star") || allText.includes("resort") || allText.includes("luxury")) tags.add("Luxury");
  if (allText.includes("trek") || allText.includes("hiking") || allText.includes("leo")) tags.add("Mạo Hiểm");
  if (allText.includes("market") || allText.includes("food") || allText.includes("ẩm thực") || allText.includes("chợ")) tags.add("Ẩm Thực");
  if (allText.includes("family") || allText.includes("gia đình")) tags.add("Gia Đình");
  if (allText.includes("boat") || allText.includes("cruise") || allText.includes("thuyền")) tags.add("Du Thuyền");
  if (allText.includes("photography") || allText.includes("photo")) tags.add("Nhiếp Ảnh");

  // === Quy mô nhóm ===
  if ((tour.maxParticipants || 0) <= 12 && tour.maxParticipants > 0) tags.add("Nhóm Nhỏ");
  if ((tour.maxParticipants || 0) >= 30) tags.add("Đoàn Lớn");

  // Đảm bảo ít nhất 3 tags
  if (tags.size < 3) tags.add("Du Lịch");
  if (tags.size < 3) tags.add("Trong Nước");

  return [...tags];
}

function lookupCoordinates(city) {
  if (!city) return null;
  const normalized = city.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D");

  // Tìm chính xác
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }
  return null;
}

// ============================================================
// SỞ THÍCH KHÁCH HÀNG (PREFERENCES)
// ============================================================
const ALL_THEMES = ["Biển", "Núi Rừng", "Văn Hóa", "Ẩm Thực", "Mạo Hiểm", "Nghỉ Dưỡng", "Khám Phá", "Du Thuyền", "Nhiếp Ảnh", "Di Sản", "Sông Nước"];
const ALL_BUDGETS = ["Low", "Medium", "High"];
const ALL_LIFESTYLES = ["Relaxed", "Active", "Adventurous", "Cultural"];

function generateCustomerPreferences(customer) {
  // Heuristic: dựa vào segment và stats để sinh preferences logic
  const segment = (customer.segment || "New").toLowerCase();
  const loyaltyPoints = customer.stats?.loyaltyPoints || 0;

  const numThemes = segment === "vip" ? 4 : segment === "returning" ? 3 : 2;
  const shuffled = [...ALL_THEMES].sort(() => Math.random() - 0.5);
  const favoriteThemes = shuffled.slice(0, numThemes);

  let budgetLevel;
  if (loyaltyPoints > 500) budgetLevel = "High";
  else if (loyaltyPoints > 150) budgetLevel = "Medium";
  else budgetLevel = ALL_BUDGETS[Math.floor(Math.random() * ALL_BUDGETS.length)];

  const lifestyle = ALL_LIFESTYLES[Math.floor(Math.random() * ALL_LIFESTYLES.length)];

  return { favoriteThemes, preferredBudgetLevel: budgetLevel, lifestyle };
}

// ============================================================
// MAIN EXECUTION
// ============================================================
async function main() {
  console.log("🚀 AI Data Enrichment Script - Starting...\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB!\n");

  const db = mongoose.connection.db;

  // ----------- PHASE 1: Enrich Tours with Tags + Coordinates -----------
  console.log("═══════════════════════════════════════════");
  console.log("📦 PHASE 1: Enriching Tours (tags + coordinates)");
  console.log("═══════════════════════════════════════════\n");

  const toursCollection = db.collection("Tours");
  const tours = await toursCollection.find({}).toArray();
  let tourUpdated = 0;
  let tourSkipped = 0;

  for (const tour of tours) {
    const tags = inferTagsFromTour(tour);
    const city = tour.destination?.city || "";
    const coords = lookupCoordinates(city);

    const updateFields = { tags };
    if (coords && !tour.destination?.coordinates) {
      updateFields["destination.coordinates"] = coords;
    }

    await toursCollection.updateOne({ _id: tour._id }, { $set: updateFields });
    tourUpdated++;

    const coordsStr = coords ? `📍 [${coords.lat}, ${coords.lng}]` : "⚠️ No coords found";
    console.log(`  ✔ ${tour.name}`);
    console.log(`    City: ${city} → ${coordsStr}`);
    console.log(`    Tags: [${tags.join(", ")}]\n`);
  }

  console.log(`📊 Tours: ${tourUpdated} updated, ${tourSkipped} skipped\n`);

  // ----------- PHASE 2: Enrich Customers with Preferences -----------
  console.log("═══════════════════════════════════════════");
  console.log("👤 PHASE 2: Enriching Customers (preferences)");
  console.log("═══════════════════════════════════════════\n");

  const customersCollection = db.collection("Customers");
  const customers = await customersCollection.find({}).toArray();
  let custUpdated = 0;

  for (const customer of customers) {
    const preferences = generateCustomerPreferences(customer);

    await customersCollection.updateOne(
      { _id: customer._id },
      { $set: { preferences } }
    );
    custUpdated++;
  }

  console.log(`📊 Customers: ${custUpdated} updated with preferences\n`);

  // ----------- PHASE 3: Create POIs collection -----------
  console.log("═══════════════════════════════════════════");
  console.log("🗺️  PHASE 3: Creating POIs (Points of Interest)");
  console.log("═══════════════════════════════════════════\n");

  const poisCollection = db.collection("POIs");
  const existingPOICount = await poisCollection.countDocuments();

  if (existingPOICount > 0) {
    console.log(`  ⚠️ POIs collection already has ${existingPOICount} documents. Skipping.\n`);
  } else {
    const pois = [
      // Miền Bắc
      { placeName: "Phố cổ Hà Nội", address: "Hoàn Kiếm, Hà Nội", category: "Cultural", visitDurationMin: 120, location: { type: "Point", coordinates: [105.8524, 21.0340] } },
      { placeName: "Hồ Hoàn Kiếm", address: "Hoàn Kiếm, Hà Nội", category: "Landmark", visitDurationMin: 60, location: { type: "Point", coordinates: [105.8529, 21.0288] } },
      { placeName: "Lăng Bác", address: "Ba Đình, Hà Nội", category: "Historical", visitDurationMin: 90, location: { type: "Point", coordinates: [105.8345, 21.0367] } },
      { placeName: "Vịnh Hạ Long", address: "Hạ Long, Quảng Ninh", category: "Nature", visitDurationMin: 480, location: { type: "Point", coordinates: [107.0480, 20.9468] } },
      { placeName: "Hang Sửng Sốt", address: "Vịnh Hạ Long", category: "Nature", visitDurationMin: 90, location: { type: "Point", coordinates: [107.0200, 20.9100] } },
      { placeName: "Đỉnh Fansipan", address: "Sa Pa, Lào Cai", category: "Adventure", visitDurationMin: 240, location: { type: "Point", coordinates: [103.7750, 22.3033] } },
      { placeName: "Bản Cát Cát", address: "Sa Pa, Lào Cai", category: "Cultural", visitDurationMin: 120, location: { type: "Point", coordinates: [103.8300, 22.3200] } },
      { placeName: "Đèo Mã Pí Lèng", address: "Mèo Vạc, Hà Giang", category: "Nature", visitDurationMin: 60, location: { type: "Point", coordinates: [105.4072, 23.2531] } },
      { placeName: "Cột cờ Lũng Cú", address: "Đồng Văn, Hà Giang", category: "Landmark", visitDurationMin: 60, location: { type: "Point", coordinates: [105.3190, 23.3645] } },
      { placeName: "Tràng An", address: "Ninh Bình", category: "Nature", visitDurationMin: 180, location: { type: "Point", coordinates: [105.9143, 20.2506] } },
      { placeName: "Chùa Bái Đính", address: "Ninh Bình", category: "Religious", visitDurationMin: 120, location: { type: "Point", coordinates: [105.8481, 20.2742] } },
      { placeName: "Đảo Cát Bà", address: "Hải Phòng", category: "Nature", visitDurationMin: 360, location: { type: "Point", coordinates: [107.0473, 20.7254] } },

      // Miền Trung
      { placeName: "Đại Nội Huế", address: "Huế, Thừa Thiên Huế", category: "Historical", visitDurationMin: 150, location: { type: "Point", coordinates: [107.5773, 16.4698] } },
      { placeName: "Chùa Thiên Mụ", address: "Huế, Thừa Thiên Huế", category: "Religious", visitDurationMin: 60, location: { type: "Point", coordinates: [107.5450, 16.4530] } },
      { placeName: "Bà Nà Hills", address: "Đà Nẵng", category: "Entertainment", visitDurationMin: 360, location: { type: "Point", coordinates: [107.9956, 15.9984] } },
      { placeName: "Cầu Vàng", address: "Bà Nà Hills, Đà Nẵng", category: "Landmark", visitDurationMin: 60, location: { type: "Point", coordinates: [107.9960, 15.9970] } },
      { placeName: "Bãi biển Mỹ Khê", address: "Đà Nẵng", category: "Beach", visitDurationMin: 180, location: { type: "Point", coordinates: [108.2483, 16.0430] } },
      { placeName: "Phố cổ Hội An", address: "Hội An, Quảng Nam", category: "Cultural", visitDurationMin: 180, location: { type: "Point", coordinates: [108.3380, 15.8794] } },
      { placeName: "Thánh địa Mỹ Sơn", address: "Duy Xuyên, Quảng Nam", category: "Historical", visitDurationMin: 150, location: { type: "Point", coordinates: [108.1231, 15.7636] } },
      { placeName: "Động Phong Nha", address: "Quảng Bình", category: "Nature", visitDurationMin: 240, location: { type: "Point", coordinates: [106.2834, 17.5904] } },
      { placeName: "Ghềnh Đá Đĩa", address: "Phú Yên", category: "Nature", visitDurationMin: 60, location: { type: "Point", coordinates: [109.3233, 13.4400] } },
      { placeName: "Tháp Bà Ponagar", address: "Nha Trang", category: "Historical", visitDurationMin: 60, location: { type: "Point", coordinates: [109.1947, 12.2654] } },
      { placeName: "VinWonders Nha Trang", address: "Nha Trang", category: "Entertainment", visitDurationMin: 360, location: { type: "Point", coordinates: [109.2340, 12.2226] } },

      // Miền Nam
      { placeName: "Nhà thờ Đức Bà", address: "Quận 1, TP.HCM", category: "Landmark", visitDurationMin: 30, location: { type: "Point", coordinates: [106.6991, 10.7798] } },
      { placeName: "Chợ Bến Thành", address: "Quận 1, TP.HCM", category: "Shopping", visitDurationMin: 90, location: { type: "Point", coordinates: [106.6983, 10.7725] } },
      { placeName: "Địa đạo Củ Chi", address: "Củ Chi, TP.HCM", category: "Historical", visitDurationMin: 180, location: { type: "Point", coordinates: [106.4616, 11.1411] } },
      { placeName: "Chợ nổi Cái Răng", address: "Cần Thơ", category: "Cultural", visitDurationMin: 120, location: { type: "Point", coordinates: [105.7652, 10.0186] } },
      { placeName: "Bãi Sao", address: "Phú Quốc, Kiên Giang", category: "Beach", visitDurationMin: 240, location: { type: "Point", coordinates: [104.0513, 10.1183] } },
      { placeName: "VinWonders Phú Quốc", address: "Phú Quốc", category: "Entertainment", visitDurationMin: 360, location: { type: "Point", coordinates: [103.8596, 10.3215] } },
      { placeName: "Đồi cát Mũi Né", address: "Phan Thiết, Bình Thuận", category: "Nature", visitDurationMin: 120, location: { type: "Point", coordinates: [108.2940, 10.9520] } },
      { placeName: "Thiền viện Trúc Lâm", address: "Đà Lạt, Lâm Đồng", category: "Religious", visitDurationMin: 90, location: { type: "Point", coordinates: [108.4398, 11.9155] } },
      { placeName: "Thung lũng Tình Yêu", address: "Đà Lạt, Lâm Đồng", category: "Nature", visitDurationMin: 120, location: { type: "Point", coordinates: [108.4452, 11.9643] } },
      { placeName: "Hồ Xuân Hương", address: "Đà Lạt, Lâm Đồng", category: "Nature", visitDurationMin: 60, location: { type: "Point", coordinates: [108.4479, 11.9427] } },
    ];

    await poisCollection.insertMany(pois);
    console.log(`  ✅ Created ${pois.length} POIs across 3 regions\n`);
  }

  // ----------- SUMMARY -----------
  console.log("═══════════════════════════════════════════");
  console.log("🎉 AI DATA ENRICHMENT COMPLETE!");
  console.log("═══════════════════════════════════════════");
  console.log(`  • Tours enriched: ${tourUpdated}`);
  console.log(`  • Customers enriched: ${custUpdated}`);
  console.log(`  • POIs created: ${existingPOICount > 0 ? "skipped (already exists)" : "✓"}`);
  console.log("\n💡 Next step: Run Python AI service to train models.\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
