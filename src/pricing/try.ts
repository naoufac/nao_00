// /try — free 1-query council demo for anonymous visitors. Closes the
// experience gap: previously a visitor had to pay BEFORE seeing what the
// product does. Now they get one full council answer, then a friendly
// nudge into /pricing for the unlimited tier.
//
// Rate-limited per-IP via KV (1 query per IP per 24h) so this can be
// linked publicly without becoming free LLM usage.

import { councilPipeline } from '../council/pipeline'
import { SITE_URL } from '../util/identity'

const FREE_QUERIES_PER_DAY = 1
const TTL_SECONDS = 60 * 60 * 24

function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown'
}

export async function handleTryGet(_req: Request): Promise<Response> {
  return new Response(TRY_PAGE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export async function handleTryPost(c: any): Promise<Response> {
  const ip = clientIp(c.req.raw)
  const kvKey = `try:ip:${ip}`
  const used = await c.env.KV.get(kvKey)
  if (used) {
    return c.json({
      ok: false,
      error: 'rate_limited',
      message: 'You used your one free council query for today. The unlimited tier is $5 USDC for 30 days.',
      pricing: `${SITE_URL}/pricing`,
    }, 429)
  }
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid_json' }, 400) }
  const input = String(body?.input || '').trim().slice(0, 500)
  if (!input) return c.json({ ok: false, error: 'empty_input' }, 400)
  // Stamp the IP key BEFORE running so a parallel hit double-counts as one
  // free query, not two.
  await c.env.KV.put(kvKey, new Date().toISOString(), { expirationTtl: TTL_SECONDS })
  try {
    const result = await councilPipeline(input, c.env, c.env.KV, c.env.DB, null, null)
    return c.json({
      ok: true,
      input,
      answer: result.final_output,
      duration_ms: result.duration_ms,
      pricing: `${SITE_URL}/pricing`,
      cta: 'Loved it? $5 USDC unlocks unlimited council for 30 days.',
      conversation_id: result.id,
    })
  } catch (err: any) {
    // Don't burn the free query on a 500 — let the user retry.
    await c.env.KV.delete(kvKey)
    return c.json({ ok: false, error: `council_failed:${String(err?.message ?? err).slice(0, 200)}` }, 502)
  }
}

const TRY_PAGE_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Try the nao_00 council — one free question, no signup</title>
<meta name="description" content="One free council query, no signup. Ask anything — the council answers in 30 seconds. Unlimited tier $5 USDC / 30 days." />
<link rel="canonical" href="${SITE_URL}/try" />
<style>
  :root{ --bg-0:#0b0420; --bg-1:#1a0533; --bg-2:#3a0a4f; --ink:#f6e9ff; --ink-soft:#cbb8e3; --accent:#ffd25c; --accent-2:#ff7eb6; --card:#1c0d3aaa; --edge:#5b2a8a }
  *{ box-sizing:border-box } html,body{ margin:0;padding:0 }
  body{ font-family:-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif; color:var(--ink); background:radial-gradient(1200px 700px at 80% -10%,#4b1170 0%,transparent 60%),radial-gradient(900px 600px at -10% 110%,#ff7eb633 0%,transparent 55%),linear-gradient(180deg,var(--bg-0),var(--bg-1) 60%,var(--bg-2)); min-height:100vh; line-height:1.55 }
  .wrap{ max-width:720px; margin:0 auto; padding:56px 22px 96px }
  .pill{ display:inline-block; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); border:1px solid #ffd25c44; padding:6px 12px; border-radius:999px; background:#ffd25c11 }
  h1{ font-size:clamp(32px,5.5vw,46px); margin:16px 0 8px; line-height:1.08; background:linear-gradient(90deg,#fff,#ffd25c 40%,#ff7eb6 80%); -webkit-background-clip:text; background-clip:text; color:transparent }
  .sub{ color:var(--ink-soft); font-size:17px }
  .card{ background:var(--card); border:1px solid var(--edge); border-radius:18px; padding:22px; margin-top:28px }
  textarea{ width:100%; min-height:110px; padding:14px; border-radius:12px; background:#0006; color:var(--ink); border:1px solid #ffffff14; font-family:inherit; font-size:15px; resize:vertical }
  textarea:focus{ outline:none; border-color:var(--accent) }
  button{ margin-top:14px; padding:12px 22px; border-radius:999px; background:linear-gradient(90deg,#ffd25c,#ff7eb6); color:#1a0533; font-weight:700; border:none; cursor:pointer; font-size:15px }
  button:disabled{ opacity:.6; cursor:wait }
  .answer{ margin-top:18px; padding:18px; background:#0006; border:1px solid #ffffff14; border-radius:12px; white-space:pre-wrap; font-size:15.5px; line-height:1.65 }
  .meta{ margin-top:10px; font-size:12px; color:var(--ink-soft) }
  .cta{ margin-top:20px; padding:16px; background:linear-gradient(135deg,#ffd25c22,#ff7eb622); border:1px solid #ffd25c44; border-radius:12px }
  .cta a{ color:var(--accent); font-weight:700; text-decoration:none }
  .err{ color:#ff7eb6; margin-top:14px }
</style>
</head><body><div class="wrap">
  <span class="pill">✨ Try · nao_00 council</span>
  <h1>One free question. No signup.</h1>
  <p class="sub">Ask anything. The council — strategist + logic-checker + challenger + warm voice — answers in about 30 seconds. After this one, the unlimited tier is $5 USDC for 30 days at <a href="/pricing" style="color:var(--accent)">/pricing</a>.</p>
  <div class="card">
    <form id="f">
      <textarea name="input" id="i" placeholder="e.g. should I take the job offer in Berlin? Or — what does the 1212 angel number mean for me? Or — help me draft a hard email to my landlord."></textarea>
      <button id="b" type="submit">Ask the council</button>
    </form>
    <div id="out"></div>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault()
      const i = document.getElementById('i').value.trim()
      if (!i) return
      const btn = document.getElementById('b'); btn.disabled = true; btn.textContent = 'Thinking…'
      const out = document.getElementById('out'); out.innerHTML = ''
      try {
        const r = await fetch('/try', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ input: i }) })
        const j = await r.json()
        if (j.ok) {
          out.innerHTML = '<div class="answer">' + j.answer.replace(/</g,'&lt;') + '</div>' +
            '<div class="meta">conversation_id: ' + j.conversation_id + ' · ' + j.duration_ms + ' ms</div>' +
            '<div class="cta">💎 ' + j.cta + ' <a href="/pricing">See pricing →</a></div>'
        } else if (j.error === 'rate_limited') {
          out.innerHTML = '<div class="err">' + j.message + '</div><div class="cta">💎 <a href="/pricing">Upgrade to unlimited →</a></div>'
        } else {
          out.innerHTML = '<div class="err">' + (j.error || 'Something broke. Try again.') + '</div>'
        }
      } catch (err) {
        out.innerHTML = '<div class="err">Network error. Try again.</div>'
      }
      btn.disabled = false; btn.textContent = 'Ask the council'
    })
  </script>
</div></body></html>`
