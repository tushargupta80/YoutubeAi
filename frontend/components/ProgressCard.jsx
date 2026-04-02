export function ProgressCard({ status, stage, progress, onCancel, isCancelling = false }) {
  const normalizedProgress = Math.max(0, Math.min(progress || 0, 100));
  const isIdle = !status;
  const canCancel = status === "queued" || status === "processing";

  return (
    <section className="surface-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Job Status</p>
          <h3 className="mt-2 font-display text-2xl text-ink">{isIdle ? "Ready for a new lecture" : String(status).replace(/_/g, " ")}</h3>
          <p className="mt-2 text-sm leading-7 text-stone-600">{stage || "Paste a YouTube video URL to begin."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canCancel && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCancelling ? "Cancelling..." : "Cancel Job"}
            </button>
          ) : null}
          <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700">
            {normalizedProgress}%
          </div>
        </div>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${normalizedProgress}%` }} />
      </div>
    </section>
  );
}