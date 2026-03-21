import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// POST – Submit NASA-TLX survey after a run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const db = getSurveysDb();
    const stmt = db.prepare(`
      INSERT INTO nasa_tlx_responses 
      (run_id, participant_id, session_id, task_type, model_id,
       mental_demand, physical_demand, temporal_demand, performance, effort, frustration,
       perceived_helpfulness, trust, perceived_control, perceived_usefulness, ownership)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      body.run_id,
      body.participant_id,
      body.session_id,
      body.task_type,
      body.model_id,
      body.mental_demand,
      body.physical_demand,
      body.temporal_demand,
      body.performance,
      body.effort,
      body.frustration,
      body.perceived_helpfulness || null,
      body.trust || null,
      body.perceived_control || null,
      body.perceived_usefulness || null,
      body.ownership || null,
    );

    return NextResponse.json({ id: result.lastInsertRowid, success: true }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET – List survey responses (optional filters)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const participantId = searchParams.get('participant_id');
    const sessionId = searchParams.get('session_id');

    const db = getSurveysDb();
    let query = 'SELECT * FROM nasa_tlx_responses WHERE 1=1';
    const params: string[] = [];

    if (participantId) {
      query += ' AND participant_id = ?';
      params.push(participantId);
    }
    if (sessionId) {
      query += ' AND session_id = ?';
      params.push(sessionId);
    }

    query += ' ORDER BY submitted_at DESC';

    const responses = db.prepare(query).all(...params);
    return NextResponse.json({ responses, count: responses.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
