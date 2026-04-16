import test from "node:test";
import assert from "node:assert/strict";

import chatRouter from "../routes/chat.routes.js";

async function loadSupportChatModule() {
  return import("../utils/supportChat.js");
}

function findRoute(pathname, method) {
  return chatRouter.stack.find(
    (layer) =>
      layer.route?.path === pathname &&
      layer.route.methods?.[method.toLowerCase()] === true
  );
}

test("support chat helpers normalize status and pick the active conversation", async () => {
  const supportChat = await loadSupportChatModule();

  const conversations = [
    {
      id: "closed-1",
      customerId: "customer-1",
      status: "closed",
      updatedAt: "2026-03-28T10:00:00.000Z",
      lastMessageAt: "2026-03-28T10:00:00.000Z",
    },
    {
      id: "open-1",
      customerId: "customer-1",
      status: "open",
      updatedAt: "2026-03-28T12:00:00.000Z",
      lastMessageAt: "2026-03-28T12:00:00.000Z",
    },
  ];

  assert.equal(supportChat.normalizeSupportStatus("waitingstaff"), "waitingStaff");
  assert.equal(supportChat.isActiveSupportStatus("pending"), true);
  assert.equal(supportChat.isActiveSupportStatus("resolved"), false);
  assert.equal(supportChat.pickActiveSupportConversation(conversations, "customer-1")?.id, "open-1");
});

test("support chat helpers dedupe messages by clientMessageId", async () => {
  const supportChat = await loadSupportChatModule();

  const state = {
    messages: [
      {
        id: "message-1",
        conversationId: "conversation-1",
        clientMessageId: "client-1",
        senderType: "customer",
        content: "Xin chao",
        sentAt: "2026-03-28T10:00:00.000Z",
      },
    ],
  };

  const result = supportChat.upsertSupportMessage(state, {
    conversationId: "conversation-1",
    clientMessageId: "client-1",
    senderType: "customer",
    content: "Xin chao",
    sentAt: "2026-03-28T10:00:00.000Z",
  });

  assert.equal(result.isDuplicate, true);
  assert.equal(state.messages.length, 1);
  assert.equal(result.message.id, "message-1");
});

test("chat routes expose support bootstrap, send, reopen, and admin queue endpoints", () => {
  assert.ok(findRoute("/conversations/bootstrap", "post"));
  assert.ok(findRoute("/conversations/:conversationId", "get"));
  assert.ok(findRoute("/conversations/:conversationId/messages", "post"));
  assert.ok(findRoute("/conversations/:conversationId/reopen", "post"));
  assert.ok(findRoute("/admin/queue", "get"));
  assert.ok(findRoute("/admin/conversations/:conversationId/claim", "post"));
  assert.ok(findRoute("/admin/conversations/:conversationId/status", "patch"));
});
