import {
  createRefreshSession,
  createUser,
  getRefreshSessionByTokenHash,
  getUserByEmail,
  getUserById,
  incrementUserSessionVersion,
  listUserRefreshSessions,
  revokeAllRefreshSessionsForUser,
  revokeRefreshSessionById,
  revokeRefreshSessionByTokenHash,
  rotateRefreshSession
} from "../services/auth.repository.js";
import { getBillingSummary, grantStarterCredits } from "../services/billing.service.js";
import { getAdminOverview } from "../services/admin.repository.js";
import { listRecentNoteJobs } from "../services/notes.repository.js";
import { buildRuntimeSettings } from "./settings.controller.js";
import { env } from "../config/env.js";
import { getCookieToken } from "../middleware/auth.js";
import { createOpaqueToken, hashOpaqueToken, hashPassword, signToken, verifyPassword } from "../utils/auth.js";

function buildAccessTokenPayload(user) {
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role || "user",
    sv: user.session_version || 1,
    exp: Math.floor(Date.now() / 1000) + env.authAccessTokenTtlSeconds
  };
}

function buildBaseCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    maxAge,
    path: "/",
    ...(env.authCookieDomain ? { domain: env.authCookieDomain } : {})
  };
}

function setSessionCookies(res, accessToken, refreshToken) {
  res.cookie(env.authCookieName, accessToken, buildBaseCookieOptions(env.authCookieMaxAgeMs));
  res.cookie(env.authRefreshCookieName, refreshToken, buildBaseCookieOptions(env.authRefreshTokenMaxAgeMs));
}

function clearSessionCookies(res) {
  const baseOptions = {
    httpOnly: true,
    secure: env.authCookieSecure,
    sameSite: env.authCookieSameSite,
    path: "/",
    ...(env.authCookieDomain ? { domain: env.authCookieDomain } : {})
  };
  res.clearCookie(env.authCookieName, baseOptions);
  res.clearCookie(env.authRefreshCookieName, baseOptions);
}

function buildSessionUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || "user"
  };
}

function buildAuthResponse(user) {
  return { user: buildSessionUser(user) };
}

async function buildWorkspaceBootstrapPayload(user, req) {
  const refreshToken = getCookieToken(req, env.authRefreshCookieName);
  const currentTokenHash = refreshToken ? hashOpaqueToken(refreshToken) : "";

  const [sessions, billing, recentJobs, overview] = await Promise.all([
    listUserRefreshSessions(user.id, currentTokenHash, 12),
    getBillingSummary(user.id),
    listRecentNoteJobs(user.id, { limit: 8 }),
    user.role === "admin" ? getAdminOverview({ limit: 6 }) : Promise.resolve(null)
  ]);

  return {
    user: buildSessionUser(user),
    settings: {
      ai: buildRuntimeSettings()
    },
    sessions,
    billing,
    recentJobs,
    overview
  };
}

async function issueSession(user, req, replaceSessionId = "") {
  const refreshToken = createOpaqueToken();
  const refreshSession = await createRefreshSession({
    userId: user.id,
    tokenHash: hashOpaqueToken(refreshToken),
    expiresAt: new Date(Date.now() + env.authRefreshTokenMaxAgeMs),
    userAgent: req.headers["user-agent"] || "",
    ipAddress: req.ip || req.headers["x-forwarded-for"] || ""
  });

  if (replaceSessionId) {
    await rotateRefreshSession(replaceSessionId, refreshSession.id);
  }

  return {
    accessToken: signToken(buildAccessTokenPayload(user)),
    refreshToken
  };
}

async function revokeRefreshTokenFromRequest(req) {
  const refreshToken = getCookieToken(req, env.authRefreshCookieName);
  if (!refreshToken) {
    return null;
  }

  const refreshTokenHash = hashOpaqueToken(refreshToken);
  await revokeRefreshSessionByTokenHash(refreshTokenHash);
  return refreshTokenHash;
}

export async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }

    const user = await createUser({
      email,
      passwordHash: hashPassword(password),
      name
    });

    await grantStarterCredits(user.id);

    const response = buildAuthResponse(user);
    const session = await issueSession(user, req);
    setSessionCookies(res, session.accessToken, session.refreshToken);
    return res.status(201).json(response);
  } catch (error) {
    return next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const response = buildAuthResponse(user);
    const session = await issueSession(user, req);
    setSessionCookies(res, session.accessToken, session.refreshToken);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const refreshToken = getCookieToken(req, env.authRefreshCookieName);
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required", requestId: req.id });
    }

    const refreshSession = await getRefreshSessionByTokenHash(hashOpaqueToken(refreshToken));
    if (!refreshSession || refreshSession.revoked_at || new Date(refreshSession.expires_at).getTime() <= Date.now()) {
      clearSessionCookies(res);
      return res.status(401).json({ error: "Invalid or expired refresh token", requestId: req.id });
    }

    const user = await getUserById(refreshSession.user_id);
    if (!user || Number(user.session_version || 1) !== Number(refreshSession.session_version || 1)) {
      clearSessionCookies(res);
      return res.status(401).json({ error: "Session expired. Please sign in again.", requestId: req.id });
    }

    const session = await issueSession(user, req, refreshSession.id);
    setSessionCookies(res, session.accessToken, session.refreshToken);
    return res.json({
      ok: true,
      user: buildSessionUser(user)
    });
  } catch (error) {
    return next(error);
  }
}

export async function logout(req, res, next) {
  try {
    await revokeRefreshTokenFromRequest(req);
    clearSessionCookies(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

export async function logoutAll(req, res, next) {
  try {
    await revokeAllRefreshSessionsForUser(req.user.sub);
    await incrementUserSessionVersion(req.user.sub);
    clearSessionCookies(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

export async function listSessions(req, res, next) {
  try {
    const refreshToken = getCookieToken(req, env.authRefreshCookieName);
    const currentTokenHash = refreshToken ? hashOpaqueToken(refreshToken) : "";
    const sessions = await listUserRefreshSessions(req.user.sub, currentTokenHash, 12);
    return res.json({ sessions });
  } catch (error) {
    return next(error);
  }
}

export async function revokeSession(req, res, next) {
  try {
    const revoked = await revokeRefreshSessionById(req.params.sessionId, req.user.sub);
    if (!revoked) {
      return res.status(404).json({ error: "Session not found" });
    }

    const refreshToken = getCookieToken(req, env.authRefreshCookieName);
    const currentTokenHash = refreshToken ? hashOpaqueToken(refreshToken) : "";
    const sessions = await listUserRefreshSessions(req.user.sub, currentTokenHash, 12);
    return res.json({ ok: true, sessions });
  } catch (error) {
    return next(error);
  }
}

export async function me(req, res, next) {
  try {
    const user = await getUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}

export async function bootstrap(req, res, next) {
  try {
    const user = await getUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const payload = await buildWorkspaceBootstrapPayload(user, req);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}
