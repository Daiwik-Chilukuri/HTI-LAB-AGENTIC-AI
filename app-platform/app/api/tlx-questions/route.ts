import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb } from '@/lib/db';

// GET – Fetch questions (optionally filtered by scope; active=0 returns all)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');      // 'coding' | 'puzzle' | 'writing' | null
    const activeOnly = searchParams.get('active') !== '0';

    const db = getSurveysDb();
    let query = 'SELECT * FROM tlx_questions WHERE 1=1';
    const params: (string | number)[] = [];

    if (scope && scope !== 'all') {
      query += ' AND (task_scope = ? OR task_scope = \'all\')';
      params.push(scope);
    }
    if (activeOnly) {
      query += ' AND active = 1';
    }

    query += ' ORDER BY display_order ASC, id ASC';

    const questions = db.prepare(query).all(...params);
    return NextResponse.json({ questions, count: questions.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST – Create a new custom question (built_in is always 0 here)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.question_text?.trim()) {
      return NextResponse.json({ error: 'question_text is required' }, { status: 400 });
    }

    const db = getSurveysDb();
    const result = db.prepare(`
      INSERT INTO tlx_questions (task_scope, question_text, sub_label, low_label, high_label, scale_type, scale_group, display_order, built_in)
      VALUES (?, ?, ?, ?, ?, ?, 'custom', ?, 0)
    `).run(
      body.task_scope || 'all',
      body.question_text.trim(),
      body.sub_label || '',
      body.low_label || 'Low',
      body.high_label || 'High',
      body.scale_type || 'likert7',
      body.display_order ?? 99,
    );

    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH – Update a question (built-in questions: only active toggle allowed)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const db = getSurveysDb();
    const q = db.prepare('SELECT built_in FROM tlx_questions WHERE id = ?').get(Number(body.id)) as { built_in: number } | undefined;
    if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

    const fields: string[] = [];
    const params: (string | number)[] = [];

    // Always allowed
    if (body.active !== undefined) { fields.push('active = ?'); params.push(body.active ? 1 : 0); }

    // Only custom questions can have their text/labels updated
    if (!q.built_in) {
      if (body.question_text !== undefined) { fields.push('question_text = ?'); params.push(body.question_text); }
      if (body.sub_label !== undefined)     { fields.push('sub_label = ?');     params.push(body.sub_label); }
      if (body.low_label !== undefined)     { fields.push('low_label = ?');     params.push(body.low_label); }
      if (body.high_label !== undefined)    { fields.push('high_label = ?');    params.push(body.high_label); }
      if (body.scale_type !== undefined)    { fields.push('scale_type = ?');    params.push(body.scale_type); }
      if (body.task_scope !== undefined)    { fields.push('task_scope = ?');    params.push(body.task_scope); }
      if (body.display_order !== undefined) { fields.push('display_order = ?'); params.push(body.display_order); }
    }

    if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

    params.push(body.id);
    db.prepare(`UPDATE tlx_questions SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE – Only custom (non-built-in) questions can be deleted
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const db = getSurveysDb();
    const q = db.prepare('SELECT built_in FROM tlx_questions WHERE id = ?').get(Number(id)) as { built_in: number } | undefined;
    if (!q) return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    if (q.built_in) return NextResponse.json({ error: 'Built-in questions cannot be deleted' }, { status: 403 });

    db.prepare('DELETE FROM tlx_questions WHERE id = ?').run(Number(id));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
