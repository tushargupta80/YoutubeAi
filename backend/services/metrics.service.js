import os from "node:os";
import { env } from "../config/env.js";

const requestMetrics = new Map();
const dependencyHealth = new Map();
const startupTime = Date.now();

function getRequestBucketKey(method, path) {
  return `${method.toUpperCase()} ${path}`;
}

function trimRequestMetricsIfNeeded() {
  if (requestMetrics.size < env.observabilityMetricsWindowSize) return;
  const oldest = Array.from(requestMetrics.entries()).sort((a, b) => {
    const left = new Date(a[1].lastSeenAt || 0).getTime();
    const right = new Date(b[1].lastSeenAt || 0).getTime();
    return left - right;
  })[0];
  if (oldest) {
    requestMetrics.delete(oldest[0]);
  }
}

function getRequestBucket(method, path) {
  const key = getRequestBucketKey(method, path);
  if (!requestMetrics.has(key)) {
    trimRequestMetricsIfNeeded();
    requestMetrics.set(key, {
      key,
      method: method.toUpperCase(),
      path,
      total: 0,
      success: 0,
      clientError: 0,
      serverError: 0,
      totalLatencyMs: 0,
      maxLatencyMs: 0,
      lastStatusCode: null,
      lastSeenAt: null
    });
  }
  return requestMetrics.get(key);
}

export function recordRequestMetric({ method, path, statusCode, durationMs }) {
  const bucket = getRequestBucket(method, path);
  const latency = Math.max(Number(durationMs || 0), 0);
  bucket.total += 1;
  bucket.totalLatencyMs += latency;
  bucket.maxLatencyMs = Math.max(bucket.maxLatencyMs, latency);
  bucket.lastStatusCode = Number(statusCode || 0);
  bucket.lastSeenAt = new Date().toISOString();

  if (bucket.lastStatusCode >= 500) {
    bucket.serverError += 1;
  } else if (bucket.lastStatusCode >= 400) {
    bucket.clientError += 1;
  } else {
    bucket.success += 1;
  }
}

export function recordDependencyHealth(name, result) {
  dependencyHealth.set(name, {
    name,
    ok: Boolean(result?.ok),
    latencyMs: Number(result?.latencyMs || 0),
    error: result?.error || "",
    checkedAt: new Date().toISOString()
  });
}

function getRequestMetricsSnapshot() {
  return Array.from(requestMetrics.values())
    .map((bucket) => ({
      ...bucket,
      averageLatencyMs: bucket.total ? Math.round(bucket.totalLatencyMs / bucket.total) : 0,
      errorRatePercent: bucket.total ? Math.round(((bucket.clientError + bucket.serverError) / bucket.total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total);
}

function getProcessSnapshot() {
  const memory = process.memoryUsage();
  return {
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: new Date(startupTime).toISOString(),
    rssBytes: memory.rss,
    heapTotalBytes: memory.heapTotal,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
    loadAverage: os.loadavg(),
    cpuCount: os.cpus().length,
    platform: process.platform,
    nodeVersion: process.version
  };
}

export function getMetricsSnapshot() {
  const requests = getRequestMetricsSnapshot();
  const totals = requests.reduce((accumulator, bucket) => {
    accumulator.total += bucket.total;
    accumulator.success += bucket.success;
    accumulator.clientError += bucket.clientError;
    accumulator.serverError += bucket.serverError;
    accumulator.totalLatencyMs += bucket.totalLatencyMs;
    return accumulator;
  }, {
    total: 0,
    success: 0,
    clientError: 0,
    serverError: 0,
    totalLatencyMs: 0
  });

  return {
    process: getProcessSnapshot(),
    totals: {
      ...totals,
      averageLatencyMs: totals.total ? Math.round(totals.totalLatencyMs / totals.total) : 0
    },
    topRoutes: requests.slice(0, 10),
    slowestRoutes: [...requests].sort((a, b) => b.averageLatencyMs - a.averageLatencyMs).slice(0, 10),
    dependencies: Array.from(dependencyHealth.values()).sort((a, b) => a.name.localeCompare(b.name)),
    windowSize: env.observabilityMetricsWindowSize
  };
}

function sanitizeMetricLabel(value) {
  return String(value || "unknown")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

export function renderPrometheusMetrics({ queues = null, providerLatency = [] } = {}) {
  const snapshot = getMetricsSnapshot();
  const lines = [
    "# HELP ainotes_process_uptime_seconds Process uptime in seconds",
    "# TYPE ainotes_process_uptime_seconds gauge",
    `ainotes_process_uptime_seconds ${snapshot.process.uptimeSeconds}`,
    "# HELP ainotes_http_requests_total Total observed HTTP requests by route",
    "# TYPE ainotes_http_requests_total counter"
  ];

  for (const route of snapshot.topRoutes) {
    lines.push(`ainotes_http_requests_total{method="${route.method}",path="${route.path}"} ${route.total}`);
    lines.push(`ainotes_http_request_latency_average_ms{method="${route.method}",path="${route.path}"} ${route.averageLatencyMs}`);
    lines.push(`ainotes_http_request_latency_max_ms{method="${route.method}",path="${route.path}"} ${route.maxLatencyMs}`);
  }

  lines.push("# HELP ainotes_dependency_health_ok Dependency health status (1=ok,0=down)");
  lines.push("# TYPE ainotes_dependency_health_ok gauge");
  for (const dependency of snapshot.dependencies) {
    lines.push(`ainotes_dependency_health_ok{name="${dependency.name}"} ${dependency.ok ? 1 : 0}`);
    lines.push(`ainotes_dependency_latency_ms{name="${dependency.name}"} ${dependency.latencyMs}`);
  }

  if (queues?.queues?.length) {
    lines.push("# HELP ainotes_queue_backlog Queue backlog jobs");
    lines.push("# TYPE ainotes_queue_backlog gauge");
    for (const queue of queues.queues) {
      const label = sanitizeMetricLabel(queue.name);
      lines.push(`ainotes_queue_backlog{name="${label}"} ${queue.backlog}`);
      lines.push(`ainotes_queue_inflight{name="${label}"} ${queue.inFlight}`);
      lines.push(`ainotes_queue_failed{name="${label}"} ${queue.failed}`);
    }
  }

  if (providerLatency?.length) {
    lines.push("# HELP ainotes_provider_latency_p95_ms Provider p95 latency in milliseconds");
    lines.push("# TYPE ainotes_provider_latency_p95_ms gauge");
    for (const entry of providerLatency) {
      lines.push(`ainotes_provider_latency_p95_ms{provider="${sanitizeMetricLabel(entry.provider)}",operation="${sanitizeMetricLabel(entry.operation)}"} ${Number(entry.p95_latency_ms || 0)}`);
      lines.push(`ainotes_provider_latency_p99_ms{provider="${sanitizeMetricLabel(entry.provider)}",operation="${sanitizeMetricLabel(entry.operation)}"} ${Number(entry.p99_latency_ms || 0)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
