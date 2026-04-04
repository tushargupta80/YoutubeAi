import { useCallback, useEffect, useState } from "react";
import {
  adminCancelJob,
  adminReplayDeadLetter,
  adminRevokeSession,
  changePassword as changePasswordRequest,
  createBillingCheckout,
  getAdminOverview,
  getBillingSummary,
  getWorkspaceBootstrap,
  login,
  logout as logoutRequest,
  logoutAll as logoutAllRequest,
  register,
  revokeMySession,
  updateProfile as updateProfileRequest,
  updateUserRole,
  verifyBillingPayment
} from "@/services/api";

let razorpayLoader = null;

function ensureRazorpayLoaded() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay checkout is only available in the browser."));
  }

  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }

  if (razorpayLoader) {
    return razorpayLoader;
  }

  razorpayLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout."));
    document.body.appendChild(script);
  });

  return razorpayLoader;
}

const EMPTY_RECENT_JOBS = {
  jobs: [],
  nextCursor: null,
  hasMore: false
};

export function useWorkspaceSession() {
  const [mode, setMode] = useState("login");
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [billing, setBilling] = useState(null);
  const [overview, setOverview] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [recentJobsBootstrap, setRecentJobsBootstrap] = useState(EMPTY_RECENT_JOBS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [loadingMoreJobs, setLoadingMoreJobs] = useState(false);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState("");
  const [jobCancellingId, setJobCancellingId] = useState("");
  const [sessionRevokingId, setSessionRevokingId] = useState("");
  const [deadLetterReplayingId, setDeadLetterReplayingId] = useState("");
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [purchasingPlanId, setPurchasingPlanId] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const clearWorkspace = useCallback(() => {
    setUser(null);
    setSettings(null);
    setBilling(null);
    setOverview(null);
    setSessions([]);
    setRecentJobsBootstrap(EMPTY_RECENT_JOBS);
  }, []);

  const applyWorkspaceBootstrap = useCallback((payload) => {
    setUser(payload?.user || null);
    setSettings(payload?.settings?.ai || null);
    setBilling(payload?.billing || null);
    setOverview(payload?.overview || null);
    setSessions(payload?.sessions || []);
    setRecentJobsBootstrap(payload?.recentJobs || EMPTY_RECENT_JOBS);
    return payload?.user || null;
  }, []);

  const loadWorkspace = useCallback(async () => {
    const payload = await getWorkspaceBootstrap();
    applyWorkspaceBootstrap(payload);
    return payload;
  }, [applyWorkspaceBootstrap]);

  const refreshBilling = useCallback(async () => {
    const summary = await getBillingSummary();
    setBilling(summary);
    return summary;
  }, []);

  const refreshCurrentUserRole = useCallback(async () => {
    try {
      const payload = await loadWorkspace();
      return payload?.user || null;
    } catch {
      clearWorkspace();
      return null;
    }
  }, [clearWorkspace, loadWorkspace]);

  const handleAdminRequest = useCallback(async (action) => {
    try {
      return await action();
    } catch (requestError) {
      if (requestError?.status === 403) {
        const refreshedUser = await refreshCurrentUserRole();
        if (!refreshedUser || refreshedUser.role !== "admin") {
          setError("Your admin access changed. The admin workspace has been refreshed.");
          return null;
        }
      }
      throw requestError;
    }
  }, [refreshCurrentUserRole]);

  useEffect(() => {
    async function hydrate() {
      try {
        await loadWorkspace();
      } catch {
        clearWorkspace();
      } finally {
        setLoading(false);
      }
    }

    hydrate();
  }, [clearWorkspace, loadWorkspace]);

  const authenticate = useCallback(async ({ mode: nextMode, name, email, password }) => {
    setError("");
    const response = nextMode === "login" ? await login(email, password) : await register(name, email, password);
    await loadWorkspace();
    return response;
  }, [loadWorkspace]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Clear local state even if the network request fails.
    }
    clearWorkspace();
  }, [clearWorkspace]);

  const logoutAll = useCallback(async () => {
    setLoggingOutAll(true);
    setError("");
    try {
      await logoutAllRequest();
      clearWorkspace();
    } finally {
      setLoggingOutAll(false);
    }
  }, [clearWorkspace]);

  const updateProfile = useCallback(async ({ name, avatarUrl, removeAvatar = false }) => {
    setProfileSaving(true);
    setError("");
    try {
      const response = await updateProfileRequest({ name, avatarUrl, removeAvatar });
      setUser(response.user || null);
      await loadWorkspace();
      return response;
    } finally {
      setProfileSaving(false);
    }
  }, [loadWorkspace]);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    setPasswordSaving(true);
    setError("");
    try {
      const response = await changePasswordRequest(currentPassword, newPassword);
      setUser(response.user || null);
      await loadWorkspace();
      return response;
    } finally {
      setPasswordSaving(false);
    }
  }, [loadWorkspace]);

  const purchasePlan = useCallback(async (planId) => {
    if (!planId || purchasingPlanId) return null;
    setPurchasingPlanId(planId);
    setError("");

    try {
      await ensureRazorpayLoaded();
      const payload = await createBillingCheckout(planId);

      return await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
          key: payload.checkout.key,
          amount: payload.checkout.amount,
          currency: payload.checkout.currency,
          name: payload.checkout.name,
          description: payload.checkout.description,
          order_id: payload.checkout.orderId,
          prefill: payload.checkout.prefill,
          notes: payload.checkout.notes,
          theme: { color: "#0f766e" },
          handler: async (response) => {
            try {
              const verified = await verifyBillingPayment(response);
              setBilling(verified.billing);
              resolve(verified.billing);
            } catch (verificationError) {
              reject(verificationError);
            }
          },
          modal: {
            ondismiss: () => resolve(null)
          }
        });

        checkout.open();
      });
    } finally {
      setPurchasingPlanId("");
    }
  }, [purchasingPlanId]);

  const loadMoreUsers = useCallback(async () => {
    if (user?.role !== "admin" || !overview?.recentUsersNextCursor || loadingMoreUsers) return null;
    setLoadingMoreUsers(true);
    setError("");
    try {
      const response = await handleAdminRequest(() => getAdminOverview({ limit: 6, usersBefore: overview.recentUsersNextCursor }));
      if (!response) return null;
      setOverview((current) => ({
        ...current,
        recentUsers: [...(current?.recentUsers || []), ...(response.recentUsers || [])],
        recentUsersNextCursor: response.recentUsersNextCursor,
        recentUsersHasMore: response.recentUsersHasMore
      }));
      return response;
    } finally {
      setLoadingMoreUsers(false);
    }
  }, [handleAdminRequest, loadingMoreUsers, overview?.recentUsersNextCursor, user?.role]);

  const loadMoreJobs = useCallback(async () => {
    if (user?.role !== "admin" || !overview?.recentJobsNextCursor || loadingMoreJobs) return null;
    setLoadingMoreJobs(true);
    setError("");
    try {
      const response = await handleAdminRequest(() => getAdminOverview({ limit: 6, jobsBefore: overview.recentJobsNextCursor }));
      if (!response) return null;
      setOverview((current) => ({
        ...current,
        recentJobs: [...(current?.recentJobs || []), ...(response.recentJobs || [])],
        recentJobsNextCursor: response.recentJobsNextCursor,
        recentJobsHasMore: response.recentJobsHasMore
      }));
      return response;
    } finally {
      setLoadingMoreJobs(false);
    }
  }, [handleAdminRequest, loadingMoreJobs, overview?.recentJobsNextCursor, user?.role]);

  const loadMoreLogs = useCallback(async () => {
    if (user?.role !== "admin" || !overview?.recentRequestLogsNextCursor || loadingMoreLogs) return null;
    setLoadingMoreLogs(true);
    setError("");
    try {
      const response = await handleAdminRequest(() => getAdminOverview({ limit: 6, logsBefore: overview.recentRequestLogsNextCursor }));
      if (!response) return null;
      setOverview((current) => ({
        ...current,
        recentRequestLogs: [...(current?.recentRequestLogs || []), ...(response.recentRequestLogs || [])],
        recentRequestLogsNextCursor: response.recentRequestLogsNextCursor,
        recentRequestLogsHasMore: response.recentRequestLogsHasMore
      }));
      return response;
    } finally {
      setLoadingMoreLogs(false);
    }
  }, [handleAdminRequest, loadingMoreLogs, overview?.recentRequestLogsNextCursor, user?.role]);

  const changeUserRole = useCallback(async (userId, role) => {
    if (user?.role !== "admin" || !userId || !role) return null;
    setRoleUpdatingUserId(userId);
    setError("");
    try {
      const updated = await handleAdminRequest(() => updateUserRole(userId, role));
      if (!updated) return null;
      setOverview((current) => ({
        ...current,
        recentUsers: (current?.recentUsers || []).map((entry) => entry.id === userId ? { ...entry, role: updated.user.role } : entry)
      }));
      if (user.id === userId) {
        const refreshedUser = await refreshCurrentUserRole();
        if (refreshedUser?.role !== "admin") {
          setError("Your role changed. Admin tools are now hidden for this session.");
        }
      }
      return updated;
    } finally {
      setRoleUpdatingUserId("");
    }
  }, [handleAdminRequest, refreshCurrentUserRole, user]);

  const cancelOverviewJob = useCallback(async (jobId) => {
    if (user?.role !== "admin" || !jobId || jobCancellingId) return null;
    setJobCancellingId(jobId);
    setError("");
    try {
      const response = await handleAdminRequest(() => adminCancelJob(jobId));
      if (!response?.job) return null;
      setOverview((current) => ({
        ...current,
        recentJobs: (current?.recentJobs || []).map((entry) => entry.id === jobId ? { ...entry, ...response.job } : entry)
      }));
      return response.job;
    } finally {
      setJobCancellingId("");
    }
  }, [handleAdminRequest, jobCancellingId, user?.role]);

  const revokeSession = useCallback(async (sessionId) => {
    if (!sessionId || sessionRevokingId) return null;
    setSessionRevokingId(sessionId);
    setError("");
    try {
      const response = await revokeMySession(sessionId);
      setSessions(response.sessions || []);
      return response;
    } finally {
      setSessionRevokingId("");
    }
  }, [sessionRevokingId]);

  const revokeAdminSession = useCallback(async (sessionId) => {
    if (user?.role !== "admin" || !sessionId || sessionRevokingId) return null;
    setSessionRevokingId(sessionId);
    setError("");
    try {
      const response = await handleAdminRequest(() => adminRevokeSession(sessionId));
      if (!response) return null;
      setOverview((current) => ({
        ...current,
        recentSessions: (current?.recentSessions || []).filter((entry) => entry.id !== sessionId)
      }));
      return response;
    } finally {
      setSessionRevokingId("");
    }
  }, [handleAdminRequest, sessionRevokingId, user?.role]);

  const replayDeadLetter = useCallback(async (deadLetterId) => {
    if (user?.role !== "admin" || !deadLetterId || deadLetterReplayingId) return null;
    setDeadLetterReplayingId(deadLetterId);
    setError("");
    try {
      const response = await handleAdminRequest(() => adminReplayDeadLetter(deadLetterId));
      if (!response) return null;
      setOverview((current) => ({
        ...current,
        deadLetters: (current?.deadLetters || []).map((entry) => entry.id === deadLetterId ? {
          ...entry,
          replay_count: Number(entry.replay_count || 0) + 1,
          last_replayed_at: new Date().toISOString()
        } : entry)
      }));
      return response;
    } finally {
      setDeadLetterReplayingId("");
    }
  }, [deadLetterReplayingId, handleAdminRequest, user?.role]);

  return {
    mode,
    setMode,
    user,
    settings,
    billing,
    overview,
    sessions,
    recentJobsBootstrap,
    loading,
    error,
    setError,
    authenticate,
    logout,
    logoutAll,
    updateProfile,
    changePassword,
    refreshBilling,
    purchasePlan,
    loadMoreUsers,
    loadMoreJobs,
    loadMoreLogs,
    changeUserRole,
    cancelOverviewJob,
    revokeSession,
    revokeAdminSession,
    replayDeadLetter,
    loadingMoreUsers,
    loadingMoreJobs,
    loadingMoreLogs,
    roleUpdatingUserId,
    jobCancellingId,
    sessionRevokingId,
    deadLetterReplayingId,
    loggingOutAll,
    purchasingPlanId,
    profileSaving,
    passwordSaving
  };
}
