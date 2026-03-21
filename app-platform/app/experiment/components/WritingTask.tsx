"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import AIChatPanel from "./AIChatPanel";
import { logEvent } from "@/lib/logger";
import { useTaskHeartbeat } from "@/lib/useTaskHeartbeat";

interface WritingTaskProps {
  runId: string; modelId: string; participantId: string; sessionId: string; taskId?: number;
}
interface WritingPrompt {
  id: number; title: string; prompt: string; genre: string;
  word_count_target: number; evaluation_criteria: string; difficulty: string;
}

export default function WritingTask({ runId, modelId, participantId, sessionId, taskId = 0 }: WritingTaskProps) {
  const [task, setTask]             = useState<WritingPrompt | null>(null);
  const [loading, setLoading]       = useState(true);
  const [text, setText]             = useState("");
  const [selection, setSelection]   = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [submitted, setSubmitted]   = useState(false);
  const startTimeRef    = useRef<number>(Date.now());
  const acceptCountRef  = useRef(0);
  const actionCountRef  = useRef(0);
  const lastSuggestion  = useRef("");

  // 30-second engagement heartbeat
  useTaskHeartbeat({ runId, participantId });

  useEffect(() => {
    async function fetchTask() {
      try {
        const url = taskId > 0
          ? `/api/tasks?type=writing&id=${taskId}`
          : '/api/tasks?type=writing&random=1';
        const res  = await fetch(url);
        const data = await res.json();
        if (data.empty || !data.task) { setTask(null); }
        else {
          setTask(data.task);
          startTimeRef.current = Date.now();
          logEvent({ run_id: runId, participant_id: participantId, event_type: "task_start",
            event_data: { task_type: "writing", task_id: data.task.id, task_title: data.task.title, model_id: modelId } });
        }
      } catch { setTask(null); }
      finally { setLoading(false); }
    }
    fetchTask();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const handleAction = useCallback(async (action: string) => {
    if (!task) return;
    setLoadingAction(action);
    setAiSuggestion("");

    logEvent({ run_id: runId, participant_id: participantId, event_type: "ai_action_clicked",
      event_data: { action, model_id: modelId, word_count: wordCount, has_selection: selection.length > 0 } });

    const actionPrompts: Record<string, string> = {
      continue:  "Continue writing from where the user left off. Same tone and style. Write 2–3 more sentences.",
      rewrite:   `Rewrite the following selected text to improve clarity and flow: "${selection || text.slice(-200)}"`,
      summarize: `Summarize this text in 1–2 sentences:\n\n${text}`,
      outline:   `Based on the task "${task.prompt}", generate a brief outline (4–5 bullet points).`,
      improve:   `Suggest specific improvements for this draft. Be constructive:\n\n${text}`,
    };

    try {
      const res  = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: modelId,
          messages: [
            { role: "system", content: `You are a writing assistant. The user is drafting a ${task.genre} piece.\n\nTask: "${task.prompt}"` },
            { role: "user", content: `Current draft:\n${text || "(empty)"}\n\n---\n\n${actionPrompts[action]}` },
          ],
          temperature: 0.8, max_tokens: 512,
        }),
      });
      const data = await res.json();
      if (data.content) { lastSuggestion.current = data.content; setAiSuggestion(data.content); }
    } catch { setAiSuggestion("⚠️ Could not get suggestion. Please try again."); }
    finally { setLoadingAction(""); }
  }, [task, text, selection, modelId, runId, participantId, wordCount]);

  // Simple edit-distance approximation: character-level diff fraction
  const editDistanceFrac = (a: string, b: string) => {
    if (!a && !b) return 0;
    const longer = Math.max(a.length, b.length);
    if (longer === 0) return 0;
    let same = 0;
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) { if (a[i] === b[i]) same++; }
    return Math.round(((longer - same) / longer) * 100);
  };

  const handleAccept = () => {
    setText(p => p + "\n" + aiSuggestion);
    acceptCountRef.current += 1;
    setAiSuggestion("");
    logEvent({ run_id: runId, participant_id: participantId, event_type: "suggestion_accepted",
      event_data: { model_id: modelId, suggestion_char_count: aiSuggestion.length,
                    accept_count: acceptCountRef.current } });
  };

  const handleDismiss = () => {
    setAiSuggestion("");
    logEvent({ run_id: runId, participant_id: participantId, event_type: "suggestion_dismissed",
      event_data: { model_id: modelId, action_count: actionCountRef.current } });
  };

  const handleSubmit = () => {
    if (!task || !text.trim()) return;
    const elapsedSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    const editDist = editDistanceFrac(lastSuggestion.current, text);
    const acceptRate = actionCountRef.current > 0
      ? Math.round((acceptCountRef.current / actionCountRef.current) * 100) : 0;
    setSubmitted(true);
    logEvent({ run_id: runId, participant_id: participantId, event_type: "task_complete",
      event_data: { task_type: "writing", time_to_complete_sec: elapsedSec,
                    word_count: wordCount, word_count_target: task.word_count_target,
                    edit_distance_pct: editDist, suggestion_accept_rate_pct: acceptRate,
                    total_actions: actionCountRef.current, total_accepts: acceptCountRef.current } });
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );

  if (!task) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: "3rem" }}>📭</div>
      <h3 style={{ color: "var(--text-secondary)" }}>No writing prompts in the database</h3>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
        Add prompts at <code style={{ color: "var(--accent-teal)" }}>/htilab-nexus</code> → Task Database → Writing Prompts
      </p>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", height: "100%", gap: 1 }}>
      <div style={{ display: "flex", flexDirection: "column", padding: 24, overflowY: "auto" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
          <span className="badge badge-emerald">Content Creation</span>
          <span className="badge badge-blue">{task.genre}</span>
          <span className={`badge ${task.difficulty === "easy" ? "badge-emerald" : task.difficulty === "hard" ? "badge-rose" : "badge-amber"}`}>{task.difficulty}</span>
        </div>
        <h3 style={{ marginBottom: 8 }}>{task.title}</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 20, padding: "14px 18px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
          {task.prompt}
        </p>

        <div className="flex gap-2" style={{ marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "continue",  label: "✏️ Continue" },
            { key: "rewrite",   label: "🔄 Rewrite Selection" },
            { key: "summarize", label: "📝 Summarize" },
            { key: "outline",   label: "📋 Outline" },
            { key: "improve",   label: "🎯 Improve" },
          ].map(a => (
            <button key={a.key} className="btn btn-secondary btn-sm" onClick={() => handleAction(a.key)} disabled={!!loadingAction}>
              {loadingAction === a.key ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
              {a.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          <textarea className="input" style={{ height: "100%", minHeight: 300, fontSize: "0.95rem", lineHeight: 1.8, resize: "none", fontFamily: "var(--font-sans)" }}
            placeholder="Start writing here..." value={text}
            onChange={e => setText(e.target.value)}
            onSelect={e => { const t = e.target as HTMLTextAreaElement; setSelection(t.value.substring(t.selectionStart, t.selectionEnd)); }}
          />
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: wordCount >= task.word_count_target ? "var(--accent-emerald)" : "var(--text-dim)" }}>
            {wordCount} / {task.word_count_target} words
          </span>
          <div className="flex items-center gap-2">
            <div style={{ width: 100, height: 4, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
              <div style={{ width: `${Math.min((wordCount / task.word_count_target) * 100, 100)}%`, height: "100%", background: wordCount >= task.word_count_target ? "var(--accent-emerald)" : "var(--accent-blue)", transition: "width 0.3s" }} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={!text.trim() || submitted}>
              {submitted ? "✅ Submitted" : "Submit Draft"}
            </button>
          </div>
        </div>

        {aiSuggestion && (
          <div className="fade-in" style={{ marginTop: 16, padding: 16, background: "rgba(45, 212, 191, 0.06)", border: "1px solid rgba(45, 212, 191, 0.15)", borderRadius: "var(--radius-md)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent-teal)" }}>AI Suggestion</span>
              <div className="flex gap-1">
                <button className="btn btn-primary btn-sm" onClick={handleAccept}>Accept</button>
                <button className="btn btn-ghost btn-sm" onClick={handleDismiss}>Dismiss</button>
              </div>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiSuggestion}</p>
          </div>
        )}
      </div>

      <div style={{ borderLeft: "1px solid var(--border-subtle)" }}>
        <AIChatPanel modelId={modelId} runId={runId} participantId={participantId}
          systemPrompt={[
            `You are a writing assistant for a research study. The participant is working on the following writing task:`,
            `Genre: ${task.genre} | Target: ~${task.word_count_target} words`,
            `Task brief: "${task.prompt}"`,
            ``,
            `YOUR ROLE IS TO ASSIST, NOT TO WRITE FOR THEM. Follow these rules strictly:`,
            `1. WAIT FOR A SPECIFIC QUESTION. If the user sends a vague message ("hello", "hi", "start", "help") do NOT produce any writing. Instead, ask them what specific aspect they want help with (e.g. brainstorming ideas, improving a sentence, structure, tone).`,
            `2. NEVER write the full piece or a complete draft unprompted.`,
            `3. NEVER write more than 2-3 sentences of sample text unless the user explicitly says "write" or "give me an example".`,
            `4. Focus on: asking clarifying questions, giving structural suggestions, explaining tone/genre conventions, reviewing what they've written.`,
            `5. If the user asks you to write the whole thing, politely decline and offer to help them write it themselves instead.`,
          ].join('\n')}
          contextInfo={`Current draft (${wordCount} words):\n${text || "(empty — participant has not started writing yet)"}`}
        />
      </div>
    </div>
  );
}
