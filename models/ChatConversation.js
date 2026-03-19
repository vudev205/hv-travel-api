import mongoose from "mongoose";

const { Schema } = mongoose;

const guestProfileSchema = new Schema(
  {
    displayName: { type: String, default: "" },
    email: { type: String, default: "" },
    phoneNumber: { type: String, default: "" },
  },
  { _id: false }
);

const chatConversationSchema = new Schema(
  {
    conversationCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    channel: {
      type: String,
      default: "web",
      trim: true,
    },
    status: {
      type: String,
      default: "waitingStaff",
      trim: true,
    },
    participantType: {
      type: String,
      default: "customer",
      trim: true,
    },
    customerId: {
      type: Schema.Types.Mixed,
      default: null,
      index: true,
    },
    visitorSessionId: {
      type: String,
      default: "",
      trim: true,
    },
    guestProfile: {
      type: guestProfileSchema,
      default: () => ({}),
    },
    assignedStaffUserId: {
      type: String,
      default: "",
      trim: true,
    },
    sourcePage: {
      type: String,
      default: "",
      trim: true,
    },
    lastMessagePreview: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    unreadForAdminCount: {
      type: Number,
      default: 0,
    },
    unreadForCustomerCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "chatConversations",
  }
);

chatConversationSchema.index({ customerId: 1, lastMessageAt: -1 });

const ChatConversation =
  mongoose.models.ChatConversation ||
  mongoose.model("ChatConversation", chatConversationSchema);

export default ChatConversation;
