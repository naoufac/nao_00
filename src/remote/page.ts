// Remote Control — Naoufal's operator surface.
// Per feedback 2026-05-07: "just a Remote Control active is what I really ask for"
//
// Big buttons. Status lights. Text inputs that trigger things. No charts.
// Naoclaw warm palette. One page, single screen, mobile-friendly.

export const REMOTE_PAGE_HTML = (token: string) => `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>nao_00 — remote control</title>
<style>
  :root {
    --bg-0:#faf9f5; --bg-1:#fff; --bg-2:#f1ede4;
    --line:rgba(34,24,12,0.10); --line-strong:rgba(34,24,12,0.18);
    --fg:#1a1815; --fg-dim:#5a564e; --fg-muted:#8b8779; --fg-on-accent:#fffaf2;
    --accent:#c96442; --accent-2:#b85432; --accent-soft:#fdebe2;
    --cyan:#0ca8c9; --violet:#6943e0; --magenta:#c4308a;
    --green:#2e9e6a; --amber:#d59315; --red:#d63d4d;
    --shadow-1: 0 1px 2px rgba(20,14,4,0.04), 0 4px 14px rgba(20,14,4,0.06);
  }
  * { box-sizing: border-box; }
  body {
    margin:0; font-family:'Inter',-apple-system,system-ui,sans-serif;
    background:
      radial-gradient(1100px 600px at -10% -10%, #fdf5e9 0%, transparent 50%),
      radial-gradient(900px 500px at 110% 110%, #f5e8df 0%, transparent 60%),
      var(--bg-0);
    color:var(--fg); min-height:100vh;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 24px 18px 80px; }
  .top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom: 18px; }
  .top h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
  .top .sub { color: var(--fg-muted); font-size: 13px; font-family: 'JetBrains Mono', monospace; }
  .nav { display:flex; gap:14px; font-size:13px; margin-bottom: 24px; flex-wrap: wrap; }
  .nav a { color: var(--accent); text-decoration: none; font-weight: 500; }
  .nav a:hover { text-decoration: underline; }

  .pulse { display:flex; gap:10px; flex-wrap:wrap; padding: 14px 16px; background: var(--bg-1);
    border:1px solid var(--line); border-radius: 14px; margin-bottom: 18px; align-items:center; box-shadow: var(--shadow-1); }
  .pulse .light { display:flex; align-items:center; gap:7px; font-size: 13px; padding: 4px 10px;
    border-radius: 999px; background: var(--bg-2); }
  .light .d { width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 3px rgba(0,0,0,0.04); }
  .light.green   .d { background: var(--green); }
  .light.yellow  .d { background: var(--amber); }
  .light.red     .d { background: var(--red); }
  .light.muted   .d { background: var(--fg-muted); }
  .pulse strong { color: var(--fg); font-weight: 600; }

  .grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
  @media (min-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }

  .panel {
    background: var(--bg-1); border: 1px solid var(--line); border-radius: 14px;
    padding: 16px 18px; box-shadow: var(--shadow-1); display:flex; flex-direction:column; gap: 10px;
  }
  .panel h3 { margin: 0; font-size: 15px; font-weight: 700; display:flex; align-items:center; gap: 8px; }
  .panel .hint { color: var(--fg-muted); font-size: 12px; margin: 0; }
  textarea, input {
    width:100%; padding:10px 12px; border:1px solid var(--line-strong); border-radius:10px;
    font-size: 14px; font-family: inherit; background: var(--bg-1); color: var(--fg); resize: vertical;
  }
  textarea:focus, input:focus { outline: 2px solid var(--accent); outline-offset:-1px; }
  textarea { min-height: 60px; }
  .row { display:flex; gap:8px; flex-wrap: wrap; }
  button.btn, .btn {
    background: var(--accent); color: var(--fg-on-accent); border: 0;
    padding: 9px 16px; border-radius: 999px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: background 0.12s, transform 0.05s;
    text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
  }
  button.btn:hover, .btn:hover { background: var(--accent-2); }
  button.btn:active, .btn:active { transform: translateY(1px); }
  button.outline, .btn.outline {
    background: transparent; color: var(--fg); border: 1px solid var(--line-strong);
  }
  button.outline:hover, .btn.outline:hover { background: var(--bg-2); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .out {
    background: var(--bg-2); border-radius: 10px; padding: 10px 12px;
    font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--fg-dim);
    white-space: pre-wrap; word-break: break-word; min-height: 0; max-height: 220px; overflow: auto;
  }
  .out.empty { color: var(--fg-muted); }

  .agent-row { display:flex; gap:8px; flex-wrap: wrap; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
  .agent-row .pill { padding: 3px 10px; border-radius: 999px; background: var(--bg-2); display: inline-flex; gap: 5px; align-items: center; }
  .pill.nao44 .d   { background: var(--violet); }
  .pill.mistral .d { background: var(--green); }
  .pill.minouch .d { background: var(--cyan); }
  .pill .d { width: 6px; height: 6px; border-radius: 50%; }
</style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <h1>🎛️ nao_00 — remote control</h1>
      <div class="sub" id="clock"></div>
    </div>

    <div class="nav">
      <a href="/dashboard">dashboard</a>
      <a href="/voice">voice</a>
      <a href="/healing">healing</a>
      <a href="/manus">manus</a>
      <a href="/gab44">gab44</a>
      <a href="/metrics/api-use">metrics json</a>
      <a href="/credits">💰 credits</a>
      <a href="/mcp">mcp</a>
    </div>

    <div class="pulse" id="pulse">
      <span class="light muted" id="health-light"><span class="d"></span><strong id="health-text">…</strong></span>
      <span class="light muted" id="version-light" title="worker version + route count — red = shadow regression"><span class="d"></span>v<strong id="version-text">…</strong> · <strong id="route-count">…</strong> routes</span>
      <span class="light muted"><span class="d"></span>last hour: <strong id="last-hour">0</strong> calls</span>
      <span class="light muted"><span class="d"></span>tokens: <strong id="total-tokens">0</strong></span>
      <span class="light muted"><span class="d"></span>cache hit: <strong id="cache-hit">0%</strong></span>
      <button class="btn outline" id="refresh-pulse">↻ refresh</button>
    </div>

    <div class="grid">

      <div class="panel" style="grid-column: 1 / -1;">
        <h3>🛰 fleet ops</h3>
        <p class="hint">5 agents, one mission · click an agent's domain to open its surface · status lights wired next pass (heartbeat backend pending)</p>
        <div id="fleet-rows" style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">
          <div class="fleet-row" data-host="anouf" style="display:grid;grid-template-columns:120px 1fr auto auto;gap:10px;align-items:center;padding:8px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:10px;">
            <div><b>Anouf</b><div style="color:var(--fg-muted);font-size:11px;">engine · this box</div></div>
            <div style="color:var(--fg-dim);font-size:12.5px;">builds nao_00 · worker upstream · 135.181.44.161</div>
            <span class="light muted" data-host-status="anouf" title="heartbeat pending"><span class="d"></span><span style="font-size:11px;">tbd</span></span>
            <a class="btn outline" href="https://anouf.nchobah.com" target="_blank" rel="noopener" style="padding:6px 12px;font-size:12px;">open →</a>
          </div>
          <div class="fleet-row" data-host="nemo" style="display:grid;grid-template-columns:120px 1fr auto auto;gap:10px;align-items:center;padding:8px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:10px;">
            <div><b>Nemoclaw</b><div style="color:var(--fg-muted);font-size:11px;">nervous system</div></div>
            <div style="color:var(--fg-dim);font-size:12.5px;">monitoring · shared dashboard :4444 · 162.243.119.47</div>
            <span class="light muted" data-host-status="nemo" title="heartbeat pending"><span class="d"></span><span style="font-size:11px;">tbd</span></span>
            <a class="btn outline" href="https://nemo.nchobah.com:4444" target="_blank" rel="noopener" style="padding:6px 12px;font-size:12px;">open →</a>
          </div>
          <div class="fleet-row" data-host="jasmine" style="display:grid;grid-template-columns:120px 1fr auto auto;gap:10px;align-items:center;padding:8px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:10px;">
            <div><b>Jasmine</b><div style="color:var(--fg-muted);font-size:11px;">builder</div></div>
            <div style="color:var(--fg-dim);font-size:12.5px;">production deploys · 192.241.251.184</div>
            <span class="light muted" data-host-status="jasmine" title="heartbeat pending"><span class="d"></span><span style="font-size:11px;">tbd</span></span>
            <a class="btn outline" href="https://jasmine.nchobah.com" target="_blank" rel="noopener" style="padding:6px 12px;font-size:12px;">open →</a>
          </div>
          <div class="fleet-row" data-host="mayor" style="display:grid;grid-template-columns:120px 1fr auto auto;gap:10px;align-items:center;padding:8px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:10px;">
            <div><b>Mayor</b><div style="color:var(--fg-muted);font-size:11px;">Toronto</div></div>
            <div style="color:var(--fg-dim);font-size:12.5px;">24/7 Claude · 142.93.155.96</div>
            <span class="light muted" data-host-status="mayor" title="heartbeat pending"><span class="d"></span><span style="font-size:11px;">tbd</span></span>
            <a class="btn outline" href="https://mayor.nchobah.com" target="_blank" rel="noopener" style="padding:6px 12px;font-size:12px;">open →</a>
          </div>
          <div class="fleet-row" data-host="vehea" style="display:grid;grid-template-columns:120px 1fr auto auto;gap:10px;align-items:center;padding:8px 10px;background:var(--bg-2);border:1px solid var(--line);border-radius:10px;">
            <div><b>Vehea sibling</b><div style="color:var(--fg-muted);font-size:11px;">work agent</div></div>
            <div style="color:var(--fg-dim);font-size:12.5px;">Vehea-side Claude · same nchobah@gmail.com account · provisioned on Nemo</div>
            <span class="light muted" data-host-status="vehea" title="heartbeat pending"><span class="d"></span><span style="font-size:11px;">tbd</span></span>
            <span style="color:var(--fg-muted);font-size:11px;">internal</span>
          </div>
        </div>
      </div>

      <div class="panel" style="grid-column: 1 / -1;">
        <h3>🌅 today's focus · daily briefing</h3>
        <p class="hint">cron-fired daily at 7am Bangkok · gmail + calendar → nao44 → one focus line</p>
        <div class="out empty" id="briefing-out">— loading —</div>
        <div class="row">
          <button class="btn outline" id="briefing-refresh">↻ reload</button>
          <button class="btn outline" id="briefing-run">▶ run now</button>
          <a class="btn outline" href="/briefing/history" target="_blank">history →</a>
        </div>
      </div>

      <div class="panel" style="grid-column: 1 / -1;">
        <h3>🌙 evening recap · daily wrap-up</h3>
        <p class="hint">cron-fired daily at 11pm Bangkok · today's council + metrics → haiku → one warm paragraph</p>
        <div class="out empty" id="recap-out">— loading —</div>
        <div class="row">
          <button class="btn outline" id="recap-refresh">↻ reload</button>
          <button class="btn outline" id="recap-run">▶ run now</button>
          <a class="btn outline" href="/recap/history" target="_blank">history →</a>
        </div>
      </div>

      <div class="panel">
        <h3>🎙️ talk to council</h3>
        <p class="hint">nao44 → mistral → minouch · the warm voice answers</p>
        <textarea id="council-input" placeholder="ask anything — astrology, life, code, vibes…"></textarea>
        <div class="row">
          <button class="btn" id="council-send">send</button>
          <button class="btn outline" id="council-clear">clear</button>
        </div>
        <div class="out empty" id="council-out">— waiting —</div>
        <div class="agent-row">
          <span class="pill nao44"><span class="d"></span>nao44</span>
          <span class="pill mistral"><span class="d"></span>mistral</span>
          <span class="pill minouch"><span class="d"></span>minouch</span>
        </div>
      </div>

      <div class="panel">
        <h3>📚 search manus archive</h3>
        <p class="hint">151 past tasks · fast text search</p>
        <input id="manus-q" placeholder="try 'astrology' or 'fiverr' or 'tshirts'" />
        <div class="row">
          <button class="btn" id="manus-go">search</button>
          <a class="btn outline" href="/manus">open full viewer →</a>
        </div>
        <div class="out empty" id="manus-out">— waiting —</div>
      </div>

      <div class="panel">
        <h3>🔥 trigger self-improve eval</h3>
        <p class="hint">force the loop that rewrites user:context from recent turns</p>
        <div class="row">
          <button class="btn" id="eval-go">run eval now</button>
          <a class="btn outline" href="/improve/insights">view insights →</a>
          <a class="btn outline" href="/improve/skills">view skills →</a>
        </div>
        <div class="out empty" id="eval-out">— idle —</div>
      </div>

      <div class="panel">
        <h3>🔌 composio toolkit ping</h3>
        <p class="hint">verify a connected app — gmail / slack / github / notion / etc</p>
        <input id="cmp-q" placeholder="e.g. 'list my last 5 unread emails'" />
        <div class="row">
          <button class="btn" id="cmp-go">find tool & describe</button>
        </div>
        <div class="out empty" id="cmp-out">— waiting —</div>
      </div>

      <div class="panel">
        <h3>🚀 deploy & ship</h3>
        <p class="hint">quick links · ssh deploys still happen from anouf</p>
        <div class="row">
          <a class="btn outline" href="https://dash.cloudflare.com/?to=/:account/workers/services" target="_blank">cloudflare workers →</a>
          <a class="btn outline" href="https://github.com/naoufac" target="_blank">github →</a>
          <a class="btn outline" href="https://app.composio.dev" target="_blank">composio →</a>
        </div>
      </div>

      <div class="panel" style="grid-column: 1 / -1;">
        <h3>🧠 reasoning trace · last 5 council runs</h3>
        <p class="hint">every step the council took — input → nao44 → mistral → minouch (warm answer). Click a row to expand.</p>
        <div class="row">
          <button class="btn outline" id="trace-refresh">↻ refresh</button>
        </div>
        <div class="out empty" id="trace-out">— loading —</div>
      </div>

      <div class="panel">
        <h3>💬 quick test minouch's voice</h3>
        <p class="hint">send a tiny prompt → speak the answer (short test, low cost)</p>
        <input id="voice-text" placeholder="say something to test the TTS" value="Hi Naoufal, this is a voice test." />
        <div class="row">
          <button class="btn" id="voice-go">speak it</button>
          <a class="btn outline" href="/voice">open voice page →</a>
        </div>
        <audio id="voice-audio" controls style="width:100%; display:none; margin-top:6px;"></audio>
        <div class="out empty" id="voice-out">— waiting —</div>
      </div>

    </div>
  </main>

<script>
const TOKEN = ${JSON.stringify(token)};
const H = { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };

function $(id) { return document.getElementById(id); }
function setOut(id, text, opts) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('empty', !!(opts && opts.empty));
}
function busy(btn, on) { btn.disabled = !!on; btn.dataset._t = btn.dataset._t || btn.textContent; if (on) btn.textContent = '… working'; else btn.textContent = btn.dataset._t; }

// Clock
function tick() { $('clock').textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; }
tick(); setInterval(tick, 1000);

// Pulse / metrics
async function refreshPulse() {
  try {
    const r = await fetch('/metrics/api-use');
    const d = await r.json();
    $('health-light').className = 'light ' + d.health;
    $('health-text').textContent = d.health.toUpperCase() + ' · ' + d.health_note;
    $('last-hour').textContent = d.last_hour.calls;
    $('total-tokens').textContent = (d.total_input_tokens + d.total_output_tokens).toLocaleString();
    $('cache-hit').textContent = (d.cache_hit_ratio * 100).toFixed(1) + '%';
  } catch (e) {
    $('health-text').textContent = 'metrics unreachable';
  }
}
async function refreshVersion() {
  // /version is the shadow-detection probe — if briefing/recap/notify routes are
  // missing, a foreign deploy is shadowing ours and the operator should see red.
  try {
    const r = await fetch('/version');
    const d = await r.json();
    if (d?.error || !d?.version) {
      $('version-light').className = 'light red';
      $('version-text').textContent = '?';
      $('route-count').textContent = '0';
      return;
    }
    const intact = d.has_briefing && d.has_recap && d.has_notify;
    $('version-light').className = 'light ' + (intact ? 'green' : 'red');
    $('version-text').textContent = d.version;
    $('route-count').textContent = d.route_count;
  } catch (e) {
    $('version-light').className = 'light red';
    $('version-text').textContent = '?';
  }
}
refreshPulse(); refreshVersion();
setInterval(refreshPulse, 15000);
setInterval(refreshVersion, 60000);
$('refresh-pulse').addEventListener('click', () => { refreshPulse(); refreshVersion(); });

// === Fleet status pills — poll /fleet/status, recolor .light per host
async function refreshFleetStatus() {
  try {
    const r = await fetch('/fleet/status');
    if (!r.ok) return;
    const d = await r.json();
    const hosts = d.hosts || {};
    Object.entries(hosts).forEach(([host, info]) => {
      const el = document.querySelector('[data-host-status="' + host + '"]');
      if (!el) return;
      const status = (info && info.status) || 'silent';
      const ageS = info && info.age_s;
      el.classList.remove('green','yellow','red','muted');
      if (status === 'live') el.classList.add('green');
      else if (status === 'warm') el.classList.add('yellow');
      else if (status === 'silent') el.classList.add(ageS == null ? 'muted' : 'red');
      const label = el.querySelector('span:last-child');
      if (label) {
        if (ageS == null) label.textContent = 'no ping';
        else if (ageS < 60) label.textContent = ageS + 's ago';
        else if (ageS < 3600) label.textContent = Math.floor(ageS/60) + 'm ago';
        else label.textContent = Math.floor(ageS/3600) + 'h ago';
      }
      el.title = info && info.last_seen ? ('last seen ' + info.last_seen) : 'never pinged';
    });
  } catch (e) { /* keep prior state */ }
}
refreshFleetStatus();
setInterval(refreshFleetStatus, 15000);

// Council
$('council-send').addEventListener('click', async () => {
  const v = $('council-input').value.trim();
  if (!v) return;
  busy($('council-send'), true);
  setOut('council-out', '… thinking through nao44 → mistral → minouch …');
  try {
    const r = await fetch('/council', { method: 'POST', headers: H, body: JSON.stringify({ input: v }) });
    const d = await r.json();
    setOut('council-out', d.final_output + '\\n\\n— ' + d.duration_ms + 'ms · id ' + (d.id || '').slice(0, 8));
    refreshPulse();
  } catch (e) { setOut('council-out', 'err: ' + e.message); }
  busy($('council-send'), false);
});
$('council-clear').addEventListener('click', () => { $('council-input').value = ''; setOut('council-out', '— waiting —', { empty: true }); });

// Manus search
$('manus-go').addEventListener('click', async () => {
  const q = $('manus-q').value.trim();
  busy($('manus-go'), true);
  try {
    const r = await fetch('/manus/search?q=' + encodeURIComponent(q) + '&limit=10', { headers: H });
    const d = await r.json();
    if (!d.results?.length) setOut('manus-out', 'no matches in ' + d.total + ' tasks');
    else setOut('manus-out', d.results.map(r => '[' + r.status + '] ' + r.title + '  (id: ' + r.id.slice(0, 8) + ')').join('\\n'));
  } catch (e) { setOut('manus-out', 'err: ' + e.message); }
  busy($('manus-go'), false);
});
$('manus-q').addEventListener('keydown', e => { if (e.key === 'Enter') $('manus-go').click(); });

// Improve eval
$('eval-go').addEventListener('click', async () => {
  busy($('eval-go'), true);
  setOut('eval-out', '… running eval (may take ~10s) …');
  try {
    const r = await fetch('/improve/eval?force=1', { method: 'POST', headers: H });
    const d = await r.json();
    setOut('eval-out', JSON.stringify(d, null, 2).slice(0, 1500));
    refreshPulse();
  } catch (e) { setOut('eval-out', 'err: ' + e.message); }
  busy($('eval-go'), false);
});

// Composio search
$('cmp-go').addEventListener('click', async () => {
  const q = $('cmp-q').value.trim();
  if (!q) return;
  busy($('cmp-go'), true);
  setOut('cmp-out', '… asking composio …');
  try {
    const r = await fetch('/tools/call', { method: 'POST', headers: H, body: JSON.stringify({ name: 'COMPOSIO_SEARCH_TOOLS', args: { query: q } }) });
    const d = await r.json();
    let txt = '';
    try {
      const inner = JSON.parse(d.content[0].text);
      const res = inner.data.results[0];
      txt = 'primary: ' + (res.primary_tool_slugs || []).join(', ') + '\\n\\nrelated: ' + (res.related_tool_slugs || []).join(', ');
    } catch { txt = JSON.stringify(d).slice(0, 800); }
    setOut('cmp-out', txt);
  } catch (e) { setOut('cmp-out', 'err: ' + e.message); }
  busy($('cmp-go'), false);
});

// Reasoning trace
async function loadTrace() {
  setOut('trace-out', '… loading …');
  try {
    const r = await fetch('/council/history?limit=5', { headers: H });
    const raw = await r.json();
    const list = (raw && raw.results) || raw;
    if (!Array.isArray(list) || !list.length) { setOut('trace-out', 'no council runs yet — send something through "talk to council" above'); return; }
    const blocks = await Promise.all(list.slice(0, 5).map(async (row) => {
      const dr = await fetch('/council/' + row.id, { headers: H });
      const draw = await dr.json();
      const d = (draw && (draw.conversation || draw)) || {};
      const steps = d.council_steps || draw.steps || [];
      const stepLines = steps.map(s => {
        const tag = s.advisor === 'nao44' ? '🟣' : s.advisor === 'mistral' ? '🟢' : s.advisor === 'minouch' ? '🔵' : '⚪️';
        return '  ' + tag + ' ' + s.advisor + ' · ' + s.duration_ms + 'ms · conf ' + s.confidence + '\\n     ' + (s.response || '').slice(0, 220).replace(/\\n/g,' ');
      }).join('\\n');
      const head = '▸ ' + (d.created_at || '').slice(0, 19) + '   ' + d.id.slice(0, 8);
      const inp = '   in : ' + (d.input || '').slice(0, 120);
      const out = '   out: ' + (d.final_output || '').slice(0, 220).replace(/\\n/g,' ');
      return [head, inp, out, stepLines].join('\\n');
    }));
    setOut('trace-out', blocks.join('\\n\\n'));
  } catch (e) { setOut('trace-out', 'err: ' + e.message); }
}
loadTrace();
$('trace-refresh').addEventListener('click', loadTrace);

// Briefing
async function loadBriefing() {
  setOut('briefing-out', '… loading …');
  try {
    const r = await fetch('/briefing/latest');
    const d = await r.json();
    if (!d.ok && d.message) { setOut('briefing-out', d.message, { empty: true }); return; }
    const focus = d.focus?.line || '(no focus line)';
    const inbox = d.gmail?.summary || '—';
    const cal   = d.calendar?.summary || '—';
    const when  = (d.ts || '').replace('T', ' ').slice(0, 19) + ' UTC';
    setOut('briefing-out',
      '✨ ' + focus + '\\n\\n' +
      '📧 ' + inbox + '\\n' +
      '📅 ' + cal + '\\n\\n' +
      '— ' + when + ' · ' + (d.duration_ms || 0) + 'ms');
  } catch (e) { setOut('briefing-out', 'err: ' + e.message); }
}
loadBriefing();
$('briefing-refresh').addEventListener('click', loadBriefing);
$('briefing-run').addEventListener('click', async () => {
  busy($('briefing-run'), true);
  setOut('briefing-out', '… composing today\\'s briefing (gmail + calendar + nao44) …');
  try {
    const r = await fetch('/briefing/run', { method: 'POST', headers: H });
    const d = await r.json();
    if (!d.ok) { setOut('briefing-out', 'err: ' + JSON.stringify(d)); }
    else { await loadBriefing(); refreshPulse(); }
  } catch (e) { setOut('briefing-out', 'err: ' + e.message); }
  busy($('briefing-run'), false);
});

// Recap
async function loadRecap() {
  setOut('recap-out', '… loading …');
  try {
    const r = await fetch('/recap/latest');
    const d = await r.json();
    if (!d.ok && d.message) { setOut('recap-out', d.message, { empty: true }); return; }
    const para  = d.recap?.paragraph || '(no recap yet)';
    const calls = d.stats?.council_calls_today ?? 0;
    const tok   = d.stats?.total_tokens_today ?? 0;
    const cache = ((d.stats?.cache_hit_today || 0) * 100).toFixed(1);
    const refl  = d.stats?.last_reflection || '—';
    const when  = (d.ts || '').replace('T', ' ').slice(0, 19) + ' UTC';
    setOut('recap-out',
      '🌙 ' + para + '\\n\\n' +
      '📊 ' + calls + ' calls · ' + tok.toLocaleString() + ' tokens · cache ' + cache + '%\\n' +
      '🪞 last reflection: ' + refl + '\\n\\n' +
      '— ' + when + ' · ' + (d.duration_ms || 0) + 'ms');
  } catch (e) { setOut('recap-out', 'err: ' + e.message); }
}
loadRecap();
$('recap-refresh').addEventListener('click', loadRecap);
$('recap-run').addEventListener('click', async () => {
  busy($('recap-run'), true);
  setOut('recap-out', '… composing today\\'s recap (council + metrics + haiku) …');
  try {
    const r = await fetch('/recap/run', { method: 'POST', headers: H });
    const d = await r.json();
    if (!d.ok) { setOut('recap-out', 'err: ' + JSON.stringify(d)); }
    else { await loadRecap(); refreshPulse(); }
  } catch (e) { setOut('recap-out', 'err: ' + e.message); }
  busy($('recap-run'), false);
});

// Voice test (uses /talk's TTS path indirectly via council; simpler: just hit ElevenLabs through /talk)
// For now, route through /council and announce no-tts here — full voice already lives on /voice page.
$('voice-go').addEventListener('click', async () => {
  setOut('voice-out', 'For full voice round-trip use the /voice page (tap-to-talk). This panel will get a quick TTS preview later.');
});
</script>
</body>
</html>`
