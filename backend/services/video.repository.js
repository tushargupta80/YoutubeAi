import { query } from "../config/db.js";

export async function upsertVideo({ youtubeUrl, videoId, title, transcript, transcriptItems, cleanedTranscript, durationSeconds }) {
  const result = await query(
    `INSERT INTO videos (youtube_url, youtube_video_id, title, transcript, transcript_items, cleaned_transcript, duration_seconds)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     ON CONFLICT (youtube_url)
     DO UPDATE SET
       title = EXCLUDED.title,
       transcript = COALESCE(EXCLUDED.transcript, videos.transcript),
       transcript_items = COALESCE(EXCLUDED.transcript_items, videos.transcript_items),
       cleaned_transcript = COALESCE(EXCLUDED.cleaned_transcript, videos.cleaned_transcript),
       duration_seconds = COALESCE(EXCLUDED.duration_seconds, videos.duration_seconds),
       updated_at = NOW()
     RETURNING *`,
    [
      youtubeUrl,
      videoId || null,
      title || null,
      transcript || null,
      transcriptItems ? JSON.stringify(transcriptItems) : null,
      cleanedTranscript || null,
      durationSeconds || null
    ]
  );

  return result.rows[0];
}

export async function getVideoById(videoId) {
  const result = await query("SELECT * FROM videos WHERE id = $1", [videoId]);
  return result.rows[0] || null;
}

export async function getVideoByYoutubeUrl(youtubeUrl) {
  const result = await query("SELECT * FROM videos WHERE youtube_url = $1", [youtubeUrl]);
  return result.rows[0] || null;
}

export async function getVideoForUser(videoId, userId) {
  const result = await query(
    `SELECT DISTINCT v.*
     FROM videos v
     INNER JOIN note_jobs nj ON nj.video_id = v.id
     WHERE v.id = $1 AND nj.user_id = $2`,
    [videoId, userId]
  );
  return result.rows[0] || null;
}
