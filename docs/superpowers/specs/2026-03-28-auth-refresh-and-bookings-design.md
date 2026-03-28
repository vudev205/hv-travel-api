# Refresh Token And My Booking Design

## Goal

Fix `MyBookingScreen` so booked trips load reliably, add a proper refresh-token based session flow for both backend and frontend, revoke all sessions when the user changes or resets password, and keep users signed in across app restarts until they explicitly log out.

## Current Problems

- Frontend session state is split across multiple storage keys and multiple flows.
- `SplashScreen` reads a different SecureStore key than `AuthContext`.
- `LoginForm` stores extra per-account tokens, creating a second source of truth.
- Frontend `signOut()` does not call backend logout, so local and server session state drift apart.
- Backend only issues one long-lived access token and uses `tokenVersion` as a coarse invalidation mechanism.
- `changePassword` request payload is inconsistent between frontend and backend.
- `MyBookingScreen` swallows fetch failures and can appear empty with no visible reason.

## Recommended Approach

Use short-lived access tokens plus rotating refresh tokens, with `AuthContext` as the only frontend session owner.

This is the smallest design that meets all required behaviors:

- app restart without logout should restore session automatically
- logout should end only the current session
- change password and reset password should revoke all sessions
- booking screen should fail loudly enough to debug and should use the refreshed session automatically

## Backend Design

### Token model

Keep `tokenVersion` on `Customer` for global invalidation and add refresh session storage to support per-session rotation.

Add a refresh-session structure under `Customer`:

- `tokenId`: unique session id
- `refreshTokenHash`: hash of refresh token
- `expiresAt`
- `createdAt`
- `lastUsedAt`
- `revokedAt`
- `replacedByTokenId`
- `deviceLabel` optional

This can be an embedded array on `Customer` for the current scope. No separate collection is required unless the array becomes large later.

### Access token

Access token remains JWT and includes:

- `id`
- `role`
- `tokenVersion`
- `sessionId`

Set lifetime short enough for real refresh behavior, for example 15 minutes.

### Refresh token

Refresh token is an opaque random string, not a JWT. Store only its hash in the database.

Behavior:

- `POST /api/auth/login` creates a refresh session and returns `accessToken`, `refreshToken`, `customer`
- `POST /api/auth/refresh` validates refresh token, checks session not revoked, rotates it, and returns a new pair
- `POST /api/auth/logout` revokes only the current refresh session
- optional `POST /api/auth/logout-all` revokes all refresh sessions for the user

### Password change and reset

Both `changePassword` and `resetPassword` must:

- update password hash
- increment `tokenVersion`
- revoke all refresh sessions

This guarantees all active access tokens fail on next protected request and all refresh tokens become unusable.

### Auth middleware

`customerAuth` continues verifying JWT and `tokenVersion`, plus uses `sessionId` only when needed for logout-current-session behavior.

No route contract change is needed for existing protected APIs other than login/logout/me and the new refresh route.

### Auth routes

Required backend routes:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/reset-password`

Payload contracts:

- `login`: `{ email, password }`
- `refresh`: `{ refreshToken }`
- `logout`: authenticated route using access token; current session identified by JWT `sessionId`
- `change-password`: authenticated route preferred, payload `{ currentPassword, newPassword }`
- `reset-password`: existing OTP flow plus global revoke

## Frontend Design

### Single source of truth

`AuthContext` becomes the single session owner.

It stores and restores:

- `access_token`
- `refresh_token`
- lightweight remembered account metadata
- canonical session metadata through a non-React session manager module used by both `AuthContext` and `ApiService`

It exposes:

- `signIn`
- `signOut`
- `refreshSession`
- `restoreSession`

`SplashScreen` should not run its own auth logic. It should only wait for `AuthContext.loading` and route based on resolved auth state.

### Session restore

On app launch:

1. `AuthContext` reads stored access and refresh tokens
2. Try `GET /me` with access token
3. If access token is expired or rejected, try `POST /refresh`
4. If refresh succeeds, store new tokens and fetch `/me`
5. If refresh fails, clear session and go to login

If the user has not logged out and refresh token is still valid, the app should go directly to `MainTabs`.

### Request retry

Centralize token refresh in `ApiService`.

Do not make `ApiService` call React context directly. Add a non-React session manager module with methods like:

- `getAccessToken()`
- `getRefreshToken()`
- `storeSession()`
- `refreshSession()`
- `clearSession()`

Feature services should stop accepting bearer tokens as method arguments over time and instead rely on the shared session manager for protected requests.

When a protected request returns `401`:

1. call `AuthContext` refresh flow or a shared auth session helper
2. retry the original request once with new access token
3. if refresh fails, clear session and redirect to login

Refresh must be single-flight. If multiple requests hit `401` together, they must wait on one in-flight refresh promise instead of sending multiple `/refresh` requests with the same rotating token.

This prevents each feature service from implementing token refresh separately.

### Remembered accounts

Remembered accounts should store only display metadata, not standalone duplicated access tokens per account.

One-tap remembered-account resume is preserved, but implemented with the canonical session store instead of per-account access-token keys.

Use one canonical current session plus optional remembered account list:

- account id
- full name
- email
- avatar
- lastLoginAt

If the user confirms “remember this device”, store refresh-token backed session metadata for that account via the canonical session manager. If the user declines, only prefill metadata is allowed and the account must not appear as a one-tap remembered login.

### Logout behavior

When the user logs out:

1. frontend calls backend `logout`
2. backend revokes current refresh session
3. frontend clears local tokens
4. next app open stays on login until the user signs in again

### Change password behavior

Frontend sends a consistent payload to backend and clears local session after success, because the current session must be invalidated too.

Preferred contract:

- authenticated request is mandatory
- `Authorization: Bearer <accessToken>`
- payload `{ currentPassword, newPassword }`

After success:

- clear local auth state
- navigate to `LoginScreen`
- remembered account metadata may remain, but not tokens

### Reset password behavior

After OTP-based reset:

- backend revokes all sessions
- frontend does not auto-login
- user returns to login and signs in again

## Rollout And Migration

This change requires a one-time cleanup of legacy auth keys already stored on devices.

On first launch after upgrade:

- clear legacy keys such as `SecureStore`, `token`, and `token_<userId>`
- clear any stale legacy access-token-only sessions
- force one re-login to establish a refresh-token-based session

After that first migration, normal auto-login resumes through the new refresh-token flow.

## My Booking Fix

`MyBookingScreen` should keep using `BookingService.getBookings`, but with two changes:

- auth/session errors must surface clearly instead of only logging to console
- the screen should distinguish between empty data and request failure

Minimal UX:

- if request fails with auth/network error, show `Alert` or screen-level error state
- keep pull-to-refresh behavior

This avoids the current “blank screen means anything” failure mode.

## Testing Strategy

### Backend

- login returns access and refresh tokens
- refresh rotates refresh token and rejects reused revoked token
- logout revokes only current session
- change password revokes all sessions and bumps `tokenVersion`
- reset password revokes all sessions
- protected route fails with old access token after password change

### Frontend

- restore session with valid access token
- restore session via refresh when access token is expired
- sign out clears session and calls backend logout
- app launch without logout routes to `MainTabs`
- app launch after logout routes to login
- booking screen shows error state when fetch fails

## Non-Goals

- multi-device session management UI
- biometric unlock
- server-side device analytics
- major navigation rewrite
