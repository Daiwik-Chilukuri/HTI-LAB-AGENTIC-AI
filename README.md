# HTI-Lab AgenticAI Benchmark Platform

A comprehensive Human-Technology Interaction (HTI) research platform built to run a controlled, within-subject experiment comparing how different state-of-the-art AI language models affect human productivity, cognitive load, and subjective experience.

This project enables **blind benchmarking** of 4 different LLMs across 3 distinct task families: Coding, Logic Puzzles, and Content Creation (Writing).

## ✨ Key Features

- **Blind Benchmarking:** Participants interact with 4 different models (e.g., GPT-5.4, Claude Sonnet 4.6, Gemini 3.1 Pro, Grok 4.20) without knowing which one they are using ("Agent A, B, C, or D"). An identity guard strictly prevents the models from revealing their true names.
- **Task Counterbalancing:** Pre-assigned, matched-difficulty questions ensure fairness and validity across the experiment runs without confounding agent performance with task difficulty.
- **Three Core Task Types:**
  - 💻 **Coding:** A Monaco-editor-powered Python IDE with task prompts and a conversational AI guide.
  - 🧩 **Logic Puzzles:** A UI that tracks hint requests and reasoning logic against strict logic problems.
  - ✍️ **Writing:** A rich text editor for drafting emails, blogs, or essays with intelligent structuring guidance.
- **Comprehensive Logging:** An asynchronous, completely unobtrusive logging system measuring engagement time (via a 30-second heartbeat hook), interactions, hint reliance, and task success.
- **Integrated Survey Tools:** Implements post-run NASA-TLX cognitive load index, subjective AI trust scales, and end-of-session global qualitative surveys.
- **Hidden Admin Dashboard:** A fully built-in `/htilab-nexus` admin panel for managing task questions, survey items, exporting raw experimental data (CSV), and viewing interaction timelines.

## 🛠 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** SQLite (`better-sqlite3`) — dual database architecture (`tasks.db` for static configurations, `surveys.db` for volatile session data).
- **Styling:** Premium dark glassmorphism Vanilla CSS design system.
- **AI Gateway:** OpenRouter Unified API.

## 🚀 Quick Setup

1. **Install dependencies:**
   ```bash
   cd app-platform
   npm install
   ```

2. **Setup environment variables:**
   Duplicate the example environment file and add your OpenRouter key:
   ```bash
   cp .env.local.example .env.local
   # Inside .env.local, fill in:
   # OPENROUTER_API_KEY=your-api-key-here
   ```

3. **Seed Database:**
   Initialize the database with the pre-vetted task pool and survey configurations (2 easy, 2 medium, 2 hard questions per task type):
   ```bash
   node seed-full-tasks.mjs
   ```

4. **Start the local server:**
   ```bash
   npm run dev
   ```

Access the participant UI at `http://localhost:3000` and the hidden admin console at `http://localhost:3000/htilab-nexus`.

## 📖 Documentation

For full architectural transparency, rationale on engineering decisions, comprehensive database schemas, log event dictionaries, and the full experimental protocol, please refer to the `docs/` folder:

- [`docs/Project-Overview.md`](./docs/Project-Overview.md) - The core technical index of our decisions.
- [`docs/Experimental-Protocol.md`](./docs/Experimental-Protocol.md) - The research design, research questions, constraints, and metrics.
- [`.agent/workflows/SKILL.md`](./.agent/workflows/SKILL.md) - Guidelines and skills learned for extending this platform.
