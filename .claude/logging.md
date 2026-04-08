# Logging Reference — HTI-Lab AgenticAI

> This is a redundant reference for quick access. The authoritative source is `.claude/Project-Overview.md` §9.

---

## Architecture

- **Client-side:** `logEvent()` in `lib/logger.ts` — fire-and-forget fetch to `/api/logs`
- **Server-side:** Written to `interaction_logs` table in `surveys.db`
- **Never throws, never blocks UI** — if logging fails silently, experiment continues

---

## Global Events (All Task Types)

| Event | Key Fields | Status | Purpose |
|---|---|---|---|
| `task_start` | `task_id`, `task_type`, `model_id`, `task_title` | ✅ Active | Establishes baseline start time and registers condition |
| `alive_ping` | `ping_n`, `elapsed_sec`, `tab_active`, `recently_active`, `active_sec_est` | ✅ Active | Differentiates active engagement time from raw elapsed time |
| `ai_chat_sent` | `char_count`, `model_id` | ✅ Active | Tracks participant reliance on AI side-chat and query complexity |
| `ai_chat_received` | `char_count`, `model_id` | ✅ Active | Tracks length/complexity of AI responses |

---

## Coding Task Events

| Event | Key Fields | Status | Purpose |
|---|---|---|---|
| `code_block_copied` | `char_count`, `line_count`, `time_since_generation_ms`, `total_copy_count`, `model_id` | ✅ Active | Fires when user copies a code block from AI chat — Reliance metric |
| `code_edit` | `edit_count`, `char_count` | ✅ Active | Proxy for coding effort (debounced) |
| `code_run` | `char_count`, `model_id`, `elapsed_sec`, `is_submit` | ✅ Active | Calls `POST /api/execute` — real Python subprocess runs the participant's code |
| `code_run_result` | `tests_passed`, `tests_failed`, `pass_at_1`, `ai_line_count`, `code_persistence_pct` | ✅ Active | Real `pass_at_1` from Python subprocess execution; `code_persistence_pct` active |
| `first_success` | `time_to_first_success_sec`, `ai_line_count`, `code_persistence_pct` | ✅ Active | Fires on first passing `code_run_result` |
| `task_complete` | `time_to_complete_sec`, `final_pass_at_1`, `tests_passed`, `code_persistence_pct` | ✅ Active | Summarizes entire coding session |

**Execution backend:** `POST /api/execute` calls the **OneCompiler API** (`onecompiler-apis.p.rapidapi.com`). Unit tests are appended as `assert` statements to the submitted code; stdout is parsed for PASS/FAIL/ERROR markers. Requires `ONECOMPILER_API_KEY` in `.env.local`. Free tier: ~100 runs/day.

---

## Puzzle Task Events

| Event | Key Fields | Status | Purpose |
|---|---|---|---|
| `hint_requested` | `hint_number`, `model_id` | ✅ Active | Tracks moments of frustration requiring AI assistance |
| `hint_received` | `hint_number`, `model_id`, `char_count` | ✅ Active | AI hint delivery confirmation |
| `answer_edited_post_hint` | `hints_used`, `answer_length`, `model_id` | ✅ Active | Validates whether AI triggered a change in approach |
| `answer_submitted` | `is_correct`, `hints_used`, `overrides`, `time_to_complete_sec`, `answer_length`, `model_id` | ✅ Active | `overrides` serves as Calibrated Trust metric |
| `task_complete` | `time_to_complete_sec`, `hints_used`, `is_correct`, `overrides` | ✅ Active | Final record of puzzle performance |

---

## Writing Task Events

| Event | Key Fields | Status | Purpose |
|---|---|---|---|
| `ai_action_clicked` | `action` (e.g., summarize, rewrite), `word_count`, `has_selection` | ✅ Active | Identifies which AI features users rely on most |
| `suggestion_accepted` | `suggestion_char_count`, `accept_count` | ✅ Active | Affirmative alignment between AI outputs and user preference (Reliance) |
| `suggestion_dismissed` | `action_count` | ✅ Active | Tracks AI outputs user found unhelpful |
| `task_complete` | `time_to_complete_sec`, `word_count`, `edit_distance_pct`, `suggestion_accept_rate_pct` | ✅ Active | `edit_distance_pct` proxies Text Persistence / Trust |

---

## Faulty-AI Probe ⚠️ Pending

> One probe run per session injects pre-seeded wrong AI content to measure **Automation Bias**.
> Full spec: [`.claude/faulty-ai.md`](.claude/faulty-ai.md)

| Event | Key Fields | Status | Purpose |
|---|---|---|---|
| `ai_solution_faulty_delivered` | `char_count`, `faulty_field`, `model_id` | ⚠️ Pending | Pre-seeded wrong solution returned to participant (probe run) |
| `ai_reasoning_faulty_delivered` | `char_count`, `faulty_field`, `model_id` | ⚠️ Pending | Pre-seeded wrong reasoning returned to participant (probe run) |

**Scope:** Coding (via chat), Puzzle (via hints), Writing (via action buttons). DB support partially exists in `puzzle_tasks`; `coding_tasks` and `writing_tasks` need schema additions. See `.claude/faulty-ai.md` for full plan.

---

## Deliberately Excluded Events

| Event | Reason | Status |
|---|---|---|
| `window_blur` / `focus` | Experiment runs fullscreen on a single controlled tab — tab switch not possible in local lab setup | ❌ Excluded |
| `answer_override` | LOA (Level of Autonomy) concept from prior autonomous AI studies; replaced with neutral `answer_edited_post_hint` | ❌ Excluded |

---

## Event Status Key

| Symbol | Meaning |
|---|---|
| ✅ Active | Fully implemented and in use |
| ⚠️ Pending | Designed and documented but not yet implemented |
| ❌ Excluded | Deliberately not implemented |
