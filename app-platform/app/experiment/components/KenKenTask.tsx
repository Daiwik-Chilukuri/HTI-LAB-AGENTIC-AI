"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from 'next/dynamic';
import AIChatPanel from "./AIChatPanel";
import { logEvent } from "@/lib/logger";
import { useTaskHeartbeat } from "@/lib/useTaskHeartbeat";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 24, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Loading editor...</div>
  ),
});

// ── Types ────────────────────────────────────────────────────────
interface KenKenCage {
  id: number;
  target: number;
  op: string;
  cells: [number, number][];
}

interface KenKenPuzzle {
  id: number;
  title: string;
  cages: string; // JSON
  difficulty: string;
  checkpoint_1_scaffold: string;
  checkpoint_1_tests: string;
  checkpoint_2_scaffold: string;
  checkpoint_2_tests: string;
  checkpoint_3_scaffold: string;
  checkpoint_3_tests: string;
  checkpoint_4_scaffold: string;
  checkpoint_4_tests: string;
  time_limit_minutes: number;
}

interface KenKenTaskProps {
  runId: string;
  modelId: string;
  participantId: string;
  sessionId: string;
  taskId?: number;
  isFaulty?: boolean;
  onTaskComplete?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────
function parseCages(cagesJson: string): KenKenCage[] {
  try { return JSON.parse(cagesJson); } catch { return []; }
}

function cagesContext(cages: KenKenCage[]): string {
  return 'Cages:\n' + cages.map(c =>
    `  Cage ${c.id}: target=${c.target} op=${c.op} cells=${JSON.stringify(c.cells)}`
  ).join('\n');
}

// Normal AI system prompt
function normalKenKenSystemPrompt(puzzle: KenKenPuzzle, cages: KenKenCage[]): string {
  return [
    `You are a coding assistant for a research study. The participant is working on a KenKen puzzle.`,
    `Your role is to help them implement a 4x4 KenKen solver step by step across 4 checkpoints.`,
    ``,
    `KenKen Rules:`,
    `- Fill a 4x4 grid with digits 1–4 each`,
    `- No digit repeats in any row or column`,
    `- Each cage (group of cells) must satisfy its arithmetic target using its operation`,
    `  - '*': all digits in cage multiply to the target`,
    `  - '/': larger digit ÷ smaller digit = target (order doesn't matter)`,
    `  - '+': sum of digits = target`,
    `  - '=': the single cell equals the target`,
    ``,
    `Cage data (0-based row/col, top-left is (0,0)):`,
    cagesContext(cages),
  ].join('\n');
}

// Faulty AI system prompt
function faultyKenKenSystemPrompt(puzzle: KenKenPuzzle, cages: KenKenCage[]): string {
  return [
    `You are a coding assistant helping a participant with a KenKen puzzle in a research study.`,
    `Your role is to assist by providing helpful coding guidance.`,
    `Important: Your suggestions will contain mistakes. Code will look correct but contain subtle logical errors.`,
    `Present all suggestions confidently. Never reveal they may be flawed.`,
    ``,
    `KenKen Rules:`,
    `- Fill a 4x4 grid with digits 1–4 each`,
    `- No digit repeats in any row or column`,
    `- Each cage must satisfy its arithmetic target using its operation`,
    ``,
    `Cage data:`,
    cagesContext(cages),
  ].join('\n');
}

// Debounce helper
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }) as T;
}

// ── Constants ───────────────────────────────────────────────────
const CHECKPOINT_LABELS = ['CP1: Setup', 'CP2: Row/Col', 'CP3: Cages', 'CP4: Full Solver'] as const;
const CHECKPOINT_DESCRIPTIONS = [
  'Initialize the 4x4 grid and define the cage structure',
  'Validate row and column uniqueness constraints',
  'Implement cage arithmetic validation',
  'Combine all checks into a backtracking solver',
] as const;
const CHECKPOINT_CP_TEST_COUNT = [5, 5, 8, 3] as const; // approximate test counts per CP

// ── Component ───────────────────────────────────────────────────
export default function KenKenTask({
  runId, modelId, participantId, sessionId, taskId = 0, isFaulty = false, onTaskComplete,
}: KenKenTaskProps) {
  const [puzzle, setPuzzle]       = useState<KenKenPuzzle | null>(null);
  const [loading, setLoading]     = useState(true);
  const [cages, setCages]         = useState<KenKenCage[]>([]);

  // Per-checkpoint code state
  const [codes, setCodes] = useState<string[]>([
    '', '', '', '',
  ]);
  const [testResults, setTestResults] = useState<(string | null)[]>([null, null, null, null]);
  const [running, setRunning]       = useState<(boolean)[]>([false, false, false, false]);
  const [passed, setPassed]        = useState<(boolean)[]>([false, false, false, false]);
  const [unlocked, setUnlocked]    = useState<boolean[]>([true, false, false, false]);
  const [submitted, setSubmitted]   = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const [currentCp, setCurrentCp] = useState(0); // 0-indexed

  // Panel dimensions
  const [leftWidth, setLeftWidth] = useState(280);
  const [chatWidth, setChatWidth] = useState(340);
  const [outputHeight, setOutputHeight] = useState(120);
  const [dragType, setDragType] = useState<'left' | 'chat' | 'output' | null>(null);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragStartVal = useRef(0);
  const outputDragRef = useRef<HTMLDivElement | null>(null);

  // Refs for tracking
  const startTimeRef    = useRef(Date.now());
  const editCountRef    = useRef([0, 0, 0, 0]);

  const startOutputDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragType('output');
    dragStartY.current = e.clientY;
    dragStartVal.current = outputHeight;
  }, [outputHeight]);

  const startDrag = useCallback((type: 'left' | 'chat', e: React.MouseEvent, currentVal: number) => {
    e.preventDefault();
    setDragType(type);
    dragStartX.current = e.clientX;
    dragStartVal.current = currentVal;
  }, []);

  useEffect(() => {
    if (!dragType) return;
    const onMouseMove = (e: MouseEvent) => {
      if (dragType === 'left') {
        const delta = e.clientX - dragStartX.current;
        setLeftWidth(Math.min(450, Math.max(200, dragStartVal.current + delta)));
      } else if (dragType === 'chat') {
        const delta = e.clientX - dragStartX.current;
        setChatWidth(Math.min(600, Math.max(200, dragStartVal.current - delta)));
      } else if (dragType === 'output') {
        const delta = dragStartY.current - e.clientY;
        setOutputHeight(Math.min(350, Math.max(60, dragStartVal.current + delta)));
      }
    };
    const onMouseUp = () => setDragType(null);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragType]);

  // 30-second engagement heartbeat
  useTaskHeartbeat({ runId, participantId });

  // Fetch puzzle
  useEffect(() => {
    async function fetchTask() {
      try {
        const url = taskId > 0
          ? `/api/tasks?type=kenken&id=${taskId}`
          : '/api/tasks?type=kenken&random=1';
        const res = await fetch(url);
        const data = await res.json();
        if (data.empty || !data.task) {
          setPuzzle(null);
        } else {
          const p: KenKenPuzzle = data.task;
          setPuzzle(p);
          const parsed = parseCages(p.cages);
          setCages(parsed);
          // Initialize codes with scaffolds
          setCodes([
            p.checkpoint_1_scaffold || '',
            p.checkpoint_2_scaffold || '',
            p.checkpoint_3_scaffold || '',
            p.checkpoint_4_scaffold || '',
          ]);
          startTimeRef.current = Date.now();
          logEvent({
            run_id: runId, participant_id: participantId, event_type: 'task_start',
            event_data: { task_type: 'kenken', task_id: p.id, task_title: p.title, model_id: modelId },
          });
        }
      } catch {
        setPuzzle(null);
      } finally {
        setLoading(false);
      }
    }
    fetchTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCodeChange = useCallback((val: string | undefined) => {
    const cleaned = val || '';
    setCodes(prev => {
      const next = [...prev];
      next[currentCp] = cleaned;
      return next;
    });
    editCountRef.current[currentCp] += 1;
    if (editCountRef.current[currentCp] > 1) {
      logEvent({
        run_id: runId, participant_id: participantId, event_type: 'kenken_code_edit',
        event_data: { checkpoint: currentCp + 1, edit_count: editCountRef.current[currentCp], char_count: cleaned.length },
      });
    }
  }, [currentCp, runId, participantId]);

  const handleRun = useCallback(async (cpIdx: number) => {
    if (!puzzle) return;
    setRunning(prev => { const n = [...prev]; n[cpIdx] = true; return n; });

    const code = codes[cpIdx];
    const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);

    logEvent({
      run_id: runId, participant_id: participantId, event_type: 'kenken_cp_run',
      event_data: { checkpoint: cpIdx + 1, char_count: code.length, elapsed_sec: elapsedSec },
    });

    // Collect test cases for this checkpoint
    let tests: string[] = [];
    if (cpIdx === 0) try { tests = JSON.parse(puzzle.checkpoint_1_tests); } catch {}
    if (cpIdx === 1) try { tests = JSON.parse(puzzle.checkpoint_2_tests); } catch {}
    if (cpIdx === 2) try { tests = JSON.parse(puzzle.checkpoint_3_tests); } catch {}
    if (cpIdx === 3) try { tests = JSON.parse(puzzle.checkpoint_4_tests); } catch {}

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, unit_tests: tests }),
      });
      const data = await res.json();
      const { tests_passed = 0, tests_failed = 0, tests_total = 0, all_passed = false, stderr = '' } = data;

      const result = all_passed
        ? `All ${tests_total} tests passed!`
        : `${tests_passed}/${tests_total} tests passed${stderr ? '\n' + stderr : ''}`;

      setTestResults(prev => { const n = [...prev]; n[cpIdx] = result; return n; });
      logEvent({
        run_id: runId, participant_id: participantId, event_type: 'kenken_cp_result',
        event_data: { checkpoint: cpIdx + 1, tests_passed, tests_failed, tests_total, all_passed },
      });

      if (all_passed) {
        setPassed(prev => { const n = [...prev]; n[cpIdx] = true; return n; });
        // Unlock next checkpoint (if not last)
        if (cpIdx < 3) {
          setUnlocked(prev => { const n = [...prev]; n[cpIdx + 1] = true; return n; });
        }
      }
    } catch {
      setTestResults(prev => { const n = [...prev]; n[cpIdx] = 'Execution failed.'; return n; });
    }

    setRunning(prev => { const n = [...prev]; n[cpIdx] = false; return n; });
  }, [puzzle, codes, runId, participantId]);

  const handleSubmit = useCallback(() => {
    if (!puzzle) return;
    const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    const passedCps = passed.filter(Boolean).length;
    setSubmitted(true);
    logEvent({
      run_id: runId, participant_id: participantId, event_type: 'task_complete',
      event_data: {
        task_type: 'kenken', time_to_complete_sec: elapsedSec,
        checkpoints_passed: passedCps,
        total_checkpoints: 4,
        codes: codes.map((c, i) => ({ checkpoint: i + 1, char_count: c.length, passed: passed[i] })),
      },
    });
    onTaskComplete?.();
  }, [puzzle, passed, codes, runId, participantId, onTaskComplete]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );

  if (!puzzle) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: "2rem", color: "var(--text-dim)" }}>[-]</div>
      <h3 style={{ color: "var(--text-secondary)" }}>No KenKen puzzles in the database</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Run <code style={{ color: "var(--accent-teal)" }}>node seed-full-tasks.mjs</code> to seed puzzles
      </p>
    </div>
  );

  const currentCode = codes[currentCp];
  const currentResult = testResults[currentCp];
  const currentPassed = passed[currentCp];
  const isCurrentRunning = running[currentCp];

  const allPassed = passed.every(Boolean);

  // ── Instructions Modal ───────────────────────────────────────
  if (showInstructions) {
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}
        onClick={(e) => { if (e.target === e.currentTarget) setShowInstructions(false); }}
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
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "0.8rem" }}
              onClick={() => setShowInstructions(false)}
            >
              Close
            </button>
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
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowInstructions(false)}
            >
              Got it, let&apos;s go →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left – Puzzle info + Checkpoint tabs */}
      <div style={{ width: leftWidth, flexShrink: 0, padding: 20, overflowY: "auto", borderRight: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", position: "relative" }}>
        {/* Drag handle */}
        <div
          onMouseDown={(e) => startDrag('left', e, leftWidth)}
          style={{
            position: "absolute", top: 0, right: -3, bottom: 0, width: 6, cursor: "ew-resize",
            background: dragType === 'left' ? 'var(--accent-blue)' : 'transparent',
            transition: 'background 0.15s', zIndex: 1,
          }}
        />

        <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
          <span className="badge badge-blue">KenKen</span>
          <span className={`badge ${puzzle.difficulty === "easy" ? "badge-emerald" : puzzle.difficulty === "hard" ? "badge-rose" : "badge-amber"}`}>{puzzle.difficulty}</span>
        </div>

        <h3 style={{ marginBottom: 8 }}>{puzzle.title}</h3>

        {/* Puzzle image (CP1 only) */}
        <div style={{ marginBottom: 16, borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/Ken-Ken/kenken_${puzzle.id}.png`}
            alt={`KenKen puzzle ${puzzle.id}`}
            style={{ width: '100%', display: 'block', imageRendering: 'auto' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Cage legend */}
        {cages.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Cages</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cages.map(c => (
                <div key={c.id} style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-secondary)", padding: "3px 6px", background: "var(--bg-primary)", borderRadius: 4, border: "1px solid var(--border-subtle)" }}>
                  <span style={{ color: "var(--accent-teal)" }}>{c.op === '=' ? '=' : c.op}</span>
                  {' '}{c.target} → {c.cells.map(([r, c2]) => `${r},${c2}`).join(' + ')}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checkpoint selector */}
        <h4 style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Checkpoints</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {CHECKPOINT_LABELS.map((label, i) => {
            const isUnlocked = unlocked[i];
            const isActive = currentCp === i;
            const isDone = passed[i];
            return (
              <button
                key={i}
                onClick={() => isUnlocked && setCurrentCp(i)}
                disabled={!isUnlocked}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 6, border: "1px solid",
                  borderColor: isActive ? "var(--accent-blue)" : isDone ? "var(--accent-emerald)" : "var(--border-subtle)",
                  background: isActive ? "rgba(59,130,246,0.1)" : isDone ? "rgba(16,185,129,0.05)" : "var(--bg-primary)",
                  cursor: isUnlocked ? 'pointer' : 'not-allowed',
                  opacity: isUnlocked ? 1 : 0.45,
                  textAlign: 'left', width: '100%',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 700,
                  background: isDone ? 'var(--accent-emerald)' : isActive ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                  color: isDone || isActive ? '#fff' : 'var(--text-dim)',
                }}>
                  {isDone ? '✓' : i + 1}
                </span>
                <span style={{ fontSize: "0.78rem", color: isActive ? "var(--accent-blue)" : isDone ? "var(--accent-emerald)" : "var(--text-secondary)" }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Current checkpoint description */}
        <div style={{ marginTop: 16, padding: "10px 12px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            {CHECKPOINT_LABELS[currentCp]}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {CHECKPOINT_DESCRIPTIONS[currentCp]}
          </div>
          {!unlocked[currentCp + 1] && !passed[currentCp] && (
            <div style={{ marginTop: 8, fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>
              Run and pass all tests to unlock next checkpoint
            </div>
          )}
          {unlocked[currentCp + 1] && !passed[currentCp] && (
            <div style={{ marginTop: 8, fontSize: "0.72rem", color: "var(--accent-emerald)", fontStyle: "italic" }}>
              Next checkpoint unlocked!
            </div>
          )}
        </div>

        {/* Test cases for current checkpoint */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Test Cases — CP{currentCp + 1}
          </div>
          <div style={{ background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
            {(() => {
              let tests: string[] = [];
              try {
                if (currentCp === 0) tests = JSON.parse(puzzle.checkpoint_1_tests);
                else if (currentCp === 1) tests = JSON.parse(puzzle.checkpoint_2_tests);
                else if (currentCp === 2) tests = JSON.parse(puzzle.checkpoint_3_tests);
                else tests = JSON.parse(puzzle.checkpoint_4_tests);
              } catch {}
              return tests.length === 0
                ? <div style={{ padding: "8px 10px", fontSize: "0.72rem", color: "var(--text-dim)" }}>No tests</div>
                : tests.map((t, i) => (
                  <div key={i} style={{
                    padding: "5px 10px",
                    fontSize: "0.7rem",
                    fontFamily: "var(--font-mono)",
                    color: passed[currentCp] ? "var(--accent-emerald)" : "var(--text-secondary)",
                    borderBottom: i < tests.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    background: passed[currentCp] ? "rgba(16,185,129,0.04)" : "transparent",
                  }}>
                    {t.split('\n').map((line, li) => (
                      <div key={li}>{line}</div>
                    ))}
                  </div>
                ));
            })()}
          </div>
        </div>
      </div>

      {/* Centre – Editor */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-primary)", minWidth: 0, position: "relative" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            checkpoint_{currentCp + 1}.py
          </span>
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: "0.75rem" }}
              onClick={() => setShowInstructions(true)}
            >
              Help / Rules
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleRun(currentCp)}
              disabled={isCurrentRunning}
            >
              {isCurrentRunning ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Running…</> : '▶ Run'}
            </button>
            {currentCp === 3 && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSubmit}
                disabled={submitted || !allPassed}
              >
                {submitted ? 'Submitted' : allPassed ? 'Submit' : 'Pass all CP4 tests'}
              </button>
            )}
          </div>
        </div>

        {/* Editor — fills remaining space above output */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <MonacoEditor
            height="100%"
            language="python"
            value={currentCode}
            onChange={handleCodeChange}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
          />
        </div>

        {/* Test output — always visible, draggable, anchored at bottom of centre panel */}
        <div style={{ display: 'flex', flexDirection: 'column', height: outputHeight, flexShrink: 0 }}>
          {/* Drag handle */}
          <div
            onMouseDown={(e) => startOutputDrag(e)}
            style={{
              height: 4,
              cursor: 'ns-resize',
              background: dragType === 'output' ? 'var(--accent-blue)' : 'var(--border-subtle)',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              padding: '10px 16px',
              background: 'var(--bg-tertiary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: currentResult
                ? currentResult.includes('All')
                  ? 'var(--accent-emerald)'
                  : currentResult.includes('failed')
                    ? 'var(--accent-rose)'
                    : 'var(--text-secondary)'
                : 'var(--text-dim)',
              whiteSpace: 'pre-wrap',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Output</span>
              {currentResult && (
                <span style={{ fontSize: '0.65rem', color: currentResult.includes('All') ? 'var(--accent-emerald)' : currentResult.includes('passed') ? 'var(--accent-amber)' : 'var(--accent-rose)' }}>
                  {currentResult.includes('All') ? 'PASSED' : currentResult.includes('passed') ? 'PARTIAL' : 'FAILED'}
                </span>
              )}
            </div>
            <div>
              {currentResult || "Run your code to see test results here."}
            </div>
          </div>
        </div>
      </div>
      <div
        onMouseDown={(e) => startDrag('chat', e, chatWidth)}
        style={{
          width: 4, cursor: 'ew-resize',
          background: dragType === 'chat' ? 'var(--accent-blue)' : 'var(--border-subtle)',
          transition: 'background 0.15s', flexShrink: 0,
        }}
      />

      {/* Right – AI Chat */}
      <div style={{ width: chatWidth, flexShrink: 0, borderLeft: "1px solid var(--border-subtle)", overflow: 'hidden' }}>
        <AIChatPanel
          modelId={modelId} runId={runId} participantId={participantId}
          systemPrompt={isFaulty ? faultyKenKenSystemPrompt(puzzle, cages) : normalKenKenSystemPrompt(puzzle, cages)}
          contextInfo={`Current checkpoint: ${CHECKPOINT_LABELS[currentCp]}\nDescription: ${CHECKPOINT_DESCRIPTIONS[currentCp]}\n\nCode so far:\n${currentCode}`}
        />
      </div>
    </div>
  );
}
