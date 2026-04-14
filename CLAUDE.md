# CLAUDE.md — HTI-Lab AgenticAI

## Project Overview

This is a Human-Technology Interaction (HTI) research platform for running controlled, within-subject experiments measuring **how different LLMs change human behavior** — specifically:
- **Reliance Index** (how quickly/often users reach for AI help)
- **Content Persistence / Ownership** (how much AI-authored content survives in final answers)
- **Automation Bias** (whether users follow obviously wrong AI hints)

The platform benchmarks **3 premium LLMs** (GPT-5.4, Claude Sonnet 4.6, Gemini 3.1 Pro) in a blind setup across Coding, Logic Puzzle, and Writing tasks. A 4th agent slot (`test`) uses Nemotron for local testing.

## Key Architecture Decisions

- **Next.js 14 (App Router)** — single codebase for participant UI and admin panel
- **SQLite via `better-sqlite3`** — dual DB: `tasks.db` (static) + `surveys.db` (session data)
- **OpenRouter** — unified API gateway for all 4 LLMs with identity blinding
- **Monaco Editor** — VS Code-grade editor for coding tasks
- **Admin panel at `/htilab-nexus`** — hidden URL, not linked from participant UI
- **Test/Live Mode Toggle** — admin can switch all agents to Nemotron (test) or real models (live) without restart

## Important Constraints

1. **Identity Blinding** — All API calls prepend an `IDENTITY_GUARD` system prompt at the router level. Participants must never discover which model they are using.
2. **Faulty-AI Probe** — One run per session uses a deliberately wrong AI (via standalone system prompts) to measure automation bias. Analysis excludes this run for Reliance/Persistence.
3. **Reasoning Disabled** — All `/api/chat` calls use `enable_reasoning: false` to prevent chain-of-thought from being displayed to participants.
4. **Pre-Survey Mandatory Fields** — Age and gender questions (matched by keyword in question text) must be answered before proceeding.
5. **File Encoding** — Do NOT use PowerShell's `Set-Content` or `Out-File` for TSX/JS files with emojis. Use `node -e` or direct editor saves.

## Common Tasks

### Running the app
```bash
cd app-platform
npm install
cp .env.local.example .env.local  # Add both API keys (see below)
node seed-full-tasks.mjs           # Seed task DB
npm run dev
# → http://localhost:3000 (participant)
# → http://localhost:3000/htilab-nexus (admin)
```

### Environment setup
```bash
# .env.local requires two OpenRouter keys:
OPENROUTER_API_KEY=sk-or-v1-...       # Real models (GPT, Claude, Gemini)
OPENROUTER_API_KEY_TEST=sk-or-v1-...   # Nemotron (nvidia/nemotron-3-super-120b-a12b:free)

# Admin panel has a [ TEST MODE ON / LIVE MODE ] toggle that routes all
# agent_a/b/c to Nemotron when test mode is active.
```

### Key directories
- `app-platform/app/experiment/` — Main experiment flow and task components
- `app-platform/app/api/` — All API routes (sessions, tasks, logs, surveys, chat)
- `app-platform/lib/` — Router, logger, database init
- `.claude/` — Experimental protocol and project overview (source of truth, auto-read on session start)

## Git Branching

- Working branch: **`v3`**
- `.env.local` and `data/` are gitignored
- Seed scripts included for reproducibility
