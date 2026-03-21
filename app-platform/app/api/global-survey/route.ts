import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb } from '@/lib/db';

// GET  – list all global survey questions (admin) or just active ones
// POST – submit a participant's global survey response
// PATCH – update a question (admin)
// DELETE – remove a question (admin)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== '0';
    const responses = searchParams.get('responses') === '1';
    const participantId = searchParams.get('participant_id');

    const db = getSurveysDb();

    if (responses) {
      // Fetch submitted responses with question text joined
      const where = participantId ? 'WHERE r.participant_id = ?' : '';
      const params = participantId ? [participantId] : [];
      const rows = db.prepare(`
        SELECT r.*, q.question_text, q.question_type
        FROM global_survey_responses r
        JOIN global_survey_questions q ON q.id = r.question_id
        ${where}
        ORDER BY r.submitted_at DESC
      `).all(...params);
      return NextResponse.json({ responses: rows });
    }

    const where = activeOnly ? 'WHERE active = 1' : '';
    const questions = db.prepare(
      `SELECT * FROM global_survey_questions ${where} ORDER BY display_order, id`
    ).all();
    return NextResponse.json({ questions });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'DB error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { participant_id, session_id, responses } = body;
    // responses: [{ question_id, response_text }]
    if (!participant_id || !session_id || !Array.isArray(responses)) {
      return NextResponse.json({ error: 'participant_id, session_id, responses[] required' }, { status: 400 });
    }

    const db = getSurveysDb();
    const stmt = db.prepare(`
      INSERT INTO global_survey_responses (participant_id, session_id, question_id, response_text)
      VALUES (?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const r of responses) {
        stmt.run(participant_id, session_id, r.question_id, r.response_text ?? '');
      }
    })();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'DB error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, _create, ...fields } = body;

    const db = getSurveysDb();

    // Create a new question (id === -1 and _create === true)
    if (_create) {
      db.prepare(`
        INSERT INTO global_survey_questions (question_text, question_type, display_order)
        VALUES (?, ?, ?)
      `).run(fields.question_text || '', fields.question_type || 'open_ended', Number(fields.display_order) || 99);
      return NextResponse.json({ success: true });
    }

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const allowed = ['question_text', 'question_type', 'display_order', 'active'];
    const updates = Object.entries(fields)
      .filter(([k]) => allowed.includes(k))
      .map(([k, v]) => ({ k, v }));

    if (updates.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

    const setClause = updates.map(u => `${u.k} = ?`).join(', ');
    const values = [...updates.map(u => u.v), id];
    db.prepare(`UPDATE global_survey_questions SET ${setClause} WHERE id = ?`).run(...values);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'DB error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const db = getSurveysDb();
    db.prepare('DELETE FROM global_survey_questions WHERE id = ?').run(Number(id));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'DB error' }, { status: 500 });
  }
}
