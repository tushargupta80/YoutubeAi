import pg from "pg";
import { env } from "./env.js";
import { recordDependencyHealth } from "../services/metrics.service.js";

const { Pool } = pg;

function shouldUseSsl(databaseUrl, dbSsl) {
  if (typeof dbSsl === "boolean") return dbSsl;

  try {
    const url = new URL(databaseUrl);
    const host = (url.hostname || "").toLowerCase();
    const localHosts = new Set(["localhost", "127.0.0.1", "postgres"]);
    return !localHosts.has(host);
  } catch {
    return false;
  }
}

const useSsl = shouldUseSsl(env.databaseUrl, env.dbSsl);

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  idleTimeoutMillis: env.dbIdleTimeoutMs,
  connectionTimeoutMillis: env.dbConnectionTimeoutMs,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth() {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    const result = { ok: true, latencyMs: Date.now() - start };
    recordDependencyHealth("postgres", result);
    return result;
  } catch (error) {
    const result = { ok: false, latencyMs: Date.now() - start, error: error.message || "database health failed" };
    recordDependencyHealth("postgres", result);
    throw error;
  }
}

export async function closeDatabase() {
  await pool.end();
}
