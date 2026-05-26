import dotenv from "dotenv/config";
import mongoose from "mongoose";

const DB_NAME = process.env.TARGET_DB_NAME || process.env.MONGO_DB_NAME || "HV-Travel-Recommendation-Demo";
const SOURCE = "recommendation-expanded-demo";
const DRY_RUN = String(process.env.DRY_RUN ?? "true").toLowerCase() !== "false";

const day = (dayNumber, title, description, activities = []) => ({
  day: dayNumber,
  title,
  description,
  activities,
});

const tour = ({
  name,
  category,
  city,
  region,
  days,
  nights,
  adult,
  child,
  infant,
  discount = 0,
  tags,
  themes,
  travelStyle,
  budget,
  description,
  schedule,
  maxParticipants = 28,
}) => ({
  name,
  category,
  destination: { city, country: "Việt Nam", region },
  description,
  duration: { days, nights, text: `${days} ngày ${nights} đêm` },
  price: { adult, child, infant, discount },
  schedule,
  tags,
  themes,
  travel_style: travelStyle,
  budget_level: budget,
  max_participants: maxParticipants,
  current_participants: 0,
  inclusions: ["Xe du lịch", "Khách sạn", "Hướng dẫn viên", "Vé tham quan theo chương trình"],
  exclusions: ["Chi phí cá nhân", "Đồ uống ngoài chương trình", "Phụ thu phòng đơn"],
  rating: 4.4,
  review_count: 0,
  status: "Active",
  is_deleted: false,
  seed_source: SOURCE,
  start_dates: [15, 30, 45].map((offset) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000)),
});

const TOUR_DEFINITIONS = [
  tour({
    name: "Đà Nẵng nghỉ dưỡng biển Mỹ Khê 3 ngày 2 đêm",
    category: "Du lịch biển",
    city: "Đà Nẵng",
    region: "Miền Trung",
    days: 3,
    nights: 2,
    adult: 4590000,
    child: 3290000,
    infant: 800000,
    discount: 7,
    tags: ["Biển", "Nghỉ dưỡng", "Ẩm thực", "Miền Trung", "Trung bình"],
    themes: ["Biển", "Nghỉ dưỡng", "Ẩm thực"],
    travelStyle: "Nghỉ dưỡng",
    budget: "Trung bình",
    description: "Kỳ nghỉ nhẹ nhàng tại biển Mỹ Khê, kết hợp thưởng thức hải sản, cầu Rồng và phố đêm Đà Nẵng.",
    schedule: [
      day(1, "Đến Đà Nẵng - Biển Mỹ Khê", "Nhận phòng và thư giãn bên bờ biển.", ["Đón sân bay", "Tắm biển Mỹ Khê", "Ăn tối hải sản"]),
      day(2, "Bán đảo Sơn Trà - Cầu Rồng", "Tham quan chùa Linh Ứng và ngắm thành phố về đêm.", ["Chùa Linh Ứng", "Cầu Rồng", "Chợ đêm Sơn Trà"]),
      day(3, "Mua đặc sản - Kết thúc", "Tự do mua sắm trước khi ra sân bay.", ["Mua đặc sản", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Đà Nẵng - Hội An ẩm thực phố cổ 4 ngày 3 đêm",
    category: "Du lịch ẩm thực",
    city: "Hội An",
    region: "Miền Trung",
    days: 4,
    nights: 3,
    adult: 5290000,
    child: 3790000,
    infant: 900000,
    tags: ["Ẩm thực", "Văn hóa", "Biển", "Miền Trung", "Trung bình"],
    themes: ["Ẩm thực", "Văn hóa"],
    travelStyle: "Trải nghiệm địa phương",
    budget: "Trung bình",
    description: "Hành trình dành cho người thích ẩm thực miền Trung: mì Quảng, cao lầu, bánh mì Hội An và phố cổ về đêm.",
    schedule: [
      day(1, "Đà Nẵng - Hội An", "Di chuyển về phố cổ Hội An.", ["Đón khách", "Dạo phố cổ", "Ăn tối cao lầu"]),
      day(2, "Lớp học nấu ăn", "Trải nghiệm chợ địa phương và nấu món miền Trung.", ["Đi chợ Hội An", "Lớp nấu ăn", "Thả đèn hoa đăng"]),
      day(3, "Cù Lao Chàm", "Tham quan biển đảo và ăn trưa hải sản.", ["Cano Cù Lao Chàm", "Lặn ngắm san hô", "Hải sản địa phương"]),
      day(4, "Kết thúc", "Mua đặc sản và trả phòng.", ["Mua quà", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Huế di sản và ẩm thực cung đình 3 ngày 2 đêm",
    category: "Du lịch văn hóa",
    city: "Huế",
    region: "Miền Trung",
    days: 3,
    nights: 2,
    adult: 4290000,
    child: 2990000,
    infant: 700000,
    tags: ["Văn hóa", "Di sản", "Ẩm thực", "Miền Trung", "Trung bình"],
    themes: ["Văn hóa", "Di sản", "Ẩm thực"],
    travelStyle: "Văn hóa",
    budget: "Trung bình",
    description: "Khám phá Đại Nội, lăng tẩm triều Nguyễn và thưởng thức các món Huế đặc trưng.",
    schedule: [
      day(1, "Đến Huế", "Nhận phòng và ăn tối món Huế.", ["Đón sân bay", "Sông Hương", "Bún bò Huế"]),
      day(2, "Đại Nội - Lăng Khải Định", "Tham quan di sản cố đô.", ["Đại Nội", "Lăng Khải Định", "Chùa Thiên Mụ"]),
      day(3, "Chợ Đông Ba", "Mua đặc sản Huế.", ["Chợ Đông Ba", "Trả phòng", "Tiễn khách"]),
    ],
  }),
  tour({
    name: "Huế - Phá Tam Giang trải nghiệm địa phương 2 ngày 1 đêm",
    category: "Du lịch trải nghiệm",
    city: "Huế",
    region: "Miền Trung",
    days: 2,
    nights: 1,
    adult: 2390000,
    child: 1690000,
    infant: 500000,
    tags: ["Sông nước", "Ẩm thực", "Văn hóa", "Miền Trung", "Thấp"],
    themes: ["Sông nước", "Ẩm thực", "Trải nghiệm địa phương"],
    travelStyle: "Trải nghiệm địa phương",
    budget: "Thấp",
    description: "Ngắm hoàng hôn Phá Tam Giang, ăn hải sản đầm phá và tìm hiểu đời sống ngư dân.",
    schedule: [
      day(1, "Huế - Phá Tam Giang", "Di chuyển đến đầm phá và ngắm hoàng hôn.", ["Thuyền đầm phá", "Hoàng hôn", "Ăn tối hải sản"]),
      day(2, "Chợ quê - Kết thúc", "Tham quan chợ quê và trở về Huế.", ["Chợ quê", "Cafe địa phương", "Kết thúc"]),
    ],
  }),
  tour({
    name: "Sa Pa trekking bản làng 4 ngày 3 đêm",
    category: "Du lịch khám phá",
    city: "Sa Pa",
    region: "Miền Bắc",
    days: 4,
    nights: 3,
    adult: 4890000,
    child: 3490000,
    infant: 800000,
    tags: ["Núi rừng", "Khám phá", "Mạo hiểm", "Miền Bắc", "Trung bình"],
    themes: ["Núi rừng", "Khám phá", "Mạo hiểm"],
    travelStyle: "Khám phá",
    budget: "Trung bình",
    description: "Trekking qua bản Lao Chải, Tả Van, ngắm ruộng bậc thang và nghỉ homestay cùng người địa phương.",
    schedule: [
      day(1, "Đến Sa Pa", "Nhận phòng và làm quen khí hậu vùng cao.", ["Đón khách", "Nhà thờ đá", "Chợ đêm Sa Pa"]),
      day(2, "Lao Chải - Tả Van", "Trekking xuyên bản làng.", ["Trekking", "Ruộng bậc thang", "Homestay"]),
      day(3, "Fansipan", "Chinh phục nóc nhà Đông Dương bằng cáp treo.", ["Cáp treo Fansipan", "Cổng trời", "Ẩm thực vùng cao"]),
      day(4, "Kết thúc", "Tự do mua đặc sản.", ["Mua đặc sản", "Trả phòng", "Kết thúc"]),
    ],
  }),
  tour({
    name: "Mộc Châu mùa hoa và nông trại 3 ngày 2 đêm",
    category: "Du lịch thiên nhiên",
    city: "Mộc Châu",
    region: "Miền Bắc",
    days: 3,
    nights: 2,
    adult: 3290000,
    child: 2390000,
    infant: 600000,
    tags: ["Núi rừng", "Gia đình", "Nông trại", "Miền Bắc", "Thấp"],
    themes: ["Gia đình", "Núi rừng", "Trải nghiệm địa phương"],
    travelStyle: "Gia đình",
    budget: "Thấp",
    description: "Tour nhẹ nhàng cho gia đình: đồi chè, nông trại bò sữa, thác Dải Yếm và mùa hoa Mộc Châu.",
    schedule: [
      day(1, "Hà Nội - Mộc Châu", "Di chuyển đến cao nguyên Mộc Châu.", ["Đồi chè", "Nhận phòng", "Ăn tối địa phương"]),
      day(2, "Nông trại - Thác Dải Yếm", "Tham quan nông trại và thác nước.", ["Nông trại bò sữa", "Thác Dải Yếm", "Vườn hoa"]),
      day(3, "Kết thúc", "Mua sữa, chè và đặc sản.", ["Mua đặc sản", "Trở về Hà Nội"]),
    ],
  }),
  tour({
    name: "Hà Giang trekking cao nguyên đá 5 ngày 4 đêm",
    category: "Du lịch mạo hiểm",
    city: "Hà Giang",
    region: "Miền Bắc",
    days: 5,
    nights: 4,
    adult: 6590000,
    child: 4590000,
    infant: 1000000,
    tags: ["Mạo hiểm", "Núi rừng", "Khám phá", "Miền Bắc", "Trung bình"],
    themes: ["Mạo hiểm", "Khám phá", "Núi rừng"],
    travelStyle: "Mạo hiểm",
    budget: "Trung bình",
    description: "Cung đường dành cho người thích khám phá: Đồng Văn, Mã Pí Lèng, sông Nho Quế và bản làng vùng cao.",
    schedule: [
      day(1, "Hà Nội - Hà Giang", "Di chuyển lên Hà Giang.", ["Xe giường nằm", "Nhận phòng", "Ăn tối"]),
      day(2, "Quản Bạ - Yên Minh", "Khám phá núi đôi và rừng thông.", ["Núi đôi Quản Bạ", "Dốc Thẩm Mã", "Yên Minh"]),
      day(3, "Đồng Văn - Mã Pí Lèng", "Ngắm hẻm Tu Sản và đèo Mã Pí Lèng.", ["Đèo Mã Pí Lèng", "Sông Nho Quế", "Phố cổ Đồng Văn"]),
      day(4, "Lũng Cú - bản làng", "Thăm cột cờ Lũng Cú và làng văn hóa.", ["Cột cờ Lũng Cú", "Bản Lô Lô", "Chợ phiên"]),
      day(5, "Trở về", "Kết thúc hành trình.", ["Mua đặc sản", "Trở về Hà Nội"]),
    ],
  }),
  tour({
    name: "Hạ Long du thuyền cao cấp 3 ngày 2 đêm",
    category: "Du lịch nghỉ dưỡng",
    city: "Hạ Long",
    region: "Miền Bắc",
    days: 3,
    nights: 2,
    adult: 8990000,
    child: 6290000,
    infant: 1500000,
    tags: ["Biển", "Du thuyền", "Nghỉ dưỡng", "Miền Bắc", "Cao"],
    themes: ["Biển", "Du thuyền", "Nghỉ dưỡng"],
    travelStyle: "Nghỉ dưỡng",
    budget: "Cao",
    description: "Nghỉ dưỡng trên du thuyền cao cấp, chèo kayak, hang Sửng Sốt và tiệc tối trên vịnh.",
    schedule: [
      day(1, "Lên du thuyền", "Check-in du thuyền và ngắm vịnh.", ["Welcome drink", "Ngắm hoàng hôn", "Tiệc tối"]),
      day(2, "Hang động - Kayak", "Khám phá hang động và chèo kayak.", ["Hang Sửng Sốt", "Kayak", "Lớp nấu ăn"]),
      day(3, "Kết thúc", "Brunch trên du thuyền và trở về cảng.", ["Taichi sáng", "Brunch", "Rời tàu"]),
    ],
  }),
  tour({
    name: "Ninh Bình cuối tuần cho gia đình 2 ngày 1 đêm",
    category: "Du lịch gia đình",
    city: "Ninh Bình",
    region: "Miền Bắc",
    days: 2,
    nights: 1,
    adult: 1990000,
    child: 1390000,
    infant: 400000,
    tags: ["Gia đình", "Văn hóa", "Sông nước", "Miền Bắc", "Thấp"],
    themes: ["Gia đình", "Văn hóa", "Sông nước"],
    travelStyle: "Gia đình",
    budget: "Thấp",
    description: "Lịch trình ngắn ngày, phù hợp gia đình: Tràng An, Bái Đính và đặc sản dê núi.",
    schedule: [
      day(1, "Tràng An", "Đi thuyền Tràng An và ăn tối đặc sản.", ["Thuyền Tràng An", "Hang động", "Dê núi"]),
      day(2, "Bái Đính", "Tham quan chùa Bái Đính và trở về.", ["Chùa Bái Đính", "Mua đặc sản", "Kết thúc"]),
    ],
  }),
  tour({
    name: "Phú Quốc resort gia đình 5 ngày 4 đêm",
    category: "Du lịch gia đình",
    city: "Phú Quốc",
    region: "Miền Nam",
    days: 5,
    nights: 4,
    adult: 10900000,
    child: 7590000,
    infant: 1800000,
    tags: ["Biển", "Gia đình", "Nghỉ dưỡng", "Miền Nam", "Cao"],
    themes: ["Biển", "Gia đình", "Nghỉ dưỡng"],
    travelStyle: "Gia đình",
    budget: "Cao",
    description: "Kỳ nghỉ resort cho gia đình tại Phú Quốc, kết hợp VinWonders, safari và đảo Nam.",
    schedule: [
      day(1, "Đến Phú Quốc", "Nhận phòng resort và nghỉ ngơi.", ["Đón sân bay", "Check-in resort", "Tắm biển"]),
      day(2, "VinWonders - Safari", "Vui chơi cả ngày cho gia đình.", ["VinWonders", "Safari", "Ăn tối"]),
      day(3, "Đảo Nam", "Cáp treo Hòn Thơm và biển đảo.", ["Cáp treo", "Hòn Thơm", "Lặn biển"]),
      day(4, "Nghỉ dưỡng tự do", "Tận hưởng tiện ích resort.", ["Hồ bơi", "Spa", "Hoàng hôn"]),
      day(5, "Kết thúc", "Mua đặc sản và ra sân bay.", ["Mua ngọc trai", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Phú Quốc khám phá đảo Nam 3 ngày 2 đêm",
    category: "Du lịch biển",
    city: "Phú Quốc",
    region: "Miền Nam",
    days: 3,
    nights: 2,
    adult: 5490000,
    child: 3890000,
    infant: 900000,
    tags: ["Biển", "Khám phá", "Ẩm thực", "Miền Nam", "Trung bình"],
    themes: ["Biển", "Khám phá", "Ẩm thực"],
    travelStyle: "Khám phá",
    budget: "Trung bình",
    description: "Tour đảo Nam Phú Quốc cho người thích biển, hải sản, lặn ngắm san hô và ngắm hoàng hôn.",
    schedule: [
      day(1, "Đến Phú Quốc", "Dạo chợ đêm và ăn hải sản.", ["Đón sân bay", "Chợ đêm", "Hải sản"]),
      day(2, "Đảo Nam", "Đi cano khám phá đảo.", ["Cano đảo", "Lặn san hô", "Cáp treo Hòn Thơm"]),
      day(3, "Kết thúc", "Mua đặc sản.", ["Mua nước mắm", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Nha Trang nghỉ dưỡng gia đình 4 ngày 3 đêm",
    category: "Du lịch gia đình",
    city: "Nha Trang",
    region: "Miền Trung",
    days: 4,
    nights: 3,
    adult: 6790000,
    child: 4690000,
    infant: 1000000,
    tags: ["Biển", "Gia đình", "Nghỉ dưỡng", "Miền Trung", "Trung bình"],
    themes: ["Biển", "Gia đình", "Nghỉ dưỡng"],
    travelStyle: "Gia đình",
    budget: "Trung bình",
    description: "Nghỉ dưỡng biển Nha Trang, phù hợp gia đình có trẻ nhỏ với lịch trình nhẹ và nhiều thời gian tự do.",
    schedule: [
      day(1, "Đến Nha Trang", "Nhận phòng và tắm biển.", ["Đón sân bay", "Tắm biển", "Ăn tối"]),
      day(2, "VinWonders", "Vui chơi tại VinWonders.", ["Cáp treo", "Thủy cung", "Công viên nước"]),
      day(3, "Tour đảo", "Đi đảo và ăn trưa hải sản.", ["Hòn Mun", "Lặn biển", "Hải sản"]),
      day(4, "Kết thúc", "Mua yến sào và đặc sản.", ["Mua đặc sản", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Nha Trang lặn biển Hòn Mun 3 ngày 2 đêm",
    category: "Du lịch mạo hiểm",
    city: "Nha Trang",
    region: "Miền Trung",
    days: 3,
    nights: 2,
    adult: 4990000,
    child: 3490000,
    infant: 800000,
    tags: ["Biển", "Mạo hiểm", "Khám phá", "Miền Trung", "Trung bình"],
    themes: ["Biển", "Mạo hiểm", "Khám phá"],
    travelStyle: "Mạo hiểm",
    budget: "Trung bình",
    description: "Dành cho người thích hoạt động biển: lặn ngắm san hô, chèo SUP và khám phá vịnh Nha Trang.",
    schedule: [
      day(1, "Đến Nha Trang", "Nhận phòng và chuẩn bị lịch trình biển.", ["Đón sân bay", "Tắm biển", "Ăn tối"]),
      day(2, "Hòn Mun", "Lặn biển và chèo SUP.", ["Lặn san hô", "Chèo SUP", "Ăn trưa trên đảo"]),
      day(3, "Kết thúc", "Tự do cafe biển.", ["Cafe biển", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Đà Lạt nghỉ dưỡng săn mây 4 ngày 3 đêm",
    category: "Du lịch nghỉ dưỡng",
    city: "Đà Lạt",
    region: "Tây Nguyên",
    days: 4,
    nights: 3,
    adult: 5790000,
    child: 3990000,
    infant: 900000,
    tags: ["Núi rừng", "Nghỉ dưỡng", "Ẩm thực", "Tây Nguyên", "Trung bình"],
    themes: ["Núi rừng", "Nghỉ dưỡng", "Ẩm thực"],
    travelStyle: "Nghỉ dưỡng",
    budget: "Trung bình",
    description: "Săn mây, cafe đồi thông, nông trại và không khí se lạnh đặc trưng Đà Lạt.",
    schedule: [
      day(1, "Đến Đà Lạt", "Nhận phòng và dạo chợ đêm.", ["Đón sân bay", "Chợ đêm", "Ẩm thực Đà Lạt"]),
      day(2, "Săn mây", "Dậy sớm săn mây và cafe view đồi.", ["Săn mây", "Cafe đồi thông", "Vườn dâu"]),
      day(3, "Nông trại", "Tham quan nông trại và thác nước.", ["Nông trại", "Thác Datanla", "Lẩu gà lá é"]),
      day(4, "Kết thúc", "Mua đặc sản.", ["Mua mứt", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Đà Lạt trekking thác và rừng thông 3 ngày 2 đêm",
    category: "Du lịch mạo hiểm",
    city: "Đà Lạt",
    region: "Tây Nguyên",
    days: 3,
    nights: 2,
    adult: 3890000,
    child: 2790000,
    infant: 700000,
    tags: ["Mạo hiểm", "Núi rừng", "Khám phá", "Tây Nguyên", "Thấp"],
    themes: ["Mạo hiểm", "Núi rừng", "Khám phá"],
    travelStyle: "Mạo hiểm",
    budget: "Thấp",
    description: "Trekking nhẹ qua rừng thông, thác nước và trải nghiệm khí hậu cao nguyên.",
    schedule: [
      day(1, "Đến Đà Lạt", "Làm quen thành phố.", ["Đón khách", "Hồ Xuân Hương", "Chợ đêm"]),
      day(2, "Trekking rừng thông", "Đi bộ đường rừng và thác nước.", ["Trekking", "Thác nước", "Picnic"]),
      day(3, "Kết thúc", "Cafe sáng và trả phòng.", ["Cafe Đà Lạt", "Trả phòng", "Kết thúc"]),
    ],
  }),
  tour({
    name: "Cần Thơ homestay chợ nổi 3 ngày 2 đêm",
    category: "Du lịch miền Tây",
    city: "Cần Thơ",
    region: "Miền Nam",
    days: 3,
    nights: 2,
    adult: 2990000,
    child: 2090000,
    infant: 500000,
    tags: ["Sông nước", "Ẩm thực", "Miền Tây", "Miền Nam", "Thấp"],
    themes: ["Sông nước", "Ẩm thực", "Trải nghiệm địa phương"],
    travelStyle: "Trải nghiệm địa phương",
    budget: "Thấp",
    description: "Ở homestay miệt vườn, đi chợ nổi Cái Răng, ăn trái cây và trải nghiệm đời sống miền Tây.",
    schedule: [
      day(1, "Đến Cần Thơ", "Nhận homestay và ăn tối miệt vườn.", ["Đón khách", "Homestay", "Đờn ca tài tử"]),
      day(2, "Chợ nổi Cái Răng", "Dậy sớm đi chợ nổi.", ["Chợ nổi", "Lò hủ tiếu", "Vườn trái cây"]),
      day(3, "Kết thúc", "Mua đặc sản miền Tây.", ["Mua đặc sản", "Trả phòng", "Kết thúc"]),
    ],
  }),
  tour({
    name: "Bến Tre xe đạp miệt vườn 2 ngày 1 đêm",
    category: "Du lịch trải nghiệm",
    city: "Bến Tre",
    region: "Miền Nam",
    days: 2,
    nights: 1,
    adult: 1890000,
    child: 1290000,
    infant: 400000,
    tags: ["Sông nước", "Trải nghiệm địa phương", "Ẩm thực", "Miền Nam", "Thấp"],
    themes: ["Sông nước", "Trải nghiệm địa phương", "Ẩm thực"],
    travelStyle: "Trải nghiệm địa phương",
    budget: "Thấp",
    description: "Đạp xe qua đường làng, đi xuồng rạch dừa và ăn đặc sản Bến Tre.",
    schedule: [
      day(1, "Bến Tre", "Đi xuồng và tham quan lò kẹo dừa.", ["Xuồng rạch dừa", "Lò kẹo dừa", "Ăn tối địa phương"]),
      day(2, "Đạp xe miệt vườn", "Đạp xe và trở về.", ["Đạp xe", "Vườn trái cây", "Kết thúc"]),
    ],
  }),
  tour({
    name: "Côn Đảo nghỉ dưỡng biển xanh 4 ngày 3 đêm",
    category: "Du lịch biển",
    city: "Côn Đảo",
    region: "Miền Nam",
    days: 4,
    nights: 3,
    adult: 8790000,
    child: 6190000,
    infant: 1500000,
    tags: ["Biển", "Nghỉ dưỡng", "Văn hóa", "Miền Nam", "Cao"],
    themes: ["Biển", "Nghỉ dưỡng", "Văn hóa"],
    travelStyle: "Nghỉ dưỡng",
    budget: "Cao",
    description: "Kết hợp nghỉ dưỡng biển Côn Đảo, lịch sử và thiên nhiên hoang sơ.",
    schedule: [
      day(1, "Đến Côn Đảo", "Nhận phòng và tắm biển.", ["Đón sân bay", "Tắm biển", "Ăn tối"]),
      day(2, "Di tích Côn Đảo", "Tìm hiểu lịch sử.", ["Nhà tù Côn Đảo", "Nghĩa trang Hàng Dương", "Cafe biển"]),
      day(3, "Đảo nhỏ", "Tự do nghỉ dưỡng hoặc đi tour đảo.", ["Tour đảo", "Lặn biển", "Hoàng hôn"]),
      day(4, "Kết thúc", "Trả phòng và ra sân bay.", ["Mua đặc sản", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Quy Nhơn - Phú Yên biển đảo 4 ngày 3 đêm",
    category: "Du lịch biển",
    city: "Quy Nhơn",
    region: "Miền Trung",
    days: 4,
    nights: 3,
    adult: 6290000,
    child: 4390000,
    infant: 1000000,
    tags: ["Biển", "Khám phá", "Ẩm thực", "Miền Trung", "Trung bình"],
    themes: ["Biển", "Khám phá", "Ẩm thực"],
    travelStyle: "Khám phá",
    budget: "Trung bình",
    description: "Khám phá Kỳ Co, Eo Gió, Gành Đá Đĩa và ẩm thực biển miền Trung.",
    schedule: [
      day(1, "Đến Quy Nhơn", "Nhận phòng và ăn tối hải sản.", ["Đón sân bay", "Biển Quy Nhơn", "Hải sản"]),
      day(2, "Kỳ Co - Eo Gió", "Đi cano và ngắm biển.", ["Kỳ Co", "Eo Gió", "Cano"]),
      day(3, "Phú Yên", "Tham quan Gành Đá Đĩa.", ["Gành Đá Đĩa", "Nhà thờ Mằng Lăng", "Bãi Xép"]),
      day(4, "Kết thúc", "Mua đặc sản.", ["Mua đặc sản", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Quảng Bình hang động mạo hiểm 4 ngày 3 đêm",
    category: "Du lịch mạo hiểm",
    city: "Quảng Bình",
    region: "Miền Trung",
    days: 4,
    nights: 3,
    adult: 7490000,
    child: 5290000,
    infant: 1200000,
    tags: ["Mạo hiểm", "Hang động", "Khám phá", "Miền Trung", "Cao"],
    themes: ["Mạo hiểm", "Khám phá", "Núi rừng"],
    travelStyle: "Mạo hiểm",
    budget: "Cao",
    description: "Khám phá Phong Nha, động Thiên Đường và trekking hang động phù hợp người ưa vận động.",
    schedule: [
      day(1, "Đến Đồng Hới", "Nhận phòng và nghỉ ngơi.", ["Đón sân bay", "Biển Nhật Lệ", "Ăn tối"]),
      day(2, "Phong Nha", "Tham quan hang bằng thuyền.", ["Động Phong Nha", "Sông Son", "Ẩm thực địa phương"]),
      day(3, "Thiên Đường - trekking", "Khám phá hang động và đường rừng.", ["Động Thiên Đường", "Trekking", "Suối Moọc"]),
      day(4, "Kết thúc", "Mua đặc sản.", ["Mua đặc sản", "Trả phòng", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Tây Nguyên văn hóa cồng chiêng 4 ngày 3 đêm",
    category: "Du lịch văn hóa",
    city: "Buôn Ma Thuột",
    region: "Tây Nguyên",
    days: 4,
    nights: 3,
    adult: 5290000,
    child: 3690000,
    infant: 900000,
    tags: ["Văn hóa", "Núi rừng", "Ẩm thực", "Tây Nguyên", "Trung bình"],
    themes: ["Văn hóa", "Núi rừng", "Ẩm thực"],
    travelStyle: "Văn hóa",
    budget: "Trung bình",
    description: "Tìm hiểu văn hóa cồng chiêng, thác Dray Nur, bảo tàng cà phê và ẩm thực Tây Nguyên.",
    schedule: [
      day(1, "Đến Buôn Ma Thuột", "Nhận phòng và thưởng thức cà phê.", ["Đón sân bay", "Làng cà phê", "Ăn tối"]),
      day(2, "Thác Dray Nur", "Khám phá thác và rừng.", ["Thác Dray Nur", "Cầu treo", "Ẩm thực Ê Đê"]),
      day(3, "Văn hóa cồng chiêng", "Giao lưu văn hóa địa phương.", ["Bảo tàng cà phê", "Cồng chiêng", "Nhà dài"]),
      day(4, "Kết thúc", "Mua cà phê và đặc sản.", ["Mua cà phê", "Tiễn sân bay"]),
    ],
  }),
  tour({
    name: "Hà Nội - Hạ Long - Ninh Bình di sản 5 ngày 4 đêm",
    category: "Du lịch văn hóa",
    city: "Hà Nội",
    region: "Miền Bắc",
    days: 5,
    nights: 4,
    adult: 6990000,
    child: 4890000,
    infant: 1000000,
    tags: ["Văn hóa", "Di sản", "Sông nước", "Miền Bắc", "Trung bình"],
    themes: ["Văn hóa", "Di sản", "Sông nước"],
    travelStyle: "Văn hóa",
    budget: "Trung bình",
    description: "Cung di sản miền Bắc: phố cổ Hà Nội, vịnh Hạ Long và Tràng An Ninh Bình.",
    schedule: [
      day(1, "Hà Nội", "Tham quan phố cổ.", ["Phố cổ", "Hồ Gươm", "Ẩm thực Hà Nội"]),
      day(2, "Hạ Long", "Du thuyền trong ngày.", ["Vịnh Hạ Long", "Hang động", "Hải sản"]),
      day(3, "Ninh Bình", "Đi thuyền Tràng An.", ["Tràng An", "Bái Đính", "Dê núi"]),
      day(4, "Hà Nội tự do", "Mua sắm và cafe.", ["Cafe phố cổ", "Mua quà", "Tự do"]),
      day(5, "Kết thúc", "Tiễn sân bay.", ["Trả phòng", "Tiễn sân bay"]),
    ],
  }),
];

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const overlapScore = (customer, tourDoc) => {
  const prefs = customer.preferences || {};
  const terms = [
    ...(prefs.favoriteThemes || []),
    ...(prefs.preferredRegions || []),
    prefs.preferredBudgetLevel,
    prefs.travelStyle,
  ].map(normalize);
  const tourTerms = [
    ...(tourDoc.tags || []),
    ...(tourDoc.themes || []),
    tourDoc.travel_style,
    tourDoc.budget_level,
    tourDoc.destination?.region,
  ].map(normalize);
  return terms.filter((term) => term && tourTerms.includes(term)).length;
};

async function main() {
  if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");
  await mongoose.connect(process.env.MONGO_URI, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  const tours = db.collection("Tours");
  const customers = await db.collection("Customers").find({ preferences: { $exists: true } }).toArray();
  const imagePool = [
    ...new Set(
      (await tours.find({ "images.0": { $exists: true, $nin: [null, ""] } }).project({ images: 1 }).toArray())
        .flatMap((doc) => doc.images || [])
        .filter(Boolean)
    ),
  ];
  if (!imagePool.length) throw new Error("No images available to reuse");

  const existingNames = new Set((await tours.find({}).project({ name: 1 }).toArray()).map((item) => item.name));
  const now = new Date();
  const docs = TOUR_DEFINITIONS.filter((item) => !existingNames.has(item.name)).map((item, index) => ({
    ...item,
    images: [imagePool[index % imagePool.length]],
    created_at: now,
    updated_at: now,
  }));

  if (DRY_RUN) {
    console.log(JSON.stringify({ dryRun: true, db: DB_NAME, wouldInsertTours: docs.length }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const inserted = docs.length ? await tours.insertMany(docs) : { insertedIds: {} };
  const insertedTours = Object.values(inserted.insertedIds || {}).length
    ? await tours.find({ _id: { $in: Object.values(inserted.insertedIds) } }).toArray()
    : [];

  const favourites = db.collection("Favourites");
  const bookings = db.collection("Bookings");
  const reviews = db.collection("Reviews");

  let favUpserts = 0;
  let bookingInserts = 0;
  let reviewUpserts = 0;

  for (const tourDoc of insertedTours) {
    const matched = customers
      .map((customer) => ({ customer, score: overlapScore(customer, tourDoc) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 14);

    for (const [index, item] of matched.entries()) {
      const customerId = item.customer._id;
      await favourites.updateOne(
        { customerId, tourId: tourDoc._id },
        { $setOnInsert: { customerId, tourId: tourDoc._id, createdAt: now, updatedAt: now, seed_source: SOURCE } },
        { upsert: true }
      );
      favUpserts += 1;

      if (index < 5) {
        const exists = await bookings.findOne({ customer_id: customerId, tour_id: tourDoc._id, seed_source: SOURCE });
        if (!exists) {
          await bookings.insertOne({
            booking_code: `RECEXP-${Date.now()}-${String(bookingInserts + 1).padStart(4, "0")}`,
            tour_id: tourDoc._id,
            tour_snapshot: {
              name: tourDoc.name,
              start_date: tourDoc.start_dates?.[0] || null,
              duration: tourDoc.duration?.text || "",
            },
            customer_id: customerId,
            booking_date: new Date(now.getTime() - (index + 1) * 86400000),
            total_amount: mongoose.Types.Decimal128.fromString(String(tourDoc.price.adult)),
            status: index % 2 === 0 ? "Completed" : "Confirmed",
            payment_status: index % 2 === 0 ? "Paid" : "Full",
            participants_count: 2,
            passengers: [
              { full_name: item.customer.fullName || "Khách demo", type: "Adult" },
              { full_name: "Người đi cùng", type: "Adult" },
            ],
            contact_info: {
              name: item.customer.fullName || "Khách demo",
              email: item.customer.email || "demo@example.com",
              phone: item.customer.phoneNumber || "0900000000",
            },
            notes: "Seed interaction for recommendation expanded demo",
            history_log: [{ action: "Created", timestamp: now, user: "seed", note: SOURCE }],
            is_deleted: false,
            seed_source: SOURCE,
            created_at: now,
            updated_at: now,
          });
          bookingInserts += 1;
        }
      }

      if (index < 8) {
        const rating = 4 + ((index + item.score) % 2) + (index % 2) * 0.5;
        await reviews.updateOne(
          { customerId, tourId: tourDoc._id },
          {
            $set: {
              customerId,
              tourId: tourDoc._id,
              rating: Math.min(5, rating),
              comment: "Tour phù hợp sở thích, lịch trình rõ ràng và dễ dùng cho demo gợi ý.",
              isApproved: true,
              updatedAt: now,
              seed_source: SOURCE,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true }
        );
        reviewUpserts += 1;
      }
    }

    const tourReviews = await reviews.find({ tourId: tourDoc._id, isApproved: true }).toArray();
    const avgRating = tourReviews.length
      ? tourReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / tourReviews.length
      : tourDoc.rating;
    await tours.updateOne(
      { _id: tourDoc._id },
      {
        $set: {
          rating: Math.round(avgRating * 10) / 10,
          review_count: tourReviews.length,
          updated_at: now,
        },
      }
    );
  }

  const activeTours = await tours.countDocuments({ status: "Active", is_deleted: { $ne: true } });
  console.log(
    JSON.stringify(
      {
        db: DB_NAME,
        insertedTours: insertedTours.length,
        activeTours,
        favUpserts,
        bookingInserts,
        reviewUpserts,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
