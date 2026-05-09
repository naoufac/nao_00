// /tasks — what the system is doing on its own.
//
// Single page that consolidates every "auto-creating task" surface in nao00:
//   1. Orchestrator goals (auto-created plan_steps, exec_steps)
//   2. Stream runs (cron-fired horoscope, engagement_digest, insight, etc.)
//   3. Cron schedule (what fires next)
//   4. Open pain-points from /reality
//
// Server-rendered HTML, polls /tasks/data every 15s.

export interface TasksGoal {
  id: string
  goal: string
  state: string
  created_at: number
  updated_at: number
  step_count: number
  result_summary: string | null
}

export interface TasksStreamRun {
  name: string
  ok: number
  ts: string
  duration_ms: number | null
  error: string | null
}

export interface TasksCron {
  schedule: string
  human: string
  feeds: string
}

export interface TasksPayload {
  generated_at: string
  goals: TasksGoal[]
  streams: TasksStreamRun[]
  crons: TasksCron[]
  pain_points: { text: string; status: 'shipped' | 'partial' | 'open' }[]
}

const CRONS: TasksCron[] = [
  { schedule: '*/15 * * * *', human: 'every 15 min',     feeds: 'self-reflection (Nemotron)' },
  { schedule: '0 0 * * *',    human: 'daily at 00:00 UTC', feeds: 'morning briefing → gmail draft' },
  { schedule: '0 16 * * *',   human: 'daily at 16:00 UTC', feeds: 'evening recap → slack DM' },
  { schedule: '0 17 * * SUN', human: 'weekly Sunday 17:00 UTC', feeds: 'weekly digest' },
  { schedule: '0 1-23 * * *', human: 'every hour',        feeds: 'auto-coverage + fleet usage poll' },
]

// Same list /reality renders, but only the unfinished ones — that's the
// to-do queue from Naoufal's mouth.
const PAIN_POINTS: { text: string; status: 'shipped' | 'partial' | 'open' }[] = [
  { text: 'Agents die on reboot — no auto-start', status: 'shipped' },
  { text: 'New sessions spawn Opus 4.6 instead of 4.7', status: 'shipped' },
  { text: "Naoufal clicks 'OK' on every permission prompt", status: 'shipped' },
  { text: 'Dashboard "in progress" for days', status: 'partial' },
  { text: 'No buttons to start/talk/pause agents', status: 'partial' },
  { text: 'No live ship-view', status: 'shipped' },
]

export function buildTasksPage(): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nao00 — Tasks</title>
<style>
  :root {
    --bg:#faf9f5; --panel:#fff; --line:rgba(34,24,12,0.10);
    --fg:#1a1815; --mute:#5a564e; --accent:#c96442;
    --good:#2e9e6a; --warn:#d59315; --bad:#d63d4d;
    --soft:#f1ede4;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; }
  .wrap { max-width: 920px; margin:0 auto; padding: 24px 18px 80px; }
  header { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:16px; }
  h1 { font-size: 24px; letter-spacing: -0.01em; margin: 0; }
  .pulse { display:inline-block; width:8px; height:8px; border-radius:50%; background: var(--good); box-shadow: 0 0 0 0 rgba(46,158,106,0.6); animation: pulse 2s infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(46,158,106,0.55);} 70%{box-shadow:0 0 0 12px rgba(46,158,106,0);} 100%{box-shadow:0 0 0 0 rgba(46,158,106,0);} }
  .sub { color: var(--mute); font-size: 12px; font-family: 'JetBrains Mono', monospace; }
  .nav { font-size: 12px; }
  .nav a { color: var(--accent); text-decoration: none; padding: 4px 10px; border:1px solid #c9644244; border-radius: 999px; background:#c9644211; margin-left:6px; }
  section { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px 16px; margin-bottom:16px; }
  section h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--mute); margin: 0 0 12px; display:flex; align-items:center; gap:8px; }
  section .count { color: var(--mute); font-weight: 400; font-size: 11px; font-family:'JetBrains Mono', monospace; }
  .row { padding: 10px 0; border-bottom: 1px dashed var(--line); display:flex; gap: 12px; align-items: flex-start; }
  .row:last-child { border-bottom: 0; }
  .icon { font-size: 18px; flex-shrink: 0; line-height: 1; padding-top: 2px; }
  .body { flex: 1; min-width: 0; }
  .title { font-weight: 600; }
  .det { color: var(--mute); font-size: 12.5px; margin-top: 3px; word-wrap: break-word; }
  .badge { display:inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; margin-left: 6px; }
  .badge.done, .badge.shipped, .badge.ok { background:#e7f5ed; color: var(--good); }
  .badge.partial, .badge.warn, .badge.planning, .badge.running { background:#fdf3df; color: var(--warn); }
  .badge.open, .badge.bad, .badge.failed { background:#fbe5e7; color: var(--bad); }
  .empty { color: var(--mute); font-size: 12.5px; padding: 8px 0; font-style: italic; }
  .footer { color: var(--mute); font-size: 11px; margin-top: 24px; text-align: center; font-family:'JetBrains Mono', monospace; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1><span class="pulse"></span>Tasks</h1>
      <div class="sub" id="updated">loading…</div>
    </div>
    <div class="nav">
      <a href="/dashboard">📊 Dashboard</a>
      <a href="/docs">📚 Docs</a>
      <a href="/reality">🔎 Reality</a>
      <a href="/streams">🌊 Streams</a>
    </div>
  </header>

  <section>
    <h2>🎯 Goals <span class="count" id="goals-count"></span></h2>
    <div id="goals"><div class="empty">loading…</div></div>
  </section>

  <section>
    <h2>🌊 Stream runs (last 12) <span class="count" id="streams-count"></span></h2>
    <div id="streams"><div class="empty">loading…</div></div>
  </section>

  <section>
    <h2>⏰ Crons — what fires on its own</h2>
    <div id="crons"></div>
  </section>

  <section>
    <h2>🩹 Pain points <span class="count" id="pp-count"></span></h2>
    <div id="pain"></div>
  </section>

  <div class="footer">auto-refresh every 15s · pulled from orchestrator DO + streams_runs + cron registry</div>
</div>

<script>
const fmtRelative = (iso) => {
  const t = new Date(iso).getTime();
  if (!t) return '?';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s/60) + 'm ago';
  if (s < 86400) return Math.round(s/3600) + 'h ago';
  return Math.round(s/86400) + 'd ago';
};
const escape = (s) => String(s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

async function refresh() {
  try {
    const r = await fetch('/tasks/data', { cache: 'no-store' });
    const d = await r.json();
    document.getElementById('updated').textContent = 'updated ' + fmtRelative(d.generated_at);

    // Goals
    const gEl = document.getElementById('goals');
    document.getElementById('goals-count').textContent = '(' + d.goals.length + ')';
    if (!d.goals.length) {
      gEl.innerHTML = '<div class="empty">No goals yet. POST one to /orchestrator/goal to seed.</div>';
    } else {
      gEl.innerHTML = d.goals.map(g => {
        const icon = g.state === 'done' ? '✓' : g.state === 'failed' ? '✗' : '⟳';
        return '<div class="row">' +
          '<div class="icon">' + icon + '</div>' +
          '<div class="body">' +
            '<div class="title">' + escape(g.goal) + '<span class="badge ' + escape(g.state) + '">' + escape(g.state) + '</span></div>' +
            '<div class="det">' + g.step_count + ' step' + (g.step_count === 1 ? '' : 's') + ' · ' + fmtRelative(new Date(g.updated_at).toISOString()) + (g.result_summary ? ' · ' + escape(g.result_summary) : '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // Streams
    const sEl = document.getElementById('streams');
    document.getElementById('streams-count').textContent = '(' + d.streams.length + ')';
    if (!d.streams.length) {
      sEl.innerHTML = '<div class="empty">No stream runs yet.</div>';
    } else {
      sEl.innerHTML = d.streams.map(s => {
        const ok = !!s.ok;
        const icon = ok ? '✓' : '⚠';
        const det = (s.duration_ms ? s.duration_ms + 'ms · ' : '') + fmtRelative(s.ts) + (s.error ? ' · ' + escape(s.error) : '');
        return '<div class="row">' +
          '<div class="icon">' + icon + '</div>' +
          '<div class="body">' +
            '<div class="title">' + escape(s.name) + '<span class="badge ' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'ok' : 'fail') + '</span></div>' +
            '<div class="det">' + det + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // Crons
    document.getElementById('crons').innerHTML = d.crons.map(c =>
      '<div class="row"><div class="icon">⏰</div><div class="body">' +
        '<div class="title">' + escape(c.feeds) + '</div>' +
        '<div class="det">' + escape(c.human) + ' · <code style="font-family:monospace;">' + escape(c.schedule) + '</code></div>' +
      '</div></div>'
    ).join('');

    // Pain points
    document.getElementById('pp-count').textContent = '(' + d.pain_points.filter(p => p.status !== 'shipped').length + ' open)';
    document.getElementById('pain').innerHTML = d.pain_points.map(p => {
      const icon = p.status === 'shipped' ? '✓' : p.status === 'partial' ? '◐' : '○';
      return '<div class="row">' +
        '<div class="icon">' + icon + '</div>' +
        '<div class="body">' +
          '<div class="title">' + escape(p.text) + '<span class="badge ' + p.status + '">' + p.status + '</span></div>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (e) {
    document.getElementById('updated').textContent = 'error: ' + (e && e.message || e);
  }
}
refresh();
setInterval(refresh, 15000);
</script>
</body></html>`
}

export async function buildTasksPayload(env: any): Promise<TasksPayload> {
  // Goals — call orchestrator DO directly (same as /orchestrator/goals route)
  let goals: TasksGoal[] = []
  try {
    const id = env.ORCHESTRATOR_DO.idFromName('global')
    const stub = env.ORCHESTRATOR_DO.get(id)
    const res = await stub.fetch('https://do/goals', { method: 'GET' })
    if (res.ok) {
      const j = await res.json() as { goals?: TasksGoal[] }
      goals = j.goals || []
    }
  } catch { /* DO might be cold; show empty */ }

  // Streams — last 12 runs across all streams
  let streams: TasksStreamRun[] = []
  try {
    const r = await env.DB.prepare(
      `SELECT name, ok, ts, duration_ms, error FROM streams_runs ORDER BY ts DESC LIMIT 12`
    ).all()
    streams = (r.results || []) as TasksStreamRun[]
  } catch { /* table may not exist on a fresh deploy */ }

  return {
    generated_at: new Date().toISOString(),
    goals,
    streams,
    crons: CRONS,
    pain_points: PAIN_POINTS,
  }
}
