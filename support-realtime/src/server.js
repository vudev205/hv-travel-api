import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { authenticateSocket, authenticateSocketPayload } from "./socket/auth.js";
import { registerSupportSocket } from "./socket/events.js";

const app = express();
const server = createServer(app);

const isProduction = process.env.NODE_ENV === "production";
const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const allowedOrigins = String(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => Boolean(origin) && origin !== "*");

const corsOriginValidator = (origin, callback) => {
  if (!origin) {
    return callback(null, true);
  }
  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  if (!isProduction && allowedOrigins.length === 0 && LOCALHOST_ORIGIN_REGEX.test(origin)) {
    return callback(null, true);
  }
  const err = new Error("CORS origin not allowed");
  err.status = 403;
  return callback(err, false);
};

app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
  })
);

app.get("/health", (_, res) => {
  res.json({
    ok: true,
    service: process.env.SERVICE_NAME || "hv-travel-support-realtime",
    now: new Date().toISOString(),
  });
});

app.get("/", (_, res) => {
  res.json({
    ok: true,
    service: process.env.SERVICE_NAME || "hv-travel-support-realtime",
    realtime: "socket.io",
    now: new Date().toISOString(),
  });
});

const io = new Server(server, {
  cors: {
    origin: corsOriginValidator,
    credentials: true,
  },
});

io.use((socket, next) => {
  try {
    socket.data.principal = authenticateSocket(socket);
    next();
  } catch (error) {
    next(error);
  }
});

io.on("connection", (socket) => {
  const principal = socket.data.principal;
  registerSupportSocket(io, socket, principal);

  socket.on("auth:identify", (payload = {}, ack) => {
    try {
      const refreshedPrincipal = authenticateSocketPayload({
        auth: payload,
        headers: socket.handshake.headers,
        clientType: payload?.clientType,
        connectionId: socket.id,
      });

      socket.data.principal = {
        ...refreshedPrincipal,
        connectionId: socket.id,
      };

      if (typeof ack === "function") {
        ack({
          ok: true,
          principal: socket.data.principal,
        });
      }
    } catch (error) {
      if (typeof ack === "function") {
        ack({
          ok: false,
          error: error.message || "Unable to identify socket",
        });
      }
    }
  });
});

async function configureRedisAdapter(targetIo) {
  if (String(process.env.ENABLE_REDIS_ADAPTER || "").toLowerCase() !== "true") {
    return;
  }

  try {
    const [{ createClient }, { createAdapter }] = await Promise.all([
      import("redis"),
      import("@socket.io/redis-adapter"),
    ]);

    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required when ENABLE_REDIS_ADAPTER=true");
    }

    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on("error", (error) => {
      console.warn("[support-realtime] redis pub client error:", error.message);
    });
    subClient.on("error", (error) => {
      console.warn("[support-realtime] redis sub client error:", error.message);
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);
    targetIo.adapter(
      createAdapter(pubClient, subClient, {
        key: process.env.REDIS_CHANNEL_PREFIX || "hv-travel:support",
      })
    );
    console.log("[support-realtime] Redis adapter enabled");
  } catch (error) {
    console.warn(
      "[support-realtime] Redis adapter unavailable, continuing in single-instance mode:",
      error.message
    );
  }
}

configureRedisAdapter(io);

const PORT = Number(process.env.PORT || 4100);

server.listen(PORT, () => {
  console.log(
    `[support-realtime] listening on port ${PORT} (${process.env.SERVICE_NAME || "hv-travel-support-realtime"})`
  );
});

process.on("unhandledRejection", (error) => {
  console.error("[support-realtime] unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("[support-realtime] uncaught exception:", error);
});
