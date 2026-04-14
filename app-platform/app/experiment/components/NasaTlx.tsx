"use client";

import { useState, useCallback, useEffect } from "react";

interface NasaTlxProps {
  runId: string;
  participantId: string;
  sessionId: string;
  taskType: string;
  modelId: string;
  runNumber: number;
  onComplete: () => void;
}

interface TlxQuestion {
  id: number;
  question_text: string;
  sub_label: string;
  low_label: string;
  high_label: string;
  scale_type: "likert5" | "likert7";
  scale_group: "nasa_tlx" | "ai_subjective" | "custom";
  task_scope: string;
  display_order: number;
}

const SCALE_MAX: Record<string, number>     = { likert5: 5, likert7: 7 };
const SCALE_DEFAULT: Record<string, number> = { likert5: 3, likert7: 4 };

const GROUP_LABELS: Record<string, { label: string; color: string }> = {
  nasa_tlx:      { label: "NASA Task Load Index",         color: "var(--accent-blue)" },
  ai_subjective: { label: "AI Interaction Dimensions",    color: "var(--accent-teal)" },
  custom:        { label: "Additional Questions",         color: "var(--accent-amber)" },
};

export default function NasaTlx({
  runId, participantId, sessionId, taskType, modelId, runNumber, onComplete,
}: NasaTlxProps) {
  const [questions, setQuestions] = useState<TlxQuestion[]>([]);
  const [answers, setAnswers]     = useState<Record<number, number>>({});
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);

  // Fetch all active questions for this task type from DB
  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch(`/api/tlx-questions?scope=${taskType}&active=1`);
        const data = await res.json();
        const qs: TlxQuestion[] = data.questions || [];
        setQuestions(qs);
        // Initialise answers to midpoints
        const defaults: Record<number, number> = {};
        qs.forEach(q => { defaults[q.id] = SCALE_DEFAULT[q.scale_type] ?? 4; });
        setAnswers(defaults);
      } catch {
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [taskType]);

  const handleChange = useCallback((id: number, value: number) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await fetch("/api/surveys/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id:         runId,
          participant_id: participantId,
          session_id:     sessionId,
          task_type:      taskType,
          model_id:       modelId,
          answers: questions.map(q => ({
            question_id: q.id,
            answer:      answers[q.id] ?? SCALE_DEFAULT[q.scale_type],
          })),
        }),
      });
      setSubmitted(true);
      setTimeout(onComplete, 1200);
    } catch {
      setSubmitting(false);
    }
  }, [questions, answers, runId, participantId, sessionId, taskType, modelId, onComplete]);

  // ── Group questions by scale_group for display ─────────────────
  const groups: Record<string, TlxQuestion[]> = {};
  for (const q of questions) {
    if (!groups[q.scale_group]) groups[q.scale_group] = [];
    groups[q.scale_group].push(q);
  }
  // Render groups in this order
  const groupOrder = ["nasa_tlx", "ai_subjective", "custom"];

  const renderSlider = (q: TlxQuestion) => (
    <div key={q.id} className="slider-container">
      {q.sub_label && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 2 }}>
          {q.sub_label}
        </p>
      )}
      <div className="slider-label">
        <span style={{ fontWeight: 500 }}>{q.question_text}</span>
        <span>{answers[q.id] ?? SCALE_DEFAULT[q.scale_type]}</span>
      </div>
      <input
        type="range"
        id={`q-${q.id}`}
        min={1}
        max={SCALE_MAX[q.scale_type] ?? 7}
        value={answers[q.id] ?? SCALE_DEFAULT[q.scale_type]}
        onChange={e => handleChange(q.id, parseInt(e.target.value))}
      />
      <div className="flex justify-between" style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
        <span>{q.low_label}</span>
        <span>{q.high_label}</span>
      </div>
    </div>
  );

  if (submitted) {
    return (
      <div className="glass-card fade-in" style={{ padding: 48, textAlign: "center" }}>
        <div style={{ marginBottom: 16, color: "var(--accent-emerald)", fontSize: "2rem" }}>[OK]</div>
        <h3>Survey Submitted</h3>
        <p style={{ color: "var(--text-muted)", marginTop: 8 }}>Moving to next task...</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: 32 }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <span className="badge badge-teal" style={{ marginBottom: 12, display: "inline-block" }}>
          Post-Task Survey - Run {runNumber}
        </span>
        <h2 style={{ marginBottom: 4 }}>Workload Survey</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Rate your experience on each dimension
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <span className="spinner" style={{ width: 24, height: 24, margin: "0 auto 12px", display: "block" }} />
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading survey...</p>
        </div>
      ) : questions.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          <p>No survey questions configured. Contact the researcher.</p>
        </div>
      ) : (
        <>
          {groupOrder.map(group => {
            const qs = groups[group];
            if (!qs || qs.length === 0) return null;
            const cfg = GROUP_LABELS[group];
            return (
              <div key={group} style={{ marginBottom: 32 }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
                  <h4 style={{
                    fontSize: "0.78rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-dim)",
                  }}>
                    {cfg?.label ?? group}
                  </h4>
                  <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
                </div>
                <div className="flex flex-col gap-6">
                  {qs.map(renderSlider)}
                </div>
              </div>
            );
          })}
        </>
      )}

      <button
        id="submit-survey-btn"
        className="btn btn-primary btn-lg"
        onClick={handleSubmit}
        disabled={submitting || loading || questions.length === 0}
        style={{ width: "100%" }}
      >
        {submitting ? (
          <>
            <span className="spinner" style={{ width: 16, height: 16 }} />
            Submitting...
          </>
        ) : "Submit Survey →"}
      </button>
    </div>
  );
}
