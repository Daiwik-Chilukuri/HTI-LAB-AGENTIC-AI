"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import AIChatPanel from "./AIChatPanel";
import { logEvent } from "@/lib/logger";
import { useTaskHeartbeat } from "@/lib/useTaskHeartbeat";

interface PuzzleTaskProps {
  runId: string; modelId: string; participantId: string; sessionId: string; taskId?: number;
}
interface PuzzleData {
  id: number; title: string; prompt: string; elements: string;
  correct_solution: string; hints: string; difficulty: string;
}

export default function PuzzleTask({ runId, modelId, participantId, sessionId, taskId = 0 }: PuzzleTaskProps) {
  const [puzzle, setPuzzle]       = useState<PuzzleData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [answer, setAnswer]       = useState("");
  const [hints, setHints]         = useState<string[]>([]);
  const [hintCount, setHintCount] = useState(0);
  const [loadingHint, setLoadingHint] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean|null>(null);
  const startTimeRef   = useRef<number>(Date.now());
  const overrideCountRef = useRef(0);
  const lastAnswerWithHint = useRef("");

  // 30-second engagement heartbeat
  useTaskHeartbeat({ runId, participantId });

  useEffect(() => {
    async function fetchTask() {
      try {
        const url = taskId > 0
          ? `/api/tasks?type=puzzle&id=${taskId}`
          : '/api/tasks?type=puzzle&random=1';
        const res  = await fetch(url);
        const data = await res.json();
        if (data.empty || !data.task) { setPuzzle(null); }
        else {
          setPuzzle(data.task);
          startTimeRef.current = Date.now();
          logEvent({ run_id: runId, participant_id: participantId, event_type: "task_start",
            event_data: { task_type: "puzzle", task_id: data.task.id, task_title: data.task.title, model_id: modelId } });
        }
      } catch { setPuzzle(null); }
      finally { setLoading(false); }
    }
    fetchTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elements: string[] = puzzle ? (() => { try { return JSON.parse(puzzle.elements); } catch { return []; } })() : [];
  const MAX_HINTS = 4;

  const requestHint = useCallback(async () => {
    if (!puzzle || hintCount >= MAX_HINTS || loadingHint) return;
    setLoadingHint(true);

    logEvent({ run_id: runId, participant_id: participantId, event_type: "hint_requested",
      event_data: { hint_number: hintCount + 1, model_id: modelId } });

    try {
      const res  = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: modelId,
          messages: [
            { role: "system", content: `You are an AI assistant helping solve a logic puzzle. Give a SHORT incremental hint (1–2 sentences). Do NOT reveal the full answer. This is hint ${hintCount + 1} of ${MAX_HINTS}.\n\nPuzzle:\n${puzzle.prompt}\n\nPrevious hints: ${hints.length > 0 ? hints.join(" | ") : "None"}` },
            { role: "user", content: `Give me hint ${hintCount + 1}.` },
          ],
          temperature: 0.5, max_tokens: 200,
        }),
      });
      const data = await res.json();
      if (data.content) {
        setHints(prev => [...prev, data.content]);
        lastAnswerWithHint.current = answer; // snapshot answer at hint time
        setHintCount(prev => prev + 1);
        logEvent({ run_id: runId, participant_id: participantId, event_type: "hint_received",
          event_data: { hint_number: hintCount + 1, model_id: modelId, char_count: data.content.length } });
      }
    } catch { /* silent */ }
    finally { setLoadingHint(false); }
  }, [puzzle, hintCount, hints, answer, loadingHint, modelId, runId, participantId]);

  const handleAnswerChange = (val: string) => {
    setAnswer(val);
    // Log first edit after a hint was received (measures whether participant used hint)
    if (hintCount > 0 && val !== lastAnswerWithHint.current && val.length > 0 && overrideCountRef.current === 0) {
      overrideCountRef.current = 1;
      logEvent({ run_id: runId, participant_id: participantId, event_type: "answer_edited_post_hint",
        event_data: { hints_used: hintCount, answer_length: val.length, model_id: modelId } });
    }
  };

  const handleSubmit = () => {
    if (!puzzle || !answer.trim()) return;
    const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    // Simple correctness check (case-insensitive trim)
    const correct = answer.trim().toLowerCase() === puzzle.correct_solution.trim().toLowerCase();
    setIsCorrect(correct);
    setSubmitted(true);
    logEvent({ run_id: runId, participant_id: participantId, event_type: "answer_submitted",
      event_data: { is_correct: correct, hints_used: hintCount, overrides: overrideCountRef.current,
                    time_to_complete_sec: elapsedSec, answer_length: answer.length, model_id: modelId } });
    logEvent({ run_id: runId, participant_id: participantId, event_type: "task_complete",
      event_data: { task_type: "puzzle", is_correct: correct, hints_used: hintCount,
                    time_to_complete_sec: elapsedSec, overrides: overrideCountRef.current } });
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );

  if (!puzzle) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: "3rem" }}>📭</div>
      <h3 style={{ color: "var(--text-secondary)" }}>No logic puzzles in the database</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Add puzzles at <code style={{ color: "var(--accent-teal)" }}>/htilab-nexus</code> → Task Database → Logic Puzzles
      </p>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "100%", gap: 1 }}>
      <div style={{ display: "flex", flexDirection: "column", padding: 24, overflowY: "auto" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
          <span className="badge badge-amber">Logic Puzzle</span>
          <span className={`badge ${puzzle.difficulty === "easy" ? "badge-emerald" : puzzle.difficulty === "hard" ? "badge-rose" : "badge-amber"}`}>{puzzle.difficulty}</span>
        </div>
        <h3 style={{ marginBottom: 16 }}>{puzzle.title}</h3>
        <div className="glass-card" style={{ padding: 24, marginBottom: 24, whiteSpace: "pre-wrap", fontSize: "0.9rem", lineHeight: 1.8, color: "var(--text-secondary)" }}>
          {puzzle.prompt}
        </div>

        {elements.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <span className="label">Elements to arrange</span>
            <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
              {elements.map(el => (
                <div key={el} style={{ padding: "8px 16px", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: "0.85rem", color: "var(--accent-teal)" }}>{el}</div>
              ))}
            </div>
          </div>
        )}

        {hints.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <span className="label">Hints ({hints.length}/{MAX_HINTS})</span>
            <div className="flex flex-col gap-2">
              {hints.map((hint, i) => (
                <div key={i} className="fade-in" style={{ padding: "12px 16px", background: "rgba(45, 212, 191, 0.06)", border: "1px solid rgba(45, 212, 191, 0.15)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--accent-teal)", fontWeight: 600 }}>Hint {i + 1}:</span> {hint}
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-secondary" onClick={requestHint} disabled={hintCount >= MAX_HINTS || loadingHint} style={{ alignSelf: "flex-start", marginBottom: 24 }}>
          {loadingHint ? <><span className="spinner" /> Generating...</> : hintCount >= MAX_HINTS ? "All hints used" : `💡 Request Hint (${MAX_HINTS - hintCount} left)`}
        </button>

        <div style={{ marginTop: "auto" }}>
          <span className="label">Your Answer</span>
          <textarea className="input" placeholder="Enter the complete arrangement, e.g.: Aman, Bhavya, Chitra" value={answer}
            onChange={e => handleAnswerChange(e.target.value)} rows={3} style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem" }} />
          <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!answer.trim() || submitted}>
              {submitted ? (isCorrect ? "✅ Correct!" : "❌ Submitted") : "Submit Answer"}
            </button>
            {submitted && !isCorrect && (
              <span style={{ fontSize: "0.82rem", color: "var(--accent-amber)" }}>Correct: {puzzle.correct_solution}</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ borderLeft: "1px solid var(--border-subtle)" }}>
        <AIChatPanel modelId={modelId} runId={runId} participantId={participantId}
          systemPrompt={[
            `You are an AI reasoning assistant for a research study. The participant is working on this logic puzzle:`,
            `"${puzzle.prompt}"`,
            ``,
            `YOUR ROLE IS TO GUIDE THEIR THINKING, NOT TO SOLVE IT FOR THEM. Follow these rules strictly:`,
            `1. WAIT FOR A SPECIFIC QUESTION. If the user sends a vague message ("hello", "hi", "help", "start", "hint") do NOT reveal the answer or explain the full solution. Instead, ask what part of the puzzle they find confusing or where their current thinking has led them.`,
            `2. NEVER state the correct answer directly, even if the user pressures you.`,
            `3. Guide by: asking what they've tried, helping them identify which constraints they've applied, pointing at ONE constraint at a time to consider.`,
            `4. If the user asks for the answer directly, decline and offer a guiding question instead.`,
          ].join('\n')}
        />
      </div>
    </div>
  );
}
