"use client";

interface TimerProps {
  timeLeft: number;
  totalTime: number;
}

export default function Timer({ timeLeft, totalTime }: TimerProps) {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const pct = (timeLeft / totalTime) * 100;

  const isWarning = timeLeft <= 180 && timeLeft > 60;
  const isDanger = timeLeft <= 60;

  return (
    <div className="flex items-center gap-3">
      {/* Progress ring */}
      <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx="18" cy="18" r="15"
          fill="none"
          stroke="var(--bg-tertiary)"
          strokeWidth="3"
        />
        <circle
          cx="18" cy="18" r="15"
          fill="none"
          stroke={isDanger ? "var(--accent-rose)" : isWarning ? "var(--accent-amber)" : "var(--accent-teal)"}
          strokeWidth="3"
          strokeDasharray={`${2 * Math.PI * 15}`}
          strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct / 100)}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
      </svg>

      <span className={`timer ${isDanger ? "danger" : isWarning ? "warning" : ""}`}>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}
