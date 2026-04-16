# Support Chat Architecture for HV-Travel API on Vercel

**Date:** 2026-03-29

## Goal

Thiết kế hệ thống chat hỗ trợ khách hàng production-ready cho mobile React Native và backend Node.js, trong bối cảnh `HV-Travel API` đang deploy trên Vercel.

## Deployment Constraint

`HV-Travel API` hiện nằm trên Vercel. Với ràng buộc này, không nên đặt Socket.IO server lâu dài trực tiếp trong cùng runtime của Vercel Functions. Kiến trúc đúng là:

- giữ `HV-Travel API` trên Vercel cho REST, auth, conversation management
- tách một `Realtime Gateway` Node.js riêng cho WebSocket/Socket.IO
- dùng chung DB và Redis giữa hai lớp

## Recommended Topology

```text
React Native App
  | \
  |  \__ WebSocket / Socket.IO
  |         |
  |         v
  |    Realtime Gateway (Render/Railway/Fly/VM)
  |
  \____ HTTPS REST
            |
            v
      HV-Travel API (Express on Vercel)
            |
            +--> PostgreSQL
            +--> Redis
            +--> Queue workers (BullMQ)
```

## Product Model

- 1 customer có 1 active support conversation tại một thời điểm
- agent có thể đổi linh hoạt qua assignment history
- nhiều agent có thể đọc cùng lịch sử
- chỉ current assignee hoặc supervisor mới được trả lời mặc định

## Customer UX

### Inbox

- 1 support entry rõ ràng ở đầu màn hình
- danh sách conversation phía dưới
- row conversation hiển thị:
  - title
  - last message
  - unread badge
  - status badge
  - time

### Chat Detail

- header: tên support/agent + subtitle trạng thái
- status banner:
  - `waiting for support`
  - `agent assigned`
  - `resolved`
- message list:
  - system bubble
  - support bubble
  - customer bubble
  - typing indicator
- composer:
  - text
  - attachment
  - send

### UX States

- empty
- loading
- reconnecting
- no agent available
- resolved
- send failed / retry

## Agent UX

### Queue

Tabs:

- Unassigned
- My Queue
- Pending
- Resolved

Per-row fields:

- customer name
- conversation code
- preview
- waiting time
- status
- unread
- claim action

### Conversation Detail

- header: customer, status, assignee
- side/top metadata:
  - booking context
  - source page
  - SLA age
- timeline
- actions:
  - claim
  - reassign
  - mark pending
  - resolve

## Core Data Model

### users

- `id`
- `role` = `customer|agent|admin`
- `full_name`
- `email`
- `avatar_url`
- `is_active`
- timestamps

### conversations

- `id`
- `customer_id`
- `current_agent_id`
- `status` = `waiting_agent|open|pending|resolved|closed`
- `priority`
- `last_message_id`
- `last_message_preview`
- `last_message_at`
- `unread_for_customer`
- `unread_for_agents`
- `created_at`
- `updated_at`
- `resolved_at`

Constraint:

- unique active conversation per customer:
  - one row where status in `waiting_agent|open|pending`

### conversation_assignments

- `id`
- `conversation_id`
- `agent_id`
- `assigned_by`
- `assignment_type` = `auto|manual|takeover`
- `started_at`
- `ended_at`
- `is_current`

### messages

- `id`
- `conversation_id`
- `sender_id`
- `sender_role` = `customer|agent|system`
- `type` = `text|image|file|system`
- `body`
- `attachments`
- `client_message_id`
- `reply_to_message_id`
- `created_at`
- `edited_at`
- `deleted_at`

Idempotency:

- unique `(conversation_id, sender_id, client_message_id)` when `client_message_id` is not null

### message_receipts

- `id`
- `message_id`
- `recipient_id`
- `delivered_at`
- `read_at`

### conversation_events

- `id`
- `conversation_id`
- `type`
- `actor_id`
- `payload`
- `created_at`

## REST API Design

### Customer

- `POST /api/support/conversations`
  - create or return active conversation
- `GET /api/support/conversations`
  - list customer conversations
- `GET /api/support/conversations/:id`
  - get conversation metadata
- `GET /api/support/conversations/:id/messages?cursor=...`
  - paginated messages
- `POST /api/support/conversations/:id/messages`
  - HTTP fallback send
- `POST /api/support/conversations/:id/read`
- `POST /api/support/conversations/:id/reopen`

### Agent

- `GET /api/support/queue?status=...`
- `POST /api/support/conversations/:id/claim`
- `POST /api/support/conversations/:id/reassign`
- `POST /api/support/conversations/:id/status`
- `GET /api/support/agents/availability`

## WebSocket Design

### Rooms

- `user:{userId}`
- `agent:{agentId}`
- `conversation:{conversationId}`
- `support:queue`

### Client -> Server

- `auth:identify`
- `conversation:join`
- `conversation:leave`
- `message:send`
- `typing:start`
- `typing:stop`
- `message:read`
- `conversation:claim`
- `conversation:status:update`

### Server -> Client

- `conversation:snapshot`
- `message:ack`
- `message:new`
- `message:delivered`
- `message:read`
- `typing:update`
- `conversation:assigned`
- `conversation:status`
- `queue:update`
- `presence:update`
- `error:event`

## Message Lifecycle

```text
Customer app
  -> message:send
Realtime Gateway
  -> validate JWT + membership
  -> persist to DB
  -> update conversation summary/unread
  -> emit message:ack to sender
  -> emit message:new to conversation room
  -> emit queue:update to support dashboard

Agent app
  -> receives message:new
  -> opens conversation
  -> emits message:read
Gateway
  -> updates receipts
  -> emits message:read to customer

Agent reply
  -> message:send
Gateway
  -> persist
  -> unread_for_customer += 1
  -> emit message:new to customer room
```

## Assignment Logic

### Auto Assign

When first customer message enters an unassigned conversation:

1. query available online agents
2. exclude agents over capacity
3. sort by:
   - lowest active count
   - oldest last assignment
   - optional skill match
4. write `conversation_assignments`
5. update `current_agent_id`
6. emit `conversation:assigned`

### Manual Claim

Agent can claim unassigned conversation:

1. lock conversation row
2. ensure current state is claimable
3. create assignment
4. emit queue update + conversation assigned

## Edge Cases

### Agent disconnect

- keep assignment for grace window
- if timeout exceeded and conversation still active:
  - return to queue
  - notify supervisor

### No available agent

- keep status `waiting_agent`
- show waiting banner to customer
- queue remains visible for manual claim

### Reconnection

- client reconnects
- emits `auth:identify`
- rejoins rooms
- server sends snapshot + missed messages after `last_seen_message_id`

### Message retry

- client retries with same `client_message_id`
- backend dedupes via unique constraint
- return canonical stored message

### Duplicate prevention

- idempotency at DB level
- UI replaces pending message with confirmed message by `client_message_id`

## Scaling

### Minimum production deployment

- `HV-Travel API` on Vercel
- `support-realtime` Node.js app on Render/Railway/Fly
- shared PostgreSQL
- shared Redis

### Why split

- REST workloads fit Vercel very well
- long-lived socket coordination belongs on a persistent Node process
- clean operational boundary for queue/presence/socket fanout

## Suggested Repos/Services

### Keep in `HV-Travel API`

- auth
- customer/agent REST APIs
- conversation CRUD
- assignment service
- DB access layer

### New service: `hv-travel-support-realtime`

- Socket.IO gateway
- room join/auth
- typing/read/delivery events
- Redis adapter
- queue event fanout

## Delivery Sequence

1. Add DB schema and REST support endpoints in `HV-Travel API`
2. Build support inbox/chat UI in React Native against REST
3. Add external realtime gateway
4. Add typing/read receipts
5. Add auto-assign and supervisor tools
