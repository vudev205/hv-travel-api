import express from "express";
import {
  listConversations,
  listMessages,
  markConversationRead,
} from "../controllers/chat.controller.js";
import { customerAuth } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/conversations", customerAuth, listConversations);
router.get("/conversations/:conversationId/messages", customerAuth, listMessages);
router.put("/conversations/:conversationId/read", customerAuth, markConversationRead);

export default router;
