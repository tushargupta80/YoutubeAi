import { splitTranscript } from "../../ai_pipeline/chunking/splitTranscript.js";
import { createEmbeddings } from "../../ai_pipeline/embeddings/ollamaEmbeddings.js";
import { retrieveRelevantChunks } from "../../ai_pipeline/retriever/retrieveRelevantChunks.js";
import {
  buildConceptExtractionPrompt,
  buildFinalNotesPrompt,
  buildQuestionAnswerPrompt
} from "../../ai_pipeline/generator/prompts.js";
import { extractConceptsWithOllama } from "../../ai_pipeline/generator/ollamaProcessor.js";
import {
  answerQuestionWithGemini,
  extractConceptsWithGemini,
  generateStructuredNotes
} from "../../ai_pipeline/generator/geminiGenerator.js";
import { extractTranscript } from "../../ai_pipeline/transcript/extractTranscript.js";
import { vectorStore } from "./vector-store.js";
import { getVideoById, upsertVideo } from "./video.repository.js";
import { env } from "../config/env.js";
import { logError } from "../utils/logger.js";

const MAX_CONCEPT_CHUNKS = 2;
const MAX_PROMPT_CHARS = 2200;
const MAX_SUMMARY_CHARS = 6000;
const DEFAULT_TITLE = "Study Notes";

function capText(text, maxChars = MAX_PROMPT_CHARS) {
  if (!text) return "";
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function localCleanTranscript(items) {
  return items
    .map((item) => item.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\b(um|uh|you know|like)\b/gi, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function summarizeChunkLocally(chunk) {
  const sentences = chunk.text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.slice(0, 3).join(" ") || capText(chunk.text, 280);
}

function normalizeConceptAnalysis(chunk, analysis) {
  if (!analysis || typeof analysis !== "object") {
    return {
      summary: summarizeChunkLocally(chunk),
      concepts: [],
      examples: [],
      caveats: []
    };
  }

  return {
    summary: typeof analysis.summary === "string" && analysis.summary.trim() ? analysis.summary.trim() : summarizeChunkLocally(chunk),
    concepts: Array.isArray(analysis.concepts) ? analysis.concepts : [],
    examples: Array.isArray(analysis.examples) ? analysis.examples : [],
    caveats: Array.isArray(analysis.caveats) ? analysis.caveats : []
  };
}

async function extractConceptAnalysis(chunk) {
  const prompt = buildConceptExtractionPrompt(capText(chunk.text));

  if (env.geminiApiKey) {
    try {
      const analysis = await extractConceptsWithGemini(prompt);
      return normalizeConceptAnalysis(chunk, analysis);
    } catch (error) {
      logError("Gemini concept extraction failed, falling back to Ollama", error, { chunkId: chunk.id });
    }
  }

  try {
    const analysis = await extractConceptsWithOllama(prompt);
    return normalizeConceptAnalysis(chunk, analysis);
  } catch (error) {
    logError("Concept extraction chunk failed, using local summary", error, { chunkId: chunk.id });
    return normalizeConceptAnalysis(chunk, null);
  }
}

async function extractConceptAnalyses(chunks) {
  const conceptAnalyses = [];

  for (const chunk of chunks.slice(0, MAX_CONCEPT_CHUNKS)) {
    conceptAnalyses.push(await extractConceptAnalysis(chunk));
  }

  return conceptAnalyses;
}

function buildTranscriptSummary(conceptAnalyses, cleanedTranscript) {
  const conceptSummary = conceptAnalyses
    .map((item) => item.summary)
    .filter(Boolean)
    .join("\n");

  return capText(conceptSummary || cleanedTranscript, MAX_SUMMARY_CHARS);
}

export async function extractVideoArtifacts({ youtubeUrl, onProgress }) {
  onProgress?.(15, "extracting transcript");
  const extracted = await extractTranscript(youtubeUrl);

  onProgress?.(30, "normalizing transcript");
  const cleanedTranscript = localCleanTranscript(extracted.transcript);

  return {
    transcriptItems: extracted.transcript,
    transcript: extracted.plainText,
    cleanedTranscript,
    durationSeconds: Math.round((extracted.transcript.at(-1)?.offset || 0) / 1000)
  };
}

export async function embedVideoArtifacts({ videoId, transcriptItems, onProgress }) {
  let items = transcriptItems;

  if (!items) {
    const video = await getVideoById(videoId);
    items = video?.transcript_items || [];
  }

  if (!Array.isArray(items) || !items.length) {
    throw new Error("Transcript items are required for embedding stage.");
  }

  onProgress?.(40, "chunking transcript");
  const chunks = splitTranscript(items, { chunkSize: 700, overlap: 120 });

  onProgress?.(58, "embedding chunks");
  const embeddings = await createEmbeddings(chunks.map((chunk) => chunk.text));
  const vectorRecords = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index]
  }));

  await vectorStore.save(videoId, vectorRecords);

  return {
    chunkCount: chunks.length
  };
}

export async function generateNotesFromArtifacts({ videoId, title, onProgress }) {
  const video = await getVideoById(videoId);
  if (!video) {
    throw new Error(`Video ${videoId} not found for notes generation.`);
  }

  const chunks = await vectorStore.list(videoId);
  if (!chunks.length) {
    throw new Error("No vector chunks found for this video. Embedding stage may have failed.");
  }

  const cleanedTranscript = video.cleaned_transcript || video.transcript || "";
  const resolvedTitle = title || video.title || DEFAULT_TITLE;

  onProgress?.(70, `extracting concepts with ${env.geminiApiKey ? "gemini" : "ollama"}`);
  const conceptAnalyses = await extractConceptAnalyses(chunks);
  if (!conceptAnalyses.length) {
    conceptAnalyses.push({
      summary: capText(cleanedTranscript, 320),
      concepts: [],
      examples: [],
      caveats: []
    });
  }

  onProgress?.(82, "retrieving high-signal context");
  const retrieved = await retrieveRelevantChunks(
    videoId,
    "main ideas, definitions, examples, and exam-worthy explanations",
    env.defaultTopK
  );

  const retrievedContext = retrieved
    .map((item) => `[${Math.round(item.startMs / 1000)}s - ${Math.round(item.endMs / 1000)}s] ${item.text}`)
    .join("\n\n");

  onProgress?.(92, `generating final notes with ${env.geminiApiKey ? "gemini" : "ollama"}`);

  const notes = await generateStructuredNotes(buildFinalNotesPrompt({
    title: resolvedTitle,
    transcriptSummary: buildTranscriptSummary(conceptAnalyses, cleanedTranscript),
    concepts: conceptAnalyses,
    retrievedContext: capText(retrievedContext, MAX_SUMMARY_CHARS)
  }));

  return {
    ...notes,
    transcript: video.transcript || "",
    cleanedTranscript,
    durationSeconds: video.duration_seconds || 0,
    chunkCount: chunks.length
  };
}

export async function runNotesPipeline({ youtubeUrl, title, videoId, onProgress }) {
  const extracted = await extractVideoArtifacts({ youtubeUrl, onProgress });

  await upsertVideo({
    youtubeUrl,
    videoId: undefined,
    title,
    transcript: extracted.transcript,
    transcriptItems: extracted.transcriptItems,
    cleanedTranscript: extracted.cleanedTranscript,
    durationSeconds: extracted.durationSeconds
  });

  const embedded = await embedVideoArtifacts({
    videoId,
    transcriptItems: extracted.transcriptItems,
    onProgress
  });

  const notes = await generateNotesFromArtifacts({ videoId, title, onProgress });

  return {
    ...notes,
    transcript: extracted.transcript || notes.transcript,
    cleanedTranscript: extracted.cleanedTranscript || notes.cleanedTranscript,
    durationSeconds: extracted.durationSeconds || notes.durationSeconds,
    chunkCount: embedded.chunkCount || notes.chunkCount
  };
}

export async function answerVideoQuestion({ videoId, title, question }) {
  const relevant = await retrieveRelevantChunks(videoId, question, env.defaultTopK);
  const context = relevant
    .map((item) => `Timestamp ${Math.round(item.startMs / 1000)}s: ${item.text}`)
    .join("\n\n");

  return answerQuestionWithGemini(buildQuestionAnswerPrompt({ question, context: capText(context, 4000), title }));
}
