import os from "node:os";
import { env } from "../config/env.js";

const baseMeta = {
  service: env.serviceName,
  environment: env.nodeEnv,
  hostname: os.hostname(),
  pid: process.pid
};

async function exportLogEvent(payload) {
  if (!env.observabilityLogSinkUrl) return;

  try {
    await fetch(env.observabilityLogSinkUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.observabilityLogSinkToken ? { Authorization: `Bearer ${env.observabilityLogSinkToken}` } : {})
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // Never fail the app because a log sink is unavailable.
  }
}

function writeLog(level, message, meta = {}, writer = console.log) {
  const payload = {
    level,
    message,
    ...baseMeta,
    ...meta,
    timestamp: new Date().toISOString()
  };

  writer(JSON.stringify(payload));
  void exportLogEvent(payload);
}

export function logInfo(message, meta = {}) {
  writeLog("info", message, meta, console.log);
}

export function logWarn(message, meta = {}) {
  writeLog("warn", message, meta, console.warn);
}

export function logError(message, error, meta = {}) {
  writeLog("error", message, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...meta
  }, console.error);
}
