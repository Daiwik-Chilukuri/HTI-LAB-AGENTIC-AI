"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface DemographicQuestion {
  id: number;
  question_text: string;
  question_type: string;
  options: string;
  display_order: number;
}

export default function PreSurveyPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<DemographicQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sessionData = sessionStorage.getItem("session");
    if (!sessionData) {
      router.push("/");
      return;
    }

    fetch("/api/demographic")
      .then(r => r.json())
      .then(data => {
        setQuestions(data.questions || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load questions. Please try again.");
        setLoading(false);
      });
  }, [router]);

  const handleSubmit = async () => {
    const sessionData = sessionStorage.getItem("session");
    if (!sessionData) return;

    // Validate required questions (age and gender) are answered
    const unansweredRequired = questions.filter(q => {
      const isRequired = q.question_text.toLowerCase().includes("age") ||
                          q.question_text.toLowerCase().includes("gender");
      return isRequired && !answers[q.id]?.trim();
    });

    if (unansweredRequired.length > 0) {
      setError("Please answer all required questions before continuing.");
      return;
    }

    const session = JSON.parse(sessionData);
    const responses = Object.entries(answers).map(([question_id, response_text]) => ({
      question_id: Number(question_id),
      response_text,
    }));

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/demographic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_id: session.participant_id,
          session_id: session.session_id,
          responses,
        }),
      });

      if (!res.ok) throw new Error("Failed to submit");

      router.push("/experiment");
    } catch {
      setError("Failed to submit. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <main className="fade-in" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ maxWidth: 600, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {/* Clipboard icon */}
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/>
              <line x1="9" y1="16" x2="13" y2="16"/>
            </svg>
          </div>
          <h2 style={{ marginBottom: 8 }}>Pre-Study Survey</h2>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
            Please answer these brief background questions before starting the experiment.
            Your responses are confidential.
          </p>
        </div>

        <div className="glass-card" style={{ padding: 32 }}>
          {questions.length === 0 && !loading && (
            <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
              No questions configured. You can add them at /htilab-nexus → Pre-Study Survey.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {[...questions].sort((a, b) => a.display_order - b.display_order).map((q) => {
              let options: string[] = [];
              try { options = JSON.parse(q.options); } catch { /* */ }

              return (
                <div key={q.id}>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: 8, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                    {q.question_text}
                  </label>

                  {q.question_type === "text" && (
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="Type your answer here..."
                      value={answers[q.id] || ""}
                      onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                      style={{ resize: "vertical" }}
                    />
                  )}

                  {q.question_type === "number" && (
                    <input
                      className="input"
                      type="number"
                      placeholder="Enter a number..."
                      value={answers[q.id] || ""}
                      onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                      style={{ maxWidth: 200 }}
                    />
                  )}

                  {q.question_type === "select" && options.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {options.map((opt) => (
                        <label key={opt} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={opt}
                            checked={answers[q.id] === opt}
                            onChange={() => setAnswers(a => ({ ...a, [q.id]: opt }))}
                            style={{ accentColor: "var(--accent-amber)", width: 16, height: 16 }}
                          />
                          <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <p style={{ color: "var(--accent-rose)", fontSize: "0.82rem", marginTop: 16, padding: "8px 12px", background: "rgba(244,63,94,0.08)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(244,63,94,0.2)" }}>
              {error}
            </p>
          )}

          {(() => {
            const unansweredRequired = questions.filter(q => {
              const isRequired = q.question_text.toLowerCase().includes("age") ||
                                  q.question_text.toLowerCase().includes("gender");
              return isRequired && !answers[q.id]?.trim();
            });
            const allAnswered = unansweredRequired.length === 0;

            return (
              <>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSubmit}
            disabled={submitting || questions.length === 0 || !allAnswered}
            style={{ width: "100%", marginTop: 28, opacity: (questions.length === 0 || !allAnswered) ? 0.5 : 1 }}
          >
            {submitting ? (
              <><span className="spinner" style={{ width: 16, height: 16 }} /> Submitting...</>
            ) : (
              "Begin Experiment →"
            )}
          </button>
          {!allAnswered && questions.length > 0 && (
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
              Please answer all required questions (age and gender) to continue.
            </p>
          )}
              </>
            );
          })()}
        </div>
      </div>
    </main>
  );
}
