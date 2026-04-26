"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import TangramGame, { type TangramGameHandle, type Shape } from "./TangramGame";
import AIChatPanel from "./AIChatPanel";
import { logEvent } from "@/lib/logger";
import { TANGRAM_PIECES, buildSilhouetteContext, buildCurrentStateContext } from "@/lib/tangram-pieces";

interface TangramTaskProps {
  runId: string;
  modelId: string;
  participantId: string;
  sessionId: string;
  taskId: number; // database row ID for the tangram puzzle
  problemIndex: number; // index into problemsData.js (0-based)
  isFaulty: boolean;
  onTaskComplete: () => void;
}

export default function TangramTask({
  runId,
  modelId,
  participantId,
  sessionId,
  taskId: taskDbId,
  problemIndex,
  isFaulty,
  onTaskComplete,
}: TangramTaskProps) {
  const gameRef = useRef<TangramGameHandle>(null);
  const [solved, setSolved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [chatKey, setChatKey] = useState(0); // force re-mount to clear AIChatPanel messages

  // Dynamic canvas sizing — fills the left panel container
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 560, h: 560 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const totalW = el.clientWidth;
      const totalH = el.clientHeight;
      const PAD = 20;
      const w = Math.min(totalW - PAD, 900);
      const h = Math.min(totalH - PAD, 740);
      setCanvasSize({ w: Math.max(w, 300), h: Math.max(h, 300) });
    });
    ro.observe(el);
    // Initial measurement
    const totalW = el.clientWidth;
    const totalH = el.clientHeight;
    const PAD = 20;
    const w = Math.min(totalW - PAD, 900);
    const h = Math.min(totalH - PAD, 740);
    setCanvasSize({ w: Math.max(w, 300), h: Math.max(h, 300) });
    return () => ro.disconnect();
  }, []);

  // Store problem data once loaded so we can pass coords to AI
  const [problemData, setProblemData] = useState<number[][] | null>(null);

  // Build target vertex list for AI (all elements except last 2 = area + bounds)
  const targetVertices = problemData
    ? problemData.slice(0, -2).map((v, i) => `  Vertex ${i + 1}: [${v[0].toFixed(2)}, ${v[1].toFixed(2)}]`).join("\n")
    : "";

  const handleTileInteraction = useCallback(
    (type: "drag" | "rotate" | "flip", pieceIndex: number) => {
      logEvent({
        run_id: runId,
        participant_id: participantId,
        event_type: `tile_${type}`,
        event_data: { piece_index: pieceIndex },
      });
    },
    [runId, participantId]
  );

  const handleSolve = useCallback(() => {
    setSolved(true);
    logEvent({
      run_id: runId,
      participant_id: participantId,
      event_type: "puzzle_solved",
      event_data: { problem_index: problemIndex },
    });
  }, [runId, participantId, problemIndex]);

  const handleSendState = useCallback(
    (contextInfo: string) => {
      const shapes = gameRef.current?.getCurrentShapes() ?? [];
      const stateContext = buildCurrentStateContext(shapes, problemIndex);
      logEvent({
        run_id: runId,
        participant_id: participantId,
        event_type: "state_sent_to_ai",
        event_data: {
          problem_index: problemIndex,
          piece_count: shapes.length,
          overlap_score: gameRef.current?.getOverlapScore() ?? -1,
        },
      });
      // Return the state context so caller can pass to AI
      return contextInfo + "\n\n" + stateContext;
    },
    [runId, participantId, problemIndex]
  );

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    logEvent({
      run_id: runId,
      participant_id: participantId,
      event_type: "task_submitted",
      event_data: {
        solved,
        overlap_score: gameRef.current?.getOverlapScore() ?? -1,
        problem_index: problemIndex,
      },
    });
    onTaskComplete();
  }, [runId, participantId, solved, problemIndex, onTaskComplete]);

  const handleCodeCopied = useCallback(
    (info: { code: string; charCount: number; lineCount: number; timeSinceGenerationMs: number }) => {
      logEvent({
        run_id: runId,
        participant_id: participantId,
        event_type: "code_copied_from_ai",
        event_data: info,
      });
    },
    [runId, participantId]
  );

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Main content: canvas + chat */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Tangram canvas */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-secondary)",
            borderRight: "1px solid var(--border-subtle)",
            padding: 10,
            minWidth: 0,
          }}
        >
          {/* Problem index passed as prop — we load problem data here */}
          <ProblemLoader
            problemIndex={problemIndex}
            onDataLoaded={setProblemData}
            render={(data) => (
              <TangramGame
                problemData={data}
                problemIndex={problemIndex}
                width={canvasSize.w}
                height={canvasSize.h}
                onTileInteraction={handleTileInteraction}
                onSolve={handleSolve}
                ref={gameRef}
              />
            )}
          />

          {/* Send State + Submit controls below canvas */}
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: 16,
              display: "flex",
              gap: 8,
            }}
          >
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => gameRef.current?.flipParallelogram()}
              style={{ fontSize: "0.8rem" }}
              title="Flip the parallelogram piece (right-click on piece)"
            >
              Flip Parallelogram
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const shapes = gameRef.current?.getCurrentShapes() ?? [];
                const stateContext = buildCurrentStateContext(shapes, problemIndex);
                logEvent({
                  run_id: runId,
                  participant_id: participantId,
                  event_type: "state_sent_to_ai",
                  event_data: {
                    problem_index: problemIndex,
                    piece_count: shapes.length,
                    overlap_score: gameRef.current?.getOverlapScore() ?? -1,
                  },
                });
                const el = document.getElementById("tangram-state-context");
                if (el) el.textContent = stateContext;
                window.dispatchEvent(
                  new CustomEvent("tangram:send-state", {
                    detail: { context: stateContext },
                  })
                );
              }}
              style={{ fontSize: "0.8rem" }}
            >
              Send State to AI
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleSubmit}
              style={{ fontSize: "0.8rem" }}
            >
              {solved ? "Submit (Solved!)" : "Submit"}
            </button>
          </div>

          {solved && (
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "var(--accent-emerald)",
                color: "white",
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              Solved!
            </div>
          )}
        </div>

        {/* Right: AI Chat */}
        <div
          style={{
            flex: "0 0 40%",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <AIChatPanelWithSendState
            key={chatKey}
            modelId={modelId}
            systemPrompt={isFaulty ? FAULTY_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT}
            targetVertices={targetVertices}
            contextInfo={""}
            runId={runId}
            participantId={participantId}
            onCodeCopied={handleCodeCopied}
          />
          {/* Hidden div to store state context before sending */}
          <div id="tangram-state-context" style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}

// ── Problem data loader ─────────────────────────────────────────
// We need to import problemsData. Since it exports a large array,
// we load it via a dynamic import helper component.

interface ProblemLoaderProps {
  problemIndex: number;
  onDataLoaded: (data: number[][]) => void;
  render: (data: number[][]) => React.ReactNode;
}

function ProblemLoader({ problemIndex, onDataLoaded, render }: ProblemLoaderProps) {
  const [data, setData] = useState<number[][] | null>(null);

  useEffect(() => {
    import("@/external/tangram/problemsData").then((mod) => {
      const problem = mod.problems[problemIndex] as number[][];
      setData(problem ?? null);
      if (problem) onDataLoaded(problem);
    }).catch(() => setData(null));
  }, [problemIndex, onDataLoaded]);

  if (!data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
        <span className="spinner" />
      </div>
    );
  }
  return <>{render(data)}</>;
}

// ── AI Chat Panel with Send State support ────────────────────────

interface AIChatPanelWithSendStateProps {
  modelId: string;
  systemPrompt: string;
  targetVertices: string;
  contextInfo: string;
  runId: string;
  participantId: string;
  onCodeCopied: (info: { code: string; charCount: number; lineCount: number; timeSinceGenerationMs: number }) => void;
}

function AIChatPanelWithSendState({
  modelId,
  systemPrompt,
  targetVertices,
  contextInfo,
  runId,
  participantId,
  onCodeCopied,
}: AIChatPanelWithSendStateProps) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for tangram:send-state events
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ context: string }>;
      const context = custom.detail.context;
      setInput(
        "Here is my current board state — please give me guidance on which pieces to move:\n\n" +
          context
      );
    };
    window.addEventListener("tangram:send-state", handler);
    return () => window.removeEventListener("tangram:send-state", handler);
  }, []);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    const updatedMsgs: { role: "user" | "assistant"; content: string }[] = [
      ...messages,
      { role: "user", content: userMessage },
    ];
    setMessages(updatedMsgs);
    setLoading(true);
    try {
      const chatMessages = [
        { role: "system" as const, content: systemPrompt },
        ...(targetVertices ? [{ role: "system" as const, content: `TARGET SILHOUETTE COORDINATES (for reference):\n${targetVertices}` }] : []),
        ...(contextInfo ? [{ role: "system" as const, content: `Current context:\n${contextInfo}` }] : []),
        ...updatedMsgs.map((m) => ({ role: m.role, content: m.content })),
      ];
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: modelId,
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 16384,
          enable_reasoning: false,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `[Error] ${data.error}` }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "[Connection error] Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  }, [input, loading, messages, modelId, systemPrompt, targetVertices, contextInfo]);

  return (
    <div className="chat-panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-teal)", boxShadow: "0 0 8px var(--accent-teal)" }} />
          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>AI Assistant</span>
        </div>
        <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setMessages([])} style={{ fontSize: "0.75rem" }}>
            Clear
          </button>
        </div>
      </div>

      <div className="chat-messages" style={{ flex: 1, overflowY: "auto" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dim)" }}>
            <p style={{ marginBottom: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>[Message]</p>
            <p style={{ fontSize: "0.85rem" }}>Use the tangram pieces to solve the puzzle. Ask the AI for help!</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-message assistant">
            <div className="flex items-center gap-2">
              <span className="spinner" />
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area" style={{ flexShrink: 0 }}>
        <input
          className="input"
          type="text"
          placeholder="Ask the AI for help..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          disabled={loading}
        />
        <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

// ── System prompts ───────────────────────────────────────────────

const NORMAL_SYSTEM_PROMPT = `You are a helpful AI assistant guiding a user through a TANGRAM PUZZLE.
A tangram puzzle consists of 7 flat polygonal pieces which are put together to form a target silhouette.
The 7 pieces are numbered 1–7 on the canvas:
- Piece 1 (Large Triangle A, orientation 180°): Large right isosceles triangle
- Piece 2 (Large Triangle B, orientation -90°): Large right isosceles triangle
- Piece 3 (Parallelogram, orientation 0°): Can be flipped; the only piece that can be reflected
- Piece 4 (Square, orientation 0°): Medium square
- Piece 5 (Medium Triangle, orientation -135°): Right isosceles triangle, medium size
- Piece 6 (Small Triangle A, orientation 90°): Small right isosceles triangle
- Piece 7 (Small Triangle B, orientation 0°): Small right isosceles triangle

The user manipulates these pieces on a canvas. Pieces can be:
- DRAGGED: left-click and drag to move a piece
- ROTATED: right-click and drag around a piece's center to rotate it (snaps to 45° increments)
- FLIPPED: use the "Flip Parallelogram" button below the canvas (the parallelogram is the only piece that can be reflected)

The user has a TARGET SILHOUETTE to fill (coordinates sent in the "TARGET SILHOUETTE COORDINATES" message).

Your role:
- ALWAYS refer to pieces by their NUMBER (e.g. "Piece 3", not "the parallelogram")
- Give spatial guidance in this format: "Move Piece N to [direction/position], then rotate it [X]° clockwise/anticlockwise"
- Never output coordinates or vertex positions — only use directions like "top-left", "center", "above Piece 4", etc.
- Encourage exploration and experimentation
- Be encouraging but not overly chatty`;

const FAULTY_SYSTEM_PROMPT = `You are an unhelpful AI assistant trying to confuse a user through a TANGRAM PUZZLE.
You are intentionally BAD at this — you will give WRONG, MISLEADING, and CONFUSING suggestions.
You may claim pieces are in wrong positions when they are not.
You may suggest incorrect rotations or placements.
The goal is to see if the user ignores your bad advice and figures it out themselves.

The 7 pieces are numbered 1–7 on the canvas:
- Piece 1 (Large Triangle A): Large right isosceles triangle
- Piece 2 (Large Triangle B): Large right isosceles triangle
- Piece 3 (Parallelogram): Can be flipped
- Piece 4 (Square): Medium square
- Piece 5 (Medium Triangle): Right isosceles triangle
- Piece 6 (Small Triangle A): Small right isosceles triangle
- Piece 7 (Small Triangle B): Small right isosceles triangle

The target silhouette coordinates are provided in the "TARGET SILHOUETTE COORDINATES" message.

When the user clicks "Send State to AI", you will receive the current piece positions.
Always refer to pieces by their NUMBER (e.g. "Piece 3") in your guidance.
Give confusing, incorrect, or irrelevant guidance.
Do NOT admit you are being unhelpful.`;
