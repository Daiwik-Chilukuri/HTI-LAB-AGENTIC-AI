"use client";

import { useState, useRef, useCallback } from "react";
import { logEvent } from "@/lib/logger";
import { renderMarkdown } from "./renderMarkdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  reasoning_details?: unknown;
}

interface CodeBlock {
  code: string;
  language: string;
}

interface AIChatPanelProps {
  modelId: string;
  systemPrompt?: string;
  contextInfo?: string;
  runId?: string;
  participantId?: string;
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
  const messageTimestamps = useRef<Map<number, number>>(new Map());

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // Parse code blocks from a message
  const parseCodeBlocks = (content: string): CodeBlock[] => {
    const blocks: CodeBlock[] = [];
    const fenceRe = /```(\w*)\n?([\s\S]*?)```/g;
    let match;
    while ((match = fenceRe.exec(content)) !== null) {
      blocks.push({ language: match[1] || "text", code: match[2] });
    }
    return blocks;
  };

  // Find all code block ranges in the content (start index, end index, block)
  const findCodeBlockRanges = (content: string): Array<{ start: number; end: number; block: CodeBlock }> => {
    const ranges: Array<{ start: number; end: number; block: CodeBlock }> = [];
    const fenceRe = /```(\w*)\n?([\s\S]*?)```/g;
    let match;
    while ((match = fenceRe.exec(content)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        block: { language: match[1] || "text", code: match[2] },
      });
    }
    return ranges;
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

  // Render a code block with copy button
  const renderCodeBlock = (block: CodeBlock, key: number | string) => (
    <div key={key} style={{ position: "relative", margin: "8px 0" }}>
      {block.language && block.language !== "text" && (
        <div style={{
          fontSize: "0.65rem", color: "var(--text-dim)", marginBottom: 2,
          fontFamily: "var(--font-mono)", textTransform: "uppercase",
        }}>
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
            onClick={() => {
              navigator.clipboard.writeText(block.code).catch(() => {});
            }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-dim)", padding: "2px 4px", borderRadius: 3,
              fontSize: "0.7rem", fontFamily: "var(--font-mono)",
            }}
          >
            Copy
          </button>
        </div>
        <pre style={{ margin: 0, padding: "8px 12px", fontSize: "0.8rem", fontFamily: "var(--font-mono)", overflowX: "auto" }}>
          <code>{block.code}</code>
        </pre>
      </div>
    </div>
  );

  // Render message content with markdown formatting + code blocks
  const renderMessageContent = (content: string) => {
    const codeBlockRanges = findCodeBlockRanges(content);

    // No code blocks — render full content as markdown
    if (codeBlockRanges.length === 0) {
      return <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{renderMarkdown(content)}</div>;
    }

    // Interleave markdown text segments with code blocks
    const segments: React.ReactNode[] = [];
    let lastEnd = 0;

    codeBlockRanges.forEach((range, idx) => {
      // Text before this code block → render as markdown
      if (range.start > lastEnd) {
        const textBefore = content.slice(lastEnd, range.start);
        segments.push(
          <div key={`text-${idx}`} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {renderMarkdown(textBefore)}
          </div>
        );
      }
      // The code block itself
      segments.push(renderCodeBlock(range.block, `code-${idx}`));
      lastEnd = range.end;
    });

    // Text after the last code block
    if (lastEnd < content.length) {
      const textAfter = content.slice(lastEnd);
      segments.push(
        <div key="text-last" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {renderMarkdown(textAfter)}
        </div>
      );
    }

    return <>{segments}</>;
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    const updatedMsgs: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(updatedMsgs);
    msgCountRef.current += 1;

    if (runId && participantId) {
      logEvent({ run_id: runId, participant_id: participantId, event_type: "ai_chat_sent",
        event_data: { message_index: msgCountRef.current, char_count: userMessage.length, model_id: modelId } });
    }

    setLoading(true);
    try {
      const chatMessages = [
        { role: "system" as const, content: systemPrompt || "You are a helpful AI assistant." },
        ...(contextInfo ? [{ role: "system" as const, content: `Current context:\n${contextInfo}` }] : []),
        ...updatedMsgs.map(m => m.reasoning_details
          ? { role: m.role, content: m.content, reasoning_details: m.reasoning_details }
          : { role: m.role, content: m.content }),
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, messages: chatMessages, temperature: 0.7, max_tokens: 16384, enable_reasoning: false }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: "assistant", content: `[Error] ${data.error}` }]);
      } else {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: data.content,
          reasoning_details: data.reasoning_details ?? undefined,
        };
        setMessages(prev => [...prev, assistantMsg]);

        if (runId && participantId) {
          logEvent({ run_id: runId, participant_id: participantId, event_type: "ai_chat_received",
            event_data: {
              message_index: msgCountRef.current,
              char_count: data.content?.length ?? 0,
              model_id: modelId,
              has_reasoning: !!data.reasoning_details,
              tokens: data.usage?.total_tokens ?? null,
            },
          });
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "[Connection error] Please try again." }]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  }, [input, loading, messages, modelId, systemPrompt, contextInfo, runId, participantId]);

  return (
    <div className="chat-panel" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
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
            <p style={{ marginBottom: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>[Message]</p>
            <p style={{ fontSize: "0.85rem" }}>Ask the AI assistant for help</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isAssistant = msg.role === "assistant";
          if (isAssistant && !messageTimestamps.current.has(i)) {
            messageTimestamps.current.set(i, Date.now());
          }
          return (
            <div key={i} className={`chat-message ${msg.role}`}>
              <div style={{ wordBreak: "break-word" }}>
                {renderMessageContent(msg.content)}
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