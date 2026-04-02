import { Queue, QueueEvents } from "bullmq";
import { redis } from "../config/redis.js";

export const INGEST_QUEUE_NAME = "notes-ingest";
export const EMBEDDING_QUEUE_NAME = "notes-embed";
export const NOTES_QUEUE_NAME = "notes-generation";
export const QA_QUEUE_NAME = "notes-qa";

const defaultJobOptions = {
  attempts: 2,
  removeOnComplete: 100,
  removeOnFail: 100
};

export const ingestQueue = new Queue(INGEST_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions
});

export const embeddingQueue = new Queue(EMBEDDING_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions
});

export const notesQueue = new Queue(NOTES_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions
});

export const qaQueue = new Queue(QA_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions
});

export const qaQueueEvents = new QueueEvents(QA_QUEUE_NAME, {
  connection: redis
});

const allQueues = [
  { name: INGEST_QUEUE_NAME, queue: ingestQueue },
  { name: EMBEDDING_QUEUE_NAME, queue: embeddingQueue },
  { name: NOTES_QUEUE_NAME, queue: notesQueue },
  { name: QA_QUEUE_NAME, queue: qaQueue }
];

function buildStageJobId(jobId, stage) {
  return `${jobId}__${stage}`;
}

function getQueueByName(queueName) {
  return allQueues.find((entry) => entry.name === queueName)?.queue || null;
}

export async function enqueueIngestPipelineJob(data) {
  return ingestQueue.add("ingest-video", data, {
    jobId: buildStageJobId(data.jobId, "ingest")
  });
}

export async function enqueueEmbeddingPipelineJob(data) {
  return embeddingQueue.add("embed-video", data, {
    jobId: buildStageJobId(data.jobId, "embed")
  });
}

export async function enqueueNotesPipelineJob(data) {
  return notesQueue.add("generate-final-notes", data, {
    jobId: buildStageJobId(data.jobId, "notes")
  });
}

async function getPipelineStageJob(queue, queueJobId) {
  return queue.getJob(queueJobId);
}

async function getPipelineStageState(queue, queueJobId) {
  const job = await getPipelineStageJob(queue, queueJobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  return {
    id: job.id,
    state,
    name: job.name
  };
}

async function cancelPipelineStage(queue, queueJobId) {
  const job = await getPipelineStageJob(queue, queueJobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();

  if (["waiting", "delayed", "prioritized", "paused"].includes(state)) {
    await job.remove();
    return { id: job.id, state, removed: true };
  }

  if (state === "active") {
    await job.discard();
    return { id: job.id, state, removed: false };
  }

  return { id: job.id, state, removed: false };
}

export async function cancelPipelineJobs(jobId) {
  const [ingest, embed, notes] = await Promise.all([
    cancelPipelineStage(ingestQueue, buildStageJobId(jobId, "ingest")),
    cancelPipelineStage(embeddingQueue, buildStageJobId(jobId, "embed")),
    cancelPipelineStage(notesQueue, buildStageJobId(jobId, "notes"))
  ]);

  return { ingest, embed, notes };
}

export async function getPipelineJobSnapshot(jobId) {
  const [ingest, embed, notes] = await Promise.all([
    getPipelineStageState(ingestQueue, buildStageJobId(jobId, "ingest")),
    getPipelineStageState(embeddingQueue, buildStageJobId(jobId, "embed")),
    getPipelineStageState(notesQueue, buildStageJobId(jobId, "notes"))
  ]);

  return { ingest, embed, notes };
}

export function hasLivePipelineJob(snapshot) {
  return [snapshot?.ingest, snapshot?.embed, snapshot?.notes]
    .filter(Boolean)
    .some((job) => ["waiting", "active", "delayed", "prioritized"].includes(job.state));
}

export async function replayQueueJob({ queueName, jobName, payload }) {
  const queue = getQueueByName(queueName);
  if (!queue) {
    throw new Error(`Unknown queue: ${queueName}`);
  }

  if (!jobName) {
    throw new Error("Dead-letter job is missing a job name");
  }

  return queue.add(jobName, payload || {}, {
    attempts: 2,
    removeOnComplete: 100,
    removeOnFail: 100
  });
}

export async function getQueueObservabilitySnapshot() {
  const snapshots = await Promise.all(allQueues.map(async ({ name, queue }) => {
    const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
    return {
      name,
      counts,
      backlog: Number(counts.waiting || 0) + Number(counts.delayed || 0),
      inFlight: Number(counts.active || 0),
      completed: Number(counts.completed || 0),
      failed: Number(counts.failed || 0),
      paused: Number(counts.paused || 0)
    };
  }));

  return {
    queues: snapshots,
    totals: snapshots.reduce((accumulator, snapshot) => {
      accumulator.backlog += snapshot.backlog;
      accumulator.inFlight += snapshot.inFlight;
      accumulator.completed += snapshot.completed;
      accumulator.failed += snapshot.failed;
      accumulator.paused += snapshot.paused;
      return accumulator;
    }, {
      backlog: 0,
      inFlight: 0,
      completed: 0,
      failed: 0,
      paused: 0
    })
  };
}
