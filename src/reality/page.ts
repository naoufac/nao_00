// /reality — single-source-of-truth audit page.
// V1: static — renders the latest audit doc + pain-point status.
// Probes are run by external scripts (e.g. /tmp/probe.sh) and recorded in audit/evidence/.
// V2 plan: pull live probe results from KV (key 'reality:latest') updated by an external probe.

const REALITY_DOC = `Reality is the page you're on. Probe results are computed externally and surfaced here.\n\nFor the full audit narrative, see /home/naoclaw/nao00/STATE-OF-NAO00.md and /home/naoclaw/nao00/audit/LOG.md.\n\nThe pain-point checklist below is what Naoufal said was broken on 2026-05-08. Each item shows current status.`

const PAIN_POINTS = [
  { id: 1, text: 'Agents die on reboot — no auto-start', status: 'shipped', detail: 'Docker containers on `unless-stopped` (2026-05-07). @reboot crontabs added on Anouf+Nemo+Jasmine+Vehea-sibling restore named tmux sessions automatically. Naoufal `tmux attach -t <name>` post-reboot to find a fresh shell. Claude CLI inside the session is NOT auto-restarted (would burn credits idle).' },
  { id: 2, text: 'New sessions spawn Opus 4.6 instead of 4.7', status: 'shipped', detail: 'Pinned `model: claude-opus-4-7` in 4 settings.json files (Anouf naoclaw, Nemo root+naoclaw, Jasmine, Anouf-Vehea sibling). OpenClaw containers also verified at 4.7.' },
  { id: 3, text: "Naoufal clicks 'OK' on every permission prompt", status: 'shipped', detail: 'defaultMode: acceptEdits + a SAFE 6-entry baseline allow-list propagated to Anouf+Nemo+Jasmine+Vehea-sibling user settings.json. Per-host expansion is now incremental via /fewer-permission-prompts skill. Mayor blocked on SSH key.' },
  { id: 4, text: 'Dashboard "in progress" for days', status: 'partial', detail: '/dashboard 🔴 Live activity panel (pulse, 10s refresh, NEW-item flash). Header links to /reality + /remote. Streaming + archive view (#3) still open.' },
  { id: 5, text: 'No buttons to start/talk/pause agents', status: 'partial', detail: '/remote 🛰 fleet ops panel + live status pills (green/yellow/red from /fleet/heartbeat). 4/5 hosts beating every 5min. Real start/talk/pause delivery (#16) is its own project.' },
  { id: 6, text: 'No live ship-view', status: 'shipped', detail: 'Pillar metric card below — fleet-aggregated $ + per-host breakdown via /metrics/fleet/usage, hourly cron from Anouf via SSH+ccusage.' },
]

const SHIPPED_THIS_SESSION = [
  { ts: '00:50 UTC', text: 'Anouf disk freed 6.27 GB (docker builder + dangling images + npm cache); 72% → 61% full' },
  { ts: '00:48 UTC', text: '/llm/together/test — Together.ai client live (Llama 3.3 70B Turbo default; Llama 4 Maverick available via opts.model)' },
  { ts: '00:42 UTC', text: '@reboot tmux-restore on all 4 reachable hosts — sessions survive reboots (claude CLI must be re-launched manually post-reboot)' },
  { ts: '00:38 UTC', text: 'Safe baseline allow-list propagated to Anouf+Nemo+Jasmine+Vehea — 6 entries (Composio search/schemas + ccusage + worker reads)' },
  { ts: '00:36 UTC', text: '/fleet/heartbeat + /fleet/status — KV-backed live status pills on /remote (4/5 hosts green, Mayor blocked)' },
  { ts: '00:30 UTC', text: '/metrics/fleet/usage — fleet-aggregated pillar metric: $343.89 across 3 hosts; hourly Anouf cron via SSH+ccusage' },
  { ts: '00:28 UTC', text: 'GMI Cloud wired — GMI_CLOUD_API_KEY in secrets + Worker; SSH key registered as ANOUF; H100/H200 GPU lane' },
  { ts: '00:26 UTC', text: 'Vehea sibling upgraded — settings.json + Stop hook synced from Anouf; same model 4.7 + acceptEdits baseline' },
  { ts: '00:24 UTC', text: '/remote 🛰 fleet ops panel — 5 agents listed with role/IP/domain + open-each-agent links' },
  { ts: '00:18 UTC', text: '/dashboard 🔴 Live activity — pulse, 10s refresh, NEW-item flash for fresh tool calls' },
  { ts: '00:16 UTC', text: 'Stop hook wired (~/.claude/hooks/stop-blocker.sh) — session never ends while tasks pending; escape with `touch /tmp/let-claude-stop`' },
  { ts: '00:12 UTC', text: 'Together.ai live — TOGETHER_API_KEY in ~/secrets/all-keys.env + Worker secret' },
  { ts: '00:08 UTC', text: 'Doppler verified connected via Composio MCP — central secret vault unlock' },
  { ts: '23:55 UTC', text: '/dashboard header links to 🔎 Reality + 🎛 Remote — visible navigation for the truth doc' },
  { ts: '23:18 UTC', text: 'POST /notify/alert — fleet watchdogs can scream into Slack now' },
  { ts: '23:22 UTC', text: 'Opus 4.7 pinned across the fleet (4 settings.json files)' },
  { ts: '23:25 UTC', text: 'OpenClaw fleet stabilized — installed claude CLI in all 8 containers' },
  { ts: '23:27 UTC', text: 'CLAUDE.md domain lie corrected — no longer claims dash/bot domains are live' },
  { ts: '22:50 UTC', text: 'Anouf state snapshot to Nemo (/root/anouf-snapshots/)' },
  { ts: '22:51 UTC', text: 'Watchdog cron on Nemo (every 5 min, alerts after >30 min Anouf silence)' },
  { ts: '23:03 UTC', text: 'Anouf-Vehea sibling provisioned (Nemo:/root/anouf-vehea/)' },
]

const STILL_BROKEN = [
  '`dash.nchobah.com`, `dash.gab44.com`, `bot.gab44.com` — wired in wrangler routes but FastComet zones don\'t auto-provision',
  'Apex `nchobah.com` and `www.nchobah.com` — DNS to Anouf but traefik has no Host rule → 404',
  '`naoclaw.nchobah.com` — referenced as redirect target but unreachable',
  '`n8n.nchobah.com` — DNS works, traefik routes, but origin returns 000 (LE cert or origin issue)',
  'OpenClaw image rebuild needed (per-container `npm install -g claude` is ephemeral)',
]

export const REALITY_PAGE_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nao00 — Reality</title>
<style>
  :root { --bg:#faf9f5; --panel:#fff; --line:rgba(34,24,12,0.10); --fg:#1a1815; --mute:#5a564e; --accent:#c96442; --good:#2e9e6a; --warn:#d59315; --bad:#d63d4d; --soft:#f1ede4; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 24px 18px 80px; }
  h1 { font-size: 22px; letter-spacing: -0.01em; margin: 0 0 4px; }
  .sub { color: var(--mute); font-size: 12px; margin-bottom: 18px; font-family:'JetBrains Mono',monospace; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin-bottom:16px; }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--mute); margin:0 0 10px; }
  .pp { padding:10px 0; border-bottom:1px dashed var(--line); display:flex; gap:10px; align-items:flex-start; }
  .pp:last-child { border-bottom:0; }
  .pp .icon { font-size:18px; flex-shrink:0; line-height:1; padding-top:2px; }
  .pp .text { flex:1; }
  .pp .text .title { font-weight:600; }
  .pp .text .det { color:var(--mute); font-size:12.5px; margin-top:3px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-left:6px; }
  .badge.shipped { background:#e7f5ed; color:var(--good); }
  .badge.partial { background:#fdf3df; color:var(--warn); }
  .badge.open { background:#fbe5e7; color:var(--bad); }
  .row { padding:6px 0; display:flex; gap:10px; font-size:13px; }
  .row .ts { color:var(--mute); font-family:'JetBrains Mono',monospace; font-size:11.5px; flex-shrink:0; padding-top:2px; }
  .row.broken { color:#7a3036; }
  .row.broken::before { content:'🔴 '; }
  .doc { white-space:pre-wrap; font-size:13px; line-height:1.7; }
  .footer { color:var(--mute); font-size:11px; margin-top:24px; }
  a { color:var(--accent); }
  code { background:var(--soft); padding:1px 4px; border-radius:4px; font-size:12px; }
</style>
</head><body><div class="wrap">
<h1>🔎 nao_00 — Reality</h1>
<div class="sub">last updated 2026-05-08 00:50 UTC · auto-revised by Anouf · regenerate via redeploy</div>

<div class="card" id="pillarCard">
  <h2>💚 Pillar metric — fleet API usage</h2>
  <div id="pillarBody" style="font-size:13px;line-height:1.6;color:var(--mute);">loading <code>/metrics/fleet/usage</code>…</div>
</div>
<script>
(async () => {
  try {
    const r = await fetch('/metrics/fleet/usage');
    if (!r.ok) { document.getElementById('pillarBody').innerHTML = 'no snapshot yet — hourly cron will populate'; return; }
    const d = await r.json();
    const t = d.fleet_totals || {};
    const hosts = d.hosts || {};
    const fmt$ = (n) => n == null ? '—' : '$' + Number(n).toFixed(2);
    const fmtT = (n) => n == null ? '—' : (Number(n) / 1e6).toFixed(1) + 'M';
    const rows = Object.entries(hosts).map(([h, v]) => {
      const c = v.cost_usd, t2 = v.tokens;
      const note = v.note ? ' <span style="color:#7a3036">' + v.note + '</span>' : '';
      return '<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12.5px;"><span><b>' + h + '</b>' + note + '</span><span style="font-variant:tabular-nums;color:#1a1815;">' + fmt$(c) + ' · ' + fmtT(t2) + ' tok</span></div>';
    }).join('');
    document.getElementById('pillarBody').innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;"><span style="font-size:24px;font-weight:700;color:#2e9e6a;font-variant:tabular-nums;">' + fmt$(t.cost_usd) + '</span><span style="color:var(--mute);font-size:11px;font-family:JetBrains Mono,monospace;">' + (t.hosts_seen || 0) + '/' + ((t.hosts_seen || 0) + (t.hosts_missing || 0)) + ' hosts · ' + (d.captured_at || 'unknown') + '</span></div>' +
      '<div style="margin-bottom:6px;color:#1a1815;">' + fmtT(t.tokens) + ' tokens across the fleet — the religion: API use up = system alive</div>' +
      rows;
  } catch (e) { document.getElementById('pillarBody').textContent = 'err: ' + e.message; }
})();
</script>

<div class="card">
  <h2>What's broken right now</h2>
  __BROKEN__
</div>

<div class="card">
  <h2>Naoufal's pain-point checklist (2026-05-08)</h2>
  __PAIN__
</div>

<div class="card">
  <h2>Shipped this session</h2>
  __SHIPPED__
</div>

<div class="card">
  <h2>Audit notes</h2>
  <div class="doc">__DOC__</div>
</div>

<div class="footer">Sources: <code>/home/naoclaw/nao00/STATE-OF-NAO00.md</code> · <code>/home/naoclaw/nao00/audit/LOG.md</code> · also at <a href="/dashboard">/dashboard</a> · <a href="/remote">/remote</a></div>
</div></body></html>`

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))

export function renderRealityPage(): string {
  const pp = PAIN_POINTS.map(x => {
    const icon = x.status === 'shipped' ? '✅' : x.status === 'partial' ? '⚠️' : '🔴'
    return `<div class="pp"><div class="icon">${icon}</div><div class="text"><span class="title">${x.id}. ${escapeHtml(x.text)}</span><span class="badge ${x.status}">${x.status}</span><div class="det">${escapeHtml(x.detail)}</div></div></div>`
  }).join('')
  const ship = SHIPPED_THIS_SESSION.map(s => `<div class="row"><span class="ts">${s.ts}</span><span>${escapeHtml(s.text)}</span></div>`).join('')
  const broken = STILL_BROKEN.map(t => `<div class="row broken"><span>${escapeHtml(t)}</span></div>`).join('')
  return REALITY_PAGE_HTML
    .replace('__PAIN__', pp)
    .replace('__SHIPPED__', ship)
    .replace('__BROKEN__', broken)
    .replace('__DOC__', escapeHtml(REALITY_DOC))
}
