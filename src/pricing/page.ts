import { SITE_URL } from '../util/identity'

export function PRICING_PAGE_HTML(env: { solanaAddress?: string; userRef?: string }): string {
  const sol = (env.solanaAddress || '').trim()
  const ref = (env.userRef || '').trim()
  const solanaUri = sol && ref
    ? `solana:${sol}?amount=5&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&memo=${encodeURIComponent('nao00-' + ref)}&label=${encodeURIComponent('nao_00 Council Premium')}&message=${encodeURIComponent('30 days unlimited council access')}`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nao_00 Pricing — pay with crypto, talk to the council</title>
<meta name="description" content="Pay $5 USDC on Solana to unlock 30 days of unlimited council access — voice, text, 982 tools, no login. Crypto-native pricing." />
<link rel="canonical" href="${SITE_URL}/pricing" />
<style>
  :root{ --bg-0:#0b0420; --bg-1:#1a0533; --bg-2:#3a0a4f; --ink:#f6e9ff; --ink-soft:#cbb8e3; --accent:#ffd25c; --accent-2:#ff7eb6; --card:#1c0d3aaa; --edge:#5b2a8a }
  *{ box-sizing:border-box } html,body{ margin:0;padding:0 }
  body{ font-family:-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif; color:var(--ink); background:radial-gradient(1200px 700px at 80% -10%,#4b1170 0%,transparent 60%),radial-gradient(900px 600px at -10% 110%,#ff7eb633 0%,transparent 55%),linear-gradient(180deg,var(--bg-0),var(--bg-1) 60%,var(--bg-2)); min-height:100vh; line-height:1.55; -webkit-font-smoothing:antialiased }
  header{ text-align:center; padding:64px 20px 28px; max-width:880px; margin:0 auto }
  .pill{ display:inline-block; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--accent); border:1px solid #ffd25c44; padding:6px 12px; border-radius:999px; background:#ffd25c11 }
  h1{ font-size:clamp(34px,6vw,54px); margin:18px 0 8px; line-height:1.05; background:linear-gradient(90deg,#fff,#ffd25c 40%,#ff7eb6 80%); -webkit-background-clip:text; background-clip:text; color:transparent }
  .sub{ color:var(--ink-soft); font-size:18px; max-width:620px; margin:0 auto }
  .tiers{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:22px; max-width:1080px; margin:36px auto 0; padding:0 22px }
  .tier{ background:var(--card); border:1px solid var(--edge); border-radius:18px; padding:24px; backdrop-filter:blur(10px) }
  .tier h2{ margin:0 0 8px; font-size:22px; display:flex; align-items:center; gap:10px }
  .tier .price{ font-size:36px; font-weight:700; margin:6px 0 14px }
  .tier ul{ padding-left:20px; margin:14px 0 18px; color:var(--ink-soft) }
  .tier li{ margin:5px 0; font-size:14.5px }
  .btn{ display:inline-flex; align-items:center; gap:8px; padding:11px 18px; border-radius:999px; background:linear-gradient(90deg,#ffd25c,#ff7eb6); color:#1a0533; font-weight:700; text-decoration:none; font-size:14.5px }
  .btn.ghost{ background:#ffffff14; color:var(--ink); border:1px solid #ffffff22 }
  .btn:hover{ filter:brightness(1.1) }
  .addr{ display:block; word-break:break-all; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; background:#0006; border:1px solid #ffffff14; padding:8px 10px; border-radius:8px; margin:10px 0; color:#e6d6ff }
  .ref{ font-family:ui-monospace,Menlo,monospace; font-size:13px; background:#ffd25c22; color:var(--accent); padding:2px 8px; border-radius:6px }
  .cta{ max-width:1080px; margin:48px auto 24px; padding:24px; background:linear-gradient(135deg,#ffd25c22,#ff7eb622); border:1px solid #ffd25c44; border-radius:20px; text-align:center }
  footer{ text-align:center; padding:30px 20px 60px; color:#9d8ab9; font-size:13px } footer a{ color:var(--accent); text-decoration:none }
</style>
</head>
<body>
<header>
  <span class="pill">💎 nao_00 · pricing</span>
  <h1>Pay with crypto, talk to the council</h1>
  <p class="sub">No login. No subscription form. No card. Send $5 USDC on Solana, get 30 days of unlimited council access — voice in, voice out, all 982 Composio tools.</p>
</header>

<section class="tiers">

  <article class="tier">
    <h2>🌱 Free</h2>
    <div class="price">$0</div>
    <ul>
      <li>1,506 evergreen content pages (gab44 astrology, healing meditations, runes, dreams, tarot, all of it)</li>
      <li>Read-only — no API access</li>
      <li>All 5 healing meditations downloadable</li>
    </ul>
    <a class="btn ghost" href="${SITE_URL}/healing">Open /healing</a>
  </article>

  <article class="tier" style="border-color:#ffd25c; box-shadow:0 0 0 1px #ffd25c33 inset">
    <h2>💛 Council Premium</h2>
    <div class="price">$5 <span style="font-size:14px;color:var(--ink-soft);font-weight:400">/ 30 days</span></div>
    <ul>
      <li>Unlimited <code>/council</code> text + <code>/talk</code> voice calls</li>
      <li>Anthropic → Gemini → Qwen fallback chain (council survives provider outages)</li>
      <li>Access to all 982 Composio tools when OAuth connected (Gmail, Slack, GitHub, YouTube, LinkedIn, Notion, Drive, Calendar, ...)</li>
      <li>Conversation history + auto-improve loop (your context refreshed every 15 turns)</li>
      <li>Pay in USDC. No KYC. No subscription. Walk away anytime.</li>
    </ul>
    ${sol && ref ? `
      <div style="margin:14px 0 4px;font-size:12px;color:var(--ink-soft)">Pay to this address with the memo below:</div>
      <span class="addr">${sol}</span>
      <div style="font-size:12px;color:var(--ink-soft);margin-bottom:4px">Required memo (locks the payment to you):</div>
      <div style="margin-bottom:14px"><span class="ref">nao00-${ref}</span></div>
      <a class="btn" href="${solanaUri}">Open wallet · $5 USDC</a>
      <p style="margin-top:14px;font-size:12px;color:var(--ink-soft)">Once Solana confirms, hit <code>${SITE_URL}/pricing/verify?ref=${ref}</code> to issue your premium token.</p>
    ` : `
      <a class="btn ghost" href="${SITE_URL}/pricing?ref=GENERATE">Generate my pay-link</a>
    `}
  </article>

  <article class="tier">
    <h2>🛠️ Self-host</h2>
    <div class="price">$0</div>
    <ul>
      <li>Source on GitHub (Cloudflare Workers, ~365 routes)</li>
      <li>Run your own council on your own Cloudflare account</li>
      <li>Bring your own Anthropic/Gemini/Qwen keys</li>
      <li>Permissive license, no strings</li>
    </ul>
    <a class="btn ghost" href="https://github.com/naoufac" target="_blank" rel="noopener">View source</a>
  </article>
</section>

<section class="cta">
  <h2 style="margin:0 0 8px">Why crypto?</h2>
  <p>Stripe needs OAuth + KYC + a corporate entity. Crypto needs a wallet. We picked the path that ships today over the path that needs paperwork. USDC on Solana settles in <em>seconds</em>, costs less than a penny, and works the same whether you're in Bangkok, Berlin, or Bogotá.</p>
</section>

<footer>
  Made by <a href="https://nchobah.com">Naoufal</a> · Powered by <a href="${SITE_URL}">nao_00</a> · this and that
</footer>
</body>
</html>`
}
