import mongoose from "mongoose";

import connectDB from "../config/db.js";
import User from "../models/User.js";
import ChatConversation from "../models/ChatConversation.js";
import ChatMessage from "../models/ChatMessage.js";
import {
  ACTIVE_SUPPORT_STATUSES,
  buildSupportConversationCode,
  isActiveSupportStatus,
  normalizeSupportStatus,
  parseSupportStatusInput,
  sanitizeSupportConversation,
  sanitizeSupportMessage,
  sortSupportConversations,
} from "../utils/supportChat.js";

const SUPPORT_FALLBACK_TITLE = "HV Travel Support";
const STAFF_SENDER_TYPES = ["staff", "admin"];
const VALID_ADMIN_STATUS_TARGETS = new Set([
  "waitingStaff",
  "open",
  "pending",
  "resolved",
  "closed",
]);

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

const isAdminUser = (req) => req.user?.role === "admin";

const getCustomerId = (req) => String(req.customer?._id ?? req.customer?.id ?? "");

const getUserId = (req) => String(req.user?._id ?? req.user?.id ?? "");

async function getActiveConversationForCustomer(customerId) {
  return ChatConversation.findOne({
    ...getCustomerFilter(customerId),
    status: { $in: [...ACTIVE_SUPPORT_STATUSES] },
  })
    .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
    .lean();
}

async function getConversationForCustomer(customerId, conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) {
    return null;
  }

  return ChatConversation.findOne({
    _id: conversationId,
    ...getCustomerFilter(customerId),
  }).lean();
}

async function getConversationForAdmin(conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) {
    return null;
  }

  return ChatConversation.findById(conversationId).lean();
}

async function loadLatestSupportDisplayNames(conversationIds) {
  const names = new Map();
  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return names;
  }

  const latestSupportMessages = await ChatMessage.find({
    conversationId: { $in: conversationIds },
    senderType: { $in: STAFF_SENDER_TYPES },
  })
    .select("conversationId senderDisplayName sentAt createdAt")
    .sort({ sentAt: -1, createdAt: -1, _id: -1 })
    .lean();

  for (const message of latestSupportMessages) {
    const key = String(message.conversationId ?? "");
    if (!key || names.has(key)) continue;

    const displayName = String(message.senderDisplayName ?? "").trim();
    names.set(key, displayName || SUPPORT_FALLBACK_TITLE);
  }

  return names;
}

async function loadAssignedStaffNames(assignedStaffIds) {
  const names = new Map();
  const uniqueIds = Array.from(
    new Set((assignedStaffIds || []).map((value) => String(value || "").trim()).filter(Boolean))
  );

  if (uniqueIds.length === 0) {
    return names;
  }

  const staffMembers = await User.find({ _id: { $in: uniqueIds } })
    .select("_id fullName")
    .lean();

  for (const member of staffMembers) {
    names.set(String(member._id), String(member.fullName ?? "").trim());
  }

  return names;
}

async function buildConversationResponse(conversation, options = {}) {
  const assignedStaffDisplayName =
    options.assignedStaffNames?.get(String(conversation?.assignedStaffUserId ?? "")) || "";
  const fallbackTitle =
    assignedStaffDisplayName ||
    options.supportDisplayNames?.get(String(conversation?._id ?? "")) ||
    SUPPORT_FALLBACK_TITLE;

  return sanitizeSupportConversation(
    {
      ...conversation,
      assignedStaffDisplayName,
      supportDisplayName: fallbackTitle,
      title: fallbackTitle,
    },
    { fallbackTitle }
  );
}

async function buildConversationList(conversations) {
  const list = Array.isArray(conversations) ? conversations : [];
  const ids = list.map((item) => String(item?._id ?? "")).filter(Boolean);
  const assignedStaffNames = await loadAssignedStaffNames(
    list.map((item) => item?.assignedStaffUserId).filter(Boolean)
  );
  const supportDisplayNames = await loadLatestSupportDisplayNames(ids);

  const sanitized = list.map((conversation) =>
    sanitizeSupportConversation(
      {
        ...conversation,
        assignedStaffDisplayName:
          assignedStaffNames.get(String(conversation?.assignedStaffUserId ?? "")) || "",
        supportDisplayName:
          assignedStaffNames.get(String(conversation?.assignedStaffUserId ?? "")) ||
          supportDisplayNames.get(String(conversation?._id ?? "")) ||
          SUPPORT_FALLBACK_TITLE,
      },
      { fallbackTitle: SUPPORT_FALLBACK_TITLE }
    )
  );

  return sortSupportConversations(sanitized);
}

async function ensureCustomerConversation(customerId, conversationId) {
  return getConversationForCustomer(customerId, conversationId);
}

function assertCustomerAuth(req, res) {
  if (!req.customer?._id) {
    res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    return false;
  }
  return true;
}

function assertAdminAuth(req, res) {
  if (!req.user?._id) {
    res.status(401).json({ status: false, message: "Bạn chưa đăng nhập" });
    return false;
  }

  if (!isAdminUser(req)) {
    res.status(403).json({ status: false, message: "Không có quyền truy cập" });
    return false;
  }

  return true;
}

function parseConversationStatus(value) {
  const status = parseSupportStatusInput(value);
  return status && VALID_ADMIN_STATUS_TARGETS.has(status) ? status : null;
}

export const bootstrapConversation = async (req, res) => {
  try {
    await connectDB();

    if (!assertCustomerAuth(req, res)) return;

    const customerId = getCustomerId(req);
    const sourcePage = String(req.body?.sourcePage ?? req.query?.sourcePage ?? "").trim();

    const activeConversation = await getActiveConversationForCustomer(customerId);
    if (activeConversation) {
      return res.status(200).json({
        status: true,
        message: "OK",
        data: await buildConversationResponse(activeConversation),
        created: false,
      });
    }

    const customer = req.customer;
    const conversation = await ChatConversation.create({
      conversationCode: buildSupportConversationCode(),
      channel: "web",
      status: "waitingStaff",
      participantType: "customer",
      customerId: customer?._id ?? customerId,
      sourcePage,
      lastMessagePreview: "",
      lastMessageAt: null,
      unreadForAdminCount: 0,
      unreadForCustomerCount: 0,
      assignedStaffUserId: "",
    });

    return res.status(201).json({
      status: true,
      message: "OK",
      data: await buildConversationResponse(conversation.toObject()),
      created: true,
    });
  } catch (err) {
    if (err?.code === 11000) {
      const fallbackConversation = await getActiveConversationForCustomer(getCustomerId(req));
      if (fallbackConversation) {
        return res.status(200).json({
          status: true,
          message: "OK",
          data: await buildConversationResponse(fallbackConversation),
          created: false,
        });
      }
    }

    console.error("bootstrapConversation error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const listConversations = async (req, res) => {
  try {
    await connectDB();

    if (!assertCustomerAuth(req, res)) return;

    const customerId = getCustomerId(req);
    const requestedCustomerId = String(req.query?.customerId ?? "").trim();
    const requestedConversationCode = String(req.query?.conversationCode ?? "").trim();

    if (requestedCustomerId && requestedCustomerId !== customerId) {
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
        "_id customerId conversationCode channel status lastMessagePreview lastMessageAt unreadForCustomerCount unreadForAdminCount assignedStaffUserId sourcePage createdAt updatedAt"
      )
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    const data = await buildConversationList(conversations);

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

export const getConversationDetail = async (req, res) => {
  try {
    await connectDB();

    if (!assertCustomerAuth(req, res)) return;

    const customerId = getCustomerId(req);
    const conversation = await ensureCustomerConversation(customerId, req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    return res.status(200).json({
      status: true,
      message: "OK",
      data: await buildConversationResponse(conversation),
    });
  } catch (err) {
    console.error("getConversationDetail error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const listMessages = async (req, res) => {
  try {
    await connectDB();

    if (!assertCustomerAuth(req, res)) return;

    const customerId = getCustomerId(req);
    const conversation = await ensureCustomerConversation(customerId, req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    const normalizedConversationId = String(conversation._id);
    const messages = await ChatMessage.find({ conversationId: normalizedConversationId })
      .select(
        "_id conversationId clientMessageId senderType senderDisplayName messageType content isRead sentAt createdAt readAt"
      )
      .sort({ sentAt: 1, createdAt: 1, _id: 1 })
      .lean();

    const data = messages.map((message) => sanitizeSupportMessage(message));

    return res.status(200).json({
      status: true,
      message: "OK",
      data,
      total: data.length,
      conversation: await buildConversationResponse(conversation),
    });
  } catch (err) {
    console.error("listMessages error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    await connectDB();

    if (!assertCustomerAuth(req, res)) return;

    const customerId = getCustomerId(req);
    const conversation = await ensureCustomerConversation(customerId, req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (!isActiveSupportStatus(conversation.status)) {
      return res.status(409).json({
        status: false,
        message: "Cuộc trò chuyện đã kết thúc. Vui lòng mở lại cuộc trò chuyện.",
      });
    }

    const content = String(req.body?.content ?? req.body?.text ?? "").trim();
    const clientMessageId = String(req.body?.clientMessageId ?? req.body?.client_message_id ?? "").trim();
    const messageType = String(req.body?.messageType ?? req.body?.message_type ?? "text").trim() || "text";

    if (!content) {
      return res.status(400).json({ status: false, message: "Vui lòng nhập nội dung tin nhắn" });
    }

    const normalizedConversationId = String(conversation._id);

    if (clientMessageId) {
      const existingMessage = await ChatMessage.findOne({
        conversationId: normalizedConversationId,
        clientMessageId,
      }).lean();

      if (existingMessage) {
        return res.status(200).json({
          status: true,
          message: "OK",
          duplicate: true,
          data: sanitizeSupportMessage(existingMessage),
          conversation: await buildConversationResponse(conversation),
        });
      }
    }

    const messagePayload = {
      conversationId: normalizedConversationId,
      senderType: "customer",
      senderUserId: customerId,
      senderDisplayName: req.customer?.fullName || "Bạn",
      messageType,
      content,
      isRead: false,
      sentAt: new Date(),
    };

    if (clientMessageId) {
      messagePayload.clientMessageId = clientMessageId;
    }

    const message = await ChatMessage.create(messagePayload);

    await ChatConversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          status: conversation.assignedStaffUserId ? "open" : "waitingStaff",
          lastMessagePreview: content.slice(0, 180),
          lastMessageAt: message.sentAt || new Date(),
          updatedAt: new Date(),
        },
        $inc: {
          unreadForAdminCount: 1,
        },
      }
    );

    const refreshedConversation = await ChatConversation.findById(conversation._id).lean();

    return res.status(201).json({
      status: true,
      message: "OK",
      data: sanitizeSupportMessage(message.toObject()),
      conversation: await buildConversationResponse(refreshedConversation || conversation),
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existingMessage = await ChatMessage.findOne({
        conversationId: String(req.params.conversationId),
        clientMessageId: String(req.body?.clientMessageId ?? req.body?.client_message_id ?? "").trim(),
      }).lean();

      if (existingMessage) {
        const conversation = await ensureCustomerConversation(getCustomerId(req), req.params.conversationId);
        return res.status(200).json({
          status: true,
          message: "OK",
          duplicate: true,
          data: sanitizeSupportMessage(existingMessage),
          conversation: conversation ? await buildConversationResponse(conversation) : undefined,
        });
      }
    }

    console.error("sendMessage error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const reopenConversation = async (req, res) => {
  try {
    await connectDB();

    if (!assertCustomerAuth(req, res)) return;

    const customerId = getCustomerId(req);
    const conversation = await ensureCustomerConversation(customerId, req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    if (isActiveSupportStatus(conversation.status)) {
      return res.status(200).json({
        status: true,
        message: "OK",
        data: await buildConversationResponse(conversation),
      });
    }

    await ChatConversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          status: "waitingStaff",
          assignedStaffUserId: "",
          unreadForAdminCount: 0,
          updatedAt: new Date(),
        },
      }
    );

    const refreshedConversation = await ChatConversation.findById(conversation._id).lean();

    return res.status(200).json({
      status: true,
      message: "Đã mở lại cuộc trò chuyện",
      data: await buildConversationResponse(refreshedConversation || conversation),
    });
  } catch (err) {
    console.error("reopenConversation error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const markConversationRead = async (req, res) => {
  try {
    await connectDB();

    if (!assertCustomerAuth(req, res)) return;

    const customerId = getCustomerId(req);
    const conversation = await ensureCustomerConversation(customerId, req.params.conversationId);

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

export const listAdminQueue = async (req, res) => {
  try {
    await connectDB();

    if (!assertAdminAuth(req, res)) return;

    const statusFilter = String(req.query?.status ?? "").trim();
    const query = {};

    if (statusFilter) {
      const statusTokens = statusFilter
        .split(",")
        .map((item) => parseSupportStatusInput(item))
        .filter(Boolean);
      if (statusTokens.length > 0) {
        query.status = { $in: statusTokens };
      }
    } else {
      query.status = { $in: ["waitingStaff", "open", "pending"] };
    }

    const assignedFilter = String(req.query?.assigned ?? "").trim().toLowerCase();
    if (assignedFilter === "unassigned") {
      query.assignedStaffUserId = "";
    } else if (assignedFilter === "assigned") {
      query.assignedStaffUserId = { $ne: "" };
    }

    const conversations = await ChatConversation.find(query)
      .select(
        "_id customerId conversationCode channel status lastMessagePreview lastMessageAt unreadForCustomerCount unreadForAdminCount assignedStaffUserId sourcePage createdAt updatedAt"
      )
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    const data = await buildConversationList(conversations);

    return res.status(200).json({
      status: true,
      message: "OK",
      data,
      total: data.length,
    });
  } catch (err) {
    console.error("listAdminQueue error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const getAdminConversationDetail = async (req, res) => {
  try {
    await connectDB();

    if (!assertAdminAuth(req, res)) return;

    const conversation = await getConversationForAdmin(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    return res.status(200).json({
      status: true,
      message: "OK",
      data: await buildConversationResponse(conversation),
    });
  } catch (err) {
    console.error("getAdminConversationDetail error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const claimConversation = async (req, res) => {
  try {
    await connectDB();

    if (!assertAdminAuth(req, res)) return;

    const conversation = await getConversationForAdmin(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    const currentAdminId = getUserId(req);
    const force = Boolean(req.body?.force ?? req.body?.takeover);
    const currentAssignee = String(conversation.assignedStaffUserId ?? "");

    if (currentAssignee && currentAssignee !== currentAdminId && !force) {
      return res.status(409).json({
        status: false,
        message: "Cuộc trò chuyện đã được nhận bởi nhân viên khác",
      });
    }

    await ChatConversation.updateOne(
      { _id: conversation._id },
      {
        $set: {
          assignedStaffUserId: currentAdminId,
          status: "open",
          updatedAt: new Date(),
        },
      }
    );

    const refreshedConversation = await ChatConversation.findById(conversation._id).lean();

    return res.status(200).json({
      status: true,
      message: "Đã nhận cuộc trò chuyện",
      data: await buildConversationResponse(refreshedConversation || conversation, {
        assignedStaffNames: new Map([[currentAdminId, req.user?.fullName || ""]]),
      }),
    });
  } catch (err) {
    console.error("claimConversation error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};

export const updateConversationStatus = async (req, res) => {
  try {
    await connectDB();

    if (!assertAdminAuth(req, res)) return;

    const nextStatus = parseConversationStatus(req.body?.status);
    if (!nextStatus) {
      return res.status(400).json({
        status: false,
        message: "Trạng thái không hợp lệ",
      });
    }

    const conversation = await getConversationForAdmin(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ status: false, message: "Không tìm thấy cuộc trò chuyện" });
    }

    const update = {
      status: nextStatus,
      updatedAt: new Date(),
    };

    if (nextStatus === "waitingStaff") {
      update.assignedStaffUserId = "";
    }

    await ChatConversation.updateOne({ _id: conversation._id }, { $set: update });

    const refreshedConversation = await ChatConversation.findById(conversation._id).lean();

    return res.status(200).json({
      status: true,
      message: "Đã cập nhật trạng thái cuộc trò chuyện",
      data: await buildConversationResponse(refreshedConversation || conversation),
    });
  } catch (err) {
    console.error("updateConversationStatus error:", err);
    return res.status(500).json({ status: false, message: "Lỗi server" });
  }
};
