export function normalizeJobErrorMessage(message) {
  const rawMessage = String(message || "").trim();
  if (!rawMessage) {
    return "Something went wrong while generating notes. Please try again.";
  }

  const normalized = rawMessage.toLowerCase();
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
