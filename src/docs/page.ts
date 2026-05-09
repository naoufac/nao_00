// /docs — read-only viewer for the embedded planning + reference docs.
// Public (no bearer). Body is rendered as <pre> with nice typography +
// soft markdown highlighting (no third-party md library — the docs are
// already meant to be read as plain markdown).

import { DOCS, EmbeddedDoc } from './embedded'

// Comparison documents that already live elsewhere (council-of-ten traces,
// research bundles). Linked from the index so Naoufal has one place.
const EXTERNAL_LINKS: { name: string; href: string; summary: string }[] = [
  {
    name: 'Google AI Ultra — Council of Ten verdict',
    href: '/council/ten/0c1f718a-280c-4bca-afe4-c32a681cce02',
    summary: '8 advisors, 20 you.com citations, conditional@75% confidence with dissent. Most recent comparison ship.',
  },
  {
    name: 'Live API spend per source',
    href: '/metrics/api-use',
    summary: 'JSON. Source-by-source token + call breakdown. Pillar metric.',
  },
  {
    name: 'Reality page',
    href: '/reality',
    summary: 'Pain points + shipped log + still-broken list. The "what is true now" surface.',
  },
  {
    name: 'Tasks page',
    href: '/tasks',
    summary: 'Goals, stream runs, crons, pain points — auto-refresh.',
  },
]

const STYLE = `
  :root {
    --bg:#faf9f5; --panel:#fff; --line:rgba(34,24,12,0.10);
    --fg:#1a1815; --mute:#5a564e; --accent:#c96442;
    --soft:#f1ede4;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 24px 18px 80px; }
  header { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom: 18px; }
  h1 { font-size: 24px; letter-spacing: -0.01em; margin: 0; }
  .sub { color: var(--mute); font-size: 12px; font-family:'JetBrains Mono', monospace; }
  .nav a { color: var(--accent); text-decoration: none; font-size: 12px; padding: 4px 10px; border:1px solid #c9644244; border-radius: 999px; background:#c9644211; margin-left:6px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; transition: transform .12s ease, border-color .12s ease; display:block; text-decoration: none; color: inherit; }
  .card:hover { transform: translateY(-1px); border-color: var(--accent); }
  .card .title { font-weight: 600; font-size: 15px; }
  .card .summary { color: var(--mute); font-size: 13px; margin-top: 4px; }
  .card .meta { color: var(--mute); font-size: 11px; font-family:'JetBrains Mono', monospace; margin-top: 6px; }
  .group-h { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--mute); margin: 18px 0 8px; }
  pre.doc { background: var(--panel); border:1px solid var(--line); border-radius: 12px; padding: 18px 20px; white-space: pre-wrap; word-wrap: break-word; font-family:'JetBrains Mono', "SF Mono", Menlo, monospace; font-size: 13px; line-height: 1.65; color: var(--fg); }
  pre.doc h-mark { background: linear-gradient(transparent 60%, #ffe17066 60%); padding: 0 2px; font-weight: 700; }
  .back { color: var(--accent); text-decoration: none; font-size: 13px; }
  .toolbar { display:flex; gap: 8px; margin: 12px 0; }
  .toolbar button { font: 12px/1 inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); cursor: pointer; }
  .toolbar button:hover { border-color: var(--accent); }
`

export function buildDocsIndex(): string {
  const cards = Object.entries(DOCS).map(([key, doc]) => `
    <a class="card" href="/docs/${key}">
      <div class="title">📄 ${escape(doc.title)}</div>
      <div class="summary">${escape(doc.summary)}</div>
      <div class="meta">${(doc.body.length / 1024).toFixed(1)} KB · plain text</div>
    </a>`).join('')

  const ext = EXTERNAL_LINKS.map(e => `
    <a class="card" href="${e.href}">
      <div class="title">🔗 ${escape(e.name)}</div>
      <div class="summary">${escape(e.summary)}</div>
      <div class="meta">${escape(e.href)}</div>
    </a>`).join('')

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nao00 — Docs</title>
<style>${STYLE}</style>
</head><body><div class="wrap">
  <header>
    <div>
      <h1>📚 Docs</h1>
      <div class="sub">everything we said and planned · auto-embedded on each deploy</div>
    </div>
    <div class="nav">
      <a href="/dashboard">📊 Dashboard</a>
      <a href="/tasks">🎯 Tasks</a>
      <a href="/reality">🔎 Reality</a>
    </div>
  </header>

  <div class="group-h">Embedded planning + reference</div>
  ${cards}

  <div class="group-h">Comparison + live surfaces</div>
  ${ext}
</div></body></html>`
}

export function buildDocPage(name: string): string | null {
  const doc = DOCS[name]
  if (!doc) return null
  const body = renderMarkdown(doc.body)
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escape(doc.title)} — nao00</title>
<style>${STYLE}</style>
</head><body><div class="wrap">
  <header>
    <div>
      <a class="back" href="/docs">← all docs</a>
      <h1 style="margin-top:4px;">${escape(doc.title)}</h1>
      <div class="sub">${(doc.body.length / 1024).toFixed(1)} KB · ${doc.body.split('\n').length} lines</div>
    </div>
    <div class="nav">
      <a href="/dashboard">📊</a>
      <a href="/tasks">🎯</a>
    </div>
  </header>
  <div class="toolbar">
    <button onclick="navigator.clipboard.writeText(document.querySelector('pre.doc').innerText).then(()=>{this.textContent='copied ✓'})">📋 copy</button>
    <button onclick="window.print()">🖨 print</button>
    <a class="back" style="margin-left:auto;align-self:center;" href="/docs/${escape(name)}/raw">view raw</a>
  </div>
  <pre class="doc">${body}</pre>
</div></body></html>`
}

export function getRawDoc(name: string): string | null {
  return DOCS[name]?.body ?? null
}

// Tiny safe markdown highlighter — bolds H1/H2/H3 and `inline code`.
// Keeps the <pre> structure so layout stays predictable on long docs.
function renderMarkdown(src: string): string {
  return escape(src)
    .replace(/^(#{1,3})\s+(.+)$/gm, (_m, h, t) => `<b style="font-size:${h.length === 1 ? 17 : h.length === 2 ? 15 : 14}px;color:#c96442;">${h} ${t}</b>`)
    .replace(/`([^`]+)`/g, '<code style="background:#f1ede4;padding:1px 5px;border-radius:4px;">$1</code>')
}

function escape(s: string): string {
  return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
}
