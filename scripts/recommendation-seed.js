/**
 * Recommendation data seed/enrichment.
 *
 * Usage:
 *   node scripts/recommendation-seed.js
 *
 * This script is additive:
 * - Enriches existing tours with tags/themes/budget_level/travel_style.
 * - Inserts meaningful Vietnamese tours only when active tour count is below target.
 * - Seeds consistent Favourites, Bookings, and Reviews for recommendation demos.
 */

import dotenv from "dotenv/config";
import mongoose from "mongoose";

const DRY_RUN = String(process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const TARGET_MONGO_URI = process.env.TARGET_MONGO_URI || process.env.MONGO_URI;
const TARGET_DB_NAME = process.env.TARGET_DB_NAME || "HV-Travel-Recommendation-Demo";
const SEED_SOURCE = process.env.SEED_SOURCE || "recommendation-demo";
const TARGET_ACTIVE_TOUR_COUNT = Number(process.env.RECOMMENDATION_TOUR_TARGET || 36);
const TARGET_INTERACTION_COUNT = Number(process.env.RECOMMENDATION_INTERACTION_TARGET || 600);

const THEME_SETS = [
  {
    favoriteThemes: ["Biển", "Nghỉ dưỡng", "Ẩm thực"],
    preferredBudgetLevel: "Trung bình",
    travelStyle: "Nghỉ dưỡng",
    preferredRegions: ["Miền Trung", "Miền Nam"],
  },
  {
    favoriteThemes: ["Núi rừng", "Khám phá", "Mạo hiểm"],
    preferredBudgetLevel: "Trung bình",
    travelStyle: "Khám phá",
    preferredRegions: ["Miền Bắc", "Tây Nguyên"],
  },
  {
    favoriteThemes: ["Văn hóa", "Di sản", "Ẩm thực"],
    preferredBudgetLevel: "Trung bình",
    travelStyle: "Văn hóa",
    preferredRegions: ["Miền Bắc", "Miền Trung"],
  },
  {
    favoriteThemes: ["Gia đình", "Nghỉ dưỡng", "Biển"],
    preferredBudgetLevel: "Cao",
    travelStyle: "Gia đình",
    preferredRegions: ["Miền Trung", "Miền Nam"],
  },
  {
    favoriteThemes: ["Sông nước", "Miền Tây", "Ẩm thực"],
    preferredBudgetLevel: "Thấp",
    travelStyle: "Trải nghiệm địa phương",
    preferredRegions: ["Miền Nam"],
  },
];

const SEED_TOURS = [
  {
    name: "Đà Nẵng - Hội An - Bà Nà Hills 4 ngày 3 đêm",
    category: "Du lịch trong nước",
    destination: { city: "Đà Nẵng", country: "Việt Nam", region: "Miền Trung" },
    description:
      "Hành trình kết hợp biển Mỹ Khê, phố cổ Hội An, Cầu Vàng và không gian nghỉ dưỡng miền Trung.",
    duration: { days: 4, nights: 3, text: "4 ngày 3 đêm" },
    price: { adult: 5690000, child: 3990000, infant: 900000, discount: 8 },
    schedule: [
      day(1, "Đến Đà Nẵng - Biển Mỹ Khê", "Đón khách, nhận phòng và tự do tắm biển.", [
        "Đón sân bay",
        "Nhận phòng khách sạn",
        "Tắm biển Mỹ Khê",
      ]),
      day(2, "Bà Nà Hills - Cầu Vàng", "Tham quan Cầu Vàng, làng Pháp và khu vui chơi trong ngày.", [
        "Đi cáp treo",
        "Tham quan Cầu Vàng",
        "Khám phá làng Pháp",
      ]),
      day(3, "Phố cổ Hội An", "Dạo phố cổ, chùa Cầu và thưởng thức ẩm thực địa phương.", [
        "Tham quan chùa Cầu",
        "Dạo phố đèn lồng",
        "Thưởng thức cao lầu",
      ]),
      day(4, "Mua sắm đặc sản - Kết thúc", "Tự do mua sắm trước khi ra sân bay.", [
        "Mua đặc sản",
        "Trả phòng",
        "Tiễn sân bay",
      ]),
    ],
    inclusions: ["Khách sạn 3 sao", "Xe du lịch", "Vé tham quan Bà Nà Hills", "Hướng dẫn viên"],
    max_participants: 32,
  },
  {
    name: "Huế - Đà Nẵng - Hội An di sản miền Trung 5 ngày 4 đêm",
    category: "Du lịch văn hóa",
    destination: { city: "Huế", country: "Việt Nam", region: "Miền Trung" },
    description:
      "Khám phá Đại Nội Huế, lăng tẩm triều Nguyễn, biển Đà Nẵng và phố cổ Hội An.",
    duration: { days: 5, nights: 4, text: "5 ngày 4 đêm" },
    price: { adult: 6890000, child: 4890000, infant: 1000000, discount: 5 },
    schedule: [
      day(1, "Đến Huế", "Nhận phòng và thưởng thức ẩm thực cố đô.", ["Đón khách", "Dạo sông Hương", "Ăn tối món Huế"]),
      day(2, "Đại Nội - Lăng Khải Định", "Tham quan các công trình tiêu biểu của cố đô.", [
        "Đại Nội Huế",
        "Lăng Khải Định",
        "Chùa Thiên Mụ",
      ]),
      day(3, "Huế - Đà Nẵng", "Di chuyển qua đèo Hải Vân và nghỉ đêm tại Đà Nẵng.", [
        "Đèo Hải Vân",
        "Cầu Rồng",
        "Biển Mỹ Khê",
      ]),
      day(4, "Hội An", "Khám phá phố cổ và các làng nghề ven sông.", ["Phố cổ Hội An", "Chùa Cầu", "Thả đèn hoa đăng"]),
      day(5, "Kết thúc hành trình", "Tự do mua sắm đặc sản miền Trung.", ["Mua sắm", "Trả phòng", "Tiễn sân bay"]),
    ],
    inclusions: ["Khách sạn 3 sao", "Xe du lịch", "Vé tham quan", "Hướng dẫn viên"],
    max_participants: 28,
  },
  {
    name: "Sa Pa - Fansipan - Bản Cát Cát 3 ngày 2 đêm",
    category: "Du lịch khám phá",
    destination: { city: "Sa Pa", country: "Việt Nam", region: "Miền Bắc" },
    description:
      "Trải nghiệm khí hậu vùng cao, chinh phục Fansipan và khám phá văn hóa bản làng Tây Bắc.",
    duration: { days: 3, nights: 2, text: "3 ngày 2 đêm" },
    price: { adult: 4590000, child: 3290000, infant: 700000, discount: 6 },
    schedule: [
      day(1, "Hà Nội - Sa Pa", "Di chuyển lên Sa Pa, nhận phòng và dạo trung tâm thị trấn.", [
        "Xe giường nằm",
        "Nhà thờ đá",
        "Chợ đêm Sa Pa",
      ]),
      day(2, "Fansipan - Bản Cát Cát", "Chinh phục nóc nhà Đông Dương và tham quan bản địa phương.", [
        "Cáp treo Fansipan",
        "Bản Cát Cát",
        "Ẩm thực Tây Bắc",
      ]),
      day(3, "Sa Pa - Hà Nội", "Tự do mua đặc sản trước khi về Hà Nội.", ["Mua đặc sản", "Trả phòng", "Về Hà Nội"]),
    ],
    inclusions: ["Xe khứ hồi", "Khách sạn trung tâm", "Vé bản Cát Cát", "Hướng dẫn viên"],
    max_participants: 24,
  },
  {
    name: "Hà Giang - Đồng Văn - Mã Pí Lèng 4 ngày 3 đêm",
    category: "Du lịch mạo hiểm",
    destination: { city: "Hà Giang", country: "Việt Nam", region: "Miền Bắc" },
    description:
      "Cung đường núi đá hùng vĩ qua Quản Bạ, Đồng Văn, Mã Pí Lèng và sông Nho Quế.",
    duration: { days: 4, nights: 3, text: "4 ngày 3 đêm" },
    price: { adult: 5290000, child: 3790000, infant: 800000, discount: 0 },
    schedule: [
      day(1, "Hà Nội - Hà Giang", "Di chuyển đến Hà Giang và nghỉ đêm.", ["Xe du lịch", "Nhận phòng", "Ăn tối địa phương"]),
      day(2, "Quản Bạ - Yên Minh - Đồng Văn", "Tham quan núi đôi Quản Bạ và cao nguyên đá.", [
        "Núi đôi Quản Bạ",
        "Dốc Thẩm Mã",
        "Phố cổ Đồng Văn",
      ]),
      day(3, "Mã Pí Lèng - Sông Nho Quế", "Ngắm hẻm vực Tu Sản và trải nghiệm thuyền trên sông.", [
        "Đèo Mã Pí Lèng",
        "Sông Nho Quế",
        "Hẻm Tu Sản",
      ]),
      day(4, "Hà Giang - Hà Nội", "Mua đặc sản và trở về Hà Nội.", ["Mua đặc sản", "Về Hà Nội"]),
    ],
    inclusions: ["Xe du lịch", "Homestay/khách sạn", "Vé thuyền Nho Quế", "Hướng dẫn viên"],
    max_participants: 18,
  },
  {
    name: "Phú Quốc nghỉ dưỡng biển đảo 4 ngày 3 đêm",
    category: "Du lịch nghỉ dưỡng",
    destination: { city: "Phú Quốc", country: "Việt Nam", region: "Miền Nam" },
    description:
      "Kỳ nghỉ biển đảo với Bãi Sao, làng chài Hàm Ninh, Grand World và thời gian nghỉ dưỡng tự do.",
    duration: { days: 4, nights: 3, text: "4 ngày 3 đêm" },
    price: { adult: 7990000, child: 5590000, infant: 1200000, discount: 10 },
    schedule: [
      day(1, "Đến Phú Quốc", "Nhận phòng resort và tự do tắm biển.", ["Đón sân bay", "Nhận phòng", "Tắm biển"]),
      day(2, "Nam đảo - Bãi Sao", "Tham quan cơ sở ngọc trai và vui chơi tại Bãi Sao.", [
        "Cơ sở ngọc trai",
        "Bãi Sao",
        "Chợ đêm Dương Đông",
      ]),
      day(3, "Grand World - VinWonders", "Khám phá khu vui chơi và thành phố không ngủ.", [
        "Grand World",
        "VinWonders",
        "Show nhạc nước",
      ]),
      day(4, "Tự do nghỉ dưỡng", "Thư giãn tại resort trước khi ra sân bay.", ["Ăn sáng", "Trả phòng", "Tiễn sân bay"]),
    ],
    inclusions: ["Resort 4 sao", "Xe đưa đón", "Ăn sáng", "Hướng dẫn viên"],
    max_participants: 30,
  },
  {
    name: "Nha Trang - Đảo Hòn Mun - VinWonders 3 ngày 2 đêm",
    category: "Du lịch biển",
    destination: { city: "Nha Trang", country: "Việt Nam", region: "Miền Trung" },
    description:
      "Du lịch biển Nha Trang với trải nghiệm đảo, lặn ngắm san hô và khu vui chơi VinWonders.",
    duration: { days: 3, nights: 2, text: "3 ngày 2 đêm" },
    price: { adult: 4990000, child: 3490000, infant: 800000, discount: 7 },
    schedule: [
      day(1, "Đến Nha Trang", "Nhận phòng và dạo biển Trần Phú.", ["Đón khách", "Nhận phòng", "Dạo biển"]),
      day(2, "Tour đảo Hòn Mun", "Đi cano tham quan đảo và lặn ngắm san hô.", ["Hòn Mun", "Lặn san hô", "Ăn trưa hải sản"]),
      day(3, "VinWonders - Kết thúc", "Vui chơi tại VinWonders trước khi về.", ["VinWonders", "Mua đặc sản", "Tiễn sân bay"]),
    ],
    inclusions: ["Khách sạn 3 sao", "Cano đảo", "Ăn trưa hải sản", "Hướng dẫn viên"],
    max_participants: 35,
  },
  {
    name: "Đà Lạt săn mây - Langbiang - nông trại 3 ngày 2 đêm",
    category: "Du lịch trải nghiệm",
    destination: { city: "Đà Lạt", country: "Việt Nam", region: "Tây Nguyên" },
    description:
      "Không khí cao nguyên, săn mây buổi sáng, Langbiang và trải nghiệm nông trại địa phương.",
    duration: { days: 3, nights: 2, text: "3 ngày 2 đêm" },
    price: { adult: 4290000, child: 3090000, infant: 650000, discount: 5 },
    schedule: [
      day(1, "Đến Đà Lạt", "Tham quan quảng trường Lâm Viên và hồ Xuân Hương.", [
        "Đón khách",
        "Hồ Xuân Hương",
        "Chợ đêm Đà Lạt",
      ]),
      day(2, "Săn mây - Langbiang", "Dậy sớm săn mây và khám phá Langbiang.", [
        "Săn mây Cầu Đất",
        "Đồi chè",
        "Langbiang",
      ]),
      day(3, "Nông trại - Kết thúc", "Tham quan nông trại và mua đặc sản.", ["Nông trại dâu", "Mua đặc sản", "Tiễn khách"]),
    ],
    inclusions: ["Khách sạn trung tâm", "Xe du lịch", "Vé tham quan", "Hướng dẫn viên"],
    max_participants: 25,
  },
  {
    name: "Cần Thơ - Chợ nổi Cái Răng - Cồn Sơn 2 ngày 1 đêm",
    category: "Du lịch miền Tây",
    destination: { city: "Cần Thơ", country: "Việt Nam", region: "Miền Nam" },
    description:
      "Trải nghiệm văn hóa sông nước miền Tây, chợ nổi Cái Răng, vườn trái cây và ẩm thực địa phương.",
    duration: { days: 2, nights: 1, text: "2 ngày 1 đêm" },
    price: { adult: 2390000, child: 1690000, infant: 400000, discount: 0 },
    schedule: [
      day(1, "TP.HCM - Cần Thơ", "Di chuyển đến Cần Thơ và tham quan Cồn Sơn.", [
        "Cồn Sơn",
        "Vườn trái cây",
        "Ăn tối miền Tây",
      ]),
      day(2, "Chợ nổi Cái Răng", "Dậy sớm đi chợ nổi, ăn sáng trên ghe và về TP.HCM.", [
        "Chợ nổi Cái Răng",
        "Lò hủ tiếu",
        "Về TP.HCM",
      ]),
    ],
    inclusions: ["Xe du lịch", "Khách sạn 3 sao", "Thuyền chợ nổi", "Hướng dẫn viên"],
    max_participants: 30,
  },
  {
    name: "Ninh Bình - Tràng An - Bái Đính 2 ngày 1 đêm",
    category: "Du lịch văn hóa",
    destination: { city: "Ninh Bình", country: "Việt Nam", region: "Miền Bắc" },
    description:
      "Hành trình ngắn ngày tham quan danh thắng Tràng An, chùa Bái Đính và cố đô Hoa Lư.",
    duration: { days: 2, nights: 1, text: "2 ngày 1 đêm" },
    price: { adult: 2690000, child: 1890000, infant: 450000, discount: 0 },
    schedule: [
      day(1, "Hà Nội - Bái Đính - Tràng An", "Tham quan chùa Bái Đính và đi thuyền Tràng An.", [
        "Chùa Bái Đính",
        "Thuyền Tràng An",
        "Ẩm thực dê núi",
      ]),
      day(2, "Hoa Lư - Hang Múa", "Tham quan cố đô Hoa Lư và leo Hang Múa.", [
        "Cố đô Hoa Lư",
        "Hang Múa",
        "Về Hà Nội",
      ]),
    ],
    inclusions: ["Xe du lịch", "Khách sạn", "Vé thuyền Tràng An", "Hướng dẫn viên"],
    max_participants: 28,
  },
  {
    name: "Hạ Long du thuyền nghỉ dưỡng 2 ngày 1 đêm",
    category: "Du lịch nghỉ dưỡng",
    destination: { city: "Hạ Long", country: "Việt Nam", region: "Miền Bắc" },
    description:
      "Nghỉ đêm trên du thuyền, tham quan hang động, chèo kayak và ngắm vịnh Hạ Long.",
    duration: { days: 2, nights: 1, text: "2 ngày 1 đêm" },
    price: { adult: 6290000, child: 4390000, infant: 900000, discount: 12 },
    schedule: [
      day(1, "Hà Nội - Hạ Long - Du thuyền", "Lên du thuyền, ăn trưa và tham quan hang động.", [
        "Lên du thuyền",
        "Tham quan hang",
        "Ngắm hoàng hôn",
      ]),
      day(2, "Kayak - Trở về Hà Nội", "Chèo kayak buổi sáng và trở về Hà Nội.", [
        "Chèo kayak",
        "Ăn brunch",
        "Về Hà Nội",
      ]),
    ],
    inclusions: ["Du thuyền 4 sao", "Các bữa ăn trên tàu", "Kayak", "Xe đưa đón"],
    max_participants: 20,
  },
];

function day(dayNumber, title, description, activities) {
  return { day: dayNumber, title, description, activities };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function canonicalTheme(value) {
  const key = normalizeText(value);
  const map = {
    bien: "Biển",
    nghi_duong: "Nghỉ dưỡng",
    "nghi duong": "Nghỉ dưỡng",
    am_thuc: "Ẩm thực",
    "am thuc": "Ẩm thực",
    nui_rung: "Núi rừng",
    "nui rung": "Núi rừng",
    kham_pha: "Khám phá",
    "kham pha": "Khám phá",
    mao_hiem: "Mạo hiểm",
    "mao hiem": "Mạo hiểm",
    van_hoa: "Văn hóa",
    "van hoa": "Văn hóa",
    di_san: "Di sản",
    "di san": "Di sản",
    gia_dinh: "Gia đình",
    "gia dinh": "Gia đình",
    song_nuoc: "Sông nước",
    "song nuoc": "Sông nước",
    mien_tay: "Miền Tây",
    "mien tay": "Miền Tây",
    du_thuyen: "Du thuyền",
    "du thuyen": "Du thuyền",
    nhiep_anh: "Nhiếp ảnh",
    "nhiep anh": "Nhiếp ảnh",
  };
  return map[key] || String(value || "").trim();
}

function canonicalBudget(value) {
  const key = normalizeText(value);
  if (["low", "thap", "tiet kiem", "binh dan"].includes(key)) return "Thấp";
  if (["medium", "trung binh", "pho thong"].includes(key)) return "Trung bình";
  if (["high", "cao", "cao cap", "sang trong", "luxury"].includes(key)) return "Cao";
  return String(value || "Trung bình").trim();
}

function canonicalTravelStyle(value, fallback = "Khám phá") {
  const key = normalizeText(value);
  if (["relaxed", "nghi duong", "thu gian"].includes(key)) return "Nghỉ dưỡng";
  if (["active", "kham pha"].includes(key)) return "Khám phá";
  if (["adventurous", "mao hiem"].includes(key)) return "Mạo hiểm";
  if (["cultural", "van hoa"].includes(key)) return "Văn hóa";
  if (["family", "gia dinh"].includes(key)) return "Gia đình";
  if (["local", "trai nghiem dia phuong", "song nuoc"].includes(key)) return "Trải nghiệm địa phương";
  return String(value || fallback).trim();
}

function canonicalRegion(value) {
  const key = normalizeText(value);
  if (["north", "mien bac", "bac"].includes(key)) return "Miền Bắc";
  if (["central", "mien trung", "trung"].includes(key)) return "Miền Trung";
  if (["south", "mien nam", "nam"].includes(key)) return "Miền Nam";
  if (["highlands", "tay nguyen"].includes(key)) return "Tây Nguyên";
  return String(value || "").trim();
}

function addIf(set, condition, value) {
  if (condition) set.add(value);
}

function budgetLevelFromPrice(price) {
  if (price < 3000000) return "Thấp";
  if (price <= 8000000) return "Trung bình";
  return "Cao";
}

function deriveRecommendationProfile(tour) {
  const text = normalizeText(
    [
      tour.name,
      tour.category,
      tour.destination?.city,
      tour.destination?.region,
      tour.description,
      ...(tour.inclusions || []),
      ...(tour.exclusions || []),
      ...(tour.schedule || []).flatMap((item) => [
        item.title,
        item.description,
        ...(item.activities || []),
      ]),
    ].join(" ")
  );
  const tags = new Set();
  const themes = new Set();
  const price = Number(tour.price?.adult?.toString?.() || tour.price?.adult || 0);
  const days = Number(tour.duration?.days || 0);

  addIf(tags, /da nang|hoi an|nha trang|phu quoc|ha long|vung tau|mui ne|quy nhon|con dao|bien|dao|vinh/.test(text), "Biển");
  addIf(tags, /sapa|sa pa|ha giang|dong van|ma pi leng|langbiang|fansipan|nui|cao nguyen|san may|trek/.test(text), "Núi rừng");
  addIf(tags, /hue|hoi an|ha noi|ninh binh|hoa lu|dai noi|lang tam|chua|di san|van hoa|pho co/.test(text), "Văn hóa");
  addIf(tags, /cho noi|can tho|mien tay|song nuoc|con son|cai rang|ghe|thuyen/.test(text), "Sông nước");
  addIf(tags, /am thuc|dac san|hai san|cao lau|mon hue|de nui|cho dem|food/.test(text), "Ẩm thực");
  addIf(tags, /resort|du thuyen|nghi duong|spa|khach san 4|bien dao/.test(text), "Nghỉ dưỡng");
  addIf(tags, /kayak|leo|trek|mao hiem|chinh phuc|deo|hang mua/.test(text), "Mạo hiểm");
  addIf(tags, /gia dinh|vinwonders|grand world|vui choi|tre em/.test(text), "Gia đình");

  if (days <= 2) tags.add("Ngắn ngày");
  if (days >= 4) tags.add("Dài ngày");

  const region = canonicalRegion(tour.destination?.region || "");
  if (region) tags.add(region);

  const budgetLevel = budgetLevelFromPrice(price);
  tags.add(budgetLevel);

  for (const tag of tags) {
    if (!["Thấp", "Trung bình", "Cao", "Ngắn ngày", "Dài ngày"].includes(tag)) {
      themes.add(tag);
    }
  }

  let travelStyle = "Khám phá";
  if (tags.has("Nghỉ dưỡng")) travelStyle = "Nghỉ dưỡng";
  else if (tags.has("Văn hóa")) travelStyle = "Văn hóa";
  else if (tags.has("Mạo hiểm")) travelStyle = "Mạo hiểm";
  else if (tags.has("Gia đình")) travelStyle = "Gia đình";
  else if (tags.has("Sông nước")) travelStyle = "Trải nghiệm địa phương";

  return {
    tags: [...tags],
    themes: [...themes],
    budget_level: budgetLevel,
    travel_style: travelStyle,
  };
}

function preferenceForCustomer(customer, index) {
  if (customer.preferences?.favoriteThemes?.length) {
    const existing = customer.preferences;
    return {
      favoriteThemes: [...new Set((existing.favoriteThemes || []).map(canonicalTheme).filter(Boolean))],
      preferredBudgetLevel: canonicalBudget(existing.preferredBudgetLevel),
      travelStyle: canonicalTravelStyle(existing.travelStyle || existing.lifestyle),
      preferredRegions: [...new Set((existing.preferredRegions || []).map(canonicalRegion).filter(Boolean))],
    };
  }

  const seed = normalizeText(`${customer.customerCode || ""} ${customer.segment || ""} ${customer.address?.city || ""}`);
  let offset = index;
  if (seed.includes("vip")) offset = 3;
  if (seed.includes("ha noi") || seed.includes("hanoi")) offset = 2;
  if (seed.includes("da nang") || seed.includes("hue")) offset = 1;
  return THEME_SETS[offset % THEME_SETS.length];
}

function scoreTourForPreference(tour, preferences) {
  const tourTerms = new Set(
    [...(tour.tags || []), ...(tour.themes || []), tour.travel_style, tour.budget_level, tour.destination?.region]
      .map((term) => normalizeText(canonicalTheme(canonicalRegion(term))))
  );
  let score = 0;
  for (const theme of preferences.favoriteThemes || []) {
    if (tourTerms.has(normalizeText(canonicalTheme(theme)))) score += 3;
  }
  for (const region of preferences.preferredRegions || []) {
    if (tourTerms.has(normalizeText(canonicalRegion(region)))) score += 2;
  }
  if (normalizeText(tour.budget_level) === normalizeText(preferences.preferredBudgetLevel)) score += 2;
  if (normalizeText(tour.travel_style) === normalizeText(preferences.travelStyle)) score += 2;
  return score;
}

function pickMatchingTours(tours, preferences, count, offset = 0) {
  const ranked = tours
    .map((tour) => ({ tour, score: scoreTourForPreference(tour, preferences) }))
    .sort((a, b) => b.score - a.score || String(a.tour._id).localeCompare(String(b.tour._id)));

  const strong = ranked.filter((item) => item.score > 0).map((item) => item.tour);
  const pool = strong.length >= count ? strong : ranked.map((item) => item.tour);
  return Array.from({ length: Math.min(count, pool.length) }, (_, index) => pool[(index + offset) % pool.length]);
}

function buildBookingCode(customerId, tourId) {
  return `REC${String(customerId).slice(-6).toUpperCase()}${String(tourId).slice(-6).toUpperCase()}`;
}

async function enrichTours(db) {
  const tours = await db.collection("Tours").find({}).toArray();
  let updated = 0;
  const samples = [];

  for (const tour of tours) {
    const profile = deriveRecommendationProfile(tour);
    if (samples.length < 5) {
      samples.push({
        name: tour.name,
        tags: profile.tags,
        budget_level: profile.budget_level,
        travel_style: profile.travel_style,
      });
    }
    if (DRY_RUN) {
      updated++;
      continue;
    }
    await db.collection("Tours").updateOne(
      { _id: tour._id },
      {
        $set: {
          tags: profile.tags,
          themes: profile.themes,
          budget_level: profile.budget_level,
          travel_style: profile.travel_style,
          recommendation_enriched: true,
          recommendation_enriched_at: new Date(),
          updated_at: new Date(),
        },
      }
    );
    updated++;
  }

  return { updated, samples };
}

async function insertMissingTours(db) {
  const activeCount = await db.collection("Tours").countDocuments({ status: "Active" });
  const missingCount = Math.max(0, TARGET_ACTIVE_TOUR_COUNT - activeCount);
  const candidates = SEED_TOURS.slice(0, missingCount);
  let inserted = 0;
  const samples = candidates.slice(0, 5).map((tour) => ({
    name: tour.name,
    destination: tour.destination,
    duration: tour.duration?.text,
    price: tour.price?.adult,
  }));

  for (const source of candidates) {
    const exists = await db.collection("Tours").findOne({ name: source.name });
    if (exists) continue;

    const profile = deriveRecommendationProfile(source);
    if (DRY_RUN) {
      inserted++;
      continue;
    }
    const now = new Date();
    const startDates = [30, 45, 60].map((days) => new Date(now.getTime() + days * 86400000));
    await db.collection("Tours").insertOne({
      ...source,
      images: source.images || [],
      current_participants: Math.floor(source.max_participants * 0.35),
      review_count: 0,
      rating: 0,
      start_dates: startDates,
      status: "Active",
      is_deleted: false,
      tags: profile.tags,
      themes: profile.themes,
      budget_level: profile.budget_level,
      travel_style: profile.travel_style,
      seed_source: SEED_SOURCE,
      recommendation_enriched: true,
      recommendation_enriched_at: now,
      created_at: now,
      updated_at: now,
    });
    inserted++;
  }

  return { inserted, activeCount, targetActiveCount: TARGET_ACTIVE_TOUR_COUNT, samples };
}

async function enrichCustomers(db) {
  const customers = await db.collection("Customers").find({ status: "Active" }).toArray();
  let updated = 0;
  const samples = [];

  for (let index = 0; index < customers.length; index++) {
    const customer = customers[index];
    const preferences = preferenceForCustomer(customer, index);
    if (samples.length < 5) {
      samples.push({
        customerCode: customer.customerCode,
        fullName: customer.fullName,
        preferences,
      });
    }
    if (DRY_RUN) {
      updated++;
      continue;
    }
    await db.collection("Customers").updateOne(
      { _id: customer._id },
      {
        $set: {
          preferences,
          recommendation_enriched: true,
          recommendation_enriched_at: new Date(),
          updatedAt: new Date(),
        },
      }
    );
    updated++;
  }

  return { updated, samples };
}

async function seedInteractions(db) {
  const customers = await db.collection("Customers").find({ status: "Active" }).limit(120).toArray();
  const tours = await db.collection("Tours").find({ status: "Active", is_deleted: { $ne: true } }).toArray();
  const currentInteractions =
    (await db.collection("Favourites").countDocuments({})) +
    (await db.collection("Bookings").countDocuments({})) +
    (await db.collection("Reviews").countDocuments({}));

  if (currentInteractions >= TARGET_INTERACTION_COUNT || !customers.length || !tours.length) {
    return { favourites: 0, bookings: 0, reviews: 0, skipped: true, currentInteractions };
  }

  let favouriteCount = 0;
  let bookingCount = 0;
  let reviewCount = 0;
  const samples = [];

  for (let customerIndex = 0; customerIndex < customers.length; customerIndex++) {
    const customer = customers[customerIndex];
    const preferences = preferenceForCustomer(customer, customerIndex);
    const selectedTours = pickMatchingTours(tours, preferences, 6, customerIndex % 5);

    for (let tourIndex = 0; tourIndex < selectedTours.length; tourIndex++) {
      const tour = selectedTours[tourIndex];
      const shouldBook = tourIndex % 3 === 0;
      const shouldReview = tourIndex % 2 === 0;

      if (samples.length < 8) {
        samples.push({
          customer: customer.customerCode || String(customer._id),
          tour: tour.name,
          actions: ["favourite", shouldBook ? "booking" : null, shouldReview ? "review" : null].filter(Boolean),
        });
      }

      if (DRY_RUN) {
        favouriteCount++;
        if (shouldBook) bookingCount++;
        if (shouldReview) reviewCount++;
        continue;
      }

      await db.collection("Favourites").updateOne(
        { customerId: customer._id, tourId: tour._id },
        {
          $setOnInsert: {
            customerId: customer._id,
            tourId: tour._id,
            seed_source: SEED_SOURCE,
            createdAt: new Date(),
          },
          $set: { updatedAt: new Date() },
        },
        { upsert: true }
      );
      favouriteCount++;

      if (shouldBook) {
        const exists = await db.collection("Bookings").findOne({ customer_id: customer._id, tour_id: tour._id });
        if (!exists) {
          await db.collection("Bookings").insertOne({
            booking_code: buildBookingCode(customer._id, tour._id),
            tour_id: tour._id,
            tour_snapshot: {
              code: String(tour._id),
              name: tour.name,
              start_date: tour.start_dates?.[0] || null,
              duration: tour.duration?.text || "",
            },
            customer_id: customer._id,
            booking_date: new Date(Date.now() - (customerIndex + tourIndex + 1) * 86400000),
            total_amount: mongoose.Types.Decimal128.fromString(String(Number(tour.price?.adult || 0))),
            status: tourIndex % 4 === 0 ? "Completed" : "Paid",
            payment_status: "Paid",
            participants_count: 2,
            passengers: [
              {
                full_name: customer.fullName || "Khách hàng HV Travel",
                birth_date: null,
                type: "Adult",
                gender: null,
                passport_number: null,
              },
              {
                full_name: "Người đi cùng",
                birth_date: null,
                type: "Adult",
                gender: null,
                passport_number: null,
              },
            ],
            contact_info: {
              name: customer.fullName || "Khách hàng HV Travel",
              email: customer.email,
              phone: customer.phoneNumber || "0900000000",
            },
            notes: "Dữ liệu demo cho mô hình gợi ý tour.",
            history_log: [{ action: "created", timestamp: new Date(), user: "recommendation-seed", note: "Seed demo" }],
            seed_source: SEED_SOURCE,
            created_at: new Date(),
            updated_at: new Date(),
            is_deleted: false,
          });
          bookingCount++;
        }
      }

      if (shouldReview) {
        const rating = Math.min(5, 4 + ((customerIndex + tourIndex) % 3) * 0.5);
        await db.collection("Reviews").updateOne(
          { customerId: customer._id, tourId: tour._id },
          {
            $set: {
              rating,
              comment: `Tour ${tour.name} phù hợp với sở thích ${preferences.favoriteThemes.join(", ")}.`,
              isApproved: true,
              seed_source: SEED_SOURCE,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              customerId: customer._id,
              tourId: tour._id,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
        reviewCount++;
      }
    }
  }

  return {
    favourites: favouriteCount,
    bookings: bookingCount,
    reviews: reviewCount,
    skipped: false,
    currentInteractions,
    samples,
  };
}

async function main() {
  if (!TARGET_MONGO_URI) {
    throw new Error("Missing TARGET_MONGO_URI or MONGO_URI");
  }

  await mongoose.connect(TARGET_MONGO_URI, { dbName: TARGET_DB_NAME });
  const db = mongoose.connection.db;

  const insertedTours = await insertMissingTours(db);
  const enrichedTours = await enrichTours(db);
  const enrichedCustomers = await enrichCustomers(db);
  const interactions = await seedInteractions(db);

  console.log(DRY_RUN ? "Recommendation seed preview completed" : "Recommendation seed completed");
  console.log(`Mode: ${DRY_RUN ? "DRY_RUN" : "WRITE"}`);
  console.log(`Target DB: ${TARGET_DB_NAME}`);
  console.log(`Seed source: ${SEED_SOURCE}`);
  console.log(`Tours inserted: ${insertedTours.inserted}`);
  console.log(`Tours enriched: ${enrichedTours.updated}`);
  console.log(`Customers enriched: ${enrichedCustomers.updated}`);
  console.log(`Interactions: ${JSON.stringify(interactions)}`);

  if (DRY_RUN) {
    console.log("Tour samples to insert:");
    console.log(JSON.stringify(insertedTours.samples, null, 2));
    console.log("Tour enrichment samples:");
    console.log(JSON.stringify(enrichedTours.samples, null, 2));
    console.log("Customer preference samples:");
    console.log(JSON.stringify(enrichedCustomers.samples, null, 2));
    console.log("Interaction samples:");
    console.log(JSON.stringify(interactions.samples || [], null, 2));
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Recommendation seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
