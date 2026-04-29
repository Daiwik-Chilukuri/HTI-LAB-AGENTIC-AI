/**
 * Lightweight markdown renderer — converts markdown strings to React JSX.
 * Handles: bold, italic, inline code, headers, bullet lists, numbered lists,
 * blockquotes, and paragraph breaks. Code blocks are handled separately.
 */

import React from "react";

type ContentSegment =
  | { type: "text"; text: string }
  | { type: "inline"; content: React.ReactNode }
  | { type: "paragraph"; items: React.ReactNode[] };

/** Parse inline markdown within a line: bold, italic, inline code */
function parseInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const m = match[0];
    if (m.startsWith("**") && m.endsWith("**")) {
      parts.push(<strong key={match.index} style={{ fontWeight: 700 }}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("*") && m.endsWith("*")) {
      parts.push(<em key={match.index} style={{ fontStyle: "italic" }}>{m.slice(1, -1)}</em>);
    } else if (m.startsWith("`") && m.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.85em",
            background: "rgba(255,255,255,0.08)",
            padding: "1px 5px",
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {m.slice(1, -1)}
        </code>
      );
    }
    last = match.index + m.length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/** Parse a single line for block-level patterns */
function parseLine(line: string): React.ReactNode {
  const trimmed = line.trim();

  // Header
  if (trimmed.startsWith("# ")) {
    const text = trimmed.slice(2);
    return (
      <div
        key={line}
        style={{
          fontSize: text.length > 40 ? "0.95rem" : "1.05rem",
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 4,
          marginTop: 8,
        }}
      >
        {parseInline(text)}
      </div>
    );
  }

  // Blockquote
  if (trimmed.startsWith("> ")) {
    const text = trimmed.slice(2);
    return (
      <div
        key={line}
        style={{
          borderLeft: "3px solid var(--accent-teal)",
          paddingLeft: 12,
          color: "var(--text-secondary)",
          fontStyle: "italic",
          marginBottom: 4,
        }}
      >
        {parseInline(text)}
      </div>
    );
  }

  // Bullet list item
  if (/^[-*]\s/.test(trimmed)) {
    const text = trimmed.slice(2);
    return (
      <div key={line} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
        <span style={{ color: "var(--accent-teal)", flexShrink: 0, marginTop: 2 }}>•</span>
        <span style={{ color: "var(--text-secondary)" }}>{parseInline(text)}</span>
      </div>
    );
  }

  // Numbered list item
  if (/^\d+\.\s/.test(trimmed)) {
    const match = trimmed.match(/^(\d+)\.\s(.*)$/);
    if (match) {
      return (
        <div key={line} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
          <span
            style={{
              color: "var(--accent-teal)",
              flexShrink: 0,
              minWidth: 20,
              fontWeight: 700,
              fontSize: "0.85rem",
            }}
          >
            {match[1]}.
          </span>
          <span style={{ color: "var(--text-secondary)" }}>{parseInline(match[2])}</span>
        </div>
      );
    }
  }

  // Horizontal rule (---)
  if (trimmed === "---" || trimmed === "***") {
    return (
      <div
        key={line}
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          margin: "8px 0",
        }}
      />
    );
  }

  // Plain line — inline formatting only
  if (trimmed !== "") {
    return (
      <span key={line} style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
        {parseInline(trimmed)}
      </span>
    );
  }

  return null;
}

/** Split content into block-level items, handling paragraph breaks */
function tokenize(content: string): string[][] {
  const blocks = content.split(/\n{2,}/);
  return blocks.map((block) => block.split(/\n/));
}

/**
 * Main render function — pass the raw AI message content.
 * Code blocks (```language ... ```) should be stripped and handled separately.
 *
 * usage: <div>{renderMarkdown(strippedContent)}</div>
 */
export function renderMarkdown(content: string): React.ReactNode[] {
  if (!content.trim()) return [];

  const blocks = content.split(/\n{2,}/);
  const elements: React.ReactNode[] = [];

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b].trim();
    if (!block) continue;

    const lines = block.split(/\n/);
    const isListBlock = lines.every(
      (l) =>
        /^[-*]\s/.test(l.trim()) ||
        /^\d+\.\s/.test(l.trim()) ||
        /^\s*$/.test(l.trim())
    );

    if (isListBlock && lines.some((l) => /^[-*]\s|^\d+\.\s/.test(l.trim()))) {
      // Render as list
      const listItems = lines
        .filter((l) => l.trim())
        .map((l) => parseLine(l));
      elements.push(
        <div key={`block-${b}`} style={{ marginBottom: 6 }}>
          {listItems}
        </div>
      );
    } else {
      // Render each line, skipping blank lines
      const lineElements = lines
        .filter((l) => !/^\s*$/.test(l))
        .map((l, i) => (
          <div key={`line-${b}-${i}`} style={{ marginBottom: 2 }}>
            {parseLine(l)}
          </div>
        ));
      if (lineElements.length > 0) {
        elements.push(<div key={`block-${b}`}>{lineElements}</div>);
      }
    }
  }

  return elements;
}