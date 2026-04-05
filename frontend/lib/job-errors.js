export function normalizeJobErrorMessage(message) {
  const rawMessage = String(message || "").trim();
  if (!rawMessage) {
    return "Something went wrong while generating notes. Please try again.";
  }

  const normalized = rawMessage.toLowerCase();
  if (
    normalized.includes("too many requests")
    || normalized.includes("captcha")
    || normalized.includes("youtube is receiving too many requests")
    || normalized.includes("youtubetranscript")
  ) {
    return "YouTube temporarily blocked transcript access for this video. Please try again in a few minutes, try another video, or paste the transcript manually.";
  }

  if (
    normalized.includes("transcript is disabled")
    || normalized.includes("could not retrieve a transcript")
    || normalized.includes("no transcript")
    || normalized.includes("subtitles are disabled")
    || normalized.includes("caption")
  ) {
    return "Transcript not available for this video. Try another video, turn on captions, or use a video with public subtitles.";
  }

  return rawMessage;
}

export function isTranscriptFallbackError(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("transcript not available")
    || normalized.includes("temporarily blocked transcript access")
    || normalized.includes("too many requests")
    || normalized.includes("captcha")
    || normalized.includes("youtubetranscript")
  );
}
