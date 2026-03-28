import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveTourSnapshotStartDate,
  normalizePaymentStatus,
  toBookingResponse,
} from "../utils/bookingResponse.js";

test("serializes booking summary with camelCase and snake_case aliases for mobile", () => {
  const booking = {
    _id: "booking-1",
    booking_code: "HV001",
    tour_id: "tour-1",
    tour_snapshot: {
      code: "DL001",
      name: "Da Lat",
      start_date: "2026-04-01T00:00:00.000Z",
      duration: "3N2D",
    },
    booking_date: "2026-03-01T00:00:00.000Z",
    status: "Confirmed",
    payment_status: "Full",
    participants_count: 2,
    total_amount: { toString: () => "4500000" },
  };

  const result = toBookingResponse(booking, {
    now: "2026-03-28T00:00:00.000Z",
  });

  assert.equal(result.bookingCode, "HV001");
  assert.equal(result.booking_code, "HV001");
  assert.equal(result.tourId, "tour-1");
  assert.equal(result.tour_id, "tour-1");
  assert.equal(result.participantsCount, 2);
  assert.equal(result.participants_count, 2);
  assert.equal(result.totalAmount, 4500000);
  assert.equal(result.total_amount, 4500000);
  assert.equal(result.paymentStatus, "Full");
  assert.equal(result.payment_status, "Full");
});

test("auto-completes pending booking when start date is in the past", () => {
  const result = toBookingResponse(
    {
      status: "Pending",
      payment_status: "Unpaid",
      tour_snapshot: { start_date: "2026-03-01T00:00:00.000Z" },
    },
    { now: "2026-03-28T00:00:00.000Z" }
  );

  assert.equal(result.status, "Completed");
});

test("keeps cancelled and completed booking statuses unchanged", () => {
  const cancelled = toBookingResponse(
    {
      status: "Cancelled",
      payment_status: "Unpaid",
      tour_snapshot: { start_date: "2026-03-01T00:00:00.000Z" },
    },
    { now: "2026-03-28T00:00:00.000Z" }
  );
  const completed = toBookingResponse(
    {
      status: "Completed",
      payment_status: "Full",
      tour_snapshot: { start_date: "2026-03-01T00:00:00.000Z" },
    },
    { now: "2026-03-28T00:00:00.000Z" }
  );

  assert.equal(cancelled.status, "Cancelled");
  assert.equal(completed.status, "Completed");
});

test("normalizes legacy Paid payment status to Full", () => {
  assert.equal(normalizePaymentStatus("Paid"), "Full");
});

test("converts Decimal128-like total amount to number", () => {
  const result = toBookingResponse(
    {
      status: "Confirmed",
      payment_status: "Full",
      total_amount: { toString: () => "1234567.5" },
      tour_snapshot: { start_date: "2026-04-01T00:00:00.000Z" },
    },
    { now: "2026-03-28T00:00:00.000Z" }
  );

  assert.equal(result.totalAmount, 1234567.5);
  assert.equal(result.total_amount, 1234567.5);
});

test("prefers selected tour start date when customer picked one", () => {
  const result = resolveTourSnapshotStartDate("2026-05-10T00:00:00.000Z", [
    "2026-04-01T00:00:00.000Z",
    "2026-05-10T00:00:00.000Z",
  ]);

  assert.equal(result, "2026-05-10T00:00:00.000Z");
});
