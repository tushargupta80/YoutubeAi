import { env } from "../../backend/config/env.js";
import { recordProviderFallback } from "../../backend/services/provider-metrics.service.js";
import { logError } from "../../backend/utils/logger.js";
import { callGeminiText } from "./provider.gemini.js";
import { getProviderPolicy } from "./provider-policy.js";
import { generateWithOllama } from "./ollamaProcessor.js";

const OLLAMA_FALLBACK_SECTION_LIMIT = 1800;

function capText(text, limit = OLLAMA_FALLBACK_SECTION_LIMIT) {
  if (!text) return "";
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

function extractSection(prompt, startMarker, endMarker) {
  const start = prompt.indexOf(startMarker);
  if (start === -1) return "";
  const sectionStart = start + startMarker.length;
  const end = endMarker ? prompt.indexOf(endMarker, sectionStart) : -1;
  const value = end === -1 ? prompt.slice(sectionStart) : prompt.slice(sectionStart, end);
  return value.trim();
}

function buildCompactOllamaNotesPrompt(prompt) {
  const title = extractSection(prompt, "Video title: ", "\n\nTranscript understanding:") || "Study Notes";
  const transcriptSummary = capText(extractSection(prompt, "Transcript understanding:\n", "\n\nExtracted concepts:"), 2200);
  const concepts = capText(extractSection(prompt, "Extracted concepts:\n", "\n\nRetrieved high-signal context:"), 1400);
  const context = capText(extractSection(prompt, "Retrieved high-signal context:\n", "\n\nReturn strict JSON with keys:"), 2200);

  return `You are an expert academic note creator. Create concise but structured study notes as valid JSON only.

Video title: ${title}

Transcript summary:
${transcriptSummary}

Concept signals:
${concepts}

Retrieved context:
${context}

Return valid JSON only with keys:
title, overview, keyConcepts, detailedExplanation, importantPoints, conceptTable, visualDiagram, examples, keyTakeaways, practiceQuestions, flashcards, quiz, timestampedNotes, topicPreview.

Rules:
- Keep each section focused and readable
- detailedExplanation must contain rich teaching explanations, not just labels or 1-line bullets
- Each detailedExplanation item should explain one idea in 2-4 full sentences
- conceptTable should be an array of objects with concept and explanation
- flashcards should be an array of objects with question and answer
- quiz should be an array of objects with question
- timestampedNotes should be an array of objects with timestamp and note
- topicPreview should be an array of objects with title, narration, and takeaway
- visualDiagram is optional
- include visualDiagram only when the topic clearly benefits from a useful Mermaid flow diagram
- if no helpful diagram exists, return visualDiagram as an empty string or "No diagram generated."`;
}

function splitBulletLines(value) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^[-*\u2022]\s*/, "").trim())
    .filter(Boolean);
}

function toArrayOfStrings(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return item.trim() ? [item.trim()] : [];
      if (item == null) return [];
      if (typeof item === "object") return Object.values(item).map((entry) => String(entry).trim()).filter(Boolean);
      return [String(item).trim()].filter(Boolean);
    });
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return [];

    const lines = normalized.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const bulletOnly = lines.length > 1 && lines.every((item) => /^[-*\u2022]/.test(item));
    if (bulletOnly) {
      return splitBulletLines(normalized).filter((item) => !item.startsWith('"title"') && !item.startsWith("{"));
    }

    const paragraphs = normalized
      .split(/\r?\n\s*\r?\n/)
      .map((item) => item.replace(/\s*\r?\n\s*/g, " ").trim())
      .filter(Boolean);

    if (paragraphs.length > 1) {
      return paragraphs.filter((item) => !item.startsWith('"title"') && !item.startsWith("{"));
    }

    return [normalized.replace(/\s*\r?\n\s*/g, " ").trim()].filter(Boolean);
  }

  if (value == null) return [];
  return [String(value).trim()].filter(Boolean);
}

function collapseLabeledExplanationSequence(items) {
  const values = items.map((item) => String(item || "").trim()).filter(Boolean);
  const normalized = [];

  for (let index = 0; index < values.length; index += 1) {
    const current = values[index].toLowerCase();
    const next = values[index + 1];
    const nextLabel = values[index + 2]?.toLowerCase();
    const nextValue = values[index + 3];

    if (["concept", "title", "heading"].includes(current) && next && ["explanation", "details", "content"].includes(nextLabel) && nextValue) {
      normalized.push({ concept: next, explanation: nextValue });
      index += 3;
      continue;
    }

    if (["concept", "title", "heading", "explanation", "details", "content"].includes(current)) {
      continue;
    }

    normalized.push(values[index]);
  }

  return normalized;
}

function toDetailedExplanationItems(value) {
  const fromArray = (items) => {
    const normalized = collapseLabeledExplanationSequence(items);
    return normalized.flatMap((item) => {
      if (typeof item === "string") return toArrayOfStrings(item);
      if (item == null) return [];
      if (typeof item === "object") {
        const concept = String(item.concept || item.title || item.heading || "").trim();
        const explanation = String(item.explanation || item.details || item.content || "").trim();
        if (concept || explanation) {
          return [{ concept, explanation: explanation || concept }];
        }
      }
      return [String(item).trim()].filter(Boolean);
    });
  };

  if (Array.isArray(value)) {
    return fromArray(value);
  }

  if (typeof value === "string") {
    const lines = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const labeledText = lines.some((item) => ["concept", "explanation", "details", "content"].includes(item.toLowerCase()));
    if (labeledText) {
      return fromArray(lines);
    }
    return toArrayOfStrings(value);
  }

  if (value && typeof value === "object") {
    const concept = String(value.concept || value.title || value.heading || "").trim();
    const explanation = String(value.explanation || value.details || value.content || "").trim();
    if (concept || explanation) {
      return [{ concept, explanation: explanation || concept }];
    }
  }

  if (value == null) return [];
  return [String(value).trim()].filter(Boolean);
}

function toArrayOfObjects(value, fallbackKeys) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) return item;
      return fallbackKeys.reduce((acc, key, index) => {
        acc[key] = index === 0 ? String(item ?? "") : "";
        return acc;
      }, {});
    });
  }

  if (value && typeof value === "object") {
    return [value];
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => fallbackKeys.reduce((acc, key, index) => {
        acc[key] = index === 0 ? line : "";
        return acc;
      }, {}));
  }

  return [];
}

function normalizeVisualDiagram(value) {
  if (typeof value !== "string") return "No diagram generated.";
  const trimmed = value.trim();
  if (!trimmed) return "No diagram generated.";
  if (["no diagram generated.", "none", "n/a", "not needed", "not required"].includes(trimmed.toLowerCase())) {
    return "No diagram generated.";
  }
  return trimmed;
}

function hasNonEmptyItems(items, key) {
  return Array.isArray(items) && items.some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (item && typeof item === "object") {
      if (key) return String(item[key] || "").trim().length > 0;
      return Object.values(item).some((value) => String(value || "").trim().length > 0);
    }
    return false;
  });
}

function pushSection(sections, heading, content) {
  const value = typeof content === "string" ? content.trim() : "";
  if (!value) return;
  sections.push(`## ${heading}\n${value}`);
}

function formatDetailedExplanationItem(item) {
  if (item && typeof item === "object") {
    const concept = String(item.concept || "").trim();
    const explanation = String(item.explanation || "").trim();
    if (concept && explanation) return `### ${concept}\n${explanation}`;
    return concept || explanation;
  }

  const value = String(item || "").trim();
  if (!value) return "";

  const match = value.match(/^([^:.]{3,60}):\s+(.+)/);
  if (match) {
    return `### ${match[1].trim()}\n${match[2].trim()}`;
  }

  return value;
}

function formatDetailedExplanationSection(items) {
  return items
    .map((item) => formatDetailedExplanationItem(item))
    .filter(Boolean)
    .join("\n\n");
}

function toMarkdown(payload) {
  const sections = [`# ${payload.title || "Study Notes"}`];

  pushSection(sections, "Overview", payload.overview || "");

  if (hasNonEmptyItems(payload.keyConcepts)) {
    pushSection(sections, "Key Concepts", payload.keyConcepts.map((item) => `- ${item}`).join("\n"));
  }

  if (hasNonEmptyItems(payload.detailedExplanation)) {
    pushSection(sections, "Detailed Explanation", formatDetailedExplanationSection(payload.detailedExplanation));
  }

  if (hasNonEmptyItems(payload.importantPoints)) {
    pushSection(sections, "Important Points", payload.importantPoints.map((item) => `> ${item}`).join("\n\n"));
  }

  if (hasNonEmptyItems(payload.conceptTable, "concept")) {
    const conceptRows = payload.conceptTable.map((row) => `| ${row.concept || ""} | ${row.explanation || ""} |`).join("\n");
    pushSection(sections, "Concept Table", `| Concept | Explanation |\n| --- | --- |\n${conceptRows}`);
  }

  if (payload.visualDiagram && payload.visualDiagram.trim() && payload.visualDiagram.trim() !== "No diagram generated.") {
    pushSection(sections, "Visual Diagram", `\`\`\`mermaid\n${payload.visualDiagram.trim()}\n\`\`\``);
  }

  if (hasNonEmptyItems(payload.examples)) {
    pushSection(sections, "Examples", payload.examples.map((item) => `- ${item}`).join("\n"));
  }

  if (hasNonEmptyItems(payload.keyTakeaways)) {
    pushSection(sections, "Key Takeaways", payload.keyTakeaways.map((item) => `- ${item}`).join("\n"));
  }

  if (hasNonEmptyItems(payload.practiceQuestions)) {
    pushSection(sections, "Practice Questions", payload.practiceQuestions.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  }

  if (hasNonEmptyItems(payload.flashcards, "question")) {
    const flashcards = payload.flashcards.map((item) => `- **Q:** ${item.question || ""}\n  **A:** ${item.answer || ""}`).join("\n");
    pushSection(sections, "Flashcards", flashcards);
  }

  if (hasNonEmptyItems(payload.quiz, "question")) {
    const quiz = payload.quiz.map((item, index) => `${index + 1}. ${item.question || item.prompt || ""}`).join("\n");
    pushSection(sections, "Quiz", quiz);
  }

  if (hasNonEmptyItems(payload.timestampedNotes, "note")) {
    const timestamped = payload.timestampedNotes.map((item) => `- **${item.timestamp || "TBD"}** ${item.note || ""}`).join("\n");
    pushSection(sections, "Timestamped Notes", timestamped);
  }

  return sections.join("\n\n");
}

function normalizeNotesPayload(parsed) {
  return {
    title: typeof parsed.title === "string" ? parsed.title : "Study Notes",
    overview: typeof parsed.overview === "string" ? parsed.overview : JSON.stringify(parsed.overview || ""),
    keyConcepts: toArrayOfStrings(parsed.keyConcepts),
    detailedExplanation: toDetailedExplanationItems(parsed.detailedExplanation),
    importantPoints: toArrayOfStrings(parsed.importantPoints),
    conceptTable: toArrayOfObjects(parsed.conceptTable, ["concept", "explanation"]),
    visualDiagram: normalizeVisualDiagram(parsed.visualDiagram),
    examples: toArrayOfStrings(parsed.examples),
    keyTakeaways: toArrayOfStrings(parsed.keyTakeaways),
    practiceQuestions: toArrayOfStrings(parsed.practiceQuestions),
    flashcards: toArrayOfObjects(parsed.flashcards, ["question", "answer"]),
    quiz: toArrayOfObjects(parsed.quiz, ["question"]),
    timestampedNotes: toArrayOfObjects(parsed.timestampedNotes, ["timestamp", "note"]),
    topicPreview: toArrayOfObjects(parsed.topicPreview, ["title", "narration", "takeaway"])
  };
}

function extractJson(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not include valid JSON.");
  }
  return trimmed.slice(start, end + 1);
}

function matchStringField(text, field) {
  const match = text.match(new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"(?=,\\s*"|\\s*})`, "i"));
  return match?.[1]?.replace(/\\n/g, "\n").trim() || "";
}

function matchArrayField(text, field) {
  const match = text.match(new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i"));
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1].trim()).filter(Boolean);
}

function repairJsonLikeNotes(text) {
  const title = matchStringField(text, "title") || "Study Notes";
  const overview = matchStringField(text, "overview") || text.split(/\r?\n/).slice(0, 2).join(" ").trim();
  const keyConcepts = matchArrayField(text, "keyConcepts");
  const detailedExplanation = matchArrayField(text, "detailedExplanation");
  const importantPoints = matchArrayField(text, "importantPoints");
  const examples = matchArrayField(text, "examples");
  const keyTakeaways = matchArrayField(text, "keyTakeaways");
  const practiceQuestions = matchArrayField(text, "practiceQuestions");

  return normalizeNotesPayload({
    title,
    overview,
    keyConcepts,
    detailedExplanation: detailedExplanation.length ? detailedExplanation : keyConcepts,
    importantPoints: importantPoints.length ? importantPoints : keyConcepts.slice(0, 4),
    conceptTable: [],
    visualDiagram: "No diagram generated.",
    examples,
    keyTakeaways: keyTakeaways.length ? keyTakeaways : keyConcepts,
    practiceQuestions,
    flashcards: [],
    quiz: [],
    timestampedNotes: [],
    topicPreview: []
  });
}

function tryParseNotesJson(text) {
  const candidates = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced);

  const jsonSlice = (() => {
    try {
      return extractJson(text);
    } catch {
      return "";
    }
  })();
  if (jsonSlice) candidates.push(jsonSlice);

  for (const candidate of candidates) {
    try {
      return normalizeNotesPayload(JSON.parse(candidate));
    } catch {
      // try next candidate
    }
  }

  if (text.includes('"title"') || text.includes('"overview"')) {
    return repairJsonLikeNotes(text);
  }

  const title = text.match(/(?:^|\n)#?\s*Title:?\s*(.+)/i)?.[1]?.trim() || "Study Notes";
  const bulletLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("{") && !line.startsWith('"title"') && !line.startsWith('"overview"'));

  return normalizeNotesPayload({
    title,
    overview: bulletLines.slice(0, 3).join(" "),
    keyConcepts: bulletLines.slice(0, 5),
    detailedExplanation: bulletLines.slice(0, 8),
    importantPoints: bulletLines.slice(0, 4),
    conceptTable: [],
    visualDiagram: "No diagram generated.",
    examples: [],
    keyTakeaways: bulletLines.slice(0, 5),
    practiceQuestions: [],
    flashcards: [],
    quiz: [],
    timestampedNotes: [],
    topicPreview: []
  });
}

async function generateStructuredNotesWithOllama(prompt, model) {
  const compactPrompt = `${buildCompactOllamaNotesPrompt(prompt)}\n\nReturn only valid JSON. Do not wrap it in markdown fences.`;

  try {
    const raw = await generateWithOllama(compactPrompt, { temperature: 0.2, num_predict: 900 }, model);
    const parsed = tryParseNotesJson(raw);
    return {
      provider: "ollama",
      notesJson: parsed,
      notesMarkdown: toMarkdown(parsed),
      flashcards: parsed.flashcards || [],
      quiz: parsed.quiz || []
    };
  } catch {
    const rescueRaw = await generateWithOllama(compactPrompt, { temperature: 0.1, num_predict: 700 }, env.ollamaPreprocessModel);
    const rescueParsed = tryParseNotesJson(rescueRaw);
    return {
      provider: "ollama",
      notesJson: rescueParsed,
      notesMarkdown: toMarkdown(rescueParsed),
      flashcards: rescueParsed.flashcards || [],
      quiz: rescueParsed.quiz || []
    };
  }
}

export async function generateStructuredNotes(prompt) {
  const policy = getProviderPolicy("structured_notes");

  if (!env.geminiApiKey) {
    return generateStructuredNotesWithOllama(prompt, policy.fallbackModel);
  }

  try {
    const geminiResult = await callGeminiText({
      prompt,
      operation: "generate-structured-notes",
      temperature: 0.3,
      maxOutputTokens: 4096,
      json: true
    });
    const parsed = tryParseNotesJson(geminiResult.text);
    return {
      provider: "gemini",
      notesJson: parsed,
      notesMarkdown: toMarkdown(parsed),
      flashcards: parsed.flashcards || [],
      quiz: parsed.quiz || []
    };
  } catch (error) {
    logError("Gemini notes generation failed, falling back to Ollama", error, {
      model: env.geminiModel,
      baseUrl: env.geminiBaseUrl,
      fallbackDisabled: !policy.allowOllamaFallback
    });
    if (!policy.allowOllamaFallback) throw error;
    recordProviderFallback({
      operation: "structured_notes",
      fromProvider: "gemini",
      toProvider: "ollama",
      reason: error.message,
      model: env.geminiModel
    });
    return generateStructuredNotesWithOllama(prompt, policy.fallbackModel);
  }
}

export async function extractConceptsWithGemini(prompt) {
  const policy = getProviderPolicy("concept_extraction");

  if (!env.geminiApiKey) {
    throw new Error("Gemini API key is not configured for concept extraction.");
  }

  try {
    const geminiResult = await callGeminiText({
      prompt,
      operation: "extract-concepts",
      temperature: 0.1,
      maxOutputTokens: 900,
      json: true,
      timeoutMs: Math.min(env.geminiTimeoutMs, 45000),
      maxRetries: 1
    });
    return JSON.parse(extractJson(geminiResult.text));
  } catch (error) {
    logError("Gemini concept extraction failed", error, {
      model: env.geminiModel,
      baseUrl: env.geminiBaseUrl,
      fallbackDisabled: !policy.allowOllamaFallback
    });
    if (!policy.allowOllamaFallback) throw error;
    recordProviderFallback({
      operation: "concept_extraction",
      fromProvider: "gemini",
      toProvider: "ollama",
      reason: error.message,
      model: env.geminiModel
    });
    throw error;
  }
}

export async function answerQuestionWithGemini(prompt) {
  const policy = getProviderPolicy("question_answer");

  if (!env.geminiApiKey) {
    return generateWithOllama(capText(prompt, 2800), { temperature: 0.2, num_predict: 280 }, policy.fallbackModel);
  }

  try {
    const geminiResult = await callGeminiText({
      prompt,
      operation: "answer-question",
      temperature: 0.2,
      maxOutputTokens: 512
    });
    return geminiResult.text;
  } catch (error) {
    logError("Gemini question answering failed, falling back to Ollama", error, {
      model: env.geminiModel,
      baseUrl: env.geminiBaseUrl,
      fallbackDisabled: !policy.allowOllamaFallback
    });
    if (!policy.allowOllamaFallback) throw error;
    recordProviderFallback({
      operation: "question_answer",
      fromProvider: "gemini",
      toProvider: "ollama",
      reason: error.message,
      model: env.geminiModel
    });
    return generateWithOllama(capText(prompt, 2800), { temperature: 0.2, num_predict: 280 }, policy.fallbackModel);
  }
}
