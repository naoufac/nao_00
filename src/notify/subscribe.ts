// /subscribe — email-capture for the daily-horoscope newsletter.
//
// Visitor submits email → D1 row in `subscribers` → Gmail welcome via Composio.
// Idempotent on email: re-submitting the same address returns "already_subscribed".
// Table auto-created on first hit so no manual migration needed.
//
// Daily horoscope cron (later) will read this table and send personalized emails.

import { ComposioMCP } from '../tools/composio'
import { SITE_URL } from '../util/identity'

async function ensureTable(db: D1Database): Promise<void> {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS subscribers (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, source TEXT, created_at TEXT NOT NULL, status TEXT DEFAULT "active", last_email_at TEXT)'
  ).run()
}

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length < 250
}

export async function handleSubscribePost(c: any): Promise<Response> {
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid_json' }, 400) }
  const email = String(body?.email || '').trim().toLowerCase()
  const source = String(body?.source || 'subscribe_page').slice(0, 50)
  if (!isPlausibleEmail(email)) return c.json({ ok: false, error: 'invalid_email' }, 400)
  await ensureTable(c.env.DB)
  const existing = await c.env.DB.prepare('SELECT id, status FROM subscribers WHERE email = ?').bind(email).first<{ id: string; status: string }>()
  if (existing) return c.json({ ok: true, status: 'already_subscribed', id: existing.id })
  const id = 'sub_' + crypto.randomUUID().slice(0, 12)
  const now = new Date().toISOString()
  await c.env.DB.prepare(
    'INSERT INTO subscribers (id, email, source, created_at, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, email, source, now, 'active').run()

  // Fire-and-forget Gmail welcome via Composio (won't block the response).
  c.executionCtx.waitUntil((async () => {
    try {
      if (!c.env.COMPOSIO_API_KEY) return
      const mcp = new ComposioMCP(c.env.COMPOSIO_API_KEY)
      await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [{
          tool_slug: 'GMAIL_SEND_EMAIL',
          arguments: {
            recipient_email: email,
            subject: 'Welcome to nao_00 — your daily horoscope + AI council',
            body: `hey love — Minouch here.\n\nYou just signed up for the daily nao_00 dispatch. One sign per day, in your inbox, with a soft read on what the energy is asking for.\n\nWhile you wait for tomorrow's first one, three things you can do right now:\n\n1) Ask the council one free question — ${SITE_URL}/try\n2) Listen to one of the 10-minute meditations — ${SITE_URL}/healing\n3) Read your sun + rising + element pages — ${SITE_URL}/gab44/horoscopes\n\nIf you ever want to talk to the council without limits, it's $5 USDC for 30 days at ${SITE_URL}/pricing — paid in Solana, no signup, no KYC.\n\nAnd if any of this lands for you, the tip jar is ${SITE_URL}/support — pay-what-you-want, crypto-only.\n\nReplies to this address don't reach anyone listening yet — that's coming. For now just know you're in.\n\nWith love,\nminouch · nao_00`,
          },
        }],
      })
      await c.env.DB.prepare('UPDATE subscribers SET last_email_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run()
    } catch (err) { console.error('[/subscribe] welcome send failed', err) }
  })())

  return c.json({ ok: true, status: 'subscribed', id })
}

export async function handleSubscribeGet(): Promise<Response> {
  return new Response(SUBSCRIBE_PAGE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

const SUBSCRIBE_PAGE_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nao_00 — daily horoscope + council insight, by email</title>
<meta name="description" content="One sign per day, in your inbox. Soft, specific, written by the council. Free. Unsubscribe anytime." />
<link rel="canonical" href="${SITE_URL}/subscribe" />
<style>
  :root{ --bg-0:#faf9f5; --ink:#1a1815; --ink-soft:#5a564e; --accent:#c96442; --card:#fff }
  *{ box-sizing:border-box } html,body{ margin:0;padding:0 }
  body{ font-family:-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif; color:var(--ink); background:radial-gradient(1100px 600px at -10% -10%, #fdf5e9 0%, transparent 50%), radial-gradient(900px 500px at 110% 110%, #f5e8df 0%, transparent 60%), var(--bg-0); min-height:100vh; line-height:1.55 }
  .wrap{ max-width:560px; margin:0 auto; padding:64px 22px }
  h1{ font-size:clamp(30px,5vw,42px); margin:14px 0 6px; line-height:1.1 }
  .sub{ color:var(--ink-soft); font-size:17px }
  .card{ background:var(--card); border:1px solid rgba(34,24,12,0.10); border-radius:16px; padding:22px; margin-top:28px; box-shadow:0 4px 18px rgba(20,14,4,0.06) }
  input[type=email]{ width:100%; padding:13px 14px; border-radius:10px; border:1px solid rgba(34,24,12,0.15); font-size:15px; font-family:inherit }
  input:focus{ outline:none; border-color:var(--accent) }
  button{ margin-top:12px; width:100%; padding:13px; border-radius:10px; background:var(--accent); color:#fff; font-weight:700; border:none; cursor:pointer; font-size:15px }
  button:disabled{ opacity:.6; cursor:wait }
  .meta{ color:var(--ink-soft); font-size:13.5px; margin-top:14px }
  .ok{ color:#2e7d32; margin-top:14px }
  .err{ color:#c62828; margin-top:14px }
  a{ color:var(--accent); text-decoration:none } a:hover{ text-decoration:underline }
</style>
</head><body><div class="wrap">
  <h1>The daily, in your inbox.</h1>
  <p class="sub">One sign per day, written by the council. Soft, specific, free. Unsubscribe anytime — there's a link at the bottom of every email.</p>
  <div class="card">
    <form id="f">
      <input type="email" id="e" name="email" placeholder="you@example.com" autocomplete="email" required />
      <button id="b" type="submit">Send me the daily</button>
    </form>
    <div id="out"></div>
    <p class="meta">No tracking, no sale of your data, no second list. The council writes one note per day and Gmail sends it. <a href="${SITE_URL}/healing">Hear the meditations →</a></p>
  </div>
  <script>
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault()
      const email = document.getElementById('e').value.trim()
      if (!email) return
      const btn = document.getElementById('b'); btn.disabled = true; btn.textContent = 'Subscribing…'
      const out = document.getElementById('out'); out.innerHTML = ''
      try {
        const r = await fetch('/subscribe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, source: 'subscribe_page' }) })
        const j = await r.json()
        if (j.ok && j.status === 'subscribed') {
          out.innerHTML = '<div class="ok">You\\'re in. A welcome note is on its way.</div>'
        } else if (j.ok && j.status === 'already_subscribed') {
          out.innerHTML = '<div class="ok">You\\'re already on the list. ✨</div>'
        } else {
          out.innerHTML = '<div class="err">' + (j.error || 'Something broke.') + '</div>'
        }
      } catch (err) {
        out.innerHTML = '<div class="err">Network error. Try again.</div>'
      }
      btn.disabled = false; btn.textContent = 'Send me the daily'
    })
  </script>
</div></body></html>`
