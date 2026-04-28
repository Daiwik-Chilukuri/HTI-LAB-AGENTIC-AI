import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb, getTasksDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// ── Helpers ────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard';
type TaskType   = 'coding' | 'puzzle' | 'writing' | 'tangram' | 'kenken';

const TABLE: Record<TaskType, string> = {
  coding:  'coding_tasks',
  puzzle:  'puzzle_tasks',
  writing: 'writing_tasks',
  tangram: 'tangram_puzzles',
  kenken:  'kenken_puzzles',
};

/**
 * Pick 1 task of the given difficulty from a task type.
 * Falls back to any difficulty if the requested one has no tasks.
 * For tangram tasks, returns the problem_index (not the row id).
 */
function pickSingleTask(
  tasksDb: ReturnType<typeof getTasksDb>,
  taskType: TaskType,
  difficulty: Difficulty
): number {
  const table = TABLE[taskType];

  let rows = tasksDb.prepare(
    `SELECT id FROM ${table} WHERE difficulty = ? ORDER BY RANDOM() LIMIT 1`
  ).all(difficulty) as { id: number }[];

  if (rows.length < 1) {
    rows = tasksDb.prepare(
      `SELECT id FROM ${table} ORDER BY RANDOM() LIMIT 1`
    ).all() as { id: number }[];
  }

  if (rows.length < 1) throw new Error(`No tasks found in ${table}.`);
  return rows[0].id;
}

/**
 * For tangram tasks, the task_id stored on the run record should be
 * the problem_index (used to index into problemsData.js), not the row id.
 */
function getTangramTaskId(tasksDb: ReturnType<typeof getTasksDb>, rowId: number): number {
  const row = tasksDb.prepare('SELECT problem_index FROM tangram_puzzles WHERE id = ?').get(rowId) as { problem_index: number } | undefined;
  return row?.problem_index ?? rowId;
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

    // ── All 3 task types are used in every session ──────────────────
    // Admin can override via body; otherwise all three are used in fixed order
    const allTaskTypes: TaskType[] = ['kenken', 'tangram', 'writing'];
    const taskTypeA = (body.task_type_a as TaskType) || allTaskTypes[0];
    const taskTypeB = (body.task_type_b as TaskType) || allTaskTypes[1];
    const taskTypeC = (body.task_type_c as TaskType) || allTaskTypes[2];

    // ── Difficulty assignment (one per task type) ──────────────────
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
    const diffA = (body.difficulty_a as Difficulty) || difficulties[Math.floor(Math.random() * 3)];
    const diffB = (body.difficulty_b as Difficulty) || difficulties[Math.floor(Math.random() * 3)];
    const diffC = (body.difficulty_c as Difficulty) || difficulties[Math.floor(Math.random() * 3)];

    // ── Pick 1 task per task type ───────────────────────────────────
    const taskA = pickSingleTask(tasksDb, taskTypeA, diffA);
    const taskB = pickSingleTask(tasksDb, taskTypeB, diffB);
    const taskC = pickSingleTask(tasksDb, taskTypeC, diffC);

    // ── Agent order (Latin square for 3 agents × 3 tasks) ───────────
    // Each participant sees each of the 3 agents exactly once, in a
    // counterbalanced order across the 3 task types.
    // Latin square for 3 rows (task types):
    //   Row 0: [agent_a, agent_b, agent_c]
    //   Row 1: [agent_b, agent_c, agent_a]
    //   Row 2: [agent_c, agent_a, agent_b]
    // We randomize which row (run order) to use.
    const agents = ['agent_a', 'agent_b', 'agent_c'];
    const latinSquare = [
      [0, 1, 2], // task A→agent_a, task B→agent_b, task C→agent_c
      [1, 2, 0], // task A→agent_b, task B→agent_c, task C→agent_a
      [2, 0, 1], // task A→agent_c, task B→agent_a, task C→agent_b
    ];
    const rowIndex = Math.floor(Math.random() * 3);
    const agentOrder = latinSquare[rowIndex].map(i => agents[i]);

    const counterbalanceKey = [
      taskTypeA, diffA, taskTypeB, diffB, taskTypeC, diffC,
      rowIndex,
    ].join('|');

    surveyDb.prepare(`
      INSERT INTO sessions (id, participant_id, task_type_a, task_type_b, task_type_c, agent_order, counterbalance_key)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, participantId, taskTypeA, taskTypeB, taskTypeC, JSON.stringify(agentOrder), counterbalanceKey);

    // ── Create 3 runs (one per task type, one per agent) ────────────
    // For tangram runs, store problem_index as task_id (not the row id)
    const runAssignments = [
      { taskType: taskTypeA, taskId: taskTypeA === 'tangram' ? getTangramTaskId(tasksDb, taskA) : taskA, agent: agentOrder[0] },
      { taskType: taskTypeB, taskId: taskTypeB === 'tangram' ? getTangramTaskId(tasksDb, taskB) : taskB, agent: agentOrder[1] },
      { taskType: taskTypeC, taskId: taskTypeC === 'tangram' ? getTangramTaskId(tasksDb, taskC) : taskC, agent: agentOrder[2] },
    ];

    // ── Pick 1 of 3 runs to be the faulty AI probe ───────────────────
    const faultyRunIndex = Math.floor(Math.random() * 3);

    const runs = [];
    for (let i = 0; i < 3; i++) {
      const runId = uuidv4();
      const { taskType, taskId, agent } = runAssignments[i];
      const isFaulty = i === faultyRunIndex ? 1 : 0;
      surveyDb.prepare(`
        INSERT INTO runs (id, session_id, participant_id, run_number, task_type, task_id, model_id, is_faulty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(runId, sessionId, participantId, i + 1, taskType, taskId, agent, isFaulty);
      runs.push({ id: runId, run_number: i + 1, task_type: taskType, task_id: taskId, model_id: agent, is_faulty: isFaulty });
    }

    return NextResponse.json({
      session_id:     sessionId,
      participant_id: participantId,
      task_type_a:    taskTypeA,
      task_type_b:    taskTypeB,
      task_type_c:    taskTypeC,
      difficulty_a:   diffA,
      difficulty_b:   diffB,
      difficulty_c:   diffC,
      agent_order:    agentOrder,
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
