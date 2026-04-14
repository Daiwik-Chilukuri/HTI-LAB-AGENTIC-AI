# Faulty-AI Probe — Implementation (April 2026)

> **Status:** ✅ Fully Implemented

One run per session injects a deliberately wrong AI to measure **Automation Bias**.

---

## How It Works

**Implementation approach:** Rather than pre-seeded wrong answers stored in the DB, the faulty AI is implemented via **standalone system prompts** that make the model itself behave incorrectly. Each task component has both normal and faulty versions of its system prompt.

**Why standalone over DB content?**
- DB content only covers explicit "give me the answer" queries
- Standalone prompts cover all AI interactions naturally (questions, follow-ups, defenses)
- The faulty AI can be questioned and will defend its wrong answer (which DB content cannot do)
- No contradictions within the system prompt itself

---

## Random Selection

In `app/api/sessions/route.ts`:
```typescript
const faultyRunIndex = Math.floor(Math.random() * 3); // 0, 1, or 2
```

One of the 3 runs is randomly marked `is_faulty = 1` at session creation time.

---

## Prompt Architecture (Per Task Type)

### Coding (`CodingTask.tsx`)
- **`normalCodingSystemPrompt()`**: Standard helpful coding assistant prompt
- **`faultyCodingSystemPrompt()`**: Instructs the model to give subtly wrong code suggestions with bugs (wrong indices, off-by-one errors, flawed logic). Presented confidently, no apology.

### Puzzle (`PuzzleTask.tsx`)
- **`normalPuzzleSystemPrompt()` / `normalHintSystemPrompt()`**: Guide toward correct solution
- **`faultyPuzzleSystemPrompt()` / `faultyHintSystemPrompt()`**: Steer toward incorrect answer. Reasoning looks plausible but contains subtle logical errors.

### Writing (`WritingTask.tsx`)
- **`normalWritingSystemPrompt()` / `normalActionSystemPrompt()`**: Helpful writing assistance
- **`faultyWritingSystemPrompt()` / `faultyActionSystemPrompt()`**: Suggestions are slightly off-topic, weakly argued, generic, or subtly flawed. Never apologizes.

---

## Propagating Faulty State

```
sessions/route.ts
  └── INSERT runs SET is_faulty = 1 (random 1 of 3)
        ↓
experiment/page.tsx
  └── reads run.is_faulty
        ↓
  passes isFaulty={run.is_faulty === 1} to:
        ├── CodingTask.tsx
        ├── PuzzleTask.tsx
        └── WritingTask.tsx
              ↓
        Each task selects normal vs faulty prompt
```

---

## Research Use

- **Reliance Index & Content Persistence**: Analyzed across the **3 non-faulty runs only**
- **Automation Bias**: Binary flag — did the participant follow the faulty AI's wrong suggestion?
  - Submit without override after receiving faulty hint/content = automation bias = 1
  - Override, correct, or dismiss = no automation bias = 0

---

## DB Schema

### `surveys.db` — `runs` table
```sql
is_faulty INTEGER NOT NULL DEFAULT 0
```

### `tasks.db` — `puzzle_tasks` (pre-existing, for reference)
```sql
ai_solution_faulty TEXT NOT NULL DEFAULT ''
ai_reasoning_faulty TEXT NOT NULL DEFAULT ''
```
(Note: these fields exist but the active implementation uses standalone prompts, not these fields)

---

## Debug Endpoint

`GET /api/test-faulty?model=agent_a|agent_b|agent_c&type=normal|faulty|both`

Tests both normal and faulty prompt outputs for any agent without running a full session. Useful for validating that faulty prompts produce consistently wrong (not just confused) responses.
