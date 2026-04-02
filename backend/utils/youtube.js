import getVideoId from "youtube-video-id";

export function extractVideoId(youtubeUrl) {
  const videoId = getVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error("Invalid YouTube URL.");
  }
  return videoId;
}
