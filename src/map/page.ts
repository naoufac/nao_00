// /map — fleet inventory: domains, routes, fleet, models, crons, apps, secrets.
// "What's installed, what's running, what's idle." One screen, status lights, no chrome.
// Naoclaw warm palette.

export const MAP_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="theme-color" content="#faf9f5" />
<title>nao_00 — fleet map</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg: #faf9f5;
    --ink: #1a1a1a;
    --soft: #6b6b6b;
    --coral: #c96442;
    --coral-soft: #f4d8cc;
    --line: #ebe7df;
    --card: #fff;
    --green: #5fa55f;
    --yellow: #e0a040;
    --red: #d04040;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    background: var(--bg); color: var(--ink);
    padding: 16px 14px 40px; max-width: 980px; margin: 0 auto;
  }
  h1 { font-size: 22px; margin: 4px 0 4px; display: flex; gap: 10px; align-items: center; }
  .sub { color: var(--soft); font-size: 13px; margin-bottom: 18px; }
  .summary {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px; margin-bottom: 18px;
  }
  .pill {
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    padding: 10px 12px;
  }
  .pill .v { font-size: 22px; font-weight: 700; line-height: 1; color: var(--coral); }
  .pill .l { font-size: 11px; color: var(--soft); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }

  .section {
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    margin-bottom: 14px; overflow: hidden;
  }
  .section h2 {
    font-size: 13px; padding: 12px 14px; margin: 0;
    background: var(--coral-soft); color: var(--coral);
    border-bottom: 1px solid var(--line);
    text-transform: uppercase; letter-spacing: 0.05em;
    display: flex; justify-content: space-between; align-items: center;
  }
  .section h2 .count { font-weight: 400; color: var(--soft); font-size: 11px; }
  .row {
    display: grid; gap: 12px; align-items: center;
    padding: 10px 14px; border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .row:last-child { border-bottom: 0; }
  .row.domain  { grid-template-columns: 16px 2fr 90px 70px 1fr; }
  .row.route   { grid-template-columns: 16px 80px 1fr 2fr; }
  .row.fleet   { grid-template-columns: 16px 70px 1fr 1fr 80px; }
  .row.model   { grid-template-columns: 16px 1fr 1fr 110px 110px; }
  .row.cron    { grid-template-columns: 16px 130px 2fr 110px; }
  .row.app     { grid-template-columns: 16px 1fr; }
  .row.secret  { grid-template-columns: 16px 1fr 110px; }
  .row .name { font-weight: 600; }
  .row .meta { color: var(--soft); font-family: 'JetBrains Mono', monospace; font-size: 11.5px; }

  .light {
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--soft);
    box-shadow: 0 0 0 0 currentColor;
  }
  .light.green  { background: var(--green);  color: var(--green);  box-shadow: 0 0 0 3px rgba(95,165,95,.15); }
  .light.yellow { background: var(--yellow); color: var(--yellow); box-shadow: 0 0 0 3px rgba(224,160,64,.15); }
  .light.red    { background: var(--red);    color: var(--red);    box-shadow: 0 0 0 3px rgba(208,64,64,.15); }
  .light.gray   { background: #cfcabf; }

  .tag {
    display: inline-block; padding: 1px 8px; border-radius: 999px;
    background: var(--bg); border: 1px solid var(--line);
    font-size: 10px; color: var(--soft); text-transform: uppercase; letter-spacing: 0.05em;
  }
  .tag.live   { color: var(--green);  border-color: #cfe5cf; }
  .tag.idle   { color: var(--soft);   }
  .tag.broken { color: var(--red);    border-color: #f3cccc; }
  .tag.laptop { color: var(--coral); border-color: var(--coral-soft); }

  .actions {
    display: flex; gap: 6px; justify-content: flex-end;
  }
  .actions button {
    background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
    padding: 4px 8px; cursor: pointer; font-size: 11px; color: var(--soft);
  }
  .actions button:hover { background: var(--coral-soft); color: var(--coral); border-color: var(--coral-soft); }

  .loading { padding: 18px; color: var(--soft); text-align: center; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .topbar .gen { font-size: 11px; color: var(--soft); font-family: 'JetBrains Mono', monospace; }
  .topbar button {
    background: var(--coral); color: #fff; border: 0; border-radius: 999px;
    padding: 6px 14px; cursor: pointer; font-size: 12px; font-weight: 600;
  }

  details summary { cursor: pointer; padding: 4px 0; color: var(--soft); font-size: 11px; }
  details[open] summary { color: var(--coral); }
</style>
</head>
<body>

<div class="topbar">
  <h1>🗺️ <span>nao_00 fleet map</span></h1>
  <button id="refresh">↻ refresh</button>
</div>
<div class="sub">what's installed · what's running · what's idle. tap a row for actions.</div>
<div class="gen" id="gen"></div>

<div class="summary" id="summary"></div>

<div id="content">
  <div class="loading">⏳ probing fleet…</div>
</div>

<script>
const BEARER = 'nao00-council-2026';
const C = document.getElementById('content');
const S = document.getElementById('summary');
const G = document.getElementById('gen');
document.getElementById('refresh').addEventListener('click', () => load());

function light(status) {
  if (status === 'live')   return 'green';
  if (status === 'idle')   return 'yellow';
  if (status === 'broken' || status === 'unreachable') return 'red';
  return 'gray';
}

function row(cls, ...cells) {
  const div = document.createElement('div');
  div.className = 'row ' + cls;
  for (const c of cells) {
    const span = document.createElement('div');
    if (c instanceof HTMLElement) span.appendChild(c);
    else span.innerHTML = c;
    div.appendChild(span);
  }
  return div;
}

function pill(value, label) {
  const div = document.createElement('div');
  div.className = 'pill';
  div.innerHTML = '<div class="v">' + value + '</div><div class="l">' + label + '</div>';
  return div;
}

function section(title, count, rowsContainer) {
  const wrap = document.createElement('div');
  wrap.className = 'section';
  wrap.innerHTML = '<h2><span>' + title + '</span><span class="count">' + count + '</span></h2>';
  wrap.appendChild(rowsContainer);
  return wrap;
}

function lightDot(status) {
  const d = document.createElement('div');
  d.className = 'light ' + light(status);
  return d;
}

function fmt(n) {
  if (n == null) return '–';
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return String(n);
}

function timeAgo(iso) {
  if (!iso) return '–';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return Math.round(ms/1000) + 's ago';
  if (ms < 3600_000) return Math.round(ms/60000) + 'm ago';
  if (ms < 86400_000) return Math.round(ms/3600000) + 'h ago';
  return Math.round(ms/86400000) + 'd ago';
}

async function load() {
  C.innerHTML = '<div class="loading">⏳ probing fleet…</div>';
  try {
    const res = await fetch('/map/state', { headers: { 'Authorization': 'Bearer ' + BEARER }});
    const d = await res.json();
    G.textContent = 'snapshot: ' + new Date(d.generated_at).toLocaleTimeString();
    render(d);
  } catch (e) {
    C.innerHTML = '<div class="loading">load failed: ' + e.message + '</div>';
  }
}

function render(d) {
  // Summary pills
  S.innerHTML = '';
  const liveDom = d.domains.filter(x => x.status === 'live').length;
  const liveFleet = d.fleet.filter(x => x.status === 'live').length;
  const totalCalls = d.models.reduce((a, x) => a + x.calls_24h, 0);
  S.appendChild(pill(liveDom + '/' + d.domains.length, 'domains live'));
  S.appendChild(pill(liveFleet + '/' + d.fleet.length, 'fleet up'));
  S.appendChild(pill(d.worker_routes.length, 'worker routes'));
  S.appendChild(pill(d.models.length, 'models active 24h'));
  S.appendChild(pill(fmt(totalCalls), 'API calls 24h'));
  S.appendChild(pill(d.connected_apps.filter(x => x.has_connection).length, 'composio apps'));
  S.appendChild(pill(d.secrets.filter(x => x.bound).length + '/' + d.secrets.length, 'secrets bound'));

  C.innerHTML = '';

  // Domains
  let box = document.createElement('div');
  for (const x of d.domains) {
    box.appendChild(row('domain',
      lightDot(x.status),
      '<div><div class="name">' + x.name + '</div><div class="meta">' + (x.note || '') + '</div></div>',
      '<span class="tag ' + x.status + '">' + x.status + '</span>',
      '<span class="meta">' + (x.ms != null ? x.ms + 'ms' : '–') + '</span>',
      '<div class="actions"><button onclick="window.open(\\'https://' + x.name + '\\',\\'_blank\\')">open ↗</button></div>'
    ));
  }
  C.appendChild(section('🌐 domains', d.domains.length, box));

  // Fleet
  box = document.createElement('div');
  for (const x of d.fleet) {
    box.appendChild(row('fleet',
      lightDot(x.status),
      '<span class="tag ' + (x.kind === 'laptop' ? 'laptop' : x.status) + '">' + x.kind + '</span>',
      '<div><div class="name">' + x.name + '</div><div class="meta">' + x.domain + ' · ' + x.ip + '</div></div>',
      '<div class="meta">' + x.role + '</div>',
      '<span class="meta">' + (x.ms != null ? x.ms + 'ms' : '–') + '</span>'
    ));
  }
  C.appendChild(section('🤖 fleet (3 servers + 1 laptop)', d.fleet.length, box));

  // Models
  box = document.createElement('div');
  if (!d.models.length) {
    box.innerHTML = '<div class="loading">no API calls in last 24h</div>';
  } else {
    for (const x of d.models) {
      box.appendChild(row('model',
        lightDot('live'),
        '<div><div class="name">' + x.source + '</div><div class="meta">' + x.provider + '</div></div>',
        '<span class="meta">' + timeAgo(x.last_seen) + '</span>',
        '<span class="meta">' + fmt(x.calls_24h) + ' calls</span>',
        '<span class="meta">' + fmt(x.tokens_24h) + ' tokens</span>'
      ));
    }
  }
  C.appendChild(section('🧠 models (24h)', d.models.length, box));

  // Crons
  box = document.createElement('div');
  for (const x of d.crons) {
    box.appendChild(row('cron',
      lightDot(x.last_output ? 'live' : 'idle'),
      '<span class="meta">' + x.pattern + '</span>',
      '<div><div class="name">' + x.description + '</div><div class="meta">' + (x.last_output || 'no output yet') + '</div></div>',
      '<span class="meta">' + (x.last_output ? 'firing' : 'pending') + '</span>'
    ));
  }
  C.appendChild(section('⏰ crons', d.crons.length, box));

  // Worker routes
  box = document.createElement('div');
  const grouped = {};
  for (const r of d.worker_routes) (grouped[r.group] = grouped[r.group] || []).push(r);
  for (const g of Object.keys(grouped)) {
    const sub = document.createElement('details');
    sub.innerHTML = '<summary>' + g + ' · ' + grouped[g].length + ' routes</summary>';
    for (const x of grouped[g]) {
      const r = row('route',
        lightDot('live'),
        '<span class="tag idle">' + x.group + '</span>',
        '<div><div class="name">' + x.path + '</div></div>',
        '<div class="meta">' + x.description + '</div>'
      );
      sub.appendChild(r);
    }
    box.appendChild(sub);
  }
  C.appendChild(section('🔌 worker routes', d.worker_routes.length, box));

  // Connected apps
  box = document.createElement('div');
  for (const x of d.connected_apps) {
    box.appendChild(row('app',
      lightDot(x.has_connection ? 'live' : 'idle'),
      '<div><div class="name">' + x.toolkit + '</div></div>'
    ));
  }
  C.appendChild(section('🧩 composio toolkits', d.connected_apps.length, box));

  // Secrets
  box = document.createElement('div');
  for (const x of d.secrets) {
    box.appendChild(row('secret',
      lightDot(x.bound ? 'live' : 'idle'),
      '<div><div class="name">' + x.name + '</div><div class="meta">' + x.source + '</div></div>',
      '<span class="tag ' + (x.bound ? 'live' : 'idle') + '">' + (x.bound ? 'bound' : 'missing') + '</span>'
    ));
  }
  C.appendChild(section('🔑 secrets', d.secrets.length, box));
}

load();
</script>
</body>
</html>`
