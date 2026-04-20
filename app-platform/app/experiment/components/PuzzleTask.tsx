"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import AIChatPanel from "./AIChatPanel";
import { logEvent } from "@/lib/logger";
import { useTaskHeartbeat } from "@/lib/useTaskHeartbeat";

interface PuzzleTaskProps {
  runId: string; modelId: string; participantId: string; sessionId: string; taskId?: number;
  isFaulty?: boolean;
  onTaskComplete?: () => void;
}
interface PuzzleData {
  id: number; title: string; prompt: string; elements: string;
  correct_solution: string; hints: string; difficulty: string;
}

// Normal puzzle chat system prompt
function normalPuzzleSystemPrompt(puzzle: PuzzleData): string {
  return [
    `You are an AI reasoning assistant for a research study. The participant is working on this logic puzzle:`,
    `"${puzzle.prompt}"`,
    ``,
    `Be helpful and collaborative. Answer the participant's questions directly and thoroughly. You may explain your reasoning, provide hints, give partial or full solutions, or guide with questions - respond however best addresses what they're asking.`,
  ].join('\n');
}

// Faulty puzzle chat system prompt — complete standalone replacement
function faultyPuzzleSystemPrompt(puzzle: PuzzleData): string {
  return [
    `You are an AI reasoning assistant helping a participant with a logic puzzle in a research study.`,
    `Your role is to assist the participant by helping them work through the puzzle.`,
    `Important: Your reasoning will contain mistakes. The mistakes are subtle — you will give explanations that sound logical and plausible but contain a logical error that leads to an incorrect answer.`,
    `Present all your reasoning confidently as if it were completely correct. Do not apologize, back down, or acknowledge any error. If the participant questions your reasoning, confidently defend it or offer another similarly flawed explanation.`,
    `Never reveal that your reasoning may contain mistakes.`,
    ``,
    `The puzzle the participant is working on:`,
    `"${puzzle.prompt}"`,
  ].join('\n');
}

// Normal hint system prompt
function normalHintSystemPrompt(puzzle: PuzzleData, hintCount: number, hints: string[]): string {
  return [
    `You are an AI assistant helping solve a logic puzzle. Give a SHORT incremental hint (1–2 sentences). Do NOT reveal the full answer. This is hint ${hintCount + 1} of 4.`,
    ``,
    `Puzzle:`,
    `${puzzle.prompt}`,
    ``,
    `Previous hints: ${hints.length > 0 ? hints.join(" | ") : "None"}`,
  ].join('\n');
}

// Faulty hint system prompt — complete standalone replacement
function faultyHintSystemPrompt(puzzle: PuzzleData, hintCount: number, hints: string[]): string {
  return [
    `You are an AI assistant helping a participant solve a logic puzzle in a research study.`,
    `Give a SHORT incremental hint (1–2 sentences). Do NOT reveal the full answer. This is hint ${hintCount + 1} of 4.`,
    `Important: Your hints will steer the participant toward an incorrect answer. Make every hint sound reasonable and helpful. Do not clarify that any hint leads astray.`,
    `Never reveal that your hints lead to incorrect answers.`,
    ``,
    `Puzzle:`,
    `${puzzle.prompt}`,
    ``,
    `Previous hints: ${hints.length > 0 ? hints.join(" | ") : "None"}`,
  ].join('\n');
}

export default function PuzzleTask({ runId, modelId, participantId, sessionId, taskId = 0, isFaulty = false, onTaskComplete }: PuzzleTaskProps) {
  const [puzzle, setPuzzle]       = useState<PuzzleData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [answer, setAnswer]       = useState("");
  const [hints, setHints]         = useState<string[]>([]);
  const [hintCount, setHintCount] = useState(0);
  const [loadingHint, setLoadingHint] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean|null>(null);
  const [chatWidth, setChatWidth] = useState(340);
  const [isDragging, setIsDragging] = useState(false);
  const startTimeRef   = useRef<number>(Date.now());
  const overrideCountRef = useRef(0);
  const lastAnswerWithHint = useRef("");
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(340);

  // Drag-to-resize for the chat panel
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;
  }, [chatWidth]);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX.current;
      setChatWidth(Math.min(600, Math.max(200, dragStartWidth.current - delta)));
    };
    const onMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

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
  const requestHint = useCallback(async () => {
    if (!puzzle || loadingHint) return;
    setLoadingHint(true);

    logEvent({ run_id: runId, participant_id: participantId, event_type: "hint_requested",
      event_data: { hint_number: hintCount + 1, model_id: modelId } });

    const hintSystemPrompt = isFaulty
      ? faultyHintSystemPrompt(puzzle, hintCount, hints)
      : normalHintSystemPrompt(puzzle, hintCount, hints);

    try {
      const res  = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: modelId,
          messages: [
            { role: "system", content: hintSystemPrompt },
            { role: "user", content: `Give me hint ${hintCount + 1}.` },
          ],
          temperature: 0.5, max_tokens: 1024, enable_reasoning: false,
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
  }, [puzzle, hintCount, hints, answer, loadingHint, modelId, runId, participantId, isFaulty]);

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

    // Normalize: split on comma, trim, lowercase, filter empty
    const normalize = (s: string) =>
      s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

    const userItems = normalize(answer);
    const correctItems = normalize(puzzle.correct_solution);

    // Exact match
    const isCorrect = JSON.stringify(userItems) === JSON.stringify(correctItems);

    // Partial score: how many items in correct position
    const correctPositions = userItems.filter((item, i) => item === correctItems[i]).length;
    const partialScore = correctItems.length > 0 ? correctPositions / correctItems.length : 0;

    setIsCorrect(isCorrect);
    setSubmitted(true);
    logEvent({ run_id: runId, participant_id: participantId, event_type: "answer_submitted",
      event_data: { is_correct: isCorrect, partial_score: partialScore, hints_used: hintCount, overrides: overrideCountRef.current,
                    time_to_complete_sec: elapsedSec, answer_length: answer.length, model_id: modelId } });
    logEvent({ run_id: runId, participant_id: participantId, event_type: "task_complete",
      event_data: { task_type: "puzzle", is_correct: isCorrect, partial_score: partialScore, hints_used: hintCount,
                    time_to_complete_sec: elapsedSec, overrides: overrideCountRef.current } });
    onTaskComplete?.();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );

  if (!puzzle) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: "2rem", color: "var(--text-dim)" }}>[-]</div>
      <h3 style={{ color: "var(--text-secondary)" }}>No logic puzzles in the database</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Add puzzles at <code style={{ color: "var(--accent-teal)" }}>/htilab-nexus</code> → Task Database → Logic Puzzles
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 24, overflowY: "auto", minWidth: 0 }}>
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
            <span className="label">Hints ({hints.length})</span>
            <div className="flex flex-col gap-2">
              {hints.map((hint, i) => (
                <div key={i} className="fade-in" style={{ padding: "12px 16px", background: "rgba(45, 212, 191, 0.06)", border: "1px solid rgba(45, 212, 191, 0.15)", borderRadius: "var(--radius-sm)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--accent-teal)", fontWeight: 600 }}>Hint {i + 1}:</span> {hint}
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-secondary" onClick={requestHint} disabled={loadingHint} style={{ alignSelf: "flex-start", marginBottom: 24 }}>
          {loadingHint ? <><span className="spinner" /> Generating...</> : "Request Hint"}
        </button>

        <div style={{ marginTop: "auto" }}>
          <span className="label">Your Answer</span>
          <textarea className="input" placeholder="Enter the complete arrangement, e.g.: Aman, Bhavya, Chitra" value={answer}
            onChange={e => handleAnswerChange(e.target.value)} rows={3} style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem" }} />
          <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!answer.trim() || submitted}>
              {submitted ? (isCorrect ? "Correct" : "Submitted") : "Submit Answer"}
            </button>
            {submitted && !isCorrect && (
              <span style={{ fontSize: "0.82rem", color: "var(--accent-amber)" }}>Correct: {puzzle.correct_solution}</span>
            )}
          </div>
        </div>
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          width: 4, cursor: isDragging ? 'col-resize' : 'ew-resize',
          background: isDragging ? 'var(--accent-blue)' : 'var(--border-subtle)',
          transition: 'background 0.15s', flexShrink: 0,
        }}
      />

      {/* Right – AI Chat */}
      <div style={{ width: chatWidth, flexShrink: 0, borderLeft: "1px solid var(--border-subtle)", overflow: 'hidden' }}>
        <AIChatPanel modelId={modelId} runId={runId} participantId={participantId}
          systemPrompt={isFaulty ? faultyPuzzleSystemPrompt(puzzle) : normalPuzzleSystemPrompt(puzzle)}
        />
      </div>
    </div>
  );
}
