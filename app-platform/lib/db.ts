import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ─── Tasks Database ─────────────────────────────────────────────
let _tasksDb: Database.Database | null = null;

export function getTasksDb(): Database.Database {
  if (!_tasksDb) {
    _tasksDb = new Database(path.join(DB_DIR, 'tasks.db'));
    _tasksDb.pragma('journal_mode = WAL');
    _tasksDb.pragma('foreign_keys = ON');
    initTasksDb(_tasksDb);
  }
  return _tasksDb;
}

function initTasksDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coding_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      function_signature TEXT NOT NULL DEFAULT '',
      starter_code TEXT NOT NULL DEFAULT '',
      unit_tests TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
      tags TEXT NOT NULL DEFAULT '[]',
      time_limit_minutes INTEGER NOT NULL DEFAULT 15,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tangram_puzzles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      problem_index INTEGER NOT NULL,
      target_silhouette TEXT NOT NULL DEFAULT '[]',
      piece_count INTEGER NOT NULL DEFAULT 7,
      difficulty TEXT NOT NULL DEFAULT 'easy' CHECK(difficulty IN ('easy','medium','hard')),
      time_limit_minutes INTEGER NOT NULL DEFAULT 15,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS writing_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      genre TEXT NOT NULL DEFAULT 'general',
      word_count_target INTEGER NOT NULL DEFAULT 300,
      evaluation_criteria TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
      time_limit_minutes INTEGER NOT NULL DEFAULT 15,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ─── Surveys Database ────────────────────────────────────────────
let _surveysDb: Database.Database | null = null;

export function getSurveysDb(): Database.Database {
  if (!_surveysDb) {
    _surveysDb = new Database(path.join(DB_DIR, 'surveys.db'));
    _surveysDb.pragma('journal_mode = WAL');
    _surveysDb.pragma('foreign_keys = ON');
    initSurveysDb(_surveysDb);
    migrateSessionsSchema(_surveysDb);
    migrateScaleTypes(_surveysDb);
    migrateRunsFaulty(_surveysDb);
    seedBuiltInTlxQuestions(_surveysDb);
    seedDefaultDemographicQuestions(_surveysDb);
  }
  return _surveysDb;
}

function migrateSessionsSchema(db: Database.Database) {
  // Add task_type_c column if the sessions table exists but lacks this column
  // (old sessions created before this field was added)
  try {
    const colExists = db.prepare("PRAGMA table_info(sessions)").all()
      .some((c: Record<string, unknown>) => c.name === 'task_type_c');
    if (!colExists) {
      db.exec(`ALTER TABLE sessions ADD COLUMN task_type_c TEXT NOT NULL DEFAULT 'writing'`);
    }
  } catch { /* ignore */ }
  // Add use_test_model column if sessions table exists but lacks it
  try {
    const colExists = db.prepare("PRAGMA table_info(sessions)").all()
      .some((c: Record<string, unknown>) => c.name === 'use_test_model');
    if (!colExists) {
      db.exec(`ALTER TABLE sessions ADD COLUMN use_test_model INTEGER NOT NULL DEFAULT 0`);
    }
  } catch { /* ignore */ }
}

function migrateRunsFaulty(db: Database.Database) {
  // Add is_faulty column if the runs table exists but lacks this column
  try {
    const colExists = db.prepare("PRAGMA table_info(runs)").all()
      .some((c: Record<string, unknown>) => c.name === 'is_faulty');
    if (!colExists) {
      db.exec(`ALTER TABLE runs ADD COLUMN is_faulty INTEGER NOT NULL DEFAULT 0`);
    }
  } catch { /* ignore */ }

  // Migrate task_type CHECK constraint to include 'tangram'
  // SQLite doesn't support ALTER TABLE to change CHECK constraints,
  // so we rebuild the table if needed
  try {
    const cols = db.prepare("PRAGMA table_info(runs)").all() as { name: string; type: string; notnull: number; dflt_value: string; pk: number }[];
    const colDefs = cols.map((c) => {
      const nullable = c.notnull === 0 ? '' : 'NOT NULL';
      const defaultVal = c.dflt_value !== null ? `DEFAULT ${c.dflt_value}` : '';
      return `${c.name} ${c.type} ${nullable} ${defaultVal}`.trim();
    });
    db.exec(`
      CREATE TABLE runs_new (
        ${colDefs.join(', ')},
        CHECK(task_type IN ('coding','puzzle','writing','tangram'))
      );
      INSERT INTO runs_new SELECT * FROM runs;
      DROP TABLE runs;
      ALTER TABLE runs_new RENAME TO runs;
    `);
  } catch { /* ignore if already migrated or other error */ }
}

function migrateScaleTypes(db: Database.Database) {
  // One-time migration: reduce NASA-TLX from 21-point to 7-point scale
  // Only updates rows that still have the old 21-point value
  try {
    const changes = db.prepare("UPDATE tlx_questions SET scale_type = 'likert7' WHERE scale_type = 'likert21'").run();
    if (changes.changes > 0) {
      console.log(`[DB] Migrated ${changes.changes} NASA-TLX questions from 21-point to 7-point scale`);
    }
  } catch { /* ignore if column doesn't exist or other error */ }
}

function initSurveysDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      session_config TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','abandoned'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      task_type_a TEXT NOT NULL,
      task_type_b TEXT NOT NULL,
      task_type_c TEXT NOT NULL,
      agent_order TEXT NOT NULL DEFAULT '[]',
      counterbalance_key TEXT NOT NULL DEFAULT '',
      use_test_model INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      run_number INTEGER NOT NULL,
      task_type TEXT NOT NULL CHECK(task_type IN ('coding','puzzle','writing','tangram')),
      task_id INTEGER NOT NULL DEFAULT 0,
      model_id TEXT NOT NULL,
      is_faulty INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      result_data TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    );

    -- All survey question definitions (built-in + custom, per task scope)
    -- built_in = 1: seeded system question (cannot be deleted, only toggled)
    -- built_in = 0: researcher-created custom question
    -- scale_group: 'nasa_tlx' | 'ai_subjective' | 'custom'
    CREATE TABLE IF NOT EXISTS tlx_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_scope TEXT NOT NULL DEFAULT 'all' CHECK(task_scope IN ('coding','puzzle','writing','all')),
      question_text TEXT NOT NULL,
      sub_label TEXT NOT NULL DEFAULT '',
      low_label TEXT NOT NULL DEFAULT 'Low',
      high_label TEXT NOT NULL DEFAULT 'High',
      scale_type TEXT NOT NULL DEFAULT 'likert7' CHECK(scale_type IN ('likert5','likert7')),
      scale_group TEXT NOT NULL DEFAULT 'custom' CHECK(scale_group IN ('nasa_tlx','ai_subjective','custom')),
      display_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      built_in INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Unified survey response storage (all questions, all participants)
    CREATE TABLE IF NOT EXISTS survey_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      model_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      answer INTEGER NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES runs(id),
      FOREIGN KEY (question_id) REFERENCES tlx_questions(id)
    );

    -- Interaction event logging
    CREATE TABLE IF NOT EXISTS interaction_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES runs(id)
    );

    -- Debrief responses
    CREATE TABLE IF NOT EXISTS debrief_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      rankings TEXT NOT NULL DEFAULT '{}',
      open_comments TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    );

    -- Pre-study demographic questions
    CREATE TABLE IF NOT EXISTS demographic_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'text' CHECK(question_type IN ('text','select','number')),
      options TEXT NOT NULL DEFAULT '[]',
      display_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Pre-study demographic responses
    CREATE TABLE IF NOT EXISTS demographic_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      response_text TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (question_id) REFERENCES demographic_questions(id),
      FOREIGN KEY (participant_id) REFERENCES participants(id)
    );
  `);
}

// ─── Seed built-in NASA-TLX questions ───────────────────────────
// Only runs once; idempotent.
function seedBuiltInTlxQuestions(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) as c FROM tlx_questions WHERE built_in = 1').get() as { c: number }).c;
  if (count > 0) return; // already seeded

  const insert = db.prepare(`
    INSERT INTO tlx_questions (task_scope, question_text, sub_label, low_label, high_label, scale_type, scale_group, display_order, active, built_in)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
  `);

  const seed = db.transaction(() => {
    // ── Standard NASA-TLX (6 dimensions, 1-7 scale, all tasks) ──
    const nasaTlx = [
      [1, 'Mental Demand',   'How mentally demanding was the task?',                                   'Low',     'High'],
      [2, 'Physical Demand', 'How physically demanding was the task?',                                 'Low',     'High'],
      [3, 'Temporal Demand', 'How hurried or rushed was the pace of the task?',                       'Low',     'High'],
      [4, 'Performance',     'How successful were you in accomplishing what you were asked to do?',   'Perfect', 'Failure'],
      [5, 'Effort',          'How hard did you have to work to accomplish your level of performance?','Low',     'High'],
      [6, 'Frustration',     'How insecure, discouraged, irritated, stressed, or annoyed were you?', 'Low',     'High'],
    ];
    for (const [order, label, sub, low, high] of nasaTlx) {
      insert.run('all', label, sub, low, high, 'likert7', 'nasa_tlx', order);
    }

    // ── AI-Interaction subjective scales (5 dimensions, 1-7 scale, all tasks) ──
    const subjective = [
      [7,  'Perceived Helpfulness', 'How helpful was the AI assistant during this task?',            'Not at all',    'Extremely'],
      [8,  'Trust',                 "How much did you trust the AI's suggestions?",                   'Not at all',    'Completely'],
      [9,  'Perceived Control',     'To what extent did you feel in control of the task?',           'AI controlled', 'I controlled'],
      [10, 'Perceived Usefulness',  'How useful was the AI in improving your productivity?',          'Not useful',    'Very useful'],
      [11, 'Ownership',             'How much does the final output feel like YOUR work?',            "AI's work",     'My work'],
    ];
    for (const [order, label, sub, low, high] of subjective) {
      insert.run('all', label, sub, low, high, 'likert7', 'ai_subjective', order);
    }
  });

  seed();
}

// ─── Seed default demographic questions ───────────────────────
function seedDefaultDemographicQuestions(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) as c FROM demographic_questions').get() as { c: number }).c;
  if (count > 0) return;
  const insert = db.prepare(`
    INSERT INTO demographic_questions (question_text, question_type, options, display_order)
    VALUES (?, ?, ?, ?)
  `);
  insert.run("What is your age?", "number", "[]", 1);
  insert.run("What is your gender?", "select", '["Woman","Man","Non-binary","Prefer not to say","Other"]', 2);
}
