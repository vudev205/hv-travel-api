import { randomUUID } from "node:crypto";

const DEFAULT_SNAPSHOT_LIMIT = 50;
const ROOM_PREFIX = {
  user: "user",
  agent: "agent",
  conversation: "conversation",
  queue: "support:queue",
};

const conversationStore = new Map();
const clientMessageLedger = new Map();
const customerConversationIndex = new Map();

const nowIso = () => new Date().toISOString();

const getSnapshotLimit = () => {
  const parsed = Number(process.env.SNAPSHOT_LIMIT || DEFAULT_SNAPSHOT_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SNAPSHOT_LIMIT;
};

const buildConversationKey = (conversationId) => String(conversationId || "").trim();

const buildRoomNames = (principal, conversationId) => ({
  userRoom: `${ROOM_PREFIX.user}:${principal.userId}`,
  agentRoom: `${ROOM_PREFIX.agent}:${principal.userId}`,
  conversationRoom: `${ROOM_PREFIX.conversation}:${conversationId}`,
});

const createConversationRecord = ({ conversationId, customerId, initialStatus = "waitingStaff" }) => {
  const timestamp = nowIso();
  return {
    id: conversationId,
    customerId,
    assignedAgentId: null,
    assignedAgentName: "",
    status: initialStatus,
    topic: "",
    lastMessagePreview: "",
    lastMessageAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    unreadForCustomerCount: 0,
    unreadForAgentCount: 0,
    typingUsers: new Map(),
    messages: [],
    participants: new Set([customerId]),
    resolvedAt: null,
  };
};

const serializeConversation = (conversation) => ({
  id: conversation.id,
  customerId: conversation.customerId,
  assignedAgentId: conversation.assignedAgentId,
  assignedAgentName: conversation.assignedAgentName,
  status: conversation.status,
  topic: conversation.topic,
  lastMessagePreview: conversation.lastMessagePreview,
  lastMessageAt: conversation.lastMessageAt,
  unreadForCustomerCount: conversation.unreadForCustomerCount,
  unreadForAgentCount: conversation.unreadForAgentCount,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  resolvedAt: conversation.resolvedAt,
});

const serializeMessage = (message) => ({
  id: message.id,
  conversationId: message.conversationId,
  senderId: message.senderId,
  senderRole: message.senderRole,
  senderDisplayName: message.senderDisplayName,
  messageType: message.messageType,
  body: message.body,
  clientMessageId: message.clientMessageId,
  readAt: message.readAt,
  createdAt: message.createdAt,
});

const ensureConversationForCustomer = (customerId) => {
  const existingConversationId = customerConversationIndex.get(customerId);
  if (existingConversationId) {
    const existingConversation = conversationStore.get(existingConversationId);
    if (existingConversation && !["resolved", "closed"].includes(existingConversation.status)) {
      return existingConversation;
    }
  }

  const conversationId = randomUUID();
  const conversation = createConversationRecord({
    conversationId,
    customerId,
  });
  conversationStore.set(conversationId, conversation);
  customerConversationIndex.set(customerId, conversationId);
  return conversation;
};

const getOrCreateConversation = (principal, payload = {}) => {
  const providedConversationId = buildConversationKey(payload.conversationId);
  if (providedConversationId && conversationStore.has(providedConversationId)) {
    return conversationStore.get(providedConversationId);
  }

  if (principal.role === "customer") {
    return ensureConversationForCustomer(principal.userId);
  }

  if (!providedConversationId) {
    const conversationId = randomUUID();
    const conversation = createConversationRecord({
      conversationId,
      customerId: String(payload.customerId || principal.userId || ""),
      initialStatus: "open",
    });
    conversation.assignedAgentId = principal.userId;
    conversation.assignedAgentName = principal.displayName;
    conversation.status = "open";
    conversationStore.set(conversationId, conversation);
    return conversation;
  }

  const conversation = createConversationRecord({
    conversationId: providedConversationId,
    customerId: String(payload.customerId || principal.userId || ""),
  });
  conversationStore.set(providedConversationId, conversation);
  return conversation;
};

const emitQueueUpdate = (io) => {
  const conversations = [...conversationStore.values()]
    .sort((left, right) => new Date(right.lastMessageAt) - new Date(left.lastMessageAt))
    .map((conversation) => ({
      id: conversation.id,
      customerId: conversation.customerId,
      status: conversation.status,
      lastMessagePreview: conversation.lastMessagePreview,
      lastMessageAt: conversation.lastMessageAt,
      assignedAgentId: conversation.assignedAgentId,
      unreadForAgentCount: conversation.unreadForAgentCount,
    }));

  io.to(ROOM_PREFIX.queue).emit("queue:update", {
    conversations,
    total: conversations.length,
  });
};

const emitConversationSnapshot = (socket, conversation) => {
  const limit = getSnapshotLimit();
  const snapshot = {
    conversation: serializeConversation(conversation),
    messages: conversation.messages.slice(-limit).map(serializeMessage),
    typingUsers: [...conversation.typingUsers.values()],
  };

      socket.emit("conversation:snapshot", snapshot);
};

const appendMessage = (conversation, message) => {
  conversation.messages.push(message);
  conversation.lastMessagePreview = message.body.slice(0, 120);
  conversation.lastMessageAt = message.createdAt;
  conversation.updatedAt = message.createdAt;
};

const updateUnreadCounters = (conversation, senderRole) => {
  if (senderRole === "customer") {
    conversation.unreadForAgentCount += 1;
  } else if (senderRole === "agent") {
    conversation.unreadForCustomerCount += 1;
  }
};

const findDuplicateMessage = (conversation, senderId, clientMessageId) => {
  if (!clientMessageId) return null;
  const ledgerKey = `${conversation.id}:${senderId}:${clientMessageId}`;
  return clientMessageLedger.get(ledgerKey) || null;
};

const registerMessageLedger = (conversation, senderId, clientMessageId, message) => {
  if (!clientMessageId) return;
  const ledgerKey = `${conversation.id}:${senderId}:${clientMessageId}`;
  clientMessageLedger.set(ledgerKey, message);
};

export const registerSupportSocket = (io, socket, principal) => {
  const { userId, role, displayName } = principal;
  const baseRoom = role === "customer" ? `${ROOM_PREFIX.user}:${userId}` : `${ROOM_PREFIX.agent}:${userId}`;
  socket.join(baseRoom);
  socket.emit("auth:ready", {
    ok: true,
    principal: {
      userId,
      role,
      displayName,
      clientType: principal.clientType,
      sessionId: principal.sessionId,
    },
  });

  socket.on("conversation:join", (payload = {}, ack) => {
    try {
      const conversation = getOrCreateConversation(principal, payload);
      const roomNames = buildRoomNames(principal, conversation.id);
      socket.join(roomNames.conversationRoom);
      emitConversationSnapshot(socket, conversation);
      if (typeof ack === "function") {
        ack({ ok: true, conversation: serializeConversation(conversation) });
      }
    } catch (error) {
      if (typeof ack === "function") {
        ack({ ok: false, error: error.message || "Unable to join conversation" });
      }
      socket.emit("error:event", {
        code: "conversation_join_failed",
        message: error.message || "Unable to join conversation",
      });
    }
  });

  socket.on("conversation:leave", (payload = {}, ack) => {
    const conversationId = buildConversationKey(payload.conversationId);
    if (conversationId) {
      socket.leave(`${ROOM_PREFIX.conversation}:${conversationId}`);
    }
    if (typeof ack === "function") {
      ack({ ok: true });
    }
  });

  socket.on("message:send", (payload = {}, ack) => {
    try {
      const conversationId = buildConversationKey(payload.conversationId);
      if (!conversationId) {
        throw new Error("conversationId is required");
      }

      const conversation = conversationStore.get(conversationId) || getOrCreateConversation(principal, payload);
      if (!conversationStore.has(conversation.id)) {
        conversationStore.set(conversation.id, conversation);
      }

      const body = String(payload.body ?? payload.text ?? "").trim();
      if (!body) {
        throw new Error("Message body is required");
      }

      const duplicate = findDuplicateMessage(conversation, userId, payload.clientMessageId);
      if (duplicate) {
        if (typeof ack === "function") {
          ack({ ok: true, duplicate: true, message: serializeMessage(duplicate) });
        }
        return;
      }

      const createdAt = nowIso();
      const message = {
        id: randomUUID(),
        conversationId: conversation.id,
        senderId: userId,
        senderRole: role,
        senderDisplayName: displayName || (role === "customer" ? "Customer" : "Support"),
        messageType: String(payload.messageType || "text"),
        body,
        clientMessageId: String(payload.clientMessageId || ""),
        readAt: null,
        createdAt,
      };

      appendMessage(conversation, message);
      updateUnreadCounters(conversation, role);

      if (role === "agent" && !conversation.assignedAgentId) {
        conversation.assignedAgentId = userId;
        conversation.assignedAgentName = displayName;
        conversation.status = "open";
      }

      registerMessageLedger(conversation, userId, message.clientMessageId, message);
      socket.to(`${ROOM_PREFIX.conversation}:${conversation.id}`).emit("message:new", serializeMessage(message));
      io.to(ROOM_PREFIX.queue).emit("queue:update", {
        conversation: serializeConversation(conversation),
      });

      if (typeof ack === "function") {
        ack({ ok: true, message: serializeMessage(message) });
      }
    } catch (error) {
      if (typeof ack === "function") {
        ack({ ok: false, error: error.message || "Unable to send message" });
      }
      socket.emit("error:event", {
        code: "message_send_failed",
        message: error.message || "Unable to send message",
      });
    }
  });

  socket.on("typing:start", (payload = {}) => {
    const conversationId = buildConversationKey(payload.conversationId);
    const conversation = conversationId ? conversationStore.get(conversationId) : null;
    if (!conversation) return;

    conversation.typingUsers.set(userId, {
      userId,
      displayName,
      role,
      startedAt: nowIso(),
    });

    socket.to(`${ROOM_PREFIX.conversation}:${conversation.id}`).emit("typing:update", {
      conversationId: conversation.id,
      typingUsers: [...conversation.typingUsers.values()],
    });
  });

  socket.on("typing:stop", (payload = {}) => {
    const conversationId = buildConversationKey(payload.conversationId);
    const conversation = conversationId ? conversationStore.get(conversationId) : null;
    if (!conversation) return;

    conversation.typingUsers.delete(userId);
    socket.to(`${ROOM_PREFIX.conversation}:${conversation.id}`).emit("typing:update", {
      conversationId: conversation.id,
      typingUsers: [...conversation.typingUsers.values()],
    });
  });

  socket.on("message:read", (payload = {}, ack) => {
    try {
      const conversationId = buildConversationKey(payload.conversationId);
      const conversation = conversationId ? conversationStore.get(conversationId) : null;
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const now = nowIso();
      conversation.unreadForCustomerCount = 0;
      conversation.unreadForAgentCount = 0;
      conversation.messages.forEach((message) => {
        if (!message.readAt) {
          message.readAt = now;
        }
      });
      conversation.updatedAt = now;

      socket.to(`${ROOM_PREFIX.conversation}:${conversation.id}`).emit("message:read", {
        conversationId: conversation.id,
        readAt: now,
        readerId: userId,
      });

      if (typeof ack === "function") {
        ack({ ok: true, conversationId: conversation.id, readAt: now });
      }
    } catch (error) {
      if (typeof ack === "function") {
        ack({ ok: false, error: error.message || "Unable to mark as read" });
      }
    }
  });

  socket.on("conversation:claim", (payload = {}, ack) => {
    try {
      if (role !== "agent") {
        throw new Error("Only agents can claim conversations");
      }

      const conversationId = buildConversationKey(payload.conversationId);
      const conversation = conversationId ? conversationStore.get(conversationId) : null;
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      conversation.assignedAgentId = userId;
      conversation.assignedAgentName = displayName;
      conversation.status = "open";
      conversation.updatedAt = nowIso();

      io.to(`${ROOM_PREFIX.conversation}:${conversation.id}`).emit("conversation:assigned", {
        conversationId: conversation.id,
        assignedAgentId: userId,
        assignedAgentName: displayName,
        status: conversation.status,
      });
      io.to(ROOM_PREFIX.queue).emit("queue:update", {
        conversation: serializeConversation(conversation),
      });

      if (typeof ack === "function") {
        ack({
          ok: true,
          conversation: serializeConversation(conversation),
        });
      }
    } catch (error) {
      if (typeof ack === "function") {
        ack({ ok: false, error: error.message || "Unable to claim conversation" });
      }
    }
  });

  socket.on("conversation:status:update", (payload = {}, ack) => {
    try {
      if (role !== "agent") {
        throw new Error("Only agents can update conversation status");
      }

      const conversationId = buildConversationKey(payload.conversationId);
      const conversation = conversationId ? conversationStore.get(conversationId) : null;
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const nextStatus = String(payload.status || "").trim();
      if (!["waitingStaff", "open", "pending", "resolved", "closed"].includes(nextStatus)) {
        throw new Error("Invalid conversation status");
      }

      conversation.status = nextStatus;
      if (nextStatus === "resolved" || nextStatus === "closed") {
        conversation.resolvedAt = nowIso();
      }
      conversation.updatedAt = nowIso();

      io.to(`${ROOM_PREFIX.conversation}:${conversation.id}`).emit("conversation:status", {
        conversationId: conversation.id,
        status: conversation.status,
        updatedAt: conversation.updatedAt,
      });
      io.to(ROOM_PREFIX.queue).emit("queue:update", {
        conversation: serializeConversation(conversation),
      });

      if (typeof ack === "function") {
        ack({
          ok: true,
          conversation: serializeConversation(conversation),
        });
      }
    } catch (error) {
      if (typeof ack === "function") {
        ack({ ok: false, error: error.message || "Unable to update status" });
      }
    }
  });

  socket.on("disconnect", () => {
    for (const conversation of conversationStore.values()) {
      conversation.typingUsers.delete(userId);
    }
  });

  emitQueueUpdate(io);
};

export const getRealtimeSnapshot = () => ({
  conversations: [...conversationStore.values()].map(serializeConversation),
  total: conversationStore.size,
});
