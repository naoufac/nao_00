// Browser-friendly viewer for the Manus archive (151 tasks).
// Bakes the bearer token client-side so Naoufal can browse without curl.
// Naoclaw warm palette per design north star.

export const MANUS_PAGE_HTML = (token: string) => `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Manus archive — 151 tasks</title>
<style>
  :root {
    --bg-0:#faf9f5; --bg-1:#fff; --bg-2:#f1ede4;
    --line:rgba(34,24,12,0.10); --line-strong:rgba(34,24,12,0.18);
    --fg:#1a1815; --fg-dim:#5a564e; --fg-muted:#8b8779;
    --accent:#c96442; --accent-soft:#fdebe2;
    --green:#2e9e6a; --amber:#d59315; --red:#d63d4d;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; font-family:'Inter',-apple-system,system-ui,sans-serif;
    background:
      radial-gradient(1100px 600px at -10% -10%, #fdf5e9 0%, transparent 50%),
      radial-gradient(900px 500px at 110% 110%, #f5e8df 0%, transparent 60%),
      var(--bg-0);
    color: var(--fg); min-height:100vh;
  }
  .wrap { max-width: 980px; margin: 0 auto; padding: 32px 22px 96px; }
  h1 { margin: 0 0 4px; font-size: 28px; font-weight: 800; }
  .sub { color: var(--fg-dim); margin: 0 0 22px; font-size: 14px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom: 18px; }
  input, select {
    padding: 10px 14px; border: 1px solid var(--line-strong);
    border-radius: 10px; font-size: 14px; background: var(--bg-1); color: var(--fg);
    font-family: inherit;
  }
  input { flex: 1; min-width: 240px; }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .stats { display:flex; gap:14px; font-size:13px; color:var(--fg-dim); flex-wrap:wrap; }
  .stat-chip { background: var(--bg-2); padding: 4px 12px; border-radius: 999px; }
  .stat-chip b { color: var(--fg); }
  .list { display: grid; gap: 10px; margin-top: 18px; }
  .card {
    background: var(--bg-1); border: 1px solid var(--line);
    border-radius: 14px; padding: 14px 18px; cursor: pointer;
    transition: border-color 0.15s, transform 0.05s;
  }
  .card:hover { border-color: var(--accent); }
  .card:active { transform: translateY(1px); }
  .card-h { display:flex; justify-content:space-between; align-items:start; gap:10px; }
  .card-title { font-weight: 600; font-size: 15px; line-height: 1.35; }
  .card-meta { display:flex; gap:8px; font-size: 12px; color: var(--fg-muted); margin-top: 6px; align-items:center; }
  .pill {
    display:inline-block; padding: 2px 9px; border-radius: 999px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
  }
  .pill.completed { background: #d8f1e3; color: var(--green); }
  .pill.pending   { background: #fbecc7; color: var(--amber); }
  .pill.failed    { background: #fadce0; color: var(--red); }
  .snippet { color: var(--fg-dim); font-size: 13px; margin-top: 6px; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .nav { font-size:13px; margin-bottom: 22px; }
  .nav a { color: var(--accent); text-decoration: none; margin-right: 14px; }
  .nav a:hover { text-decoration: underline; }
  .empty { color: var(--fg-muted); padding: 36px 0; text-align: center; }
</style>
</head>
<body>
  <main class="wrap">
    <div class="nav">
      <a href="/dashboard">← dashboard</a>
      <a href="/voice">voice</a>
      <a href="/healing">healing</a>
      <a href="/gab44">gab44</a>
    </div>
    <h1>📚 Manus archive</h1>
    <p class="sub">Every task you ever ran on Manus, searchable. Local mirror as of <span id="export-date">2026-05-07</span>.</p>

    <div class="row">
      <input id="q" placeholder="search title or content — try 'fiverr', 'astrology', 'shopify'" autofocus />
      <select id="status">
        <option value="">all status</option>
        <option value="completed">✅ completed</option>
        <option value="pending">⏳ pending</option>
        <option value="failed">❌ failed</option>
      </select>
    </div>

    <div class="stats" id="stats"></div>
    <div class="list" id="list"><div class="empty">Loading…</div></div>
  </main>

<script>
const TOKEN = ${JSON.stringify(token)};
const headers = { 'Authorization': 'Bearer ' + TOKEN };
const $q = document.getElementById('q');
const $status = document.getElementById('status');
const $list = document.getElementById('list');
const $stats = document.getElementById('stats');
let stats = null;

async function loadStats() {
  const r = await fetch('/manus/stats', { headers });
  if (!r.ok) return;
  stats = await r.json();
  renderStats();
}

function renderStats(filteredTotal) {
  if (!stats) return;
  const bs = stats.by_status || {};
  const chip = (label, n, cls) => '<span class="stat-chip"><b>' + n + '</b> ' + label + '</span>';
  $stats.innerHTML =
    chip('total', stats.total) +
    chip('✅ completed', bs.completed || 0) +
    chip('⏳ pending', bs.pending || 0) +
    chip('❌ failed', bs.failed || 0) +
    (filteredTotal !== undefined ? chip('shown', filteredTotal) : '');
}

let timer = null;
function debouncedSearch() {
  clearTimeout(timer);
  timer = setTimeout(search, 180);
}

async function search() {
  const q = $q.value.trim();
  const status = $status.value;
  const url = '/manus/search?limit=100' + (q ? '&q=' + encodeURIComponent(q) : '') + (status ? '&status=' + status : '');
  const r = await fetch(url, { headers });
  if (!r.ok) {
    $list.innerHTML = '<div class="empty">⚠️ ' + r.status + ' — ' + (r.status === 401 ? 'auth issue' : 'fetch failed') + '</div>';
    return;
  }
  const d = await r.json();
  renderStats(d.returned);
  if (!d.results.length) {
    $list.innerHTML = '<div class="empty">no matches</div>';
    return;
  }
  $list.innerHTML = d.results.map(r => {
    const snippet = (r.user || r.asst || '').slice(0, 220);
    const date = (r.created || '').slice(0, 10);
    return '<a class="card" href="https://manus.im/app/' + r.id + '" target="_blank" rel="noopener">' +
      '<div class="card-h"><div class="card-title">' + escapeHtml(r.title || '(no title)') + '</div>' +
      '<span class="pill ' + r.status + '">' + r.status + '</span></div>' +
      '<div class="snippet">' + escapeHtml(snippet) + '</div>' +
      '<div class="card-meta">' + date + ' · ' + r.id.slice(0, 8) + ' · open in manus →</div>' +
      '</a>';
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

$q.addEventListener('input', debouncedSearch);
$status.addEventListener('change', search);

loadStats().then(search);
</script>
</body>
</html>`
