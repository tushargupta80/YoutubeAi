import { cancelNotesJob, deleteNotesJob, enqueueManualTranscriptNotesJob, enqueueNotesJob, fetchJobStatus } from "../services/job.service.js";
import { getBillingSummary } from "../services/billing.service.js";
import { listRecentNoteJobs } from "../services/notes.repository.js";

export async function generateNotes(req, res, next) {
  try {
    const { youtube_url: youtubeUrl } = req.body;
    if (!youtubeUrl) {
      return res.status(400).json({ error: "youtube_url is required" });
    }

    const { jobId, video, reusedJob, reuseScope, creditsCharged, balanceAfter } = await enqueueNotesJob(youtubeUrl, req.user.sub);
    return res.status(202).json({
      jobId,
      video: {
        id: video.id,
        title: video.title,
        youtubeUrl: video.youtube_url
      },
      status: reusedJob?.status || "queued",
      progress: reusedJob?.progress ?? 5,
      stage: reusedJob?.stage || "queued",
      reused: Boolean(reusedJob),
      reuseScope,
      billing: {
        creditsCharged: creditsCharged || 0,
        balanceAfter
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function generateNotesFromTranscript(req, res, next) {
  try {
    const { title, transcript } = req.body;
    if (!transcript || !String(transcript).trim()) {
      return res.status(400).json({ error: "transcript is required" });
    }

    if (String(transcript).trim().length < 120) {
      return res.status(400).json({ error: "Please paste a longer transcript so notes can be generated." });
    }

    const { jobId, video, reusedJob, reuseScope, creditsCharged, balanceAfter } = await enqueueManualTranscriptNotesJob({
      title,
      transcript,
      userId: req.user.sub
    });

    return res.status(202).json({
      jobId,
      video: {
        id: video.id,
        title: video.title,
        youtubeUrl: video.youtube_url
      },
      status: reusedJob?.status || "processing",
      progress: reusedJob?.progress ?? 30,
      stage: reusedJob?.stage || "manual transcript received",
      reused: Boolean(reusedJob),
      reuseScope,
      billing: {
        creditsCharged: creditsCharged || 0,
        balanceAfter
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function cancelJob(req, res, next) {
  try {
    const job = await cancelNotesJob(req.params.jobId, req.user.sub);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    const billing = await getBillingSummary(req.user.sub);
    return res.json({ job, billing });
  } catch (error) {
    return next(error);
  }
}

export async function deleteJob(req, res, next) {
  try {
    const deleted = await deleteNotesJob(req.params.jobId, req.user.sub);
    if (!deleted) {
      return res.status(404).json({ error: "Job not found" });
    }

    const billing = await getBillingSummary(req.user.sub);
    return res.json({ deleted, billing });
  } catch (error) {
    return next(error);
  }
}

export async function getJob(req, res, next) {
  try {
    const job = await fetchJobStatus(req.params.jobId, req.user.sub);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    return res.json(job);
  } catch (error) {
    return next(error);
  }
}

export async function getRecentJobs(req, res, next) {
  try {
    const limit = Number(req.query.limit || 12);
    const before = req.query.before || null;
    const status = req.query.status || null;
    const result = await listRecentNoteJobs(req.user.sub, { limit, before, status });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
