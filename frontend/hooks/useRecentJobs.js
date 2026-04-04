import { useCallback, useEffect, useMemo, useState } from "react";
import { getRecentJobs } from "@/services/api";

const EMPTY_RESPONSE = {
  jobs: [],
  nextCursor: null,
  hasMore: false
};

export function useRecentJobs({ limit = 8, autoLoad = true, initialData = null } = {}) {
  const seeded = initialData || EMPTY_RESPONSE;
  const [jobs, setJobs] = useState(seeded.jobs || []);
  const [nextCursor, setNextCursor] = useState(seeded.nextCursor || null);
  const [hasMore, setHasMore] = useState(Boolean(seeded.hasMore));
  const [loading, setLoading] = useState(autoLoad && !(seeded.jobs || []).length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const next = initialData || EMPTY_RESPONSE;
    setJobs(next.jobs || []);
    setNextCursor(next.nextCursor || null);
    setHasMore(Boolean(next.hasMore));
    setLoading(autoLoad && !(next.jobs || []).length);
  }, [autoLoad, initialData]);

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
    if (!autoLoad || (initialData?.jobs || []).length) return;
    refresh().catch(() => {});
  }, [autoLoad, initialData, refresh]);

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
