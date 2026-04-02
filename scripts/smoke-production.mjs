const API_URL = (process.env.SMOKE_API_URL || "http://localhost:4000").replace(/\/$/, "");
const USER_NAME = process.env.SMOKE_USER_NAME || "Smoke Test User";
const USER_EMAIL = process.env.SMOKE_USER_EMAIL || `smoke-${Date.now()}@example.com`;
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD || "SmokeTest123!";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "";
const SKIP_ADMIN = String(process.env.SMOKE_SKIP_ADMIN || "false").toLowerCase() === "true";
const YOUTUBE_URL = process.env.SMOKE_YOUTUBE_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const RATE_LIMIT_RETRY_BUFFER_MS = 1200;
const MAX_RATE_LIMIT_RETRIES = 3;

function logStep(message) {
  console.log(`\n[smoke] ${message}`);
}

function getSetCookieValues(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function applySetCookie(existingCookie, setCookieValues) {
  const jar = new Map();

  for (const pair of String(existingCookie || "").split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const [name, ...rest] = trimmed.split("=");
    jar.set(name, rest.join("="));
  }

  for (const value of setCookieValues) {
    const [cookiePair] = value.split(";");
    const [name, ...rest] = cookiePair.trim().split("=");
    const cookieValue = rest.join("=");
    if (!name) continue;
    if (cookieValue) {
      jar.set(name, cookieValue);
    } else {
      jar.delete(name);
    }
  }

  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}));
  }
  const text = await response.text().catch(() => "");
  return text ? { raw: text } : {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRateLimitDelayMs(response) {
  const resetHeader = response.headers.get("x-rate-limit-reset");
  if (resetHeader) {
    const resetAtMs = Number(resetHeader) * 1000;
    if (Number.isFinite(resetAtMs)) {
      return Math.max(resetAtMs - Date.now(), 0) + RATE_LIMIT_RETRY_BUFFER_MS;
    }
  }

  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const retrySeconds = Number(retryAfter);
    if (Number.isFinite(retrySeconds)) {
      return retrySeconds * 1000 + RATE_LIMIT_RETRY_BUFFER_MS;
    }
  }

  return 5000;
}

async function request(path, { method = "GET", body, cookie = "", retryOnRateLimit = false } = {}) {
  const baseHeaders = {
    Accept: "application/json"
  };

  if (body != null) {
    baseHeaders["Content-Type"] = "application/json";
  }

  let currentCookie = cookie;

  for (let attempt = 1; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const headers = { ...baseHeaders };
    if (currentCookie) {
      headers.Cookie = currentCookie;
    }

    const response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined
    });

    const payload = await parseResponseBody(response);
    const setCookieValues = getSetCookieValues(response.headers);
    currentCookie = applySetCookie(currentCookie, setCookieValues);

    if (response.status === 429 && retryOnRateLimit && attempt < MAX_RATE_LIMIT_RETRIES) {
      const delayMs = getRateLimitDelayMs(response);
      logStep(`rate limited on ${method} ${path}; waiting ${Math.ceil(delayMs / 1000)}s before retry`);
      await sleep(delayMs);
      continue;
    }

    return {
      response,
      payload,
      cookie: currentCookie
    };
  }

  throw new Error(`request retries exhausted for ${method} ${path}`);
}

async function assertOk(result, message) {
  if (!result.response.ok) {
    throw new Error(`${message} failed with ${result.response.status}: ${JSON.stringify(result.payload)}`);
  }
}

async function runUserFlow() {
  logStep("registering a normal user");
  let currentCookie = "";
  const registerResult = await request("/auth/register", {
    method: "POST",
    body: { name: USER_NAME, email: USER_EMAIL, password: USER_PASSWORD },
    retryOnRateLimit: true
  });
  await assertOk(registerResult, "register");
  currentCookie = registerResult.cookie;
  if (!currentCookie) {
    throw new Error("register succeeded but no session cookie was returned");
  }

  logStep("verifying session cookie through /auth/me");
  const meResult = await request("/auth/me", { cookie: currentCookie });
  await assertOk(meResult, "auth me");
  currentCookie = meResult.cookie;

  logStep("rotating session via /auth/refresh");
  const refreshResult = await request("/auth/refresh", {
    method: "POST",
    cookie: currentCookie,
    retryOnRateLimit: true
  });
  await assertOk(refreshResult, "auth refresh");
  currentCookie = refreshResult.cookie;

  logStep("starting note generation");
  const generateResult = await request("/generate-notes", {
    method: "POST",
    body: { youtube_url: YOUTUBE_URL },
    cookie: currentCookie
  });
  await assertOk(generateResult, "generate notes");
  currentCookie = generateResult.cookie;
  const jobId = generateResult.payload.jobId;
  if (!jobId) {
    throw new Error("generate notes returned no jobId");
  }

  logStep(`cancelling generated job ${jobId}`);
  const cancelResult = await request(`/jobs/${jobId}/cancel`, {
    method: "POST",
    cookie: currentCookie
  });
  await assertOk(cancelResult, "cancel job");
  currentCookie = cancelResult.cookie;

  logStep("logging out user session");
  const logoutResult = await request("/auth/logout", {
    method: "POST",
    cookie: currentCookie
  });
  await assertOk(logoutResult, "logout");
  currentCookie = logoutResult.cookie;

  logStep("verifying session is gone after logout");
  const postLogoutResult = await request("/auth/me", { cookie: currentCookie });
  if (postLogoutResult.response.status !== 401) {
    throw new Error(`expected /auth/me after logout to return 401, got ${postLogoutResult.response.status}`);
  }

  return { userEmail: USER_EMAIL, jobId };
}

async function runAdminFlow() {
  if (SKIP_ADMIN) {
    logStep("skipping admin smoke test because SMOKE_SKIP_ADMIN=true");
    return { skipped: true };
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD are required unless SMOKE_SKIP_ADMIN=true");
  }

  logStep("logging in as admin");
  let currentCookie = "";
  const loginResult = await request("/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    retryOnRateLimit: true
  });
  await assertOk(loginResult, "admin login");
  currentCookie = loginResult.cookie;
  if (!currentCookie) {
    throw new Error("admin login succeeded but no session cookie was returned");
  }

  logStep("loading admin overview");
  const overviewResult = await request("/admin/overview", {
    cookie: currentCookie
  });
  await assertOk(overviewResult, "admin overview");
  currentCookie = overviewResult.cookie;

  logStep("logging out admin session");
  const logoutResult = await request("/auth/logout", {
    method: "POST",
    cookie: currentCookie
  });
  await assertOk(logoutResult, "admin logout");

  return { skipped: false };
}

async function main() {
  console.log(`[smoke] api=${API_URL}`);
  const userFlow = await runUserFlow();
  const adminFlow = await runAdminFlow();
  console.log("\n[smoke] success");
  console.log(JSON.stringify({ ok: true, userFlow, adminFlow }, null, 2));
}

main().catch((error) => {
  console.error("\n[smoke] failure");
  console.error(error.message || error);
  process.exitCode = 1;
});
