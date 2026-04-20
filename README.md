# HTI-Lab AgenticAI Benchmark Platform

A comprehensive Human-Technology Interaction (HTI) research platform built to run a controlled, within-subject experiment measuring **how different state-of-the-art AI language models change human behavior** — focusing on reliance on AI, content ownership, and susceptibility to automation bias.

This project enables **blind benchmarking** of 3 different LLMs across 3 distinct task families: Coding, Logic Puzzles, and Creative Writing.

## Key Features

- **Blind Benchmarking:** Participants interact with 3 different models (GPT-5.4, Claude Sonnet 4.6, Gemini 3.1 Pro) without knowing which one they are using ("Agent A, B, or C"). An identity guard strictly prevents the models from revealing their true names.
- **Task Counterbalancing:** Pre-assigned, matched-difficulty questions ensure fairness and validity across the experiment runs without confounding agent performance with task difficulty.
- **Three Primary Behavioral Outcomes:**
  - **Reliance Index:** How quickly and how often users reach for AI help instead of trying themselves.
  - **Content Persistence:** How much of the AI's output survives in the final answer.
  - **Automation Bias:** Whether users follow obviously wrong AI hints when they shouldn't (via seeded Faulty-AI probe run).
- **Three Core Task Types:**
  - **Coding:** A Monaco-editor-powered Python IDE with task prompts and a conversational AI guide.
  - **Logic Puzzles:** A UI that tracks hint requests and reasoning logic against strict logic problems.
  - **Writing:** A rich text editor for drafting emails, blogs, or essays with intelligent structuring guidance.
- **Comprehensive Logging:** An asynchronous, completely unobtrusive logging system measuring engagement time (via a 30-second heartbeat hook), interactions, hint reliance, and task success.
- **Integrated Survey Tools:** Implements post-run NASA-TLX cognitive load index, subjective AI trust scales, and end-of-session global qualitative surveys.
- **Mandatory Pre-Survey:** Age and gender questions must be completed before the experiment begins.
- **Hidden Admin Dashboard:** A fully built-in `/htilab-nexus` admin panel for managing tasks, survey items, exporting raw experimental data (CSV), and toggling **Test/Live mode** (routes all agents to Nemotron for local testing).

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** SQLite (`better-sqlite3`) — dual database architecture (`tasks.db` for static configurations, `surveys.db` for volatile session data).
- **Styling:** Premium dark glassmorphism Vanilla CSS design system.
- **AI Gateway:** OpenRouter Unified API.

## Quick Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/your-username/HTI-Lab-AgenticAI.git
   cd HTI-Lab-AgenticAI/app-platform
   npm install
   ```

2. **Setup environment variables:**
   ```bash
   cp env.example .env.local
   # Inside .env.local, fill in your API keys:
   # OPENROUTER_API_KEY=...           # Real models (GPT, Claude, Gemini)
   # OPENROUTER_API_KEY_TEST=...      # Nemotron for test mode (free tier)
   # ONECOMPILER_API_KEY=...          # For code execution (onecompiler.com)
   ```

3. **Seed the databases:**
   ```bash
   node seed-full-tasks.mjs
   ```
   This creates `data/tasks.db` and `data/surveys.db` with all tasks and survey questions.

4. **Start the app:**
   ```bash
   npm run dev
   ```

Access the participant UI at `http://localhost:3000` and the hidden admin console at `http://localhost:3000/htilab-nexus`.

## Documentation

For full architectural transparency, rationale on engineering decisions, comprehensive database schemas, log event dictionaries, and the full experimental protocol, please refer to the `.claude/` folder (auto-read on session start):

- [`.claude/Project-Overview.md`](.claude/Project-Overview.md) — Technical index and design rationale
- [`.claude/Experimental-Protocol.md`](.claude/Experimental-Protocol.md) — Research design, research questions, constraints, and metrics
- [`.claude/faulty-ai.md`](.claude/faulty-ai.md) — Faulty-AI probe implementation (fully implemented April 2026)
- [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — AI assistance context and important constraints
