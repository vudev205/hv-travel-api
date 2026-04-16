import mongoose from "mongoose";

const { Schema } = mongoose;

const chatMessageSchema = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    senderType: {
      type: String,
      default: "system",
      trim: true,
    },
    senderUserId: {
      type: String,
      default: "",
      trim: true,
    },
    senderDisplayName: {
      type: String,
      default: "",
      trim: true,
    },
    clientMessageId: {
      type: String,
      default: undefined,
      trim: true,
    },
    messageType: {
      type: String,
      default: "text",
      trim: true,
    },
    content: {
      type: String,
      default: "",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "chatMessages",
  }
);

chatMessageSchema.index({ conversationId: 1, sentAt: 1 });
chatMessageSchema.index(
  { conversationId: 1, clientMessageId: 1 },
  { unique: true, sparse: true }
);

const ChatMessage =
  mongoose.models.ChatMessage || mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;
