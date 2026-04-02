import { YoutubeTranscript, fetchTranscript } from "youtube-transcript/dist/youtube-transcript.esm.js";

export async function extractTranscript(youtubeUrl) {
  const transcriptClient = YoutubeTranscript?.fetchTranscript ? YoutubeTranscript : { fetchTranscript };
  const transcript = await transcriptClient.fetchTranscript(youtubeUrl);
  const items = transcript.map((item, index) => ({
    index,
    text: item.text.trim(),
    offset: item.offset,
    duration: item.duration
  }));

  return {
    transcript: items,
    plainText: items.map((item) => item.text).join(" ")
  };
}