"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./components/ThemeToggle";

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

      sessionStorage.setItem("session", JSON.stringify(data));
      sessionStorage.setItem("currentRun", "0");

      router.push("/experiment/pre-survey");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              border: "1.5px solid var(--accent-amber)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--accent-amber)",
                letterSpacing: "-0.02em",
              }}
            >
              HL
            </span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            HTI-Lab
          </span>
        </div>

        <h1
          style={{
            fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            marginBottom: "12px",
          }}
        >
          Experimental Setup
        </h1>

        <p
          style={{
            fontSize: "0.9375rem",
            color: "var(--text-muted)",
            lineHeight: 1.6,
            maxWidth: "420px",
          }}
        >
          A controlled experiment on how different AI models influence human decision-making across coding, logic, and writing tasks.
        </p>
        <div style={{ marginTop: "16px" }}>
          <ThemeToggle />
        </div>
      </header>

      {/* Form Section */}
      <section style={{ width: "100%", maxWidth: "400px", animation: "fadeUp 0.5s ease-out 0.1s both" }}>
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-md)",
            padding: "32px",
          }}
        >
          <p
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "20px",
            }}
          >
            Participant Entry
          </p>

          <div style={{ marginBottom: "16px" }}>
            <label
              className="label"
              htmlFor="participant-id-input"
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "8px",
                display: "block",
              }}
            >
              Participant ID
            </label>
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
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.9375rem",
                padding: "12px 14px",
                letterSpacing: "0.02em",
              }}
            />
          </div>

          {error && (
            <p
              style={{
                color: "var(--accent-rose)",
                fontSize: "0.8rem",
                marginBottom: "12px",
                padding: "10px 12px",
                background: "rgba(225, 29, 72, 0.06)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(225, 29, 72, 0.15)",
              }}
            >
              {error}
            </p>
          )}

          <button
            id="start-session-btn"
            className="btn btn-primary btn-lg"
            onClick={handleStartSession}
            disabled={loading}
            style={{
              width: "100%",
              fontWeight: 600,
              letterSpacing: "0.01em",
              padding: "14px 24px",
              fontSize: "0.9375rem",
            }}
          >
            {loading ? (
              <>
                <span
                  className="spinner"
                  style={{ width: 16, height: 16, borderWidth: 2 }}
                />
                Creating Session...
              </>
            ) : (
              "Begin Experiment"
            )}
          </button>
        </div>

        {/* Session Info */}
        <div
          style={{
            marginTop: "16px",
            padding: "16px 20px",
          }}
        >
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              lineHeight: 1.65,
              textAlign: "center",
            }}
          >
            4 timed tasks across 2 categories, each with AI assistance. Workload surveys follow each task. Estimated duration: 75–90 minutes.
          </p>
        </div>

        {/* Task categories */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            marginTop: "20px",
            flexWrap: "wrap",
          }}
        >
          {["Coding", "Logic Puzzles", "Creative Writing"].map((task) => (
            <span
              key={task}
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                padding: "4px 10px",
                borderRadius: "4px",
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-secondary)",
              }}
            >
              {task}
            </span>
          ))}
        </div>
      </section>

      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          @keyframes fadeUp {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
    </main>
  );
}
