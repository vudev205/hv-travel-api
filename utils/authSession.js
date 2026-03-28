import crypto from "node:crypto";

import { generateToken } from "./auth.js";

const REFRESH_TOKEN_TTL_DAYS = 30;

function cloneDate(value) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function addDays(value, days) {
  const date = cloneDate(value);
  date.setDate(date.getDate() + days);
  return date;
}

function ensureRefreshSessions(customer) {
  if (!Array.isArray(customer.refreshSessions)) {
    customer.refreshSessions = [];
  }
  return customer.refreshSessions;
}

function findReusableSessionForDevice(customer, deviceId) {
  const refreshSessions = ensureRefreshSessions(customer);

  return (
    refreshSessions.find((session) => session.deviceId === deviceId && !session.revokedAt) ||
    refreshSessions.find((session) => session.deviceId === deviceId) ||
    null
  );
}

export function hashRefreshToken(refreshToken) {
  return crypto.createHash("sha256").update(String(refreshToken)).digest("hex");
}

export function createOpaqueRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

export function issueSessionTokens(customer, options = {}) {
  const now = cloneDate(options.now || new Date());
  const refreshSessions = ensureRefreshSessions(customer);
  const deviceId = String(options.deviceId || "").trim();

  if (!deviceId) {
    throw new Error("Device ID is required");
  }

  const session =
    findReusableSessionForDevice(customer, deviceId) || {
      tokenId: crypto.randomUUID(),
      deviceId,
      refreshTokenHash: "",
      createdAt: now,
      lastUsedAt: now,
      expiresAt: addDays(now, REFRESH_TOKEN_TTL_DAYS),
      revokedAt: null,
      replacedByTokenId: null,
      deviceLabel: options.deviceLabel || "",
    };
  const refreshToken = createOpaqueRefreshToken();
  session.deviceId = deviceId;
  session.createdAt = session.createdAt ? cloneDate(session.createdAt) : now;
  session.lastUsedAt = now;
  session.expiresAt = addDays(now, REFRESH_TOKEN_TTL_DAYS);
  session.revokedAt = null;
  session.replacedByTokenId = null;
  session.deviceLabel = options.deviceLabel || session.deviceLabel || "";
  session.refreshTokenHash = hashRefreshToken(refreshToken);
  if (!refreshSessions.includes(session)) {
    refreshSessions.push(session);
  }

  return {
    accessToken: generateToken(customer, options.role || "customer", session.tokenId),
    refreshToken,
    session,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    refreshExpiresIn: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  };
}

function getActiveSession(customer, refreshToken, now = new Date()) {
  const refreshSessions = ensureRefreshSessions(customer);
  const hashedRefreshToken = hashRefreshToken(refreshToken);

  const session = refreshSessions.find(
    (item) => item.refreshTokenHash === hashedRefreshToken
  );

  if (!session) {
    throw new Error("Invalid refresh token");
  }

  if (session.revokedAt) {
    throw new Error("Refresh token has been revoked");
  }

  if (cloneDate(session.expiresAt) <= cloneDate(now)) {
    throw new Error("Refresh token has expired");
  }

  return session;
}

export function revokeActiveSessionsForDevice(customer, deviceId, options = {}) {
  const normalizedDeviceId = String(deviceId || "").trim();
  if (!normalizedDeviceId) return [];

  const now = cloneDate(options.now || new Date());
  const revokedSessions = [];

  ensureRefreshSessions(customer).forEach((session) => {
    if (session.deviceId === normalizedDeviceId && !session.revokedAt) {
      session.revokedAt = now;
      revokedSessions.push(session);
    }
  });

  return revokedSessions;
}

export function rotateRefreshSession(customer, refreshToken, options = {}) {
  const now = cloneDate(options.now || new Date());
  const previousSession = getActiveSession(customer, refreshToken, now);
  const resolvedDeviceId =
    previousSession.deviceId || options.deviceId || `legacy-${previousSession.tokenId}`;

  const previousSnapshot = {
    tokenId: previousSession.tokenId,
    deviceId: previousSession.deviceId || resolvedDeviceId,
    deviceLabel: previousSession.deviceLabel || "",
    createdAt: cloneDate(previousSession.createdAt),
    lastUsedAt: cloneDate(previousSession.lastUsedAt),
    expiresAt: cloneDate(previousSession.expiresAt),
    refreshTokenHash: previousSession.refreshTokenHash,
  };

  const issued = issueSessionTokens(customer, {
    ...options,
    now,
    deviceId: resolvedDeviceId,
    deviceLabel: previousSession.deviceLabel || options.deviceLabel,
  });

  return {
    ...issued,
    previousSession: previousSnapshot,
  };
}

export function revokeSessionById(customer, sessionId, options = {}) {
  if (!sessionId) return null;

  const now = cloneDate(options.now || new Date());
  const session = ensureRefreshSessions(customer).find(
    (item) => item.tokenId === sessionId && !item.revokedAt
  );

  if (!session) return null;

  session.revokedAt = now;
  return session;
}

export function listCustomerSessions(customer, currentSessionId = null) {
  return ensureRefreshSessions(customer)
    .filter((session) => !session.revokedAt)
    .sort((left, right) => cloneDate(right.lastUsedAt) - cloneDate(left.lastUsedAt))
    .map((session) => ({
      sessionId: session.tokenId,
      deviceId: session.deviceId || "",
      deviceLabel: session.deviceLabel || "",
      createdAt: cloneDate(session.createdAt),
      lastUsedAt: cloneDate(session.lastUsedAt),
      isCurrent: Boolean(currentSessionId) && session.tokenId === currentSessionId,
    }));
}

export function revokeAllCustomerSessions(customer, options = {}) {
  const now = cloneDate(options.now || new Date());
  ensureRefreshSessions(customer).forEach((session) => {
    if (!session.revokedAt) {
      session.revokedAt = now;
    }
  });
  customer.tokenVersion = (customer.tokenVersion || 0) + 1;
  return customer;
}

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 15 * 60;
