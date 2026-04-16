# HV Travel Support Realtime

Standalone Socket.IO gateway for the HV Travel support chat flow.

This service is intentionally separate from `HV-Travel API` because the API is deployed on Vercel and should keep REST, auth, and conversation state there while realtime sockets run on a persistent Node host.

## What this scaffold provides

- JWT handshake for customers and agents
- Room model for `user`, `agent`, and `conversation`
- Join / leave room events
- Message send, typing, and read-receipt event skeletons
- In-memory conversation store for local development
- Optional Redis adapter hook for horizontal scale

## Local run

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file:

```bash
copy .env.example .env
```

3. Start the service:

```bash
npm start
```

Default port is `4100`.

## Socket auth contract

Pass the customer or agent access token in the Socket.IO handshake:

```ts
io(SOCKET_URL, {
  auth: {
    token: accessToken,
    clientType: "customer"
  }
});
```

Accepted token sources:
- `socket.handshake.auth.token`
- `socket.handshake.auth.accessToken`
- `Authorization: Bearer <token>`

## Rooms

- `user:<userId>`
- `agent:<agentId>`
- `conversation:<conversationId>`
- `support:queue`

## Events

Client to server:
- `auth:identify`
- `conversation:join`
- `conversation:leave`
- `message:send`
- `typing:start`
- `typing:stop`
- `message:read`
- `conversation:claim`
- `conversation:status:update`

Server to client:
- `auth:ready`
- `conversation:snapshot`
- `message:ack`
- `message:new`
- `typing:update`
- `message:read`
- `conversation:assigned`
- `conversation:status`
- `queue:update`
- `error:event`

## Redis adapter

Set `ENABLE_REDIS_ADAPTER=true` and `REDIS_URL` to enable the Redis adapter hook.

If Redis packages are missing or Redis is unavailable, the server still runs in single-instance mode.

## Next step

Wire this gateway to the Vercel REST API and a persisted chat store.
