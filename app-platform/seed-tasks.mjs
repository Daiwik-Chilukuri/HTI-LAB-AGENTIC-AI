// Seed test tasks and global survey questions
// Run: node seed-tasks.mjs

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_DB  = join(__dirname, 'data', 'tasks.db');
const SURVEY_DB = join(__dirname, 'data', 'surveys.db');

// ── Tasks ─────────────────────────────────────────────────────────
const tdb = new Database(TASKS_DB);

// 2 Coding tasks
tdb.prepare(`INSERT OR IGNORE INTO coding_tasks
  (title, description, function_signature, starter_code, unit_tests, difficulty, tags, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?,?)`).run(
  'Sum of Evens',
  'Write a function that takes a list of integers and returns the sum of all even numbers.',
  'def sum_evens(nums: list[int]) -> int:',
  'def sum_evens(nums: list[int]) -> int:\n    pass\n',
  JSON.stringify(['assert sum_evens([1,2,3,4]) == 6', 'assert sum_evens([]) == 0', 'assert sum_evens([1,3,5]) == 0']),
  'easy', JSON.stringify(['list', 'iteration']), 15
);
tdb.prepare(`INSERT OR IGNORE INTO coding_tasks
  (title, description, function_signature, starter_code, unit_tests, difficulty, tags, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?,?)`).run(
  'Count Palindromes',
  'Given a list of strings, return the count of strings that are palindromes (read the same forwards and backwards). Ignore case.',
  'def count_palindromes(words: list[str]) -> int:',
  'def count_palindromes(words: list[str]) -> int:\n    pass\n',
  JSON.stringify(['assert count_palindromes(["racecar","hello","level"]) == 2', 'assert count_palindromes(["Madam"]) == 1', 'assert count_palindromes([]) == 0']),
  'medium', JSON.stringify(['string', 'palindrome']), 15
);

// 2 Puzzle tasks
tdb.prepare(`INSERT OR IGNORE INTO puzzle_tasks
  (title, prompt, elements, correct_solution, explanation, hints, ai_solution_correct, ai_reasoning_correct, ai_solution_faulty, ai_reasoning_faulty, difficulty, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  'Office Seating Puzzle',
  'Four colleagues — Aman, Bhavya, Chitra, and Dev — sit in a row of four seats numbered 1 to 4 from left to right.\n\n• Aman does not sit next to Bhavya.\n• Chitra sits to the left of Dev.\n• Dev is not in seat 4.\n• Bhavya is in an odd-numbered seat.\n\nWhat is the correct seating arrangement (seat 1 → seat 4)?',
  JSON.stringify(['Aman', 'Bhavya', 'Chitra', 'Dev']),
  'Bhavya, Aman, Chitra, Dev',
  'Bhavya must be in seat 1 or 3 (odd). Dev cannot be in seat 4, and Chitra must be left of Dev. Testing Bhavya=1: Chitra=3, Dev=4 violates Dev≠4. Try Bhavya=3: Chitra=1, Dev=2, Aman=4 → Aman not next to Bhavya (4 vs 3) is adjacent → fails. Try Bhavya=1: Chitra=2, Dev=3, Aman=4 → Aman not next to Bhavya (4 vs 1) ✓ → Answer: Bhavya(1), Chitra(2), Dev(3), Aman(4). Simplify: B-C-D-A.',
  JSON.stringify(['Bhavya must sit in an odd-numbered seat (1 or 3).', 'Chitra must sit immediately left of Dev, so they are consecutive.', 'Dev cannot be in the last seat, so Chitra-Dev can only be in positions 1-2 or 2-3.']),
  'Bhavya, Chitra, Dev, Aman',
  'By the constraint that Bhavya is in an odd seat and Chitra is left of Dev with Dev not in seat 4, the only valid arrangement is Bhavya(1), Chitra(2), Dev(3), Aman(4).',
  'Aman, Bhavya, Chitra, Dev',
  'Placing them in alphabetical order satisfies most constraints but violates Bhavya being in an odd seat.',
  'medium', 15
);
tdb.prepare(`INSERT OR IGNORE INTO puzzle_tasks
  (title, prompt, elements, correct_solution, explanation, hints, ai_solution_correct, ai_reasoning_correct, ai_solution_faulty, ai_reasoning_faulty, difficulty, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  'Project Deadline Order',
  'Five projects — Alpha, Beta, Gamma, Delta, Epsilon — must be submitted in sequence.\n\n• Beta is submitted before Delta.\n• Gamma is submitted immediately after Alpha.\n• Epsilon is the last project.\n• Delta is not submitted immediately after Beta.\n\nArrange all five projects in their correct submission order.',
  JSON.stringify(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']),
  'Alpha, Gamma, Beta, Delta, Epsilon',
  'Alpha-Gamma must be consecutive (Gamma immediately after Alpha). Epsilon is last. Beta before Delta but not immediately. Placing Alpha=1, Gamma=2, Beta=3, Delta=4, Epsilon=5 satisfies all constraints.',
  JSON.stringify(['Epsilon must be in position 5.', 'Alpha and Gamma must occupy consecutive positions with Gamma directly after Alpha.', 'Beta and Delta must have at least one project between them.']),
  'Alpha, Gamma, Beta, Delta, Epsilon',
  'Alpha-Gamma pair first, then Beta, then Delta (with a gap), then Epsilon last.',
  'Beta, Alpha, Gamma, Delta, Epsilon',
  'This puts Beta first but violates the Gamma-immediately-after-Alpha constraint relative to Beta.',
  'medium', 15
);

// 2 Content-creation (writing) tasks
tdb.prepare(`INSERT OR IGNORE INTO writing_tasks
  (title, prompt, genre, word_count_target, evaluation_criteria, difficulty, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?)`).run(
  'AI in Healthcare Blog Post',
  'Write a short, engaging blog-style introduction explaining how AI assistants are beginning to help medical professionals diagnose rare diseases. Your audience is technically curious general readers, not specialists. Make it vivid and include one concrete example.',
  'blog',
  200,
  JSON.stringify(['clarity', 'engagement', 'factual accuracy', 'concrete example included']),
  'medium', 15
);
tdb.prepare(`INSERT OR IGNORE INTO writing_tasks
  (title, prompt, genre, word_count_target, evaluation_criteria, difficulty, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?)`).run(
  'Feature Announcement Email',
  'You are a product manager at a startup. Write a brief email to your customers announcing a new "smart summarisation" feature in your app. Keep it friendly, professional, and under 150 words. Include a clear call-to-action.',
  'email',
  130,
  JSON.stringify(['professional tone', 'clarity', 'call-to-action present', 'word count appropriate']),
  'easy', 15
);

console.log('✅ Tasks seeded (2 coding, 2 puzzle, 2 content-creation)');

// ── Global survey questions ────────────────────────────────────────
const sdb = new Database(SURVEY_DB);

// Create global_survey_questions table if not exists
sdb.exec(`
  CREATE TABLE IF NOT EXISTS global_survey_questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    question_text TEXT    NOT NULL,
    question_type TEXT    NOT NULL DEFAULT 'open_ended',  -- open_ended | rating | multiple_choice
    display_order INTEGER NOT NULL DEFAULT 99,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS global_survey_responses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id  TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    question_id     INTEGER NOT NULL REFERENCES global_survey_questions(id),
    response_text   TEXT,
    submitted_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed 3 global open-ended questions (typical end-of-session debrief)
const existingCount = sdb.prepare('SELECT COUNT(*) as n FROM global_survey_questions').get();
if (existingCount.n === 0) {
  const ins = sdb.prepare(`INSERT INTO global_survey_questions (question_text, question_type, display_order) VALUES (?,?,?)`);
  ins.run('Which AI assistant felt most natural to work with, and why?', 'open_ended', 1);
  ins.run('Describe any moment where the AI\'s suggestion surprised you — either positively or negatively.', 'open_ended', 2);
  ins.run('If you could change one thing about how the AI assisted you during the tasks, what would it be?', 'open_ended', 3);
  console.log('✅ Global survey questions seeded');
} else {
  console.log(`ℹ️  Global survey already has ${existingCount.n} questions — skipping seed`);
}

tdb.close();
sdb.close();
