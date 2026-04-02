"use client";

import { useEffect, useMemo, useState } from "react";
import { cancelJob, generateNotes } from "@/services/api";
import { useJobStatus } from "@/hooks/useJobStatus";
import { useRecentJobs } from "@/hooks/useRecentJobs";
import { getDisplayNotes } from "@/lib/notes-format";
import { ProgressCard } from "@/components/ProgressCard";
import { NotesViewer } from "@/components/NotesViewer";
import { QuestionBox } from "@/components/QuestionBox";
import { JobHistory } from "@/components/JobHistory";

function formatHistoryDate(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleString();
}

function isActiveJob(job) {
  return job?.status === "queued" || job?.status === "processing";
}

export function GenerateForm({ billing, onRefreshBilling }) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [notesJson, setNotesJson] = useState(null);
  const [videoId, setVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [processingSeconds, setProcessingSeconds] = useState(null);
  const [error, setError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy Notes");
  const [showHistory, setShowHistory] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const history = useRecentJobs({ limit: 8, autoLoad: true });
  const jobStatus = useJobStatus({
    onJobUpdated(nextJob) {
      if (nextJob?.status === "completed" || nextJob?.status === "failed") {
        history.refresh().catch(() => {});
        onRefreshBilling?.().catch?.(() => {});
      }
    }
  });

  const trackedJobStatus = jobStatus.job?.status || "";
  const recentJobStatus = history.recentJob?.status || "";
  const hasActiveJob = ["queued", "processing"].includes(trackedJobStatus)
    || (!jobStatus.jobId && ["queued", "processing"].includes(recentJobStatus));

  const notEnoughCredits = typeof billing?.balance === "number" && typeof billing?.noteGenerationCreditCost === "number"
    ? billing.balance < billing.noteGenerationCreditCost
    : false;

  const cancellableJob = useMemo(() => {
    if (isActiveJob(jobStatus.job)) {
      return jobStatus.job;
    }

    if (isActiveJob(history.recentJob)) {
      return history.recentJob;
    }

    return null;
  }, [history.recentJob, jobStatus.job]);

  useEffect(() => {
    if (history.error) {
      setError(history.error);
    }
  }, [history.error]);

  useEffect(() => {
    if (jobStatus.error) {
      setError(jobStatus.error);
    }
  }, [jobStatus.error]);

  useEffect(() => {
    const currentJob = jobStatus.job;
    if (!currentJob) return;

    if (currentJob.notes_markdown || currentJob.notes_json) {
      setNotes(getDisplayNotes(currentJob));
      setNotesJson(currentJob.notes_json || null);
      setVideoId(currentJob.video_id || "");
      setTitle(currentJob.video_title || currentJob.notes_json?.title || "Study Notes");
      setProvider(currentJob.generation_provider || "");
      setProcessingSeconds(currentJob.processing_seconds || null);
      return;
    }

    if (!currentJob.notes_markdown && !currentJob.notes_json) {
      setNotes("");
      setNotesJson(null);
      setVideoId("");
      setTitle(currentJob.video_title || "Study Notes");
      setProvider(currentJob.generation_provider || "");
      setProcessingSeconds(currentJob.processing_seconds || null);
    }
  }, [jobStatus.job]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (hasActiveJob) {
      setError("A notes job is already running. Please wait for it to finish.");
      return;
    }

    if (notEnoughCredits) {
      setError(`You need ${billing.noteGenerationCreditCost} credits to generate notes. Please top up first.`);
      return;
    }

    setError("");
    setNotes("");
    setNotesJson(null);
    setVideoId("");
    setProvider("");
    setProcessingSeconds(null);

    try {
      const response = await generateNotes(youtubeUrl);
      jobStatus.startTracking(response);
      setTitle(response.video?.title || "Study Notes");
      await history.refresh();
      await onRefreshBilling?.();
    } catch (requestError) {
      if (requestError.status === 429) {
        setError("A notes job is already running. Please wait for it to finish.");
        return;
      }

      setError(requestError.message);
      await onRefreshBilling?.();
    }
  }

  async function handleCancelJob(jobToCancel = cancellableJob) {
    if (!jobToCancel?.id || isCancelling) return;

    setIsCancelling(true);
    setError("");

    try {
      const response = await cancelJob(jobToCancel.id);
      jobStatus.setJob(response.job || response);
      await history.refresh();
      await onRefreshBilling?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleSelectJob(selectedJob) {
    setError("");
    jobStatus.startTracking(selectedJob);

    try {
      const response = await jobStatus.refreshJob(selectedJob.id);
      if (response) {
        setShowHistory(false);
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleLoadMoreHistory() {
    try {
      await history.loadMore();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function copyNotes() {
    await navigator.clipboard.writeText(notes);
    setCopyLabel("Copied");
    setTimeout(() => setCopyLabel("Copy Notes"), 1600);
  }

  return (
    <div className="space-y-6">
      <section className="surface-card p-5 md:p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="section-kicker">Generate</p>
            <h3 className="mt-2 font-display text-3xl text-ink">Drop in a lecture link</h3>
            <p className="mt-2 text-sm leading-7 text-stone-600">Paste a YouTube URL and generate notes, revision prompts, and Q&amp;A context in one run.</p>
          </div>

          {billing ? (
            <div className="rounded-[1.4rem] border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>Available credits: <strong>{billing.balance}</strong></span>
                <span>Per notes run: <strong>{billing.noteGenerationCreditCost}</strong></span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 md:flex-row">
            <input
              className="min-w-0 flex-1 rounded-full border border-stone-300 bg-stone-50 px-5 py-4 text-sm outline-none transition focus:border-teal-700"
              placeholder="Paste a YouTube URL"
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
            />
            <button
              className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-4 text-sm font-medium text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 md:min-w-[180px]"
              disabled={!youtubeUrl.trim() || hasActiveJob || notEnoughCredits}
            >
              {hasActiveJob ? "Processing..." : notEnoughCredits ? "Need credits" : "Generate Notes"}
            </button>
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </form>
      </section>

      <section className="surface-card p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="section-kicker">History</p>
            <h3 className="mt-2 font-display text-3xl text-ink">Recent generation</h3>
            <p className="mt-2 text-sm leading-7 text-stone-600">Keep the workspace focused on your latest run and open the full archive only when you need it.</p>
          </div>
          <button
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-50"
            onClick={() => setShowHistory((value) => !value)}
            type="button"
          >
            {showHistory ? "Hide History" : "View Full History"}
          </button>
        </div>

        {history.recentJob ? (
          <div className="mt-5 rounded-[1.6rem] border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button type="button" onClick={() => handleSelectJob(history.recentJob)} className="min-w-0 flex-1 text-left">
                <p className="line-clamp-2 text-base font-medium leading-7 text-stone-800">{history.recentJob.video_title || history.recentJob.youtube_video_id || "Untitled video"}</p>
                <p className="mt-1 text-xs text-stone-500">{formatHistoryDate(history.recentJob.created_at)}</p>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                {isActiveJob(history.recentJob) ? (
                  <button
                    type="button"
                    onClick={() => handleCancelJob(history.recentJob)}
                    disabled={isCancelling}
                    className="rounded-full border border-red-300 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {isCancelling ? "Cancelling" : "Cancel"}
                  </button>
                ) : null}
                <span className="rounded-full bg-white px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-600">{history.recentJob.status}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.15em] text-stone-500">
              {history.recentJob.generation_provider ? <span>{history.recentJob.generation_provider}</span> : null}
              {history.recentJob.processing_seconds ? <span>{history.recentJob.processing_seconds}s</span> : null}
            </div>
          </div>
        ) : history.loading ? (
          <p className="mt-5 text-sm text-stone-600">Loading recent generations...</p>
        ) : (
          <p className="mt-5 text-sm text-stone-600">No generations yet.</p>
        )}

        {showHistory ? (
          <div className="mt-5 border-t border-stone-200 pt-5">
            <JobHistory
              jobs={history.jobs}
              activeJobId={jobStatus.jobId}
              onSelect={handleSelectJob}
              hasMore={history.hasMore}
              loadingMore={history.loadingMore}
              onLoadMore={handleLoadMoreHistory}
            />
          </div>
        ) : null}
      </section>

      <ProgressCard
        status={jobStatus.job?.status}
        stage={jobStatus.job?.stage}
        progress={jobStatus.job?.progress}
        onCancel={cancellableJob ? () => handleCancelJob(cancellableJob) : null}
        isCancelling={isCancelling}
      />
      <NotesViewer
        notes={notes}
        notesJson={notesJson}
        title={title}
        onCopy={copyNotes}
        copyLabel={copyLabel}
        provider={provider}
        processingSeconds={processingSeconds}
      />
      <QuestionBox videoId={videoId} />
    </div>
  );
}
