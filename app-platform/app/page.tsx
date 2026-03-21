"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [participantId, setParticipantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleStartSession = async () => {
    if (!participantId.trim()) {
      setError("Please enter your participant ID");
      return;
    }

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

      // Store session info
      sessionStorage.setItem("session", JSON.stringify(data));
      sessionStorage.setItem("currentRun", "0");

      router.push("/experiment");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="fade-in" style={{ maxWidth: 560, width: "100%", padding: "0 24px" }}>
        {/* Logo / Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "var(--radius-lg)",
              background: "linear-gradient(135deg, var(--accent-teal), var(--accent-blue))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              fontSize: "2rem",
              boxShadow: "0 0 40px rgba(45, 212, 191, 0.25)",
            }}
          >
            ⚡
          </div>
          <h1 style={{ marginBottom: 8 }}>
            <span style={{
              background: "linear-gradient(135deg, var(--text-primary), var(--accent-teal))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              HTI-Lab
            </span>{" "}
            <span style={{ color: "var(--text-secondary)", fontWeight: 400 }}>AgenticAI</span>
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", lineHeight: 1.6 }}>
            Multi-Task, Multi-Model LLM Benchmark
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 8 }}>
            Coding · Logic Puzzles · Creative Writing
          </p>
        </div>

        {/* Onboarding Card */}
        <div
          className="glass-card"
          style={{ padding: 32 }}
        >
          <h3 style={{ marginBottom: 4, color: "var(--text-primary)" }}>Welcome, Participant</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 24 }}>
            Enter your assigned ID to begin the experiment session (~75–90 min)
          </p>

          <div style={{ marginBottom: 20 }}>
            <label className="label">Participant ID</label>
            <input
              id="participant-id-input"
              className="input"
              type="text"
              placeholder="e.g. P001"
              value={participantId}
              onChange={(e) => {
                setParticipantId(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
              autoFocus
            />
          </div>

          {error && (
            <p style={{
              color: "var(--accent-rose)",
              fontSize: "0.8rem",
              marginBottom: 12,
              padding: "8px 12px",
              background: "rgba(244, 63, 94, 0.08)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(244, 63, 94, 0.2)"
            }}>
              {error}
            </p>
          )}

          <button
            id="start-session-btn"
            className="btn btn-primary btn-lg w-full"
            onClick={handleStartSession}
            disabled={loading}
            style={{ width: "100%" }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                Creating Session...
              </>
            ) : (
              "Begin Experiment →"
            )}
          </button>

          <div
            style={{
              marginTop: 24,
              padding: "16px",
              background: "var(--bg-tertiary)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)"
            }}
          >
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--text-secondary)" }}>Session Format:</strong>{" "}
              You will complete 4 timed tasks across 2 categories, each assisted by a different AI agent.
              After each task, you'll fill out a short workload survey.
            </p>
          </div>
        </div>

        {/* Admin link intentionally removed from participant view */}
      </div>
    </main>
  );
}
