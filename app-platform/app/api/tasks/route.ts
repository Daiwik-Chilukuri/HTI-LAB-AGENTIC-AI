import { NextRequest, NextResponse } from 'next/server';
import { getTasksDb } from '@/lib/db';

// GET – List tasks by type, or fetch one by id / random
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'coding';
    const difficulty = searchParams.get('difficulty');
    const random = searchParams.get('random') === '1';
    const id = searchParams.get('id');

    const db = getTasksDb();
    const tableName = type === 'coding' ? 'coding_tasks'
      : type === 'puzzle' ? 'puzzle_tasks'
      : type === 'writing' ? 'writing_tasks'
      : null;

    if (!tableName) {
      return NextResponse.json({ error: 'Invalid task type' }, { status: 400 });
    }

    // Single task by ID
    if (id) {
      const task = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(Number(id));
      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      return NextResponse.json({ task });
    }

    // Random single task
    if (random) {
      const whereClause = difficulty ? 'WHERE difficulty = ?' : '';
      const params = difficulty ? [difficulty] : [];
      const task = db.prepare(`SELECT * FROM ${tableName} ${whereClause} ORDER BY RANDOM() LIMIT 1`).get(...params);
      if (!task) return NextResponse.json({ task: null, empty: true });
      return NextResponse.json({ task });
    }

    // Full list
    let query = `SELECT * FROM ${tableName}`;
    const params: string[] = [];
    if (difficulty) { query += ' WHERE difficulty = ?'; params.push(difficulty); }
    query += ' ORDER BY created_at DESC';

    const tasks = db.prepare(query).all(...params);
    return NextResponse.json({ tasks, count: tasks.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST – Create a new task
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, ...taskData } = body;

    const db = getTasksDb();

    if (type === 'coding') {
      const stmt = db.prepare(`
        INSERT INTO coding_tasks (title, description, function_signature, starter_code, unit_tests, difficulty, tags, time_limit_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        taskData.title || 'Untitled',
        taskData.description || '',
        taskData.function_signature || '',
        taskData.starter_code || '',
        JSON.stringify(taskData.unit_tests || []),
        taskData.difficulty || 'medium',
        JSON.stringify(taskData.tags || []),
        taskData.time_limit_minutes || 15
      );
      return NextResponse.json({ id: result.lastInsertRowid, type: 'coding' }, { status: 201 });
    }

    if (type === 'puzzle') {
      const stmt = db.prepare(`
        INSERT INTO puzzle_tasks (title, prompt, elements, correct_solution, explanation, hints, ai_solution_correct, ai_reasoning_correct, ai_solution_faulty, ai_reasoning_faulty, hints_faulty, awareness_questions, difficulty, time_limit_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        taskData.title || 'Untitled',
        taskData.prompt || '',
        JSON.stringify(taskData.elements || []),
        taskData.correct_solution || '',
        taskData.explanation || '',
        JSON.stringify(taskData.hints || []),
        taskData.ai_solution_correct || '',
        taskData.ai_reasoning_correct || '',
        taskData.ai_solution_faulty || '',
        taskData.ai_reasoning_faulty || '',
        JSON.stringify(taskData.hints_faulty || []),
        JSON.stringify(taskData.awareness_questions || []),
        taskData.difficulty || 'medium',
        taskData.time_limit_minutes || 15
      );
      return NextResponse.json({ id: result.lastInsertRowid, type: 'puzzle' }, { status: 201 });
    }

    if (type === 'writing') {
      const stmt = db.prepare(`
        INSERT INTO writing_tasks (title, prompt, genre, word_count_target, evaluation_criteria, difficulty, time_limit_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        taskData.title || 'Untitled',
        taskData.prompt || '',
        taskData.genre || 'general',
        taskData.word_count_target || 300,
        JSON.stringify(taskData.evaluation_criteria || []),
        taskData.difficulty || 'medium',
        taskData.time_limit_minutes || 15
      );
      return NextResponse.json({ id: result.lastInsertRowid, type: 'writing' }, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid task type' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE – Remove a task
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) {
      return NextResponse.json({ error: 'type and id required' }, { status: 400 });
    }

    const tableName = type === 'coding' ? 'coding_tasks'
      : type === 'puzzle' ? 'puzzle_tasks'
      : type === 'writing' ? 'writing_tasks'
      : null;

    if (!tableName) {
      return NextResponse.json({ error: 'Invalid task type' }, { status: 400 });
    }

    const db = getTasksDb();
    db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(Number(id));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
