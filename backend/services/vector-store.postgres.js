import { pool, query } from "../config/db.js";
import { env } from "../config/env.js";

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / ((Math.sqrt(magA) * Math.sqrt(magB)) || 1);
}

function toNumberArray(value) {
  if (Array.isArray(value)) return value.map((item) => Number(item));
  return [];
}

function toVectorLiteral(value) {
  return `[${(value || []).map((item) => Number(item)).join(",")}]`;
}

function mapRow(row) {
  return {
    id: row.chunk_id,
    text: row.content,
    startMs: Number(row.start_ms ?? 0),
    endMs: Number(row.end_ms ?? 0),
    embedding: toNumberArray(row.embedding),
    metadata: row.metadata || {}
  };
}

function mapRowsWithScore(rows) {
  return rows.map((row) => ({
    ...mapRow(row),
    score: Number(row.score || 0)
  }));
}

let pgvectorSupportPromise = null;

async function checkPgvectorSupport() {
  const result = await query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'vector_chunks'
        AND column_name = 'embedding_vector'
    ) AS has_embedding_vector,
    EXISTS (
      SELECT 1
      FROM pg_extension
      WHERE extname = 'vector'
    ) AS has_vector_extension
  `);

  const row = result.rows[0] || {};
  return Boolean(row.has_embedding_vector && row.has_vector_extension);
}

async function hasPgvectorSupport() {
  if (!pgvectorSupportPromise) {
    pgvectorSupportPromise = checkPgvectorSupport().catch(() => false);
  }
  return pgvectorSupportPromise;
}

function getAnnCandidateLimit(topK) {
  return Math.max(topK, topK * env.pgvectorSearchCandidateMultiplier);
}

async function runPgvectorTunedQuery(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (env.pgvectorAnnEnabled) {
      if (env.pgvectorAnnIndexType === "ivfflat") {
        await client.query(`SET LOCAL ivfflat.probes = ${Math.max(1, env.pgvectorIvfflatProbes)}`);
      } else {
        await client.query(`SET LOCAL hnsw.ef_search = ${Math.max(1, env.pgvectorHnswEfSearch)}`);
      }
    }

    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors and surface the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresVectorStore {
  async save(videoId, records) {
    await query("DELETE FROM vector_chunks WHERE video_id = $1", [videoId]);
    const pgvectorEnabled = await hasPgvectorSupport();

    for (const record of records) {
      if (pgvectorEnabled) {
        await query(
          `INSERT INTO vector_chunks (video_id, chunk_id, content, start_ms, end_ms, embedding, embedding_vector, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::vector, $8::jsonb)`,
          [
            videoId,
            record.id || null,
            record.text,
            record.startMs ?? null,
            record.endMs ?? null,
            JSON.stringify(record.embedding || []),
            toVectorLiteral(record.embedding || []),
            JSON.stringify({
              order: record.order ?? null,
              source: record.source ?? null
            })
          ]
        );
      } else {
        await query(
          `INSERT INTO vector_chunks (video_id, chunk_id, content, start_ms, end_ms, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
          [
            videoId,
            record.id || null,
            record.text,
            record.startMs ?? null,
            record.endMs ?? null,
            JSON.stringify(record.embedding || []),
            JSON.stringify({
              order: record.order ?? null,
              source: record.source ?? null
            })
          ]
        );
      }
    }
  }

  async list(videoId) {
    const result = await query(
      `SELECT chunk_id, content, start_ms, end_ms, embedding, metadata
       FROM vector_chunks
       WHERE video_id = $1
       ORDER BY start_ms ASC, chunk_id ASC`,
      [videoId]
    );

    return result.rows.map(mapRow);
  }

  async search(videoId, queryEmbedding, topK) {
    if (await hasPgvectorSupport()) {
      try {
        if (env.pgvectorAnnEnabled) {
          const candidateResult = await runPgvectorTunedQuery((client) =>
            client.query(
              `WITH candidates AS (
                 SELECT video_id, chunk_id, content, start_ms, end_ms, embedding, metadata,
                        1 - (embedding_vector <=> $1::vector) AS score
                 FROM vector_chunks
                 WHERE embedding_vector IS NOT NULL
                 ORDER BY embedding_vector <=> $1::vector ASC
                 LIMIT $2
               )
               SELECT chunk_id, content, start_ms, end_ms, embedding, metadata, score
               FROM candidates
               WHERE video_id = $3
               ORDER BY score DESC
               LIMIT $4`,
              [
                toVectorLiteral(queryEmbedding),
                getAnnCandidateLimit(topK),
                videoId,
                topK
              ]
            )
          );

          if (candidateResult.rows.length >= topK) {
            return mapRowsWithScore(candidateResult.rows);
          }
        }

        const exactResult = await runPgvectorTunedQuery((client) =>
          client.query(
            `SELECT chunk_id, content, start_ms, end_ms, embedding, metadata,
                    1 - (embedding_vector <=> $2::vector) AS score
             FROM vector_chunks
             WHERE video_id = $1
               AND embedding_vector IS NOT NULL
             ORDER BY embedding_vector <=> $2::vector ASC
             LIMIT $3`,
            [videoId, toVectorLiteral(queryEmbedding), topK]
          )
        );

        if (exactResult.rows.length) {
          return mapRowsWithScore(exactResult.rows);
        }
      } catch {
        pgvectorSupportPromise = Promise.resolve(false);
      }
    }

    const records = await this.list(videoId);

    return records
      .map((record) => ({
        ...record,
        score: cosineSimilarity(queryEmbedding, record.embedding)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}