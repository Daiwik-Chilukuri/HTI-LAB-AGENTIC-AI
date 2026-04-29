const db = require('better-sqlite3')('data/tasks.db');

const stmt = db.prepare(`
  INSERT INTO tangram_puzzles (title, prompt, problem_index, target_silhouette, piece_count, difficulty, time_limit_minutes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
stmt.run('Richter Tangram #3', 'Arrange all 7 tangram pieces to form the silhouette shown on the canvas.', 3, '[]', 7, 'easy', 15);
console.log('Inserted. New id:', stmt.lastInsertRowid);
const all = db.prepare('SELECT * FROM tangram_puzzles').all();
console.log(JSON.stringify(all, null, 2));