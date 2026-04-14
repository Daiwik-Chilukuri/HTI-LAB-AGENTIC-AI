"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────
type TaskTab    = "coding" | "puzzle" | "writing";
type ScopeTab   = "all" | "coding" | "puzzle" | "writing";
type AdminTab   = "tasks" | "tlx" | "data" | "global" | "demographic";

interface AnyTask {
  id: number; title: string; difficulty: string; created_at: string;
  description?: string; prompt?: string; [key: string]: unknown;
}

interface TlxQuestion {
  id: number;
  task_scope: ScopeTab;
  question_text: string;
  sub_label: string;
  low_label: string;
  high_label: string;
  scale_type: "likert5" | "likert7";
  scale_group: "nasa_tlx" | "ai_subjective" | "custom";
  display_order: number;
  active: number;
  built_in: number;
  created_at: string;
}

interface Participant {
  id: string; created_at: string; status: string;
}
interface Session {
  id: string; participant_id: string; task_type_a: string; task_type_b: string;
  agent_order: string; counterbalance_key: string; started_at: string;
}
interface SurveyResponse {
  id: number; run_id: string; participant_id: string; session_id: string;
  task_type: string; model_id: string; question_id: number;
  question_text: string; scale_group: string; scale_type: string; answer: number;
  submitted_at: string;
}
interface RunRecord {
  id: string; session_id: string; participant_id: string;
  run_number: number; task_type: string; task_id: number;
  model_id: string; is_faulty: number; started_at: string; completed_at: string | null;
}
interface RunStat {
  run_id: string; participant_id: string;
  total_events: number; chat_msgs_sent: number; chat_msgs_received: number;
  hints_requested: number; code_runs: number; ai_actions: number;
  suggestions_accepted: number; suggestions_dismissed: number;
  first_event: string | null; last_event: string | null;
}
interface DemographicResponse {
  id: number; participant_id: string; session_id: string;
  question_id: number; question_text: string; question_type: string;
  response_text: string; submitted_at: string;
}
interface PostStudyResponse {
  id: number; participant_id: string; session_id: string;
  question_id: number; question_text: string; question_type: string;
  response_text: string; submitted_at: string;
}
interface LogEntry {
  id: number; run_id: string; participant_id: string;
  event_type: string; event_data: string; timestamp: string;
}
interface ModelConfig {
  id: string; label: string; openrouterModel: string; hasKey: boolean;
}
interface GlobalQuestion {
  id: number; question_text: string; question_type: string;
  display_order: number; active: number; created_at: string;
}

interface DemographicQuestion {
  id: number; question_text: string; question_type: string;
  options: string; display_order: number; active: number; created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────
const SCOPE_COLOR: Record<string, string> = {
  all: "badge-teal", coding: "badge-blue", puzzle: "badge-amber", writing: "badge-emerald",
};
const SCALE_LABEL: Record<string, string> = {
  likert5: "1–5", likert7: "1–7",
};
const GROUP_LABEL: Record<string, string> = {
  nasa_tlx: "NASA-TLX", ai_subjective: "AI Subjective", custom: "Custom",
};
const TASK_CFG = {
  coding:  { color: "var(--accent-blue)",    label: "Coding Tasks" },
  puzzle:  { color: "var(--accent-amber)",   label: "Logic Puzzles" },
  writing: { color: "var(--accent-emerald)", label: "Content Creation" },
};

// ── IST timestamp formatter ─────────────────────────────────────
// SQLite datetime('now') stores UTC without 'Z' suffix → append it so
// JS parses as UTC, then display in India Standard Time (UTC+5:30)
function formatIST(raw: string | null | undefined): string {
  if (!raw) return '-';
  // Append 'Z' if not already present (SQLite stores '2026-03-21 09:28:57', no TZ)
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const utc = iso.endsWith('Z') ? iso : iso + 'Z';
  return new Date(utc).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  }) + ' IST';
}

// Log timeline display helpers
const EVENT_LABEL: Record<string, string> = {
  task_start:           "[start]",
  ai_chat_sent:         "[→]",
  ai_chat_received:     "[←]",
  hint_requested:       "[hint]",
  hint_received:        "[hint]",
  code_edit:            "[edit]",
  code_run:             "[run]",
  ai_action_clicked:    "[action]",
  suggestion_accepted:  "[ok]",
  suggestion_dismissed: "[x]",
};
const EVENT_COLOR: Record<string, string> = {
  task_start:           "var(--accent-emerald)",
  ai_chat_sent:         "var(--accent-teal)",
  ai_chat_received:     "var(--accent-blue)",
  hint_requested:       "var(--accent-amber)",
  hint_received:        "var(--accent-emerald)",
  code_run:             "var(--accent-blue)",
  ai_action_clicked:    "var(--accent-amber)",
  suggestion_accepted:  "var(--accent-emerald)",
  suggestion_dismissed: "var(--accent-rose)",
};


// ══════════════════════════════════════════════════════════════════
export default function NexusAdminPage() {
  const router = useRouter();
  const [adminTab, setAdminTab] = useState<AdminTab>("tasks");

  // ── Test mode ───────────────────────────────────────────────────
  const [forceTestModel, setForceTestModel] = useState(false);
  const [togglingTest, setTogglingTest] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.json())
      .then(d => setForceTestModel(Boolean(d.force_test_model)))
      .catch(() => {});
  }, []);

  const toggleTestMode = async () => {
    setTogglingTest(true);
    const next = !forceTestModel;
    try {
      await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force_test_model: next }),
      });
      setForceTestModel(next);
    } catch { /* silent */ }
    setTogglingTest(false);
  };

  // ── Tasks ──────────────────────────────────────────────────────
  const [taskTab, setTaskTab]       = useState<TaskTab>("coding");
  const [tasks, setTasks]           = useState<AnyTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState<Record<string, string>>({
    title: "", description: "", difficulty: "medium",
  });

  // ── TLX Questions ──────────────────────────────────────────────
  const [scopeTab, setScopeTab]     = useState<ScopeTab>("all");
  const [questions, setQuestions]   = useState<TlxQuestion[]>([]);
  const [loadingQ, setLoadingQ]     = useState(false);
  const [showQForm, setShowQForm]   = useState(false);
  const [editingQ, setEditingQ]     = useState<TlxQuestion | null>(null);
  const [qForm, setQForm] = useState({
    question_text: "", sub_label: "", low_label: "Low", high_label: "High",
    scale_type: "likert7", task_scope: "all", display_order: "99",
  });

  // ── Model configs ──────────────────────────────────────────────
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);

  // ── Post-Study Survey tab ──────────────────────────────────────
  const [globalQuestions, setGlobalQuestions] = useState<GlobalQuestion[]>([]);
  const [showGlobalForm, setShowGlobalForm]   = useState(false);
  const [globalForm, setGlobalForm]           = useState({ question_text: "", question_type: "open_ended", display_order: "99" });
  const [loadingGlobal, setLoadingGlobal]     = useState(false);

  // ── Pre-Study Survey tab ──────────────────────────────────────
  const [demographicQuestions, setDemographicQuestions] = useState<DemographicQuestion[]>([]);
  const [showDemographicForm, setShowDemographicForm]   = useState(false);
  const [demographicForm, setDemographicForm]           = useState({ question_text: "", question_type: "text", options: "", display_order: "99" });
  const [loadingDemographic, setLoadingDemographic]     = useState(false);

  // ── Data tab ───────────────────────────────────────────────────
  const [participants, setParticipants]   = useState<Participant[]>([]);
  const [allResponses, setAllResponses]   = useState<SurveyResponse[]>([]);
  const [allSessions, setAllSessions]     = useState<Session[]>([]);
  const [allRuns, setAllRuns]             = useState<RunRecord[]>([]);
  const [allRunStats, setAllRunStats]     = useState<RunStat[]>([]);
  const [allLogs, setAllLogs]             = useState<LogEntry[]>([]);
  const [allDemographicResponses, setAllDemographicResponses] = useState<DemographicResponse[]>([]);
  const [allPostStudyResponses, setAllPostStudyResponses] = useState<PostStudyResponse[]>([]);
  const [loadingData, setLoadingData]     = useState(false);
  const [expandedSurveyRuns, setExpandedSurveyRuns] = useState<Set<string>>(new Set());
  const [expandedGlobalSurvey, setExpandedGlobalSurvey] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);
  const [expandedRun, setExpandedRun]     = useState<string | null>(null);
  const [exporting, setExporting]         = useState(false);
  const [clearing, setClearing]           = useState(false);

  // ── Fetch helpers ──────────────────────────────────────────────
  // Fetch model config once on mount so we can resolve agent_id → model name
  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(d => setModelConfigs(d.models || []))
      .catch(() => {});
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const res  = await fetch(`/api/tasks?type=${taskTab}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch { setTasks([]); }
    finally { setLoadingTasks(false); }
  }, [taskTab]);

  const fetchQuestions = useCallback(async () => {
    setLoadingQ(true);
    try {
      // Fetch ALL questions (active + inactive) for admin view
      const url = scopeTab === "all"
        ? "/api/tlx-questions?active=0"
        : `/api/tlx-questions?active=0&scope=${scopeTab}`;
      const res  = await fetch(url);
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch { setQuestions([]); }
    finally { setLoadingQ(false); }
  }, [scopeTab]);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    try {
      const res  = await fetch("/api/data");
      const data = await res.json();
      setParticipants(data.participants || []);
      setAllResponses(data.responses   || []);
      setAllSessions(data.sessions     || []);
      setAllRuns(data.runs             || []);
      setAllRunStats(data.runStats     || []);
      setAllLogs(data.logs             || []);
      setAllDemographicResponses(data.demographicResponses || []);
      setAllPostStudyResponses(data.postStudyResponses || []);
    } catch { setParticipants([]); setAllResponses([]); setAllSessions([]); setAllRuns([]); setAllRunStats([]); setAllLogs([]); setAllDemographicResponses([]); setAllPostStudyResponses([]); }
    finally { setLoadingData(false); }
  }, []);

  useEffect(() => { if (adminTab === "tasks")  fetchTasks(); }, [taskTab, adminTab, fetchTasks]);
  useEffect(() => { if (adminTab === "tlx")    fetchQuestions(); }, [scopeTab, adminTab, fetchQuestions]);
  useEffect(() => { if (adminTab === "data")   fetchData(); }, [adminTab, fetchData]);

  const fetchGlobalQ = useCallback(async () => {
    setLoadingGlobal(true);
    try {
      const res  = await fetch("/api/global-survey?active=0");
      const data = await res.json();
      setGlobalQuestions(data.questions || []);
    } catch { setGlobalQuestions([]); }
    finally { setLoadingGlobal(false); }
  }, []);
  useEffect(() => { if (adminTab === "global") fetchGlobalQ(); }, [adminTab, fetchGlobalQ]);

  const fetchDemographicQ = useCallback(async () => {
    setLoadingDemographic(true);
    try {
      const res  = await fetch("/api/demographic?active=0");
      const data = await res.json();
      setDemographicQuestions(data.questions || []);
    } catch { setDemographicQuestions([]); }
    finally { setLoadingDemographic(false); }
  }, []);
  useEffect(() => { if (adminTab === "demographic") fetchDemographicQ(); }, [adminTab, fetchDemographicQ]);

  const handleCreateDemographicQ = async () => {
    if (!demographicForm.question_text.trim()) return;
    let options: string[] = [];
    if (demographicForm.question_type === "select") {
      try { options = JSON.parse(demographicForm.options); } catch { options = []; }
    }
    await fetch("/api/demographic", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _admin: true,
        question_text: demographicForm.question_text,
        question_type: demographicForm.question_type,
        options: JSON.stringify(options),
        display_order: parseInt(demographicForm.display_order) || 99,
      }),
    });
    setShowDemographicForm(false);
    setDemographicForm({ question_text: "", question_type: "text", options: "", display_order: "99" });
    fetchDemographicQ();
  };

  const handleDeleteDemographicQ = async (id: number) => {
    if (!confirm("Delete this question?")) return;
    await fetch(`/api/demographic?id=${id}`, { method: "DELETE" });
    fetchDemographicQ();
  };

  const handleToggleDemographicQ = async (q: DemographicQuestion) => {
    await fetch("/api/demographic", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: q.id, active: q.active === 1 ? 0 : 1 }),
    });
    fetchDemographicQ();
  };

  const handleCreateGlobalQ = async () => {
    if (!globalForm.question_text.trim()) return;
    await fetch("/api/global-survey", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: -1, _create: true, ...globalForm, display_order: parseInt(globalForm.display_order) || 99 }),
    });
    setShowGlobalForm(false);
    setGlobalForm({ question_text: "", question_type: "open_ended", display_order: "99" });
    fetchGlobalQ();
  };

  const handleDeleteGlobalQ = async (id: number) => {
    if (!confirm("Delete this global survey question?")) return;
    await fetch(`/api/global-survey?id=${id}`, { method: "DELETE" });
    fetchGlobalQ();
  };

  const handleToggleGlobalQ = async (q: GlobalQuestion) => {
    await fetch("/api/global-survey", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: q.id, active: q.active === 1 ? 0 : 1 }),
    });
    fetchGlobalQ();
  };

  // ── Task CRUD ──────────────────────────────────────────────────
  const handleCreateTask = async () => {
    const body: Record<string, unknown> = { type: taskTab, title: taskForm.title, difficulty: taskForm.difficulty };
    if (taskTab === "coding") {
      body.description = taskForm.description;
      body.function_signature = taskForm.function_signature || "";
      body.starter_code = taskForm.starter_code || "";
      try { body.unit_tests = JSON.parse(taskForm.unit_tests || "[]"); } catch { body.unit_tests = []; }
    } else if (taskTab === "puzzle") {
      body.prompt = taskForm.description; body.correct_solution = taskForm.correct_solution || "";
      body.explanation = taskForm.explanation || "";
      try { body.elements = JSON.parse(taskForm.elements || "[]"); } catch { body.elements = []; }
      try { body.hints = JSON.parse(taskForm.hints || "[]"); } catch { body.hints = []; }
      body.ai_solution_correct = taskForm.ai_solution_correct || "";
      body.ai_reasoning_correct = taskForm.ai_reasoning_correct || "";
      body.ai_solution_faulty = taskForm.ai_solution_faulty || "";
      body.ai_reasoning_faulty = taskForm.ai_reasoning_faulty || "";
    } else {
      body.prompt = taskForm.description; body.genre = taskForm.genre || "general";
      body.word_count_target = parseInt(taskForm.word_count_target || "300");
    }
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setShowTaskForm(false); setTaskForm({ title: "", description: "", difficulty: "medium" }); fetchTasks();
  };
  const handleDeleteTask = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tasks?type=${taskTab}&id=${id}`, { method: "DELETE" }); fetchTasks();
  };

  // ── TLX CRUD ──────────────────────────────────────────────────
  const handleCreateQ = async () => {
    if (!qForm.question_text.trim()) return;
    await fetch("/api/tlx-questions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...qForm, display_order: parseInt(qForm.display_order) || 99 }),
    });
    setShowQForm(false); resetQForm(); fetchQuestions();
  };
  const handleSaveEditQ = async () => {
    if (!editingQ) return;
    await fetch("/api/tlx-questions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingQ.id, question_text: editingQ.question_text, sub_label: editingQ.sub_label, low_label: editingQ.low_label, high_label: editingQ.high_label, scale_type: editingQ.scale_type, task_scope: editingQ.task_scope, display_order: editingQ.display_order }),
    });
    setEditingQ(null); fetchQuestions();
  };
  const handleToggleQ = async (q: TlxQuestion) => {
    await fetch("/api/tlx-questions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: q.id, active: q.active === 1 ? 0 : 1 }),
    }); fetchQuestions();
  };
  const handleDeleteQ = async (id: number) => {
    if (!confirm("Delete this question permanently?")) return;
    await fetch(`/api/tlx-questions?id=${id}`, { method: "DELETE" }); fetchQuestions();
  };
  const resetQForm = () => setQForm({ question_text: "", sub_label: "", low_label: "Low", high_label: "High", scale_type: "likert7", task_scope: "all", display_order: "99" });

  // ── Export ─────────────────────────────────────────────────────
  const handleExport = async (participantId?: string) => {
    setExporting(true);
    const url = participantId ? `/api/data?export=csv&participant_id=${participantId}` : "/api/data?export=csv";
    const res = await fetch(url);
    const blob = await res.blob();
    const filename = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || "export.csv";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    setExporting(false);
  };

  // ── Clear session data ─────────────────────────────────────────
  const handleClearData = async () => {
    if (clearConfirmText !== 'DELETE') return;
    if (!confirm('⚠️ This will permanently delete ALL participant sessions, runs, survey responses, demographic responses, and interaction logs.\n\nTLX questions and task definitions will be preserved.\n\nAre you absolutely sure?')) return;
    setClearing(true);
    try {
      const res  = await fetch('/api/data?confirm=yes', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { await fetchData(); setClearConfirmText(''); }
      else { alert('Error clearing data: ' + data.error); }
    } catch { alert('Network error while clearing data.'); }
    finally { setClearing(false); }
  };

  const responsesForParticipant = (pid: string) => allResponses.filter(r => r.participant_id === pid);
  const sessionsForParticipant  = (pid: string) => allSessions.filter(s => s.participant_id === pid);
  const runsForParticipant      = (pid: string) => allRuns.filter(r => r.participant_id === pid);
  const statForRun              = (rid: string) => allRunStats.find(s => s.run_id === rid);
  const logsForRun              = (rid: string) => allLogs.filter(l => l.run_id === rid);
  const demographicResponsesForParticipant = (pid: string) => allDemographicResponses.filter(d => d.participant_id === pid);

  // Resolve agent_id (e.g. 'agent_a') to full model name (e.g. 'openai/gpt-4o')
  const resolveModelName = (agentId: string): string => {
    const cfg = modelConfigs.find(m => m.id === agentId);
    return cfg ? cfg.openrouterModel : agentId;
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: "100vh", padding: 24 }}>
      <div className="container">

        {/* Header */}
        <div className="page-header flex items-center justify-between">
          <div>
            <h1>
              <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.55em", letterSpacing: "0.1em" }}>
                /htilab-nexus
              </span>
              <br />
              Control Panel
            </h1>
            <p>HTI-Lab AgenticAI - Researcher Tools</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className={`btn btn-sm ${forceTestModel ? "btn-danger" : "btn-secondary"}`}
              onClick={toggleTestMode}
              disabled={togglingTest}
              title={forceTestModel ? "Currently routing ALL models to Nemotron (test key)" : "Currently routing to real models (GPT / Claude / Gemini)"}
            >
              {togglingTest ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving...</> : forceTestModel ? "[ TEST MODE ON ]" : "[ LIVE MODE ]"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => router.push("/")}>← Exit</button>
          </div>
        </div>

        {/* Top-level admin tabs */}
        <div className="tabs" style={{ marginBottom: 32, maxWidth: 520 }}>
          <button className={`tab ${adminTab === "tasks" ? "active" : ""}`} onClick={() => setAdminTab("tasks")}>
            Task Database
          </button>
          <button className={`tab ${adminTab === "tlx" ? "active" : ""}`} onClick={() => setAdminTab("tlx")}>
            Survey Questions
          </button>
          <button className={`tab ${adminTab === "data" ? "active" : ""}`} onClick={() => setAdminTab("data")}>
            Data &amp; Export
          </button>
          <button className={`tab ${adminTab === "global" ? "active" : ""}`} onClick={() => setAdminTab("global")}>
            Post-Study Survey
          </button>
          <button className={`tab ${adminTab === "demographic" ? "active" : ""}`} onClick={() => setAdminTab("demographic")}
            style={{ flexDirection: "column", alignItems: "center", whiteSpace: "nowrap" }}>
            Pre-Study<br />Survey
          </button>
        </div>

        {/* ══╡ TASKS TAB ╞════════════════════════════════════════════ */}
        {adminTab === "tasks" && (
          <>
            <div className="tabs" style={{ marginBottom: 24 }}>
              {(["coding", "puzzle", "writing"] as TaskTab[]).map(t => (
                <button key={t} className={`tab ${taskTab === t ? "active" : ""}`}
                  onClick={() => { setTaskTab(t); setShowTaskForm(false); }}>
                  {TASK_CFG[t].icon} {TASK_CFG[t].label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: "1.5rem" }}>{TASK_CFG[taskTab].icon}</span>
                <h2 style={{ color: TASK_CFG[taskTab].color }}>{TASK_CFG[taskTab].label}</h2>
                <span className="badge badge-teal">{tasks.length} tasks</span>
              </div>
              <button className="btn btn-primary" onClick={() => setShowTaskForm(!showTaskForm)}>
                {showTaskForm ? "Cancel" : "+ Add Task"}
              </button>
            </div>

            {/* Creation form */}
            {showTaskForm && (
              <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
                <h3 style={{ marginBottom: 16 }}>New {taskTab.charAt(0).toUpperCase() + taskTab.slice(1)} Task</h3>
                <div className="flex flex-col gap-4">
                  <div><label className="label">Title</label>
                    <input className="input" placeholder="Task title" value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} /></div>
                  <div><label className="label">{taskTab === "coding" ? "Description" : "Prompt"}</label>
                    <textarea className="input" rows={5} placeholder="Task description / puzzle prompt / writing brief…" value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <div className="grid-2">
                    <div><label className="label">Difficulty</label>
                      <select className="input" value={taskForm.difficulty} onChange={e => setTaskForm(p => ({ ...p, difficulty: e.target.value }))}>
                        <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                      </select></div>
                    {taskTab === "coding" && <div><label className="label">Function Signature</label><input className="input" placeholder="def solution(n: int) -> int:" value={taskForm.function_signature || ""} onChange={e => setTaskForm(p => ({ ...p, function_signature: e.target.value }))} /></div>}
                    {taskTab === "puzzle" && <div><label className="label">Correct Solution</label><input className="input" placeholder="Aman, Bhavya, Chitra…" value={taskForm.correct_solution || ""} onChange={e => setTaskForm(p => ({ ...p, correct_solution: e.target.value }))} /></div>}
                    {taskTab === "writing" && <><div><label className="label">Genre</label><input className="input" placeholder="blog, email, essay…" value={taskForm.genre || ""} onChange={e => setTaskForm(p => ({ ...p, genre: e.target.value }))} /></div>
                      <div><label className="label">Word Count Target</label><input className="input" type="number" value={taskForm.word_count_target || "300"} onChange={e => setTaskForm(p => ({ ...p, word_count_target: e.target.value }))} /></div></>}
                  </div>
                  {taskTab === "coding" && (
                    <div><label className="label">Unit Tests (JSON array of strings)</label>
                      <textarea className="input" rows={3} placeholder={'["assert solution(5) == 15"]'} value={taskForm.unit_tests || ""} onChange={e => setTaskForm(p => ({ ...p, unit_tests: e.target.value }))} style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} /></div>
                  )}
                  {taskTab === "puzzle" && (<>
                    <div><label className="label">Elements (JSON array)</label>
                      <input className="input" placeholder='["Aman", "Bhavya", "Chitra"]' value={taskForm.elements || ""} onChange={e => setTaskForm(p => ({ ...p, elements: e.target.value }))} style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} /></div>
                    <div><label className="label">Hints (JSON array of hint strings)</label>
                      <textarea className="input" rows={3} placeholder={'["Hint 1…", "Hint 2…"]'} value={taskForm.hints || ""} onChange={e => setTaskForm(p => ({ ...p, hints: e.target.value }))} style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} /></div>
                    <div className="grid-2">
                      <div><label className="label">AI Solution (Correct)</label><input className="input" placeholder="A, B, C, D" value={taskForm.ai_solution_correct || ""} onChange={e => setTaskForm(p => ({ ...p, ai_solution_correct: e.target.value }))} /></div>
                      <div><label className="label">AI Solution (Faulty)</label><input className="input" placeholder="A, C, B, D" value={taskForm.ai_solution_faulty || ""} onChange={e => setTaskForm(p => ({ ...p, ai_solution_faulty: e.target.value }))} /></div>
                    </div>
                  </>)}
                  <button className="btn btn-primary" onClick={handleCreateTask}>Create Task</button>
                </div>
              </div>
            )}

            {/* Task list */}
            {loadingTasks ? (
              <div style={{ textAlign: "center", padding: 60 }}><span className="spinner" style={{ width: 28, height: 28, margin: "0 auto", display: "block" }} /></div>
            ) : tasks.length === 0 ? (
              <div className="glass-card" style={{ padding: 60, textAlign: "center" }}>
                <div style={{ marginBottom: 12 }}>[-]</div>
                <h3 style={{ color: "var(--text-secondary)", marginBottom: 4 }}>No tasks yet</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>The database is empty and ready for content.</p>
              </div>
            ) : (
              <div className="grid-3">
                {tasks.map(task => (
                  <div key={task.id} className="glass-card" style={{ padding: 20 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                      <span className={`badge ${task.difficulty === "easy" ? "badge-emerald" : task.difficulty === "hard" ? "badge-rose" : "badge-amber"}`}>{task.difficulty}</span>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTask(task.id)}>X</button>
                    </div>
                    <h4 style={{ marginBottom: 8 }}>{task.title}</h4>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>
                      {(task.description || task.prompt || "") as string}
                    </p>
                    <p style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: 12, fontFamily: "var(--font-mono)" }}>
                      ID: {task.id} · {formatIST(task.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══╡ TLX QUESTIONS TAB ╞════════════════════════════════════ */}
        {adminTab === "tlx" && (
          <>
            <div style={{ padding: "14px 20px", background: "rgba(45, 212, 191, 0.06)", border: "1px solid rgba(45, 212, 191, 0.15)", borderRadius: "var(--radius-md)", marginBottom: 24 }}>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                <strong style={{ color: "var(--accent-teal)" }}>Built-in questions</strong> (NASA-TLX & AI Subjective) appear in every session, they can be toggled off but not deleted or edited.
                <strong style={{ color: "var(--accent-amber)" }}> Custom questions</strong> are fully editable. Filter by task scope to see what appears per task type.
              </p>
            </div>

            {/* Scope tabs — same pattern as Task tabs */}
            <div className="tabs" style={{ marginBottom: 24 }}>
              {(["all", "coding", "puzzle", "writing"] as ScopeTab[]).map(s => (
                <button key={s} className={`tab ${scopeTab === s ? "active" : ""}`}
                  onClick={() => { setScopeTab(s); setShowQForm(false); setEditingQ(null); }}>
                  {s === "all" ? "All" : `${TASK_CFG[s as TaskTab].label}`}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
              <div className="flex items-center gap-3">
                <h2>Survey Questions</h2>
                <span className="badge badge-teal">{questions.length} shown</span>
                <span className="badge badge-emerald">{questions.filter(q => q.active).length} active</span>
                <span className="badge badge-blue">{questions.filter(q => q.built_in).length} built-in</span>
              </div>
              <button className="btn btn-primary" onClick={() => { setShowQForm(!showQForm); setEditingQ(null); }}>
                {showQForm ? "Cancel" : "+ Add Custom"}
              </button>
            </div>

            {/* Create form */}
            {showQForm && (
              <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24 }}>
                <h3 style={{ marginBottom: 16 }}>New Custom Question</h3>
                <div className="flex flex-col gap-4">
                  <div><label className="label">Question Text</label>
                    <textarea className="input" rows={2} placeholder='"How well did the AI understand the context?"' value={qForm.question_text} onChange={e => setQForm(p => ({ ...p, question_text: e.target.value }))} /></div>
                  <div><label className="label">Sub-label / Description (optional)</label>
                    <input className="input" placeholder="Shown below the question text" value={qForm.sub_label} onChange={e => setQForm(p => ({ ...p, sub_label: e.target.value }))} /></div>
                  <div className="grid-2">
                    <div><label className="label">Task Scope</label>
                      <select className="input" value={qForm.task_scope} onChange={e => setQForm(p => ({ ...p, task_scope: e.target.value }))}>
                        <option value="all">All tasks</option><option value="coding">Coding only</option><option value="puzzle">Puzzles only</option><option value="writing">Writing only</option>
                      </select></div>
                    <div><label className="label">Scale</label>
                      <select className="input" value={qForm.scale_type} onChange={e => setQForm(p => ({ ...p, scale_type: e.target.value }))}>
                        <option value="likert7">1 – 7 (Likert)</option><option value="likert5">1 – 5 (Likert)</option>
                      </select></div>
                    <div><label className="label">Low-end Label</label>
                      <input className="input" placeholder="Not at all" value={qForm.low_label} onChange={e => setQForm(p => ({ ...p, low_label: e.target.value }))} /></div>
                    <div><label className="label">High-end Label</label>
                      <input className="input" placeholder="Extremely" value={qForm.high_label} onChange={e => setQForm(p => ({ ...p, high_label: e.target.value }))} /></div>
                    <div><label className="label">Display Order</label>
                      <input className="input" type="number" min={0} value={qForm.display_order} onChange={e => setQForm(p => ({ ...p, display_order: e.target.value }))} /></div>
                  </div>
                  <button className="btn btn-primary" onClick={handleCreateQ} disabled={!qForm.question_text.trim()}>Save Question</button>
                </div>
              </div>
            )}

            {/* Edit form (inline) */}
            {editingQ && (
              <div className="glass-card fade-in" style={{ padding: 24, marginBottom: 24, borderColor: "var(--accent-amber)", borderWidth: 1 }}>
                <h3 style={{ marginBottom: 16, color: "var(--accent-amber)" }}>Editing Question #{editingQ.id}</h3>
                <div className="flex flex-col gap-4">
                  <div><label className="label">Question Text</label>
                    <textarea className="input" rows={2} value={editingQ.question_text} onChange={e => setEditingQ(p => p ? { ...p, question_text: e.target.value } : p)} /></div>
                  <div><label className="label">Sub-label</label>
                    <input className="input" value={editingQ.sub_label} onChange={e => setEditingQ(p => p ? { ...p, sub_label: e.target.value } : p)} /></div>
                  <div className="grid-2">
                    <div><label className="label">Task Scope</label>
                      <select className="input" value={editingQ.task_scope} onChange={e => setEditingQ(p => p ? { ...p, task_scope: e.target.value as ScopeTab } : p)}>
                        <option value="all">All</option><option value="coding">Coding</option><option value="puzzle">Puzzle</option><option value="writing">Writing</option>
                      </select></div>
                    <div><label className="label">Scale</label>
                      <select className="input" value={editingQ.scale_type} onChange={e => setEditingQ(p => p ? { ...p, scale_type: e.target.value as TlxQuestion["scale_type"] } : p)}>
                        <option value="likert7">1 – 7</option><option value="likert5">1 – 5</option>
                      </select></div>
                    <div><label className="label">Low Label</label><input className="input" value={editingQ.low_label} onChange={e => setEditingQ(p => p ? { ...p, low_label: e.target.value } : p)} /></div>
                    <div><label className="label">High Label</label><input className="input" value={editingQ.high_label} onChange={e => setEditingQ(p => p ? { ...p, high_label: e.target.value } : p)} /></div>
                    <div><label className="label">Display Order</label><input className="input" type="number" value={editingQ.display_order} onChange={e => setEditingQ(p => p ? { ...p, display_order: parseInt(e.target.value) || 0 } : p)} /></div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-primary" onClick={handleSaveEditQ}>Save Changes</button>
                    <button className="btn btn-ghost" onClick={() => setEditingQ(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Question list */}
            {loadingQ ? (
              <div style={{ textAlign: "center", padding: 60 }}><span className="spinner" style={{ width: 28, height: 28, margin: "0 auto", display: "block" }} /></div>
            ) : questions.length === 0 ? (
              <div className="glass-card" style={{ padding: 60, textAlign: "center" }}>
                <div style={{ marginBottom: 12 }}>[-]</div>
                <h3 style={{ color: "var(--text-secondary)" }}>No questions for this scope</h3>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {questions.map(q => (
                  <div key={q.id} className="glass-card" style={{ padding: "16px 20px", opacity: q.active ? 1 : 0.45, transition: "opacity 0.25s" }}>
                    <div className="flex items-center justify-between">
                      <div style={{ flex: 1, minWidth: 0, marginRight: 16 }}>
                        <div className="flex items-center gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
                          <span className={`badge ${SCOPE_COLOR[q.task_scope]}`}>{q.task_scope}</span>
                          <span className="badge badge-blue">{GROUP_LABEL[q.scale_group]}</span>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{SCALE_LABEL[q.scale_type]}</span>
                          {q.built_in  ? <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "1px 6px" }}>[locked] built-in</span> : null}
                          {!q.active   ? <span className="badge badge-rose">off</span> : null}
                          <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>order: {q.display_order}</span>
                        </div>
                        <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: q.sub_label ? 2 : 0 }}>{q.question_text}</p>
                        {q.sub_label && <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{q.sub_label}</p>}
                        <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4 }}>{q.low_label} ← → {q.high_label}</p>
                      </div>
                      <div className="flex gap-2" style={{ flexShrink: 0 }}>
                        <button className={`btn btn-sm ${q.active ? "btn-secondary" : "btn-primary"}`} onClick={() => handleToggleQ(q)}>
                          {q.active ? "Off" : "On"}
                        </button>
                        {!q.built_in && (
                          <>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setEditingQ(q); setShowQForm(false); }}>Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteQ(q.id)}>X</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══╡ DATA & EXPORT TAB ╞════════════════════════════════════ */}
        {adminTab === "data" && (
          <>
            {/* Stats bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Participants",         value: participants.length,            color: "var(--accent-teal)" },
                { label: "Sessions",             value: allSessions.length,              color: "var(--accent-blue)" },
                { label: "Runs",               value: allRuns.length,                  color: "var(--accent-amber)" },
                { label: "Survey Responses",    value: allResponses.length,             color: "var(--accent-emerald)" },
                { label: "Demographic",         value: allDemographicResponses.length,  color: "var(--accent-violet)" },
                { label: "Interaction Events", value: allLogs.length,                  color: "var(--accent-rose)" },
              ].map(stat => (
                <div key={stat.label} className="glass-card" style={{ padding: "14px 16px", textAlign: "center" }}>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: stat.color, fontFamily: "var(--font-mono)" }}>{stat.value}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between" style={{ marginBottom: 16, padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={() => handleExport()} disabled={exporting}>
                  {exporting ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Exporting...</> : "Export CSV"}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={fetchData} disabled={loadingData}>
                  Refresh
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input"
                  type="text"
                  placeholder='Type DELETE to confirm'
                  value={clearConfirmText}
                  onChange={e => setClearConfirmText(e.target.value.toUpperCase())}
                  style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", width: 220, textTransform: "uppercase" }}
                />
                <button className="btn btn-danger btn-sm" onClick={handleClearData} disabled={clearing || participants.length === 0 || clearConfirmText !== 'DELETE'}>
                  {clearing ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Clearing...</> : "Clear Session Data"}
                </button>
              </div>
            </div>

            {/* Model config summary – always visible so you know what's active */}
            {modelConfigs.length > 0 && (
              <div className="glass-card" style={{ padding: "14px 20px", marginBottom: 20 }}>
                <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Active Model Assignments</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
                  {modelConfigs.filter(m => m.id !== 'test' && m.id !== 'agent_d').map(m => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", border: `1px solid ${m.hasKey ? "rgba(45,212,191,0.2)" : "var(--border-subtle)"}` }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.hasKey ? "var(--accent-emerald)" : "var(--text-dim)", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase" }}>{m.label}</div>
                        <div style={{ fontSize: "0.75rem", color: m.hasKey ? "var(--accent-teal)" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{m.openrouterModel}</div>
                      </div>
                      {!m.hasKey && <span style={{ fontSize: "0.65rem", color: "var(--accent-amber)", marginLeft: "auto" }}>test fallback</span>}
                    </div>
                  ))}
                </div>
                {modelConfigs.find(m => m.id === 'test') && (
                  <p style={{ fontSize: "0.68rem", color: "var(--text-dim)", marginTop: 8 }}>
                    Test fallback: <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent-amber)" }}>{modelConfigs.find(m => m.id === 'test')?.openrouterModel}</span> - used when no real key is set for an agent
                  </p>
                )}
              </div>
            )}

            {loadingData ? (
              <div style={{ textAlign: "center", padding: 80 }}><span className="spinner" style={{ width: 32, height: 32, margin: "0 auto", display: "block" }} /></div>
            ) : participants.length === 0 ? (
              <div className="glass-card" style={{ padding: 60, textAlign: "center" }}>
                <div style={{ marginBottom: 12, color: "var(--text-dim)", fontSize: "2rem" }}>[-]</div>
                <h3 style={{ color: "var(--text-secondary)" }}>No data yet</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Data will appear here after participants complete sessions.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {participants.map(p => {
                  const sessions  = sessionsForParticipant(p.id);
                  const responses = responsesForParticipant(p.id);
                  const runs      = runsForParticipant(p.id);
                  const demoResponses = demographicResponsesForParticipant(p.id);
                  const expanded  = expandedParticipant === p.id;
                  const totalEvents = allRunStats.filter(s => s.participant_id === p.id).reduce((acc,s) => acc + (s.total_events||0), 0);

                  return (
                    <div key={p.id} className="glass-card" style={{ overflow: "hidden" }}>
                      {/* Participant header */}
                      <div className="flex items-center justify-between"
                        style={{ padding: "16px 20px", cursor: "pointer" }}
                        onClick={() => { setExpandedParticipant(expanded ? null : p.id); setExpandedRun(null); }}>
                        <div className="flex items-center gap-3">
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent-teal)", fontSize: "1rem" }}>{p.id}</span>
                          <span className={`badge ${p.status === "completed" ? "badge-emerald" : "badge-amber"}`}>{p.status}</span>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
                          <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>{responses.length} survey responses</span>
                          <span style={{ fontSize: "0.78rem", color: "var(--accent-emerald)" }}>{demoResponses.length} demographic</span>
                          <span style={{ fontSize: "0.78rem", color: "var(--accent-rose)" }}>{totalEvents} events</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{formatIST(p.created_at)}</span>
                          <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); handleExport(p.id); }}>CSV</button>
                          <span style={{ color: "var(--text-dim)" }}>{expanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Expanded body */}
                      {expanded && (
                        <div style={{ borderTop: "1px solid var(--border-subtle)", background: "rgba(0,0,0,0.18)" }}>

                          {/* ── Demographic responses ─────────────────────────── */}
                          {demoResponses.length > 0 && (
                            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
                              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Pre-Study Survey Responses</p>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
                                {demoResponses.map(dr => (
                                  <div key={dr.id} style={{ padding: "8px 12px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                    <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: 2 }}>{dr.question_text}</div>
                                    <div style={{ fontSize: "0.85rem", color: "var(--accent-teal)", fontWeight: 600 }}>
                                      {dr.response_text || <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>no response</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ── Per-run stats cards ───────────────────────────── */}
                          {runs.length > 0 && (
                            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
                              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Runs &amp; Interaction Logs</p>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
                                {runs.map(run => {
                                  const stat = statForRun(run.id);
                                  const logs = logsForRun(run.id);
                                  const runExpanded = expandedRun === run.id;
                                  const duration = stat?.first_event && stat?.last_event
                                    ? Math.round((new Date(stat.last_event).getTime() - new Date(stat.first_event).getTime()) / 1000)
                                    : null;

                                  return (
                                    <div key={run.id} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                                      {/* Run header */}
                                      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <div className="flex items-center gap-2">
                                          <span className={`badge ${run.task_type === "coding" ? "badge-blue" : run.task_type === "puzzle" ? "badge-amber" : "badge-emerald"}`}>
                                            {run.task_type}
                                          </span>
                                          <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>Run #{run.run_number}</span>
                                          {run.is_faulty === 1 && (
                                            <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: "rgba(239, 68, 68, 0.15)", color: "var(--accent-rose)", border: "1px solid rgba(239, 68, 68, 0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                              FAULTY
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{run.model_id}</div>
                                          <div style={{ fontSize: "0.7rem", color: "var(--accent-teal)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{resolveModelName(run.model_id)}</div>
                                        </div>
                                      </div>

                                      {/* Run summary row */}
                                      {stat ? (
                                        <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                                            {(() => {
                                              const eventTypes: string[] = [];
                                              if ((stat.chat_msgs_sent as number) > 0) eventTypes.push("chat");
                                              if ((stat.hints_requested as number) > 0) eventTypes.push("hints");
                                              if ((stat.code_runs as number) > 0) eventTypes.push("code runs");
                                              if ((stat.ai_actions as number) > 0) eventTypes.push("AI actions");
                                              if ((stat.suggestions_accepted as number) > 0 || (stat.suggestions_dismissed as number) > 0) eventTypes.push("suggestions");
                                              if (eventTypes.length === 0) eventTypes.push("no events");
                                              return eventTypes.map(et => (
                                                <span key={et} style={{ fontSize: "0.7rem", padding: "2px 7px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", color: "var(--text-dim)", border: "1px solid var(--border-subtle)" }}>
                                                  {et}
                                                </span>
                                              ));
                                            })()}
                                          </div>
                                          <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
                                            <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{stat.total_events} events</span>
                                            {duration !== null && <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>~{duration}s</span>}
                                          </div>
                                        </div>
                                      ) : (
                                        <div style={{ padding: "8px 14px", fontSize: "0.78rem", color: "var(--text-dim)" }}>No interaction data</div>
                                      )}

                                      {/* Unique event types toggle */}
                                      {logs.length > 0 && (
                                        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                                          <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ width: "100%", borderRadius: 0, fontSize: "0.72rem", color: "var(--text-dim)" }}
                                            onClick={() => setExpandedRun(runExpanded ? null : run.id)}
                                          >
                                            {runExpanded ? "Hide event types" : `View ${logs.length} event types`}
                                          </button>
                                          {runExpanded && (
                                            <div style={{ padding: "6px 14px 10px", maxHeight: 160, overflowY: "auto" }}>
                                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                {[...new Set(logs.map(l => l.event_type))].sort().map(et => (
                                                  <div key={et} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 8px", background: "var(--bg-tertiary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", gap: 8 }}>
                                                    <span style={{ fontSize: "0.72rem", color: EVENT_COLOR[et] || "var(--text-secondary)" }}>
                                                      {EVENT_LABEL[et] || "-"} {et}
                                                    </span>
                                                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                                                      ×{logs.filter(l => l.event_type === et).length}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* ── Survey responses — per-run all 11 questions ─────── */}
                          {runs.map(run => {
                            const runResponses = responses.filter(r => r.run_id === run.id);
                            const nasaResponses = runResponses.filter(r => r.scale_group === 'nasa_tlx');
                            const aiResponses  = runResponses.filter(r => r.scale_group === 'ai_subjective');
                            if (runResponses.length === 0) return null;
                            const isOpen = expandedSurveyRuns.has(run.id);
                            return (
                              <div key={run.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
                                <button
                                  className="flex items-center justify-between"
                                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 0", gap: 12 }}
                                  onClick={() => {
                                    setExpandedSurveyRuns(prev => {
                                      const next = new Set(prev);
                                      if (next.has(run.id)) next.delete(run.id);
                                      else next.add(run.id);
                                      return next;
                                    });
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                      Run #{run.run_number}
                                    </span>
                                    <span className={`badge ${run.task_type === "coding" ? "badge-blue" : run.task_type === "puzzle" ? "badge-amber" : "badge-emerald"}`}>
                                      {run.task_type}
                                    </span>
                                    <span style={{ fontSize: "0.7rem", color: "var(--accent-teal)", fontFamily: "var(--font-mono)" }}>{resolveModelName(run.model_id)}</span>
                                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{nasaResponses.length} NASA-TLX · {aiResponses.length} AI Sub</span>
                                  </div>
                                  <span style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{isOpen ? "▲" : "▼"}</span>
                                </button>
                                {isOpen && (
                                  <div style={{ marginTop: 10, background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                                    {nasaResponses.length > 0 && (
                                      <>
                                        <div style={{ padding: "5px 12px", background: "rgba(0,0,0,0.15)", fontSize: "0.65rem", fontWeight: 700, color: "var(--accent-blue)", textTransform: "uppercase", letterSpacing: "0.06em" }}>NASA-TLX</div>
                                        {nasaResponses.map(r => (
                                          <div key={r.id} className="flex items-center justify-between" style={{ padding: "7px 12px", borderBottom: "1px solid var(--border-subtle)", gap: 12 }}>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 1 }}>{r.sub_label}</div>
                                              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{r.question_text}</div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                              <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>{r.low_label}</span>
                                              <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--accent-teal)", fontFamily: "var(--font-mono)", minWidth: 24, textAlign: "center" }}>{r.answer}</span>
                                              <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>/ 7</span>
                                              <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>{r.high_label}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                    {aiResponses.length > 0 && (
                                      <>
                                        <div style={{ padding: "5px 12px", background: "rgba(0,0,0,0.15)", fontSize: "0.65rem", fontWeight: 700, color: "var(--accent-emerald)", textTransform: "uppercase", letterSpacing: "0.06em" }}>AI Subjective</div>
                                        {aiResponses.map(r => (
                                          <div key={r.id} className="flex items-center justify-between" style={{ padding: "7px 12px", borderBottom: "1px solid var(--border-subtle)", gap: 12 }}>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginBottom: 1 }}>{r.sub_label}</div>
                                              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{r.question_text}</div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                              <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>{r.low_label}</span>
                                              <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--accent-teal)", fontFamily: "var(--font-mono)", minWidth: 24, textAlign: "center" }}>{r.answer}</span>
                                              <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>/ 7</span>
                                              <span style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>{r.high_label}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* ── Post-Study Survey responses ────────────────────────── */}
                          {allPostStudyResponses.length > 0 && (
                            <div style={{ padding: "14px 20px" }}>
                              <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Post-Study Survey Responses</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {[...new Map(allPostStudyResponses.map(r => [r.question_id, r])).values()].map(r => {
                                  const sessionDebrief = allPostStudyResponses.filter(d => d.question_id === r.question_id && d.participant_id === p.id);
                                  return (
                                    <div key={r.id} style={{ padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                      <div style={{ fontSize: "0.72rem", color: "var(--accent-teal)", fontWeight: 600, marginBottom: 6 }}>Q{r.question_id}: {r.question_text}</div>
                                      {sessionDebrief.map(d => (
                                        <div key={d.id} style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: 4 }}>
                                          {d.response_text || <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>no response</span>}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {responses.length === 0 && runs.length === 0 && (
                            <p style={{ padding: 20, color: "var(--text-dim)", fontSize: "0.85rem" }}>No session or response data yet.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Post-Study Survey Tab */}
        {adminTab === 'global' && (
          <>
            <div className='glass-card' style={{ padding: '16px 20px', marginBottom: 20, borderLeft: '3px solid var(--accent-blue)' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--accent-teal)' }}>Post-Study Survey</strong> - open-ended questions shown to participants after all 3 runs and NASA-TLX surveys are complete.
                Use for comparative debrief and qualitative impressions. These are not per-task.
              </p>
            </div>
            <div className='flex items-center justify-between' style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>
                Debrief Questions
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                  ({globalQuestions.filter(q => q.active).length} active)
                </span>
              </h3>
              <button className='btn btn-primary btn-sm' onClick={() => setShowGlobalForm(v => !v)}>
                {showGlobalForm ? 'Cancel' : '+ Add Question'}
              </button>
            </div>

            {showGlobalForm && (
              <div className='glass-card fade-in' style={{ padding: 20, marginBottom: 20 }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                  New Global Question
                </p>
                <div className='flex flex-col gap-3'>
                  <div>
                    <label className='label'>Question Text *</label>
                    <textarea className='input' rows={3}
                      placeholder='e.g. Which AI assistant felt most natural to collaborate with, and why?'
                      value={globalForm.question_text}
                      onChange={e => setGlobalForm(f => ({ ...f, question_text: e.target.value }))}
                      style={{ fontFamily: 'var(--font-sans)', fontSize: '0.88rem', lineHeight: 1.6 }}
                    />
                  </div>
                  <div className='flex gap-3'>
                    <div style={{ flex: 1 }}>
                      <label className='label'>Question Type</label>
                      <select className='input' value={globalForm.question_type}
                        onChange={e => setGlobalForm(f => ({ ...f, question_type: e.target.value }))}>
                        <option value='open_ended'>Open Ended (free text)</option>
                        <option value='rating'>Rating (1-7 scale)</option>
                        <option value='multiple_choice'>Multiple Choice</option>
                      </select>
                    </div>
                    <div style={{ width: 120 }}>
                      <label className='label'>Display Order</label>
                      <input className='input' type='number' min={1} max={99}
                        value={globalForm.display_order}
                        onChange={e => setGlobalForm(f => ({ ...f, display_order: e.target.value }))} />
                    </div>
                  </div>
                  <button className='btn btn-primary'
                    onClick={handleCreateGlobalQ}
                    disabled={!globalForm.question_text.trim()}>
                    Save Question
                  </button>
                </div>
              </div>
            )}

            {loadingGlobal ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <span className='spinner' style={{ width: 28, height: 28, margin: '0 auto', display: 'block' }} />
              </div>
            ) : globalQuestions.length === 0 ? (
              <div className='glass-card' style={{ padding: 60, textAlign: 'center' }}>
                <div style={{ marginBottom: 12 }}>[-]</div>
                <h3 style={{ color: 'var(--text-secondary)' }}>No questions yet</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Add debrief questions shown after all tasks complete.
                </p>
              </div>
            ) : (
              <div className='flex flex-col gap-3'>
                {[...globalQuestions]
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((q, idx) => (
                    <div key={q.id} className='glass-card' style={{ padding: '16px 20px', opacity: q.active ? 1 : 0.55 }}>
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-3' style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                            #{idx + 1}
                          </span>
                          <span className={'badge ' + (q.question_type === 'open_ended' ? 'badge-teal' : q.question_type === 'rating' ? 'badge-amber' : 'badge-blue')}
                            style={{ flexShrink: 0 }}>
                            {q.question_type === 'open_ended' ? 'open' : q.question_type === 'rating' ? 'rating' : 'choice'}
                          </span>
                          <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {q.question_text}
                          </span>
                        </div>
                        <div className='flex items-center gap-2' style={{ flexShrink: 0, marginLeft: 16 }}>
                          <button
                            className={'btn btn-sm ' + (q.active ? 'btn-secondary' : 'btn-ghost')}
                            style={{ fontSize: '0.7rem' }}
                            onClick={() => handleToggleGlobalQ(q)}>
                            {q.active ? 'Active' : 'Inactive'}
                          </button>
                          <button className='btn btn-danger btn-sm' onClick={() => handleDeleteGlobalQ(q.id)}>
                            X
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {/* Pre-Study Survey Tab */}
        {adminTab === 'demographic' && (
          <>
            <div className='glass-card' style={{ padding: '16px 20px', marginBottom: 20, borderLeft: '3px solid var(--accent-emerald)' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--accent-emerald)' }}>Pre-Study Survey</strong> - demographic and background questions shown to participants before the experiment begins.
                Questions appear on the pre-study page immediately after the participant enters their ID.
              </p>
            </div>
            <div className='flex items-center justify-between' style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>
                Questions
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 400, marginLeft: 8 }}>
                  ({demographicQuestions.filter(q => q.active).length} active)
                </span>
              </h3>
              <button className='btn btn-primary btn-sm' onClick={() => setShowDemographicForm(v => !v)}>
                {showDemographicForm ? 'Cancel' : '+ Add Question'}
              </button>
            </div>

            {showDemographicForm && (
              <div className='glass-card fade-in' style={{ padding: 20, marginBottom: 20 }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                  New Pre-Study Question
                </p>
                <div className='flex flex-col gap-3'>
                  <div>
                    <label className='label'>Question Text *</label>
                    <textarea className='input' rows={2}
                      placeholder='e.g. What is your age?'
                      value={demographicForm.question_text}
                      onChange={e => setDemographicForm(f => ({ ...f, question_text: e.target.value }))}
                      style={{ fontFamily: 'var(--font-sans)', fontSize: '0.88rem', lineHeight: 1.6 }}
                    />
                  </div>
                  <div className='flex gap-3'>
                    <div style={{ flex: 1 }}>
                      <label className='label'>Answer Type</label>
                      <select className='input' value={demographicForm.question_type}
                        onChange={e => setDemographicForm(f => ({ ...f, question_type: e.target.value }))}>
                        <option value='text'>Free text</option>
                        <option value='number'>Number</option>
                        <option value='select'>Multiple choice (options below)</option>
                      </select>
                    </div>
                    <div style={{ width: 120 }}>
                      <label className='label'>Display Order</label>
                      <input className='input' type='number' min={1} max={99}
                        value={demographicForm.display_order}
                        onChange={e => setDemographicForm(f => ({ ...f, display_order: e.target.value }))} />
                    </div>
                  </div>
                  {demographicForm.question_type === 'select' && (
                    <div>
                      <label className='label'>Options (one per line, or JSON array)</label>
                      <textarea className='input' rows={3}
                        placeholder='Woman&#10;Man&#10;Non-binary&#10;Prefer not to say'
                        value={demographicForm.options}
                        onChange={e => setDemographicForm(f => ({ ...f, options: e.target.value }))}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
                      />
                    </div>
                  )}
                  <button className='btn btn-primary'
                    onClick={handleCreateDemographicQ}
                    disabled={!demographicForm.question_text.trim()}>
                    Save Question
                  </button>
                </div>
              </div>
            )}

            {loadingDemographic ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <span className='spinner' style={{ width: 28, height: 28, margin: '0 auto', display: 'block' }} />
              </div>
            ) : demographicQuestions.length === 0 ? (
              <div className='glass-card' style={{ padding: 60, textAlign: 'center' }}>
                <div style={{ marginBottom: 12 }}>[-]</div>
                <h3 style={{ color: 'var(--text-secondary)' }}>No questions yet</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Add demographic questions shown before the experiment begins.
                </p>
              </div>
            ) : (
              <div className='flex flex-col gap-3'>
                {[...demographicQuestions]
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((q) => {
                    let options: string[] = [];
                    try { options = JSON.parse(q.options); } catch { /* */ }
                    return (
                      <div key={q.id} className='glass-card' style={{ padding: '16px 20px', opacity: q.active ? 1 : 0.55 }}>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-3' style={{ flex: 1, minWidth: 0 }}>
                            <span className={'badge ' + (
                              q.question_type === 'text' ? 'badge-blue' :
                              q.question_type === 'number' ? 'badge-amber' : 'badge-teal'
                            )} style={{ flexShrink: 0 }}>
                              {q.question_type === 'text' ? 'text' : q.question_type === 'number' ? 'number' : 'choice'}
                            </span>
                            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {q.question_text}
                            </span>
                            {options.length > 0 && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                                [{options.join(', ')}]
                              </span>
                            )}
                          </div>
                          <div className='flex items-center gap-2' style={{ flexShrink: 0, marginLeft: 16 }}>
                            <button
                              className={'btn btn-sm ' + (q.active ? 'btn-secondary' : 'btn-ghost')}
                              style={{ fontSize: '0.7rem' }}
                              onClick={() => handleToggleDemographicQ(q)}>
                              {q.active ? 'Active' : 'Inactive'}
                            </button>
                            <button className='btn btn-danger btn-sm' onClick={() => handleDeleteDemographicQ(q.id)}>
                              X
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}


