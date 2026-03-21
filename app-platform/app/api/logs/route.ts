import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb } from '@/lib/db';

// POST – Log an interaction event during a run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.run_id || !body.participant_id || !body.event_type) {
      return NextResponse.json(
        { error: 'run_id, participant_id, and event_type are required' },
        { status: 400 }
      );
    }

    const db = getSurveysDb();
    const stmt = db.prepare(`
      INSERT INTO interaction_logs (run_id, participant_id, event_type, event_data)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      body.run_id,
      body.participant_id,
      body.event_type,
      JSON.stringify(body.event_data || {})
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET – Retrieve logs for a run or participant
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('run_id');
    const participantId = searchParams.get('participant_id');

    const db = getSurveysDb();
    let query = 'SELECT * FROM interaction_logs WHERE 1=1';
    const params: string[] = [];

    if (runId) {
      query += ' AND run_id = ?';
      params.push(runId);
    }
    if (participantId) {
      query += ' AND participant_id = ?';
      params.push(participantId);
    }

    query += ' ORDER BY timestamp DESC LIMIT 500';

    const logs = db.prepare(query).all(...params);
    return NextResponse.json({ logs, count: logs.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
