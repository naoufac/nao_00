// nao_00 streams visibility module
// Renders a self-contained page + state API for the parallel streams agents.

export interface StreamsEnv {
  KV: KVNamespace;
}

export interface StreamRunRow {
  id: number;
  ts: string | null;
  name: string | null;
  ok: number | null;
  count: number | null;
  duration_ms: number | null;
  error: string | null;
}

export interface StreamsState {
  runs: StreamRunRow[];
  proactive_latest: { text?: string; generated_at?: string } | null;
  last_insights: unknown | null;
  ts: string;
}

async function safeParseKV(kv: KVNamespace, key: string): Promise<unknown | null> {
  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return { text: raw };
    }
  } catch {
    return null;
  }
}

export async function buildStreamsState(env: StreamsEnv, db: D1Database): Promise<StreamsState> {
  // Defensively ensure the table exists so this never blows up on a fresh deploy.
  try {
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS streams_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, name TEXT, ok INTEGER, count INTEGER, duration_ms INTEGER, error TEXT)"
      )
      .run();
  } catch {
    // swallow — querying below will surface a clearer error if it really is broken
  }

  let runs: StreamRunRow[] = [];
  try {
    const res = await db
      .prepare(
        "SELECT id, ts, name, ok, count, duration_ms, error FROM streams_runs ORDER BY id DESC LIMIT 30"
      )
      .all<StreamRunRow>();
    runs = (res.results ?? []) as StreamRunRow[];
  } catch {
    runs = [];
  }

  const proactive = (await safeParseKV(env.KV, "proactive:latest")) as
    | { text?: string; generated_at?: string }
    | null;
  const insights = await safeParseKV(env.KV, "eval:last_insights");

  return {
    runs,
    proactive_latest: proactive,
    last_insights: insights,
    ts: new Date().toISOString(),
  };
}

export const STREAMS_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nao_00 streams — what the agents are doing right now</title>
<style>
  :root { --bg-0:#faf9f5; --fg:#1a1815; --accent:#c96442; --bg-1:#fff; --line:rgba(34,24,12,0.10); }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:var(--bg-0); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .mono { font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
  header { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
  h1 { font-size: 20px; margin:0; font-weight:600; }
  h1 .accent { color: var(--accent); }
  .sub { color:#6b6357; font-size:12px; }
  .card { background:var(--bg-1); border:1px solid var(--line); border-radius:14px; padding:18px 20px; box-shadow:0 1px 0 rgba(0,0,0,0.02); }
  .proactive { margin-bottom: 22px; }
  .proactive .label { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); margin-bottom:8px; font-weight:600; }
  .proactive .text { font-size:17px; line-height:1.5; white-space:pre-wrap; }
  .proactive .meta { font-size:11px; color:#8a8175; margin-top:10px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:9px 8px; border-bottom:1px solid var(--line); vertical-align:middle; }
  th { font-weight:600; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#6b6357; }
  td.num { text-align:right; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; vertical-align:middle; }
  .dot.ok { background:#3fa66a; }
  .dot.bad { background:#c0392b; }
  .err { color:#c0392b; font-size:11px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block; }
  .empty { color:#8a8175; font-style:italic; padding:14px 0; }
  @media (max-width:560px) {
    th.hide-s, td.hide-s { display:none; }
    .wrap { padding:16px 10px 48px; }
    .proactive .text { font-size:15px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><span class="accent">nao_00</span> streams — what the agents are doing right now</h1>
    <div class="sub mono" id="ts">loading…</div>
  </header>

  <div class="card proactive" id="proactive-card">
    <div class="label">latest proactive insight</div>
    <div class="text" id="proactive-text">loading…</div>
    <div class="meta mono" id="proactive-meta"></div>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>status</th>
          <th>stream</th>
          <th class="hide-s">when</th>
          <th class="num">dur ms</th>
          <th class="num hide-s">count</th>
        </tr>
      </thead>
      <tbody id="rows"><tr><td colspan="5" class="empty">loading…</td></tr></tbody>
    </table>
  </div>
</div>
<script>
  const BEARER = "__BEARER__";
  function esc(s){ return String(s ?? "").replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function fmtTs(s){ if(!s) return ""; try { return new Date(s).toLocaleString(); } catch { return s; } }
  async function load(){
    try {
      const r = await fetch('/streams/state', { headers: { 'Authorization': 'Bearer ' + BEARER } });
      if(!r.ok) throw new Error('http ' + r.status);
      const d = await r.json();
      document.getElementById('ts').textContent = 'refreshed ' + fmtTs(d.ts);
      const p = d.proactive_latest;
      document.getElementById('proactive-text').textContent = p && p.text ? p.text : 'no proactive insight yet — streams will fill this in.';
      document.getElementById('proactive-meta').textContent = p && p.generated_at ? ('generated ' + fmtTs(p.generated_at)) : '';
      const rows = (d.runs || []).map(r => {
        const ok = r.ok === 1 || r.ok === true;
        const dotCls = ok ? 'ok' : 'bad';
        const errCell = !ok && r.error ? '<div class="err mono" title="' + esc(r.error) + '">' + esc(r.error) + '</div>' : '';
        return '<tr>' +
          '<td><span class="dot ' + dotCls + '"></span>' + (ok ? 'ok' : 'fail') + errCell + '</td>' +
          '<td class="mono">' + esc(r.name || '—') + '</td>' +
          '<td class="hide-s mono">' + esc(fmtTs(r.ts)) + '</td>' +
          '<td class="num mono">' + esc(r.duration_ms ?? '') + '</td>' +
          '<td class="num hide-s mono">' + esc(r.count ?? '') + '</td>' +
        '</tr>';
      }).join('');
      document.getElementById('rows').innerHTML = rows || '<tr><td colspan="5" class="empty">no runs logged yet.</td></tr>';
    } catch (e) {
      document.getElementById('ts').textContent = 'error: ' + (e && e.message ? e.message : e);
    }
  }
  load();
  setInterval(load, 30000);
</script>
</body>
</html>`;
