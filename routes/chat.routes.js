import express from "express";
import {
  bootstrapConversation,
  claimConversation,
  getAdminConversationDetail,
  getConversationDetail,
  listConversations,
  listAdminQueue,
  listMessages,
  markConversationRead,
  reopenConversation,
  sendMessage,
  updateConversationStatus,
} from "../controllers/chat.controller.js";
import { auth, customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/conversations/bootstrap", customerAuth, bootstrapConversation);
router.post("/conversations", customerAuth, bootstrapConversation);
router.get("/conversations", customerAuth, listConversations);
router.get("/conversations/:conversationId", customerAuth, getConversationDetail);
router.get("/conversations/:conversationId/messages", customerAuth, listMessages);
router.post("/conversations/:conversationId/messages", customerAuth, sendMessage);
router.post("/conversations/:conversationId/reopen", customerAuth, reopenConversation);
router.put("/conversations/:conversationId/read", customerAuth, markConversationRead);

router.get("/admin/queue", auth, listAdminQueue);
router.get("/admin/conversations/:conversationId", auth, getAdminConversationDetail);
router.post("/admin/conversations/:conversationId/claim", auth, claimConversation);
router.patch("/admin/conversations/:conversationId/status", auth, updateConversationStatus);

export default router;
