# Support Chat on Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready support chat system for HV Travel while keeping the existing Node.js API on Vercel and moving realtime socket handling to a dedicated gateway.

**Architecture:** Keep `HV-Travel API` responsible for auth, REST, conversation state, and assignment. Introduce a separate persistent Node.js realtime gateway for Socket.IO. Both services share PostgreSQL and Redis.

**Tech Stack:** Express, PostgreSQL, Redis, Socket.IO, BullMQ, React Native, TypeScript

---

### Task 1: Conversation and message data model

**Files:**
- Create: `C:\Users\Admin\Desktop\HV-Travel\HV-Travel API\docs\support-chat\schema.sql` or ORM equivalents
- Modify: backend models/entities for `Conversation`, `Message`, `Assignment`, `Receipt`, `Event`

- [ ] Add conversation schema with one-active-thread-per-customer constraint.
- [ ] Add message idempotency with `client_message_id`.
- [ ] Add assignment history model.

### Task 2: REST support module in HV-Travel API

**Files:**
- Create/modify REST routes/controllers/services for `/api/support/*`

- [ ] Implement create-or-return-active conversation endpoint.
- [ ] Implement list/detail/messages/read/reopen endpoints.
- [ ] Implement agent queue/claim/status endpoints.

### Task 3: Assignment service

**Files:**
- Create/modify assignment service and queue metrics helpers

- [ ] Implement auto-assignment policy.
- [ ] Implement manual claim.
- [ ] Implement reassignment and resolve flows.

### Task 4: Realtime gateway service

**Files:**
- Create new service/repo or workspace app for `support-realtime`

- [ ] Add Socket.IO auth handshake.
- [ ] Add room join/leave.
- [ ] Add send/typing/read events.
- [ ] Wire Redis adapter for horizontal scale.

### Task 5: Message lifecycle integration

**Files:**
- Modify API and realtime gateway integration boundaries

- [ ] Persist messages before broadcast.
- [ ] Emit `ack`, `new`, `read`, `typing`, `queue:update`.
- [ ] Add reconnect snapshot behavior.

### Task 6: Mobile support UI integration

**Files:**
- Modify mobile inbox/chat service layer and support screens

- [ ] Point mobile support screens to `/api/support/*`.
- [ ] Add socket connection lifecycle.
- [ ] Replace demo transcript with real message stream.

### Task 7: Reliability and operations

**Files:**
- Create worker/config/ops docs

- [ ] Add BullMQ jobs for SLA and stale queue handling.
- [ ] Add Redis presence tracking.
- [ ] Add observability metrics and error logging.

### Task 8: Verification

**Files:**
- Verify only

- [ ] Verify REST flows locally.
- [ ] Verify socket reconnect/read receipt behavior.
- [ ] Verify agent claim and reassignment behavior.
- [ ] Verify deployment split: Vercel REST + external realtime gateway.
