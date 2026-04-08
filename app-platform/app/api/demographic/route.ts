import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb } from '@/lib/db';

// GET – Fetch demographic questions (?active=0 for admin, default active only)
export async function GET(request: NextRequest) {
  try {
    const db = getSurveysDb();
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get('active') === '0';
    const questions = showAll
      ? db.prepare('SELECT * FROM demographic_questions ORDER BY display_order ASC').all()
      : db.prepare('SELECT * FROM demographic_questions WHERE active = 1 ORDER BY display_order ASC').all();
    return NextResponse.json({ questions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST – Submit demographic responses  OR  Create a new question (?admin=true)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getSurveysDb();

    // Admin: create a new question
    if (body._admin) {
      const stmt = db.prepare(`
        INSERT INTO demographic_questions (question_text, question_type, options, display_order)
        VALUES (?, ?, ?, ?)
      `);
      const result = stmt.run(
        body.question_text,
        body.question_type || 'text',
        body.options || '[]',
        body.display_order || 99
      );
      return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
    }

    // Participant: submit responses
    const { participant_id, session_id, responses } = body;
    if (!participant_id || !session_id || !Array.isArray(responses)) {
      return NextResponse.json({ error: 'participant_id, session_id, and responses array required' }, { status: 400 });
    }

    const insert = db.prepare(`
      INSERT INTO demographic_responses (participant_id, session_id, question_id, response_text)
      VALUES (?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items: { question_id: number; response_text: string }[]) => {
      for (const item of items) {
        insert.run(participant_id, session_id, item.question_id, item.response_text);
      }
    });

    insertMany(responses);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH – Toggle question active state  OR  Update a question
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getSurveysDb();

    if (body.id) {
      // Toggle active
      if (typeof body.active === 'number') {
        db.prepare('UPDATE demographic_questions SET active = ? WHERE id = ?').run(body.active, body.id);
        return NextResponse.json({ success: true });
      }
      // Update question
      db.prepare(
        'UPDATE demographic_questions SET question_text = ?, question_type = ?, options = ?, display_order = ? WHERE id = ?'
      ).run(body.question_text, body.question_type, body.options || '[]', body.display_order || 99, body.id);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE – Remove a question
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const db = getSurveysDb();
    db.prepare('DELETE FROM demographic_questions WHERE id = ?').run(Number(id));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
