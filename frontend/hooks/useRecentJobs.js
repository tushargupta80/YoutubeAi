import { useCallback, useEffect, useMemo, useState } from "react";
import { getRecentJobs } from "@/services/api";

export function useRecentJobs({ limit = 8, autoLoad = true } = {}) {
  const [jobs, setJobs] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(autoLoad);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(async ({ append = false, before = null, status = null } = {}) => {
    const response = await getRecentJobs({ limit, before, status });
    setJobs((current) => append ? [...current, ...(response.jobs || [])] : (response.jobs || []));
    setNextCursor(response.nextCursor || null);
    setHasMore(Boolean(response.hasMore));
    return response;
  }, [limit]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      return await loadPage();
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return null;
    setLoadingMore(true);
    setError("");
    try {
      return await loadPage({ append: true, before: nextCursor });
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    } finally {
      setLoadingMore(false);
    }
  }, [loadPage, loadingMore, nextCursor]);

  useEffect(() => {
    if (!autoLoad) return;
    refresh().catch(() => {});
  }, [autoLoad, refresh]);

  const recentJob = useMemo(() => jobs[0] || null, [jobs]);

  return {
    jobs,
    recentJob,
    nextCursor,
    hasMore,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    setJobs,
    setError
  };
}
