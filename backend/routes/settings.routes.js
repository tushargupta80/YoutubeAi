import { Router } from "express";
import { getObservabilitySnapshot, getPrometheusMetrics, getRuntimeSettings, runDiagnostics } from "../api/settings.controller.js";

export const settingsRouter = Router();

settingsRouter.get("/", getRuntimeSettings);
settingsRouter.get("/diagnostics", runDiagnostics);
settingsRouter.get("/observability", getObservabilitySnapshot);
settingsRouter.get("/metrics.prom", getPrometheusMetrics);
