import { useCallback, useEffect, useState } from "react";
import { getJob } from "@/services/api";

function isTerminalStatus(status) {
  return status === "completed" || status === "failed";
}

export function useJobStatus({ pollIntervalMs = 2500, onJobUpdated } = {}) {
  const [job, setJob] = useState(null);
  const [jobId, setJobId] = useState("");
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState("");

  const applyJob = useCallback((nextJob) => {
    setJob(nextJob || null);
    setJobId(nextJob?.id || nextJob?.jobId || "");
    if (nextJob) {
      onJobUpdated?.(nextJob);
    }
    return nextJob;
  }, [onJobUpdated]);

  const refreshJob = useCallback(async (targetJobId = jobId) => {
    if (!targetJobId) return null;
    const response = await getJob(targetJobId);
    applyJob(response);
    return response;
  }, [applyJob, jobId]);

  const startTracking = useCallback((initialJob) => {
    setError("");
    return applyJob(initialJob);
  }, [applyJob]);

  useEffect(() => {
    if (!jobId || isTerminalStatus(job?.status)) {
      setIsPolling(false);
      return undefined;
    }

    setIsPolling(true);
    const interval = setInterval(async () => {
      try {
        setError("");
        await refreshJob(jobId);
      } catch (requestError) {
        setError(requestError.message);
      }
    }, pollIntervalMs);

    return () => {
      setIsPolling(false);
      clearInterval(interval);
    };
  }, [job?.status, jobId, pollIntervalMs, refreshJob]);

  return {
    job,
    jobId,
    isPolling,
    error,
    startTracking,
    refreshJob,
    setJob: applyJob,
    clearJob() {
      setJob(null);
      setJobId("");
      setError("");
    }
  };
}
