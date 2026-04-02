import { answerQuestionViaQueue } from "../services/question.service.js";
import { getVideoForUser } from "../services/video.repository.js";
import { saveQuestionLog } from "../services/notes.repository.js";

export async function askQuestion(req, res, next) {
  try {
    const { video_id: videoId, question } = req.body;
    if (!videoId || !question) {
      return res.status(400).json({ error: "video_id and question are required" });
    }

    const video = await getVideoForUser(videoId, req.user.sub);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    const answer = await answerQuestionViaQueue({
      videoId,
      title: video.title || `YouTube Video ${video.youtube_video_id}`,
      question,
      userId: req.user.sub
    });

    await saveQuestionLog(req.user.sub, videoId, question, answer);
    return res.json({ answer });
  } catch (error) {
    return next(error);
  }
}
