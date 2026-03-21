"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import CodingTask from "./components/CodingTask";
import PuzzleTask from "./components/PuzzleTask";
import WritingTask from "./components/WritingTask";
import NasaTlx from "./components/NasaTlx";
import Timer from "./components/Timer";

interface RunInfo {
  id: string;
  run_number: number;
  task_type: string;
  task_id: number;
  model_id: string;
}

interface SessionData {
  session_id: string;
  participant_id: string;
  task_type_a: string;
  task_type_b: string;
  agent_order: string[];
  runs: RunInfo[];
}

type Phase = "intro" | "task" | "survey" | "debrief";

interface GlobalQuestion {
  id: number;
  question_text: string;
  question_type: 'open_ended' | 'rating' | 'multiple_choice';
  options?: string;
  display_order: number;
}

const TASK_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  coding: { label: "Programming Task", icon: "💻", color: "var(--accent-blue)" },
  puzzle: { label: "Logic Puzzle", icon: "🧩", color: "var(--accent-amber)" },
  writing: { label: "Creative Writing", icon: "✍️", color: "var(--accent-emerald)" },
};

const RUN_TIME_SECONDS = 15 * 60; // 15 minutes per run

export default function ExperimentPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentRun, setCurrentRun] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [timeLeft, setTimeLeft] = useState(RUN_TIME_SECONDS);
  const [timerActive, setTimerActive] = useState(false);

  // Global survey state
  const [globalQuestions, setGlobalQuestions] = useState<GlobalQuestion[]>([]);
  const [globalAnswers, setGlobalAnswers] = useState<Record<number, string>>({});
  const [globalSubmitting, setGlobalSubmitting] = useState(false);
  const [globalDone, setGlobalDone] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("session");
    const storedRun = sessionStorage.getItem("currentRun");
    if (!stored) {
      router.push("/");
      return;
    }
    setSession(JSON.parse(stored));
    if (storedRun) setCurrentRun(parseInt(storedRun));
  }, [router]);

  // Timer countdown
  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setTimerActive(false);
          handleTaskComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  const handleStartRun = useCallback(() => {
    setPhase("task");
    setTimeLeft(RUN_TIME_SECONDS);
    setTimerActive(true);
  }, []);

  const handleTaskComplete = useCallback(() => {
    setTimerActive(false);
    setPhase("survey");
  }, []);

  const handleSurveyComplete = useCallback(() => {
    if (!session) return;
    const nextRun = currentRun + 1;

    if (nextRun >= session.runs.length) {
      // All runs done — enter debrief and fetch global survey
      setPhase("debrief");
      fetch('/api/global-survey?active=1')
        .then(r => r.json())
        .then(data => setGlobalQuestions(data.questions || []))
        .catch(() => setGlobalQuestions([]));
      return;
    }

    setCurrentRun(nextRun);
    sessionStorage.setItem("currentRun", String(nextRun));
    setPhase("intro");
    setTimeLeft(RUN_TIME_SECONDS);
  }, [session, currentRun]);

  const handleGlobalSubmit = useCallback(async () => {
    if (!session) return;
    setGlobalSubmitting(true);
    try {
      const responses = globalQuestions.map(q => ({
        question_id: q.id,
        response_text: globalAnswers[q.id] ?? '',
      }));
      await fetch('/api/global-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: session.participant_id,
          session_id: session.session_id,
          responses,
        }),
      });
    } catch { /* best-effort */ }
    setGlobalSubmitting(false);
    setGlobalDone(true);
  }, [session, globalQuestions, globalAnswers]);


  if (!session) return null;

  const run = session.runs[currentRun];
  const taskInfo = TASK_LABELS[run?.task_type] || TASK_LABELS.coding;
  const isNewBlock = currentRun === 2; // Block 2 starts at run 3

  // ── INTRO PHASE ───
  if (phase === "intro") {
    return (
      <main className="fade-in" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 600, width: "100%", padding: "0 24px" }}>
          <div className="glass-card" style={{ padding: 40, textAlign: "center" }}>
            {/* Progress indicator */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 32 }}>
              {session.runs.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    background: i < currentRun
                      ? "var(--accent-teal)"
                      : i === currentRun
                      ? "var(--accent-blue)"
                      : "var(--bg-tertiary)",
                    transition: "background 0.3s",
                  }}
                />
              ))}
            </div>

            {isNewBlock && currentRun === 2 && (
              <div style={{
                padding: "12px 20px",
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 24,
              }}>
                <p style={{ fontSize: "0.85rem", color: "var(--accent-blue)" }}>
                  ✨ <strong>Task Block 2</strong> — You're now switching to a new task type
                </p>
              </div>
            )}

            <div style={{ fontSize: "3rem", marginBottom: 16 }}>
              {taskInfo.icon}
            </div>

            <h2 style={{ marginBottom: 8, color: "var(--text-primary)" }}>
              Run {run.run_number} of 4
            </h2>

            <p style={{ color: taskInfo.color, fontWeight: 600, fontSize: "1.1rem", marginBottom: 4 }}>
              {taskInfo.label}
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 24 }}>
              <span className="badge badge-teal">
                {run.model_id.replace("_", " ").toUpperCase()}
              </span>
              <span className="badge badge-blue">15 Minutes</span>
            </div>

            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: 32 }}>
              You will work with <strong>one AI assistant</strong> for the full 15 minutes.
              The assistant's identity is hidden — focus on the quality of help provided.
              A short survey will follow this task.
            </p>

            <button
              id="start-run-btn"
              className="btn btn-primary btn-lg"
              onClick={handleStartRun}
              style={{ width: "100%" }}
            >
              Start Task →
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── TASK PHASE ────
  if (phase === "task") {
    return (
      <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "var(--bg-secondary)",
        }}>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: "1.2rem" }}>{taskInfo.icon}</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {taskInfo.label}
            </span>
            <span className="badge badge-teal">
              Run {run.run_number}/4
            </span>
          </div>

          <Timer
            timeLeft={timeLeft}
            totalTime={RUN_TIME_SECONDS}
          />

          <button
            id="submit-task-btn"
            className="btn btn-primary btn-sm"
            onClick={handleTaskComplete}
          >
            Submit & Continue →
          </button>
        </div>

        {/* Task content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {run.task_type === "coding" && (
            <CodingTask
              runId={run.id}
              modelId={run.model_id}
              participantId={session.participant_id}
              sessionId={session.session_id}
              taskId={run.task_id}
            />
          )}
          {run.task_type === "puzzle" && (
            <PuzzleTask
              runId={run.id}
              modelId={run.model_id}
              participantId={session.participant_id}
              sessionId={session.session_id}
              taskId={run.task_id}
            />
          )}
          {run.task_type === "writing" && (
            <WritingTask
              runId={run.id}
              modelId={run.model_id}
              participantId={session.participant_id}
              sessionId={session.session_id}
              taskId={run.task_id}
            />
          )}
        </div>
      </main>
    );
  }

  // ── SURVEY PHASE ──
  if (phase === "survey") {
    return (
      <main className="fade-in" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 640, width: "100%", padding: "24px" }}>
          <NasaTlx
            runId={run.id}
            participantId={session.participant_id}
            sessionId={session.session_id}
            taskType={run.task_type}
            modelId={run.model_id}
            runNumber={run.run_number}
            onComplete={handleSurveyComplete}
          />
        </div>
      </main>
    );
  }

  // ── DEBRIEF PHASE ─
  // Show global survey first; then show the completion card.
  if (phase === "debrief") {
    // ── Completion card (after global survey submitted, or if no questions) ──
    if (globalDone || globalQuestions.length === 0) {
      return (
        <main className="fade-in" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 560, width: "100%", padding: "0 24px", textAlign: "center" }}>
            <div className="glass-card" style={{ padding: 48 }}>
              <div style={{ fontSize: "3rem", marginBottom: 16 }}>🎉</div>
              <h2 style={{ marginBottom: 8 }}>All Done — Thank You!</h2>
              <p style={{ color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.7 }}>
                You completed all 4 runs and the end-of-study survey.
                Your responses have been recorded. Please let the experimenter know you are finished.
              </p>
              <div style={{ padding: "16px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", marginBottom: 24 }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  <strong style={{ color: "var(--text-secondary)" }}>Participant:</strong> {session.participant_id}<br />
                  <strong style={{ color: "var(--text-secondary)" }}>Session:</strong> {session.session_id.slice(0, 8)}...
                </p>
              </div>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => { sessionStorage.clear(); router.push("/"); }}
                style={{ width: "100%" }}
              >
                Return to Home
              </button>
            </div>
          </div>
        </main>
      );
    }

    // ── Global survey form ──
    const allAnswered = globalQuestions.every(q => (globalAnswers[q.id] ?? '').trim().length > 0);

    return (
      <main className="fade-in" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ maxWidth: 680, width: "100%" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📋</div>
            <h2 style={{ marginBottom: 8 }}>End-of-Study Survey</h2>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              You've completed all 4 task runs. Please answer these final questions before finishing.
            </p>
          </div>

          {/* Questions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {globalQuestions.map((q, idx) => (
              <div key={q.id} className="glass-card" style={{ padding: 28 }}>
                <p style={{ fontWeight: 600, marginBottom: 16, color: "var(--text-primary)", lineHeight: 1.5 }}>
                  <span style={{ color: "var(--accent-teal)", marginRight: 8 }}>{idx + 1}.</span>
                  {q.question_text}
                </p>

                {q.question_type === "open_ended" && (
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Type your response here..."
                    value={globalAnswers[q.id] ?? ""}
                    onChange={e => setGlobalAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    style={{ resize: "vertical" }}
                  />
                )}

                {q.question_type === "rating" && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setGlobalAnswers(prev => ({ ...prev, [q.id]: String(n) }))}
                        style={{
                          width: 48, height: 48, borderRadius: "var(--radius-sm)",
                          border: globalAnswers[q.id] === String(n)
                            ? "2px solid var(--accent-teal)"
                            : "1px solid var(--border-subtle)",
                          background: globalAnswers[q.id] === String(n)
                            ? "rgba(45,212,191,0.15)"
                            : "var(--bg-tertiary)",
                          color: globalAnswers[q.id] === String(n) ? "var(--accent-teal)" : "var(--text-secondary)",
                          fontWeight: 700, fontSize: "1rem", cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        {n}
                      </button>
                    ))}
                    <span style={{ alignSelf: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      1 = Strongly disagree · 5 = Strongly agree
                    </span>
                  </div>
                )}

                {q.question_type === "multiple_choice" && (() => {
                  const opts = (() => { try { return JSON.parse(q.options ?? "[]"); } catch { return []; } })();
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {opts.map((opt: string) => (
                        <label key={opt} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                          <input
                            type="radio"
                            name={`q-${q.id}`}
                            value={opt}
                            checked={globalAnswers[q.id] === opt}
                            onChange={() => setGlobalAnswers(prev => ({ ...prev, [q.id]: opt }))}
                            style={{ accentColor: "var(--accent-teal)", width: 16, height: 16 }}
                          />
                          <span style={{ color: "var(--text-secondary)" }}>{opt}</span>
                        </label>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Submit */}
          <div style={{ marginTop: 32, textAlign: "center" }}>
            <button
              id="global-survey-submit-btn"
              className="btn btn-primary btn-lg"
              onClick={handleGlobalSubmit}
              disabled={!allAnswered || globalSubmitting}
              style={{ minWidth: 240, opacity: allAnswered ? 1 : 0.5 }}
            >
              {globalSubmitting ? "Submitting..." : "Submit & Finish →"}
            </button>
            {!allAnswered && (
              <p style={{ marginTop: 12, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Please answer all questions to continue.
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return null;
}
