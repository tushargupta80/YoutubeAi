import { randomUUID } from "node:crypto";
import { query } from "../config/db.js";

const JSON_FIELDS = new Set(["notes_json", "flashcards", "quiz"]);

function serializeField(key, value) {
  if (!JSON_FIELDS.has(key)) return value;
  if (value == null) return null;
  return JSON.stringify(value);
}

export async function createNoteJob(videoId, userId) {
  const id = randomUUID();
  await query(
    `INSERT INTO note_jobs (id, video_id, user_id, status, progress, stage)
     VALUES ($1, $2, $3, $4, 5, 'queued')`,
    [id, videoId || null, userId, "queued"]
  );
  return id;
}

export async function deleteNoteJob(id) {
  await query(`DELETE FROM note_jobs WHERE id = $1`, [id]);
}

export async function createCompletedJobFromExisting(sourceJobId, userId) {
  const id = randomUUID();
  const result = await query(
    `INSERT INTO note_jobs (
       id, user_id, video_id, status, progress, stage, error_message,
       notes_markdown, notes_json, flashcards, quiz, generation_provider,
       processing_seconds, created_at, updated_at
     )
     SELECT
       $1, $2, video_id, 'completed', 100, 'reused from existing notes', NULL,
       notes_markdown, notes_json, flashcards, quiz, generation_provider,
       processing_seconds, NOW(), NOW()
     FROM note_jobs
     WHERE id = $3
       AND status = 'completed'
       AND notes_markdown IS NOT NULL
     RETURNING id`,
    [id, userId, sourceJobId]
  );

  return result.rows[0]?.id || null;
}

export async function updateNoteJob(id, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) return;

  const sets = [];
  const values = [];
  let index = 1;

  for (const [key, value] of entries) {
    sets.push(`${key} = $${index}`);
    values.push(serializeField(key, value));
    index += 1;
  }

  values.push(id);
  await query(`UPDATE note_jobs SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${index}`, values);
}

export async function getNoteJobRecord(id) {
  const result = await query(
    `SELECT nj.*, v.youtube_url, v.youtube_video_id, v.title AS video_title
     FROM note_jobs nj
     LEFT JOIN videos v ON v.id = nj.video_id
     WHERE nj.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function getNoteJob(id, userId) {
  const result = await query(
    `SELECT nj.*, v.youtube_url, v.youtube_video_id, v.title AS video_title
     FROM note_jobs nj
     LEFT JOIN videos v ON v.id = nj.video_id
     WHERE nj.id = $1 AND nj.user_id = $2`,
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function findReusableNoteJob(videoId, userId) {
  const result = await query(
    `SELECT nj.*, v.youtube_url, v.youtube_video_id, v.title AS video_title
     FROM note_jobs nj
     LEFT JOIN videos v ON v.id = nj.video_id
     WHERE nj.video_id = $1
       AND nj.user_id = $2
       AND (
         nj.status IN ('queued', 'processing')
         OR (nj.status = 'completed' AND nj.notes_markdown IS NOT NULL)
       )
     ORDER BY CASE nj.status
       WHEN 'processing' THEN 0
       WHEN 'queued' THEN 1
       WHEN 'completed' THEN 2
       ELSE 3
     END,
     nj.created_at DESC
     LIMIT 1`,
    [videoId, userId]
  );

  return result.rows[0] || null;
}

export async function findReusableCompletedNoteJobForVideo(videoId) {
  const result = await query(
    `SELECT nj.id, nj.video_id, nj.generation_provider, nj.processing_seconds, nj.created_at,
            v.youtube_url, v.youtube_video_id, v.title AS video_title
     FROM note_jobs nj
     LEFT JOIN videos v ON v.id = nj.video_id
     WHERE nj.video_id = $1
       AND nj.status = 'completed'
       AND nj.notes_markdown IS NOT NULL
     ORDER BY nj.created_at DESC
     LIMIT 1`,
    [videoId]
  );

  return result.rows[0] || null;
}

export async function listOpenNoteJobsForRecovery(limit = 100) {
  const normalizedLimit = Math.min(Math.max(Number(limit || 100), 1), 500);
  const result = await query(
    `SELECT nj.id, nj.user_id, nj.video_id, nj.status, nj.progress, nj.stage, nj.updated_at,
            v.youtube_url, v.youtube_video_id, v.title AS video_title
     FROM note_jobs nj
     LEFT JOIN videos v ON v.id = nj.video_id
     WHERE nj.status IN ('queued', 'processing')
     ORDER BY nj.updated_at ASC
     LIMIT $1`,
    [normalizedLimit]
  );

  return result.rows;
}

export async function listRecentNoteJobs(userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 12), 1), 50);
  const values = [userId];
  const filters = ["nj.user_id = $1"];

  if (options.before) {
    values.push(options.before);
    filters.push(`nj.created_at < $${values.length}`);
  }

  if (options.status) {
    values.push(options.status);
    filters.push(`nj.status = $${values.length}`);
  }

  values.push(limit + 1);

  const result = await query(
    `SELECT nj.id, nj.status, nj.progress, nj.stage, nj.generation_provider, nj.processing_seconds,
            nj.created_at, nj.updated_at, nj.video_id, nj.notes_markdown,
            v.title AS video_title, v.youtube_url, v.youtube_video_id
     FROM note_jobs nj
     LEFT JOIN videos v ON v.id = nj.video_id
     WHERE ${filters.join(" AND ")}
     ORDER BY nj.created_at DESC
     LIMIT $${values.length}`,
    values
  );

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const jobs = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? jobs.at(-1)?.created_at || null : null;

  return {
    jobs,
    nextCursor,
    hasMore
  };
}

export async function saveQuestionLog(userId, videoId, question, answerMarkdown) {
  await query(
    `INSERT INTO question_logs (user_id, video_id, question, answer_markdown)
     VALUES ($1, $2, $3, $4)`,
    [userId, videoId, question, answerMarkdown]
  );
}
