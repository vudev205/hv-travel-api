import { GoogleGenerativeAI } from "@google/generative-ai";
import Tour from "../models/Tour.js";
import { getHistory, appendHistory } from "../memory/chatMemory.js";
import connectDB from "../config/db.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const health = async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      status: "error",
      message: "Missing GEMINI_API_KEY"
    });
  }

  return res.status(200).json({
    status: "ok",
    message: "Service is healthy"
  });
};

export const checkGeminiKey = async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    await model.generateContent("OK");

    return res.json({ status: "ok" });
  } catch (err) {
    return res.status(400).json({
      status: "error",
      message: "Invalid Gemini API key",
      detail: err?.message
    });
  }
};


export const chatWithTour = async (req, res) => {
  try {
    await connectDB();
    const { tourId, message, conversationId } = req.body;

    if (!tourId || !message || !conversationId) {
      return res.status(400).json({ message: "Thiếu tourId hoặc message hoặc conversationId" });
    }

    const tour = await Tour.findById(tourId).lean();
    if (!tour) {
      return res.status(404).json({ message: "Không tìm thấy tour" });
    }

    const history = getHistory(conversationId) || [];

    const prompt = buildPrompt(tour, history, message);

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    appendHistory(conversationId, "user", message);
    appendHistory(conversationId, "assistant", text);

    res.json({
      reply: text
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi chatbot" });
  }
};

function buildPrompt(tour, history, userMessage) {
  const historyText = history
    .map(h =>
      h.role === "user"
        ? `Khách: ${h.content}`
        : `Tư vấn viên: ${h.content}`
    )
    .join("\n");

  // Build price info with discount
  const adultPrice = tour.price?.adult || 0;
  const childPrice = tour.price?.child || 0;
  const infantPrice = tour.price?.infant || 0;
  const discount = tour.price?.discount || 0;

  // Build schedule text
  const scheduleText = (tour.schedule || [])
    .map(s => {
      const activities = (s.activities || []).join(", ");
      return `Ngày ${s.day}: ${s.title} - ${s.description}${activities ? ` (${activities})` : ""}`;
    })
    .join("\n");

  // Build inclusions/exclusions
  const inclusionsText = (tour.inclusions || []).join(", ") || "Chưa có thông tin";
  const exclusionsText = (tour.exclusions || []).join(", ") || "Chưa có thông tin";

  return `
  Bạn là một nhân viên tư vấn du lịch chuyên nghiệp của HV Travel.
  QUY TẮC:
  - Nếu người dùng hỏi về bạn, AI, model, hệ thống, công nghệ:
    → trả lời rõ ràng bạn là chatbot HV Travel sử dụng Gemini AI của Google.
  - Nếu người dùng hỏi về tour:
    → chỉ dùng thông tin tour được cung cấp.
  - Nếu câu hỏi KHÔNG liên quan tour:
    → trả lời chung chung, lịch sự, KHÔNG nói "tour chưa có thông tin".

  NHIỆM VỤ:
  - Chỉ tư vấn dựa trên thông tin tour bên dưới
  - Không tự bịa thông tin nếu không có
  - Trả lời ngắn gọn, dễ hiểu, thân thiện
  - Nếu khách hỏi giá → dùng giá và nêu rõ giảm giá nếu có
  - Nếu khách hỏi lịch trình → tóm tắt theo ngày
  - Nếu khách hỏi số chỗ → trả lời theo maxParticipants
  - Nếu không có thông tin → nói "Hiện tour chưa có thông tin này"

  THÔNG TIN TOUR:
  Tên tour: ${tour.name}
  Danh mục: ${tour.category || "Chưa phân loại"}
  Điểm đến: ${tour.destination?.city || ""}, ${tour.destination?.country || "Việt Nam"}
  Mô tả: ${tour.description}
  Thời lượng: ${tour.duration?.text || `${tour.duration?.days || 0} ngày ${tour.duration?.nights || 0} đêm`}

  Giá:
  - Người lớn: ${adultPrice.toLocaleString("vi-VN")} VND
  - Trẻ em: ${childPrice.toLocaleString("vi-VN")} VND
  - Em bé: ${infantPrice.toLocaleString("vi-VN")} VND
  ${discount > 0 ? `- Giảm giá: ${discount}%` : ""}

  Số chỗ: ${tour.maxParticipants || "Không giới hạn"} (đã đặt: ${tour.currentParticipants || 0})

  Bao gồm: ${inclusionsText}
  Không bao gồm: ${exclusionsText}

  Đánh giá: ${tour.rating || 0}/5 (${tour.reviewCount || 0} đánh giá)

  Lịch trình:
  ${scheduleText || "Chưa có lịch trình"}

  Ngày khởi hành: ${tour.startDate ? new Date(tour.startDate).toLocaleDateString("vi-VN") : "Chưa xác định"}

  LỊCH SỬ HỘI THOẠI:
  ${historyText || "(Chưa có)"}

  CÂU HỎI HIỆN TẠI:
  "${userMessage}"

  Trả lời tiếp mạch hội thoại.
  `;
}
