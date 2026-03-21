// useTaskHeartbeat – fires a 30-second "alive ping" if the participant
// has recently interacted (mouse move, keypress, click) and the tab is focused.
//
// WHY: wall-clock time_to_complete can't distinguish active work from staring at the screen.
// Heartbeat count × 30s ≈ true engagement time per run, comparable across models.
//
// Usage: call once at the top of each task component:
//   useTaskHeartbeat({ runId, participantId });

"use client";

import { useEffect, useRef } from "react";
import { logEvent } from "@/lib/logger";

interface HeartbeatOptions {
  runId: string;
  participantId: string;
  intervalMs?: number; // default 30 000
  idleThresholdMs?: number; // how long without activity = "idle" (default 60 000)
}

export function useTaskHeartbeat({
  runId,
  participantId,
  intervalMs = 30_000,
  idleThresholdMs = 60_000,
}: HeartbeatOptions) {
  const lastActivityRef = useRef<number>(Date.now());
  const startTimeRef    = useRef<number>(Date.now());
  const pingCountRef    = useRef<number>(0);

  useEffect(() => {
    // Track any user activity
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("mousemove",  onActivity, { passive: true });
    window.addEventListener("keydown",    onActivity, { passive: true });
    window.addEventListener("click",      onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });

    // Fire every intervalMs
    const timer = setInterval(() => {
      const now       = Date.now();
      const tabActive = document.visibilityState === "visible";
      const recentActivity = (now - lastActivityRef.current) < idleThresholdMs;
      const elapsedSec = Math.round((now - startTimeRef.current) / 1000);

      pingCountRef.current += 1;

      logEvent({
        run_id:         runId,
        participant_id: participantId,
        event_type:     "alive_ping",
        event_data: {
          ping_n:          pingCountRef.current,
          elapsed_sec:     elapsedSec,
          tab_active:      tabActive,
          recently_active: recentActivity,
          // True active time approximation
          active_sec_est:  Math.round(pingCountRef.current * (intervalMs / 1000) * (recentActivity ? 1 : 0)),
        },
      });
    }, intervalMs);

    return () => {
      clearInterval(timer);
      window.removeEventListener("mousemove",  onActivity);
      window.removeEventListener("keydown",    onActivity);
      window.removeEventListener("click",      onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [runId, participantId, intervalMs, idleThresholdMs]);
}
