# CLAUDE.md — HTI-Lab AgenticAI

## Project Overview

This is a Human-Technology Interaction (HTI) research platform for running controlled, within-subject experiments measuring **how different LLMs change human behavior** — specifically:
- **Reliance Index** (how quickly/often users reach for AI help)
- **Content Persistence / Ownership** (how much AI-authored content survives in final answers)
- **Automation Bias** (whether users follow obviously wrong AI hints)

The platform benchmarks 4 premium LLMs (GPT-5.4, Claude Sonnet 4.6, Gemini 3.1 Pro, Grok 4.20) in a blind setup across Coding, Logic Puzzle, and Writing tasks.

## Key Architecture Decisions

- **Next.js 14 (App Router)** — single codebase for participant UI and admin panel
- **SQLite via `better-sqlite3`** — dual DB: `tasks.db` (static) + `surveys.db` (session data)
- **OpenRouter** — unified API gateway for all 4 LLMs with identity blinding
- **Monaco Editor** — VS Code-grade editor for coding tasks
- **Admin panel at `/htilab-nexus`** — hidden URL, not linked from participant UI

## Important Constraints

1. **Identity Blinding** — All API calls prepend an `IDENTITY_GUARD` system prompt at the router level. Participants must never discover which model they are using.
2. **Faulty-AI Probe** — One run per session injects a pre-seeded wrong AI suggestion to measure automation bias. The `ai_solution_faulty` / `ai_reasoning_faulty` fields in `puzzle_tasks` are **now active** (updated April 2026).
3. **Performance Metrics Are Secondary** — Accuracy, time, pass@k are controls; primary outcomes are Reliance, Persistence, and Automation Bias.
4. **File Encoding** — Do NOT use PowerShell's `Set-Content` or `Out-File` for TSX/JS files with emojis. Use `node -e` or direct editor saves.

## Common Tasks

### Running the app
```bash
cd app-platform
npm install
cp .env.local.example .env.local  # Add OPENROUTER_API_KEY
node seed-full-tasks.mjs           # Seed task DB
npm run dev
# → http://localhost:3000 (participant)
# → http://localhost:3000/htilab-nexus (admin)
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
