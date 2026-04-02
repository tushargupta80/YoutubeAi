"use client";

import { useDiagnostics } from "@/hooks/useDiagnostics";
import { formatDateTime, formatNumber, formatPercent, formatUsd, joinWithDot } from "@/lib/display-format";

function SettingTile({ label, value, compact = false }) {
  return (
    <div className={`rounded-[1.5rem] border border-stone-200 bg-stone-50/90 p-4 ${compact ? "" : "min-h-[110px]"}`}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-3 break-words font-medium leading-7 text-stone-800">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-2 font-display text-3xl text-ink">{value}</p>
      {helper ? <p className="mt-1 text-xs text-stone-500">{helper}</p> : null}
    </div>
  );
}

function SimpleBarChart({ items, valueKey, labelKey, tone = "teal" }) {
  const maxValue = Math.max(...items.map((item) => Number(item?.[valueKey] || 0)), 0);
  const fillClass = tone === "amber" ? "bg-amber-400" : "bg-teal-500";

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const value = Number(item?.[valueKey] || 0);
        const width = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 8 : 0) : 0;
        return (
          <div key={`${item?.[labelKey] || index}-${index}`}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-stone-500">
              <span className="truncate">{item?.[labelKey] || "-"}</span>
              <span>{formatNumber(value)}</span>
            </div>
            <div className="h-2 rounded-full bg-stone-200">
              <div className={`h-2 rounded-full ${fillClass}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RuntimeSettingsCard({ settings }) {
  const { diagnostics, loading, error, warnings, runChecks } = useDiagnostics(settings);

  if (!settings) return null;

  return (
    <section className="surface-card p-6 md:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="section-kicker">Runtime</p>
          <h3 className="mt-2 font-display text-3xl text-ink">Active AI settings</h3>
        </div>
        <button className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-50 disabled:opacity-60" onClick={runChecks} disabled={loading}>
          {loading ? "Checking..." : "Run Diagnostics"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SettingTile label="Primary Provider" value={settings.primaryProvider} />
        <SettingTile label="Gemini" value={settings.geminiConfigured ? `Configured (${settings.geminiModel})` : "Not configured"} />
        <SettingTile label="Gemini Timeout" value={`${settings.geminiTimeoutMs}ms / ${settings.geminiMaxRetries} retries`} />
        <SettingTile label="Preprocess Model" value={settings.ollamaPreprocessModel} />
        <SettingTile label="Fallback Model" value={settings.ollamaFallbackModel} />
        <SettingTile label="Embeddings" value={settings.ollamaEmbedModel} />
        <SettingTile label="Ollama URL" value={settings.ollamaBaseUrl} />
        <SettingTile label="Ollama Timeout" value={`${settings.ollamaTimeoutMs}ms / ${settings.ollamaMaxRetries} retries`} />
        <SettingTile label="Provider Logging" value={settings.providerRequestLogEnabled ? "Enabled" : "Disabled"} compact />
        <SettingTile
          label="Circuit Breaker"
          value={settings.providerCircuitBreakerEnabled ? `${settings.providerCircuitBreakerFailureThreshold} failures / ${settings.providerCircuitBreakerCooldownMs}ms cooldown` : "Disabled"}
          compact
        />
        <SettingTile label="Gemini Cost Table" value={settings.geminiModelCostsConfigured ? "Model-specific rates loaded" : "Using provider defaults"} compact />
        <SettingTile label="Ollama Cost Table" value={settings.ollamaModelCostsConfigured ? "Model-specific rates loaded" : "Using provider defaults"} compact />
      </div>

      {warnings.length ? (
        <div className="mt-4 space-y-2 rounded-[1.6rem] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-700">Warnings</p>
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

      {diagnostics ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Ollama Diagnostics</p>
              <p className="mt-3 font-medium text-ink">{diagnostics.ollama.ok ? "Reachable" : "Unavailable"}</p>
              <p className="mt-1 leading-7 text-stone-600">{diagnostics.ollama.message}</p>
              {diagnostics.ollama.models?.length ? <p className="mt-3 text-xs text-stone-500">Models: {diagnostics.ollama.models.join(", ")}</p> : null}
            </div>
            <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Gemini Diagnostics</p>
              <p className="mt-3 font-medium text-ink">{diagnostics.gemini.ok ? "Reachable" : "Unavailable"}</p>
              <p className="mt-1 leading-7 text-stone-600">{diagnostics.gemini.message}</p>
            </div>
          </div>

          {diagnostics.usageTotals ? (
            <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Last 7 Days Usage</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Requests" value={formatNumber(diagnostics.usageTotals.request_count)} helper={`${formatNumber(diagnostics.usageTotals.success_count)} success / ${formatNumber(diagnostics.usageTotals.failure_count)} failure`} />
                <SummaryCard label="Input Tokens" value={formatNumber(diagnostics.usageTotals.total_input_tokens)} helper="Prompt-side token usage" />
                <SummaryCard label="Output Tokens" value={formatNumber(diagnostics.usageTotals.total_output_tokens)} helper="Response-side token usage" />
                <SummaryCard label="Estimated Cost" value={formatUsd(diagnostics.usageTotals.total_estimated_cost_usd)} helper={`${formatNumber(diagnostics.usageTotals.fallback_count)} fallbacks / ${formatNumber(diagnostics.usageTotals.circuit_open_count)} circuit blocks`} />
              </div>
            </div>
          ) : null}

          {diagnostics.usageSummaryByProvider?.length ? (
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Usage By Provider</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {diagnostics.usageSummaryByProvider.map((summary) => {
                    const successRate = summary.request_count ? (summary.success_count / summary.request_count) * 100 : 0;
                    return (
                      <div key={summary.provider} className="rounded-[1.2rem] border border-stone-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-ink">{summary.provider}</p>
                          <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{formatPercent(successRate)}</span>
                        </div>
                        <p className="mt-2 text-xs text-stone-500">{formatNumber(summary.request_count)} requests</p>
                        <p className="mt-2 text-sm text-stone-700">{formatNumber(summary.total_input_tokens)} in / {formatNumber(summary.total_output_tokens)} out</p>
                        <p className="mt-1 text-sm text-stone-700">{formatUsd(summary.total_estimated_cost_usd)} estimated cost</p>
                        <p className="mt-2 text-xs text-stone-500">{joinWithDot([`${formatNumber(summary.fallback_count)} fallbacks`, `${formatNumber(summary.circuit_open_count)} circuit blocks`])}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Provider Request Chart</p>
                <div className="mt-3">
                  <SimpleBarChart items={diagnostics.usageSummaryByProvider} valueKey="request_count" labelKey="provider" tone="teal" />
                </div>
              </div>
            </div>
          ) : null}

          {diagnostics.circuitStates?.length ? (
            <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Circuit Breaker State</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {diagnostics.circuitStates.map((state, index) => (
                  <div key={`${state.provider}-${state.operation}-${state.model || "default"}-${index}`} className="rounded-[1.2rem] border border-stone-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-ink">{state.provider} / {state.operation}</p>
                      <span className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${state.state === "open" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{state.state}</span>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">{state.model || "default model"}</p>
                    <p className="mt-2 text-xs text-stone-500">{formatNumber(state.consecutive_failures)} consecutive failures</p>
                    {state.open_until ? <p className="mt-2 text-xs text-stone-500">Open until {formatDateTime(state.open_until)}</p> : null}
                    {state.last_error ? <p className="mt-2 text-xs text-red-700">{state.last_error}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {diagnostics.metrics?.length ? (
            <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Operation Metrics</p>
              <div className="mt-3 space-y-3">
                {diagnostics.metrics.map((metric) => (
                  <div key={`${metric.provider}-${metric.operation}`} className="rounded-[1.2rem] border border-stone-200 bg-white p-3">
                    <p className="font-medium text-ink">{metric.provider} / {metric.operation}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {joinWithDot([
                        `total ${metric.total}`,
                        `success ${metric.success}`,
                        `failure ${metric.failure}`,
                        `retries ${metric.retries}`,
                        `fallbacks ${metric.fallbacks}`,
                        `circuit blocks ${metric.circuitOpen}`
                      ])}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {joinWithDot([
                        `avg latency ${metric.averageLatencyMs}ms`,
                        `avg tokens ${formatNumber(metric.averageInputTokens)} in / ${formatNumber(metric.averageOutputTokens)} out`,
                        `avg cost ${formatUsd(metric.averageEstimatedCostUsd)}`
                      ])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {diagnostics.dailyUsageSummary?.length ? (
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Daily Usage Snapshot</p>
                <div className="mt-3 space-y-2">
                  {diagnostics.dailyUsageSummary.slice(0, 8).map((entry, index) => (
                    <div key={`${entry.day}-${entry.provider}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[1.2rem] border border-stone-200 bg-white px-4 py-3">
                      <p className="font-medium text-ink">{joinWithDot([entry.day, entry.provider])}</p>
                      <p className="text-xs text-stone-500">{joinWithDot([`${formatNumber(entry.request_count)} requests`, `${formatNumber(entry.total_input_tokens)} / ${formatNumber(entry.total_output_tokens)} tokens`, formatUsd(entry.total_estimated_cost_usd)])}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Daily Request Chart</p>
                <div className="mt-3">
                  <SimpleBarChart
                    items={diagnostics.dailyUsageSummary.slice(0, 8).map((entry) => ({ ...entry, label: joinWithDot([entry.day, entry.provider]) }))}
                    valueKey="request_count"
                    labelKey="label"
                    tone="amber"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {diagnostics.observability ? (
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">System Observability</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <SummaryCard label="Uptime" value={`${formatNumber(diagnostics.observability.process.uptimeSeconds)}s`} helper={`Started ${formatDateTime(diagnostics.observability.process.startedAt)}`} />
                  <SummaryCard label="Request Avg" value={`${formatNumber(diagnostics.observability.totals.averageLatencyMs)}ms`} helper={`${formatNumber(diagnostics.observability.totals.total)} requests seen`} />
                  <SummaryCard label="Heap Used" value={`${formatNumber(Math.round(diagnostics.observability.process.heapUsedBytes / 1024 / 1024))} MB`} helper={`RSS ${formatNumber(Math.round(diagnostics.observability.process.rssBytes / 1024 / 1024))} MB`} />
                  <SummaryCard label="Errors" value={formatNumber(diagnostics.observability.totals.clientError + diagnostics.observability.totals.serverError)} helper={`${formatNumber(diagnostics.observability.totals.serverError)} server / ${formatNumber(diagnostics.observability.totals.clientError)} client`} />
                </div>
                {diagnostics.observability.dependencies?.length ? (
                  <div className="mt-4 space-y-2">
                    {diagnostics.observability.dependencies.map((dependency) => (
                      <div key={dependency.name} className="rounded-[1.2rem] border border-stone-200 bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-ink">{dependency.name}</p>
                          <span className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${dependency.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{dependency.ok ? 'healthy' : 'degraded'}</span>
                        </div>
                        <p className="mt-2 text-xs text-stone-500">{joinWithDot([`${formatNumber(dependency.latencyMs)}ms`, formatDateTime(dependency.checkedAt)])}</p>
                        {dependency.error ? <p className="mt-2 text-xs text-red-700">{dependency.error}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
                <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Top Request Routes</p>
                <div className="mt-3 space-y-3">
                  {(diagnostics.observability.topRoutes || []).slice(0, 8).map((route) => (
                    <div key={route.key} className="rounded-[1.2rem] border border-stone-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-ink">{route.key}</p>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{formatNumber(route.total)} req</span>
                      </div>
                      <p className="mt-2 text-xs text-stone-500">{joinWithDot([`avg ${formatNumber(route.averageLatencyMs)}ms`, `max ${formatNumber(route.maxLatencyMs)}ms`, `errors ${formatNumber(route.clientError + route.serverError)}`])}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {diagnostics.queues ? (
            <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Queue Health</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Backlog" value={formatNumber(diagnostics.queues.totals.backlog)} helper={`${formatNumber(diagnostics.queues.totals.inFlight)} in flight`} />
                <SummaryCard label="Completed" value={formatNumber(diagnostics.queues.totals.completed)} helper={`${formatNumber(diagnostics.queues.totals.failed)} failed`} />
                <SummaryCard label="Paused" value={formatNumber(diagnostics.queues.totals.paused)} helper="Across all queues" />
                <SummaryCard label="Queues" value={formatNumber(diagnostics.queues.queues?.length || 0)} helper="Ingest, embed, notes, and Q&A" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {(diagnostics.queues.queues || []).map((queue) => (
                  <div key={queue.name} className="rounded-[1.2rem] border border-stone-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-ink">{queue.name}</p>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{formatNumber(queue.backlog)} waiting</span>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">{joinWithDot([`${formatNumber(queue.inFlight)} active`, `${formatNumber(queue.completed)} completed`, `${formatNumber(queue.failed)} failed`])}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {diagnostics.recentProviderEvents?.length ? (
            <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">Recent Provider Events</p>
              <div className="mt-3 space-y-3">
                {diagnostics.recentProviderEvents.map((event, index) => (
                  <div key={`${event.provider}-${event.operation}-${event.created_at}-${index}`} className="rounded-[1.2rem] border border-stone-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-ink">{event.provider} / {event.operation}</p>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{event.outcome}</span>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">
                      {joinWithDot([
                        event.model || "-",
                        event.latency_ms ? `${event.latency_ms}ms` : "",
                        event.status_code ? `status ${event.status_code}` : "",
                        event.fallback_to ? `fallback to ${event.fallback_to}` : "",
                        event.cost_source || ""
                      ])}
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      {joinWithDot([
                        `${formatNumber(event.input_tokens)} in / ${formatNumber(event.output_tokens)} out`,
                        formatUsd(event.estimated_cost_usd)
                      ])}
                    </p>
                    {event.error_message ? <p className="mt-2 text-xs text-red-700">{event.error_message}</p> : null}
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-400">{formatDateTime(event.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}


