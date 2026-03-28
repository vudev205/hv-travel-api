import mongoose from "mongoose";

const { Schema } = mongoose;

export const RefreshSessionSchema = new Schema(
  {
    tokenId: { type: String, required: true },
    deviceId: { type: String, default: "" },
    refreshTokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    replacedByTokenId: { type: String, default: null },
    deviceLabel: { type: String, default: "" },
  },
  { _id: false }
);
