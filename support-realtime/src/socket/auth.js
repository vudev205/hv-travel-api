import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const ALLOWED_AGENT_ROLES = new Set(["admin", "manager", "staff"]);
let ephemeralJwtSecret = null;

export function resolveJwtSecret(explicitSecret = "") {
  const configured = String(explicitSecret || process.env.JWT_SECRET || "").trim();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production.");
  }

  if (!ephemeralJwtSecret) {
    ephemeralJwtSecret = crypto.randomBytes(32).toString("hex");
    console.warn(
      "[SECURITY][support-realtime] JWT_SECRET is not set. Generated an ephemeral per-process secret for non-production use."
    );
  }

  return ephemeralJwtSecret;
}

if (process.env.NODE_ENV === "production" && !String(process.env.JWT_SECRET || "").trim()) {
  throw new Error("JWT_SECRET environment variable is required in production.");
}

export class SocketAuthError extends Error {
  constructor(message, statusCode = 401, code = "unauthorized") {
    super(message);
    this.name = "SocketAuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const parseBearerToken = (authorizationHeader = "") => {
  const value = String(authorizationHeader || "").trim();
  if (!value.startsWith("Bearer ")) return "";
  return value.slice("Bearer ".length).trim();
};

export const normalizeRole = (rawRole = "") => {
  const value = String(rawRole || "").trim().toLowerCase();
  if (value === "customer") return "customer";
  if (ALLOWED_AGENT_ROLES.has(value)) return "agent";
  throw new SocketAuthError("Unsupported or unauthorized role", 403, "invalid_role");
};

export const extractHandshakeToken = (source = {}) => {
  const auth = source?.auth ?? source ?? {};
  const headers = source?.headers ?? source?.handshake?.headers ?? {};
  return (
    String(auth?.token ?? "").trim() ||
    String(auth?.accessToken ?? "").trim() ||
    parseBearerToken(auth?.authorization || headers?.authorization)
  );
};

export const authenticateSocketPayload = (payload = {}, options = {}) => {
  const token = extractHandshakeToken(payload);
  if (!token) {
    throw new SocketAuthError("Missing access token", 401, "missing_token");
  }

  const jwtSecret = resolveJwtSecret(options.jwtSecret);
  const jwtIssuer = options.jwtIssuer || process.env.JWT_ISSUER;
  const jwtAudience = options.jwtAudience || process.env.JWT_AUDIENCE;

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret, {
      issuer: jwtIssuer || undefined,
      audience: jwtAudience || undefined,
    });
  } catch (error) {
    throw new SocketAuthError("Invalid or expired token", 401, "token_invalid");
  }

  const userId = String(decoded?.id ?? decoded?.sub ?? "").trim();
  if (!userId) {
    throw new SocketAuthError("Token does not contain a user id", 401, "token_invalid");
  }

  const role = normalizeRole(decoded?.role);
  const clientType = String(payload?.clientType ?? role).trim().toLowerCase() || role;

  return {
    userId,
    role,
    rawRole: String(decoded?.role ?? ""),
    clientType,
    displayName: String(decoded?.fullName ?? decoded?.name ?? decoded?.email ?? "Unknown").trim(),
    email: String(decoded?.email ?? "").trim(),
    sessionId: decoded?.sessionId ? String(decoded.sessionId) : null,
    tokenVersion:
      decoded?.tokenVersion !== undefined && decoded?.tokenVersion !== null
        ? Number(decoded.tokenVersion)
        : null,
    connectionId: String(payload?.connectionId ?? ""),
  };
};

export const authenticateSocket = (socket, options = {}) => {
  const principal = authenticateSocketPayload(
    {
      auth: socket?.handshake?.auth ?? {},
      headers: socket?.handshake?.headers ?? {},
    },
    options
  );

  return {
    ...principal,
    connectionId: socket?.id ?? "",
  };
};

export const isAgentPrincipal = (principal) => principal?.role === "agent";
export const isCustomerPrincipal = (principal) => principal?.role === "customer";
