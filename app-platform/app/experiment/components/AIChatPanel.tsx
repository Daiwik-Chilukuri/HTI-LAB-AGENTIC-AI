"use client";

import { useState, useRef, useCallback } from "react";
import { logEvent } from "@/lib/logger";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  reasoning_details?: unknown; // preserved for multi-turn reasoning
}

interface AIChatPanelProps {
  modelId: string;
  systemPrompt?: string;
  contextInfo?: string;
  // Logging context – optional so the component stays reusable
  runId?: string;
  participantId?: string;
}

export default function AIChatPanel({
  modelId, systemPrompt, contextInfo, runId, participantId,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCountRef    = useRef(0);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    const updatedMsgs: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(updatedMsgs);
    msgCountRef.current += 1;

    // Log user message sent
    if (runId && participantId) {
      logEvent({ run_id: runId, participant_id: participantId, event_type: "ai_chat_sent",
        event_data: { message_index: msgCountRef.current, char_count: userMessage.length, model_id: modelId } });
    }

    setLoading(true);
    try {
      // Build OpenRouter-compatible message list, preserving reasoning_details for chaining
      const chatMessages = [
        { role: "system" as const, content: systemPrompt || "You are a helpful AI assistant. Help the user with their task." },
        ...(contextInfo ? [{ role: "system" as const, content: `Current context:\n${contextInfo}` }] : []),
        ...updatedMsgs.map(m => m.reasoning_details
          ? { role: m.role, content: m.content, reasoning_details: m.reasoning_details }
          : { role: m.role, content: m.content }),
      ];

      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, messages: chatMessages, temperature: 0.7, max_tokens: 1024 }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${data.error}` }]);
      } else {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: data.content,
          reasoning_details: data.reasoning_details ?? undefined,
        };
        setMessages(prev => [...prev, assistantMsg]);

        // Log AI response received
        if (runId && participantId) {
          logEvent({ run_id: runId, participant_id: participantId, event_type: "ai_chat_received",
            event_data: {
              message_index: msgCountRef.current,
              char_count:    data.content?.length ?? 0,
              model_id:      modelId,
              has_reasoning: !!data.reasoning_details,
              tokens:        data.usage?.total_tokens ?? null,
            },
          });
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Connection error. Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  }, [input, loading, messages, modelId, systemPrompt, contextInfo, runId, participantId]);

  return (
    <div className="chat-panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-teal)", boxShadow: "0 0 8px var(--accent-teal)" }} />
          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>AI Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            {messages.filter(m => m.role === "user").length} msgs
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMessages([])} style={{ fontSize: "0.75rem" }}>
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dim)" }}>
            <p style={{ fontSize: "1.5rem", marginBottom: 8 }}>💬</p>
            <p style={{ fontSize: "0.85rem" }}>Ask the AI assistant for help</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            {msg.role === "assistant" && !!msg.reasoning_details && (
              <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: 4, fontStyle: "italic" }}>
                🧠 reasoning active
              </div>
            )}
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {msg.content}
            </div>
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

      {/* Input */}
      <div className="chat-input-area" style={{ flexShrink: 0 }}>
        <input
          className="input"
          type="text"
          placeholder="Ask the AI for help..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage()}
          disabled={loading}
        />
        <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
