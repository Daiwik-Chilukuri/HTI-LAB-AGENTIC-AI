import { NextRequest, NextResponse } from 'next/server';
import { getSurveysDb } from '@/lib/db';

// ── GET ───────────────────────────────────────────────────────────
// Returns full admin data: participants, sessions, runs, responses, logs
// ?export=csv  → CSV download
// ?participant_id=X → filter to one participant
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const exportCsv = searchParams.get('export') === 'csv';
    const filterPid = searchParams.get('participant_id');

    const db   = getSurveysDb();
    const pidP = filterPid ? [filterPid] : [];

    const participants = db.prepare(
      filterPid ? 'SELECT * FROM participants WHERE id=? ORDER BY created_at DESC'
                : 'SELECT * FROM participants ORDER BY created_at DESC'
    ).all(...pidP) as Record<string, unknown>[];

    const sessions = db.prepare(
      filterPid ? 'SELECT * FROM sessions WHERE participant_id=? ORDER BY started_at DESC'
                : 'SELECT * FROM sessions ORDER BY started_at DESC'
    ).all(...pidP) as Record<string, unknown>[];

    const runs = db.prepare(
      filterPid ? 'SELECT * FROM runs WHERE participant_id=? ORDER BY started_at ASC'
                : 'SELECT * FROM runs ORDER BY started_at ASC'
    ).all(...pidP) as Record<string, unknown>[];

    const responses = db.prepare(
      filterPid
        ? `SELECT sr.*, q.question_text, q.sub_label, q.scale_type, q.scale_group, q.task_scope
           FROM survey_responses sr JOIN tlx_questions q ON q.id=sr.question_id
           WHERE sr.participant_id=? ORDER BY sr.submitted_at ASC`
        : `SELECT sr.*, q.question_text, q.sub_label, q.scale_type, q.scale_group, q.task_scope
           FROM survey_responses sr JOIN tlx_questions q ON q.id=sr.question_id
           ORDER BY sr.submitted_at ASC`
    ).all(...pidP) as Record<string, unknown>[];

    // Logs with event_data parsed for richer display
    const logs = db.prepare(
      filterPid
        ? 'SELECT * FROM interaction_logs WHERE participant_id=? ORDER BY timestamp ASC LIMIT 5000'
        : 'SELECT * FROM interaction_logs ORDER BY timestamp ASC LIMIT 5000'
    ).all(...pidP) as Record<string, unknown>[];

    const debriefResponses = db.prepare(
      filterPid
        ? 'SELECT * FROM debrief_responses WHERE participant_id=? ORDER BY submitted_at ASC'
        : 'SELECT * FROM debrief_responses ORDER BY submitted_at ASC'
    ).all(...pidP) as Record<string, unknown>[];

    const postStudyResponses = db.prepare(
      filterPid
        ? `SELECT r.*, q.question_text, q.question_type
           FROM global_survey_responses r
           JOIN global_survey_questions q ON q.id = r.question_id
           WHERE r.participant_id=?
           ORDER BY q.display_order ASC, r.id ASC`
        : `SELECT r.*, q.question_text, q.question_type
           FROM global_survey_responses r
           JOIN global_survey_questions q ON q.id = r.question_id
           ORDER BY q.display_order ASC, r.id ASC`
    ).all(...pidP) as Record<string, unknown>[];

    const demographicResponses = db.prepare(
      filterPid
        ? `SELECT dr.*, dq.question_text, dq.question_type, dq.options
           FROM demographic_responses dr JOIN demographic_questions dq ON dq.id=dr.question_id
           WHERE dr.participant_id=? ORDER BY dr.submitted_at ASC`
        : `SELECT dr.*, dq.question_text, dq.question_type, dq.options
           FROM demographic_responses dr JOIN demographic_questions dq ON dq.id=dr.question_id
           ORDER BY dr.submitted_at ASC`
    ).all(...pidP) as Record<string, unknown>[];

    // ── Per-run aggregated stats (for rich log view) ───────────────
    const runStats = db.prepare(`
      SELECT
        run_id,
        participant_id,
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type='ai_chat_sent'           THEN 1 ELSE 0 END) as chat_msgs_sent,
        SUM(CASE WHEN event_type='ai_chat_received'       THEN 1 ELSE 0 END) as chat_msgs_received,
        SUM(CASE WHEN event_type='hint_requested'         THEN 1 ELSE 0 END) as hints_requested,
        SUM(CASE WHEN event_type='code_run'               THEN 1 ELSE 0 END) as code_runs,
        SUM(CASE WHEN event_type='ai_action_clicked'      THEN 1 ELSE 0 END) as ai_actions,
        SUM(CASE WHEN event_type='suggestion_accepted'    THEN 1 ELSE 0 END) as suggestions_accepted,
        SUM(CASE WHEN event_type='suggestion_dismissed'   THEN 1 ELSE 0 END) as suggestions_dismissed,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event
      FROM interaction_logs
      ${filterPid ? 'WHERE participant_id=?' : ''}
      GROUP BY run_id, participant_id
    `).all(...pidP) as Record<string, unknown>[];

    if (exportCsv) {
      const lines: string[] = [];

      // ── Section 1: Survey Responses ──────────────────────────────
      lines.push('=== SURVEY RESPONSES ===');
      lines.push(['participant_id','session_id','run_id','task_type','model_id','question_id','question_text','scale_group','scale_type','answer','submitted_at'].join(','));
      for (const r of responses) {
        lines.push([r.participant_id,r.session_id,r.run_id,r.task_type,r.model_id,r.question_id,csvCell(r.question_text),r.scale_group,r.scale_type,r.answer,r.submitted_at].map(csvCell).join(','));
      }

      // ── Section 2: Demographic Responses ─────────────────────────
      lines.push('\n=== DEMOGRAPHIC RESPONSES ===');
      lines.push(['participant_id','session_id','question_id','question_text','question_type','response_text','submitted_at'].join(','));
      for (const dr of demographicResponses) {
        lines.push([dr.participant_id,dr.session_id,dr.question_id,csvCell(dr.question_text as string),dr.question_type,csvCell(dr.response_text as string),dr.submitted_at].map(csvCell).join(','));
      }

      // ── Section 3: Runs ──────────────────────────────────────────
      lines.push('\n=== RUNS ===');
      lines.push(['run_id','session_id','participant_id','run_number','task_type','task_id','model_id','is_faulty','started_at','completed_at'].join(','));
      for (const r of runs) {
        lines.push([r.id,r.session_id,r.participant_id,r.run_number,r.task_type,r.task_id,r.model_id,r.is_faulty,r.started_at,r.completed_at].map(csvCell).join(','));
      }

      // ── Section 4: Post-Study Survey Responses ───────────────────
      lines.push('\n=== POST-STUDY SURVEY RESPONSES ===');
      lines.push(['id','participant_id','session_id','question_id','question_text','question_type','response_text','submitted_at'].join(','));
      for (const e of postStudyResponses) {
        lines.push([e.id,e.participant_id,e.session_id,e.question_id,csvCell(e.question_text as string),e.question_type,csvCell(e.response_text as string),e.submitted_at].map(csvCell).join(','));
      }

      // ── Section 5: Interaction logs ──────────────────────────────
      lines.push('\n=== DEBRIEF RESPONSES ===');
      lines.push(['id','participant_id','session_id','rankings','open_comments','submitted_at'].join(','));
      for (const d of debriefResponses) {
        lines.push([d.id,d.participant_id,d.session_id,csvCell(d.rankings as string),csvCell(d.open_comments as string),d.submitted_at].map(csvCell).join(','));
      }

      // ── Section 5: Interaction logs ──────────────────────────────
      lines.push('\n=== INTERACTION LOGS ===');
      lines.push(['log_id','participant_id','run_id','event_type','event_data','timestamp'].join(','));
      for (const l of logs) {
        lines.push([l.id,l.participant_id,l.run_id,l.event_type,csvCell(l.event_data),l.timestamp].map(csvCell).join(','));
      }

      // ── Section 5: Per-run stats ─────────────────────────────────
      lines.push('\n=== RUN STATS ===');
      lines.push(['run_id','participant_id','total_events','chat_msgs_sent','chat_msgs_received','hints_requested','code_runs','ai_actions','suggestions_accepted','suggestions_dismissed'].join(','));
      for (const s of runStats) {
        lines.push([s.run_id,s.participant_id,s.total_events,s.chat_msgs_sent,s.chat_msgs_received,s.hints_requested,s.code_runs,s.ai_actions,s.suggestions_accepted,s.suggestions_dismissed].map(csvCell).join(','));
      }

      const ts = new Date().toISOString().slice(0,19).replace(/[T:]/g, '-');
      const filename = filterPid ? `htilab-${filterPid}-${ts}.csv` : `htilab-all-${ts}.csv`;
      return new NextResponse(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      participants, sessions, runs, responses, logs, runStats, demographicResponses, debriefResponses, postStudyResponses,
      stats: {
        participant_count: participants.length,
        session_count:     sessions.length,
        run_count:         runs.length,
        response_count:    responses.length,
        log_count:         logs.length,
        demographic_response_count: demographicResponses.length,
        debrief_response_count: debriefResponses.length,
        post_study_response_count: postStudyResponses.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────
// Clears all session/run/response/log data but preserves TLX questions
// ?confirm=yes is required to prevent accidental clears
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get('confirm') !== 'yes') {
      return NextResponse.json({ error: 'Pass ?confirm=yes to confirm data deletion' }, { status: 400 });
    }

    const db = getSurveysDb();

    // Temporarily disable FK enforcement so we can delete in any order
    // (WAL-mode SQLite: pragma applies to the connection immediately)
    db.pragma('foreign_keys = OFF');

    try {
      db.transaction(() => {
        // Delete leaves → roots: responses/logs before runs, runs before sessions, sessions before participants
        const tables = [
          'survey_responses',   // FK → runs, tlx_questions
          'demographic_responses', // FK → participants
          'interaction_logs',   // FK → runs
          'debrief_responses',  // FK → sessions, participants
          'runs',               // FK → sessions, participants
          'sessions',           // FK → participants
          'participants',
        ];
        for (const table of tables) {
          // Use try/catch per table in case schema is old and table doesn't exist
          try { db.prepare(`DELETE FROM ${table}`).run(); } catch { /* table may not exist */ }
        }
      })();
    } finally {
      // Always re-enable FK enforcement
      db.pragma('foreign_keys = ON');
    }

    return NextResponse.json({
      success: true,
      message: 'All session data cleared. TLX questions and task database preserved.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}
