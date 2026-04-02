import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../config/db.js";
import { logInfo } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../migrations");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions(client) {
  const result = await client.query("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((row) => row.version));
}

async function loadMigrations() {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (file) => ({
      version: file.replace(/\.sql$/i, ""),
      sql: await fs.readFile(path.join(migrationsDir, file), "utf8")
    }))
  );
}

async function applyMigration(client, migration) {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query(
      `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
      [migration.version]
    );
    await client.query("COMMIT");
    logInfo("Database migration applied", { version: migration.version });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations() {
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const [appliedVersions, migrations] = await Promise.all([
      getAppliedVersions(client),
      loadMigrations()
    ]);

    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        await applyMigration(client, migration);
      }
    }

    logInfo("Database migrations ensured", {
      migrationCount: migrations.length
    });
  } finally {
    client.release();
  }
}

export async function runMigrationsWithRetry(options = {}) {
  const attempts = options.attempts || 10;
  const delayMs = options.delayMs || 3000;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runMigrations();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        logInfo("Database not ready yet, retrying migrations", { attempt, attempts, delayMs });
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}