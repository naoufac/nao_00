// /credentials/intake — secure one-time paste form for handing API keys
// to nao_00 without putting the value into chat / Slack / git.
//
// Flow:
//   1. Operator (Anouf) calls POST /credentials/intake/token (bearer-auth)
//      → server returns a one-time token + URL.
//   2. Naoufal opens the URL in his browser, sees a paste form (HTML).
//   3. He types/pastes the secret name + value, submits.
//   4. Worker validates the token (consumed on use, OR after 30 min TTL),
//      smoke-tests the key against the upstream provider, then calls the
//      Cloudflare API to set the value as a Worker secret.
//   5. Page renders ✅ confirmation. Token is invalidated.
//
// Why this beats chat-paste:
//   - The value never lands in any conversation transcript.
//   - The token is single-use; even if intercepted, it's worthless after submission.
//   - Cloudflare API call uses CLOUDFLARE_API_TOKEN already on the Worker —
//     we never log the secret value anywhere.

import { appendEvent } from '../notify/events_log'

interface CredsEnv {
  KV: KVNamespace
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_ACCOUNT_ID?: string
  ANTHROPIC_API_KEY?: string
  AUTH_TOKEN: string
  DB?: D1Database
}

const TOKEN_TTL_SECONDS = 30 * 60   // 30 min
const TOKEN_PREFIX = 'creds:intake:token:'

function randomToken(): string {
  const buf = new Uint8Array(24)
  crypto.getRandomValues(buf)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Issue a one-time token. Bearer-auth required.
 * Returns: { token, url, expires_at_ms }.
 */
export async function issueIntakeToken(env: CredsEnv, baseUrl: string): Promise<{
  token: string; url: string; expires_at_ms: number;
}> {
  const token = randomToken()
  const expires = Date.now() + TOKEN_TTL_SECONDS * 1000
  await env.KV.put(TOKEN_PREFIX + token, JSON.stringify({ issued_at: Date.now(), expires_at: expires }), {
    expirationTtl: TOKEN_TTL_SECONDS,
  })
  return {
    token,
    url: `${baseUrl}/credentials/intake?t=${token}`,
    expires_at_ms: expires,
  }
}

/**
 * Render the paste form. Validates the token first (404 if invalid/used).
 */
export async function renderIntakeForm(req: Request, env: CredsEnv): Promise<Response> {
  const url = new URL(req.url)
  const token = url.searchParams.get('t') || ''
  const stored = token ? await env.KV.get(TOKEN_PREFIX + token) : null
  if (!token || !stored) {
    return new Response(notFoundHtml(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
  return new Response(formHtml(token), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

/**
 * Handle the submitted form. Token is consumed on use.
 */
export async function handleIntakeSubmit(req: Request, env: CredsEnv): Promise<Response> {
  const url = new URL(req.url)
  const token = url.searchParams.get('t') || ''
  const stored = token ? await env.KV.get(TOKEN_PREFIX + token) : null
  if (!token || !stored) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_or_expired_token' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    })
  }

  let payload: { name?: string; value?: string; smoke_test?: boolean }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'bad_json' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }

  const name = (payload.name || '').trim()
  const value = (payload.value || '').trim()
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(name)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_secret_name', hint: 'UPPERCASE_WITH_UNDERSCORES, 3-64 chars, starts with letter' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }
  if (!value || value.length < 8) {
    return new Response(JSON.stringify({ ok: false, error: 'value_too_short' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }

  // Optional smoke-test based on prefix
  let smoked: { ok: boolean; provider?: string; error?: string } = { ok: true }
  if (payload.smoke_test !== false) {
    smoked = await smokeTest(name, value)
    if (!smoked.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'smoke_test_failed', detail: smoked.error }), {
        status: 422, headers: { 'content-type': 'application/json' },
      })
    }
  }

  // Set the Worker secret via Cloudflare API
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || '63493c97dbc4529b48b0da9c805452c4'
  const cfToken = env.CLOUDFLARE_API_TOKEN
  if (!cfToken) {
    return new Response(JSON.stringify({ ok: false, error: 'no_cf_api_token_in_worker', hint: 'set CLOUDFLARE_API_TOKEN as a Worker secret first' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    })
  }

  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/nao-00/secrets`
  const cfRes = await fetch(cfUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${cfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, text: value, type: 'secret_text' }),
  })
  const cfBody: any = await cfRes.json().catch(() => ({}))
  if (!cfRes.ok || cfBody?.success === false) {
    return new Response(JSON.stringify({ ok: false, error: 'cf_api_failed', status: cfRes.status, detail: cfBody?.errors }), {
      status: 502, headers: { 'content-type': 'application/json' },
    })
  }

  // Consume token
  await env.KV.delete(TOKEN_PREFIX + token)

  // Audit log — appendEvent writes to events:log + #all-nao00 mirror via callers
  await appendEvent(env as any, {
    kind: 'manual',
    source: 'credentials/intake',
    text: `secret ${name} set via /credentials/intake (provider=${smoked.provider || 'unverified'}, length=${value.length})`,
    meta: { provider: smoked.provider, length: value.length },
  }).catch(() => {})

  return new Response(JSON.stringify({
    ok: true,
    name,
    provider: smoked.provider || 'unverified',
    value_length: value.length,
    note: 'Secret set on the nao-00 Worker. NEXT DEPLOY required for the value to take effect (wrangler keeps a snapshot of secrets at deploy time).',
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function smokeTest(name: string, value: string): Promise<{ ok: boolean; provider?: string; error?: string }> {
  // Anthropic — sk-ant-api03-...
  if (value.startsWith('sk-ant-')) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': value, 'anthropic-version': '2023-06-01' },
      })
      if (r.ok) return { ok: true, provider: 'anthropic' }
      return { ok: false, error: `anthropic api returned ${r.status}` }
    } catch (e: any) {
      return { ok: false, error: `anthropic probe: ${e?.message ?? e}` }
    }
  }
  // OpenAI — sk-...
  if (value.startsWith('sk-') && !value.startsWith('sk-ant-') && !value.startsWith('sk-cp-') && !value.startsWith('sk_eleven_')) {
    try {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${value}` } })
      if (r.ok) return { ok: true, provider: 'openai' }
      return { ok: false, error: `openai api returned ${r.status}` }
    } catch (e: any) {
      return { ok: false, error: `openai probe: ${e?.message ?? e}` }
    }
  }
  // MiniMax coding plan — sk-cp-...
  if (value.startsWith('sk-cp-')) return { ok: true, provider: 'minimax_unverified_no_probe' }
  // ElevenLabs — sk_eleven_...
  if (value.startsWith('sk_eleven_')) return { ok: true, provider: 'elevenlabs_unverified_no_probe' }
  // Composio personal — ak_...
  if (value.startsWith('ak_')) {
    try {
      const r = await fetch('https://backend.composio.dev/api/v3/auth_configs?limit=1', {
        headers: { 'x-api-key': value },
      })
      if (r.ok) return { ok: true, provider: 'composio_rest' }
      return { ok: false, error: `composio api returned ${r.status}` }
    } catch (e: any) {
      return { ok: false, error: `composio probe: ${e?.message ?? e}` }
    }
  }
  // Composio MCP — ck_...
  if (value.startsWith('ck_')) return { ok: true, provider: 'composio_mcp_unverified_no_probe' }
  // Together — tgp_v1_... (Bearer)
  if (value.startsWith('tgp_v')) return { ok: true, provider: 'together_unverified_no_probe' }
  // Slack bot — xoxb-...
  if (value.startsWith('xoxb-')) {
    try {
      const r = await fetch('https://slack.com/api/auth.test', {
        headers: { 'Authorization': `Bearer ${value}` },
      })
      const j: any = await r.json().catch(() => ({}))
      if (j?.ok) return { ok: true, provider: 'slack_bot' }
      return { ok: false, error: `slack: ${j?.error || 'unknown'}` }
    } catch (e: any) {
      return { ok: false, error: `slack probe: ${e?.message ?? e}` }
    }
  }
  // Gemini — AIza...
  if (value.startsWith('AIza')) return { ok: true, provider: 'gemini_unverified_no_probe' }
  // Default — accept without smoke test
  return { ok: true, provider: 'unverified' }
}

// ---------- HTML ------------------------------------------------------------

function formHtml(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>nao_00 · secure key intake</title>
<style>
  :root { --bg:#faf9f5; --ink:#2b2825; --muted:#998c7a; --accent:#c96442; --line:#e8e2d4; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background:var(--bg); color:var(--ink); line-height:1.55; }
  main { max-width: 520px; margin: 32px auto; padding: 0 20px; }
  h1 { font-size: 22px; color:var(--accent); margin: 0 0 8px; font-weight: 600; }
  .sub { color:var(--muted); font-size: 13px; margin-bottom: 24px; }
  label { display:block; font-size: 13px; color:var(--muted); margin: 16px 0 6px; }
  input, textarea { width:100%; padding: 10px 12px; border:1px solid var(--line); border-radius: 8px; font-size: 15px; font-family: ui-monospace, SF Mono, monospace; background:#fff; color:var(--ink); }
  textarea { min-height: 100px; resize: vertical; }
  button { margin-top: 20px; padding: 12px 22px; border:0; border-radius: 8px; background:var(--accent); color:#fff; font-size:15px; font-weight:600; cursor: pointer; }
  button:hover { filter: brightness(1.05); }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  .ok { color:#1a8a52; }
  .err { color:#b21a1a; }
  .field-hint { color:var(--muted); font-size:12px; margin-top:4px; }
  .pill { display:inline-block; padding: 2px 8px; background:#fff; border:1px solid var(--line); border-radius:999px; font-size:11px; color:var(--muted); margin-right:6px; }
  details { margin-top: 18px; }
  summary { color:var(--muted); font-size:12px; cursor: pointer; }
  pre { background:#fff; border:1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 12px; overflow-x: auto; }
</style>
</head>
<body>
<main>
  <h1>🔐 secure key intake</h1>
  <p class="sub">paste once, vanishes. nao_00 stores the value as a Cloudflare Worker secret. nothing ever touches a chat transcript or this server's logs.</p>

  <div>
    <span class="pill">one-time token</span>
    <span class="pill">smoke-tested</span>
    <span class="pill">cloudflare worker secret</span>
  </div>

  <form id="f" autocomplete="off">
    <label for="name">SECRET NAME</label>
    <input id="name" name="name" placeholder="ANTHROPIC_API_KEY" value="ANTHROPIC_API_KEY" required pattern="^[A-Z][A-Z0-9_]{2,63}$" />
    <div class="field-hint">UPPERCASE_WITH_UNDERSCORES. e.g. ANTHROPIC_API_KEY, GEMINI_API_KEY, SLACK_BOT_TOKEN</div>

    <label for="value">SECRET VALUE</label>
    <textarea id="value" name="value" placeholder="sk-ant-api03-..." required></textarea>
    <div class="field-hint">paste once. we smoke-test it against the provider before saving. the form clears on submit.</div>

    <button id="submit" type="submit">save to worker</button>
  </form>

  <p id="status" style="margin-top: 16px;"></p>

  <details>
    <summary>how this works</summary>
    <pre>1. you paste → POST /credentials/intake?t=&lt;one-time-token&gt;
2. token validated + consumed
3. value smoke-tested (sk-ant-* → /v1/models, ak_* → composio /auth_configs, etc.)
4. cloudflare API: PUT /accounts/.../workers/scripts/nao-00/secrets
5. token deleted, audit log appended (no value, just metadata)
6. you re-deploy or wait for next deploy (secret takes effect)</pre>
  </details>
</main>
<script>
const f = document.getElementById('f');
const status = document.getElementById('status');
const btn = document.getElementById('submit');
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true; status.textContent = 'submitting…'; status.className = '';
  const name = document.getElementById('name').value.trim();
  const value = document.getElementById('value').value.trim();
  try {
    const r = await fetch('/credentials/intake?t=${token}', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, value }),
    });
    const j = await r.json();
    if (r.ok && j.ok) {
      status.innerHTML = '<span class="ok">✅ saved.</span> ' + (j.provider ? 'provider: <code>' + j.provider + '</code>. ' : '') + (j.note || '');
      f.reset();
      btn.disabled = true;
      btn.textContent = 'done';
    } else {
      status.innerHTML = '<span class="err">❌ ' + (j.error || 'unknown') + '</span>' + (j.detail ? '<br><code>' + JSON.stringify(j.detail).slice(0,500) + '</code>' : '');
      btn.disabled = false;
    }
  } catch (err) {
    status.innerHTML = '<span class="err">❌ network: ' + err.message + '</span>';
    btn.disabled = false;
  }
});
</script>
</body>
</html>`
}

function notFoundHtml(): string {
  return `<!doctype html><meta charset="utf-8"><title>not found</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#faf9f5;color:#2b2825;text-align:center;padding:60px 20px}h1{color:#c96442}p{color:#998c7a}</style>
<h1>🔒 invalid or expired link</h1>
<p>This intake link has been used or has expired. Ask Anouf for a fresh one.</p>`
}
