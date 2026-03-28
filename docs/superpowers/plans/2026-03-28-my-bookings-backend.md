# My Bookings Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `GET /api/bookings` return a stable contract for `MyBookingScreen`, automatically classify past trips as completed, and fix booking payment-status inconsistencies.

**Architecture:** Extract booking lifecycle and response-shaping into a small helper so list/detail/update responses share one contract. Keep route structure unchanged, update only booking/payment model-controller flow, and add focused Node built-in tests for the new helper logic.

**Tech Stack:** Node.js, Express, Mongoose, Node built-in `node:test`

---

### Task 1: Booking Response Helper

**Files:**
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\utils\bookingResponse.js`
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\tests\booking-response.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("serializes booking summary with completed lifecycle", () => {
  const booking = {
    _id: "booking-1",
    booking_code: "HV001",
    tour_id: "tour-1",
    tour_snapshot: { name: "Da Lat", duration: "3N2D", start_date: "2026-03-01T00:00:00.000Z" },
    booking_date: "2026-02-01T00:00:00.000Z",
    status: "Confirmed",
    payment_status: "Full",
    participants_count: 2,
    total_amount: 4500000,
  };

  const result = toBookingResponse(booking, { now: "2026-03-28T00:00:00.000Z" });

  assert.equal(result.status, "Completed");
  assert.equal(result.participantsCount, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .\tests\booking-response.test.js`
Expected: FAIL because helper does not exist yet

- [ ] **Step 3: Write minimal implementation**

```js
export function toBookingResponse(booking, options = {}) {
  // normalize ids, amounts, snake_case/camelCase, and derived status
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test .\tests\booking-response.test.js`
Expected: PASS

### Task 2: Booking Controller Integration

**Files:**
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\controllers\booking.controller.js`

- [ ] **Step 1: Write the failing test**

Reuse helper tests first so list-controller wiring only depends on already-tested helper behavior.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .\tests\booking-response.test.js`
Expected: Existing assertions still guard the missing controller wiring assumptions indirectly

- [ ] **Step 3: Write minimal implementation**

```js
const normalizedBookings = bookings.map((booking) => toBookingResponse(booking));
return res.json({ status: true, data: normalizedBookings, total, page, totalPages });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test .\tests\booking-response.test.js`
Expected: PASS

### Task 3: Payment Status Consistency

**Files:**
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\models\Booking.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\controllers\payment.controller.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\utils\bookingResponse.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\tests\booking-response.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("maps legacy Paid payment status to Full", () => {
  const result = normalizePaymentStatus("Paid");
  assert.equal(result, "Full");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test .\tests\booking-response.test.js`
Expected: FAIL because legacy payment-status normalization is missing

- [ ] **Step 3: Write minimal implementation**

```js
booking.payment_status = "Full";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test .\tests\booking-response.test.js`
Expected: PASS
