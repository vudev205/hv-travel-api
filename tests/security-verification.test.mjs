import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

import {
  createIpBlocklist,
  createRateLimiter,
  getClientIp,
  mongoSanitize,
  securityHeaders,
} from "../middlewares/securityMiddleware.js";
import {
  generateToken,
  getJwtSecret,
  validateRegister,
  verifyToken,
} from "../utils/auth.js";
import {
  SocketAuthError,
  authenticateSocketPayload,
  normalizeRole,
} from "../support-realtime/src/socket/auth.js";
import { registerSupportSocket } from "../support-realtime/src/socket/events.js";
import {
  consumeVerifiedResetToken,
  createAndSendOTP,
  hashOtpValue,
  verifyOTP,
} from "../utils/otpHelper.js";

function createMockRes() {
  const headers = new Map();
  let statusCode = 200;
  let body = null;
  let removedHeaders = new Set();

  return {
    headers,
    removedHeaders,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    removeHeader(name) {
      removedHeaders.add(name.toLowerCase());
      headers.delete(name.toLowerCase());
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
}

function createInMemoryOtpModel() {
  const docs = new Map();
  let seq = 1;

  function matchesFilter(doc, filter) {
    for (const [key, cond] of Object.entries(filter)) {
      const val = doc[key];
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        if ("$lt" in cond && !(val < cond.$lt)) return false;
        if ("$gt" in cond && !(val > cond.$gt)) return false;
      } else if (val !== cond) {
        return false;
      }
    }
    return true;
  }

  function wrapDoc(raw) {
    return {
      ...raw,
      async save() {
        docs.set(raw._id, {
          ...docs.get(raw._id),
          attempts: this.attempts,
          isUsed: this.isUsed,
          resetTokenHash: this.resetTokenHash,
          resetTokenExpiresAt: this.resetTokenExpiresAt,
          resetTokenUsedAt: this.resetTokenUsedAt,
          expiresAt: this.expiresAt,
        });
        return this;
      },
    };
  }

  return {
    docs,
    async deleteMany(filter) {
      for (const [id, doc] of docs.entries()) {
        if (matchesFilter(doc, filter)) {
          docs.delete(id);
        }
      }
    },
    async create(data) {
      const _id = `otp_${seq++}`;
      const record = { _id, ...data };
      docs.set(_id, record);
      return wrapDoc(record);
    },
    async findOne(filter) {
      for (const doc of docs.values()) {
        if (matchesFilter(doc, filter)) {
          return wrapDoc(doc);
        }
      }
      return null;
    },
    async findOneAndUpdate(filter, update) {
      for (const [id, doc] of docs.entries()) {
        if (matchesFilter(doc, filter)) {
          const updated = { ...doc, ...(update.$set || {}) };
          docs.set(id, updated);
          return wrapDoc(updated);
        }
      }
      return null;
    },
    async findOneAndDelete(filter) {
      for (const [id, doc] of docs.entries()) {
        if (matchesFilter(doc, filter)) {
          docs.delete(id);
          return doc;
        }
      }
      return null;
    },
  };
}

function createMockSocket(id) {
  const handlers = new Map();
  const emitted = [];
  const joinedRooms = new Set();
  const roomEmits = [];

  return {
    id,
    emitted,
    joinedRooms,
    roomEmits,
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
    join(room) {
      joinedRooms.add(room);
    },
    leave(room) {
      joinedRooms.delete(room);
    },
    to(room) {
      return {
        emit(event, payload) {
          roomEmits.push({ room, event, payload });
        },
      };
    },
    trigger(event, payload, ack) {
      const fn = handlers.get(event);
      assert.ok(fn, `Expected socket handler for ${event}`);
      return fn(payload, ack);
    },
  };
}

test("mongoSanitize strips $ne, $gt, $where, __proto__, constructor, and dotted keys", () => {
  const payloadWithProto = JSON.parse(
    '{"email":"user@example.com","password":{"$ne":""},"price":{"$gt":0},"$where":"1==1","__proto__":{"polluted":true},"nested":{"a.b":"bad","safe":"ok","arr":[{"$gt":10,"ok":1}]}}'
  );
  const req = {
    method: "POST",
    originalUrl: "/api/auth/login",
    ip: "10.0.0.10",
    headers: {},
    body: payloadWithProto,
    query: { "user.role": "admin", $ne: "x", page: "1" },
    params: { "id.extra": "1", id: "abc" },
  };
  const res = createMockRes();
  let nextCalled = false;

  mongoSanitize(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.body.email, "user@example.com");
  assert.equal("$ne" in req.body.password, false);
  assert.equal("$gt" in req.body.price, false);
  assert.equal("$where" in req.body, false);
  assert.equal(Object.prototype.hasOwnProperty.call(req.body, "__proto__"), false);
  assert.equal("a.b" in req.body.nested, false);
  assert.equal(req.body.nested.safe, "ok");
  assert.equal("$gt" in req.body.nested.arr[0], false);
  assert.equal(req.body.nested.arr[0].ok, 1);
  assert.equal("user.role" in req.query, false);
  assert.equal("$ne" in req.query, false);
  assert.equal(req.query.page, "1");
  assert.equal("id.extra" in req.params, false);
  assert.equal(req.params.id, "abc");
});

test("createRateLimiter blocks burst traffic with HTTP 429 and cannot be bypassed via X-Forwarded-For spoofing", () => {
  const blocklist = createIpBlocklist({ maxStrikes: 100 });
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 3,
    keyPrefix: "test-burst",
    blocklist,
  });

  const statuses = [];
  for (let i = 1; i <= 5; i++) {
    const req = {
      method: "POST",
      originalUrl: "/api/auth/login",
      ip: "203.0.113.42",
      socket: { remoteAddress: "203.0.113.42" },
      // Attacker rotates X-Forwarded-For on every single request trying to bypass rate limiting
      headers: { "x-forwarded-for": `198.51.100.${i}` },
    };
    assert.equal(getClientIp(req), "203.0.113.42");

    const res = createMockRes();
    let passed = false;
    limiter(req, res, () => {
      passed = true;
    });
    statuses.push({ passed, statusCode: res.statusCode, body: res.body });
  }

  assert.equal(statuses[0].passed, true);
  assert.equal(statuses[1].passed, true);
  assert.equal(statuses[2].passed, true);
  assert.equal(statuses[3].passed, false);
  assert.equal(statuses[3].statusCode, 429);
  assert.equal(statuses[4].passed, false);
  assert.equal(statuses[4].statusCode, 429);
});

test("securityHeaders emits Content-Security-Policy, X-Content-Type-Options, and X-Frame-Options", () => {
  const req = { secure: true, headers: {} };
  const res = createMockRes();
  let nextCalled = false;

  securityHeaders(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.getHeader("content-security-policy"), "default-src 'none'; frame-ancestors 'none'");
  assert.equal(res.getHeader("x-content-type-options"), "nosniff");
  assert.equal(res.getHeader("x-frame-options"), "DENY");
  assert.equal(res.removedHeaders.has("x-powered-by"), true);
});

test("ipBlocklist auto-blocks repeat offender IP and returns HTTP 403 via middleware", () => {
  const blocklist = createIpBlocklist({ maxStrikes: 3, blockDurationMs: 15 * 60 * 1000 });
  const ip = "198.51.100.77";

  assert.equal(blocklist.isBlocked(ip), false);
  blocklist.recordStrike(ip, "nosql-injection");
  blocklist.recordStrike(ip, "nosql-injection");
  assert.equal(blocklist.isBlocked(ip), false);
  const strike3 = blocklist.recordStrike(ip, "rate-limit");
  assert.equal(strike3.blocked, true);
  assert.equal(blocklist.isBlocked(ip), true);

  const req = { ip, socket: { remoteAddress: ip }, headers: {} };
  const res = createMockRes();
  let nextCalled = false;
  blocklist.middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.ok(Number(res.getHeader("retry-after")) > 0);
});

test("utils/auth.js does not use hardcoded HV-Travel-Vip-Pro secret and enforces >= 8 char passwords", () => {
  const activeSecret = getJwtSecret();
  assert.notEqual(activeSecret, "HV-Travel-Vip-Pro");
  assert.ok(activeSecret.length >= 16);

  const forgedWithHardcoded = jwt.sign(
    { id: "attacker-1", tokenVersion: 0, role: "admin" },
    "HV-Travel-Vip-Pro",
    { expiresIn: "15m" }
  );
  assert.equal(verifyToken(forgedWithHardcoded), null);

  const legitimate = generateToken({ _id: "cust-1", tokenVersion: 1 }, "customer", "sess-1");
  assert.throws(() => jwt.verify(legitimate, "HV-Travel-Vip-Pro"));
  const verified = verifyToken(legitimate);
  assert.equal(verified?.id, "cust-1");

  const shortPwd = validateRegister({
    fullName: "Nguyen Van A",
    email: "a@example.com",
    password: "1234567",
    rePassword: "1234567",
  });
  assert.equal(shortPwd.isValid, false);
  assert.ok(shortPwd.errors.password);

  const validPwd = validateRegister({
    fullName: "Nguyen Van A",
    email: "a@example.com",
    password: "Password123",
    rePassword: "Password123",
  });
  assert.equal(validPwd.isValid, true);
});

test("support-realtime normalizeRole strictly allowlists staff/admin/manager as agent and rejects unknown roles", () => {
  assert.equal(normalizeRole("customer"), "customer");
  assert.equal(normalizeRole("Customer"), "customer");
  assert.equal(normalizeRole("admin"), "agent");
  assert.equal(normalizeRole("manager"), "agent");
  assert.equal(normalizeRole("staff"), "agent");
  assert.equal(normalizeRole("STAFF"), "agent");

  for (const invalidRole of ["", "user", "guest", "superadmin", "agent", "root", null, undefined]) {
    assert.throws(
      () => normalizeRole(invalidRole),
      (err) => err instanceof SocketAuthError && err.code === "invalid_role" && err.statusCode === 403
    );
  }

  // Verify authenticateSocketPayload rejects tokens signed with old hardcoded secret
  const forged = jwt.sign({ id: "u1", role: "admin" }, "HV-Travel-Vip-Pro");
  assert.throws(
    () => authenticateSocketPayload({ auth: { token: forged } }),
    (err) => err instanceof SocketAuthError && err.code === "token_invalid"
  );

  // Verify authenticateSocketPayload rejects valid-signature token with unknown role
  const secret = "unit-test-secret-strong-value-123456";
  const unknownRoleToken = jwt.sign({ id: "u2", role: "user" }, secret);
  assert.throws(
    () => authenticateSocketPayload({ auth: { token: unknownRoleToken } }, { jwtSecret: secret }),
    (err) => err instanceof SocketAuthError && err.code === "invalid_role"
  );
});

test("support-realtime socket events enforce customer ownership on join, send, typing, and read", () => {
  const io = {
    to() {
      return { emit() {} };
    },
  };

  const victimSocket = createMockSocket("sock-victim");
  registerSupportSocket(io, victimSocket, {
    userId: "customer-victim",
    role: "customer",
    displayName: "Victim",
    clientType: "customer",
    sessionId: "s-victim",
  });

  let victimConversationId = null;
  victimSocket.trigger("conversation:join", {}, (ack) => {
    assert.equal(ack.ok, true);
    victimConversationId = ack.conversation.id;
  });
  assert.ok(victimConversationId);

  const attackerSocket = createMockSocket("sock-attacker");
  registerSupportSocket(io, attackerSocket, {
    userId: "customer-attacker",
    role: "customer",
    displayName: "Attacker",
    clientType: "customer",
    sessionId: "s-attacker",
  });

  // 1. conversation:join IDOR blocked
  let joinAck = null;
  attackerSocket.trigger("conversation:join", { conversationId: victimConversationId }, (ack) => {
    joinAck = ack;
  });
  assert.equal(joinAck.ok, false);
  assert.equal(joinAck.code, "forbidden");
  assert.equal(attackerSocket.joinedRooms.has(`conversation:${victimConversationId}`), false);

  // 2. message:send IDOR blocked
  let sendAck = null;
  attackerSocket.trigger(
    "message:send",
    { conversationId: victimConversationId, body: "hijack" },
    (ack) => {
      sendAck = ack;
    }
  );
  assert.equal(sendAck.ok, false);
  assert.equal(sendAck.code, "forbidden");

  // 3. typing:start IDOR blocked
  let typingStartAck = null;
  attackerSocket.trigger("typing:start", { conversationId: victimConversationId }, (ack) => {
    typingStartAck = ack;
  });
  assert.equal(typingStartAck.ok, false);
  assert.equal(typingStartAck.code, "forbidden");

  // 4. typing:stop IDOR blocked
  let typingStopAck = null;
  attackerSocket.trigger("typing:stop", { conversationId: victimConversationId }, (ack) => {
    typingStopAck = ack;
  });
  assert.equal(typingStopAck.ok, false);
  assert.equal(typingStopAck.code, "forbidden");

  // 5. message:read IDOR blocked
  let readAck = null;
  attackerSocket.trigger("message:read", { conversationId: victimConversationId }, (ack) => {
    readAck = ack;
  });
  assert.equal(readAck.ok, false);
  assert.equal(readAck.code, "forbidden");
});

test("otpHelper stores SHA-256 hash of 6-digit OTP, enforces max 5 attempts, and blocks resetToken replay", async () => {
  const model = createInMemoryOtpModel();
  let sentOtp = null;

  const otpId = await createAndSendOTP("traveler@example.com", "forgot_password", {
    model,
    sendEmail: async (_email, otp) => {
      sentOtp = otp;
    },
  });

  // Sent OTP must be 6 digits
  assert.match(sentOtp, /^\d{6}$/);

  // Stored OTP must be SHA-256 hash, NOT plaintext
  const storedRecords = [...model.docs.values()];
  assert.equal(storedRecords.length, 1);
  assert.notEqual(storedRecords[0].otp, sentOtp);
  assert.equal(storedRecords[0].otp, hashOtpValue(sentOtp));
  assert.match(storedRecords[0].otp, /^[a-f0-9]{64}$/);

  // Wrong OTP attempt increments attempts counter
  const wrongAttempt = await verifyOTP(otpId, "000000" === sentOtp ? "111111" : "000000", "forgot_password", {
    model,
  });
  assert.equal(wrongAttempt.success, false);

  // Correct OTP succeeds and returns a single-use CSPRNG resetToken
  const verified = await verifyOTP(otpId, sentOtp, "forgot_password", { model });
  assert.equal(verified.success, true);
  assert.match(verified.resetToken, /^[a-f0-9]{64}$/);

  // Re-verifying the same OTP must fail
  const replayOtp = await verifyOTP(otpId, sentOtp, "forgot_password", { model });
  assert.equal(replayOtp.success, false);

  // First resetToken consumption succeeds and returns email
  const emailFirst = await consumeVerifiedResetToken(verified.resetToken, "forgot_password", { model });
  assert.equal(emailFirst, "traveler@example.com");

  // Replaying the same resetToken MUST fail (single-use atomic deletion)
  const emailReplay = await consumeVerifiedResetToken(verified.resetToken, "forgot_password", { model });
  assert.equal(emailReplay, null);

  // Max 5 failed attempts locks out OTP
  let lockedOtp = null;
  const otpId2 = await createAndSendOTP("brute@example.com", "forgot_password", {
    model,
    sendEmail: async (_email, otp) => {
      lockedOtp = otp;
    },
  });
  const wrongCode = lockedOtp === "999999" ? "888888" : "999999";
  for (let i = 0; i < 5; i++) {
    const attempt = await verifyOTP(otpId2, wrongCode, "forgot_password", { model });
    assert.equal(attempt.success, false);
  }
  const afterMaxAttempts = await verifyOTP(otpId2, lockedOtp, "forgot_password", { model });
  assert.equal(afterMaxAttempts.success, false);
});
