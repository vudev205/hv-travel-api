import crypto from "node:crypto";

const toSignatureValue = (value) => {
  if (value === undefined || value === null) return "";
  return String(value);
};

const joinSignatureFields = (fields) =>
  fields.map(([key, value]) => `${key}=${toSignatureValue(value)}`).join("&");

export function signMoMo(rawSignature, secretKey) {
  return crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");
}

export function buildMomoCreateRawSignature(payload) {
  return joinSignatureFields([
    ["accessKey", payload.accessKey],
    ["amount", payload.amount],
    ["extraData", payload.extraData],
    ["ipnUrl", payload.ipnUrl],
    ["orderId", payload.orderId],
    ["orderInfo", payload.orderInfo],
    ["partnerCode", payload.partnerCode],
    ["redirectUrl", payload.redirectUrl],
    ["requestId", payload.requestId],
    ["requestType", payload.requestType],
  ]);
}

export function buildMomoQueryRawSignature(payload) {
  return joinSignatureFields([
    ["accessKey", payload.accessKey],
    ["orderId", payload.orderId],
    ["partnerCode", payload.partnerCode],
    ["requestId", payload.requestId],
  ]);
}

export function buildMomoIpnRawSignature(payload, accessKey) {
  return joinSignatureFields([
    ["accessKey", accessKey],
    ["amount", payload.amount],
    ["extraData", payload.extraData],
    ["message", payload.message],
    ["orderId", payload.orderId],
    ["orderInfo", payload.orderInfo],
    ["orderType", payload.orderType],
    ["partnerCode", payload.partnerCode],
    ["payType", payload.payType],
    ["requestId", payload.requestId],
    ["responseTime", payload.responseTime],
    ["resultCode", payload.resultCode],
    ["transId", payload.transId],
  ]);
}

export function buildMomoCreatePayload({
  config,
  amount,
  orderId,
  requestId,
  orderInfo,
  extraData = "",
  lang = "vi",
}) {
  const requestType = "captureWallet";
  const payload = {
    partnerCode: config.partnerCode,
    partnerName: "HV Travel",
    storeId: "HVTravel",
    requestId,
    amount,
    orderId,
    orderInfo,
    redirectUrl: config.redirectUrl,
    ipnUrl: config.ipnUrl,
    requestType,
    extraData,
    lang,
  };
  const rawSignature = buildMomoCreateRawSignature({
    ...payload,
    accessKey: config.accessKey,
  });

  return {
    ...payload,
    signature: signMoMo(rawSignature, config.secretKey),
  };
}

export function buildMomoQueryPayload({ config, orderId, requestId, lang = "vi" }) {
  const payload = {
    partnerCode: config.partnerCode,
    requestId,
    orderId,
    lang,
  };
  const rawSignature = buildMomoQueryRawSignature({
    ...payload,
    accessKey: config.accessKey,
  });

  return {
    ...payload,
    signature: signMoMo(rawSignature, config.secretKey),
  };
}

export function verifyMomoSignature(payload, accessKey, secretKey) {
  const actual = payload?.signature;
  if (!actual || typeof actual !== "string") return false;

  const rawSignature = buildMomoIpnRawSignature(payload, accessKey);
  const expected = signMoMo(rawSignature, secretKey);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function assertMomoIpnMatchesPayment(payload, payment, config) {
  if (!verifyMomoSignature(payload, config.accessKey, config.secretKey)) {
    const error = new Error("Invalid MoMo signature");
    error.statusCode = 400;
    throw error;
  }

  if (payload.partnerCode !== config.partnerCode) {
    const error = new Error("MoMo partnerCode does not match");
    error.statusCode = 400;
    throw error;
  }

  if (payload.orderId !== payment.providerOrderId) {
    const error = new Error("MoMo orderId does not match payment");
    error.statusCode = 400;
    throw error;
  }

  if (toVndAmount(payload.amount) !== toVndAmount(payment.amount)) {
    const error = new Error("MoMo amount does not match payment amount");
    error.statusCode = 400;
    throw error;
  }
}

export function getMoMoConfig() {
  return {
    partnerCode: process.env.MOMO_PARTNER_CODE || "",
    accessKey: process.env.MOMO_ACCESS_KEY || "",
    secretKey: process.env.MOMO_SECRET_KEY || "",
    redirectUrl: process.env.MOMO_REDIRECT_URL || "",
    ipnUrl: process.env.MOMO_IPN_URL || "",
    apiBase: process.env.MOMO_API_BASE || "https://test-payment.momo.vn",
  };
}

export function assertMoMoConfig(config) {
  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "apiBase" && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    const error = new Error(`Missing MoMo configuration: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }
}

export function toVndAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  if (value && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  return 0;
}

export function generateMoMoOrderId(booking) {
  const bookingCode = String(booking?.booking_code || booking?.bookingCode || booking?._id || "BOOKING")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 40);
  return `MOMO_${bookingCode}_${Date.now()}`;
}

export function generateMoMoRequestId() {
  return `REQ_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

export function isSuccessfulMoMoResult(resultCode) {
  return Number(resultCode) === 0;
}
