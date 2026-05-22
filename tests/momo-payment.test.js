import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import {
  assertMomoIpnMatchesPayment,
  buildMomoCreatePayload,
  buildMomoCreateRawSignature,
  buildMomoIpnRawSignature,
  buildMomoQueryPayload,
  buildMomoQueryRawSignature,
  signMoMo,
  verifyMomoSignature,
} from "../utils/momoPayment.js";

test("builds MoMo create raw signature in documented field order", () => {
  const raw = buildMomoCreateRawSignature({
    accessKey: "access",
    amount: 1000,
    extraData: "",
    ipnUrl: "https://api.example.com/api/payments/momo/ipn",
    orderId: "MOMO_HV001_1710000000000",
    orderInfo: "Thanh toan booking HV001",
    partnerCode: "MOMO_TEST",
    redirectUrl: "hvtravel://payment/momo",
    requestId: "REQ_1710000000000",
    requestType: "captureWallet",
  });

  assert.equal(
    raw,
    "accessKey=access&amount=1000&extraData=&ipnUrl=https://api.example.com/api/payments/momo/ipn&orderId=MOMO_HV001_1710000000000&orderInfo=Thanh toan booking HV001&partnerCode=MOMO_TEST&redirectUrl=hvtravel://payment/momo&requestId=REQ_1710000000000&requestType=captureWallet"
  );
});

test("builds MoMo query raw signature in documented field order", () => {
  const raw = buildMomoQueryRawSignature({
    accessKey: "access",
    orderId: "MOMO_HV001_1710000000000",
    partnerCode: "MOMO_TEST",
    requestId: "REQ_1710000000000",
  });

  assert.equal(
    raw,
    "accessKey=access&orderId=MOMO_HV001_1710000000000&partnerCode=MOMO_TEST&requestId=REQ_1710000000000"
  );
});

test("builds and verifies MoMo IPN signatures", () => {
  const payload = {
    accessKey: "ignored",
    amount: 1000,
    extraData: "",
    message: "Successful.",
    orderId: "MOMO_HV001_1710000000000",
    orderInfo: "Thanh toan booking HV001",
    orderType: "momo_wallet",
    partnerCode: "MOMO_TEST",
    payType: "qr",
    requestId: "REQ_1710000000000",
    responseTime: 1710000005000,
    resultCode: 0,
    transId: 4088878653,
  };
  const raw = buildMomoIpnRawSignature(payload, "access");
  const signature = crypto.createHmac("sha256", "secret").update(raw).digest("hex");

  assert.equal(
    raw,
    "accessKey=access&amount=1000&extraData=&message=Successful.&orderId=MOMO_HV001_1710000000000&orderInfo=Thanh toan booking HV001&orderType=momo_wallet&partnerCode=MOMO_TEST&payType=qr&requestId=REQ_1710000000000&responseTime=1710000005000&resultCode=0&transId=4088878653"
  );
  assert.equal(signMoMo(raw, "secret"), signature);
  assert.equal(verifyMomoSignature({ ...payload, signature }, "access", "secret"), true);
  assert.equal(verifyMomoSignature({ ...payload, signature: "bad" }, "access", "secret"), false);
});

test("builds signed MoMo create payload for captureWallet", () => {
  const config = {
    partnerCode: "MOMO_TEST",
    accessKey: "access",
    secretKey: "secret",
    redirectUrl: "hvtravel://payment/momo",
    ipnUrl: "https://api.example.com/api/payments/momo/ipn",
  };

  const payload = buildMomoCreatePayload({
    config,
    amount: 1000,
    orderId: "MOMO_HV001_1710000000000",
    requestId: "REQ_1710000000000",
    orderInfo: "Thanh toan booking HV001",
  });

  const raw = buildMomoCreateRawSignature({
    ...payload,
    accessKey: "access",
  });

  assert.equal(payload.requestType, "captureWallet");
  assert.equal(payload.partnerCode, "MOMO_TEST");
  assert.equal(payload.amount, 1000);
  assert.equal(payload.signature, signMoMo(raw, "secret"));
});

test("builds signed MoMo query payload", () => {
  const config = {
    partnerCode: "MOMO_TEST",
    accessKey: "access",
    secretKey: "secret",
  };

  const payload = buildMomoQueryPayload({
    config,
    orderId: "MOMO_HV001_1710000000000",
    requestId: "REQ_QUERY_1710000000000",
  });

  const raw = buildMomoQueryRawSignature({
    ...payload,
    accessKey: "access",
  });

  assert.equal(payload.partnerCode, "MOMO_TEST");
  assert.equal(payload.lang, "vi");
  assert.equal(payload.signature, signMoMo(raw, "secret"));
});

test("rejects MoMo IPN payloads that do not match stored payment data", () => {
  const config = {
    partnerCode: "MOMO_TEST",
    accessKey: "access",
    secretKey: "secret",
  };
  const payment = {
    providerOrderId: "MOMO_HV001_1710000000000",
    amount: 1000,
  };
  const payload = {
    amount: 1000,
    extraData: "",
    message: "Successful.",
    orderId: "MOMO_HV001_1710000000000",
    orderInfo: "Thanh toan booking HV001",
    orderType: "momo_wallet",
    partnerCode: "MOMO_TEST",
    payType: "qr",
    requestId: "REQ_1710000000000",
    responseTime: 1710000005000,
    resultCode: 0,
    transId: 4088878653,
  };
  const signature = signMoMo(
    buildMomoIpnRawSignature(payload, config.accessKey),
    config.secretKey
  );

  assert.doesNotThrow(() =>
    assertMomoIpnMatchesPayment({ ...payload, signature }, payment, config)
  );
  const wrongAmountPayload = { ...payload, amount: 2000 };
  const wrongAmountSignature = signMoMo(
    buildMomoIpnRawSignature(wrongAmountPayload, config.accessKey),
    config.secretKey
  );
  assert.throws(
    () =>
      assertMomoIpnMatchesPayment(
        { ...wrongAmountPayload, signature: wrongAmountSignature },
        payment,
        config
      ),
    /amount/i
  );
  assert.throws(
    () => assertMomoIpnMatchesPayment({ ...payload, signature: "bad" }, payment, config),
    /signature/i
  );
});
