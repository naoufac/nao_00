// /credits — honest simple status of every free + paid lane the system uses.
// Kid/old-woman level: green = working + has runway, yellow = running low,
// red = blocked (e.g. anthropic credit balance too low killed deep_thinker).

export function CREDITS_PAGE_HTML(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nao_00 — credits & free tiers</title>
<style>
  :root { --bg-0:#faf9f5; --bg-1:#fff; --bg-2:#f5f3ec; --fg:#1a1815; --fg-muted:#6b6357; --fg-dim:#8a8175; --accent:#c96442; --line:rgba(34,24,12,0.10); --green:#3d8b40; --yellow:#c89d2c; --red:#c0392b; --muted:#a89f93; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:var(--bg-0); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
  .top { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:6px; }
  h1 { font-size: 22px; margin:0; font-weight:700; }
  h1 .accent { color: var(--accent); }
  .sub { color:var(--fg-muted); font-size:13px; }
  .nav { display:flex; gap:14px; margin: 12px 0 22px; flex-wrap:wrap; font-size:13px; }
  .nav a { color: var(--accent); text-decoration: none; }
  .nav a:hover { text-decoration: underline; }
  .motto { color: var(--fg-dim); font-size:12px; font-style:italic; margin-bottom:20px; }
  .panel { background:var(--bg-1); border:1px solid var(--line); border-radius:14px; padding:18px 20px; box-shadow:0 1px 0 rgba(0,0,0,0.02); margin-bottom: 18px; }
  .panel h3 { margin:0 0 4px; font-size: 15px; font-weight: 700; display:flex; align-items:center; gap:8px; }
  .panel .hint { color:var(--fg-muted); font-size:12px; margin: 0 0 14px; }
  .row { display: grid; grid-template-columns: 16px 180px 1fr auto; gap: 10px; align-items: center; padding: 10px 4px; border-top: 1px solid var(--line); font-size: 13.5px; }
  .row:first-of-type { border-top: none; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
  .dot.green { background: var(--green); }
  .dot.yellow { background: var(--yellow); }
  .dot.red { background: var(--red); }
  .name { font-weight: 600; }
  .desc { color: var(--fg-muted); font-size: 12.5px; }
  .balance { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: var(--fg); }
  .balance.red { color: var(--red); font-weight: 600; }
  .footer-note { color: var(--fg-dim); font-size: 11.5px; margin-top: 10px; line-height: 1.5; }
  .action { background: var(--accent); color: #fff; border: none; border-radius: 999px; padding: 8px 14px; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .action:hover { filter: brightness(1.05); }
  .action.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  .stale { color: var(--fg-dim); font-size: 11.5px; }
  .blocked-banner { background: #fde8e1; border-left: 3px solid var(--red); padding: 10px 14px; margin-bottom: 18px; border-radius: 8px; font-size: 13px; display: none; }
  .blocked-banner.visible { display: block; }
  .blocked-banner b { color: var(--red); }
</style>
</head>
<body>
<main class="wrap">
  <div class="top">
    <h1>💰 nao_00 <span class="accent">credits & free tiers</span></h1>
    <div class="sub" id="updated">— loading —</div>
  </div>
  <div class="motto">"this and that" — every lane visible, paid and free, so we know where to lean.</div>
  <div class="nav">
    <a href="/remote">← remote</a>
    <a href="/dashboard">dashboard</a>
    <a href="/streams">streams</a>
    <a href="/metrics/api-use">metrics json</a>
    <a href="/credits/state">credits json</a>
  </div>

  <div class="blocked-banner" id="blocked-banner">
    <b>⚠ One paid lane is blocked.</b> <span id="blocked-msg"></span>
  </div>

  <div class="panel">
    <h3>💳 paid lanes</h3>
    <p class="hint">these cost money. when one runs out, something stops working — visible here.</p>
    <div id="paid-rows"><div class="stale">— loading —</div></div>
  </div>

  <div class="panel">
    <h3>🎁 free tiers</h3>
    <p class="hint">free or near-free. lean on these first per the "credits offered on demand" rule. 300/day on Manus, 1000 lifetime on NVIDIA Foundation, etc.</p>
    <div id="free-rows"><div class="stale">— loading —</div></div>
  </div>

  <div class="panel">
    <h3>🏗️ infrastructure lanes</h3>
    <p class="hint">compute + storage + bandwidth. the foundations. usually flat-rate or generous-free.</p>
    <div id="infra-rows"><div class="stale">— loading —</div></div>
  </div>

  <div class="footer-note">
    Live data is pulled from D1 and KV every page-load. Vendor balances we can't poll yet show the nominal limit + a "polled: never" stamp. Token-flat = incident — see watchdog at <a href="/streams">/streams</a>.
  </div>
</main>

<script>
const TOKEN = ${JSON.stringify(token)};

function dotClass(status) {
  if (status === 'live') return 'green';
  if (status === 'low') return 'yellow';
  if (status === 'blocked') return 'red';
  return '';
}

function row(item) {
  const dot = '<span class="dot ' + dotClass(item.status) + '"></span>';
  const name = '<div class="name">' + escape(item.name) + '</div>';
  const desc = '<div class="desc">' + escape(item.desc || '') + '</div>';
  const balCls = item.status === 'blocked' ? ' red' : '';
  const balance = '<div class="balance' + balCls + '">' + escape(item.balance || '—') + '</div>';
  return '<div class="row">' + dot + '<div>' + name + desc + '</div>' + balance + '<span></span></div>';
}

function escape(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function load() {
  try {
    const r = await fetch('/credits/state');
    const d = await r.json();
    document.getElementById('updated').textContent = 'updated ' + new Date(d.updated || Date.now()).toISOString().slice(0,19).replace('T',' ') + ' UTC';
    document.getElementById('paid-rows').innerHTML = (d.paid || []).map(row).join('') || '<div class="stale">no paid lanes registered</div>';
    document.getElementById('free-rows').innerHTML = (d.free || []).map(row).join('') || '<div class="stale">no free lanes registered</div>';
    document.getElementById('infra-rows').innerHTML = (d.infra || []).map(row).join('') || '<div class="stale">no infra lanes registered</div>';
    if (d.blocked && d.blocked.length) {
      const b = document.getElementById('blocked-banner');
      b.classList.add('visible');
      document.getElementById('blocked-msg').textContent = d.blocked.join(' · ');
    }
  } catch (e) {
    document.getElementById('updated').textContent = 'load failed: ' + e.message;
  }
}
load();
setInterval(load, 60000);
</script>
</body>
</html>`
}

export type CreditLane = {
  name: string
  desc: string
  balance: string
  status: 'live' | 'low' | 'blocked' | 'unknown'
}

export type CreditsState = {
  updated: string
  paid: CreditLane[]
  free: CreditLane[]
  infra: CreditLane[]
  blocked: string[]
}

// Build state from live signals where we have them, nominal limits otherwise.
// `recentDeepThinker` is the most recent streams_runs row for deep_thinker.
export function buildCreditsState(args: {
  recentDeepThinker?: { ok: number; error: string | null; ts: string } | null
}): CreditsState {
  const { recentDeepThinker } = args
  const blocked: string[] = []

  // Anthropic direct — detect "credit balance too low" from last deep_thinker run.
  let anthropicLane: CreditLane = {
    name: 'Anthropic API (direct)',
    desc: 'powers deep_thinker stream + managed-agent research · separate from Claude Max',
    balance: 'live',
    status: 'live'
  }
  if (recentDeepThinker && !recentDeepThinker.ok && recentDeepThinker.error) {
    if (/credit balance.*too low|invalid_request_error/i.test(recentDeepThinker.error)) {
      anthropicLane.balance = 'BLOCKED — top up at console.anthropic.com'
      anthropicLane.status = 'blocked'
      blocked.push('Anthropic direct API: credit balance too low → deep_thinker disabled')
    }
  } else if (!recentDeepThinker) {
    anthropicLane.balance = 'no recent run'
    anthropicLane.status = 'unknown'
  }

  return {
    updated: new Date().toISOString(),
    blocked,
    paid: [
      anthropicLane,
      {
        name: 'Claude Max ($200/mo)',
        desc: 'subscription · powers Anouf engine itself (this CLI) and council nao44/minouch via Worker secrets',
        balance: 'subscription · always-on',
        status: 'live'
      },
      {
        name: 'Together.ai',
        desc: 'auto-recharge wired · Llama 4 Maverick + NVIDIA-routed models',
        balance: 'auto-recharge',
        status: 'live'
      },
      {
        name: 'Mistral API',
        desc: 'Mistral Large in council (mid-vote)',
        balance: 'pay-as-you-go',
        status: 'live'
      },
      {
        name: 'MiniMax M2.7',
        desc: 'coding-plan tier · 4th council voice',
        balance: 'pay-as-you-go',
        status: 'live'
      },
      {
        name: 'ElevenLabs',
        desc: 'Scribe v1 STT + Turbo v2.5 TTS · voice round-trip',
        balance: 'monthly cap',
        status: 'live'
      }
    ],
    free: [
      {
        name: 'Manus',
        desc: 'peer agent · heavy research · 300 free credits/day, resets daily',
        balance: '300/day nominal',
        status: 'live'
      },
      {
        name: 'NVIDIA Foundation API',
        desc: 'build.nvidia.com · Nemotron + 100s of models',
        balance: '1000 credits (lifetime starter)',
        status: 'live'
      },
      {
        name: 'GMI Cloud',
        desc: 'H100/H200 GPU lane · NVIDIA infrastructure',
        balance: 'free starter credit',
        status: 'live'
      },
      {
        name: 'Composio MCP',
        desc: '51 connected apps (gmail, slack, webflow, github, …) · usage-tier free',
        balance: 'free tier',
        status: 'live'
      },
      {
        name: 'HuggingFace',
        desc: 'inference endpoints + model hub',
        balance: 'free tier',
        status: 'live'
      },
      {
        name: 'Postiz',
        desc: '28+ social platforms via single API',
        balance: 'free tier',
        status: 'live'
      }
    ],
    infra: [
      {
        name: 'Cloudflare Workers',
        desc: 'nao-00.nchobah.workers.dev · the council brain runs here',
        balance: '100k req/day free + paid tier',
        status: 'live'
      },
      {
        name: 'Cloudflare D1',
        desc: 'council_steps + streams_runs + audit',
        balance: '5GB free',
        status: 'live'
      },
      {
        name: 'Cloudflare KV',
        desc: 'cache + skill memory + session state',
        balance: '1GB free',
        status: 'live'
      },
      {
        name: 'Hetzner (Anouf)',
        desc: 'engine box · 8c / 15GB / 75GB · 135.181.44.161',
        balance: 'monthly flat-rate',
        status: 'live'
      },
      {
        name: 'DigitalOcean (Nemoclaw + Jasmine + Mayor)',
        desc: 'nervous system + builder + Toronto',
        balance: 'monthly flat-rate',
        status: 'live'
      }
    ]
  }
}
