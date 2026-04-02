"use client";

import { useState } from "react";
import { askQuestion } from "@/services/api";

export function QuestionBox({ videoId }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAsk(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await askQuestion(videoId, question);
      setAnswer(response.answer);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  if (!videoId) return null;

  return (
    <section className="surface-card p-6 md:p-7">
      <div className="mb-4">
        <p className="section-kicker">Ask Questions</p>
        <h3 className="mt-2 font-display text-3xl text-ink">Interrogate the lecture</h3>
        <p className="mt-2 text-sm leading-7 text-stone-600">Ask about a definition, example, timeline, or argument from this specific video.</p>
      </div>

      <form className="space-y-3" onSubmit={handleAsk}>
        <textarea
          className="min-h-32 w-full rounded-[1.6rem] border border-stone-300 bg-stone-50 px-4 py-4 text-sm outline-none transition focus:border-amber-700"
          placeholder="Ask about a definition, example, argument, or timestamp..."
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button className="rounded-full bg-rust px-5 py-3 text-sm text-white transition hover:opacity-95 disabled:opacity-60" disabled={loading || !question.trim()}>
          {loading ? "Thinking..." : "Ask Question"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {answer ? <div className="mt-4 whitespace-pre-wrap rounded-[1.6rem] bg-stone-100 p-4 text-sm leading-7 text-stone-800">{answer}</div> : null}
    </section>
  );
}