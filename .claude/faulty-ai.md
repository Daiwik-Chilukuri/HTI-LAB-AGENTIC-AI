# Faulty-AI Probe — Implementation Plan

> **Status:** Pending | Target: TBD

One run per session injects a pre-seeded wrong AI suggestion to measure **Automation Bias**.

---

## Architecture

- **One probe run per session** — randomly selected from the 4 runs
- **DB flag:** `runs.is_faulty = 1` marks which run is the probe
- **When `isFaultyRun = true`:** task components bypass live AI and return pre-seeded faulty content instead
- **Faulty data** stored in task DB tables, not in the run/session

---

## DB Changes Needed

### `surveys.db` — `runs` table
```sql
is_faulty INTEGER NOT NULL DEFAULT 0
```

### `tasks.db` — `coding_tasks`
```sql
ai_solution_faulty TEXT NOT NULL DEFAULT ''
ai_reasoning_faulty TEXT NOT NULL DEFAULT ''
```

### `tasks.db` — `writing_tasks`
```sql
ai_solution_faulty TEXT NOT NULL DEFAULT ''
ai_reasoning_faulty TEXT NOT NULL DEFAULT ''
```
(`puzzle_tasks` already has: `ai_solution_faulty`, `ai_reasoning_faulty`, `hints_faulty`)

---

## Session Creation

In `app/api/sessions/route.ts`:
- Randomly pick 1 of 4 runs → set `is_faulty = 1` on INSERT
- Propagate `isFaultyRun` to task components via the run object

---

## Task-Level Behaviour

### Coding (`CodingTask.tsx`)
- `AIChatPanel` receives `isFaultyRun` prop
- When user asks for help/solution and `isFaultyRun = true`:
  - Return pre-seeded `ai_solution_faulty` string instead of calling live AI
  - Log `ai_solution_faulty_delivered`

### Puzzle (`PuzzleTask.tsx`)
- `requestHint()`: read from `hints_faulty` array instead of live AI when `isFaultyRun = true`
- Log `hint_received` with `is_faulty: true` in event_data

### Writing (`WritingTask.tsx`)
- All 5 action buttons (Continue, Rewrite, Summarize, Outline, Improve):
  - When `isFaultyRun = true`: return pre-seeded `ai_solution_faulty` content
  - Log `suggestion_accepted` as normal
  - Additionally log `ai_solution_faulty_delivered`

---

## New Events

| Event | Key Fields | When |
|---|---|---|
| `ai_solution_faulty_delivered` | `char_count`, `faulty_field`, `model_id` | Faulty content returned to user |
| `ai_reasoning_faulty_delivered` | `char_count`, `faulty_field`, `model_id` | Faulty reasoning returned to user |

---

## Research Note

- For **Reliance** and **Persistence** metrics: analyze across the **3 non-faulty runs only**
- The faulty run's data feeds only the **Automation Bias** outcome
- See `.claude/Project-Overview.md` §1 for full protocol details
