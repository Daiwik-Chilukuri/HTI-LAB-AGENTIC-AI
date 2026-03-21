import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb, getTasksDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// ── Helpers ────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard';
type TaskType   = 'coding' | 'puzzle' | 'writing';

const TABLE: Record<TaskType, string> = {
  coding:  'coding_tasks',
  puzzle:  'puzzle_tasks',
  writing: 'writing_tasks',
};

/**
 * Pick 2 tasks of the SAME difficulty from a task type.
 * Returns [taskIdForRun1, taskIdForRun2] — always different IDs.
 * Falls back to any difficulty if the requested one has < 2 tasks.
 */
function pickTaskPair(
  tasksDb: ReturnType<typeof getTasksDb>,
  taskType: TaskType,
  difficulty: Difficulty
): [number, number] {
  const table = TABLE[taskType];

  // Try requested difficulty first
  let rows = tasksDb.prepare(
    `SELECT id FROM ${table} WHERE difficulty = ? ORDER BY RANDOM() LIMIT 2`
  ).all(difficulty) as { id: number }[];

  // Fallback: any difficulty
  if (rows.length < 2) {
    rows = tasksDb.prepare(
      `SELECT id FROM ${table} ORDER BY RANDOM() LIMIT 2`
    ).all() as { id: number }[];
  }

  if (rows.length < 2) throw new Error(`Not enough tasks in ${table} to counterbalance.`);
  return [rows[0].id, rows[1].id];
}

// POST – Create a new session with counterbalanced task assignment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const surveyDb = getSurveysDb();
    const tasksDb  = getTasksDb();

    const participantId = body.participant_id || uuidv4();
    const sessionId     = uuidv4();

    // Create participant if not exists
    surveyDb.prepare(`
      INSERT OR IGNORE INTO participants (id, session_config) VALUES (?, ?)
    `).run(participantId, JSON.stringify(body.config || {}));

    // ── Task type assignment ──────────────────────────────────────
    // Choose 2 of 3 task types (admin can override via body)
    const allTaskTypes: TaskType[] = ['coding', 'puzzle', 'writing'];
    const shuffledTypes = [...allTaskTypes].sort(() => Math.random() - 0.5);
    const taskTypeA = (body.task_type_a as TaskType) || shuffledTypes[0];
    const taskTypeB = (body.task_type_b as TaskType) || shuffledTypes[1];

    // ── Difficulty assignment ─────────────────────────────────────
    // Each task type gets ONE difficulty that applied to BOTH its runs.
    // This is the core counterbalancing guarantee.
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
    const diffA = (body.difficulty_a as Difficulty) || difficulties[Math.floor(Math.random() * 3)];
    const diffB = (body.difficulty_b as Difficulty) || difficulties[Math.floor(Math.random() * 3)];

    // ── Pick task pairs (different problems, same difficulty) ──────
    const [taskA1, taskA2] = pickTaskPair(tasksDb, taskTypeA, diffA);
    const [taskB1, taskB2] = pickTaskPair(tasksDb, taskTypeB, diffB);

    // ── Agent order (Latin-square) ────────────────────────────────
    const agents = ['agent_a', 'agent_b', 'agent_c', 'agent_d'];
    const shuffledAgents = (body.agent_order as string[]) ||
      [...agents].sort(() => Math.random() - 0.5);

    const counterbalanceKey = [
      taskTypeA, diffA,
      taskTypeB, diffB,
      shuffledAgents.join('-'),
    ].join('|');

    surveyDb.prepare(`
      INSERT INTO sessions (id, participant_id, task_type_a, task_type_b, agent_order, counterbalance_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, participantId, taskTypeA, taskTypeB, JSON.stringify(shuffledAgents), counterbalanceKey);

    // ── Create 4 runs with pre-assigned task IDs ──────────────────
    // Run 1 & 2 → task type A (different problems, same difficulty)
    // Run 3 & 4 → task type B (different problems, same difficulty)
    const runAssignments = [
      { taskType: taskTypeA, taskId: taskA1, agent: shuffledAgents[0] },
      { taskType: taskTypeA, taskId: taskA2, agent: shuffledAgents[1] },
      { taskType: taskTypeB, taskId: taskB1, agent: shuffledAgents[2] },
      { taskType: taskTypeB, taskId: taskB2, agent: shuffledAgents[3] },
    ];

    const runs = [];
    for (let i = 0; i < 4; i++) {
      const runId = uuidv4();
      const { taskType, taskId, agent } = runAssignments[i];
      surveyDb.prepare(`
        INSERT INTO runs (id, session_id, participant_id, run_number, task_type, task_id, model_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(runId, sessionId, participantId, i + 1, taskType, taskId, agent);
      runs.push({ id: runId, run_number: i + 1, task_type: taskType, task_id: taskId, model_id: agent });
    }

    return NextResponse.json({
      session_id:     sessionId,
      participant_id: participantId,
      task_type_a:    taskTypeA,
      task_type_b:    taskTypeB,
      difficulty_a:   diffA,
      difficulty_b:   diffB,
      agent_order:    shuffledAgents,
      runs,
    }, { status: 201 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



// GET – Get session details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const participantId = searchParams.get('participant_id');

    const db = getSurveysDb();

    if (sessionId) {
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      const runs = db.prepare('SELECT * FROM runs WHERE session_id = ? ORDER BY run_number').all(sessionId);
      return NextResponse.json({ session, runs });
    }

    if (participantId) {
      const sessions = db.prepare('SELECT * FROM sessions WHERE participant_id = ? ORDER BY started_at DESC').all(participantId);
      return NextResponse.json({ sessions });
    }

    return NextResponse.json({ error: 'session_id or participant_id required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
