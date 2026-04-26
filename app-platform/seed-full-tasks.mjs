// Seed ALL tasks: coding, writing, puzzle
// Clears existing rows first — single source of truth.
// Run: node seed-full-tasks.mjs

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, 'data', 'tasks.db'));

// Clear existing rows so this is always a clean seed
// CREATE missing tables first (idempotent — IF NOT EXISTS skips existing tables)
// Drop old puzzle_tasks if it exists (no longer used)
db.exec('DROP TABLE IF EXISTS puzzle_tasks');
db.exec(`
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
  )
`);

db.exec('DELETE FROM coding_tasks');
db.exec('DELETE FROM writing_tasks');
db.exec('DELETE FROM tangram_puzzles');
console.log('Cleared existing tasks');

// ═══════════════════════════════════════════════════════════════
// CODING TASKS
// ═══════════════════════════════════════════════════════════════
const insertCoding = db.prepare(`
  INSERT INTO coding_tasks (title, description, function_signature, starter_code, unit_tests, difficulty, tags, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?,?)
`);

// EASY ─────────────────────────────────────────────────────────
insertCoding.run(
  'FizzBuzz Whiz Edition',
  `Given an integer n, return a list of strings answer (1-indexed) where:
- answer[i] == "FizzBuzz" if i is divisible by 3 and 5
- answer[i] == "FizzWhiz" if i is divisible by 3 and 7
- answer[i] == "Fizz" if i is divisible by 3 (and not 5 or 7)
- answer[i] == "Buzz" if i is divisible by 5 (and not 3)
- answer[i] == "Whiz" if i is divisible by 7 (and not 3)
- answer[i] == str(i) if none of the above conditions are true
Examples:
- n=15  → ["1","2","Fizz","4","Buzz","Fizz","7","8","Fizz","Buzz","11","Fizz","13","Whiz","FizzBuzz"]
- n=21  → [..., "19","Buzz","FizzWhiz"]`,
  'def solution(n: int) -> list[str]:',
  'def solution(n: int) -> list[str]:\n    pass\n',
  JSON.stringify([
    "solution(15) == ['1','2','Fizz','4','Buzz','Fizz','7','8','Fizz','Buzz','11','Fizz','13','Whiz','FizzBuzz']",
    "solution(1) == ['1']",
    "solution(3) == ['1','2','Fizz']",
    "solution(5) == ['1','2','Fizz','4','Buzz']",
    "solution(7) == ['1','2','Fizz','4','Buzz','Fizz','Whiz']",
    "solution(21)[-3:] == ['19','Buzz','FizzWhiz']",
  ]),
  'easy', JSON.stringify(['conditionals', 'loops', 'strings']), 15
);

insertCoding.run(
  'Power of Two',
  'Given an integer n, return True if it is a power of two. Otherwise, return False.\n\nAn integer n is a power of two if there exists an integer x such that n == 2**x.\n\nExamples:\n- n = 1 → True  (2**0 = 1)\n- n = 16 → True  (2**4 = 16)\n- n = 3 → False\n\nConstraints:\n- -2**31 <= n <= 2**31 - 1',
  'def solution(n: int) -> bool:',
  'def solution(n: int) -> bool:\n    pass\n',
  JSON.stringify([
    'solution(1) == True', 'solution(2) == True', 'solution(16) == True',
    'solution(3) == False', 'solution(0) == False', 'solution(-2) == False',
    'solution(1024) == True', 'solution(512) == True', 'solution(218) == False',
  ]),
  'easy', JSON.stringify(['bit-manipulation', 'math']), 15
);

insertCoding.run(
  'Reverse Vowels',
  'Given a string s, reverse only the vowels in the string and return it.\n\nVowels: a, e, i, o, u (both lower and upper case). Vowels may appear more than once.\n\nExamples:\n- s = "IceCreAm" → "AceCreIm"\n- s = "leetcode" → "leotcede"\nConstraints:\n- 1 <= s.length <= 3 * 10**5\n- s consists of printable ASCII characters',
  'def solution(s: str) -> str:',
  'def solution(s: str) -> str:\n    pass\n',
  JSON.stringify([
    "solution('IceCreAm') == 'AceCreIm'",
    "solution('leetcode') == 'leotcede'",
    "solution('hello') == 'holle'",
    "solution('a') == 'a'",
    "solution('AEIOU') == 'UOIEA'",
  ]),
  'easy', JSON.stringify(['two-pointers', 'strings']), 15
);

// MEDIUM ─────────────────────────────────────────────────────────
insertCoding.run(
  'Coin Change',
  `You are given an integer array coins representing coins of different denominations and an integer amount representing a total amount of money.

Return a dictionary containing:
- min_coins: The fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1.
- combination: A list of integers representing the actual coins used to reach that minimum. If multiple combinations exist, any one is acceptable.

You may assume that you have an infinite number of each kind of coin.

Examples:
- coins=[1,2,5], amount=11 → min_coins=3, combination=[5,5,1]
- coins=[2], amount=3 → min_coins=-1, combination=[]
- coins=[1,5,6,9], amount=11 → min_coins=2, combination=[5,6]`,
  'def solution(coins: list[int], amount: int) -> dict:',
  'def solution(coins: list[int], amount: int) -> dict:\n    pass\n',
  JSON.stringify([
    "solution([1,2,5], 11)['min_coins'] == 3",
    "sorted(solution([1,2,5], 11)['combination']) == sorted([5,5,1])",
    "solution([2], 3)['min_coins'] == -1",
    "solution([2], 3)['combination'] == []",
    "solution([1,5,6,9], 11)['min_coins'] == 2",
    "sorted(solution([1,5,6,9], 11)['combination']) == sorted([5,6])",
  ]),
  'medium', JSON.stringify(['dynamic-programming', 'greedy']), 20
);

insertCoding.run(
  'Spiral Matrix',
  `Given an m x n matrix, return all elements of the matrix in spiral order (clockwise from the top-left corner).

Example:
Input: matrix = [[1,2,3,4],[5,6,7,8],[9,10,11,12]]
Output: [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]

Constraints:
- 1 <= m, n <= 10
- -100 <= matrix[i][j] <= 100`,
  'def solution(matrix: list[list[int]]) -> list[int]:',
  'def solution(matrix: list[list[int]]) -> list[int]:\n    pass\n',
  JSON.stringify([
    "solution([[1,2,3,4],[5,6,7,8],[9,10,11,12]]) == [1,2,3,4,8,12,11,10,9,5,6,7]",
    "solution([[1]]) == [1]",
    "solution([[1,2]]) == [1,2]",
    "solution([[1],[2]]) == [1,2]",
    "solution([[1,2,3],[4,5,6]]) == [1,2,3,6,5,4]",
    "solution([[1,2,3,4],[5,6,7,8]]) == [1,2,3,4,8,7,6,5]",
  ]),
  'medium', JSON.stringify(['matrix', 'simulation', '2d-array']), 20
);

insertCoding.run(
  'Roman to Integer',
  `Roman numerals are represented by seven different symbols:
I V X L C D M
1 5 10 50 100 500 1000

Roman numerals are usually written largest to smallest from left to right.
However, subtraction is used for: IV (4), IX (9), XL (40), XC (90), CD (400), CM (900).

Given a valid Roman numeral string, convert it to an integer.

Examples:
- "III" → 3
- "LVIII" → 58  (L=50, V=5, III=3)
- "MCMXCIV" → 1994  (M=1000, CM=900, XC=90, IV=4)

Constraints:
- 1 <= s.length <= 15
- s contains only: I, V, X, L, C, D, M
- s is guaranteed to be a valid Roman numeral in range [1, 3999]`,
  'def solution(s: str) -> int:',
  'def solution(s: str) -> int:\n    pass\n',
  JSON.stringify([
    "solution('III') == 3",
    "solution('LVIII') == 58",
    "solution('MCMXCIV') == 1994",
    "solution('I') == 1",
    "solution('IV') == 4",
    "solution('IX') == 9",
    "solution('XL') == 40",
    "solution('XC') == 90",
    "solution('CD') == 400",
    "solution('CM') == 900",
  ]),
  'medium', JSON.stringify(['hashmap', 'strings', 'simulation']), 15
);

insertCoding.run(
  'Restore IP Addresses',
  `A valid IP address consists of exactly four integers separated by single dots. Each integer is between 0 and 255 (inclusive) and cannot have leading zeros.
Given a string s containing only digits, return all possible valid IP addresses that can be formed by inserting dots into s. You cannot reorder or remove digits.

Examples:
- s = "25525511135" → ["255.255.11.135", "255.255.111.35"]
- s = "0000" → ["0.0.0.0"]
- s = "101023" → ["1.0.10.23", "1.0.102.3", "10.1.0.23", "10.10.2.3", "101.0.2.3"]

Constraints:
- 1 <= s.length <= 20
- s consists of digits only`,
  'def solution(s: str) -> list[str]:',
  'def solution(s: str) -> list[str]:\n    pass\n',
  JSON.stringify([
    "set(solution('25525511135')) == {'255.255.11.135', '255.255.111.35'}",
    "solution('0000') == ['0.0.0.0']",
    "set(solution('101023')) == {'1.0.10.23','1.0.102.3','10.1.0.23','10.10.2.3','101.0.2.3'}",
    "solution('1111') == ['1.1.1.1']",
  ]),
  'medium', JSON.stringify(['backtracking', 'strings']), 20
);

insertCoding.run(
  'Add Two Numbers',
  `You are given two non-empty linked lists (represented as Python lists) representing two non-negative integers. The digits are stored in reverse order.

Add the two numbers and return the sum as a linked list (Python list).

Examples:
- l1=[2,4,3], l2=[5,6,4] → [7,0,8]  (342 + 465 = 807)
- l1=[0], l2=[0] → [0]
- l1=[9,9,9,9,9,9,9], l2=[9,9,9,9] → [8,9,9,9,0,0,0,1]

Constraints:
- 1 <= length of each list <= 100
- 0 <= Node.val <= 9`,
  'def solution(l1: list[int], l2: list[int]) -> list[int]:',
  'def solution(l1: list[int], l2: list[int]) -> list[int]:\n    pass\n',
  JSON.stringify([
    'solution([2,4,3], [5,6,4]) == [7,0,8]',
    'solution([0], [0]) == [0]',
    'solution([9,9,9,9,9,9,9], [9,9,9,9]) == [8,9,9,9,0,0,0,1]',
    'solution([1], [9,9]) == [0,0,1]',
    'solution([5], [5]) == [0,1]',
  ]),
  'medium', JSON.stringify(['linked-list', 'math', 'simulation']), 20
);

insertCoding.run(
  'Gray Code',
  `An n-bit Gray code sequence is a sequence of 2**n integers where:
- Every integer is in range [0, 2**n - 1]
- The first integer is 0
- No integer appears more than once
- Adjacent integers differ by exactly one bit in binary
- First and last integers also differ by exactly one bit

Given n, return any valid n-bit Gray code sequence.

Examples:
- n = 2 → [0,1,3,2] or [0,2,3,1]
- n = 1 → [0,1]

Constraints:
- 1 <= n <= 16`,
  'def solution(n: int) -> list[int]:',
  'def solution(n: int) -> list[int]:\n    pass\n',
  JSON.stringify([
    'solution(1) == [0,1]',
    'set(solution(2)) == {0,1,2,3}',
    'solution(2)[0] == 0',
    'len(solution(2)) == 4',
    'solution(3)[0] == 0',
    'len(solution(3)) == 8',
    'set(solution(3)) == set(range(8))',
    'solution(4)[0] == 0',
    'len(solution(4)) == 16',
  ]),
  'medium', JSON.stringify(['backtracking', 'math', 'bit-manipulation']), 20
);

// ═══════════════════════════════════════════════════════════════
// TANGRAM PUZZLES (indices into problemsData.js, 0-based)
// We use the 3 easiest puzzles (fewest silhouette vertices)
// Index 168:  12 vertices  (easiest)
// Index 10:   16 vertices
// Index 161:  16 vertices
// ═══════════════════════════════════════════════════════════════
const insertTangram = db.prepare(`
  INSERT INTO tangram_puzzles (title, prompt, problem_index, target_silhouette, piece_count, difficulty, time_limit_minutes)
  VALUES (?,?,?,?,?,?,?)
`);

// EASY ─────────────────────────────────────────────────────────
insertTangram.run(
  'Tangram #169 — Heart',
  'Arrange all 7 tangram pieces to form the heart silhouette shown on the canvas.',
  168, // problem_index (0-based, so puzzle #169 in 1-based is index 168)
  '[]', // target_silhouette — stored in problemsData, we just reference by index
  7, 'easy', 15
);

insertTangram.run(
  'Tangram #11 — Star',
  'Arrange all 7 tangram pieces to form the star silhouette shown on the canvas.',
  10,
  '[]',
  7, 'easy', 15
);

insertTangram.run(
  'Tangram #162 — Arrow',
  'Arrange all 7 tangram pieces to form the arrow silhouette shown on the canvas.',
  161,
  '[]',
  7, 'easy', 15
);

// MEDIUM ─────────────────────────────────────────────────────────
// Medium puzzles will be randomly selected from the remaining pool
// by pickSingleTask() at session creation time

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
const coding = db.prepare('SELECT difficulty, COUNT(*) as n FROM coding_tasks GROUP BY difficulty').all();
const tangram = db.prepare('SELECT difficulty, COUNT(*) as n FROM tangram_puzzles GROUP BY difficulty').all();
const writing = db.prepare('SELECT difficulty, COUNT(*) as n FROM writing_tasks GROUP BY difficulty').all();

console.log('\nTask DB summary:');
console.log('Coding:', coding);
console.log('Tangram:', tangram);
console.log('Writing:', writing);
db.close();
