// /continuity — first-thing-on-phone page.
// Server-rendered HTML, no JavaScript, mobile-first, ~100ms render.
// Three columns: Yesterday | Today | Pillar. Blockers banner at top.

import { ContinuityReport } from "./state"

export function renderContinuityPage(report: ContinuityReport | null): string {
  if (!report) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Continuity</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#faf9f5;color:#1a1a1a;padding:20px;max-width:900px;margin:0 auto}
.empty{text-align:center;padding:60px 20px;color:#888}</style></head>
<body><div class="empty"><h2>No continuity report yet</h2><p>The first report generates on the next hourly tick.</p></div></body></html>`
  }

  const ageMin = Math.round((Date.now() - report.ts) / 60000)
  const blockerHtml = report.blockers.length
    ? `<div class="blockers"><strong>Blockers (${report.blockers.length})</strong>${report.blockers.map(b => `<div class="blocker-item">${esc(b)}</div>`).join("")}</div>`
    : ""

  const trendIcon = report.pillar.trend === "up" ? "↑" : report.pillar.trend === "down" ? "↓" : "→"
  const trendClass = report.pillar.trend === "up" ? "trend-up" : report.pillar.trend === "down" ? "trend-down" : "trend-flat"

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Continuity — nao_00</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#faf9f5;color:#1a1a1a;padding:12px;max-width:1000px;margin:0 auto;line-height:1.5}
h1{font-size:1.3em;margin-bottom:4px;color:#c96442}
.meta{font-size:.8em;color:#888;margin-bottom:12px}
.blockers{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:14px}
.blocker-item{font-size:.85em;padding:2px 0;color:#856404}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
@media(max-width:700px){.grid{grid-template-columns:1fr}}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:14px}
.card h2{font-size:1em;color:#c96442;margin-bottom:8px;border-bottom:1px solid #f0f0f0;padding-bottom:6px}
.stat{font-size:2em;font-weight:700;line-height:1.1}
.stat-label{font-size:.75em;color:#888;margin-bottom:8px}
.item{font-size:.85em;padding:3px 0;border-bottom:1px solid #f8f8f8}
.item:last-child{border:none}
.goal{display:flex;justify-content:space-between}
.goal .state{font-size:.75em;padding:2px 6px;border-radius:4px;background:#e8f5e9;color:#2e7d32}
.goal .state.running{background:#e3f2fd;color:#1565c0}
.trend-up{color:#2e7d32}
.trend-down{color:#c62828}
.trend-flat{color:#888}
.pillar-num{display:flex;gap:16px;margin-bottom:10px}
.pillar-num div{flex:1}
</style>
</head>
<body>
<h1>Continuity</h1>
<div class="meta">${report.date} &middot; ${ageMin}m ago &middot; nao_00</div>
${blockerHtml}
<div class="grid">
  <div class="card">
    <h2>Yesterday</h2>
    <div class="stat">${report.yesterday.conversations}</div>
    <div class="stat-label">conversations</div>
    <div class="item">Goals done: ${report.yesterday.goals_completed}</div>
    <div class="item">Goals failed: ${report.yesterday.goals_failed}</div>
    <div class="item">Skills extracted: ${report.yesterday.skills_extracted}</div>
  </div>
  <div class="card">
    <h2>Today</h2>
    <div class="stat">${report.today.active_goals.length}</div>
    <div class="stat-label">active goals</div>
    ${report.today.active_goals.map(g => `<div class="item goal"><span>${esc(g.goal.slice(0, 60))}</span><span class="state ${g.state}">${g.state}</span></div>`).join("")}
    ${report.today.calendar.length ? `<div style="margin-top:8px;font-size:.8em;color:#666"><strong>Calendar</strong></div>` : ""}
    ${report.today.calendar.map(c => `<div class="item">${esc(c)}</div>`).join("")}
    <div class="item">${report.today.pending_emails} emails in inbox</div>
  </div>
  <div class="card">
    <h2>Pillar</h2>
    <div class="pillar-num">
      <div><div class="stat ${trendClass}">${formatNum(report.pillar.total_calls_24h)} ${trendIcon}</div><div class="stat-label">API calls / 24h</div></div>
      <div><div class="stat">${formatNum(report.pillar.total_tokens_24h)}</div><div class="stat-label">tokens</div></div>
    </div>
    <div class="item">Cache hit: ${(report.pillar.cache_hit_ratio * 100).toFixed(1)}%</div>
    <div class="item ${trendClass}">${esc(report.pillar.trend_detail)}</div>
    ${report.pillar.top_models.map(m => `<div class="item">${esc(m.model)}: ${m.calls}</div>`).join("")}
  </div>
</div>
</body>
</html>`
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return String(n)
}
