import { GoogleGenerativeAI } from "@google/generative-ai";
import Tour from "../models/Tour.js";
import { getHistory, appendHistory } from "../memory/chatMemory.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const chatWithTour = async (req, res) => {
  try { 
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
  - Nếu khách hỏi giá → dùng newPrice nếu có
  - Nếu khách hỏi lịch trình → tóm tắt theo ngày
  - Nếu khách hỏi số chỗ → trả lời theo stock
  - Nếu không có thông tin → nói "Hiện tour chưa có thông tin này"

  THÔNG TIN TOUR:
  Tên tour: ${tour.name}
  Mô tả: ${tour.description}
  Thời gian: ${tour.time}
  Phương tiện: ${tour.vehicle}

  Giá:
  - Người lớn: ${tour.newPrice?.adult ?? tour.price.adult}
  - Trẻ em: ${tour.newPrice?.children ?? tour.price.children}
  - Em bé: ${tour.newPrice?.baby ?? tour.price.baby}

  Số chỗ còn:
  - Người lớn: ${tour.stock.adult}
  - Trẻ em: ${tour.stock.children}
  - Em bé: ${tour.stock.baby}

  Lịch trình:
  ${tour.itinerary.map(i => `Ngày ${i.day}: ${i.title} - ${i.description}`).join("\n")}

  Ngày khởi hành: ${new Date(tour.startDate).toLocaleDateString("vi-VN")}

  LỊCH SỬ HỘI THOẠI:
  ${historyText || "(Chưa có)"}

  CÂU HỎI HIỆN TẠI:
  "${userMessage}"

  Trả lời tiếp mạch hội thoại.
  `;
}
