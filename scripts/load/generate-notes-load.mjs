const API_URL = (process.env.LOAD_API_URL || "http://localhost:4000").replace(/\/$/, "");
const USERS = Number(process.env.LOAD_USERS || 3);
const RUNS_PER_USER = Number(process.env.LOAD_RUNS_PER_USER || 2);
const PASSWORD = process.env.LOAD_PASSWORD || "LoadTest123!";
const YOUTUBE_URL = process.env.LOAD_YOUTUBE_URL || "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function extractCookieHeader(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().map((value) => value.split(";")[0].trim()).join("; ");
  }
  const single = headers.get("set-cookie");
  return single ? single.split(";")[0].trim() : "";
}

async function request(path, { method = "GET", body, cookie = "" } = {}) {
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body != null ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  return { response, payload, cookie: extractCookieHeader(response.headers) };
}

async function runVirtualUser(index) {
  const email = `load-${Date.now()}-${index}@example.com`;
  const register = await request("/auth/register", {
    method: "POST",
    body: { name: `Load User ${index}`, email, password: PASSWORD }
  });

  if (!register.response.ok || !register.cookie) {
    throw new Error(`register failed for user ${index}: ${register.response.status}`);
  }

  for (let run = 0; run < RUNS_PER_USER; run += 1) {
    const generated = await request("/generate-notes", {
      method: "POST",
      body: { youtube_url: YOUTUBE_URL },
      cookie: register.cookie
    });

    if (!generated.response.ok || !generated.payload.jobId) {
      throw new Error(`generate-notes failed for user ${index}, run ${run}: ${generated.response.status}`);
    }

    await request(`/jobs/${generated.payload.jobId}/cancel`, {
      method: "POST",
      cookie: register.cookie
    });
  }
}

async function main() {
  const start = Date.now();
  await Promise.all(Array.from({ length: USERS }, (_, index) => runVirtualUser(index + 1)));
  const durationMs = Date.now() - start;
  console.log(JSON.stringify({ ok: true, users: USERS, runsPerUser: RUNS_PER_USER, durationMs }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
