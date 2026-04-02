import { FeatureGrid } from "@/components/FeatureGrid";
import { AuthApp } from "@/components/AuthApp";

const pipelineSteps = [
  "Capture the transcript and normalize it for study use.",
  "Chunk the lecture, embed it, and retrieve the highest-signal context.",
  "Extract concepts, examples, and key takeaways.",
  "Generate final study notes and follow-up Q&A with Gemini."
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 md:px-8 lg:px-12">
      <div className="hero-orb hero-orb-left" />
      <div className="hero-orb hero-orb-right" />

      <div className="mx-auto max-w-7xl space-y-8">
        <section className="hero-panel grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.34em] text-stone-600">
              <span className="rounded-full border border-stone-300/80 bg-white/80 px-4 py-2">AI Study Workspace</span>
              <span className="rounded-full border border-teal-700/20 bg-teal-50 px-4 py-2 text-teal-900">Gemini + Ollama</span>
            </div>

            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.36em] text-stone-500">Lecture to Notes Pipeline</p>
              <h1 className="max-w-4xl font-display text-5xl leading-[1.02] text-ink md:text-7xl">
                Turn long YouTube lectures into polished study material.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-stone-700 md:text-lg">
                Generate structured notes, concept tables, flashcards, quizzes, and retrieval-backed answers in one workspace designed for actual revision.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="stat-card">
                <p className="stat-label">Output</p>
                <p className="stat-value">Notes + Quiz</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Workflow</p>
                <p className="stat-value">RAG + Summaries</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Use Case</p>
                <p className="stat-value">Revision Ready</p>
              </div>
            </div>
          </div>

          <div className="pipeline-panel">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">How It Works</p>
              <h2 className="font-display text-3xl text-ink">A calmer workflow for dense videos</h2>
            </div>

            <ol className="space-y-4">
              {pipelineSteps.map((step, index) => (
                <li key={step} className="pipeline-step">
                  <span className="pipeline-index">0{index + 1}</span>
                  <p className="text-sm leading-7 text-stone-700">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <FeatureGrid />
        <AuthApp />
      </div>
    </main>
  );
}