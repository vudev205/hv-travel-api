import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  assertZaloPayCallbackMatchesPayment,
  buildZaloPayCreatePayload,
  buildZaloPayCreateRawData,
  buildZaloPayQueryPayload,
  buildZaloPayQueryRawData,
  generateZaloPayAppTransId,
  mapZaloPayReturnCodeToStatus,
  signZaloPay,
  verifyZaloPayCallbackMac,
} from "../utils/zalopayPayment.js";

test("builds ZaloPay create raw data in documented field order", () => {
  const raw = buildZaloPayCreateRawData({
    app_id: "2554",
    app_trans_id: "260421_HV001_1710000000000",
    app_user: "customer-1",
    amount: 2450000,
    app_time: 1770000000000,
    embed_data: "{\"bookingId\":\"booking-1\"}",
    item: "[{\"itemid\":\"HV001\",\"itemname\":\"HV Travel booking\",\"itemprice\":2450000,\"itemquantity\":1}]",
  });

  assert.equal(
    raw,
    "2554|260421_HV001_1710000000000|customer-1|2450000|1770000000000|{\"bookingId\":\"booking-1\"}|[{\"itemid\":\"HV001\",\"itemname\":\"HV Travel booking\",\"itemprice\":2450000,\"itemquantity\":1}]"
  );
});

test("builds ZaloPay query raw data in documented field order", () => {
  const raw = buildZaloPayQueryRawData({
    app_id: "2554",
    app_trans_id: "260421_HV001_1710000000000",
    key1: "key-one",
  });

  assert.equal(raw, "2554|260421_HV001_1710000000000|key-one");
});

test("builds signed ZaloPay create payload", () => {
  const config = {
    appId: "2554",
    key1: "key-one",
    callbackUrl: "https://api.example.com/api/payments/zalopay/callback",
  };

  const payload = buildZaloPayCreatePayload({
    config,
    amount: 2450000,
    appTransId: "260421_HV001_1710000000000",
    appTime: 1770000000000,
    appUser: "customer-1",
    booking: {
      _id: "booking-1",
      booking_code: "HV001",
      contact_info: { email: "customer@example.com" },
    },
  });

  const raw = buildZaloPayCreateRawData(payload);

  assert.equal(payload.app_id, "2554");
  assert.equal(payload.app_user, "customer-1");
  assert.equal(payload.amount, 2450000);
  assert.equal(payload.bank_code, "");
  assert.equal(payload.callback_url, config.callbackUrl);
  assert.equal(payload.mac, signZaloPay(raw, config.key1));
});

test("builds signed ZaloPay query payload", () => {
  const config = { appId: "2554", key1: "key-one" };

  const payload = buildZaloPayQueryPayload({
    config,
    appTransId: "260421_HV001_1710000000000",
  });

  assert.equal(payload.app_id, "2554");
  assert.equal(payload.app_trans_id, "260421_HV001_1710000000000");
  assert.equal(
    payload.mac,
    signZaloPay("2554|260421_HV001_1710000000000|key-one", "key-one")
  );
});

test("verifies ZaloPay callback MAC with key2", () => {
  const data = JSON.stringify({
    app_id: 2554,
    app_trans_id: "260421_HV001_1710000000000",
    amount: 2450000,
    zp_trans_id: 160413000003083,
  });
  const mac = crypto.createHmac("sha256", "key-two").update(data).digest("hex");

  assert.equal(signZaloPay(data, "key-two"), mac);
  assert.equal(verifyZaloPayCallbackMac({ data, mac }, "key-two"), true);
  assert.equal(verifyZaloPayCallbackMac({ data, mac: "bad" }, "key-two"), false);
});

test("rejects ZaloPay callbacks that do not match stored payment data", () => {
  const config = { appId: "2554", key2: "key-two" };
  const payment = {
    providerOrderId: "260421_HV001_1710000000000",
    amount: 2450000,
  };
  const data = JSON.stringify({
    app_id: 2554,
    app_trans_id: "260421_HV001_1710000000000",
    amount: 2450000,
    zp_trans_id: 160413000003083,
  });
  const mac = signZaloPay(data, config.key2);

  assert.deepEqual(assertZaloPayCallbackMatchesPayment({ data, mac }, payment, config), {
    app_id: 2554,
    app_trans_id: "260421_HV001_1710000000000",
    amount: 2450000,
    zp_trans_id: 160413000003083,
  });

  const wrongAmountData = JSON.stringify({
    app_id: 2554,
    app_trans_id: "260421_HV001_1710000000000",
    amount: 1000,
  });
  assert.throws(
    () =>
      assertZaloPayCallbackMatchesPayment(
        { data: wrongAmountData, mac: signZaloPay(wrongAmountData, config.key2) },
        payment,
        config
      ),
    /amount/i
  );
  assert.throws(
    () => assertZaloPayCallbackMatchesPayment({ data, mac: "bad" }, payment, config),
    /mac|signature/i
  );
});

test("maps ZaloPay query return codes to local payment statuses", () => {
  assert.equal(mapZaloPayReturnCodeToStatus(1), "Success");
  assert.equal(mapZaloPayReturnCodeToStatus(2), "Failed");
  assert.equal(mapZaloPayReturnCodeToStatus(3), "Pending");
  assert.equal(mapZaloPayReturnCodeToStatus(99), "Failed");
});

test("generates app_trans_id with GMT+7 yymmdd prefix", () => {
  const now = new Date("2026-04-20T18:30:00.000Z");
  const appTransId = generateZaloPayAppTransId(
    { booking_code: "HV 001/ABC" },
    now,
    () => "abcd1234"
  );

  assert.equal(appTransId, "260421_HV001ABC_abcd1234");
  assert.ok(appTransId.length <= 40);
});
