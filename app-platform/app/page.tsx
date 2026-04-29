"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./components/ThemeToggle";

export default function Home() {
  const router = useRouter();
  const [participantId, setParticipantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [error, setError] = useState("");

  const handleBegin = () => {
    if (!participantId.trim()) {
      setError("Please enter your participant ID");
      return;
    }
    setShowConsent(true);
  };

  const handleConsentStart = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participantId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create session");
        return;
      }
      sessionStorage.setItem("session", JSON.stringify(data));
      sessionStorage.setItem("currentRun", "0");
      router.push("/experiment/pre-survey");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Consent / Debrief Screen ─────────────────────────────────────
  if (showConsent) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(32px, 6vw, 80px) clamp(20px, 8vw, 120px)",
          background: "var(--bg-primary)",
        }}
      >
        <div style={{ maxWidth: 600, width: "100%", animation: "fadeUp 0.5s ease-out" }}>
          {/* Logotype */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              border: "1.5px solid var(--accent-amber)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--accent-amber)" }}>HL</span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>HTI-Lab</span>
          </div>

          <div className="glass-card" style={{ padding: "32px 36px" }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 24, letterSpacing: "-0.02em" }}>
              Welcome to the HTI-Lab Human-AI Interaction Study
            </h1>

            <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", lineHeight: 1.75, marginBottom: 28 }}>
              <p style={{ marginBottom: 16 }}>
                Thank you for participating in this research. The goal of this study is to gather data and human insights on how people collaborate with modern AI systems to solve complex problems.
              </p>

              <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>The Experiment Format</h2>
              <ul style={{ paddingLeft: 20, marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                <li><strong>Structure:</strong> You will complete 3 distinct task blocks</li>
                <li><strong>Time Limit:</strong> Each block is strictly timed at 15 minutes</li>
                <li><strong>Task Categories:</strong> The challenges will cover Coding, Logic Puzzle, and Content Creation</li>
                <li><strong>Your Toolkit:</strong> You are fully allowed and encouraged to chat with the built-in AI assistant to get help, generate ideas, or verify your work</li>
              </ul>

              <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Support and Technical Difficulties</h2>
              <p style={{ marginBottom: 16 }}>
                If you experience any platform glitches, screen freezing, or internet drops, do not try to fix it yourself. Please immediately notify the team in charge so we can pause your timer and assist you.
              </p>

              <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Confidentiality Agreement</h2>
              <p style={{ marginBottom: 16 }}>
                To ensure the integrity of our data for future participants, we strictly require that you do not reveal, discuss, or share the details of these tasks, the AI's behavior, or the experiment format with anyone outside of this room. All discussions regarding the study must be kept exclusively with the organizing team.
              </p>

              <h2 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Participant Rights and Consent</h2>
              <p style={{ marginBottom: 0 }}>
                Your participation is entirely voluntary. If you feel stressed, overwhelmed, or uncomfortable at any point during the 15-minute task blocks, you are completely free to stop working and leave the experiment without any penalty.
              </p>
            </div>

            {error && (
              <p style={{
                color: "var(--accent-rose)", fontSize: "0.8rem", marginBottom: 12,
                padding: "10px 12px", background: "rgba(225,29,72,0.06)",
                borderRadius: "var(--radius-sm)", border: "1px solid rgba(225,29,72,0.15)",
              }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setShowConsent(false)}
              >
                Back
              </button>
              <button
                id="begin-experiment-btn"
                className="btn btn-primary btn-lg"
                style={{ flex: 2, fontWeight: 600 }}
                onClick={handleConsentStart}
                disabled={loading}
              >
                {loading ? (
                  <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Creating Session...</>
                ) : (
                  "Begin Experiment --"
                )}
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </main>
    );
  }

  // ── Default: Participant ID Entry ─────────────────────────────────
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(32px, 6vw, 80px) clamp(20px, 8vw, 120px)",
        background: "var(--bg-primary)",
      }}
    >
      {/* Header */}
      <header style={{ textAlign: "center", marginBottom: "clamp(32px, 6vw, 56px)", animation: "fadeUp 0.5s ease-out" }}>
        {/* Logotype mark */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "28px" }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, border: "1.5px solid var(--accent-amber)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--accent-amber)", letterSpacing: "-0.02em" }}>HL</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>HTI-Lab</span>
        </div>

        <h1 style={{ fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: "12px" }}>
          Experimental Setup
        </h1>

        <p style={{ fontSize: "0.9375rem", color: "var(--text-muted)", lineHeight: 1.6, maxWidth: "420px" }}>
          A controlled experiment on how different AI models influence human decision-making across coding, logic, and writing tasks.
        </p>
        <div style={{ marginTop: "16px" }}>
          <ThemeToggle />
        </div>
      </header>

      {/* Form Section */}
      <section style={{ width: "100%", maxWidth: "400px", animation: "fadeUp 0.5s ease-out 0.1s both" }}>
        <div className="glass-card" style={{ padding: "32px" }}>
          <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "20px" }}>
            Participant Entry
          </p>

          <div style={{ marginBottom: "16px" }}>
            <label className="label" htmlFor="participant-id-input" style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px", display: "block" }}>
              Participant ID
            </label>
            <input
              id="participant-id-input"
              className="input"
              type="text"
              placeholder="e.g. P001"
              value={participantId}
              onChange={(e) => { setParticipantId(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleBegin()}
              autoFocus
              style={{ fontFamily: "var(--font-mono)", fontSize: "0.9375rem", padding: "12px 14px", letterSpacing: "0.02em" }}
            />
          </div>

          {error && (
            <p style={{ color: "var(--accent-rose)", fontSize: "0.8rem", marginBottom: "12px", padding: "10px 12px", background: "rgba(225,29,72,0.06)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(225,29,72,0.15)" }}>
              {error}
            </p>
          )}

          <button
            id="start-session-btn"
            className="btn btn-primary btn-lg"
            onClick={handleBegin}
            style={{ width: "100%", fontWeight: 600, letterSpacing: "0.01em", padding: "14px 24px", fontSize: "0.9375rem" }}
          >
            Begin Experiment
          </button>
        </div>

        {/* Session Info */}
        <div style={{ marginTop: "16px", padding: "16px 20px" }}>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.65, textAlign: "center" }}>
            3 timed tasks across 3 categories, each with AI assistance. Workload surveys follow each task. Estimated duration: 60-75 minutes.
          </p>
        </div>

        {/* Task categories */}
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "20px", flexWrap: "wrap" }}>
          {["Coding", "Logic Puzzles", "Creative Writing"].map((task) => (
            <span key={task} style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--border-subtle)", background: "var(--bg-secondary)" }}>
              {task}
            </span>
          ))}
        </div>
      </section>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes fadeUp { from { opacity: 0; } to { opacity: 1; } }
        }
      `}</style>
    </main>
  );
}