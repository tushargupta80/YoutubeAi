import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

async function ensureDir() {
  await fs.mkdir(env.vectorIndexDir, { recursive: true });
}

function getJsonPath(videoId) {
  return path.join(env.vectorIndexDir, `${videoId}.json`);
}

function getMetaPath(videoId) {
  return path.join(env.vectorIndexDir, `${videoId}.meta.json`);
}

function getIndexPath(videoId) {
  return path.join(env.vectorIndexDir, `${videoId}.index`);
}

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

async function tryLoadFaiss() {
  try {
    return await import("faiss-node");
  } catch {
    return null;
  }
}

export class FaissStore {
  async save(videoId, records) {
    await ensureDir();
    const faiss = await tryLoadFaiss();

    if (faiss?.IndexFlatIP && records.length) {
      const index = new faiss.IndexFlatIP(records[0].embedding.length);
      records.forEach((record) => index.add(record.embedding));
      index.write(getIndexPath(videoId));
      await fs.writeFile(getMetaPath(videoId), JSON.stringify({ records }, null, 2), "utf8");
      return;
    }

    const payload = {
      createdAt: new Date().toISOString(),
      records
    };
    await fs.writeFile(getJsonPath(videoId), JSON.stringify(payload, null, 2), "utf8");
  }

  async list(videoId) {
    const faiss = await tryLoadFaiss();

    if (faiss?.IndexFlatIP) {
      const meta = JSON.parse(await fs.readFile(getMetaPath(videoId), "utf8"));
      return meta.records || [];
    }

    const raw = await fs.readFile(getJsonPath(videoId), "utf8");
    const data = JSON.parse(raw);
    return data.records || [];
  }

  async search(videoId, queryEmbedding, topK) {
    const faiss = await tryLoadFaiss();

    if (faiss?.IndexFlatIP) {
      const index = faiss.IndexFlatIP.read(getIndexPath(videoId));
      const meta = JSON.parse(await fs.readFile(getMetaPath(videoId), "utf8"));
      const searchResult = index.search(queryEmbedding, topK);
      return searchResult.labels
        .map((label, idx) => ({
          ...meta.records[label],
          score: searchResult.distances[idx]
        }))
        .filter(Boolean);
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

export const faissStore = new FaissStore();