const API_URL = (process.env.OBS_EXPORT_API_URL || process.env.SMOKE_API_URL || "http://localhost:4000").replace(/\/$/, "");
const OUTPUT_URL = process.env.OBS_EXPORT_SINK_URL || "";
const OUTPUT_TOKEN = process.env.OBS_EXPORT_SINK_TOKEN || "";

async function main() {
  const response = await fetch(`${API_URL}/api/settings/observability`, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch observability snapshot: ${response.status}`);
  }

  const payload = await response.json();

  if (!OUTPUT_URL) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const exportResponse = await fetch(OUTPUT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OUTPUT_TOKEN ? { Authorization: `Bearer ${OUTPUT_TOKEN}` } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!exportResponse.ok) {
    throw new Error(`Failed to export observability snapshot: ${exportResponse.status}`);
  }

  console.log(`[observability] snapshot exported to ${OUTPUT_URL}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
