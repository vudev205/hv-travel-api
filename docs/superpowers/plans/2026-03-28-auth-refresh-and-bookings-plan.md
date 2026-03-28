# Auth Refresh And My Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add refresh-token based auth across backend and React Native, revoke all sessions on password change/reset, restore app sessions automatically until explicit logout, and fix `MyBookingScreen` so booked trips load and report auth/network failures clearly.

**Architecture:** Backend keeps short-lived JWT access tokens plus rotating refresh sessions keyed by `sessionId`; frontend centralizes session state in `AuthContext` and retries protected API calls once after refresh. Booking UI remains on existing screens/services, but fetch behavior is made explicit and auth/session drift is removed by deleting duplicate token storage paths.
Implementation includes a one-time legacy-auth cleanup on first launch, a non-React session manager shared by `AuthContext` and `ApiService`, and a single-flight refresh guard so rotating refresh tokens cannot race each other.

**Tech Stack:** Node.js, Express, Mongoose, React Native, Expo SecureStore, AsyncStorage, Jest, Node built-in `node:test`

---

### File Map

**Backend**
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\models\RefreshSession.js`
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\utils\authSession.js`
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\tests\auth-session.test.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\models\Customer.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\utils\auth.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\middlewares\authMiddleware.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\controllers\auth.controller.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\routes\auth.routes.js`

**Frontend**
- Create: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\AuthSessionService.ts`
- Create: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\tests\auth-session.test.cjs`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\ApiService.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\AuthService.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\context\AuthContext.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\screens\Splash\SplashScreen.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\screens\Login\LoginForm.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\screens\Main\Setting\SettingScreen.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\AccountStorageService.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\config\api.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\dataAdapters.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\screens\Main\Setting\MyBooking\MyBookingScreen.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\tsconfig.test.json`

### Task 1: Backend Refresh Session Primitives

**Files:**
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\models\RefreshSession.js`
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\utils\authSession.js`
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\tests\auth-session.test.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\utils\auth.js`

- [ ] **Step 1: Write the failing test**

```js
test("rotates refresh tokens and invalidates reused tokens", async () => {
  const session = issueRefreshSession({ customerId: "cus_1" });
  const rotated = rotateRefreshSession(session, session.plainToken);
  assert.equal(rotated.previous.revoked, true);
  assert.equal(validateRefreshToken(session, session.plainToken), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\tests\auth-session.test.js`
Expected: FAIL because refresh-session helpers do not exist yet

- [ ] **Step 3: Write minimal implementation**

```js
export function issueRefreshSession(customerId) { /* create tokenId + opaque token + hash */ }
export function rotateRefreshSession(session, plainToken) { /* revoke old + issue new */ }
export function buildAccessTokenPayload(customer, sessionId) { /* include tokenVersion + role + sessionId */ }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\tests\auth-session.test.js`
Expected: PASS

### Task 2: Backend Auth Flow Integration

**Files:**
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\models\Customer.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\middlewares\authMiddleware.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\controllers\auth.controller.js`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\routes\auth.routes.js`

- [ ] **Step 1: Write the failing test**

```js
test("password reset invalidates all sessions by bumping tokenVersion", () => {
  const customer = { tokenVersion: 2 };
  const result = revokeAllSessionsForPasswordChange(customer);
  assert.equal(result.tokenVersion, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node .\tests\auth-session.test.js`
Expected: FAIL because revoke-all integration helper does not exist yet

- [ ] **Step 3: Write minimal implementation**

```js
router.post("/refresh", refreshToken);
router.post("/change-password", customerAuth, changePassword);
```

and update controller behavior so:
- `login`/`register` return `accessToken`, `refreshToken`, plus legacy `token` alias
- `refresh` rotates tokens
- `logout` revokes current session only
- `changePassword` and `resetPassword` revoke all sessions and increment `tokenVersion`

- [ ] **Step 4: Run test to verify it passes**

Run: `node .\tests\auth-session.test.js`
Expected: PASS

- [ ] **Step 5: Syntax check backend auth files**

Run:
- `node --check .\controllers\auth.controller.js`
- `node --check .\middlewares\authMiddleware.js`
- `node --check .\utils\auth.js`
- `node --check .\utils\authSession.js`
- `node --check .\models\RefreshSession.js`

Expected: exit code 0 for all commands

### Task 3: Frontend Session Storage And Refresh Flow

**Files:**
- Create: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\AuthSessionService.ts`
- Create: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\tests\auth-session.test.cjs`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\AuthService.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\ApiService.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\context\AuthContext.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\AccountStorageService.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\tsconfig.test.json`

- [ ] **Step 1: Write the failing test**

```js
test("AuthService.refresh sends refresh token and stores rotated session payload", async () => {
  // mock ApiService + AuthSessionService store methods
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth-session.test.cjs`
Expected: FAIL because refresh/session helpers are missing

- [ ] **Step 3: Write minimal implementation**

Implement:
- canonical session keys
- `AuthService.refreshToken()`
- `AuthContext.restoreSession()`
- one retry path in `ApiService` for protected requests after refresh
- single-flight refresh mutex/promise in session manager or `ApiService`
- removal of duplicate per-account token storage

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auth-session.test.cjs`
Expected: PASS

### Task 4: Frontend Navigation And Remembered Account Cleanup

**Files:**
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\screens\Splash\SplashScreen.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\screens\Login\LoginForm.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\screens\Main\Setting\SettingScreen.tsx`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\config\api.ts`

- [ ] **Step 1: Write the failing test**

Add assertions in `auth-session.test.cjs` that remembered accounts are only stored after explicit confirmation and logout clears canonical session keys.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth-session.test.cjs`
Expected: FAIL because current login/logout flow still uses mixed keys

- [ ] **Step 3: Write minimal implementation**

Implement:
- `SplashScreen` waits on `AuthContext.loading` and routes by auth state only
- one-time migration cleanup of legacy auth keys (`SecureStore`, `token`, `token_<userId>`) that forces exactly one re-login after upgrade
- `LoginForm` stops writing standalone per-account access tokens and only saves remembered-account resume metadata/session after confirm
- `SettingScreen` uses `useAuth().signOut()`
- `api.ts` keeps one explicit base URL source and avoids stale token key assumptions

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auth-session.test.cjs`
Expected: PASS

### Task 5: My Booking Screen Reliability

**Files:**
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\services\dataAdapters.ts`
- Modify: `C:\Users\Admin\Desktop\HV-Travel\react-native hv-travel\HV-Travel\screens\Main\Setting\MyBooking\MyBookingScreen.tsx`

- [ ] **Step 1: Write the failing test**

```js
test("normalizes booking statuses for legacy labels and preserves API-driven bookings in visible tabs", () => {
  const booking = normalizeBooking({ status: "Chưa Đi" });
  expect(["Pending", "Paid", "Confirmed"]).toContain(booking.status);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth-session.test.cjs login.test.cjs`
Expected: FAIL because booking status normalization and booking error handling are incomplete

- [ ] **Step 3: Write minimal implementation**

Implement:
- booking status canonicalization in `dataAdapters.ts`
- `MyBookingScreen` error state or alert for fetch failure
- guard so missing token ends loading cleanly instead of hanging

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auth-session.test.cjs login.test.cjs`
Expected: PASS

### Task 6: End-To-End Verification

**Files:**
- Verify only

- [ ] **Step 1: Run backend verification**

Run:
- `node .\tests\auth-session.test.js`
- `node .\tests\booking-response.test.js`

Expected: all tests pass

- [ ] **Step 2: Run frontend verification**

Run:
- `npm test -- auth-session.test.cjs login.test.cjs`

Expected: Jest passes with 0 failing tests

- [ ] **Step 3: Spot-check changed files for syntax**

Run:
- `node --check .\controllers\auth.controller.js`
- `node --check .\middlewares\authMiddleware.js`
- `node --check .\utils\auth.js`
- `node --check .\utils\authSession.js`
- `node --check .\models\RefreshSession.js`

Expected: exit code 0
