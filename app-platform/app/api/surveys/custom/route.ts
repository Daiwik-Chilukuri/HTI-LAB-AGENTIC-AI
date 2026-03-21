import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb } from '@/lib/db';

// POST – Store a single custom TLX question response
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.run_id || !body.participant_id || !body.session_id || !body.question_id || body.answer === undefined) {
      return NextResponse.json(
        { error: 'run_id, participant_id, session_id, question_id, and answer are required' },
        { status: 400 }
      );
    }

    const db = getSurveysDb();
    const stmt = db.prepare(`
      INSERT INTO custom_tlx_responses (run_id, participant_id, session_id, question_id, answer)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      body.run_id,
      body.participant_id,
      body.session_id,
      body.question_id,
      body.answer,
    );

    return NextResponse.json({ id: result.lastInsertRowid, success: true }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET – Retrieve custom responses, optionally filtered
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('run_id');
    const participantId = searchParams.get('participant_id');

    const db = getSurveysDb();
    let query = `
      SELECT r.*, q.question_text, q.task_scope, q.scale_type
      FROM custom_tlx_responses r
      JOIN custom_tlx_questions q ON q.id = r.question_id
      WHERE 1=1
    `;
    const params: string[] = [];

    if (runId) { query += ' AND r.run_id = ?'; params.push(runId); }
    if (participantId) { query += ' AND r.participant_id = ?'; params.push(participantId); }

    query += ' ORDER BY r.submitted_at DESC';

    const responses = db.prepare(query).all(...params);
    return NextResponse.json({ responses, count: responses.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
