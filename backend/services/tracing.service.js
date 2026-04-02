import { randomUUID } from "node:crypto";

export function createTraceContext(req) {
  const incomingTraceId = req.headers["x-trace-id"];
  const incomingParentSpanId = req.headers["x-parent-span-id"];

  return {
    traceId: typeof incomingTraceId === "string" && incomingTraceId.trim() ? incomingTraceId.trim() : req.id,
    spanId: randomUUID(),
    parentSpanId: typeof incomingParentSpanId === "string" && incomingParentSpanId.trim() ? incomingParentSpanId.trim() : null
  };
}

export function getTraceMeta(req) {
  return {
    requestId: req.id,
    traceId: req.trace?.traceId || req.id,
    spanId: req.trace?.spanId || null,
    parentSpanId: req.trace?.parentSpanId || null
  };
}
