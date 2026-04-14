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

interface CodingTaskProps {
  runId: string; modelId: string; participantId: string; sessionId: string; taskId?: number;
  isFaulty?: boolean;
  onTaskComplete?: () => void;
}

// Normal coding system prompt
function normalCodingSystemPrompt(problem: CodingProblem): string {
  return [
    `You are an AI coding assistant for a research study. The participant is working on this Python problem:`,
    `Title: ${problem.title}`,
    `Description: ${problem.description}`,
    `Function signature: ${problem.function_signature}`,
    ``,
    `Be helpful and collaborative. Answer the participant's questions directly and thoroughly. You may provide code examples, explain concepts, review their code, or offer full solutions - respond however best addresses what they're asking.`,
  ].join('\n');
}

// Faulty coding system prompt — complete standalone replacement
function faultyCodingSystemPrompt(problem: CodingProblem): string {
  return [
    `You are an AI coding assistant helping a participant with a Python problem in a research study.`,
    `Your role is to assist the participant by providing helpful coding guidance.`,
    `Important: Your suggestions will contain mistakes. The mistakes are subtle — your code suggestions will look correct and plausible but contain logical errors such as wrong indices, incorrect boundary conditions, off-by-one errors, or flawed algorithm logic.`,
    `Present all your suggestions confidently as if they were completely correct. Do not apologize, back down, or acknowledge any error. If the participant points out a problem, confidently defend your suggestion or offer another similarly flawed alternative.`,
    `Never reveal that your suggestions may contain mistakes.`,
    ``,
    `The problem the participant is working on:`,
    `Title: ${problem.title}`,
    `Description: ${problem.description}`,
    `Function signature: ${problem.function_signature}`,
  ].join('\n');
}
interface CodingProblem {
  id: number; title: string; description: string; function_signature: string;
  starter_code: string; unit_tests: string; difficulty: string;
}

// Debounce helper
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }) as T;
}

export default function CodingTask({ runId, modelId, participantId, sessionId, taskId = 0, isFaulty = false, onTaskComplete }: CodingTaskProps) {
  const [problem, setProblem]       = useState<CodingProblem | null>(null);
  const [loading, setLoading]       = useState(true);
  const [code, setCode]             = useState("# Write your solution here\n");
  const [output, setOutput]         = useState("");
  const [running, setRunning]       = useState(false);
  const [testResults, setTestResults] = useState<{passed:number;failed:number;total:number}|null>(null);
  const [submitted, setSubmitted]     = useState(false);

  // Panel dimensions (resizable)
  const [leftWidth, setLeftWidth]   = useState(280);
  const [outputHeight, setOutputHeight] = useState(120);
  const [chatWidth, setChatWidth]   = useState(340);

  // Which panel is being dragged
  const [dragType, setDragType] = useState<'left' | 'output' | 'chat' | null>(null);
  const dragStartX      = useRef(0);
  const dragStartY      = useRef(0);
  const dragStartValue  = useRef(0);

  // Refs for tracking
  const editCountRef       = useRef(0);
  const starterCodeRef     = useRef("");
  const startTimeRef       = useRef(Date.now());
  const firstSuccessRef    = useRef(false);
  const totalCopyCountRef  = useRef(0);

  const startDrag = useCallback((type: 'left' | 'output' | 'chat', e: React.MouseEvent, currentValue: number) => {
    e.preventDefault();
    setDragType(type);
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    dragStartValue.current = currentValue;
  }, []);

  useEffect(() => {
    if (!dragType) return;
    const onMouseMove = (e: MouseEvent) => {
      if (dragType === 'left') {
        const delta = e.clientX - dragStartX.current;
        setLeftWidth(Math.min(450, Math.max(180, dragStartValue.current + delta)));
      } else if (dragType === 'output') {
        const delta = dragStartY.current - e.clientY;
        setOutputHeight(Math.min(350, Math.max(60, dragStartValue.current + delta)));
      } else if (dragType === 'chat') {
        const delta = e.clientX - dragStartX.current;
        setChatWidth(Math.min(600, Math.max(200, dragStartValue.current - delta)));
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const logCodeEdit = useCallback(
    debounce((..._args: unknown[]) => {
      editCountRef.current += 1;
      logEvent({ run_id: runId, participant_id: participantId, event_type: "code_edit",
        event_data: { edit_count: editCountRef.current, char_count: (code || "").length } });
    }, 5000),
    [runId, participantId]
  );

  // AI-line heuristic: lines not in starter code
  const codeMetrics = (currentCode: string) => {
    const starterLines = new Set(starterCodeRef.current.split("\n").map(l => l.trim()).filter(Boolean));
    const lines = currentCode.split("\n").map(l => l.trim()).filter(Boolean);
    const aiLines = lines.filter(l => !starterLines.has(l)).length;
    return { ai_line_count: aiLines, total_line_count: lines.length,
             code_persistence_pct: lines.length > 0 ? Math.round((aiLines/lines.length)*100) : 0 };
  };

  useEffect(() => {
    async function fetchTask() {
      try {
        // Fetch by pre-assigned ID (counterbalanced); fall back to random for old sessions
        const url = taskId > 0
          ? `/api/tasks?type=coding&id=${taskId}`
          : '/api/tasks?type=coding&random=1';
        const res  = await fetch(url);
        const data = await res.json();
        if (data.empty || !data.task) { setProblem(null); }
        else {
          setProblem(data.task);
          const starter = data.task.starter_code || `${data.task.function_signature || "def solution():"}\n    pass\n`;
          setCode(starter);
          starterCodeRef.current = starter;
          startTimeRef.current   = Date.now();
          logEvent({ run_id: runId, participant_id: participantId, event_type: "task_start",
            event_data: { task_type: "coding", task_id: data.task.id, task_title: data.task.title, model_id: modelId } });
        }
      } catch { setProblem(null); }
      finally { setLoading(false); }
    }
    fetchTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCodeChange = (val: string | undefined) => { setCode(val || ""); logCodeEdit(); };

  const handleCodeCopied = useCallback(({ charCount, lineCount, timeSinceGenerationMs }: { code: string; charCount: number; lineCount: number; timeSinceGenerationMs: number }) => {
    totalCopyCountRef.current += 1;
    logEvent({ run_id: runId, participant_id: participantId, event_type: "code_block_copied",
      event_data: {
        char_count: charCount,
        line_count: lineCount,
        time_since_generation_ms: timeSinceGenerationMs,
        total_copy_count: totalCopyCountRef.current,
        model_id: modelId,
      },
    });
  }, [runId, participantId, modelId]);

  const handleRun = useCallback(async (isSubmit = false) => {
    setRunning(true);
    const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    logEvent({ run_id: runId, participant_id: participantId, event_type: "code_run",
      event_data: { char_count: code.length, model_id: modelId, elapsed_sec: elapsedSec, is_submit: isSubmit } });

    try {
      const unitTests: string[] = problem ? (() => { try { return JSON.parse(problem.unit_tests); } catch { return []; } })() : [];
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, unit_tests: unitTests }),
      });
      const data = await res.json();
      const { tests_passed = 0, tests_failed = 0, tests_total = 0, all_passed = false, stderr = '', user_output = '' } = data;

      setTestResults({ passed: tests_passed, failed: tests_failed, total: tests_total });
      logEvent({ run_id: runId, participant_id: participantId, event_type: "code_run_result",
        event_data: { tests_passed, tests_failed, tests_total,
                      pass_at_1: all_passed, elapsed_sec: elapsedSec, ...codeMetrics(code) } });

      if (all_passed && !firstSuccessRef.current) {
        firstSuccessRef.current = true;
        logEvent({ run_id: runId, participant_id: participantId, event_type: "first_success",
          event_data: { time_to_first_success_sec: elapsedSec, ...codeMetrics(code) } });
      }

      if (isSubmit) {
        setSubmitted(true);
        logEvent({ run_id: runId, participant_id: participantId, event_type: "task_complete",
          event_data: { task_type: "coding", time_to_complete_sec: elapsedSec, final_pass_at_1: all_passed,
                        tests_passed, tests_total, ...codeMetrics(code) } });
        onTaskComplete?.();
      }

      const statusLine = all_passed
        ? `All ${tests_total} tests passed!`
        : `${tests_passed}/${tests_total} tests passed`;
      const errorLine = stderr ? `\n[Warning] ${stderr}` : '';
      const outputLines = (user_output || code.slice(0, 200)).split('\n').slice(0, 10);
      setOutput([statusLine + errorLine, '', ...outputLines].join('\n'));
    } catch {
      setOutput('Execution failed - could not reach /api/execute. Is the server running?');
    }

    setRunning(false);
  }, [runId, participantId, code, modelId, problem, onTaskComplete]);

  const unitTests: string[] = problem
    ? (() => { try { return JSON.parse(problem.unit_tests); } catch { return []; } })()
    : [];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );

  if (!problem) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: "2rem", color: "var(--text-dim)" }}>[-]</div>
      <h3 style={{ color: "var(--text-secondary)" }}>No coding tasks in the database</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Add tasks at <code style={{ color: "var(--accent-teal)" }}>/htilab-nexus</code> → Task Database → Coding Tasks
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Left – Problem (resizable) */}
      <div style={{ width: leftWidth, flexShrink: 0, padding: 20, overflowY: "auto", borderRight: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", position: "relative" }}>
        {/* Drag handle – left panel edge */}
        <div
          onMouseDown={(e) => startDrag('left', e, leftWidth)}
          style={{
            position: "absolute", top: 0, right: -3, bottom: 0, width: 6, cursor: "ew-resize",
            background: dragType === 'left' ? 'var(--accent-blue)' : 'transparent',
            transition: 'background 0.15s', zIndex: 1,
          }}
        />
        <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
          <span className="badge badge-blue">Coding</span>
          <span className={`badge ${problem.difficulty === "easy" ? "badge-emerald" : problem.difficulty === "hard" ? "badge-rose" : "badge-amber"}`}>{problem.difficulty}</span>
        </div>
        <h3 style={{ marginBottom: 12 }}>{problem.title}</h3>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{problem.description}</div>
        {unitTests.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Test Cases</h4>
            <div style={{ background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", padding: 12, border: "1px solid var(--border-subtle)" }}>
              {unitTests.map((test, i) => (
                <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--accent-teal)", padding: "4px 0", borderBottom: i < unitTests.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                  {test}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Centre – Editor + Output overlay */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-primary)", minWidth: 0, position: "relative" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>solution.py</span>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => handleRun(false)} disabled={running}>
              {running ? "Running..." : "▶ Run"}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => handleRun(true)} disabled={running || submitted}>
              {submitted ? "Submitted" : "Submit"}
            </button>
          </div>
        </div>

        {/* Editor – fills all space; output floats on top */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <MonacoEditor
            height="100%"
            language="python"
            value={code}
            onChange={handleCodeChange}
            theme="vs-dark"
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, automaticLayout: true }}
          />
        </div>

        {/* Drag handle – anchored to bottom of container (top of output) */}
        <div
          onMouseDown={(e) => startDrag('output', e, outputHeight)}
          style={{
            position: "absolute", top: "auto", left: 0, right: 0, bottom: `${outputHeight}px`,
            height: 4, cursor: 'ns-resize',
            background: dragType === 'output' ? 'var(--accent-blue)' : 'var(--border-subtle)',
            transition: 'background 0.15s', zIndex: 2,
          }}
        />

        {/* Output section – positioned at bottom, grows upward into editor */}
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: outputHeight,
            background: "var(--bg-tertiary)", overflowY: "auto", zIndex: 1,
          }}
        >
          <div style={{ padding: "8px 16px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Output</span>
            <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: output.includes("Error") ? "var(--accent-rose)" : "var(--accent-emerald)", marginTop: 4, whiteSpace: "pre-wrap" }}>
              {output || "Run your code to see output here."}
            </pre>
          </div>
        </div>
      </div>

      {/* Drag handle */}
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
          onCodeCopied={handleCodeCopied}
          systemPrompt={isFaulty ? faultyCodingSystemPrompt(problem) : normalCodingSystemPrompt(problem)}
          contextInfo={`Current code:\n${code}`}
        />
      </div>
    </div>
  );
}
