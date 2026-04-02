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
      if (typeof item === "object") {
        return Object.values(item).map((entry) => String(entry).trim()).filter(Boolean);
      }
      return [String(item).trim()].filter(Boolean);
    });
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return [];

    const lines = normalized.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const bulletOnly = lines.length > 1 && lines.every((item) => /^[-*\u2022]/.test(item));
    if (bulletOnly) {
      return splitBulletLines(normalized).filter((item) => !item.startsWith('"title"') && !item.startsWith('"overview"') && item !== "{" && item !== "}");
    }

    const paragraphs = normalized
      .split(/\r?\n\s*\r?\n/)
      .map((item) => item.replace(/\s*\r?\n\s*/g, " ").trim())
      .filter(Boolean);

    if (paragraphs.length > 1) {
      return paragraphs.filter((item) => !item.startsWith('"title"') && !item.startsWith('"overview"') && item !== "{" && item !== "}");
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

function toArrayOfObjects(value, keys) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) return item;
        const row = {};
        keys.forEach((key, index) => {
          row[key] = index === 0 ? String(item ?? "") : "";
        });
        return row;
      })
      .filter(Boolean);
  }

  if (value && typeof value === "object") return [value];
  return [];
}

export function normalizeNotesJson(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    title: typeof source.title === "string" ? source.title : "Study Notes",
    overview: typeof source.overview === "string" ? source.overview : "",
    keyConcepts: toArrayOfStrings(source.keyConcepts),
    detailedExplanation: toDetailedExplanationItems(source.detailedExplanation),
    importantPoints: toArrayOfStrings(source.importantPoints),
    conceptTable: toArrayOfObjects(source.conceptTable, ["concept", "explanation"]),
    visualDiagram: typeof source.visualDiagram === "string" && source.visualDiagram.trim() ? source.visualDiagram : "No diagram generated.",
    examples: toArrayOfStrings(source.examples),
    keyTakeaways: toArrayOfStrings(source.keyTakeaways),
    practiceQuestions: toArrayOfStrings(source.practiceQuestions),
    flashcards: toArrayOfObjects(source.flashcards, ["question", "answer"]),
    quiz: toArrayOfObjects(source.quiz, ["question"]),
    timestampedNotes: toArrayOfObjects(source.timestampedNotes, ["timestamp", "note"]),
    topicPreview: toArrayOfObjects(source.topicPreview, ["title", "narration", "takeaway"])
  };
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

export function buildMarkdownFromNotesJson(payload) {
  const notes = normalizeNotesJson(payload);
  const sections = [`# ${notes.title || "Study Notes"}`];

  pushSection(sections, "Overview", notes.overview || "");

  if (hasNonEmptyItems(notes.keyConcepts)) {
    pushSection(sections, "Key Concepts", notes.keyConcepts.map((item) => `- ${item}`).join("\n"));
  }

  if (hasNonEmptyItems(notes.detailedExplanation)) {
    pushSection(sections, "Detailed Explanation", formatDetailedExplanationSection(notes.detailedExplanation));
  }

  if (hasNonEmptyItems(notes.importantPoints)) {
    pushSection(sections, "Important Points", notes.importantPoints.map((item) => `> ${item}`).join("\n\n"));
  }

  if (hasNonEmptyItems(notes.conceptTable, "concept")) {
    const conceptRows = notes.conceptTable.map((row) => `| ${row.concept || ""} | ${row.explanation || ""} |`).join("\n");
    pushSection(sections, "Concept Table", `| Concept | Explanation |\n| --- | --- |\n${conceptRows}`);
  }

  if (notes.visualDiagram && notes.visualDiagram.trim() && notes.visualDiagram.trim() !== "No diagram generated.") {
    pushSection(sections, "Visual Diagram", `\`\`\`mermaid\n${notes.visualDiagram.trim()}\n\`\`\``);
  }

  if (hasNonEmptyItems(notes.examples)) {
    pushSection(sections, "Examples", notes.examples.map((item) => `- ${item}`).join("\n"));
  }

  if (hasNonEmptyItems(notes.keyTakeaways)) {
    pushSection(sections, "Key Takeaways", notes.keyTakeaways.map((item) => `- ${item}`).join("\n"));
  }

  if (hasNonEmptyItems(notes.practiceQuestions)) {
    pushSection(sections, "Practice Questions", notes.practiceQuestions.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  }

  if (hasNonEmptyItems(notes.flashcards, "question")) {
    const flashcards = notes.flashcards.map((item) => `- **Q:** ${item.question || ""}\n  **A:** ${item.answer || ""}`).join("\n");
    pushSection(sections, "Flashcards", flashcards);
  }

  if (hasNonEmptyItems(notes.quiz, "question")) {
    const quiz = notes.quiz.map((item, index) => `${index + 1}. ${item.question || item.prompt || ""}`).join("\n");
    pushSection(sections, "Quiz", quiz);
  }

  if (hasNonEmptyItems(notes.timestampedNotes, "note")) {
    const timestamped = notes.timestampedNotes.map((item) => `- **${item.timestamp || "TBD"}** ${item.note || ""}`).join("\n");
    pushSection(sections, "Timestamped Notes", timestamped);
  }

  return sections.join("\n\n");
}

function looksCorruptedMarkdown(markdown) {
  if (!markdown || typeof markdown !== "string") return false;
  return (
    markdown.includes("## Overview\n{") ||
    markdown.includes("\n- {") ||
    markdown.includes('"title":') ||
    markdown.includes('"overview":') ||
    markdown.includes('"keyConcepts": [') ||
    /## Detailed Explanation[\s\S]*?\nconcept\n/i.test(markdown) ||
    /## Detailed Explanation[\s\S]*?\nexplanation\n/i.test(markdown)
  );
}

export function getDisplayNotes(jobResponse) {
  const rawMarkdown = jobResponse?.notes_markdown || "";
  const notesJson = jobResponse?.notes_json;
  if (notesJson && (!rawMarkdown || looksCorruptedMarkdown(rawMarkdown))) {
    return buildMarkdownFromNotesJson(notesJson);
  }
  return rawMarkdown;
}
