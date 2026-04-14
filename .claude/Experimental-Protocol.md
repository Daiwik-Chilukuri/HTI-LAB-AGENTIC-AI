# Experimental Protocol — HTI-Lab AgenticAI Study
## Updated April 2026: Behavioral Focus (Reliance, Persistence, Automation Bias)

---

## 1. Study Goals and Overall Design

**Old goal:** Benchmark which LLM "performs best" on coding, puzzle, and writing tasks (accuracy, pass@k, etc.).

**New goal:**
Using the same multi‑LLM, multi‑task, blind setup, measure **how different LLMs change human behavior**, focusing on three *objective* constructs:

1. **Reliance Index** – how quickly and how often users reach for AI help instead of trying themselves.
2. **Content Persistence / Ownership** – how much of the AI's output survives in the final answer.
3. **Automation Bias (Faulty AI)** – whether users follow obviously wrong AI hints when they shouldn't.

**Important — faulty run exclusion:** One run per session is designated as the Faulty‑AI probe. For **Reliance Index** and **Content Persistence**, analysis is **across the remaining 3 non‑faulty LLMs only**. The faulty run's data is used **solely** for the Automation‑Bias label and is excluded from Reliance/Persistence comparisons. Automation Bias itself is a purely behavioral, participant‑level measure (not model‑comparative).

Classic performance metrics (accuracy, time, pass@k) are still logged but become **controls**, not the main outcome.

**Study design:**
- **Within-subject:** Every participant experiences all 4 AI models
- **Blind benchmark:** Participants are never told which model they are using
- **2 task types per session:** Each session covers 2 of the 3 task families (counterbalanced)
- **4 runs × 15 min per session** with NASA‑TLX and trust/agency scales afterward
- **Post-run survey:** NASA-TLX + AI subjective scales after each run
- **End-of-session global survey:** Open-ended debrief questions after all 4 runs
- **Faulty‑AI probe run:** One run per participant injects a pre‑seeded wrong AI suggestion to measure automation bias

---

## 2. Participant Session Flow and LLM Exposure

### 2.1 High‑Level Session Timeline

Each participant completes **one laboratory session** lasting approximately **75–90 minutes**, structured as:

1. **Onboarding (10–15 minutes)**
   - Consent and instructions.
   - Short pre‑questionnaire on prior AI/agent use.
2. **Task Block 1 – Task Type A (≈30 minutes)**
   - Two separate 15‑minute runs on Task A, each with a different LLM.
   - **One of these runs is the Faulty‑AI probe** (counterbalanced across participants).
3. **Task Block 2 – Task Type B (≈30 minutes)**
   - Two separate 15‑minute runs on Task B, again each with a different LLM.
4. **Debrief and global ratings (5–10 minutes)**
   - Comparative questions across agents, open comments, and closing.

Participants complete **two of the three** task families (Coding, Logic Puzzles, Creative Writing) in a single session; assignment of the pair is random and counterbalanced.

### 2.2 Faulty‑AI Run (Automation Bias Probe)

**Design:** One of the 4 runs per participant is designated as a **Faulty‑AI run** to measure automation bias.

- Which run is faulty is **counterbalanced** across participants.
- For that run, the AI output for a key hint/answer is replaced by a pre‑seeded wrong suggestion (from the task DB).
- That run is **excluded from cross‑LLM Reliance and Persistence analysis** — Reliance and Persistence compare the **3 non‑faulty LLMs only**.
- The faulty run's data is used **solely** for the Automation‑Bias label.

### 2.3 Concrete LLM Interaction Pattern per Participant

Within each 30‑minute task block the participant experiences the following fixed structure:

- **Run 1 (15 min)** – Task type X, Problem/Prompt A, **Agent 1** (e.g., GPT‑5.4).
  The participant works *only* with this agent for the entire problem; the agent is not swapped mid‑problem.
- **Micro‑survey (2–3 min)** – NASA‑TLX, trust, perceived control, perceived usefulness for Agent 1.
- **Run 2 (15 min)** – Task type X, Problem/Prompt B, **Agent 2** (e.g., Claude Sonnet 4.6).
  Again, a single agent is used for the whole problem.
- **Micro‑survey for Agent 2**.

The same pattern is used for **Task type Y** with **Agents 3 and 4** (e.g., Gemini 3.1 Pro and Grok‑4‑class).

Thus, in one complete session the participant:

- Interacts with **four distinct agents**, one per 15‑minute run.
- Solves **four separate problems** (two per task type), each bound to a *single* agent.
- Provides a local subjective evaluation immediately after each run, and a global comparison at the end.

Order of tasks and agent identities is counterbalanced using Latin‑square style schedules so that, across participants, every agent appears equally often in (a) each task family, (b) each serial position, and (c) the faulty‑AI position.

---

## 3. Task Families and Measures

### 3.1 Programming Task: Short Code Problems in a Browser IDE

The programming task uses short, self‑contained problems similar in size and difficulty to HumanEval/RealHumanEval (e.g., implement a function, repair a bug, or extend a small class). The UI is a browser‑based editor with Monaco Editor, problem statement pane, unit tests, run/submit buttons, and AI chat.

**Behavioral metrics (primary):**

- **Reliance Index:**
  - Time to first AI help (from `task_start` to first `ai_chat_sent`).
  - AI usage volume (count of `ai_chat_sent`, length of `ai_chat_received`).
  - Try‑self‑first vs AI‑first: whether `ai_chat_sent` happens *before* any substantial `code_edit`.
- **Content Persistence:**
  - `code_persistence_pct`: Percentage of lines in final solution that differ from starter code.
  - Combined with `ai_line_count`: proportion of final code that came from AI and remained unedited.

**Performance metrics (controls):**
- Task completion and pass@k under the problem's test suite.
- Time‑to‑first‑success and total time‑to‑completion.
- Error count (compilation/runtime errors, test failures) and number of manual fixes.

**Subjective metrics:** NASA‑TLX, perceived helpfulness, trust, and perceived agency.

### 3.2 Logic‑Puzzle Task: Hint‑Based Reasoning Puzzles

Logic‑puzzle task with explicit constraints, drag‑and‑drop puzzle board, hint requests, and the ability to override AI suggestions.

**Behavioral metrics (primary):**

- **Reliance Index:**
  - Time to first hint (from `task_start` to first `hint_requested`).
  - Hint intensity: number of hints (`hints_used`) within the run.
  - Hint‑driven editing: fraction of answers where `answer_edited_post_hint` fires right after a hint.
- **Content Persistence:**
  - Whether a hint is **followed by direct submission** with no `answer_edited_post_hint` and no `overrides` → high persistence of the hint.
  - Across puzzles: fraction of hint‑supported answers that are submitted "as is."

**Automation Bias (probe run only):**
- Task is instrumented to deliver a known‑wrong suggestion via `ai_solution_faulty` / `ai_reasoning_faulty`.
- Log: Did the participant submit an answer identical or very close to the faulty suggestion?
- Binary **Automation Bias Flag**: 1 if participant followed faulty AI, 0 if they rejected/corrected it.

**Performance metrics (controls):**
- Final puzzle correctness and number of constraints violated.
- Time‑to‑completion per puzzle.
- Number of actions and overrides of AI suggestions.

**Subjective metrics:** NASA‑TLX, trust scales, sense of understanding.

### 3.3 Creative‑Writing Task: Guided Drafting and Editing

Writing task with a central text editor, side panel showing AI responses to structured actions ("Continue", "Rewrite selection", "Summarise", "Generate outline").

**Behavioral metrics (primary):**

- **Reliance Index:**
  - Time to first AI action (from `task_start` to first `ai_action_clicked`).
  - Suggestion usage: count/rate of `suggestion_accepted` vs `suggestion_dismissed`.
- **Content Persistence:**
  - `edit_distance_pct` between AI suggestion(s) and final text in `task_complete`.
  - Low distance = high persistence (AI wrote most of it).
  - High distance = user rewrote heavily.

**Performance metrics (controls):**
- Completion, length, and blind rater quality scores (coherence, correctness, style).

**Subjective metrics:** NASA‑TLX, perceived quality, ownership ("this feels like my writing"), trust, and perceived productivity.

---

## 4. Measures From Logs Only

### 4.1 Reliance Index (per run, per LLM)

**Intuition:** How quickly and how heavily did the participant lean on the AI?

All computed from existing event logs.

| Task | Metric | Source Event |
|------|--------|--------------|
| Coding | Time to first AI help | `task_start` → `ai_chat_sent` |
| Coding | AI usage volume | Count `ai_chat_sent`, length `ai_chat_received` |
| Coding | Try‑self‑first vs AI‑first | `ai_chat_sent` before `code_edit`? |
| Puzzle | Time to first hint | `task_start` → `hint_requested` |
| Puzzle | Hint intensity | Count `hints_used` |
| Puzzle | Hint‑driven editing | `answer_edited_post_hint` after hint? |
| Writing | Time to first AI action | `task_start` → `ai_action_clicked` |
| Writing | Suggestion usage rate | `suggestion_accepted` / (`accepted` + `dismissed`) |

> **Reliance Index (per run)** = normalised combination of "how early" + "how often" AI was used, computed separately per task type. Averaged per LLM over all **non‑faulty runs**.

### 4.2 Content Persistence / Ownership (per run, per LLM)

**Intuition:** How much of the final answer is *still the AI's writing/code*?

| Task | Metric | Source |
|------|--------|--------|
| Coding | `code_persistence_pct` + `ai_line_count` | `code_run_result` / `task_complete` |
| Puzzle | Direct submission without override after hint | `answer_submitted` with `overrides=0` |
| Writing | `edit_distance_pct` (AI suggestion → final text) | `task_complete` |

> **Persistence Score (per run)** = "share of AI‑authored content that survives into the final answer." Averaged per LLM over all **non‑faulty runs**.

### 4.3 Automation Bias (participant‑level, from Faulty‑AI run)

**Intuition:** When the AI is *obviously wrong*, does the participant still follow it?

On the designated **Faulty‑AI run**:

- Task delivers a known‑wrong suggestion via `ai_solution_faulty` / `ai_reasoning_faulty`.
- Log: Did the participant submit an answer identical or very close to the faulty suggestion?
- No override or correction → high automation bias.
- Override or correct solve → not over‑reliant.

**Automation Bias Flag (binary):**
- 1 if participant followed faulty AI, 0 if they rejected/corrected it.
- **Faulty‑Follow Score**: how many faulty suggestions they followed if multiple probes are used.

This is **not used to compare models** (the faulty content is ours, not the LLM's). It is a **person characteristic** used to stratify analyses ("over‑reliant" vs "not over‑reliant").

---

## 5. Analysis Plan With New Goals

### 5.1 Per‑LLM Reliance & Persistence (3 LLMs, non‑faulty only)
- For each of the **3 non‑faulty LLMs**, aggregate:
  - Mean Reliance Index across its non‑faulty runs.
  - Mean Persistence Score across its non‑faulty runs.
- Compare the 3 LLMs with mixed‑effects models or ANOVA:
  - fixed effect: `model_id`
  - random effect: `participant_id`
  - covariates: difficulty, task type.

### 5.2 Role of Automation Bias (participant‑level, not model‑comparative)
- **Purely behavioral:** Automation Bias is a person‑level characteristic derived from the faulty‑AI probe run. It is **not** used to compare the 3 non‑faulty LLMs against each other.
- Classify each participant as **Over‑reliant** (followed faulty AI) vs **Not**.
- Use this classification to stratify the Reliance/Persistence analysis:
  - Do over‑reliant people show **especially high** persistence with some LLMs?
  - Do not‑over‑reliant people show stronger differences between models?
- The faulty‑AI run itself is **not included** in the per‑LLM Reliance or Persistence averages.

### 5.3 Performance Only as Control
- Accuracy, pass@k, correctness, and time‑to‑completion are still calculated but interpreted as *secondary*:
  - To ensure models are all "good enough" (no model is trivially worse).
  - To check that any behavioral differences are not simply because one model is completely failing.

---

## 6. What Stayed the Same vs. What Changed

**Same:**

- 4 LLMs, blind labels, OpenRouter routing.
- 3 task families; each participant sees 2 task types.
- 4 runs × 15 minutes per session with NASA‑TLX and trust/agency scales afterward.
- Rich event logging (`task_start`, `ai_chat_sent`, `hint_requested`, `task_complete`, etc.).
- Within‑subject design, counterbalancing.

**Changed:**

- **Primary question:**
  From "which LLM solves tasks best?" →
  to "how do different LLMs change human reliance, ownership, and susceptibility to automation bias?"
- **Primary outcomes:** Reliance Index, Content Persistence (comparing **3 non‑faulty LLMs**), Automation Bias (participant‑level, from faulty probe run).
- **Faulty‑AI run added and counterbalanced**; its data used **only** for Automation Bias, excluded from Reliance/Persistence comparisons.
- Performance metrics (accuracy, time, pass@k) are now **secondary/controls**, not primary outcomes.

---

## 7. Implementation Status (April 2026)

All core features are **fully implemented**:

- ✅ **Faulty‑AI probe** — implemented via standalone system prompts in all 3 task types (CodingTask, PuzzleTask, WritingTask). Random 1-of-3 run selection at session creation. `is_faulty` column on `runs` table.
- ✅ **Reliance & Persistence logging** — `code_persistence_pct`, `edit_distance_pct`, `overrides`, `hint_requested`, `ai_action_clicked`, `suggestion_accepted` all active.
- ✅ **Test/Live mode toggle** — admin panel `/htilab-nexus` routes all agents to Nemotron when test mode is on.
- ✅ **Pre‑survey mandatory fields** — age/gender validation before experiment start.
- ✅ **Reasoning disabled** — `enable_reasoning: false` on all `/api/chat` calls prevents chain-of-thought display.

**Remaining:**
- Pilot testing with participants to validate the full session flow
- Finalize counterbalancing and sample size based on pilot results

---

## 8. Why This Design?

### Why 15 Minutes per Run?
Prior programming and agent‑support studies commonly use short, focused tasks of 10–20 minutes and still observe robust differences between models and assistance modes.  **15 minutes per run** is appropriate:

- Long enough to allow at least a few interaction cycles with the agent and a reasonable attempt at the task.
- Short enough to fit **four runs plus surveys** into a 75–90 minute session without excessive fatigue.

### Why Four Premium Agents per Session?
- Within‑subject comparisons of perceived workload, trust, and usability across agents.
- Between‑agent comparisons of objective behavioral metrics under tightly matched conditions.
- Using only two agents would substantially weaken comparisons; using more than four would push session duration beyond realistic limits.

### Why Only Two Task Families per Participant?
Requiring participants to complete all three task families with four agents each would explode into multi‑hour sessions. Such long sessions risk severe fatigue and dropout.

Instead:
- Restricts each participant to **two task families** (randomly chosen) but ensures every agent is seen by every participant.
- Uses counterbalancing so that each (agent, task) pair is sampled many times across the full sample.

### Why Measure Reliance and Persistence Instead of Performance?
The original goal was to find which LLM performs best. However, the professor redirected the study to ask: **how do different LLMs change human behavior?** This is a fundamentally different — and arguably more important — HCI question. It captures trust, agency, and over‑reliance dynamics that pure accuracy metrics miss.

### Why a Faulty‑AI Probe?
Automation bias (blindly following faulty AI) is a critical risk in real-world AI-assisted workflows. By measuring it directly with a seeded wrong answer, we can:
1. Identify individuals who are "over‑reliant."
2. Test whether certain LLMs induce higher over‑reliance than others.
3. Use over‑reliance as a stratification variable in downstream analysis.

---

## References

1. [ILGC-Meet-4-3.pdf](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/32005124/0d5c3d16-022d-4532-9c3a-8990e3b4630b/ILGC-Meet-4-3.pdf) - AGENTIC AI HTI-ILGC SEM-4
2. RealHumanEval: Evaluating Large Language Models' Abilities to Support Programmers (arXiv:2404.02806)
3. Take It, Leave It, or Fix It: Measuring Productivity and Trust in Human-AI Collaboration (arXiv:2402.18498)
4. Jiya et al. - Productivity, Trust and Awareness across Levels of AI Autonomy
5. TheAgentCompany: Benchmarking LLM Agents on Consequential Real World Tasks (arXiv:2412.14161)
