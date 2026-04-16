import crypto from "node:crypto";

export const SUPPORT_CONVERSATION_STATUSES = {
  WAITING_STAFF: "waitingStaff",
  OPEN: "open",
  PENDING: "pending",
  RESOLVED: "resolved",
  CLOSED: "closed",
};

export const ACTIVE_SUPPORT_STATUSES = new Set([
  SUPPORT_CONVERSATION_STATUSES.WAITING_STAFF,
  SUPPORT_CONVERSATION_STATUSES.OPEN,
  SUPPORT_CONVERSATION_STATUSES.PENDING,
]);

const SUPPORT_STATUS_LABELS = {
  [SUPPORT_CONVERSATION_STATUSES.WAITING_STAFF]: "Đang chờ nhân viên",
  [SUPPORT_CONVERSATION_STATUSES.OPEN]: "Đang hoạt động",
  [SUPPORT_CONVERSATION_STATUSES.PENDING]: "Đang chờ khách phản hồi",
  [SUPPORT_CONVERSATION_STATUSES.RESOLVED]: "Đã giải quyết",
  [SUPPORT_CONVERSATION_STATUSES.CLOSED]: "Đã kết thúc",
};

const SUPPORT_STATUS_ALIASES = new Map(
  Object.entries({
    waitingstaff: SUPPORT_CONVERSATION_STATUSES.WAITING_STAFF,
    waiting_staff: SUPPORT_CONVERSATION_STATUSES.WAITING_STAFF,
    open: SUPPORT_CONVERSATION_STATUSES.OPEN,
    pending: SUPPORT_CONVERSATION_STATUSES.PENDING,
    resolved: SUPPORT_CONVERSATION_STATUSES.RESOLVED,
    closed: SUPPORT_CONVERSATION_STATUSES.CLOSED,
  })
);

const cloneDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime());
};

const toStringValue = (value) => String(value ?? "").trim();

const toNumber = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTimestamp = (value) => {
  const date = cloneDate(value);
  return date ? date.getTime() : 0;
};

export function normalizeSupportStatus(value) {
  const normalized = toStringValue(value).replace(/\s+/g, "").toLowerCase();
  return SUPPORT_STATUS_ALIASES.get(normalized) || SUPPORT_CONVERSATION_STATUSES.WAITING_STAFF;
}

export function parseSupportStatusInput(value) {
  const normalized = toStringValue(value).replace(/\s+/g, "").toLowerCase();
  return SUPPORT_STATUS_ALIASES.get(normalized) || null;
}

export function isActiveSupportStatus(value) {
  return ACTIVE_SUPPORT_STATUSES.has(normalizeSupportStatus(value));
}

export function getSupportStatusLabel(status) {
  return SUPPORT_STATUS_LABELS[normalizeSupportStatus(status)];
}

export function getSupportConversationTitle(conversation, fallback = "HV Travel Support") {
  const assignedName = toStringValue(
    conversation?.assignedStaffDisplayName ||
      conversation?.supportDisplayName ||
      conversation?.title
  );
  return assignedName || fallback;
}

export function getSupportConversationSubtitle(status) {
  return getSupportStatusLabel(status);
}

export function sortSupportConversations(conversations) {
  return [...(Array.isArray(conversations) ? conversations : [])].sort((left, right) => {
    const leftUnread = toNumber(left?.unreadForCustomerCount ?? left?.unreadCount);
    const rightUnread = toNumber(right?.unreadForCustomerCount ?? right?.unreadCount);

    if (rightUnread !== leftUnread) {
      return rightUnread - leftUnread;
    }

    return (
      getTimestamp(right?.lastMessageAt || right?.updatedAt || right?.createdAt) -
      getTimestamp(left?.lastMessageAt || left?.updatedAt || left?.createdAt)
    );
  });
}

export function buildSupportConversationCode(prefix = "SUP") {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `${prefix}${stamp}${suffix}`;
}

export function pickActiveSupportConversation(conversations, customerId) {
  const normalizedCustomerId = toStringValue(customerId);
  const candidates = (Array.isArray(conversations) ? conversations : []).filter((conversation) => {
    if (!conversation) return false;
    const matchesCustomer = toStringValue(conversation.customerId) === normalizedCustomerId;
    return matchesCustomer && isActiveSupportStatus(conversation.status);
  });

  return candidates.sort((left, right) => {
    if (toNumber(right.unreadForCustomerCount) !== toNumber(left.unreadForCustomerCount)) {
      return toNumber(right.unreadForCustomerCount) - toNumber(left.unreadForCustomerCount);
    }

    return (
      getTimestamp(right.lastMessageAt || right.updatedAt || right.createdAt) -
      getTimestamp(left.lastMessageAt || left.updatedAt || left.createdAt)
    );
  })[0] || null;
}

export function sanitizeSupportConversation(conversation, options = {}) {
  const status = normalizeSupportStatus(conversation?.status);
  const supportDisplayName = getSupportConversationTitle(conversation, options.fallbackTitle);
  const conversationId = toStringValue(conversation?._id ?? conversation?.id);
  const customerId = toStringValue(conversation?.customerId);
  const conversationCode = toStringValue(conversation?.conversationCode ?? conversation?.code);
  const lastMessageAt = cloneDate(
    conversation?.lastMessageAt || conversation?.updatedAt || conversation?.createdAt
  );
  const lastMessagePreview = toStringValue(
    conversation?.lastMessagePreview ?? conversation?.preview
  );
  const unreadForCustomerCount = toNumber(
    conversation?.unreadForCustomerCount ?? conversation?.unreadCount
  );
  const unreadForAdminCount = toNumber(
    conversation?.unreadForAdminCount ?? conversation?.unread_for_admin_count
  );
  const assignedStaffUserId = toStringValue(conversation?.assignedStaffUserId);
  const sourcePage = toStringValue(conversation?.sourcePage);
  const channel = toStringValue(conversation?.channel || "web") || "web";
  const isActive = isActiveSupportStatus(status);

  return {
    id: conversationId,
    _id: conversationId,
    customerId,
    customer_id: customerId,
    conversationCode,
    conversation_code: conversationCode,
    channel,
    status,
    statusLabel: getSupportStatusLabel(status),
    lastMessagePreview,
    lastMessagePreviewText: lastMessagePreview,
    lastMessageAt,
    lastMessageAtIso: lastMessageAt ? lastMessageAt.toISOString() : null,
    unreadForCustomerCount,
    unreadForCustomerCountLabel: unreadForCustomerCount,
    unread_for_customer_count: unreadForCustomerCount,
    unreadForAdminCount,
    unread_for_admin_count: unreadForAdminCount,
    assignedStaffUserId,
    assigned_staff_user_id: assignedStaffUserId,
    sourcePage,
    source_page: sourcePage,
    supportDisplayName,
    support_display_name: supportDisplayName,
    title: supportDisplayName,
    subtitle: getSupportStatusLabel(status),
    isActive,
    canReopen: !isActive,
    createdAt: cloneDate(conversation?.createdAt),
    updatedAt: cloneDate(conversation?.updatedAt),
  };
}

export function sanitizeSupportMessage(message) {
  const sentAt = cloneDate(message?.sentAt || message?.createdAt);
  const conversationId = toStringValue(message?.conversationId);
  const clientMessageId = toStringValue(message?.clientMessageId);
  const senderType = toStringValue(message?.senderType || "system") || "system";
  const senderDisplayName = toStringValue(message?.senderDisplayName);
  const messageType = toStringValue(message?.messageType || "text") || "text";
  const content = toStringValue(message?.content ?? message?.text);

  return {
    id: toStringValue(message?._id ?? message?.id),
    _id: toStringValue(message?._id ?? message?.id),
    conversationId,
    conversation_id: conversationId,
    clientMessageId,
    client_message_id: clientMessageId,
    senderType,
    sender_type: senderType,
    senderRole:
      senderType === "customer"
        ? "customer"
        : senderType === "staff" || senderType === "admin"
          ? "support"
          : "system",
    senderDisplayName,
    sender_display_name: senderDisplayName,
    messageType,
    message_type: messageType,
    content,
    text: content,
    isRead: Boolean(message?.isRead),
    is_read: Boolean(message?.isRead),
    sentAt,
    sent_at: sentAt,
    createdAt: cloneDate(message?.createdAt),
    created_at: cloneDate(message?.createdAt),
    readAt: cloneDate(message?.readAt),
    read_at: cloneDate(message?.readAt),
  };
}

export function upsertSupportMessage(state, input) {
  if (!state || !Array.isArray(state.messages)) {
    throw new Error("State.messages must be an array");
  }

  const clientMessageId = toStringValue(input?.clientMessageId);
  const messageId = toStringValue(input?.id) || `msg_${crypto.randomUUID()}`;
  const existingIndex =
    clientMessageId.length > 0
      ? state.messages.findIndex(
          (item) =>
            toStringValue(item?.clientMessageId) === clientMessageId &&
            toStringValue(item?.conversationId) === toStringValue(input?.conversationId)
        )
      : -1;

  if (existingIndex >= 0) {
    const existingMessage = state.messages[existingIndex];
    return {
      isDuplicate: true,
      message: existingMessage,
      index: existingIndex,
    };
  }

  const message = sanitizeSupportMessage({
    ...input,
    _id: messageId,
    id: messageId,
  });

  state.messages.push(message);

  return {
    isDuplicate: false,
    message,
    index: state.messages.length - 1,
  };
}
