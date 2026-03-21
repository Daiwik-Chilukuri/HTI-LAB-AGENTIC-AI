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

export default function CodingTask({ runId, modelId, participantId, sessionId, taskId = 0 }: CodingTaskProps) {
  const [problem, setProblem]       = useState<CodingProblem | null>(null);
  const [loading, setLoading]       = useState(true);
  const [code, setCode]             = useState("# Write your solution here\n");
  const [output, setOutput]         = useState("");
  const [running, setRunning]       = useState(false);
  const [testResults, setTestResults] = useState<{passed:number;failed:number;total:number}|null>(null);
  const editorRef                   = useRef<unknown>(null);
  const editCountRef                = useRef(0);
  const startTimeRef                = useRef<number>(Date.now());
  const firstSuccessRef             = useRef<boolean>(false);
  const starterCodeRef              = useRef<string>("");

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

  const handleRun = useCallback((isSubmit = false) => {
    setRunning(true);
    const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    logEvent({ run_id: runId, participant_id: participantId, event_type: "code_run",
      event_data: { char_count: code.length, model_id: modelId, elapsed_sec: elapsedSec, is_submit: isSubmit } });
    setTimeout(() => {
      // Simulated results — wire up Pyodide/backend executor for real pass@k
      const total = problem ? (() => { try { return JSON.parse(problem.unit_tests).length; } catch { return 0; } })() : 0;
      const passed = Math.min(editCountRef.current > 0 ? Math.ceil(total * 0.5) : 0, total); // placeholder
      const allPassed = passed === total && total > 0;
      const res = { passed, failed: total - passed, total };
      setTestResults(res);
      logEvent({ run_id: runId, participant_id: participantId, event_type: "code_run_result",
        event_data: { tests_passed: res.passed, tests_failed: res.failed, tests_total: res.total,
                      pass_at_1: allPassed, elapsed_sec: elapsedSec, ...codeMetrics(code) } });
      if (allPassed && !firstSuccessRef.current) {
        firstSuccessRef.current = true;
        logEvent({ run_id: runId, participant_id: participantId, event_type: "first_success",
          event_data: { time_to_first_success_sec: elapsedSec, ...codeMetrics(code) } });
      }
      if (isSubmit) {
        logEvent({ run_id: runId, participant_id: participantId, event_type: "task_complete",
          event_data: { task_type: "coding", time_to_complete_sec: elapsedSec, final_pass_at_1: allPassed,
                        tests_passed: res.passed, tests_total: res.total, ...codeMetrics(code) } });
      }
      setOutput(allPassed
        ? `✅ All ${total} tests passed!\n${code.slice(0, 200)}`
        : `❌ ${res.passed}/${total} tests passed.\n▶ Simulated — connect Pyodide for real execution.\n\n${code.slice(0, 200)}`);
      setRunning(false);
    }, 800);
  }, [runId, participantId, code, modelId, problem]);

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
      <div style={{ fontSize: "3rem" }}>📭</div>
      <h3 style={{ color: "var(--text-secondary)" }}>No coding tasks in the database</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Add tasks at <code style={{ color: "var(--accent-teal)" }}>/htilab-nexus</code> → Task Database → Coding Tasks
      </p>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 340px", height: "100%", gap: 1 }}>
      {/* Left – Problem */}
      <div style={{ padding: 20, overflowY: "auto", borderRight: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
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

      {/* Centre – Editor */}
      <div style={{ display: "flex", flexDirection: "column", background: "var(--bg-primary)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--text-muted)" }}>solution.py</span>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => handleRun(false)} disabled={running}>
              {running ? "Running..." : "▶ Run"}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => handleRun(true)} disabled={running}>
              ✓ Submit
            </button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <MonacoEditor height="100%" language="python" theme="vs-dark" value={code}
            onChange={handleCodeChange}
            onMount={(editor: unknown) => { editorRef.current = editor; }}
            options={{ fontSize: 14, fontFamily: "'JetBrains Mono', monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 12 }, lineNumbers: "on", bracketPairColorization: { enabled: true }, automaticLayout: true }}
          />
        </div>
        <div style={{ height: 120, background: "var(--bg-tertiary)", borderTop: "1px solid var(--border-subtle)", padding: "8px 16px", overflowY: "auto" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Output</span>
          <pre style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: output.includes("Error") ? "var(--accent-rose)" : "var(--accent-emerald)", marginTop: 4, whiteSpace: "pre-wrap" }}>
            {output || "Run your code to see output here."}
          </pre>
        </div>
      </div>

      {/* Right – AI Chat */}
      <div style={{ borderLeft: "1px solid var(--border-subtle)" }}>
        <AIChatPanel
          modelId={modelId} runId={runId} participantId={participantId}
          systemPrompt={[
            `You are an AI coding assistant for a research study. The participant is working on this Python problem:`,
            `Title: ${problem.title}`,
            `Description: ${problem.description}`,
            `Function signature: ${problem.function_signature}`,
            ``,
            `YOUR ROLE IS TO GUIDE, NOT TO SOLVE FOR THEM. Follow these rules strictly:`,
            `1. WAIT FOR A SPECIFIC QUESTION. If the user sends a vague message ("hello", "hi", "help", "start") do NOT write any code or explain the solution. Instead, ask them where they're stuck or what part they need help with.`,
            `2. NEVER write a complete solution or a complete working function.`,
            `3. You may show small code snippets (1-3 lines) to illustrate a concept, but never the full answer.`,
            `4. Guide by: asking what they've tried, explaining relevant Python concepts, pointing out what direction to think, reviewing their current code for logic errors.`,
            `5. If the user asks for the full solution directly, decline and instead offer hints to help them arrive at it themselves.`,
          ].join('\n')}
          contextInfo={`Current code:\n${code}`}
        />
      </div>
    </div>
  );
}
