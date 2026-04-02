import { randomUUID } from "node:crypto";
import { createTraceContext } from "../services/tracing.service.js";

export function requestIdMiddleware(req, res, next) {
  const incomingRequestId = req.headers["x-request-id"];
  req.id = typeof incomingRequestId === "string" && incomingRequestId.trim() ? incomingRequestId.trim() : randomUUID();
  req.trace = createTraceContext(req);
  res.setHeader("x-request-id", req.id);
  res.setHeader("x-trace-id", req.trace.traceId);
  next();
}
