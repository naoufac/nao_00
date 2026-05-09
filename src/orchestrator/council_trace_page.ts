// Trace page for /council/ten/:id — plain HTML, mobile-first.

import type { CouncilOfTenResult, AdvisorReply, DissentItem } from './council_of_ten'

const palette = {
  bg: '#faf9f5',
  ink: '#1a1a1a',
  muted: '#6b6b6b',
  card: '#ffffff',
  border: '#e8e6dc',
  yes: '#3a8a3f',
  no: '#c0392b',
  conditional: '#c96442',
  dim: '#9a9a9a',
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function verdictTag(v: string | null): string {
  if (!v) return `<span class="tag dim">no-verdict</span>`
  if (v === 'yes') return `<span class="tag yes">yes</span>`
  if (v === 'no') return `<span class="tag no">no</span>`
  return `<span class="tag cond">${escapeHtml(v)}</span>`
}

function advisorCard(a: AdvisorReply): string {
  const meta = `${a.provider} · ${a.model.split('/').pop()}`
  const evidence = (a.key_evidence || []).slice(0, 6)
    .map(c => `<code>${escapeHtml(c)}</code>`).join(' ')
  return `
    <div class="advisor">
      <div class="advisor-head">
        <strong>${escapeHtml(a.advisor)}</strong>
        ${verdictTag(a.verdict)}
      </div>
      <div class="advisor-meta">${escapeHtml(meta)} · conf ${(a.confidence * 100).toFixed(0)}% · ${a.duration_ms}ms${a.input_tokens ? ` · ${a.input_tokens}+${a.output_tokens || 0} tok` : ''}</div>
      ${a.error ? `<div class="advisor-error">⚠️ ${escapeHtml(a.error)}</div>` : ''}
      <div class="advisor-reason">${escapeHtml(a.reason || '(no reason given)')}</div>
      ${evidence ? `<div class="advisor-evidence">cited: ${evidence}</div>` : ''}
    </div>
  `
}

function dissentRow(d: DissentItem): string {
  return `
    <div class="dissent-row">
      <div class="dissent-q">${escapeHtml(d.question)}</div>
      <div class="dissent-cols">
        <div><strong style="color:${palette.yes}">agree</strong> ${d.agree.map(escapeHtml).join(', ') || '—'}</div>
        <div><strong style="color:${palette.no}">disagree</strong> ${d.disagree.map(escapeHtml).join(', ') || '—'}</div>
      </div>
    </div>
  `
}

export function renderCouncilTracePage(result: CouncilOfTenResult): string {
  const synth = result.synth
  const recColor = synth?.recommendation === 'yes' ? palette.yes
    : synth?.recommendation === 'no' ? palette.no
    : palette.conditional
  const validCount = result.advisors.filter(a => a.verdict).length

  const advisorsHtml = result.advisors.map(advisorCard).join('\n')
  const evidenceHtml = result.evidence.citations.length === 0
    ? `<div class="muted">No citations gathered (${escapeHtml(result.evidence.source)}).</div>`
    : `<ol class="cites">${result.evidence.citations.map(c => `
        <li id="${escapeHtml(c.id)}">
          <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(c.title || c.url)}</strong></a>
          <div class="cite-meta">[${escapeHtml(c.id)}] · Q${c.query_idx}</div>
          <div class="cite-snip">${escapeHtml(c.snippet)}</div>
        </li>`).join('')}</ol>`

  const queriesHtml = result.evidence.queries.map((q, i) => `<li>Q${i + 1}: ${escapeHtml(q)}</li>`).join('')

  const dissentHtml = synth && synth.dissent_map.length
    ? synth.dissent_map.map(dissentRow).join('\n')
    : `<div class="muted">No surface disagreements recorded.</div>`

  const errorsHtml = result.errors.length
    ? `<details class="errors"><summary>${result.errors.length} non-fatal warning(s)</summary><ul>${result.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></details>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Council of Ten — ${escapeHtml(result.id.slice(0, 8))}</title>
  <style>
    *,*::before,*::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: ${palette.bg}; color: ${palette.ink};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      line-height: 1.5; padding: 16px 14px 60px; max-width: 920px; margin: 0 auto;
    }
    h1 { font-size: 1.4rem; margin: 0 0 4px; line-height: 1.25; }
    h2 { font-size: 1.05rem; margin: 28px 0 10px; border-bottom: 1px solid ${palette.border}; padding-bottom: 4px; }
    .meta { color: ${palette.muted}; font-size: 0.85rem; margin-bottom: 18px; }
    .topic { background: ${palette.card}; border: 1px solid ${palette.border}; border-radius: 10px; padding: 12px 14px; }
    .rec {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      background: ${palette.card}; border: 1px solid ${palette.border}; border-left: 4px solid ${recColor};
      border-radius: 10px; padding: 14px; margin-top: 14px;
    }
    .rec-verdict { font-size: 1.4rem; font-weight: 700; color: ${recColor}; text-transform: uppercase; }
    .rec-stats { color: ${palette.muted}; font-size: 0.85rem; }
    .rec-rationale { width: 100%; margin-top: 8px; font-size: 0.95rem; }
    .grid {
      display: grid; gap: 10px; margin-top: 6px;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    }
    .advisor {
      background: ${palette.card}; border: 1px solid ${palette.border}; border-radius: 8px;
      padding: 10px 12px; font-size: 0.9rem;
    }
    .advisor-head { display: flex; align-items: center; justify-content: space-between; }
    .advisor-meta { color: ${palette.muted}; font-size: 0.78rem; margin: 4px 0 6px; }
    .advisor-error { color: ${palette.no}; font-size: 0.8rem; margin: 4px 0; }
    .advisor-reason { font-size: 0.9rem; }
    .advisor-evidence { color: ${palette.muted}; font-size: 0.78rem; margin-top: 6px; }
    .tag { padding: 1px 7px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
    .tag.yes { background: #e6f5e7; color: ${palette.yes}; }
    .tag.no { background: #fbe6e3; color: ${palette.no}; }
    .tag.cond { background: #fbe9e0; color: ${palette.conditional}; }
    .tag.dim { background: #eee; color: ${palette.dim}; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #f1efe6; padding: 1px 4px; border-radius: 3px; font-size: 0.8em; }
    .cites { padding-left: 20px; }
    .cites li { margin-bottom: 8px; }
    .cite-meta { color: ${palette.muted}; font-size: 0.78rem; }
    .cite-snip { color: ${palette.ink}; font-size: 0.86rem; margin-top: 2px; }
    .queries { color: ${palette.muted}; font-size: 0.88rem; padding-left: 20px; }
    .queries li { margin-bottom: 2px; }
    .dissent-row { background: ${palette.card}; border: 1px solid ${palette.border}; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
    .dissent-q { font-weight: 600; margin-bottom: 6px; }
    .dissent-cols { display: grid; gap: 4px; grid-template-columns: 1fr 1fr; font-size: 0.86rem; }
    .muted { color: ${palette.muted}; }
    .errors { margin-top: 18px; font-size: 0.85rem; }
    .errors ul { padding-left: 20px; }
    .footer { margin-top: 28px; color: ${palette.muted}; font-size: 0.78rem; }
    @media (max-width: 480px) {
      .dissent-cols { grid-template-columns: 1fr; }
      h1 { font-size: 1.2rem; }
    }
  </style>
</head>
<body>
  <h1>Council of Ten</h1>
  <div class="meta">id <code>${escapeHtml(result.id)}</code> · ${result.duration_ms}ms · ${new Date().toISOString().slice(0, 19)}Z</div>

  <div class="topic"><strong>Question</strong><br/>${escapeHtml(result.topic)}</div>

  <div class="rec">
    <span class="rec-verdict">${synth ? escapeHtml(synth.recommendation) : 'NO SYNTH'}</span>
    <span class="rec-stats">
      ${synth ? `confidence ${(synth.confidence * 100).toFixed(0)}%` : ''} ·
      ${validCount}/${result.advisors.length} advisors voted ·
      agreement ${result.agreement_pct}% ·
      synthesizer: ${synth ? escapeHtml(synth.synth_provider) + ' · ' + escapeHtml(synth.synth_model.split('/').pop() || '') : '(none)'}
    </span>
    ${synth ? `<div class="rec-rationale">${escapeHtml(synth.rationale)}</div>` : ''}
  </div>

  <h2>Evidence pack <span class="muted" style="font-weight:400;font-size:0.85rem">(${escapeHtml(result.evidence.source)} · ${result.evidence.citations.length} citations · ${result.evidence.duration_ms}ms)</span></h2>
  <details>
    <summary>5 you.com queries</summary>
    <ol class="queries">${queriesHtml}</ol>
  </details>
  ${evidenceHtml}

  <h2>Advisors (${result.advisors.length})</h2>
  <div class="grid">${advisorsHtml}</div>

  <h2>Dissent map</h2>
  ${dissentHtml}

  ${errorsHtml}

  <div class="footer">
    nao_00 · Council of Ten — built per <code>~/nao00/PLAN-COUNCIL-OF-TEN.md</code>
  </div>
</body>
</html>`
}
