export function normalizeJobErrorMessage(message) {
  const rawMessage = String(message || "").trim();
  if (!rawMessage) {
    return "Something went wrong while generating notes. Please try again.";
  }

  const normalized = rawMessage.toLowerCase();
  if (
    normalized.includes("quota exceeded")
    || normalized.includes("billing details")
    || normalized.includes("rate limit")
    || normalized.includes("resource exhausted")
    || normalized.includes("generate_content_free_tier_requests")
    || normalized.includes("insufficient_credits")
    || normalized.includes("need credits")
    || normalized.includes("top up")
    || normalized.includes("payment required")
  ) {
    return "AI generation is temporarily unavailable because the model quota or billing limit has been reached. Please add credits, wait for the quota to reset, or try again later.";
  }

  if (
    normalized.includes("too many requests")
    || normalized.includes("captcha")
    || normalized.includes("youtube is receiving too many requests")
  ) {
    return "YouTube temporarily blocked transcript access for this video. Please try again in a few minutes, try another video, or paste the transcript manually.";
  }

  if (
    normalized.includes("transcript is disabled")
    || normalized.includes("could not retrieve a transcript")
    || normalized.includes("no transcript")
    || normalized.includes("subtitles are disabled")
    || normalized.includes("available languages")
    || (normalized.includes("youtubetranscript") && normalized.includes("transcript"))
    || (normalized.includes("youtubetranscript") && normalized.includes("caption"))
    || normalized.includes("caption")
  ) {
    return "We couldn't fetch the transcript automatically for this video. If captions exist on YouTube, paste the transcript manually and continue.";
  }

  return rawMessage;
}