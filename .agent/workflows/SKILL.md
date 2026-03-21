---
name: HTI-Lab AgenticAI Experiment Platform
description: >
  Skill for working on the HTI-Lab AgenticAI blind LLM benchmarking experiment platform.
  Covers architecture, conventions, past decisions, known pitfalls, and how to reason
  about new requests in context of the research design.
---

# HTI-Lab AgenticAI — Agent Skill

## High-Level Project Idea

This is a **research experiment platform** — not a product, not a SaaS, not a demo. It runs **locally on localhost** for a controlled within-subject HCI study. The core goal is:

> Blind-compare 4 state-of-the-art LLMs (GPT-4o, Claude Sonnet, Gemini 2.5 Pro, Grok-3) across 3 task types (coding, logic puzzles, content creation) by measuring objective productivity metrics and subjective workload/trust/experience.

| Slot | Label | OpenRouter Slug |
|---|---|---|
| `agent_a` | **GPT-5.4** | `openai/gpt-5.4` |
| `agent_b` | **Claude Sonnet 4.6** | `anthropic/claude-sonnet-4.6` |
| `agent_c` | **Gemini 3.1 Pro Preview** | `google/gemini-3.1-pro-preview` |
| `agent_d` | **Grok 4.20 Beta Reasoning** | `x-ai/grok-4.20-beta` |
| `test` | Test Agent (Nemotron Super 120B) | `nvidia/nemotron-3-super-120b-a12b:free` |

> **Important:** The user's model naming convention (GPT-5.4, Gemini 3.1 Pro Preview, etc.) may not match OpenAI/Google/Anthropic's official marketing names. These are the labels used internally in this project and in all participant-facing materials. The `label` field in `MODEL_CONFIGS` in `lib/router.ts` uses these exact strings. Do not rename them without the user's explicit instruction.  
**All data is local.** SQLite on the experiment machine. No cloud, no auth.  
**Admin panel is hidden** at `/htilab-nexus` — not linked from participant UI.

---

## What We Are Building

A Next.js full-stack app with:
- A **participant-facing experiment UI** (landing → session → 4 runs → surveys → debrief)
- An **admin control panel** for managing tasks, survey questions, and viewing all collected data
- A **logging system** that captures objective interaction metrics per run
- A **task counterbalancing system** that pre-assigns matched-difficulty tasks to each run at session creation
- An **identity blinding layer** at the API router level that prevents any model from revealing its name

The study design is based on `docs/Experimental-Protocol.md`. Always re-read that file when making decisions about logging, task design, or study flow.

---

## How to Act on This Project

### Always do first
1. **Read `docs/Experimental-Protocol.md`** before making decisions about what to log, what to measure, or how to structure tasks. It is the source of truth for research design.
2. **Check `docs/Project-Overview.md`** for architecture decisions already made — don't re-invent without reason.
3. **Check `lib/router.ts`** before touching anything related to AI API calls. The identity guard must remain the first message in every request.
4. **Check `lib/db.ts`** before adding tables or columns — understand which database (`tasks.db` vs `surveys.db`) to use.

### Key conventions to follow
- **IST timestamps everywhere** — SQLite stores UTC without timezone marker; always append `Z` when parsing SQLite timestamps in JavaScript, then display in `Asia/Kolkata` locale
- **Logging is fire-and-forget** — `logEvent()` in `lib/logger.ts` must never throw, never block the UI, never await in a way that delays experiments
- **Task fetch by ID** — task components fetch `?type={type}&id={taskId}` not `?random=1`. The `task_id` is pre-assigned at session creation for counterbalancing. The `random=1` fallback is kept only for old sessions
- **Two databases** — `tasks.db` for question content, `surveys.db` for participant data. Never cross them
- **Admin panel is a single large page** at `app/htilab-nexus/page.tsx` — it has tabs, state management, and CRUD operations all in one file. When editing it, be careful about concurrent edits
- **Identity guard is in `lib/router.ts`** — it is prepended as an array element to the messages array. Never remove it, never move it below the task system prompt

---

## Past Decisions — What Was Decided and Why

### Removed: `answer_override` log
The user's seniors (who built the Puzzles platform) studied Level of Autonomy (LOA) — where the AI made decisions autonomously and participants could override them. **Our study is different**: the AI only gives conversational guidance, never takes autonomous action. `answer_override` was imported from that LOA framing and was misleading. Replaced with `answer_edited_post_hint` (neutral: just records that the participant typed something after receiving a hint).

### Removed: Faulty hint injection
Also from the LOA study — deliberately injected wrong AI answers to test if participants could detect faulty AI. Not applicable here. The `ai_solution_faulty` columns remain in the DB schema for future extensibility but are not used.

### Decision: OpenRouter as the unified API
All 4 models (GPT, Claude, Gemini, Grok) are accessed via a single OpenRouter key. This simplifies key management dramatically for a researcher. Agent-specific keys are optional overrides for billing separation only.

### Decision: SQLite sync (better-sqlite3) not async
For a single-machine localhost experiment with low concurrency, synchronous SQLite is faster, simpler, and avoids race conditions. No connection pooling needed.

### Decision: Two separate databases
`tasks.db` (question content) and `surveys.db` (participant data) are separated so that "Clear Session Data" can wipe participant data without risk of deleting the task bank.

### Decision: Admin panel at `/htilab-nexus`
Obscure URL so participants who know the port won't stumble onto it. Adequate for a controlled localhost experiment environment.

### Decision: Task counterbalancing at session creation time
Rather than picking a random task at runtime (which could give Agent A a hard problem and Agent B an easy one), the session creation endpoint (`POST /api/sessions`) pre-selects two tasks of matching difficulty per task type. This is stored in the run row (`task_id` column) so the task component fetches by ID.

### Decision: 30-second heartbeat
Distinguishes active engagement from idle time during a 15-minute run. Short enough (30s) to give ~30 data points per run, long enough not to be noisy. Uses mouse/keyboard activity detection + tab focus check.

---

## Common Pitfalls Encountered

### 1. PowerShell encoding corruption ⚠️ CRITICAL
**Problem:** PowerShell's `Set-Content` and `Out-File` commands do NOT reliably write UTF-8 with BOM. When used to write TSX files containing emojis or special characters, they corrupt the file. The emojis display as garbage in the browser.

**How it was caught:** Emojis in the admin panel appeared as corrupted characters.  
**How it was fixed:** A Node.js script (`fix-encoding.mjs`) was used to re-write the file with explicit `utf8` encoding.

**Prevention:** NEVER use PowerShell `Set-Content` to write TypeScript/TSX files. Use:
- `node -e "require('fs').writeFileSync(file, content, 'utf8')"` for scripted writes  
- Or write a `.mjs` helper script and run with `node script.mjs`
- Or use the file editing tools directly

### 2. Parallel edits to the same large file ⚠️
**Problem:** The admin panel (`app/htilab-nexus/page.tsx`) is ~900 lines. Attempting to do multiple non-sequential edits in the same turn sometimes caused target content not found errors, especially when target strings contained HTML entities (`&amp;`, `&gt;`) rather than raw characters.

**How it was caught:** `multi_replace_file_content` returned "target content not found".  
**How it was fixed:** Use view_file to see the exact raw characters before editing. The view tool escapes HTML entities in output — always use the raw string when specifying TargetContent.

**Prevention:** 
- View the exact lines before editing large files
- Do not make more than 4 chunks in a single `multi_replace_file_content` call on the admin page
- For structural insertions (adding a whole new tab), write a `.mjs` Node script and use `lastIndexOf` to find the insertion point

### 3. TypeScript casts in `.mjs` files ⚠️
**Problem:** `.mjs` files are plain JavaScript. TypeScript syntax like `as {n: number}` will throw a SyntaxError.

**How it was caught:** `seed-tasks.mjs` failed to run.  
**Prevention:** In any `.mjs` seed/utility script, never use TypeScript syntax. Use plain JS. If you need types, write a `.ts` file and compile it, or use JSDoc comments.

### 4. Missing `useRef` import ⚠️
**Problem:** When adding new refs to a component that previously didn't use refs, the import line doesn't automatically update.

**How it was caught:** TypeScript reported "Cannot find name 'useRef'" after adding heartbeat and timer refs to `PuzzleTask.tsx`.  
**Prevention:** Always check the import line when adding hooks to an existing component.

### 5. Button onClick type mismatch ⚠️
**Problem:** `handleRun` was changed to accept a `boolean` parameter for `isSubmit`. When passed directly as `onClick={handleRun}`, TypeScript complained that `MouseEvent` is not assignable to `boolean`.

**How it was caught:** TypeScript lint error in CodingTask.  
**Fix:** Always wrap in an arrow function: `onClick={() => handleRun(false)}` and `onClick={() => handleRun(true)}`.

### 6. Admin panel injection via Node script ⚠️
**Problem:** The admin page's closing JSX sequence (`</> )} </div> </main>`) contains characters that look different when read via the view tool (HTML-encoded) vs the raw file. This makes `replace_file_content` fail when trying to target that exact sequence.

**How it was caught:** Multiple "target content not found" errors when trying to insert the Global Survey tab.  
**Fix:** Write a `.mjs` Node script that uses `readFileSync`, `lastIndexOf` to find the insertion point, string concatenation, and `writeFileSync`. This bypasses the encoding ambiguity entirely.

---

## Things the User Cares About Deeply

1. **Research validity** — every design decision has a research rationale. Don't add features just because they're cool. Ask: "does this help answer the research question?"
2. **Logging correctness** — the user reads the Experimental Protocol carefully. Reference it before suggesting new log events. Don't add logs that belong to a different study design (LOA vs. blind benchmarking)
3. **No LOA concepts** — this is NOT a Level-of-Autonomy study. No overrides, no faulty AI, no autonomy levels. The AI is always in a conversational assistant role
4. **Task balance** — all agents must face comparable task difficulty. This is not optional; it's a validity requirement
5. **IST timezone** — the user is in India. All timestamps displayed in the admin panel must be in IST (Asia/Kolkata)
6. **Model identity hidden from participants** — non-negotiable. The identity guard in router.ts must never be removed or weakened
7. **Admin panel must show model names** — the user as experimenter needs to know which model is assigned to which run. This is visible in the admin panel but not the participant UI

---

## When the User Pushes Back on Something You Did

Common situations where the user corrected the agent:

- **"Remove the faulty AI"** — the agent initially added `answer_override` and kept LOA concepts from the senior project. The user explicitly said this is blind benchmarking, not LOA
- **"Fetch all from the DB"** — early implementations used hardcoded placeholder questions. The user insisted everything be pulled from the database so it's admin-configurable
- **"IST not UTC"** — timestamps were initially displayed in UTC. The user asked for IST and it was implemented
- **"Give option to add questions per task in admin"** — NASA-TLX questions started as a global list; the user wanted per-task scoping in the admin UI
- **"Show model names in admin"** — early admin panel showed only agent IDs. The user wanted the actual model name (e.g. `openai/gpt-4o`) visible

When the user says "you built X but it should do Y" — don't defend the original implementation. Understand the correction, fix it, and update this skill file if it reveals a new convention.

---

### 7. Nemotron test model — nano retired, Super 120B works ⚠️
**Problem:** `nvidia/llama-3.1-nemotron-nano-8b-v1:free` returned HTTP 404 — endpoint retired by OpenRouter.
**Fix:** Switched to `nvidia/nemotron-3-super-120b-a12b:free` — a completely different (and much larger) Nemotron model, verified working on OpenRouter March 2026. `supportsReasoning: true` restored.
**Prevention:** Always verify free-tier model slugs directly on openrouter.ai/models before using them. Free endpoints are not guaranteed stable.

- ❌ Do not expose model names to participants (only the admin panel)
- ❌ Do not use random task selection at runtime for a counterbalanced session
- ❌ Do not use PowerShell `Set-Content` for TSX/TS files
- ❌ Do not mix `tasks.db` and `surveys.db` operations
- ❌ Do not remove or weaken the identity guard in `lib/router.ts`
- ❌ Do not add faulty AI / LOA-specific logic to this codebase
- ❌ Do not log `answer_override` — use `answer_edited_post_hint` instead
- ❌ Do not display UTC timestamps in the admin panel — always IST

---

## Recommended Reading Order for a New Session

1. `docs/Experimental-Protocol.md` — research design and metrics
2. `docs/Project-Overview.md` — technical architecture
3. `lib/router.ts` — identity blinding and API routing
4. `lib/db.ts` — database schema
5. `app/htilab-nexus/page.tsx` — admin panel (large; skim structure first)
6. `app/api/sessions/route.ts` — counterbalancing logic
7. `app/experiment/components/{CodingTask,PuzzleTask,WritingTask}.tsx` — task UI and logging
