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
        ? `User: ${h.content}`
        : `Assistant: ${h.content}`
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
      return `Day ${s.day}: ${s.title} - ${s.description}${activities ? ` (${activities})` : ""}`;
    })
    .join("\n");

  // Build inclusions/exclusions
  const inclusionsText = (tour.inclusions || []).join(", ") || "Not available";
  const exclusionsText = (tour.exclusions || []).join(", ") || "Not available";
  const startDateText =
    tour.start_dates && tour.start_dates.length > 0
      ? new Date(tour.start_dates[0]).toISOString().slice(0, 10)
      : "Not specified";

  return `
  You are a professional travel advisor chatbot for HV Travel.

  OUTPUT LANGUAGE RULE - STRICT:
  - Detect the language of the CURRENT USER QUESTION only.
  - Reply in that same language.
  - If the current question is in Vietnamese, reply in Vietnamese.
  - If the current question is in English, reply in English.
  - If the current question is in another language, reply in that language.
  - If the current question mixes languages, use the dominant language unless the user explicitly asks for a different language.
  - Do not default to Vietnamese just because the tour data, previous messages, or this system prompt contains Vietnamese text.
  - Keep proper nouns, tour names, place names, booking codes, and prices unchanged when appropriate.

  BEHAVIOR RULES:
  - If the user asks about you, AI, model, system, or technology, say that you are an HV Travel chatbot powered by Google Gemini AI.
  - If the user asks about the tour, answer only from the tour data below.
  - If the user asks something not related to the tour, answer politely in general terms; do not say the tour lacks information.
  - Do not invent facts that are not present in the tour data.
  - Keep answers concise, clear, friendly, and practical.
  - If the user asks about price, use the price fields and mention discount when available.
  - If the user asks about itinerary, summarize by day.
  - If the user asks about seats/capacity, answer using max_participants and current_participants.
  - If the tour data does not contain the requested detail, say naturally in the user's language that this information is not available yet.

  TOUR DATA:
  Tour name: ${tour.name}
  Category: ${tour.category || "Uncategorized"}
  Destination: ${tour.destination?.city || ""}, ${tour.destination?.country || "Vietnam"}
  Description: ${tour.description}
  Duration: ${tour.duration?.text || `${tour.duration?.days || 0} days ${tour.duration?.nights || 0} nights`}

  Prices:
  - Adult: ${adultPrice.toLocaleString("vi-VN")} VND
  - Child: ${childPrice.toLocaleString("vi-VN")} VND
  - Infant: ${infantPrice.toLocaleString("vi-VN")} VND
  ${discount > 0 ? `- Discount: ${discount}%` : ""}

  Capacity: ${tour.max_participants || "Unlimited"} (booked: ${tour.current_participants || 0})

  Inclusions: ${inclusionsText}
  Exclusions: ${exclusionsText}

  Rating: ${tour.rating || 0}/5 (${tour.review_count || 0} reviews)

  Itinerary:
  ${scheduleText || "Not available"}

  Start date: ${startDateText}

  CONVERSATION HISTORY:
  ${historyText || "(None)"}

  CURRENT USER QUESTION:
  "${userMessage}"

  Continue the conversation. Remember: the final answer must use the same language as the CURRENT USER QUESTION.
  `;
}
