/**
 * Security middlewares for HV-Travel API (zero extra npm dependencies):
 * - HTTP Security Headers (Helmet-equivalent + strict CSP)
 * - NoSQL Injection & Prototype Pollution Sanitizer
 * - In-memory IP Blocklist (auto-blocks repeat offenders for 15 minutes)
 * - In-memory per-IP Sliding Window Rate Limiter (Brute-force & DDoS burst protection)
 * - Safe Global Error Handler
 */

const DEFAULT_BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_STRIKE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_STRIKES = 5;

export function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function createIpBlocklist({
  maxStrikes = DEFAULT_MAX_STRIKES,
  strikeWindowMs = DEFAULT_STRIKE_WINDOW_MS,
  blockDurationMs = DEFAULT_BLOCK_DURATION_MS,
} = {}) {
  const entries = new Map();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of entries.entries()) {
      const strikeExpired = entry.strikeResetAt <= now;
      const blockExpired = !entry.blockedUntil || entry.blockedUntil <= now;
      if (strikeExpired && blockExpired) {
        entries.delete(ip);
      }
    }
  }, Math.min(blockDurationMs, 60_000));

  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }

  function recordStrike(ip, reason = "security_violation") {
    if (!ip || ip === "unknown") {
      return { blocked: false, strikes: 0, blockedUntil: 0 };
    }

    const now = Date.now();
    let entry = entries.get(ip);

    if (!entry || (entry.strikeResetAt <= now && (!entry.blockedUntil || entry.blockedUntil <= now))) {
      entry = {
        strikes: 0,
        strikeResetAt: now + strikeWindowMs,
        blockedUntil: 0,
        lastReason: reason,
      };
      entries.set(ip, entry);
    }

    if (entry.blockedUntil > now) {
      entry.lastReason = reason;
      return { blocked: true, strikes: entry.strikes, blockedUntil: entry.blockedUntil };
    }

    entry.strikes += 1;
    entry.lastReason = reason;

    if (entry.strikes >= maxStrikes) {
      entry.blockedUntil = now + blockDurationMs;
      console.warn(
        `[SECURITY][IpBlocklist] Auto-blocked IP=${ip} for ${Math.ceil(blockDurationMs / 60_000)}m after ${entry.strikes} strikes (lastReason=${reason})`
      );
      return { blocked: true, strikes: entry.strikes, blockedUntil: entry.blockedUntil };
    }

    return { blocked: false, strikes: entry.strikes, blockedUntil: 0 };
  }

  function isBlocked(ip) {
    if (!ip) return false;
    const entry = entries.get(ip);
    if (!entry) return false;

    const now = Date.now();
    if (entry.blockedUntil && entry.blockedUntil > now) {
      return true;
    }

    if (entry.blockedUntil && entry.blockedUntil <= now) {
      entries.delete(ip);
    }
    return false;
  }

  function getRetryAfterSeconds(ip) {
    const entry = entries.get(ip);
    if (!entry || !entry.blockedUntil) return 0;
    const remainingMs = entry.blockedUntil - Date.now();
    return remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 1000)) : 0;
  }

  function clear(ip) {
    entries.delete(ip);
  }

  function reset() {
    entries.clear();
  }

  function middleware(req, res, next) {
    const ip = getClientIp(req);
    if (isBlocked(ip)) {
      const retryAfterSec = getRetryAfterSeconds(ip);
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(403).json({
        status: false,
        message: "Địa chỉ IP của bạn tạm thời bị chặn do hoạt động đáng ngờ. Vui lòng thử lại sau.",
        retryAfterSeconds: retryAfterSec,
      });
    }
    return next();
  }

  return {
    recordStrike,
    isBlocked,
    getRetryAfterSeconds,
    clear,
    reset,
    middleware,
  };
}

export const ipBlocklist = createIpBlocklist();

export function securityHeaders(req, res, next) {
  res.removeHeader("X-Powered-By");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("X-XSS-Protection", "0");
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

function sanitizeObjectInPlace(target, pathPrefix = "", strippedKeys = []) {
  if (!target || typeof target !== "object") return strippedKeys;

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      sanitizeObjectInPlace(target[i], `${pathPrefix}[${i}]`, strippedKeys);
    }
    return strippedKeys;
  }

  for (const key of Object.getOwnPropertyNames(target)) {
    if (
      key.startsWith("$") ||
      key.includes(".") ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      strippedKeys.push(pathPrefix ? `${pathPrefix}.${key}` : key);
      delete target[key];
      continue;
    }
    sanitizeObjectInPlace(target[key], pathPrefix ? `${pathPrefix}.${key}` : key, strippedKeys);
  }

  return strippedKeys;
}

export function mongoSanitize(req, res, next) {
  const stripped = [];
  if (req.body && typeof req.body === "object") {
    sanitizeObjectInPlace(req.body, "body", stripped);
  }
  if (req.query && typeof req.query === "object") {
    sanitizeObjectInPlace(req.query, "query", stripped);
  }
  if (req.params && typeof req.params === "object") {
    sanitizeObjectInPlace(req.params, "params", stripped);
  }

  if (stripped.length > 0) {
    const ip = getClientIp(req);
    ipBlocklist.recordStrike(ip, "nosql-injection");
    console.warn(
      `[SECURITY][NoSQL-Sanitize] Stripped suspicious keys (${stripped.join(", ")}) from IP=${ip} ${req.method} ${req.originalUrl}`
    );
  }

  next();
}

export function createRateLimiter({
  windowMs = 60_000,
  max = 120,
  message = "Quá nhiều yêu cầu, vui lòng thử lại sau.",
  keyPrefix = "api",
  blocklist = ipBlocklist,
} = {}) {
  const hits = new Map();

  // Periodic cleanup to avoid memory growth
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60_000));
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return function rateLimiterMiddleware(req, res, next) {
    const now = Date.now();
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      blocklist?.recordStrike(ip, `rate-limit:${keyPrefix}`);
      console.warn(`[SECURITY][RateLimit] Blocked IP=${ip} on ${req.method} ${req.originalUrl} (${keyPrefix})`);
      return res.status(429).json({
        status: false,
        message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    next();
  };
}

export function globalErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = err?.status || err?.statusCode || 500;
  console.error(`[API-Error] ${req.method} ${req.originalUrl}:`, err?.message || err);

  const isProd = process.env.NODE_ENV === "production";
  return res.status(statusCode).json({
    status: false,
    message: statusCode >= 500 && isProd ? "Đã xảy ra lỗi hệ thống nội bộ." : err?.message || "Lỗi hệ thống",
  });
}
