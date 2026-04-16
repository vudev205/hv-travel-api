import jwt from "jsonwebtoken";

const DEFAULT_JWT_SECRET = "HV-Travel-Vip-Pro";

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

const normalizeRole = (rawRole = "") => {
  const value = String(rawRole || "").trim().toLowerCase();
  if (value === "customer") return "customer";
  return "agent";
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

  const jwtSecret = options.jwtSecret || process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
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
