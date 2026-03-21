import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb } from '@/lib/db';

// POST – Bulk submit all survey answers for a run
// Body: { run_id, participant_id, session_id, task_type, model_id, answers: [{question_id, answer}] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { run_id, participant_id, session_id, task_type, model_id, answers } = body;

    if (!run_id || !participant_id || !session_id || !Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json(
        { error: 'run_id, participant_id, session_id, and answers[] are required' },
        { status: 400 }
      );
    }

    const db = getSurveysDb();
    const insert = db.prepare(`
      INSERT INTO survey_responses (run_id, participant_id, session_id, task_type, model_id, question_id, answer)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const bulkInsert = db.transaction(() => {
      for (const { question_id, answer } of answers) {
        insert.run(run_id, participant_id, session_id, task_type, model_id, question_id, answer);
      }
    });

    bulkInsert();
    return NextResponse.json({ success: true, count: answers.length }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
