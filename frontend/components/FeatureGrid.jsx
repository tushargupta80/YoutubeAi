const features = [
  {
    title: "Structured Study Notes",
    description: "Readable notes with clear sections, concept grouping, and cleaner revision flow."
  },
  {
    title: "Hybrid AI Pipeline",
    description: "Gemini handles synthesis while Ollama supports preprocessing, retrieval, and fallback paths."
  },
  {
    title: "Retrieval-Backed Q&A",
    description: "Ask follow-up questions against the generated lecture context instead of guessing."
  },
  {
    title: "Flashcards and Quiz",
    description: "Convert a lecture into active recall material without leaving the workspace."
  },
  {
    title: "Job History",
    description: "Reopen earlier generations, compare outputs, and keep a durable study archive."
  },
  {
    title: "Runtime Diagnostics",
    description: "Check Gemini and Ollama availability directly from the UI before wasting a run."
  }
];

export function FeatureGrid() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {features.map((feature, index) => (
        <article key={feature.title} className="surface-card relative overflow-hidden p-5 md:p-6">
          <div className="absolute right-4 top-4 rounded-full bg-stone-100 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-stone-500">
            0{index + 1}
          </div>
          <p className="section-kicker">Capability</p>
          <h3 className="mt-3 font-display text-3xl leading-tight text-ink">{feature.title}</h3>
          <p className="mt-3 text-sm leading-7 text-stone-700">{feature.description}</p>
        </article>
      ))}
    </section>
  );
}