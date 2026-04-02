import { query } from "../config/db.js";

export async function insertRequestLog({
  requestId,
  userId = null,
  method,
  path,
  statusCode,
  durationMs,
  ipAddress = null,
  userAgent = null
}) {
  await query(
    `INSERT INTO api_request_logs (
       request_id, user_id, method, path, status_code, duration_ms, ip_address, user_agent
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [requestId, userId, method, path, statusCode, durationMs, ipAddress, userAgent]
  );
}

export async function listRecentRequestLogs(limit = 20, before = null) {
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const values = [];
  const filters = [];

  if (before) {
    values.push(before);
    filters.push(`created_at < $${values.length}`);
  }

  values.push(safeLimit + 1);

  const result = await query(
    `SELECT request_id, user_id, method, path, status_code, duration_ms, ip_address, user_agent, created_at
     FROM api_request_logs
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );

  const rows = result.rows;
  const hasMore = rows.length > safeLimit;
  const logs = hasMore ? rows.slice(0, safeLimit) : rows;

  return {
    logs,
    nextCursor: hasMore ? logs.at(-1)?.created_at || null : null,
    hasMore
  };
}
