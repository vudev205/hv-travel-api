import mongoose from "mongoose";
import connectDB from "../config/db.js";
import ChatConversation from "../models/ChatConversation.js";
import ChatMessage from "../models/ChatMessage.js";

const SUPPORT_NAME_FALLBACK = "HV Travel Support";
const STAFF_SENDER_TYPES = ["staff", "admin"];
const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCustomerFilter = (customerId) => {
  const rawId = customerId ? String(customerId) : "";
  const candidates = [customerId, rawId].filter(Boolean);

  if (candidates.length === 1) {
    return { customerId: candidates[0] };
  }

  return {
    $or: candidates.map((value) => ({ customerId: value })),
  };
};

const toConversationResponse = (conversation, supportDisplayName) => ({
  id: String(conversation?._id ?? ""),
  customerId: String(conversation?.customerId ?? ""),
  conversationCode: conversation?.conversationCode ?? "",
  channel: conversation?.channel ?? "web",
  status: conversation?.status ?? "waitingStaff",
  lastMessagePreview: conversation?.lastMessagePreview ?? "",
  lastMessageAt:
    conversation?.lastMessageAt ??
    conversation?.updatedAt ??
    conversation?.createdAt ??
    null,
  unreadForCustomerCount: Number(conversation?.unreadForCustomerCount ?? 0),
  supportDisplayName: supportDisplayName || SUPPORT_NAME_FALLBACK,
});

const findConversationForCustomer = async (customerId, conversationId) => {
  if (!mongoose.isValidObjectId(conversationId)) {
    return null;
  }

  return ChatConversation.findOne({
    _id: conversationId,
    ...getCustomerFilter(customerId),
  }).lean();
};

export const listConversations = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer?._id;
    if (!customerId) {
      return res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    }

    const requestedCustomerId = String(req.query?.customerId ?? "").trim();
    const requestedConversationCode = String(req.query?.conversationCode ?? "").trim();
    const normalizedCustomerId = String(customerId);

    if (requestedCustomerId && requestedCustomerId !== normalizedCustomerId) {
      return res.status(200).json({
        status: true,
        message: "OK",
        data: [],
        total: 0,
      });
    }

    const query = getCustomerFilter(customerId);
    if (requestedConversationCode) {
      query.conversationCode = {
        $regex: escapeRegex(requestedConversationCode),
        $options: "i",
      };
    }

    const conversations = await ChatConversation.find(query)
      .select(
        "_id customerId conversationCode channel status lastMessagePreview lastMessageAt unreadForCustomerCount createdAt updatedAt"
      )
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    const conversationIds = conversations.map((item) => String(item._id)).filter(Boolean);
    const supportNameByConversation = new Map();

    if (conversationIds.length > 0) {
      const latestSupportMessages = await ChatMessage.find({
        conversationId: { $in: conversationIds },
        senderType: { $in: STAFF_SENDER_TYPES },
      })
        .select("conversationId senderDisplayName sentAt createdAt")
        .sort({ sentAt: -1, createdAt: -1, _id: -1 })
        .lean();

      for (const message of latestSupportMessages) {
        const key = String(message.conversationId ?? "");
        if (!key || supportNameByConversation.has(key)) continue;

        const displayName = String(message.senderDisplayName ?? "").trim();
        supportNameByConversation.set(key, displayName || SUPPORT_NAME_FALLBACK);
      }
    }

    const data = conversations.map((conversation) =>
      toConversationResponse(
        conversation,
        supportNameByConversation.get(String(conversation._id)) || SUPPORT_NAME_FALLBACK
      )
    );

    return res.status(200).json({
      status: true,
      message: "OK",
      data,
      total: data.length,
    });
  } catch (err) {
    console.error("listConversations error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const listMessages = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer?._id;
    if (!customerId) {
      return res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    }

    const { conversationId } = req.params;
    const conversation = await findConversationForCustomer(customerId, conversationId);

    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    const normalizedConversationId = String(conversation._id);
    const messages = await ChatMessage.find({ conversationId: normalizedConversationId })
      .select(
        "_id conversationId senderType senderDisplayName messageType content isRead sentAt createdAt"
      )
      .sort({ sentAt: 1, createdAt: 1, _id: 1 })
      .lean();

    const data = messages.map((message) => ({
      id: String(message?._id ?? ""),
      conversationId: String(message?.conversationId ?? normalizedConversationId),
      senderType: message?.senderType ?? "system",
      senderDisplayName: message?.senderDisplayName ?? "",
      messageType: message?.messageType ?? "text",
      content: message?.content ?? "",
      isRead: Boolean(message?.isRead),
      sentAt: message?.sentAt ?? message?.createdAt ?? null,
    }));

    return res.status(200).json({
      status: true,
      message: "OK",
      data,
      total: data.length,
      conversation: toConversationResponse(conversation, SUPPORT_NAME_FALLBACK),
    });
  } catch (err) {
    console.error("listMessages error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const markConversationRead = async (req, res) => {
  try {
    await connectDB();

    const customerId = req.customer?._id;
    if (!customerId) {
      return res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    }

    const { conversationId } = req.params;
    const conversation = await findConversationForCustomer(customerId, conversationId);

    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    const normalizedConversationId = String(conversation._id);
    const now = new Date();

    await ChatConversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          unreadForCustomerCount: 0,
          updatedAt: now,
        },
      }
    );

    await ChatMessage.updateMany(
      {
        conversationId: normalizedConversationId,
        senderType: { $ne: "customer" },
        $or: [{ isRead: false }, { isRead: { $exists: false } }],
      },
      {
        $set: {
          isRead: true,
          readAt: now,
        },
      }
    );

    return res.status(200).json({
      status: true,
      message: "Đã đánh dấu đã đọc",
      data: {
        conversationId: normalizedConversationId,
        unreadForCustomerCount: 0,
      },
    });
  } catch (err) {
    console.error("markConversationRead error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
