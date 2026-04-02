import { app, markAppNotReady, markAppReady } from "./server.js";
import { env } from "../config/env.js";
import { closeDatabase } from "../config/db.js";
import { closeRedis } from "../config/redis.js";
import { logError, logInfo } from "../utils/logger.js";
import { runMigrationsWithRetry } from "../services/migrate.service.js";

let server;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  markAppNotReady();
  logInfo("Shutdown started", { signal, timeoutMs: env.shutdownTimeoutMs });

  const forceExitTimer = setTimeout(() => {
    logError("Forced shutdown after timeout", new Error("shutdown timeout"), { signal });
    process.exit(1);
  }, env.shutdownTimeoutMs);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) return reject(error);
          return resolve();
        });
      });
    }

    await Promise.allSettled([
      closeDatabase(),
      closeRedis()
    ]);

    clearTimeout(forceExitTimer);
    logInfo("Shutdown complete", { signal });
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    logError("Shutdown failed", error, { signal });
    process.exit(1);
  }
}

async function start() {
  try {
    markAppNotReady();
    await runMigrationsWithRetry();
    server = app.listen(env.port, () => {
      markAppReady();
      logInfo("Backend listening", {
        port: env.port,
        nodeEnv: env.nodeEnv,
        trustProxy: env.trustProxy,
        corsAllowedOrigins: env.corsAllowedOrigins
      });
    });
  } catch (error) {
    logError("Backend startup failed", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  logError("Uncaught exception", error);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (error) => {
  logError("Unhandled promise rejection", error instanceof Error ? error : new Error(String(error)));
  shutdown("unhandledRejection");
});

start();