const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const DEFAULT_TIMEOUT_MS = 30000;

export function getAuthToken() {
  return "";
}

export function setAuthToken() {
  // Cookie-backed auth no longer stores session tokens in localStorage.
}

function createApiError(message, details = {}) {
  const error = new Error(message || "Request failed");
  error.name = "ApiError";
  Object.assign(error, details);
  return error;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }

  const text = await response.text().catch(() => "");
  return text ? { raw: text } : {};
}

function shouldAttemptRefresh(path, options = {}) {
  if (options.skipAuthRefresh) return false;
  if ((options.method || "GET").toUpperCase() === "OPTIONS") return false;
  return ![
    "/auth/login",
    "/auth/register",
    "/auth/refresh",
    "/auth/logout",
    "/auth/logout-all"
  ].includes(path);
}

async function doFetch(path, options, controller) {
  return fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include",
    signal: controller.signal,
    cache: "no-store"
  });
}

async function refreshSession() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw createApiError("Session refresh failed", {
        status: response.status,
        code: "SESSION_REFRESH_FAILED",
        requestId: response.headers.get("x-request-id") || ""
      });
    }

    return true;
  } finally {
    clearTimeout(timeout);
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response = await doFetch(path, options, controller);
    let payload = await parseResponseBody(response);

    if (response.status === 401 && shouldAttemptRefresh(path, options)) {
      try {
        await refreshSession();
        response = await doFetch(path, { ...options, skipAuthRefresh: true }, controller);
        payload = await parseResponseBody(response);
      } catch {
        // Fall through to the original 401 handling below.
      }
    }

    if (!response.ok) {
      throw createApiError(payload.error || `Request failed: ${response.status}`, {
        status: response.status,
        requestId: payload.requestId || response.headers.get("x-request-id") || "",
        code: payload.code || "",
        details: payload
      });
    }

    return payload;
  } catch (requestError) {
    if (requestError.name === "AbortError") {
      throw createApiError("Request timed out. Please try again.", {
        status: 408,
        code: "REQUEST_TIMEOUT",
        requestId: ""
      });
    }

    if (requestError.name === "ApiError") {
      throw requestError;
    }

    throw createApiError(requestError.message || "Network request failed", {
      status: 0,
      code: "NETWORK_ERROR",
      requestId: ""
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function isApiError(error) {
  return error?.name === "ApiError";
}

export function register(name, email, password) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password })
  });
}

export function login(email, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function logout() {
  return request("/auth/logout", {
    method: "POST"
  });
}

export function logoutAll() {
  return request("/auth/logout-all", {
    method: "POST"
  });
}

export function getMe() {
  return request("/auth/me");
}

export function getMySessions() {
  return request("/auth/sessions");
}

export function revokeMySession(sessionId) {
  return request(`/auth/sessions/${sessionId}/revoke`, {
    method: "POST"
  });
}

export function getSettings() {
  return request("/settings");
}

export function getDiagnostics() {
  return request("/settings/diagnostics", { timeoutMs: 45000 });
}

export function getBillingSummary() {
  return request("/billing/summary");
}

export function createBillingCheckout(planId) {
  return request("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ planId }),
    timeoutMs: 45000
  });
}

export function verifyBillingPayment(payload) {
  return request("/billing/verify", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 45000
  });
}

export function getAdminOverview(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.days) params.set("days", String(options.days));
  if (options.usersBefore) params.set("users_before", options.usersBefore);
  if (options.jobsBefore) params.set("jobs_before", options.jobsBefore);
  if (options.logsBefore) params.set("logs_before", options.logsBefore);
  if (options.deadLettersBefore) params.set("dead_letters_before", options.deadLettersBefore);
  const query = params.toString();
  return request(`/admin/overview${query ? `?${query}` : ""}`);
}

export function updateUserRole(userId, role) {
  return request(`/admin/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role })
  });
}

export function adminCancelJob(jobId) {
  return request(`/admin/jobs/${jobId}/cancel`, {
    method: "POST",
    timeoutMs: 45000
  });
}

export function adminRevokeSession(sessionId) {
  return request(`/admin/sessions/${sessionId}/revoke`, {
    method: "POST"
  });
}

export function adminReplayDeadLetter(deadLetterId) {
  return request(`/admin/dead-letters/${deadLetterId}/replay`, {
    method: "POST",
    timeoutMs: 45000
  });
}

export function generateNotes(youtubeUrl) {
  return request("/generate-notes", {
    method: "POST",
    body: JSON.stringify({ youtube_url: youtubeUrl }),
    timeoutMs: 45000
  });
}

export function generateNotesFromTranscript({ title, transcript }) {
  return request("/generate-notes/transcript", {
    method: "POST",
    body: JSON.stringify({ title, transcript }),
    timeoutMs: 45000
  });
}

export function cancelJob(jobId) {
  return request(`/jobs/${jobId}/cancel`, {
    method: "POST",
    timeoutMs: 45000
  });
}

export function getJob(jobId) {
  return request(`/jobs/${jobId}`);
}

export function getRecentJobs(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.before) params.set("before", options.before);
  if (options.status) params.set("status", options.status);
  const query = params.toString();
  return request(`/jobs${query ? `?${query}` : ""}`);
}

export function askQuestion(videoId, question) {
  return request("/ask-question", {
    method: "POST",
    body: JSON.stringify({ video_id: videoId, question }),
    timeoutMs: 45000
  });
}

