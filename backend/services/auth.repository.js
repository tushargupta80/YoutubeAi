import { env } from "../config/env.js";
import { query } from "../config/db.js";

function resolveRole(email) {
  const normalizedEmail = String(email || "").toLowerCase();
  return env.adminEmails.includes(normalizedEmail) ? "admin" : "user";
}

export async function createUser({ email, passwordHash, name }) {
  const normalizedEmail = email.toLowerCase();
  const role = resolveRole(normalizedEmail);
  const result = await query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role, session_version, created_at`,
    [normalizedEmail, passwordHash, name || null, role]
  );
  return result.rows[0];
}

export async function getUserByEmail(email) {
  const result = await query(
    `SELECT * FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0] || null;
}

export async function getUserById(id) {
  const result = await query(
    `SELECT id, email, name, role, session_version, created_at FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getUserSessionVersionById(id) {
  const result = await query(
    `SELECT session_version FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0]?.session_version ?? null;
}

export async function incrementUserSessionVersion(id) {
  const result = await query(
    `UPDATE users
     SET session_version = session_version + 1
     WHERE id = $1
     RETURNING session_version`,
    [id]
  );
  return result.rows[0]?.session_version ?? null;
}

export async function createRefreshSession({ userId, tokenHash, expiresAt, userAgent, ipAddress }) {
  const result = await query(
    `INSERT INTO user_refresh_sessions (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, token_hash, expires_at, revoked_at, replaced_by_session_id, created_at, last_used_at`,
    [userId, tokenHash, expiresAt, userAgent || null, ipAddress || null]
  );
  return result.rows[0] || null;
}

export async function getRefreshSessionByTokenHash(tokenHash) {
  const result = await query(
    `SELECT
       s.id,
       s.user_id,
       s.token_hash,
       s.expires_at,
       s.revoked_at,
       s.replaced_by_session_id,
       s.created_at,
       s.last_used_at,
       s.user_agent,
       s.ip_address,
       u.email,
       u.name,
       u.role,
       u.session_version
     FROM user_refresh_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

export async function listUserRefreshSessions(userId, currentTokenHash = "", limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit || 10), 1), 50);
  const result = await query(
    `SELECT id, user_id, user_agent, ip_address, created_at, last_used_at, expires_at,
            revoked_at, replaced_by_session_id,
            CASE WHEN token_hash = $2 THEN TRUE ELSE FALSE END AS is_current
     FROM user_refresh_sessions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, currentTokenHash || "", safeLimit]
  );
  return result.rows;
}

export async function listRecentRefreshSessions(limit = 12) {
  const safeLimit = Math.min(Math.max(Number(limit || 12), 1), 50);
  const result = await query(
    `SELECT s.id, s.user_id, s.user_agent, s.ip_address, s.created_at, s.last_used_at,
            s.expires_at, s.revoked_at,
            u.email AS user_email, u.name AS user_name, u.role AS user_role
     FROM user_refresh_sessions s
     JOIN users u ON u.id = s.user_id
     ORDER BY s.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

export async function markRefreshSessionUsed(id) {
  await query(
    `UPDATE user_refresh_sessions
     SET last_used_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

export async function rotateRefreshSession(sessionId, replacedBySessionId) {
  await query(
    `UPDATE user_refresh_sessions
     SET revoked_at = NOW(),
         replaced_by_session_id = $2
     WHERE id = $1
       AND revoked_at IS NULL`,
    [sessionId, replacedBySessionId]
  );
}

export async function revokeRefreshSessionByTokenHash(tokenHash) {
  await query(
    `UPDATE user_refresh_sessions
     SET revoked_at = NOW()
     WHERE token_hash = $1
       AND revoked_at IS NULL`,
    [tokenHash]
  );
}

export async function revokeRefreshSessionById(sessionId, userId = null) {
  const values = [sessionId];
  let userFilter = "";
  if (userId) {
    values.push(userId);
    userFilter = ` AND user_id = $${values.length}`;
  }

  const result = await query(
    `UPDATE user_refresh_sessions
     SET revoked_at = NOW()
     WHERE id = $1
       AND revoked_at IS NULL${userFilter}
     RETURNING id, user_id`,
    values
  );
  return result.rows[0] || null;
}

export async function revokeAllRefreshSessionsForUser(userId) {
  await query(
    `UPDATE user_refresh_sessions
     SET revoked_at = NOW()
     WHERE user_id = $1
       AND revoked_at IS NULL`,
    [userId]
  );
}
