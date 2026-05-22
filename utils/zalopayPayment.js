import crypto from "node:crypto";

const ZALOPAY_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;

const toSignatureValue = (value) => {
  if (value === undefined || value === null) return "";
  return String(value);
};

export function signZaloPay(rawData, key) {
  return crypto.createHmac("sha256", key).update(rawData).digest("hex");
}

export function buildZaloPayCreateRawData(payload) {
  return [
    payload.app_id,
    payload.app_trans_id,
    payload.app_user,
    payload.amount,
    payload.app_time,
    payload.embed_data,
    payload.item,
  ]
    .map(toSignatureValue)
    .join("|");
}

export function buildZaloPayQueryRawData(payload) {
  return [payload.app_id, payload.app_trans_id, payload.key1]
    .map(toSignatureValue)
    .join("|");
}

export function buildZaloPayCreatePayload({
  config,
  amount,
  appTransId,
  appTime = Date.now(),
  appUser,
  booking,
  description,
  item,
  embedData,
  bankCode = "",
}) {
  const bookingCode = String(booking?.booking_code || booking?.bookingCode || booking?._id || "BOOKING");
  const itemJson =
    typeof item === "string"
      ? item
      : JSON.stringify(
          item || [
            {
              itemid: bookingCode,
              itemname: "HV Travel booking",
              itemprice: amount,
              itemquantity: 1,
            },
          ]
        );
  const embedDataJson =
    typeof embedData === "string"
      ? embedData
      : JSON.stringify(
          embedData || {
            bookingId: toSignatureValue(booking?._id || booking?.id),
            bookingCode,
            provider: "ZaloPay",
          }
        );
  const payload = {
    app_id: config.appId,
    app_user:
      appUser ||
      booking?.customer_id?.toString?.() ||
      booking?.contact_info?.email ||
      booking?.contact_info?.phone ||
      "HVTravel",
    app_trans_id: appTransId,
    app_time: appTime,
    amount,
    item: itemJson,
    embed_data: embedDataJson,
    description: description || `Thanh toan booking ${bookingCode}`,
    bank_code: bankCode,
  };

  if (config.callbackUrl) {
    payload.callback_url = config.callbackUrl;
  }

  return {
    ...payload,
    mac: signZaloPay(buildZaloPayCreateRawData(payload), config.key1),
  };
}

export function buildZaloPayQueryPayload({ config, appTransId }) {
  const payload = {
    app_id: config.appId,
    app_trans_id: appTransId,
  };

  return {
    ...payload,
    mac: signZaloPay(
      buildZaloPayQueryRawData({
        ...payload,
        key1: config.key1,
      }),
      config.key1
    ),
  };
}

export function verifyZaloPayCallbackMac(payload, key2) {
  const data = payload?.data;
  const actual = payload?.mac;
  if (!data || !actual || typeof data !== "string" || typeof actual !== "string") {
    return false;
  }

  const expected = signZaloPay(data, key2);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function parseZaloPayCallbackData(data) {
  if (!data || typeof data !== "string") {
    const error = new Error("Missing ZaloPay callback data");
    error.statusCode = 400;
    throw error;
  }

  try {
    return JSON.parse(data);
  } catch {
    const error = new Error("Invalid ZaloPay callback data");
    error.statusCode = 400;
    throw error;
  }
}

export function assertZaloPayCallbackMatchesPayment(payload, payment, config) {
  if (!verifyZaloPayCallbackMac(payload, config.key2)) {
    const error = new Error("Invalid ZaloPay callback mac");
    error.statusCode = 400;
    throw error;
  }

  const data = parseZaloPayCallbackData(payload.data);
  if (toSignatureValue(data.app_id) !== toSignatureValue(config.appId)) {
    const error = new Error("ZaloPay app_id does not match");
    error.statusCode = 400;
    throw error;
  }

  if (data.app_trans_id !== payment.providerOrderId) {
    const error = new Error("ZaloPay app_trans_id does not match payment");
    error.statusCode = 400;
    throw error;
  }

  if (toVndAmount(data.amount) !== toVndAmount(payment.amount)) {
    const error = new Error("ZaloPay amount does not match payment amount");
    error.statusCode = 400;
    throw error;
  }

  return data;
}

export function mapZaloPayReturnCodeToStatus(returnCode) {
  const code = Number(returnCode);
  if (code === 1) return "Success";
  if (code === 3) return "Pending";
  return "Failed";
}

export function isSuccessfulZaloPayCreate(returnCode) {
  return Number(returnCode) === 1;
}

export function getZaloPayConfig() {
  return {
    appId: process.env.ZALOPAY_APP_ID || "",
    key1: process.env.ZALOPAY_KEY1 || "",
    key2: process.env.ZALOPAY_KEY2 || "",
    callbackUrl: process.env.ZALOPAY_CALLBACK_URL || "",
    apiBase: process.env.ZALOPAY_API_BASE || "https://sb-openapi.zalopay.vn",
  };
}

export function assertZaloPayConfig(config) {
  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "apiBase" && !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    const error = new Error(`Missing ZaloPay configuration: ${missing.join(", ")}`);
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

export function generateZaloPayAppTransId(
  booking,
  now = new Date(),
  randomId = () => crypto.randomBytes(4).toString("hex")
) {
  const gmt7Date = new Date(now.getTime() + ZALOPAY_TIMEZONE_OFFSET_MS);
  const year = String(gmt7Date.getUTCFullYear()).slice(-2);
  const month = String(gmt7Date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(gmt7Date.getUTCDate()).padStart(2, "0");
  const bookingCode = String(booking?.booking_code || booking?.bookingCode || booking?._id || "BOOKING")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 24);
  const suffix = String(randomId()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8);

  return `${year}${month}${day}_${bookingCode}_${suffix}`.slice(0, 40);
}
