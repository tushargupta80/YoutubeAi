"use client";

import { Children, useEffect, useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { downloadStyledPdf } from "@/lib/pdf";
import { normalizeNotesJson } from "@/lib/notes-format";

function formatProcessingTime(seconds) {
  if (!seconds) return "";
  if (seconds < 60) return `${seconds}s processing`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s processing` : `${minutes}m processing`;
}

function stripLeadingTitle(markdown, title) {
  if (!markdown) return "";

  const trimmed = markdown.trimStart();
  const lines = trimmed.split(/\r?\n/);
  if (!lines.length) return markdown;

  const firstLine = lines[0].trim();
  const headingText = firstLine.replace(/^#\s+/, "").trim();
  const normalizedTitle = (title || "").trim();

  if (firstLine.startsWith("# ") && headingText && normalizedTitle && headingText.toLowerCase() === normalizedTitle.toLowerCase()) {
    return lines.slice(1).join("\n").trimStart();
  }

  return markdown;
}

function normalizeMermaidSource(source) {
  return source
    .replace(/^###\s+.*$/gm, "")
    .replace(/^```mermaid\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function sanitizeMermaidLabel(value) {
  return String(value || "")
    .replace(/[{}\[\]<>|]/g, " ")
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stabilizeMermaidSource(source) {
  const normalized = normalizeMermaidSource(source);
  if (!normalized) return "";

  const lines = normalized.split(/\r?\n/);
  const stabilized = lines.map((line, index) => {
    if (index === 0 && /^\s*(graph|flowchart)\b/i.test(line)) {
      return line.trim();
    }

    return line.replace(/\b([A-Za-z][A-Za-z0-9_]*)\s*(\[[^\]]*\]|\([^\)]*\)|\{[^\}]*\}|>[^\]]*\])/g, (_match, nodeId, rawLabel) => {
      const label = sanitizeMermaidLabel(rawLabel.slice(1, -1));
      return `${nodeId}["${label || nodeId}"]`;
    });
  });

  const diagram = stabilized.join("\n").trim();
  if (!/^\s*(graph|flowchart)\b/i.test(diagram)) {
    return `graph TD\n${diagram}`;
  }
  return diagram;
}

function getMermaidViewModel(source) {
  const stabilized = stabilizeMermaidSource(source);
  if (!stabilized) return null;
  return { source: stabilized };
}

function getPlainHeading(children) {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim()
    .toLowerCase();
}

function extractReadableText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (!value) return "";

  if (Array.isArray(value)) {
    return value.map((item) => extractReadableText(item)).filter(Boolean).join(" ").trim();
  }

  if (typeof value === "object") {
    const preferredKeys = ["text", "content", "narration", "summary", "explanation", "takeaway", "title", "label", "value"];
    for (const key of preferredKeys) {
      const extracted = extractReadableText(value[key]);
      if (extracted) return extracted;
    }

    return Object.values(value)
      .map((item) => extractReadableText(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return "";
}

function deriveTopicPreviewSlides(notesJson, title) {
  if (!notesJson) return [];
  const notes = normalizeNotesJson(notesJson);

  const previewFromModel = Array.isArray(notes.topicPreview)
    ? notes.topicPreview
      .map((item, index) => ({
        id: `preview-${index}`,
        title: extractReadableText(item.title || item.heading || item.label),
        narration: extractReadableText(item.narration || item.summary || item.explanation || item.content),
        takeaway: extractReadableText(item.takeaway || item.keyPoint || item.summary)
      }))
      .filter((item) => item.title || item.narration)
    : [];

  if (previewFromModel.length) return previewFromModel.slice(0, 5);

  const derived = [];
  if (notes.overview) {
    derived.push({
      id: "preview-overview",
      title: "What this video is about",
      narration: notes.overview,
      takeaway: notes.keyTakeaways?.[0] || "Start here to understand the main message of the lesson."
    });
  }

  const explanationItems = Array.isArray(notes.detailedExplanation) ? notes.detailedExplanation : [];
  explanationItems.slice(0, 3).forEach((item, index) => {
    if (item && typeof item === "object") {
      derived.push({
        id: `preview-expl-${index}`,
        title: extractReadableText(item.concept) || `Key idea ${index + 1}`,
        narration: extractReadableText(item.explanation || item.concept),
        takeaway: notes.keyConcepts?.[index] || "Important concept"
      });
      return;
    }

    const value = String(item || "").trim();
    if (!value) return;
    const match = value.match(/^([^:.]{3,60}):\s+(.+)/);
    derived.push({
      id: `preview-text-${index}`,
      title: match ? match[1].trim() : notes.keyConcepts?.[index] || `Key idea ${index + 1}`,
      narration: match ? match[2].trim() : value,
      takeaway: notes.keyTakeaways?.[index] || "Useful revision point"
    });
  });

  if (!derived.length && Array.isArray(notes.keyConcepts)) {
    notes.keyConcepts.slice(0, 3).forEach((concept, index) => {
      derived.push({
        id: `preview-concept-${index}`,
        title: concept,
        narration: `This part of the lesson focuses on ${concept.toLowerCase()}. Read the notes below for the full explanation and examples.`,
        takeaway: notes.keyTakeaways?.[index] || concept
      });
    });
  }

  return derived.slice(0, 5).map((item, index) => ({
    ...item,
    title: extractReadableText(item.title) || `${title || "Topic"} Preview ${index + 1}`,
    narration: extractReadableText(item.narration) || extractReadableText(item.takeaway) || "This slide summarizes an important idea from the video.",
    takeaway: extractReadableText(item.takeaway) || "Quick understanding point"
  }));
}

function toHinglishText(text) {
  const readableText = extractReadableText(text);
  if (!readableText) return "";

  const replacements = [
    [/This video/gi, "Ye video"],
    [/This part of the lesson/gi, "Is lesson ka ye part"],
    [/This lesson/gi, "Ye lesson"],
    [/This topic/gi, "Ye topic"],
    [/What this video is about/gi, "Ye video kis baare mein hai"],
    [/focuses on/gi, "focus karta hai"],
    [/explains/gi, "samjhata hai"],
    [/means/gi, "ka matlab hota hai"],
    [/because/gi, "kyunki"],
    [/so/gi, "isliye"],
    [/therefore/gi, "isi liye"],
    [/however/gi, "lekin"],
    [/for example/gi, "for example"],
    [/in simple terms/gi, "simple words mein"],
    [/the main idea/gi, "main idea"],
    [/important/gi, "important"],
    [/understand/gi, "samajhna"],
    [/understanding/gi, "samajh"],
    [/remember/gi, "yaad rakho"],
    [/start here/gi, "yahin se start karo"],
    [/quick understanding point/gi, "jaldi samajhne wala point"],
    [/useful revision point/gi, "revision ke liye useful point"]
  ];

  let output = readableText;
  replacements.forEach(([pattern, replacement]) => {
    output = output.replace(pattern, replacement);
  });

  output = output
    .replace(/\bIt is\b/g, "Ye hai")
    .replace(/\bIt helps\b/g, "Ye help karta hai")
    .replace(/\bIt shows\b/g, "Ye dikhata hai")
    .replace(/\bThey are\b/g, "Ye log hote hain")
    .replace(/\bYou can think of it as\b/gi, "Aap isse aise samajh sakte ho jaise")
    .replace(/\bThink of it as\b/gi, "Isse aise samjho jaise")
    .replace(/\bIn other words\b/gi, "Dusre words mein")
    .replace(/\bthat is why\b/gi, "isi wajah se")
    .replace(/\bThis is why\b/gi, "Isi wajah se")
    .replace(/\bThe goal is to\b/gi, "Goal ye hai ki")
    .replace(/\bThe reason is\b/gi, "Reason ye hai ki");

  if (!/[.!?]$/.test(output)) {
    output += ".";
  }

  return output;
}

function toHinglishSlide(slide) {
  return {
    ...slide,
    title: toHinglishText(slide.title),
    narration: toHinglishText(slide.narration),
    takeaway: toHinglishText(slide.takeaway)
  };
}

function DiagramHeading({ children }) {
  return (
    <div className="diagram-section-heading">
      <p className="diagram-section-kicker">Visual Map</p>
      <h2>{children}</h2>
      <p className="diagram-section-copy">Use this as a quick mental model for the topic using a real rendered flow diagram.</p>
    </div>
  );
}

function TopicPreviewReel({ title, slides }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [languageMode, setLanguageMode] = useState("english");

  const previewSlides = useMemo(() => {
    if (languageMode === "hinglish") {
      return slides.map((slide) => toHinglishSlide(slide));
    }
    return slides;
  }, [languageMode, slides]);

  useEffect(() => {
    setActiveIndex(0);
    setIsPlaying(false);
    setIsNarrating(false);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [slides, languageMode]);

  useEffect(() => {
    if (!isPlaying || !previewSlides.length) return undefined;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(`${previewSlides[activeIndex].title}. ${previewSlides[activeIndex].narration}. Quick takeaway. ${previewSlides[activeIndex].takeaway}`);
      const voices = window.speechSynthesis.getVoices?.() || [];
      const preferredVoice = languageMode === "hinglish"
        ? voices.find((voice) => /hi-IN|Hindi/i.test(`${voice.lang} ${voice.name}`)) || voices.find((voice) => /en-IN|India/i.test(`${voice.lang} ${voice.name}`))
        : voices.find((voice) => /en-IN|en-US|en-GB/i.test(voice.lang));
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.lang = languageMode === "hinglish" ? (preferredVoice?.lang || "hi-IN") : (preferredVoice?.lang || "en-US");
      utterance.rate = languageMode === "hinglish" ? 0.95 : 1;
      utterance.pitch = 1;
      utterance.onstart = () => setIsNarrating(true);
      utterance.onend = () => {
        setIsNarrating(false);
        if (activeIndex < previewSlides.length - 1) {
          setActiveIndex((current) => current + 1);
        } else {
          setIsPlaying(false);
        }
      };
      utterance.onerror = () => {
        setIsNarrating(false);
        setIsPlaying(false);
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

      return () => {
        window.speechSynthesis.cancel();
        setIsNarrating(false);
      };
    }

    const timeout = window.setTimeout(() => {
      if (activeIndex < previewSlides.length - 1) {
        setActiveIndex((current) => current + 1);
      } else {
        setIsPlaying(false);
      }
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [activeIndex, isPlaying, languageMode, previewSlides]);

  if (!previewSlides.length) return null;
  const activeSlide = previewSlides[activeIndex];

  function handlePlayPause() {
    if (!previewSlides.length) return;
    if (isPlaying) {
      setIsPlaying(false);
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsNarrating(false);
      return;
    }

    setIsPlaying(true);
  }

  function handleSelect(index) {
    setActiveIndex(index);
    if (isPlaying && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsNarrating(false);
    }
  }

  return (
    <section className="topic-preview-shell">
      <div className="topic-preview-header">
        <div>
          <p className="topic-preview-kicker">AI Topic Preview</p>
          <h3 className="topic-preview-title">Start with a quick explainer reel</h3>
        </div>
        <div className="topic-preview-actions">
          <div className="topic-preview-language-toggle" role="tablist" aria-label="Preview language mode">
            <button
              type="button"
              className={`topic-preview-language-pill ${languageMode === "english" ? "is-active" : ""}`}
              onClick={() => setLanguageMode("english")}
            >
              English
            </button>
            <button
              type="button"
              className={`topic-preview-language-pill ${languageMode === "hinglish" ? "is-active" : ""}`}
              onClick={() => setLanguageMode("hinglish")}
            >
              Hinglish
            </button>
          </div>
          <button type="button" className="topic-preview-button topic-preview-button-primary" onClick={handlePlayPause}>
            {isPlaying ? "Pause Explainer" : `Play ${languageMode === "hinglish" ? "Hinglish" : "English"} Explainer`}
          </button>
          <span className="topic-preview-status">{isNarrating ? `${languageMode === "hinglish" ? "Hinglish" : "English"} narration` : `${activeIndex + 1} / ${previewSlides.length}`}</span>
        </div>
      </div>

      <div className="topic-preview-stage">
        <div className="topic-preview-screen">
          <div className="topic-preview-orb topic-preview-orb-left" aria-hidden="true" />
          <div className="topic-preview-orb topic-preview-orb-right" aria-hidden="true" />
          <div className="topic-preview-slide-card">
            <p className="topic-preview-slide-index">{languageMode === "hinglish" ? "Hinglish explainer" : `Explainer for ${title || "this lesson"}`}</p>
            <h4 className="topic-preview-slide-title">{activeSlide.title}</h4>
            <p className="topic-preview-slide-copy">{activeSlide.narration}</p>
            <div className="topic-preview-takeaway">
              <span>Quick takeaway</span>
              <strong>{activeSlide.takeaway}</strong>
            </div>
          </div>
        </div>

        <div className="topic-preview-timeline" role="tablist" aria-label="Topic preview slides">
          {previewSlides.map((slide, index) => (
            <button
              key={slide.id || `${slide.title}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              className={`topic-preview-chip ${index === activeIndex ? "is-active" : ""}`}
              onClick={() => handleSelect(index)}
            >
              <span className="topic-preview-chip-step">{index + 1}</span>
              <span className="topic-preview-chip-title">{slide.title}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function MermaidSvgRenderer({ source, id, onRendered, onError }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose", flowchart: { curve: "basis" } });
        const result = await mermaid.render(`mermaid-${id}`, source);
        if (!cancelled) {
          setSvg(result.svg);
          onRendered?.();
        }
      } catch {
        if (!cancelled) {
          onError?.("The diagram could not be rendered cleanly, so the cleaned diagram source is shown instead.");
        }
      }
    }

    renderChart();
    return () => {
      cancelled = true;
    };
  }, [id, onError, onRendered, source]);

  if (!svg) return null;
  return <div className="mermaid-card" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function MermaidBlock({ chart }) {
  const [error, setError] = useState("");
  const id = useId().replace(/:/g, "-");
  const diagramModel = getMermaidViewModel(chart);
  const sourcePreview = diagramModel?.source || stabilizeMermaidSource(chart);

  return (
    <section className="diagram-shell">
      <div className="diagram-shell-header">
        <div>
          <p className="diagram-shell-kicker">Diagram View</p>
          <h3 className="diagram-shell-title">Flow Diagram</h3>
        </div>
        <p className="diagram-shell-hint">A rendered flowchart to help users see the sequence and structure of the topic visually.</p>
      </div>

      <div className="diagram-canvas">
        <div className="diagram-canvas-grid" aria-hidden="true" />
        {diagramModel ? (
          <MermaidSvgRenderer
            id={id}
            source={sourcePreview}
            onRendered={() => setError("")}
            onError={(message) => setError(message)}
          />
        ) : null}
        {(!diagramModel || error) ? (
          <div className="mermaid-card mermaid-fallback">
            <p className="diagram-fallback-copy">{error || "The diagram source could not be converted into a clean flowchart, so the cleaned Mermaid source is shown below."}</p>
            <pre>{sourcePreview}</pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MarkdownCode({ children, className }) {
  const value = String(children || "").replace(/\n$/, "");
  const language = className?.replace("language-", "") || "";

  if (language === "mermaid") {
    return <MermaidBlock chart={value} />;
  }

  return (
    <pre>
      <code className={className}>{value}</code>
    </pre>
  );
}

function MarkdownHeadingTwo({ children }) {
  const plainHeading = getPlainHeading(children);
  if (plainHeading === "visual diagram") {
    return <DiagramHeading>{children}</DiagramHeading>;
  }
  return <h2>{children}</h2>;
}

export function NotesViewer({ notes, notesJson, title, onCopy, copyLabel, provider, processingSeconds }) {
  const exportRef = useRef(null);
  const topicPreviewSlides = useMemo(() => deriveTopicPreviewSlides(notesJson, title), [notesJson, title]);

  if (!notes) return null;

  const providerLabel = provider === "gemini" ? "Generated with Gemini" : provider === "ollama" ? "Generated with Ollama" : "Generated Notes";
  const processingLabel = formatProcessingTime(processingSeconds);
  const displayNotes = stripLeadingTitle(notes, title);

  return (
    <section className="surface-card overflow-hidden p-6 md:p-7" ref={exportRef}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="section-kicker">Generated Notes</p>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-600">{providerLabel}</span>
            {processingLabel ? <span className="rounded-full bg-accentSoft px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-700">{processingLabel}</span> : null}
          </div>
          <h2 className="max-w-4xl font-display text-4xl leading-tight text-ink md:text-5xl">{title || "Study Notes"}</h2>
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm transition hover:bg-stone-50" onClick={onCopy}>{copyLabel}</button>
          <button className="rounded-full bg-ink px-4 py-2 text-sm text-white transition hover:opacity-95" onClick={() => downloadStyledPdf(title, exportRef.current)}>Download PDF</button>
        </div>
      </div>

      {topicPreviewSlides.length ? <div className="mt-6"><TopicPreviewReel title={title} slides={topicPreviewSlides} /></div> : null}

      <article className="prose-notes mt-6 max-w-none text-stone-800">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: MarkdownCode, h2: MarkdownHeadingTwo }}>{displayNotes}</ReactMarkdown>
      </article>
    </section>
  );
}
