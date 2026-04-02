import { env } from "../config/env.js";
import { getUserSessionVersionById } from "../services/auth.repository.js";
import { verifyToken } from "../utils/auth.js";

function getCookieValue(req, name) {
  const cookieHeader = req.headers.cookie || "";
  if (!cookieHeader) return "";

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return "";
}

function getBearerToken(authHeader) {
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

export function getCookieToken(req, name) {
  return getCookieValue(req, name);
}

function getAccessToken(req) {
  const authHeader = req.headers.authorization || "";
  return getCookieValue(req, env.authCookieName) || getBearerToken(authHeader);
}

async function authenticateRequest(req) {
  const token = getAccessToken(req);
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  const currentSessionVersion = await getUserSessionVersionById(payload.sub);
  if (currentSessionVersion == null) {
    throw new Error("Invalid session");
  }

  const tokenSessionVersion = Number(payload.sv || 1);
  if (tokenSessionVersion !== Number(currentSessionVersion)) {
    throw new Error("Session expired");
  }

  return {
    ...payload,
    role: payload.role || "user"
  };
}

export async function requireAuth(req, res, next) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required", requestId: req.id });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token", requestId: req.id });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const user = await authenticateRequest(req);
    if (user) {
      req.user = user;
    }
    return next();
  } catch {
    return next();
  }
}

export function requireRole(...allowedRoles) {
  return function roleMiddleware(req, res, next) {
    const userRole = req.user?.role || "user";
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Forbidden", requestId: req.id });
    }
    return next();
  };
}

export const requireAdmin = requireRole("admin");
