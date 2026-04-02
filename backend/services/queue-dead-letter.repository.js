import { query } from "../config/db.js";

export async function insertQueueDeadLetter({
  queueName,
  workerName,
  bullJobId,
  jobName,
  notesJobId,
  attemptsMade,
  maxAttempts,
  errorMessage,
  payload
}) {
  await query(
    `INSERT INTO queue_dead_letters (
       queue_name, worker_name, bull_job_id, job_name, notes_job_id,
       attempts_made, max_attempts, error_message, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      queueName,
      workerName,
      String(bullJobId || ""),
      jobName || null,
      notesJobId || null,
      Number(attemptsMade || 0),
      Number(maxAttempts || 0),
      errorMessage || "",
      payload ? JSON.stringify(payload) : null
    ]
  );
}

export async function listRecentQueueDeadLetters(limit = 20, before = null) {
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
  const values = [];
  const filters = [];

  if (before) {
    values.push(before);
    filters.push(`failed_at < $${values.length}`);
  }

  values.push(safeLimit + 1);

  const result = await query(
    `SELECT id, queue_name, worker_name, bull_job_id, job_name, notes_job_id,
            attempts_made, max_attempts, error_message, payload, failed_at,
            replay_count, last_replayed_at
     FROM queue_dead_letters
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY failed_at DESC
     LIMIT $${values.length}`,
    values
  );

  const rows = result.rows;
  const hasMore = rows.length > safeLimit;
  const items = hasMore ? rows.slice(0, safeLimit) : rows;

  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.failed_at || null : null,
    hasMore
  };
}

export async function getQueueDeadLetterById(id) {
  const result = await query(
    `SELECT id, queue_name, worker_name, bull_job_id, job_name, notes_job_id,
            attempts_made, max_attempts, error_message, payload, failed_at,
            replay_count, last_replayed_at
     FROM queue_dead_letters
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function markQueueDeadLetterReplayed(id) {
  await query(
    `UPDATE queue_dead_letters
     SET replay_count = COALESCE(replay_count, 0) + 1,
         last_replayed_at = NOW()
     WHERE id = $1`,
    [id]
  );
}
