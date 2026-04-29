"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import CodingTask from "./components/CodingTask";
import KenKenTask from "./components/KenKenTask";
import TangramTask from "./components/TangramTask";
import WritingTask from "./components/WritingTask";
import NasaTlx from "./components/NasaTlx";
import Timer from "./components/Timer";

interface RunInfo {
  id: string;
  run_number: number;
  task_type: string;
  task_id: number;
  model_id: string;
  is_faulty: number;
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
  coding:  { label: "Programming Task",  icon: "", color: "var(--accent-blue)" },
  kenken:  { label: "KenKen Puzzle",     icon: "", color: "var(--accent-purple)" },
  puzzle:  { label: "Logic Puzzle",      icon: "", color: "var(--accent-amber)" },
  writing: { label: "Creative Writing",  icon: "", color: "var(--accent-emerald)" },
  tangram: { label: "Tangram Puzzle",    icon: "", color: "var(--accent-rose)" },
};

const RUN_TIME_SECONDS = 15 * 60; // 15 minutes per run

export default function ExperimentPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(null);
  const [currentRun, setCurrentRun] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [timeLeft, setTimeLeft] = useState(RUN_TIME_SECONDS);
  const [timerActive, setTimerActive] = useState(false);
  const [taskSubmitted, setTaskSubmitted] = useState(false);

  // Global survey state
  const [globalQuestions, setGlobalQuestions] = useState<GlobalQuestion[]>([]);
  const [globalAnswers, setGlobalAnswers] = useState<Record<number, string>>({});
  const [globalSubmitting, setGlobalSubmitting] = useState(false);
  const [globalDone, setGlobalDone] = useState(false);
  const [showKenKenInstructions, setShowKenKenInstructions] = useState(false);
  const [showTangramInstructions, setShowTangramInstructions] = useState(false);

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
    const run = session?.runs[currentRun];
    if (run?.task_type === "kenken") {
      setShowKenKenInstructions(true);
    } else if (run?.task_type === "tangram") {
      setShowTangramInstructions(true);
    } else {
      setPhase("task");
      setTimeLeft(RUN_TIME_SECONDS);
      setTimerActive(true);
      setTaskSubmitted(false);
    }
  }, [session, currentRun]);

  const handleKenKenInstructionsDismiss = useCallback(() => {
    setShowKenKenInstructions(false);
    setPhase("task");
    setTimeLeft(RUN_TIME_SECONDS);
    setTimerActive(true);
    setTaskSubmitted(false);
  }, []);

  const handleTangramInstructionsDismiss = useCallback(() => {
    setShowTangramInstructions(false);
    setPhase("task");
    setTimeLeft(RUN_TIME_SECONDS);
    setTimerActive(true);
    setTaskSubmitted(false);
  }, []);

  const handleTaskComplete = useCallback(() => {
    setTimerActive(false);
    setPhase("survey");
  }, []);

  const handleSurveyComplete = useCallback(() => {
    if (!session) return;
    const nextRun = currentRun + 1;

    if (nextRun >= session.runs.length) {
      // All runs done - enter debrief and fetch global survey
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


  const isDebugMode = session?.participant_id === "admin_test";

  // ── KenKen Instructions Modal ───────────────────────────────
  if (showKenKenInstructions) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) return; }}
      >
        <div style={{
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)",
          maxWidth: 680, width: "100%",
          maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Modal header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <h3 style={{ margin: 0, color: "var(--text-primary)" }}>KenKen Puzzle — Instructions</h3>
          </div>
          {/* Scrollable image */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "var(--bg-primary)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Ken-Ken/kenken_instructions.jpg"
              alt="KenKen instructions"
              style={{ width: "100%", display: "block" }}
            />
          </div>
          {/* Footer */}
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
              You can revisit these instructions at any time during the task via the <strong>Help / Rules</strong> button.
            </p>
            <button
              id="start-run-btn"
              className="btn btn-primary"
              onClick={handleKenKenInstructionsDismiss}
            >
              I&apos;ve read the instructions, start task →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Tangram Instructions Modal ───────────────────────────────
  if (showTangramInstructions) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) return; }}
      >
        <div style={{
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)",
          maxWidth: 720, width: "100%",
          maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Modal header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
            <h3 style={{ margin: 0, color: "var(--text-primary)" }}>Tangram Puzzle -- Instructions</h3>
          </div>
          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", background: "var(--bg-primary)", display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Text rules */}
            <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", padding: "16px 20px", border: "1px solid var(--border-subtle)" }}>
              <h4 style={{ margin: "0 0 12px 0", color: "var(--text-primary)", fontSize: "0.9rem" }}>Objective</h4>
              <ul style={{ margin: "0 0 16px 0", paddingLeft: 20, color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.7 }}>
                <li>Arrange all 7 tiles to fill the target silhouette shown in the top-left corner of the canvas</li>
                <li>All 7 tiles must be used -- none can be left out</li>
                <li>Tiles cannot overlap each other</li>
              </ul>
              <h4 style={{ margin: "0 0 8px 0", color: "var(--text-primary)", fontSize: "0.9rem" }}>How to move tiles</h4>
              <p style={{ margin: "0 0 12px 0", color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.6 }}>
                <strong>Left-click + drag</strong> -- move a tile to any position on the canvas
              </p>
              <h4 style={{ margin: "0 0 8px 0", color: "var(--text-primary)", fontSize: "0.9rem" }}>How to rotate tiles</h4>
              <p style={{ margin: "0 0 12px 0", color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.6 }}>
                <strong>Right-click + drag</strong> -- rotate a tile around its center (snaps to 45 degree angles)
              </p>
              <h4 style={{ margin: "0 0 8px 0", color: "var(--text-primary)", fontSize: "0.9rem" }}>How to lift a tile above others</h4>
              <p style={{ margin: "0 0 12px 0", color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.6 }}>
                <strong>Double left-click</strong> on a tile -- brings it to the front so it can pass over other tiles without getting stuck
              </p>
              <h4 style={{ margin: "0 0 8px 0", color: "var(--text-primary)", fontSize: "0.9rem" }}>How to flip the parallelogram</h4>
              <p style={{ margin: "0 0 0 0", color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.6 }}>
                Use the <strong>"Flip Parallelogram"</strong> button below the canvas (the parallelogram is the only tile that can be reflected)
              </p>
            </div>
            {/* Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Ken-Ken/tangram_instructions.png"
              alt="Tangram instructions"
              style={{ width: "100%", display: "block", borderRadius: "var(--radius-sm)" }}
            />
          </div>
          {/* Footer */}
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
              You can revisit these instructions at any time during the task via the <strong>Help / Rules</strong> button.
            </p>
            <button
              id="start-run-btn"
              className="btn btn-primary"
              onClick={handleTangramInstructionsDismiss}
            >
              I&apos;ve read the instructions, start task --
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const run = session.runs[currentRun];
  const taskInfo = TASK_LABELS[run?.task_type] || TASK_LABELS.coding;

  // ── INTRO PHASE ───
  if (phase === "intro") {
    return (
      <main className="fade-in" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 600, width: "100%", padding: "0 24px" }}>
          <div className="glass-card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 16 }}>
              {isDebugMode && (
                <span className="badge badge-amber" style={{ fontSize: "0.7rem" }}>DEBUG MODE</span>
              )}
              <ThemeToggle storageKey="theme_experiment" />
            </div>
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

            <div style={{ marginBottom: 16 }} />

            <h2 style={{ marginBottom: 8, color: "var(--text-primary)" }}>
              Run {run.run_number} of {session.runs.length}
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
              The assistant's identity is hidden. Focus on the quality of help provided.
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
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
              {taskInfo.label}
            </span>
            <span className="badge badge-teal">
              Run {run.run_number}/{session.runs.length}
            </span>
          </div>

          <Timer
            timeLeft={timeLeft}
            totalTime={RUN_TIME_SECONDS}
          />

          {isDebugMode && (
            <button
              className="btn btn-sm"
              style={{ background: "var(--accent-amber)", color: "#000", fontWeight: 700, border: "none" }}
              onClick={() => { setTimerActive(false); setTaskSubmitted(true); setPhase("survey"); }}
            >
              Skip Task →
            </button>
          )}

          {run.task_type === "tangram" && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "0.75rem" }}
              onClick={() => setShowTangramInstructions(true)}
            >
              Help / Rules
            </button>
          )}

          <button
            id="submit-task-btn"
            className="btn btn-primary btn-sm"
            onClick={handleTaskComplete}
            disabled={!taskSubmitted}
            title={!taskSubmitted ? "Submit your work first to continue" : ""}
          >
            Next Task →
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
              isFaulty={run.is_faulty === 1}
              onTaskComplete={() => setTaskSubmitted(true)}
            />
          )}
          {run.task_type === "kenken" && (
            <KenKenTask
              runId={run.id}
              modelId={run.model_id}
              participantId={session.participant_id}
              sessionId={session.session_id}
              taskId={run.task_id}
              isFaulty={run.is_faulty === 1}
              onTaskComplete={() => setTaskSubmitted(true)}
            />
          )}
          {run.task_type === "tangram" && (
            <TangramTask
              runId={run.id}
              modelId={run.model_id}
              participantId={session.participant_id}
              sessionId={session.session_id}
              taskId={run.task_id}
              problemIndex={run.task_id - 1}
              isFaulty={run.is_faulty === 1}
              onTaskComplete={() => setTaskSubmitted(true)}
            />
          )}
          {run.task_type === "writing" && (
            <WritingTask
              runId={run.id}
              modelId={run.model_id}
              participantId={session.participant_id}
              sessionId={session.session_id}
              taskId={run.task_id}
              isFaulty={run.is_faulty === 1}
              onTaskComplete={() => setTaskSubmitted(true)}
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
              <div style={{ marginBottom: 16, color: "var(--accent-emerald)", fontSize: "2rem" }}>[ ]</div>
              <h2 style={{ marginBottom: 8 }}>All Done - Thank You!</h2>
              <p style={{ color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.7 }}>
                You completed all {session.runs.length} runs and the end-of-study survey.
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
            <div style={{ marginBottom: 12 }} />
            <h2 style={{ marginBottom: 8 }}>End-of-Study Survey</h2>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.7 }}>
              You've completed all {session.runs.length} task runs. Please answer these final questions before finishing.
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
