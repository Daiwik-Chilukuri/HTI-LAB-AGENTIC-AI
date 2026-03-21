// Lightweight client-side event logger
// Fires-and-forgets to /api/logs – never throws, never blocks the UI

export interface LogEvent {
  run_id: string;
  participant_id: string;
  event_type: string;
  event_data?: Record<string, unknown>;
}

export async function logEvent(event: LogEvent): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id:         event.run_id,
        participant_id: event.participant_id,
        event_type:     event.event_type,
        event_data:     event.event_data ?? {},
      }),
    });
  } catch {
    // Silently ignore – logging must never interrupt the experiment
  }
}
