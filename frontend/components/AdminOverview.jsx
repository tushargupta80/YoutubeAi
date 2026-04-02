import { formatDateTime, formatNumber, formatUsd, joinWithDot } from "@/lib/display-format";

function MetricCard({ label, value, tone = "default", helper = "" }) {
  const toneClass = tone === "accent" ? "bg-teal-50 text-teal-900 border-teal-100" : tone === "warm" ? "bg-amber-50 text-amber-900 border-amber-100" : tone === "danger" ? "bg-rose-50 text-rose-900 border-rose-100" : "bg-stone-50 text-ink border-stone-200";
  return (
    <div className={`rounded-[1.6rem] border p-5 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-3 font-display text-4xl">{value}</p>
      {helper ? <p className="mt-2 text-xs text-stone-500">{helper}</p> : null}
    </div>
  );
}

function MiniBarChart({ items, valueKey, labelKey, tone = "teal" }) {
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

function groupJobsByStatus(jobs = []) {
  return {
    processing: jobs.filter((job) => job.status === "processing" || job.status === "queued"),
    completed: jobs.filter((job) => job.status === "completed"),
    failed: jobs.filter((job) => job.status === "failed")
  };
}

function JobColumn({ title, description, jobs, emptyLabel, tone = "stone", cancellable = false, cancellingJobId = "", onCancelJob }) {
  const borderClass = tone === "teal" ? "border-teal-200 bg-teal-50/50" : tone === "rose" ? "border-rose-200 bg-rose-50/40" : "border-stone-200 bg-stone-50/90";

  return (
    <div className={`rounded-[1.8rem] border p-5 ${borderClass}`}>
      <div className="mb-4">
        <p className="section-kicker">Generations</p>
        <h4 className="mt-1 font-display text-2xl text-ink">{title}</h4>
        <p className="mt-2 text-sm leading-7 text-stone-600">{description}</p>
      </div>
      <div className="space-y-3 text-sm text-stone-700">
        {jobs.length ? jobs.map((job) => (
          <div key={job.id} className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="max-w-[70%] font-medium text-ink">{job.video_title || "Untitled video"}</p>
              <div className="flex flex-wrap items-center gap-2">
                {cancellable && onCancelJob ? (
                  <button
                    type="button"
                    onClick={() => onCancelJob(job.id)}
                    disabled={cancellingJobId === job.id}
                    className="rounded-full border border-red-300 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {cancellingJobId === job.id ? "Cancelling" : "Cancel"}
                  </button>
                ) : null}
                <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{job.status}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-stone-500">{joinWithDot([job.user_name || job.user_email || "Unknown user", job.user_role || "user"])}</p>
            <p className="mt-2 text-xs text-stone-500">{joinWithDot([job.stage || "-", job.generation_provider || "-", job.processing_seconds ? `${job.processing_seconds}s` : null].filter(Boolean))}</p>
            {job.error_message ? <p className="mt-2 text-xs text-rose-600">{job.error_message}</p> : null}
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-400">{formatDateTime(job.created_at)}</p>
          </div>
        )) : <p className="text-stone-500">{emptyLabel}</p>}
      </div>
    </div>
  );
}

const ROLE_OPTIONS = ["user", "support", "analyst", "admin"];

export function AdminOverview({
  overview,
  loadingMoreUsers = false,
  loadingMoreJobs = false,
  loadingMoreLogs = false,
  roleUpdatingUserId = "",
  jobCancellingId = "",
  sessionRevokingId = "",
  deadLetterReplayingId = "",
  onLoadMoreUsers,
  onLoadMoreJobs,
  onLoadMoreLogs,
  onUpdateUserRole,
  onCancelJob,
  onRevokeSession,
  onReplayDeadLetter
}) {
  if (!overview) return null;

  const {
    totals,
    recentUsers,
    recentJobs,
    recentRequestLogs,
    recentUsersHasMore,
    recentJobsHasMore,
    recentRequestLogsHasMore,
    providerUsageTotals,
    providerUsageSummary,
    providerDailyUsage,
    providerLatencySummary,
    recentSessions,
    deadLetters,
    autoscalingHints
  } = overview;

  const groupedJobs = groupJobsByStatus(recentJobs);

  return (
    <section className="surface-card space-y-5 p-6 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Admin</p>
          <h3 className="mt-2 font-display text-3xl text-ink">Platform overview</h3>
        </div>
        <p className="max-w-xl text-sm leading-7 text-stone-600">A quick operational snapshot of signups, role management, note generation activity, provider usage, session hygiene, dead-letter recovery, and recent API traffic.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Users" value={totals.users} />
        <MetricCard label="Note Jobs" value={totals.noteJobs} tone="accent" />
        <MetricCard label="Completed" value={totals.completedJobs} tone="warm" />
        <MetricCard label="Processing" value={totals.processingJobs} tone="accent" helper="Queued and in progress" />
        <MetricCard label="Failed" value={totals.failedJobs} tone="danger" helper="Includes cancelled jobs" />
        <MetricCard label="AI Cost (7d)" value={formatUsd(providerUsageTotals?.total_estimated_cost_usd)} helper={`${formatNumber(providerUsageTotals?.fallback_count)} fallbacks`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Users</p>
              <h4 className="mt-1 font-display text-2xl text-ink">Role management</h4>
            </div>
          </div>
          <div className="space-y-3 text-sm text-stone-700">
            {recentUsers.length ? recentUsers.map((user) => (
              <div key={user.id} className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{user.name || user.email}</p>
                    <p className="mt-1 text-xs text-stone-500">{user.email}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-stone-400">Joined {formatDateTime(user.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
                      value={user.role || "user"}
                      onChange={(event) => onUpdateUserRole?.(user.id, event.target.value)}
                      disabled={roleUpdatingUserId === user.id}
                    >
                      {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )) : <p className="text-stone-500">No users yet.</p>}
          </div>
          {recentUsersHasMore ? (
            <button type="button" onClick={onLoadMoreUsers} disabled={loadingMoreUsers} className="mt-4 w-full rounded-full border border-stone-300 bg-white px-4 py-3 text-sm transition hover:bg-stone-50 disabled:opacity-60">
              {loadingMoreUsers ? "Loading..." : "Load More Users"}
            </button>
          ) : null}
        </div>

        <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
          <div className="mb-4">
            <p className="section-kicker">Chart</p>
            <h4 className="mt-1 font-display text-2xl text-ink">Requests by provider</h4>
          </div>
          {providerUsageSummary?.length ? <MiniBarChart items={providerUsageSummary} valueKey="request_count" labelKey="provider" tone="teal" /> : <p className="text-stone-500">No provider usage yet.</p>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <JobColumn title="Processing jobs" description="Active and queued generation runs. Admins can cancel these directly." jobs={groupedJobs.processing} emptyLabel="No processing jobs right now." tone="teal" cancellable cancellingJobId={jobCancellingId} onCancelJob={onCancelJob} />
        <JobColumn title="Completed jobs" description="Recently finished generations across all users." jobs={groupedJobs.completed} emptyLabel="No completed jobs yet." />
        <JobColumn title="Failed jobs" description="Failed or cancelled generations that may need review." jobs={groupedJobs.failed} emptyLabel="No failed jobs yet." tone="rose" />
      </div>

      {recentJobsHasMore ? (
        <button type="button" onClick={onLoadMoreJobs} disabled={loadingMoreJobs} className="w-full rounded-full border border-stone-300 bg-white px-4 py-3 text-sm transition hover:bg-stone-50 disabled:opacity-60">
          {loadingMoreJobs ? "Loading..." : "Load More Jobs"}
        </button>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
          <div className="mb-4">
            <p className="section-kicker">Sessions</p>
            <h4 className="mt-1 font-display text-2xl text-ink">Recent signed-in devices</h4>
          </div>
          <div className="space-y-3 text-sm text-stone-700">
            {recentSessions?.length ? recentSessions.map((session) => (
              <div key={session.id} className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{session.user_name || session.user_email}</p>
                    <p className="mt-1 text-xs text-stone-500">{joinWithDot([session.user_role || "user", session.ip_address || "Unknown IP"])}</p>
                    <p className="mt-2 text-xs text-stone-500">{joinWithDot([session.user_agent || "Unknown agent", `Last used ${formatDateTime(session.last_used_at)}`])}</p>
                  </div>
                  {!session.revoked_at ? (
                    <button type="button" onClick={() => onRevokeSession?.(session.id)} disabled={sessionRevokingId === session.id} className="rounded-full border border-red-300 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-red-700 transition hover:bg-red-50 disabled:opacity-60">
                      {sessionRevokingId === session.id ? "Revoking" : "Revoke"}
                    </button>
                  ) : <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">Revoked</span>}
                </div>
              </div>
            )) : <p className="text-stone-500">No refresh sessions recorded yet.</p>}
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
          <div className="mb-4">
            <p className="section-kicker">Recovery</p>
            <h4 className="mt-1 font-display text-2xl text-ink">Dead-letter queue</h4>
          </div>
          <div className="space-y-3 text-sm text-stone-700">
            {deadLetters?.length ? deadLetters.map((entry) => (
              <div key={entry.id} className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{entry.queue_name}</p>
                    <p className="mt-1 text-xs text-stone-500">{joinWithDot([entry.job_name || "Unknown job", entry.notes_job_id || "No note job"])}</p>
                    <p className="mt-2 text-xs text-stone-500">{joinWithDot([`Attempts ${formatNumber(entry.attempts_made)}/${formatNumber(entry.max_attempts)}`, `Replayed ${formatNumber(entry.replay_count || 0)}x`])}</p>
                    {entry.error_message ? <p className="mt-2 text-xs text-rose-600">{entry.error_message}</p> : null}
                  </div>
                  <button type="button" onClick={() => onReplayDeadLetter?.(entry.id)} disabled={deadLetterReplayingId === entry.id} className="rounded-full border border-teal-300 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-teal-700 transition hover:bg-teal-50 disabled:opacity-60">
                    {deadLetterReplayingId === entry.id ? "Replaying" : "Replay"}
                  </button>
                </div>
              </div>
            )) : <p className="text-stone-500">No dead-letter records yet.</p>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
          <div className="mb-4">
            <p className="section-kicker">Autoscaling</p>
            <h4 className="mt-1 font-display text-2xl text-ink">Queue pressure guidance</h4>
          </div>
          <div className="space-y-3 text-sm text-stone-700">
            {autoscalingHints?.queues?.length ? autoscalingHints.queues.map((hint) => (
              <div key={hint.queue} className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{hint.queue}</p>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{hint.pressure}</span>
                </div>
                <p className="mt-2 text-xs text-stone-500">{joinWithDot([`Backlog ${formatNumber(hint.backlog)}`, `In flight ${formatNumber(hint.inFlight)}`, `Recent dead letters ${formatNumber(hint.recentDeadLetters)}`])}</p>
                <p className="mt-2 text-xs text-stone-500">{joinWithDot([`Concurrency/instance ${formatNumber(hint.currentConcurrencyPerInstance)}`, `Suggested instances ${formatNumber(hint.recommendedInstances)}`])}</p>
                <p className="mt-2 text-xs text-stone-600">{hint.reason}</p>
              </div>
            )) : <p className="text-stone-500">No autoscaling hints available yet.</p>}
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
          <div className="mb-4">
            <p className="section-kicker">Latency</p>
            <h4 className="mt-1 font-display text-2xl text-ink">Provider performance summary</h4>
          </div>
          <div className="space-y-3 text-sm text-stone-700">
            {providerLatencySummary?.length ? providerLatencySummary.slice(0, 8).map((entry, index) => (
              <div key={`${entry.provider}-${entry.operation}-${index}`} className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{joinWithDot([entry.provider, entry.operation])}</p>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">p95 {formatNumber(entry.p95_latency_ms)}ms</span>
                </div>
                <p className="mt-2 text-xs text-stone-500">{joinWithDot([`p50 ${formatNumber(entry.p50_latency_ms)}ms`, `avg ${formatNumber(entry.avg_latency_ms)}ms`, `p99 ${formatNumber(entry.p99_latency_ms)}ms`])}</p>
                <p className="mt-2 text-xs text-stone-500">Samples {formatNumber(entry.sample_count)}</p>
              </div>
            )) : <p className="text-stone-500">No provider latency samples yet.</p>}
          </div>
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="section-kicker">API Logs</p>
            <h4 className="mt-1 font-display text-2xl text-ink">Recent request traffic</h4>
          </div>
        </div>
        <div className="space-y-3 text-sm text-stone-700">
          {recentRequestLogs?.length ? recentRequestLogs.map((log, index) => (
            <div key={`${log.request_id}-${log.created_at}-${index}`} className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-ink">{log.method} {log.path}</p>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{log.status_code}</span>
              </div>
              <p className="mt-2 text-xs text-stone-500">{joinWithDot([log.request_id, log.ip_address || "unknown ip"])}</p>
              <p className="mt-2 text-xs text-stone-500">{joinWithDot([`${log.duration_ms}ms`, formatDateTime(log.created_at)])}</p>
            </div>
          )) : <p className="text-stone-500">No request logs yet.</p>}
        </div>
        {recentRequestLogsHasMore ? (
          <button type="button" onClick={onLoadMoreLogs} disabled={loadingMoreLogs} className="mt-4 w-full rounded-full border border-stone-300 bg-white px-4 py-3 text-sm transition hover:bg-stone-50 disabled:opacity-60">
            {loadingMoreLogs ? "Loading..." : "Load More Logs"}
          </button>
        ) : null}
      </div>

      {(providerUsageSummary?.length || providerDailyUsage?.length) ? (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
            <div className="mb-4">
              <p className="section-kicker">AI Usage</p>
              <h4 className="mt-1 font-display text-2xl text-ink">Provider summary</h4>
            </div>
            <div className="space-y-3 text-sm text-stone-700">
              {providerUsageSummary?.length ? providerUsageSummary.map((summary) => {
                const successRate = summary.request_count ? Math.round((summary.success_count / summary.request_count) * 100) : 0;
                return (
                  <div key={summary.provider} className="rounded-[1.4rem] border border-stone-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{summary.provider}</p>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-stone-600">{successRate}% success</span>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">{joinWithDot([`${formatNumber(summary.request_count)} requests`, `${formatNumber(summary.success_count)} success`, `${formatNumber(summary.failure_count)} failure`])}</p>
                    <p className="mt-2 text-xs text-stone-500">{joinWithDot([`${formatNumber(summary.total_input_tokens)} in / ${formatNumber(summary.total_output_tokens)} out`, formatUsd(summary.total_estimated_cost_usd)])}</p>
                    <p className="mt-2 text-xs text-stone-500">{joinWithDot([`${formatNumber(summary.fallback_count)} fallbacks`, `${formatNumber(summary.circuit_open_count)} circuit blocks`])}</p>
                  </div>
                );
              }) : <p className="text-stone-500">No provider usage yet.</p>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.8rem] border border-stone-200 bg-stone-50/90 p-5">
              <div className="mb-4">
                <p className="section-kicker">Chart</p>
                <h4 className="mt-1 font-display text-2xl text-ink">Cost by provider</h4>
              </div>
              {providerUsageSummary?.length ? <MiniBarChart items={providerUsageSummary} valueKey="total_estimated_cost_usd" labelKey="provider" tone="amber" /> : <p className="text-stone-500">No provider cost data yet.</p>}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
