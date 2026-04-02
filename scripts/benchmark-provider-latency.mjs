const API_URL = (process.env.SMOKE_API_URL || "http://localhost:4000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "";

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

async function loginAdmin() {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  if (!response.ok) {
    const payload = await parseJson(response);
    throw new Error(`Admin login failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  const cookie = response.headers.getSetCookie ? response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") : response.headers.get("set-cookie")?.split(";")[0] || "";
  return cookie;
}

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD are required");
  }

  const cookie = await loginAdmin();
  const response = await fetch(`${API_URL}/api/admin/overview?limit=6&days=30`, {
    headers: { Accept: "application/json", Cookie: cookie }
  });
  if (!response.ok) {
    throw new Error(`Failed to load admin overview: ${response.status}`);
  }

  const payload = await parseJson(response);
  const items = payload.providerLatencySummary || [];
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    sampleCount: items.length,
    providerLatencySummary: items
  }, null, 2));
}

main().catch((error) => {
  console.error(`[benchmark] ${error.message || error}`);
  process.exitCode = 1;
});
