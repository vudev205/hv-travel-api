// chatMemory.js

const CHAT_TTL = 5 * 60 * 1000; // 5 phút
const CLEAN_INTERVAL = 60 * 1000; // quét mỗi 1 phút

/**
 * memory structure:
 * {
 *   conversationId: {
 *     messages: [{ role, content }],
 *     lastActive: number (Date.now())
 *   }
 * }
 */
const chatStore = new Map();

/**
 * Lấy history theo conversationId
 */
export function getHistory(conversationId) {
  const session = chatStore.get(conversationId);
  if (!session) return [];
  return session.messages;
}

/**
 * Append message + update lastActive
 */
export function appendHistory(conversationId, role, content) {
  let session = chatStore.get(conversationId);

  if (!session) {
    session = {
      messages: [],
      lastActive: Date.now(),
    };
    chatStore.set(conversationId, session);
  }

  session.messages.push({ role, content });
  session.lastActive = Date.now();
}

/**
 * Clear conversation thủ công (nếu cần)
 */
export function clearConversation(conversationId) {
  chatStore.delete(conversationId);
}

/**
 * Auto cleanup TTL
 */
setInterval(() => {
  const now = Date.now();

  for (const [conversationId, session] of chatStore.entries()) {
    if (now - session.lastActive > CHAT_TTL) {
      chatStore.delete(conversationId);
      console.log(`Xoá thành công dữ liệu đoạn chat không sử dụng (sau 5p): ${conversationId}`);
    }
  }
}, CLEAN_INTERVAL);
