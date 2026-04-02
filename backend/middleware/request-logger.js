import { logError, logInfo } from "../utils/logger.js";
import { insertRequestLog } from "../services/request-log.repository.js";
import { recordRequestMetric } from "../services/metrics.service.js";
import { getTraceMeta } from "../services/tracing.service.js";

export function requestLoggingMiddleware(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const traceMeta = getTraceMeta(req);
    const payload = {
      ...traceMeta,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.sub || null,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null
    };

    recordRequestMetric({
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs
    });

    logInfo("API request completed", payload);

    insertRequestLog({
      requestId: req.id,
      userId: req.user?.sub || null,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null
    }).catch((error) => {
      logError("Failed to persist API request log", error, {
        ...traceMeta,
        path: req.originalUrl,
        statusCode: res.statusCode
      });
    });
  });

  next();
}
