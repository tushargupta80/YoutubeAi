import { logError } from "../utils/logger.js";

export function notFoundHandler(req, res) {
  return res.status(404).json({
    error: "Route not found",
    requestId: req.id
  });
}

export function errorHandler(error, req, res, _next) {
  const statusCode = Number(error?.statusCode || error?.status || 500);
  const safeStatusCode = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
  const message = safeStatusCode >= 500 ? "Internal server error" : (error?.message || "Request failed");

  logError("Unhandled API error", error, {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.sub || null,
    statusCode: safeStatusCode
  });

  return res.status(safeStatusCode).json({
    error: message,
    requestId: req.id
  });
}
