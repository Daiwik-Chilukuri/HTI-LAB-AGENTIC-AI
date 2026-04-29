"use client";

import { useEffect, useState } from "react";

interface ThemeToggleProps {
  storageKey?: string;
}

export function ThemeToggle({ storageKey = "theme" }: ThemeToggleProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey) as "light" | "dark" | null;
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    }
  }, [storageKey]);

  const applyTheme = (t: "light" | "dark") => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    sessionStorage.setItem(storageKey, t);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        padding: "4px",
        width: "fit-content",
        margin: "0 auto",
      }}
    >
      <button
        onClick={() => applyTheme("light")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 14px",
          borderRadius: "5px",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          fontSize: "0.8125rem",
          fontWeight: 600,
          transition: "all 0.2s ease",
          background: theme === "light" ? "var(--bg-card)" : "transparent",
          color: theme === "light" ? "var(--text-primary)" : "var(--text-muted)",
          boxShadow: theme === "light" ? "var(--shadow-sm)" : "none",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        Light
      </button>

      <button
        onClick={() => applyTheme("dark")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 14px",
          borderRadius: "5px",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          fontSize: "0.8125rem",
          fontWeight: 600,
          transition: "all 0.2s ease",
          background: theme === "dark" ? "var(--bg-card)" : "transparent",
          color: theme === "dark" ? "var(--text-primary)" : "var(--text-muted)",
          boxShadow: theme === "dark" ? "var(--shadow-sm)" : "none",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        Dark
      </button>
    </div>
  );
}
