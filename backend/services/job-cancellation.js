import { JobStatus } from "../models/job-status.js";
import { getNoteJobRecord, updateNoteJob } from "./notes.repository.js";

const CANCELLED_MESSAGE = "Cancelled by user";

export class JobCancelledError extends Error {
  constructor(message = CANCELLED_MESSAGE) {
    super(message);
    this.name = "JobCancelledError";
    this.code = "JOB_CANCELLED";
  }
}

export function isCancelledJobRecord(job) {
  return job?.stage === "cancelled" || job?.error_message === CANCELLED_MESSAGE;
}

export function isJobCancelledError(error) {
  return error?.code === "JOB_CANCELLED" || error?.name === "JobCancelledError";
}

export async function markJobCancelled(jobId) {
  await updateNoteJob(jobId, {
    status: JobStatus.FAILED,
    stage: "cancelled",
    error_message: CANCELLED_MESSAGE,
    progress: 100
  });
}

export async function throwIfJobCancelled(jobId) {
  const job = await getNoteJobRecord(jobId);
  if (isCancelledJobRecord(job)) {
    throw new JobCancelledError();
  }
}
