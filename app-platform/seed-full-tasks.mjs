// Seed ALL tasks: kenken, tangram, writing
// Clears existing rows first — single source of truth.
// Run: node seed-full-tasks.mjs

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'data', 'tasks.db'));

// Clear existing rows so this is always a clean seed
// Re-create kenken_puzzles table (coding_tasks/writing_tasks/tangram_puzzles already exist)
db.exec('DROP TABLE IF EXISTS kenken_puzzles');
db.exec(`
  CREATE TABLE kenken_puzzles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    cages TEXT NOT NULL DEFAULT '[]',
    difficulty TEXT NOT NULL DEFAULT 'easy' CHECK(difficulty IN ('easy','medium','hard')),
    checkpoint_1_scaffold TEXT NOT NULL DEFAULT '',
    checkpoint_1_tests TEXT NOT NULL DEFAULT '[]',
    checkpoint_2_scaffold TEXT NOT NULL DEFAULT '',
    checkpoint_2_tests TEXT NOT NULL DEFAULT '[]',
    checkpoint_3_scaffold TEXT NOT NULL DEFAULT '',
    checkpoint_3_tests TEXT NOT NULL DEFAULT '[]',
    checkpoint_4_scaffold TEXT NOT NULL DEFAULT '',
    checkpoint_4_tests TEXT NOT NULL DEFAULT '[]',
    time_limit_minutes INTEGER NOT NULL DEFAULT 15,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec('DELETE FROM coding_tasks');
db.exec('DELETE FROM writing_tasks');
db.exec('DELETE FROM tangram_puzzles');
db.exec('DELETE FROM kenken_puzzles');
console.log('Cleared existing tasks');

// ═══════════════════════════════════════════════════════════════
// KENKEN PUZZLES
// ═══════════════════════════════════════════════════════════════
const insertKenken = db.prepare(`
  INSERT INTO kenken_puzzles (title, cages, difficulty,
    checkpoint_1_scaffold, checkpoint_1_tests,
    checkpoint_2_scaffold, checkpoint_2_tests,
    checkpoint_3_scaffold, checkpoint_3_tests,
    checkpoint_4_scaffold, checkpoint_4_tests,
    time_limit_minutes)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`);

// Generalized checkpoint scaffolds (test_cases vary per puzzle)
const CP = {
  scaffold_1: `def setup_kenken():
    # Initialize a 4x4 grid filled with zeros
    grid = [[0 for _ in range(4)] for _ in range(4)]

    # Define the cages from the puzzle:
    # Each cage: target number, operation ('*', '/', '=', '+'), list of (row, col) cells
    # Use 0-based indexing (row 0 = top row, col 0 = leftmost column)
    cages = [
        # TODO: Add your cage definitions here
    ]

    # Build a map: cell (r, c) -> cage it belongs to
    cell_to_cage = {}
    # TODO: iterate through cages and populate cell_to_cage

    return grid, cages, cell_to_cage`,

  scaffold_2: `def check_row_valid(grid, row, col, val):
    # Return True if val is NOT already in grid[row]
    pass

def check_col_valid(grid, row, col, val):
    # Return True if val is NOT already in the column at index col
    pass

def is_row_col_valid(grid, row, col, val):
    # Combine row and column checks
    pass`,

  scaffold_3: `def check_cage(grid, cage):
    # grid: current 4x4 grid state
    # cage: {'target': int, 'op': str, 'cells': [(r,c), ...]}
    #
    # 1. Extract current values from cage['cells']
    # 2. If any cell is 0 (empty) → return True (not yet complete)
    # 3. Apply the operation:
    #    - '*': product of all values == target
    #    - '/': max/min == target
    #    - '+': sum of values == target
    #    - '=': value == target (single-cell cage)
    pass`,

  scaffold_4: `def is_valid(grid, row, col, val, cell_to_cage):
    # 1. Check row/column validity (from Checkpoint 2)
    # 2. Temporarily place val in grid[row][col]
    # 3. Check cage validity (from Checkpoint 3)
    # 4. Remove the temporary placement
    # 5. Return True if both checks pass
    pass

def solve_kenken(grid, cages, cell_to_cage):
    # Base case: if no cells are 0, puzzle is solved → return True
    # Find the next empty cell (iterate row by row)
    # If no empty cells → puzzle solved
    # Try each digit 1–4:
    #   - If is_valid allows it, place the digit
    #   - Recursively call solve_kenken
    #   - If recursion returns True → propagate True
    #   - If all digits fail → backtrack (set cell to 0) and return False
    pass`,
};

// ── kenken_1.png (7 cages, 4x4) ─────────────────────────────────
// cages extracted from visual layout:
//  (0,0)*(0,1)*(0,2)=8 | (0,3)*(1,3)=12 | (1,0)*(2,0)*(2,1)=12 | (1,1)*(1,2)=6
//  (2,2)/(2,3)=2 | (3,0)=2 | (3,1)*(3,2)*(3,3)=12
insertKenken.run(
  'KenKen #1 — 4×4 Grid',
  JSON.stringify([
    { id: 0, target: 8,  op: '*', cells: [[0,0],[0,1],[0,2]] },
    { id: 1, target: 12, op: '*', cells: [[0,3],[1,3]] },
    { id: 2, target: 12, op: '*', cells: [[1,0],[2,0],[2,1]] },
    { id: 3, target: 6,  op: '*', cells: [[1,1],[1,2]] },
    { id: 4, target: 2,  op: '/', cells: [[2,2],[2,3]] },
    { id: 5, target: 2,  op: '=', cells: [[3,0]] },
    { id: 6, target: 12, op: '*', cells: [[3,1],[3,2],[3,3]] },
  ]),
  'easy',
  CP.scaffold_1,
  JSON.stringify([
    `grid, cages, cell_to_cage = setup_kenken()`,
    `grid == [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]`,
    `len(cages) == 7`,
    `cell_to_cage[(0,0)]['target'] == 8`,
    `cell_to_cage[(3,0)]['op'] == '='`,
  ]),
  CP.scaffold_2,
  JSON.stringify([
    `check_row_valid([[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 0, 1, 1) == False`,
    `check_row_valid([[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 0, 1, 2) == True`,
    `check_col_valid([[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 1, 0, 1) == False`,
    `check_col_valid([[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 1, 0, 2) == True`,
    `is_row_col_valid([[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], 1, 1, 3) == True`,
  ]),
  CP.scaffold_3,
  JSON.stringify([
    `check_cage([[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], {'target': 8, 'op': '*', 'cells': [(0,0),(0,1),(0,2)]}) == True`,
    `check_cage([[2,4,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], {'target': 8, 'op': '*', 'cells': [(0,0),(0,1),(0,2)]}) == True`,
    `check_cage([[2,4,1,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], {'target': 8, 'op': '*', 'cells': [(0,0),(0,1),(0,2)]}) == True`,
    `check_cage([[2,4,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], {'target': 8, 'op': '*', 'cells': [(0,0),(0,1),(0,2)]}) == False`,
    `check_cage([[0,0,0,0],[0,0,0,0],[0,0,4,2],[0,0,0,0]], {'target': 2, 'op': '/', 'cells': [(2,2),(2,3)]}) == True`,
    `check_cage([[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,0,0]], {'target': 2, 'op': '=', 'cells': [(3,0)]}) == True`,
    `check_cage([[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,0,0]], {'target': 2, 'op': '=', 'cells': [(3,0)]}) == False`,
  ]),
  CP.scaffold_4,
  JSON.stringify([
    `grid = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]`,
    `cages = [{'target': 8, 'op': '*', 'cells': [[0,0],[0,1],[0,2]]}, {'target': 12, 'op': '*', 'cells': [[0,3],[1,3]]}, {'target': 12, 'op': '*', 'cells': [[1,0],[2,0],[2,1]]}, {'target': 6, 'op': '*', 'cells': [[1,1],[1,2]]}, {'target': 2, 'op': '/', 'cells': [[2,2],[2,3]]}, {'target': 2, 'op': '=', 'cells': [[3,0]]}, {'target': 12, 'op': '*', 'cells': [[3,1],[3,2],[3,3]]}]`,
    `cell_to_cage = {(0,0):cages[0],(0,1):cages[0],(0,2):cages[0],(0,3):cages[1],(1,3):cages[1],(1,0):cages[2],(2,0):cages[2],(2,1):cages[2],(1,1):cages[3],(1,2):cages[3],(2,2):cages[4],(2,3):cages[4],(3,0):cages[5],(3,1):cages[6],(3,2):cages[6],(3,3):cages[6]}`,
    `solve_kenken(grid, cages, cell_to_cage)`,
    `grid == [[4,1,2,3],[1,2,3,4],[3,4,1,2],[2,3,4,1]]`,
  ]),
  15
);

// ═══════════════════════════════════════════════════════════════
// TANGRAM PUZZLES (indices into problemsData.js, 0-based)
// ═══════════════════════════════════════════════════════════════
const insertTangram = db.prepare(`
  INSERT INTO tangram_puzzles (title, prompt, problem_index, target_silhouette, piece_count, difficulty, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?)
`);

insertTangram.run(
  'Richter Tangram #3',
  'Arrange all 7 tangram pieces to form the silhouette shown on the canvas.',
  3,
  '[]',
  7, 'easy', 15
);

// ═══════════════════════════════════════════════════════════════
// WRITING TASKS
// ═══════════════════════════════════════════════════════════════
const insertWriting = db.prepare(`
  INSERT INTO writing_tasks (title, prompt, genre, word_count_target, evaluation_criteria, difficulty, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?)
`);

insertWriting.run(
  'Focusly Tagline',
  'Write a one-sentence tagline for a productivity app called Focusly. Requirements: under 10 words, NO adjectives, must include the word "time" exactly once.',
  'tagline', 10,
  JSON.stringify(['under 10 words', 'no adjectives', 'contains word time exactly once', 'one sentence']),
  'easy', 10
);

insertWriting.run(
  'Rejection Email',
  'Write a 60-80 word rejection email to a job applicant. Tone: warm and empathetic. Forbidden words: sorry, apologize, unfortunately, regret, or any form of apology. End with an encouraging forward-looking sentence.',
  'email', 70,
  JSON.stringify(['60-80 words', 'warm empathetic tone', 'no apology words', 'ends with encouraging forward-looking sentence']),
  'medium', 15
);

insertWriting.run(
  'Smart Water Bottle Description',
  'Write a 50-70 word product description for a smart water bottle. Rules: no use of you, your, we, our, I, or us (third person only). Must mention exactly 2 features. End with a price statement.',
  'product_description', 60,
  JSON.stringify(['50-70 words', 'third person only', 'exactly 2 features mentioned', 'ends with price statement']),
  'medium', 15
);

insertWriting.run(
  'Bakery About Us',
  'Write an 80-100 word About Us section for a small bakery. Forbidden phrases: "passionate about", "on a mission to", "we believe", "dedicated to", "committed to", "at the heart of", "proudly serving". Write with specificity and warmth instead.',
  'about_us', 90,
  JSON.stringify(['80-100 words', 'no forbidden cliches', 'specific and warm tone']),
  'medium', 15
);

insertWriting.run(
  'Self-Heating Coffee Mug Description',
  'Write a short product description for a self-heating smart coffee mug. Rule: the description must be exactly 25 words long.',
  'product_description', 25,
  JSON.stringify(['exactly 25 words']),
  'easy', 10
);

insertWriting.run(
  'Beach Packing List',
  'Create a 10-item bulleted list of essential things to pack for a beach vacation. Rule: every single item on the list must start with the letter S.',
  'list', 40,
  JSON.stringify(['exactly 10 items', 'all items start with letter S', 'beach vacation theme']),
  'easy', 10
);

insertWriting.run(
  'Thunderstorm Poem',
  'Write a short poem about a thunderstorm. Rules: exactly 3 lines. Line 1: exactly 3 words. Line 2: exactly 5 words. Line 3: exactly 3 words.',
  'poem', 30,
  JSON.stringify(['exactly 3 lines', 'line 1 has exactly 3 words', 'line 2 has exactly 5 words', 'line 3 has exactly 3 words', 'about thunderstorm']),
  'medium', 15
);

insertWriting.run(
  'Green Smoothie Introduction',
  'Write a two-sentence introduction for a green smoothie recipe. Rule: you must explicitly mention these three ingredients: spinach, apples, and almonds.',
  'recipe_intro', 30,
  JSON.stringify(['two sentences', 'mentions spinach', 'mentions apples', 'mentions almonds']),
  'easy', 10
);

insertWriting.run(
  'Cloud Computing Definition',
  'Write a single sentence defining the concept of "cloud computing". Rules: the sentence must be exactly 15 words long, and the 8th word (the exact middle word) must be the word "servers".',
  'definition', 30,
  JSON.stringify(['exactly 15 words', '8th word is servers']),
  'medium', 15
);

// Summary
const kenken = db.prepare('SELECT difficulty, COUNT(*) as n FROM kenken_puzzles GROUP BY difficulty').all();
const tangram = db.prepare('SELECT difficulty, COUNT(*) as n FROM tangram_puzzles GROUP BY difficulty').all();
const writing = db.prepare('SELECT difficulty, COUNT(*) as n FROM writing_tasks GROUP BY difficulty').all();

console.log('\nTask DB summary:');
console.log('KenKen:', kenken);
console.log('Tangram:', tangram);
console.log('Writing:', writing);
db.close();
