import test from "node:test";
import assert from "node:assert/strict";

import authRouter from "../routes/auth.routes.js";
import { sanitizeAuthResponse } from "../controllers/auth.controller.js";
import { generateToken, verifyToken } from "../utils/auth.js";

async function loadAuthSessionModule() {
  try {
    return await import("../utils/authSession.js");
  } catch {
    return {};
  }
}

function findRoute(pathname, method) {
  return authRouter.stack.find(
    (layer) =>
      layer.route?.path === pathname &&
      layer.route.methods?.[method.toLowerCase()] === true
  );
}

test("generateToken includes sessionId and short-lived expiry", () => {
  const token = generateToken(
    { _id: "customer-1", tokenVersion: 2 },
    "customer",
    "session-123"
  );
  const decoded = verifyToken(token);

  assert.equal(decoded?.sessionId, "session-123");
  assert.ok(decoded?.exp - decoded?.iat <= 60 * 60);
});

test("refresh session helpers rotate opaque refresh tokens and reject reuse", async () => {
  const authSession = await loadAuthSessionModule();

  assert.equal(typeof authSession.issueSessionTokens, "function");
  assert.equal(typeof authSession.rotateRefreshSession, "function");

  const customer = { _id: "customer-1", tokenVersion: 0, refreshSessions: [] };
  const issued = authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:00:00.000Z"),
    deviceId: "device-1",
  });

  assert.equal(typeof issued.refreshToken, "string");
  assert.notEqual(issued.refreshToken, issued.session.refreshTokenHash);
  assert.equal(verifyToken(issued.accessToken)?.sessionId, issued.session.tokenId);

  const rotated = authSession.rotateRefreshSession(customer, issued.refreshToken, {
    now: new Date("2026-03-28T00:05:00.000Z"),
  });

  assert.equal(rotated.session.deviceId, "device-1");
  assert.equal(rotated.session.tokenId, issued.session.tokenId);
  assert.equal(rotated.previousSession.tokenId, issued.session.tokenId);
  assert.equal(customer.refreshSessions.length, 1);
  assert.equal(customer.refreshSessions[0].tokenId, issued.session.tokenId);
  assert.ok(rotated.session.lastUsedAt instanceof Date);
  assert.throws(
    () => authSession.rotateRefreshSession(customer, issued.refreshToken),
    /invalid|revoked|expired/i
  );
});

test("issueSessionTokens reuses the same refresh session record for repeated logins on one device", async () => {
  const authSession = await loadAuthSessionModule();

  const customer = { _id: "customer-1", tokenVersion: 0, refreshSessions: [] };
  const firstIssued = authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:00:00.000Z"),
    deviceId: "device-1",
  });
  const secondIssued = authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:03:00.000Z"),
    deviceId: "device-1",
  });

  assert.equal(customer.refreshSessions.length, 1);
  assert.equal(secondIssued.session.tokenId, firstIssued.session.tokenId);
  assert.notEqual(secondIssued.refreshToken, firstIssued.refreshToken);
  assert.equal(
    customer.refreshSessions[0].refreshTokenHash,
    authSession.hashRefreshToken(secondIssued.refreshToken)
  );
  assert.throws(
    () => authSession.rotateRefreshSession(customer, firstIssued.refreshToken),
    /invalid|revoked|expired/i
  );
});

test("revokeAllCustomerSessions bumps tokenVersion and revokes every session", async () => {
  const authSession = await loadAuthSessionModule();

  assert.equal(typeof authSession.issueSessionTokens, "function");
  assert.equal(typeof authSession.revokeAllCustomerSessions, "function");

  const customer = { _id: "customer-1", tokenVersion: 3, refreshSessions: [] };
  authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:00:00.000Z"),
    deviceId: "device-1",
  });
  authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:01:00.000Z"),
    deviceId: "device-2",
  });

  const updated = authSession.revokeAllCustomerSessions(customer, {
    now: new Date("2026-03-28T00:10:00.000Z"),
  });

  assert.equal(updated.tokenVersion, 4);
  assert.equal(updated.refreshSessions.length, 2);
  assert.ok(updated.refreshSessions.every((session) => session.revokedAt instanceof Date));
});

test("revokeActiveSessionsForDevice revokes only the active session for the matching device", async () => {
  const authSession = await loadAuthSessionModule();

  assert.equal(typeof authSession.revokeActiveSessionsForDevice, "function");

  const customer = { _id: "customer-1", tokenVersion: 0, refreshSessions: [] };
  authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:00:00.000Z"),
    deviceId: "device-1",
  });
  authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:01:00.000Z"),
    deviceId: "device-2",
  });

  const revoked = authSession.revokeActiveSessionsForDevice(customer, "device-1", {
    now: new Date("2026-03-28T00:02:00.000Z"),
  });

  assert.equal(revoked.length, 1);
  assert.equal(revoked[0].deviceId, "device-1");
  assert.ok(revoked[0].revokedAt instanceof Date);
  assert.equal(
    customer.refreshSessions.filter((session) => !session.revokedAt).length,
    1
  );
  assert.equal(
    customer.refreshSessions.find((session) => !session.revokedAt)?.deviceId,
    "device-2"
  );
});

test("auth routes add refresh endpoint and protect change-password with customerAuth", () => {
  const refreshRoute = findRoute("/refresh", "post");
  const changePasswordRoute = findRoute("/change-password", "post");
  const sessionsRoute = findRoute("/sessions", "get");
  const deleteSessionRoute = findRoute("/sessions/:sessionId", "delete");
  const logoutAllRoute = findRoute("/logout-all", "post");

  assert.ok(refreshRoute);
  assert.ok(changePasswordRoute);
  assert.ok(sessionsRoute);
  assert.ok(deleteSessionRoute);
  assert.ok(logoutAllRoute);
  assert.ok(
    changePasswordRoute.route.stack.some((layer) => layer.name === "customerAuth")
  );
  assert.ok(sessionsRoute.route.stack.some((layer) => layer.name === "customerAuth"));
  assert.ok(
    deleteSessionRoute.route.stack.some((layer) => layer.name === "customerAuth")
  );
  assert.ok(logoutAllRoute.route.stack.some((layer) => layer.name === "customerAuth"));
});

test("sanitizeAuthResponse returns only accessToken, refreshToken, and basic customer info", () => {
  const payload = sanitizeAuthResponse(
    {
      _id: "customer-1",
      fullName: "Nguyen Van A",
      email: "traveler@example.com",
      phoneNumber: "0900000000",
      avatarUrl: null,
      customerCode: "CUS000001",
      tokenVersion: 7,
      refreshSessions: [{ tokenId: "session-1" }],
      stats: { loyaltyPoints: 10 },
      createdAt: new Date("2026-03-28T00:00:00.000Z"),
    },
    {
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      expiresIn: 900,
      refreshExpiresIn: 2592000,
      session: { tokenId: "session-1", deviceId: "device-1" },
    }
  );

  assert.deepEqual(payload, {
    accessToken: "access-token-1",
    refreshToken: "refresh-token-1",
    customer: {
      id: "customer-1",
      fullName: "Nguyen Van A",
      email: "traveler@example.com",
      phoneNumber: "0900000000",
      avatarUrl: null,
      customerCode: "CUS000001",
    },
  });
});

test("listCustomerSessions returns only active device sessions with sanitized fields", async () => {
  const authSession = await loadAuthSessionModule();

  assert.equal(typeof authSession.listCustomerSessions, "function");

  const customer = { _id: "customer-1", tokenVersion: 0, refreshSessions: [] };
  const firstIssued = authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:00:00.000Z"),
    deviceId: "device-1",
    deviceLabel: "iPhone 15",
  });
  const secondIssued = authSession.issueSessionTokens(customer, {
    now: new Date("2026-03-28T00:01:00.000Z"),
    deviceId: "device-2",
    deviceLabel: "iPad",
  });

  authSession.revokeSessionById(customer, firstIssued.session.tokenId, {
    now: new Date("2026-03-28T00:02:00.000Z"),
  });

  const sessions = authSession.listCustomerSessions(customer, secondIssued.session.tokenId);

  assert.deepEqual(sessions, [
    {
      sessionId: secondIssued.session.tokenId,
      deviceId: "device-2",
      deviceLabel: "iPad",
      createdAt: new Date("2026-03-28T00:01:00.000Z"),
      lastUsedAt: new Date("2026-03-28T00:01:00.000Z"),
      isCurrent: true,
    },
  ]);
});
