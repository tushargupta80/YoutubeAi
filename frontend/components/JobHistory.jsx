"use client";

import { normalizeJobErrorMessage } from "@/lib/job-errors";

function formatAge(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

export function JobHistory({ jobs, activeJobId, onSelect, hasMore = false, loadingMore = false, onLoadMore }) {
  return (
    <div className="space-y-3">
      {jobs.length === 0 ? <p className="text-sm text-stone-600">No generations yet.</p> : null}
      {jobs.map((job) => (
        <button
          key={job.id}
          onClick={() => onSelect(job)}
          className={`w-full rounded-[1.6rem] border px-4 py-4 text-left transition ${activeJobId === job.id ? "border-ink bg-stone-100" : "border-stone-200 bg-stone-50 hover:bg-white"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium leading-6 text-stone-800">{job.video_title || job.youtube_video_id || "Untitled video"}</p>
              <p className="mt-1 text-xs text-stone-500">{formatAge(job.created_at)}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-600">{job.status}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.15em] text-stone-500">
            {job.generation_provider ? <span>{job.generation_provider}</span> : null}
            {job.processing_seconds ? <span>{job.processing_seconds}s</span> : null}
          </div>
          {job.status === "failed" && job.error_message ? (
            <p className="mt-3 text-sm leading-7 text-amber-800">{normalizeJobErrorMessage(job.error_message)}</p>
          ) : null}
        </button>
      ))}

      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full rounded-full border border-stone-300 bg-white px-4 py-3 text-sm transition hover:bg-stone-50 disabled:opacity-60"
        >
          {loadingMore ? "Loading..." : "Load More History"}
        </button>
      ) : null}
    </div>
  );
}
