"use client";

import { useState, useRef, useCallback } from "react";
import { logEvent } from "@/lib/logger";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  reasoning_details?: unknown; // preserved for multi-turn reasoning
}

interface CodeBlock {
  code: string;
  language: string;
}

interface AIChatPanelProps {
  modelId: string;
  systemPrompt?: string;
  contextInfo?: string;
  // Logging context – optional so the component stays reusable
  runId?: string;
  participantId?: string;
  // Fires when a code block in an assistant message is copied to clipboard
  onCodeCopied?: (info: { code: string; charCount: number; lineCount: number; timeSinceGenerationMs: number }) => void;
}

export default function AIChatPanel({
  modelId, systemPrompt, contextInfo, runId, participantId, onCodeCopied,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCountRef    = useRef(0);
  // Maps assistant message array index → timestamp it was rendered
  const messageTimestamps = useRef<Map<number, number>>(new Map());

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // Parse code blocks from a message — returns array of { code, language } for each ```...``` fence
  const parseCodeBlocks = (content: string): CodeBlock[] => {
    const blocks: CodeBlock[] = [];
    const fenceRe = /```(\w*)\n?([\s\S]*?)```/g;
    let match;
    while ((match = fenceRe.exec(content)) !== null) {
      blocks.push({ language: match[1] || "text", code: match[2] });
    }
    return blocks;
  };

  const handleCopyCode = (code: string, msgIndex: number) => {
    navigator.clipboard.writeText(code).catch(() => {});
    const sentAt = messageTimestamps.current.get(msgIndex) ?? Date.now();
    const timeSinceGenerationMs = Date.now() - sentAt;
    if (onCodeCopied) {
      onCodeCopied({
        code,
        charCount: code.length,
        lineCount: code.split("\n").length,
        timeSinceGenerationMs,
      });
    }
  };

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

        {messages.map((msg, i) => {
          const isAssistant = msg.role === "assistant";
          // Record timestamp on first render of each assistant message
          if (isAssistant && !messageTimestamps.current.has(i)) {
            messageTimestamps.current.set(i, Date.now());
          }
          if (!isAssistant || !msg.content.includes("```")) {
            return (
              <div key={i} className={`chat-message ${msg.role}`}>
                {isAssistant && !!msg.reasoning_details && (
                  <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: 4, fontStyle: "italic" }}>
                    🧠 reasoning active
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.content}
                </div>
              </div>
            );
          }
          // Render message with detected code blocks — split text and code segments
          const codeBlocks = parseCodeBlocks(msg.content);
          // Build a simplified regex to split: we replace ```...``` with a placeholder, then split
          let segmentIdx = 0;
          const parts = msg.content.split(/(```[\s\S]*?```)/g);
          return (
            <div key={i} className={`chat-message ${msg.role}`}>
              {!!msg.reasoning_details && (
                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: 4, fontStyle: "italic" }}>
                  🧠 reasoning active
                </div>
              )}
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {parts.map((part, j) => {
                  if (part.startsWith("```")) {
                    const block = codeBlocks[segmentIdx++];
                    return (
                      <div key={j} style={{ position: "relative", margin: "8px 0" }}>
                        {block.language && block.language !== "text" && (
                          <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginBottom: 2, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
                            {block.language}
                          </div>
                        )}
                        <div style={{
                          background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)", overflow: "hidden",
                        }}>
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "4px 10px", borderBottom: "1px solid var(--border-subtle)",
                            background: "rgba(0,0,0,0.2)",
                          }}>
                            <span style={{ fontSize: "0.65rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                              {block.code.split("\n").length} lines
                            </span>
                            <button
                              title="Copy code"
                              onClick={() => handleCopyCode(block.code, i)}
                              style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "var(--text-dim)", padding: "2px 4px", borderRadius: 3,
                                fontSize: "0.7rem", fontFamily: "var(--font-mono)",
                              }}
                            >
                              📋 Copy
                            </button>
                          </div>
                          <pre style={{ margin: 0, padding: "8px 12px", fontSize: "0.8rem", fontFamily: "var(--font-mono)", overflowX: "auto" }}>
                            <code>{block.code}</code>
                          </pre>
                        </div>
                      </div>
                    );
                  }
                  // Plain text segment — may contain other ``` blocks (nested aren't possible in valid markdown, but this handles stray backticks)
                  return <span key={j} style={part.trim() === "" ? undefined : {}}>{part}</span>;
                })}
              </div>
            </div>
          );
        })}

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
