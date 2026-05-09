import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bearerAuth } from 'hono/bearer-auth'
import { councilPipeline } from './council/pipeline'
import { transcribe } from './voice/stt'
import { synthesize } from './voice/tts'
import { VOICE_PAGE_HTML } from './voice/page'
import { autoImprove, maybeRunSelfEval } from './improve'
import { runMorningBriefing } from './improve/briefing'
import { runEveningRecap } from './improve/recap'
import { runWeeklyDigest } from './improve/weekly'
import { runCoverage } from './improve/coverage'
import { runAutoCoverage, EVERGREEN_TOPICS } from './improve/auto_coverage'
import { EXTERNAL_SOURCES } from './improve/external_seeder'

// O(1) membership test for the ?source= query param. Adding a source to
// EXTERNAL_SOURCES (in external_seeder.ts) automatically extends this set.
const EXTERNAL_SOURCE_SET: ReadonlySet<string> = new Set(EXTERNAL_SOURCES)
import { sendBriefingEmail, sendRecapSlack, sendWeeklyDigestSlack, sendAlertSlack } from './notify'
import { pollSlackInbox } from './inbox/slack_poller'
import { DASHBOARD_HTML } from './dashboard/page'
import { buildDashboardState, refreshConnectedApps } from './dashboard/state'
import { HEALING_PAGE_HTML } from './healing/page'
import { GAB44_PAGE_HTML } from './gab44/page'
import { generateDailyHoroscope, generateAllSigns, isValidSign, SIGNS } from './gab44/daily'
import { runHoroscopeWarmer } from './streams/horoscope_warmer'
import { runProactiveInsight } from './streams/proactive_insight'
import { runAutoDrafter } from './streams/auto_drafter'
import { runEngagementDigest } from './streams/engagement_digest'
import { runCoverageExpander } from './streams/coverage_expander'
import { runDeepThinker } from './streams/deep_thinker'
import { runManagedAgentResearch, settleManagedAgentSession } from './streams/managed_agent_research'
import { STREAMS_PAGE_HTML, buildStreamsState } from './streams/page'
import { MANUS_PAGE_HTML } from './manus/page'
import { buildSnapshot } from './metrics/api-use'
import { handleMcp } from './mcp/server'
import { REMOTE_PAGE_HTML } from './remote/page'
import { CREDITS_PAGE_HTML, buildCreditsState } from './credits/page'
import { V2_PAGE_HTML } from './v2/page'
import { MANIFEST_JSON, SERVICE_WORKER_JS } from './v2/pwa'
import { MAP_PAGE_HTML } from './map/page'
import { buildMapState } from './map/state'
import { renderRealityPage } from './reality/page'
import { buildTasksPage, buildTasksPayload } from './tasks/page'
import { buildDocsIndex, buildDocPage, getRawDoc } from './docs/page'
import { isNoiseTranscript, classifyProbe } from './util/filters'
import { Naoufal } from './durable/naoufal'
import { ContextDO } from './durable/context'
import { OrchestratorDO } from './durable/orchestrator'
import { route as routeTool } from './orchestrator/tool_router'
import { ComposioMCP } from './tools/composio'
import { VERSION, DISPLAY_NAME, TAGLINE, SITE_URL } from './util/identity'
import { observability, fail } from './util/envelope'
import { buildContinuityReport } from './continuity/state'
import { renderContinuityPage } from './continuity/page'
import { tryAcquireLease, releaseLease, listLeases, checkSplitBrain } from './fleet/lease'
import { race, reasoningExecutors } from './orchestrator/race'
import { pushAlert } from './tools/onesignal'
import { handleSlackEvent, slackAppStatus } from './notify/slack_events'
import { synthesisTick } from './notify/synthesis'
import { readEventsSince, latestEventTs, appendEvent } from './notify/events_log'
import { issueIntakeToken, renderIntakeForm, handleIntakeSubmit } from './credentials/intake'

export { Naoufal, ContextDO, OrchestratorDO }

type Bindings = {
  AI: any
  KV: KVNamespace
  DB: D1Database
  AUTH_TOKEN: string
  ANTHROPIC_API_KEY: string
  MISTRAL_API_KEY: string
  MINIMAX_API_KEY: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_VOICE_ID: string
  COMPOSIO_API_KEY: string
  COMPOSIO_REST_API_KEY: string
  HELIO_PAYLINK_URL: string
  NVIDIA_API_KEY: string
  TOGETHER_API_KEY: string
  GMI_CLOUD_API_KEY: string
  GEMINI_API_KEY: string
  MANUS_API_KEY: string
  NAOUFAL: DurableObjectNamespace
  CONTEXT_DO: DurableObjectNamespace
  ORCHESTRATOR_DO: DurableObjectNamespace
  SLACK_BOT_TOKEN?: string
  SLACK_SIGNING_SECRET?: string
  NOTIFY_GMAIL_TO?: string
  NOTIFY_GMAIL_MODE?: string
  NOTIFY_SLACK_CHANNEL?: string
  ASSETS: Fetcher
}

const DEFAULT_USER = 'naoufal'
function userDOStub(env: Bindings, user_id: string = DEFAULT_USER) {
  const id = env.NAOUFAL.idFromName(user_id)
  return env.NAOUFAL.get(id)
}

function contextDOStub(env: Bindings) {
  const id = env.CONTEXT_DO.idFromName('global')
  return env.CONTEXT_DO.get(id)
}

function orchestratorDOStub(env: Bindings) {
  const id = env.ORCHESTRATOR_DO.idFromName('global')
  return env.ORCHESTRATOR_DO.get(id)
}

const app = new Hono<{ Bindings: Bindings }>()

// Observability — request_id + Server-Timing on every response. Cheap, always-on.
app.use('*', observability)

// Standard error shape for unhandled exceptions. Avoids leaking stack traces.
// HTTPException (e.g. bearerAuth's 401) is intentional — let it through with the right status.
app.onError((err, c) => {
  const rid = c.req.header('x-request-id') || 'unknown'
  if (err instanceof HTTPException) {
    const code = err.status === 401 ? 'unauthorized' : err.status === 403 ? 'forbidden' : 'http_error'
    return fail(c, err.status, code, err.message)
  }
  console.error(`[${rid}] unhandled`, err)
  return fail(c, 500, 'internal_error', err.message || 'unhandled error')
})

// 404 in the standard shape too.
app.notFound((c) => fail(c, 404, 'not_found', `no route for ${c.req.method} ${new URL(c.req.url).pathname}`))

// Health check (no auth)
app.get('/health', (c) => c.json({
  status: 'alive',
  name: DISPLAY_NAME,
  motto: TAGLINE,
  version: VERSION,
  platform: 'cloudflare-only',
  surfaces: ['/voice', '/talk', '/council', '/dashboard', '/healing', '/improve/*', '/memory/*', '/tools/*', '/orchestrator/*', '/slack/events'],
  slack_app: slackAppStatus(c.env),
}))

// /version — deeper health probe. Lists ALL registered routes so we can detect
// when a foreign deploy shadows ours (the recurring problem where /briefing/*
// or /recap/* routes vanish because another agent redeploys an older build).
// External monitor: if /version is missing /briefing/run, alert.
app.get('/version', (c) => {
  // Hono's app.routes is an array of { method, path, handler }. We project just
  // method+path and dedupe — the actual handler refs are not useful here.
  const seen = new Set<string>()
  const routes: { method: string; path: string }[] = []
  for (const r of (app as any).routes || []) {
    const key = `${r.method} ${r.path}`
    if (seen.has(key)) continue
    seen.add(key)
    routes.push({ method: r.method, path: r.path })
  }
  return c.json({
    version: VERSION,
    name: DISPLAY_NAME,
    deployed_from: 'src/index.ts',
    route_count: routes.length,
    has_briefing: routes.some(r => r.path.startsWith('/briefing')),
    has_recap: routes.some(r => r.path.startsWith('/recap')),
    has_notify: routes.some(r => r.path.startsWith('/notify')),
    routes,
  })
})

// === AI PROXY — DO NOT DELETE ===
// Direct access to Cloudflare AI models. Test: GET /ai/test, POST /ai with {model, messages}
app.get('/ai/test', async (c: any) => {
  try {
    const result = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'user', content: 'Say hi to Naoufal warmly.' }]
    })
    return c.json({ ok: true, model: 'llama-3.3-70b', response: result.response })
  } catch (e: any) { return c.json({ ok: false, error: e.message }) }
})
app.post('/ai', async (c: any) => {
  try {
    const { model, messages } = await c.req.json()
    const result = await c.env.AI.run(model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages })
    return c.json({ ok: true, response: result.response, raw: result })
  } catch (e: any) { return c.json({ ok: false, error: e.message }) }
})
// === END AI PROXY ===


// Voice page (public HTML — bearer is injected so the page can call /talk)
app.get('/voice', (c) => {
  const html = VOICE_PAGE_HTML.replace('__BEARER__', c.env.AUTH_TOKEN)
  return c.html(html)
})

// Dashboard page (public HTML — bearer is injected so the page can call protected endpoints)
app.get('/dashboard', (c) => {
  const html = DASHBOARD_HTML.replace('__BEARER__', c.env.AUTH_TOKEN)
  return c.html(html)
})

// Healing Sounds public page — 5 guided meditations, embedded video player.
// Videos served as Workers Static Assets at /healing/track-NN-*.mp4
// Root — every subdomain redirects to the Remote Control (the operator surface).
// Apex `nchobah.com/` lands here too — send to v2 (the live mobile-shaped surface).
// Other subdomains (agent.*, dash.*, etc.) hit this same handler — that's fine; v2 is the front door.
app.get('/', (c) => {
  const host = c.req.header('host') || ''
  if (host === 'nchobah.com' || host === 'www.nchobah.com') {
    return c.redirect('https://nao00.nchobah.com/v2', 302)
  }
  return c.redirect('/remote', 302)
})
app.get('/remote', (c) => c.html(REMOTE_PAGE_HTML(c.env.AUTH_TOKEN)))

// /credits — honest simple status of every paid + free + infra lane.
// Built so kid/old-woman level: green/yellow/red dots, plain language balances.
// Aliases for common typos / muscle-memory: /credit, /credit/, /credits/, /money
app.get('/credit', (c) => c.redirect('/credits', 302))
app.get('/money', (c) => c.redirect('/credits', 302))
app.get('/credits', (c) => c.html(CREDITS_PAGE_HTML(c.env.AUTH_TOKEN)))
app.get('/credits/state', async (c) => {
  let recentDeepThinker: { ok: number; error: string | null; ts: string } | null = null
  try {
    const row = await c.env.DB
      .prepare('SELECT ok, error, ts FROM streams_runs WHERE name = ? ORDER BY ts DESC LIMIT 1')
      .bind('deep_thinker')
      .first<{ ok: number; error: string | null; ts: string }>()
    if (row) recentDeepThinker = row
  } catch (err) {
    console.error('credits state: deep_thinker query failed', err)
  }
  return c.json(buildCreditsState({ recentDeepThinker }))
})

app.get('/healing', (c) => c.html(HEALING_PAGE_HTML(c.env.HELIO_PAYLINK_URL || '')))
app.get('/gab44', (c) => c.html(GAB44_PAGE_HTML))

// Streams — Anouf-orchestrated parallel workstreams. Page public; trigger needs bearer.
// Nemoclaw cron hits /streams/run/:name on its own schedule to multiply cadence past
// Cloudflare's 5-cron-string ceiling.
app.get('/streams', (c) => c.html(STREAMS_PAGE_HTML.replace('__BEARER__', c.env.AUTH_TOKEN)))
app.get('/streams/state', async (c) => {
  const state = await buildStreamsState({ KV: c.env.KV }, c.env.DB)
  return c.json(state)
})
app.post('/streams/run/:name', async (c) => {
  const name = c.req.param('name')
  const env = { MINIMAX_API_KEY: c.env.MINIMAX_API_KEY, KV: c.env.KV }
  if (name === 'horoscope_warmer') return c.json(await runHoroscopeWarmer(env, c.env.DB))
  if (name === 'proactive_insight') return c.json(await runProactiveInsight(env, c.env.DB))
  if (name === 'auto_drafter') {
    return c.json(
      await runAutoDrafter(
        { KV: c.env.KV, COMPOSIO_API_KEY: c.env.COMPOSIO_API_KEY },
        c.env.DB
      )
    )
  }
  if (name === 'engagement_digest') {
    return c.json(
      await runEngagementDigest(
        { KV: c.env.KV, COMPOSIO_API_KEY: c.env.COMPOSIO_API_KEY },
        c.env.DB
      )
    )
  }
  if (name === 'coverage_expander') {
    return c.json(await runCoverageExpander(c.env, c.env.DB, c.executionCtx))
  }
  if (name === 'deep_thinker') {
    return c.json(
      await runDeepThinker(
        { ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY, KV: c.env.KV },
        c.env.DB
      )
    )
  }
  if (name === 'managed_agent_research') {
    return c.json(
      await runManagedAgentResearch(
        { ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY, KV: c.env.KV },
        c.env.DB
      )
    )
  }
  return c.json(
    {
      ok: false,
      error: `unknown stream "${name}"`,
      valid: [
        'horoscope_warmer',
        'proactive_insight',
        'auto_drafter',
        'engagement_digest',
        'coverage_expander',
        'deep_thinker',
        'managed_agent_research'
      ]
    },
    404
  )
})

// Managed Agents inspection: list recent sessions + settle one by id.
app.get('/managed-agents/sessions', async (c) => {
  const raw = await c.env.KV.get('managed_agent:research:sessions:json')
  const history = raw ? JSON.parse(raw) : []
  return c.json({ count: history.length, sessions: history })
})

app.post('/managed-agents/sessions/:id/settle', async (c) => {
  const id = c.req.param('id')
  try {
    const result = await settleManagedAgentSession(
      { ANTHROPIC_API_KEY: c.env.ANTHROPIC_API_KEY, KV: c.env.KV },
      c.env.DB,
      id
    )
    return c.json(result)
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message || String(e) }, 502)
  }
})

// Daily horoscope — text via MiniMax-M2.7. Public read, KV-cached per sign+date.
// /gab44/daily?sign=aries → single sign
// /gab44/daily?sign=all   → all 12 (sequential, ~12*1.5s)
app.get('/gab44/daily', async (c) => {
  const sign = (c.req.query('sign') || 'aries').toLowerCase()
  const fresh = c.req.query('fresh') === '1'
  if (sign === 'all') {
    const out = await generateAllSigns({ MINIMAX_API_KEY: c.env.MINIMAX_API_KEY, KV: c.env.KV })
    return c.json({ ok: true, signs: out, count: out.length })
  }
  if (!isValidSign(sign)) {
    return c.json({ ok: false, error: `unknown sign "${sign}"`, valid_signs: SIGNS }, 400)
  }
  try {
    const h = await generateDailyHoroscope(sign, { MINIMAX_API_KEY: c.env.MINIMAX_API_KEY, KV: c.env.KV }, fresh)
    return c.json({ ok: true, ...h })
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 502)
  }
})
app.get('/manus', (c) => c.html(MANUS_PAGE_HTML(c.env.AUTH_TOKEN)))
app.get('/v2', (c) => c.html(V2_PAGE_HTML))

// PWA assets — manifest + service worker live at the root so the SW can claim scope `/`.
// Icons are static under public/v2/icons/ (served by the assets binding).
app.get('/manifest.webmanifest', (c) => {
  c.header('Content-Type', 'application/manifest+json; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  return c.body(MANIFEST_JSON)
})
app.get('/sw.js', (c) => {
  c.header('Content-Type', 'application/javascript; charset=utf-8')
  c.header('Service-Worker-Allowed', '/')
  // Don't let stale SW pin to the old build — browsers also force-revalidate but be explicit.
  c.header('Cache-Control', 'public, max-age=0, must-revalidate')
  return c.body(SERVICE_WORKER_JS)
})
app.get('/map', (c) => c.html(MAP_PAGE_HTML))
app.get('/map/state', async (c) => c.json(await buildMapState(c.env)))

// /reality — single source of truth audit page. Static render; updated by redeploy.
app.get('/reality', (c) => c.html(renderRealityPage()))

// /tasks — single page that surfaces every auto-creating task lane:
// orchestrator goals + stream runs + cron schedule + open pain-points.
// Public (no bearer); /tasks/data is the JSON poll target.
app.get('/tasks', (c) => c.html(buildTasksPage()))
app.get('/tasks/data', async (c) => c.json(await buildTasksPayload(c.env)))

// /docs — embedded planning + reference docs (PLAN, STATE, INVENTORY, brain, memory)
// + links to comparison surfaces (council-of-ten traces, /reality, /metrics).
// Public; pages render as styled HTML, /docs/:name/raw returns plain text.
app.get('/docs', (c) => c.html(buildDocsIndex()))
app.get('/docs/:name', (c) => {
  const html = buildDocPage(c.req.param('name'))
  if (!html) return c.notFound()
  return c.html(html)
})
app.get('/docs/:name/raw', (c) => {
  const raw = getRawDoc(c.req.param('name'))
  if (!raw) return c.notFound()
  return new Response(raw, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
})

// Pillar metric — API utilization. Always-visible "is the system alive?" signal.
app.get('/metrics/api-use', async (c) => {
  const snap = await buildSnapshot(c.env.DB, c.env.KV)
  return c.json(snap)
})

// Fleet-wide pillar metric — per-host ccusage snapshots POSTed by each host's cron.
// True account total (this Worker only sees its own outbound). Fleet hosts run claude-code
// which bills to the same nchobah@gmail.com — only ccusage on each host can see those.
app.get('/metrics/fleet/usage', async (c) => {
  const blob = await c.env.KV.get('fleet:usage:latest')
  if (!blob) return c.json({ ok: false, reason: 'no snapshot yet — POST one with auth' }, 404)
  return c.json(JSON.parse(blob))
})

app.post('/metrics/fleet/usage', async (c) => {
  const auth = c.req.header('authorization') || ''
  if (auth.toLowerCase() !== `bearer ${c.env.AUTH_TOKEN.toLowerCase()}`) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }
  const snapshot = { ...body, ingested_at: new Date().toISOString() }
  await c.env.KV.put('fleet:usage:latest', JSON.stringify(snapshot))
  return c.json({ ok: true, ingested_at: snapshot.ingested_at })
})

// === Fleet heartbeat — each host pings here every ~5 min so /remote can render live status pills.
const KNOWN_FLEET_HOSTS = ['anouf', 'nemo', 'jasmine', 'mayor', 'vehea']

app.post('/fleet/heartbeat', async (c) => {
  const auth = c.req.header('authorization') || ''
  if (auth.toLowerCase() !== `bearer ${c.env.AUTH_TOKEN.toLowerCase()}`) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  const host = (c.req.query('host') || '').toLowerCase().trim()
  if (!KNOWN_FLEET_HOSTS.includes(host)) {
    return c.json({ ok: false, error: `unknown host: ${host}; allowed: ${KNOWN_FLEET_HOSTS.join(',')}` }, 400)
  }
  let body: any = {}
  try { body = await c.req.json() } catch {}
  const ts = new Date().toISOString()
  // 60-min TTL: anything older is silent.
  await c.env.KV.put(`fleet:heartbeat:${host}`, JSON.stringify({ host, ts, ...body }), { expirationTtl: 3600 })
  return c.json({ ok: true, host, ts })
})

// === Trello consolidated views — Coda backlog merges cards from multiple boards.
app.get('/trello/coda', async (c) => {
  const blob = await c.env.KV.get('trello:coda:latest')
  if (!blob) return c.json({ ok: false, reason: 'no snapshot yet — POST one with auth' }, 404)
  return c.json(JSON.parse(blob))
})

app.post('/trello/coda', async (c) => {
  const auth = c.req.header('authorization') || ''
  if (auth.toLowerCase() !== `bearer ${c.env.AUTH_TOKEN.toLowerCase()}`) {
    return c.json({ ok: false, error: 'unauthorized' }, 401)
  }
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'invalid json' }, 400) }
  const snapshot = { ...body, ingested_at: new Date().toISOString() }
  await c.env.KV.put('trello:coda:latest', JSON.stringify(snapshot))
  return c.json({ ok: true, ingested_at: snapshot.ingested_at, total: body?.total ?? null })
})

// === Together.ai test endpoint — verifies the new client wires up.
app.get('/llm/together/test', async (c) => {
  const apiKey = (c.env as any).TOGETHER_API_KEY
  if (!apiKey) return c.json({ ok: false, error: 'TOGETHER_API_KEY not set' }, 503)
  const { callTogether } = await import('./llm/together')
  try {
    const r = await callTogether({
      apiKey,
      messages: [{ role: 'user', content: 'In one sentence: what is the capital of Morocco?' }],
      max_tokens: 64,
      db: c.env.DB,
      source: 'together_test',
    })
    return c.json({ ok: true, text: r.text, model: r.model, usage: r.usage, finish_reason: r.finish_reason })
  } catch (e: any) {
    return c.json({ ok: false, error: e.message || 'unknown' }, 502)
  }
})

app.get('/fleet/status', async (c) => {
  const now = Date.now()
  const out: Record<string, any> = {}
  for (const host of KNOWN_FLEET_HOSTS) {
    const blob = await c.env.KV.get(`fleet:heartbeat:${host}`)
    if (!blob) {
      out[host] = { status: 'silent', last_seen: null, age_s: null }
      continue
    }
    const rec = JSON.parse(blob)
    const age_s = Math.floor((now - new Date(rec.ts).getTime()) / 1000)
    let status: 'live' | 'warm' | 'silent'
    if (age_s < 600) status = 'live'        // <10 min
    else if (age_s < 1800) status = 'warm'  // <30 min
    else status = 'silent'
    out[host] = { status, last_seen: rec.ts, age_s, note: rec.note ?? null }
  }
  return c.json({ now: new Date(now).toISOString(), hosts: out })
})

// === MCP server — nao_00 as a service that any Claude (web/desktop/CLI) can plug into.
// Claude.ai → Settings → Custom MCP → URL: https://nao00.nchobah.com/mcp, header: Authorization: Bearer <AUTH_TOKEN>

// ─── Continuity ────────────────────────────────────────────────────
app.get('/continuity', async (c) => {
  const cached = await c.env.KV.get('continuity:latest')
  const report = cached ? JSON.parse(cached) : null
  return c.html(renderContinuityPage(report))
})

app.get('/continuity/data', async (c) => {
  const cached = await c.env.KV.get('continuity:latest')
  return c.json(cached ? JSON.parse(cached) : { error: 'no report yet' })
})

app.post('/continuity/refresh', async (c) => {
  const report = await buildContinuityReport(c.env, c.env.KV, c.env.DB)
  return c.json(report)
})

// ─── Fleet Lease Rotation ──────────────────────────────────────────
app.post('/fleet/lease', async (c) => {
  const body = await c.req.json<{ host: string; role: string }>()
  const result = await tryAcquireLease(c.env.KV, body)
  return c.json(result)
})

app.delete('/fleet/lease', async (c) => {
  const body = await c.req.json<{ role: string; host: string }>()
  const ok = await releaseLease(c.env.KV, body.role, body.host)
  return c.json({ ok })
})

app.get('/fleet/leases', async (c) => {
  const leases = await listLeases(c.env.KV)
  return c.json({ leases })
})

app.get('/fleet/referee', async (c) => {
  const result = await checkSplitBrain(c.env.KV)
  return c.json(result)
})

// ─── Race Lanes ────────────────────────────────────────────────────
app.post('/race/reasoning', async (c) => {
  const body = await c.req.json<{ task: string }>()
  const executors = reasoningExecutors(c.env)
  const result = await race(body.task, executors, c.env, c.env.KV, c.env.DB)
  return c.json(result)
})

app.get('/race/latest', async (c) => {
  const latest = await c.env.KV.get('race:latest')
  return c.json(latest ? JSON.parse(latest) : { error: 'no races yet' })
})

app.get('/race/:id', async (c) => {
  const id = c.req.param('id')
  const raw = await c.env.KV.get(`race:${id}`)
  return c.json(raw ? JSON.parse(raw) : { error: 'not found' })
})

// ─── Push Notifications ────────────────────────────────────────────
app.post('/notify/push', async (c) => {
  const body = await c.req.json<{ event: string; detail: string }>()
  const result = await pushAlert(c.env, c.env.KV, body.event as any, body.detail)
  return c.json(result)
})

app.post('/mcp', async (c) => {
  // tools/call requires bearer; initialize/list/ping are open so clients can probe.
  let body: any = null
  try { body = await c.req.json() } catch { return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400) }

  const sensitive = body?.method === 'tools/call'
  if (sensitive) {
    const auth = c.req.header('authorization') || ''
    const ok = auth.toLowerCase() === `bearer ${c.env.AUTH_TOKEN.toLowerCase()}`
    if (!ok) return c.json({ jsonrpc: '2.0', id: body.id ?? null, error: { code: -32603, message: 'unauthorized — set Authorization: Bearer <AUTH_TOKEN>' } }, 401)
  }

  const res = await handleMcp(body, c.env)
  return c.json(res)
})

// Friendly GET so people poking the URL see something.
app.get('/mcp', (c) => c.json({
  name: `${DISPLAY_NAME} MCP server`,
  version: VERSION,
  protocol: 'JSON-RPC 2.0 over HTTP POST',
  add_to_claude: `Claude.ai → Settings → Custom MCP → URL: ${SITE_URL}/mcp · header: Authorization: Bearer <AUTH_TOKEN>`,
  tools: ['ask_council', 'manus_search', 'manus_get', 'metrics_api_use', 'healing_list', 'gab44_brand']
}))

// SEO surface for the healing page (Google needs these to crawl).
app.get('/robots.txt', (c) =>
  c.text(
    [
      'User-agent: *',
      'Allow: /healing',
      'Allow: /healing/',
      'Disallow: /council',
      'Disallow: /talk',
      'Disallow: /improve',
      'Disallow: /dashboard',
      '',
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      '',
    ].join('\n'),
  ),
)

app.get('/sitemap.xml', (c) => {
  const today = new Date().toISOString().slice(0, 10)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/healing</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>`
  return c.body(xml, 200, { 'content-type': 'application/xml; charset=utf-8' })
})

// Auth for everything below
// Exception: GET /council/ten/:id is the public trace link surfaced in Slack.
// The UUID id (16-byte random) acts as a capability token, same convention the
// dashboard / managed-agent traces use. POST /council/ten still requires bearer.
app.use('/council/*', async (c, next) => {
  if (c.req.method === 'GET' && /^\/council\/ten\/[0-9a-f-]{16,}$/.test(new URL(c.req.url).pathname)) {
    return next()
  }
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})
app.use('/talk', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})
app.use('/improve/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})
app.use('/dashboard/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})

// Aggregate state used by the dashboard's right rail + history list
app.get('/dashboard/state', async (c) => {
  const state = await buildDashboardState(c.env, c.env.KV, c.env.DB)
  return c.json(state)
})

// Manually refresh the connected-apps cache (Composio call). Run after auth changes.
app.post('/dashboard/state/refresh', async (c) => {
  try {
    const out = await refreshConnectedApps(c.env, c.env.KV)
    return c.json(out)
  } catch (err: any) {
    return fail(c, 502, 'composio_refresh_failed', String(err?.message || err))
  }
})

// Text input -> council -> text response
app.post('/council', async (c) => {
  const { input } = await c.req.json<{ input: string }>()
  if (!input) return fail(c, 400, 'invalid_input', 'input field required')

  // Probe short-circuit — fleet alive-checks shouldn't burn the council.
  const probe = classifyProbe(input)
  if (probe.probe) {
    const id = crypto.randomUUID()
    return c.json({
      id,
      input,
      final_output: probe.cheapAnswer || 'ok',
      council_steps: [{ advisor: 'probe-filter', response: probe.reason || 'probe', confidence: 1, duration_ms: 0 }],
      duration_ms: 0,
      probe: true
    })
  }

  const result = await councilPipeline(input, c.env, c.env.KV, c.env.DB)
  c.executionCtx.waitUntil(autoImprove(input, result, c.env, c.env.KV, c.env.DB))
  return c.json(result)
})

// Multimodal — text + optional image. Body: { input, image_base64?, image_mime? }.
// Image is forwarded to nao44 as an Anthropic Vision content block (Opus 4.7 has
// vision built in, no extra key). Image bypasses the skill cache (every photo
// is unique). 8 MB body limit on Workers, so the client sends a downscaled JPEG.
app.post('/council/multimodal', async (c) => {
  let body: any = null
  try { body = await c.req.json() } catch { return fail(c, 400, 'invalid_json', 'JSON body required') }
  const input: string = (body?.input ?? '').toString().slice(0, 4000)
  const image_base64: string | undefined = body?.image_base64
  const image_mime: string | undefined = body?.image_mime

  if (!input && !image_base64) return fail(c, 400, 'invalid_input', 'input or image_base64 required')

  const image = image_base64
    ? { base64: image_base64, media_type: image_mime || 'image/jpeg' }
    : null

  // Cap image at ~5 MB base64 (~3.7 MB raw) to stay well below Worker body limits.
  if (image && image.base64.length > 5_000_000) {
    return fail(c, 413, 'image_too_large', 'image_base64 must be ≤5MB; downscale client-side')
  }

  const result = await councilPipeline(input || 'What do you see in this image?', c.env, c.env.KV, c.env.DB, image)
  // Skip autoImprove for image conversations — caching a text answer to a unique
  // image would mislead future text-only queries that match the same prompt prefix.
  if (!image) {
    c.executionCtx.waitUntil(autoImprove(input, result, c.env, c.env.KV, c.env.DB))
  }
  return c.json({ ...result, multimodal: !!image })
})

// Voice input -> council -> voice response
// Body: multipart/form-data with field "audio" (Blob)
// Response: audio/mpeg, with X-Transcript / X-Reply headers (URI-encoded)
app.post('/talk', async (c) => {
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return fail(c, 400, 'invalid_form', 'multipart/form-data body required with field "audio"')
  }
  const audio = form.get('audio') as File | null
  if (!audio || typeof audio === 'string' || audio.size === 0) {
    return fail(c, 400, 'audio_required', 'audio file required (multipart field "audio")')
  }

  let transcript: string
  try {
    transcript = await transcribe(audio, c.env.ELEVENLABS_API_KEY)
  } catch (err: any) {
    return fail(c, 502, 'stt_failed', String(err?.message || err))
  }

  // Optional paralinguistic envelope from the v2 client — energy/pitch/duration
  // captured during VAD. Surfaces in nao44's prompt as emotion context.
  let voiceSignal: any = null
  const sigField = form.get('voice_signal')
  if (typeof sigField === 'string' && sigField.length > 0 && sigField.length < 1000) {
    try {
      const parsed = JSON.parse(sigField)
      if (parsed && typeof parsed === 'object') voiceSignal = parsed
    } catch { /* ignore malformed — paralinguistic is best-effort */ }
  }

  // Noise filter — ambient sound shouldn't waste a council turn.
  if (isNoiseTranscript(transcript)) {
    const reply = "I didn't quite catch that — try again when you're ready."
    try {
      const voiceId = c.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
      const ttsRes = await synthesize(reply, c.env.ELEVENLABS_API_KEY, voiceId)
      return new Response(ttsRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'no-store',
          'X-Conversation-Id': 'noise',
          'X-Transcript': encodeURIComponent(transcript),
          'X-Reply': encodeURIComponent(reply),
          'X-Filter': 'noise'
        }
      })
    } catch {
      return c.json({ filter: 'noise', transcript, reply }, 200)
    }
  }

  const result = await councilPipeline(transcript, c.env, c.env.KV, c.env.DB, null, voiceSignal)
  c.executionCtx.waitUntil(autoImprove(transcript, result, c.env, c.env.KV, c.env.DB))

  const reply = result.final_output
  const voiceId = c.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
  let ttsRes: Response
  try {
    ttsRes = await synthesize(reply, c.env.ELEVENLABS_API_KEY, voiceId)
  } catch (err: any) {
    return fail(c, 502, 'tts_failed', String(err?.message || err), { transcript, reply, conversation_id: result.id })
  }

  return new Response(ttsRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-Conversation-Id': result.id,
      'X-Transcript': encodeURIComponent(transcript),
      'X-Reply': encodeURIComponent(reply)
    }
  })
})

// Council history
app.get('/council/history', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT id, input, final_output, created_at FROM conversations ORDER BY created_at DESC LIMIT 50'
  ).all()
  return c.json(results)
})

// Retrieve past session
app.get('/council/:id', async (c) => {
  const id = c.req.param('id')
  const conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(id).first()
  if (!conv) return fail(c, 404, 'not_found', `conversation ${id} not found`)
  const steps = await c.env.DB.prepare('SELECT * FROM council_steps WHERE conversation_id = ? ORDER BY step_order').bind(id).all()
  return c.json({ conversation: conv, steps: steps.results })
})

// Auto-improve introspection
app.get('/improve/skills', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT id, pattern, answer, confidence, used_count, created_at FROM skills ORDER BY id DESC LIMIT 100'
  ).all()
  return c.json(results)
})

app.get('/improve/insights', async (c) => {
  const last = await c.env.KV.get('eval:last_insights')
  const userContext = await c.env.KV.get('user:context')
  return c.json({
    user_context: userContext,
    last_insights: last ? JSON.parse(last) : null
  })
})

app.post('/improve/cleanup-skills', async (c) => {
  // Idempotent maintenance: drop orphaned rows that no normalized lookup can
  // ever read back.
  //   - "(ref-1234-567890)" — written before the v2.11.0 normalizeForCache fix
  //   - "<prefix> : <rest>"  — written between v2.11.0 and v2.11.1, where the
  //                             ref-strip left a stray space before the colon
  const ref = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM skills WHERE pattern LIKE '%(ref-%'"
  ).first<{ n: number }>()
  const gap = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM skills WHERE pattern LIKE '% : %'"
  ).first<{ n: number }>()
  const delRef = await c.env.DB.prepare(
    "DELETE FROM skills WHERE pattern LIKE '%(ref-%'"
  ).run()
  const delGap = await c.env.DB.prepare(
    "DELETE FROM skills WHERE pattern LIKE '% : %'"
  ).run()
  const after = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM skills").first<{ n: number }>()
  return c.json({
    ref_polluted_before: ref?.n ?? 0,
    gap_polluted_before: gap?.n ?? 0,
    deleted_ref: delRef.meta?.changes ?? 0,
    deleted_gap: delGap.meta?.changes ?? 0,
    skills_remaining: after?.n ?? 0,
  })
})

app.post('/improve/eval', async (c) => {
  // ?force=1 ignores the 15-conversation threshold (for ops / manual runs)
  const force = c.req.query('force') === '1'
  const out = await maybeRunSelfEval(c.env, c.env.KV, c.env.DB, { force })
  return c.json(out)
})

// Coverage — given a topic, council pre-runs N generic factual questions so
// future organic queries on the topic hit the cache. Drives API use AND useful
// breadth at the same time. Body: { topic, count?, dry_run? }. Capped at 10.
app.post('/improve/coverage', async (c) => {
  let body: any = null
  try { body = await c.req.json() } catch { return fail(c, 400, 'invalid_json', 'JSON body required') }
  const topic = String(body?.topic || '').trim()
  if (!topic) return fail(c, 400, 'invalid_input', 'topic field required')
  if (topic.length > 200) return fail(c, 400, 'topic_too_long', 'topic must be ≤200 chars')
  const count = Number(body?.count ?? 5)
  const dry_run = !!body?.dry_run
  try {
    const run = await runCoverage(topic, count, c.env, c.executionCtx, { dry_run })
    return c.json(run)
  } catch (err: any) {
    return fail(c, 502, 'coverage_failed', String(err?.message ?? err))
  }
})

app.get('/improve/coverage/latest', async (c) => {
  const blob = await c.env.KV.get('coverage:latest')
  if (!blob) return c.json({ ok: false, message: 'no coverage runs yet' })
  try { return c.json(JSON.parse(blob)) } catch { return c.json({ raw: blob }) }
})

app.get('/improve/coverage/history', async (c) => {
  const list = await c.env.KV.list({ prefix: 'coverage:history:', limit: 50 })
  const items: any[] = []
  for (const k of (list.keys || []).slice(0, 25)) {
    const blob = await c.env.KV.get(k.name)
    if (blob) {
      try { items.push(JSON.parse(blob)) } catch {}
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return c.json({ count: items.length, items })
})

// Auto-coverage — picks the dominant topic from last 24h conversations and seeds
// 5 generic Q's via the existing coverage pipeline. Cron-driven (0 18 UTC daily);
// manual POST exposed for ops/testing. No body required.
app.post('/improve/coverage/auto', async (c) => {
  try {
    // Optional ?source=<organic|evergreen|<external>> forces a specific topic
    // stream. No param = full priority chain (organic → external → evergreen).
    // External sources are listed in EXTERNAL_SOURCES (see external_seeder.ts);
    // adding a new source registers it here automatically via the set check.
    // Optional ?count=N (1..5, default 3) overrides how many topics the external
    // path seeds in this run. Only affects external/evergreen — organic always
    // returns one dominant topic by definition.
    const sourceParam = c.req.query('source')
    const isValidSource = (s: string | undefined): boolean =>
      s === 'organic' || s === 'evergreen' || (!!s && EXTERNAL_SOURCE_SET.has(s as any))
    const force = isValidSource(sourceParam) ? sourceParam : undefined
    const countParam = Number(c.req.query('count'))
    const topic_count = Number.isFinite(countParam) && countParam > 0 ? countParam : undefined
    const opts: { force_source?: any; topic_count?: number } = {}
    if (force) opts.force_source = force
    if (topic_count) opts.topic_count = topic_count
    const run = await runAutoCoverage(c.env, c.executionCtx, opts)
    return c.json(run)
  } catch (err: any) {
    return fail(c, 502, 'auto_coverage_failed', String(err?.message ?? err))
  }
})

// External-seeder status — surfaces which topics have been seeded via the
// external pipeline (HN / Wikipedia / BBC, 30d window). Helps the dashboard
// show "fresh-from-the-world" topic streams alongside the evergreen rotation.
app.get('/improve/coverage/auto/external', async (c) => {
  const list = await c.env.KV.list({ prefix: 'coverage:external:seeded:', limit: 200 })
  const seeded: { topic: string; ts: string }[] = []
  for (const k of list.keys ?? []) {
    const topic = k.name.replace('coverage:external:seeded:', '')
    const v = await c.env.KV.get(k.name)
    if (v) seeded.push({ topic, ts: v })
  }
  seeded.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return c.json({
    seeded_count: seeded.length,
    window_days: 30,
    seeded
  })
})

app.get('/improve/coverage/auto/latest', async (c) => {
  const blob = await c.env.KV.get('coverage:auto:latest')
  if (!blob) return c.json({ ok: false, message: 'no auto-coverage runs yet — first run is at 18:00 UTC' })
  try { return c.json(JSON.parse(blob)) } catch { return c.json({ raw: blob }) }
})

app.get('/improve/coverage/auto/history', async (c) => {
  const list = await c.env.KV.list({ prefix: 'coverage:cron-history:', limit: 50 })
  const items: any[] = []
  for (const k of (list.keys || []).slice(0, 25)) {
    const blob = await c.env.KV.get(k.name)
    if (blob) {
      try { items.push(JSON.parse(blob)) } catch {}
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return c.json({ count: items.length, items })
})

// Evergreen rotation status — which topics have been seeded, when, and which
// are pending. The auto-coverage cron always picks the oldest-unseeded one
// next, so `pending` is also the next-up queue.
app.get('/improve/coverage/auto/evergreen', async (c) => {
  const list = await c.env.KV.list({ prefix: 'coverage:evergreen:seeded:', limit: 200 })
  const seenAt = new Map<string, string>()
  for (const k of list.keys ?? []) {
    const topic = k.name.replace('coverage:evergreen:seeded:', '')
    const v = await c.env.KV.get(k.name)
    if (v) seenAt.set(topic, v)
  }
  const seeded: { topic: string; ts: string }[] = []
  const pending: string[] = []
  for (const t of EVERGREEN_TOPICS) {
    const ts = seenAt.get(t)
    if (ts) seeded.push({ topic: t, ts })
    else pending.push(t)
  }
  seeded.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return c.json({
    pool_size: EVERGREEN_TOPICS.length,
    seeded_count: seeded.length,
    pending_count: pending.length,
    next_up: pending[0] ?? seeded[seeded.length - 1]?.topic ?? null,
    seeded,
    pending
  })
})

// === Per-user memory (Naoufal DO) ===
// Additive endpoints — existing /council and /talk remain untouched.
app.use('/memory/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})

app.get('/memory/profile', async (c) => {
  const stub = userDOStub(c.env)
  const res = await stub.fetch('https://do/profile', { method: 'GET' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

app.put('/memory/profile', async (c) => {
  const body = await c.req.json()
  const stub = userDOStub(c.env)
  const res = await stub.fetch('https://do/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

app.get('/memory/turns', async (c) => {
  const limit = c.req.query('limit') ?? '20'
  const stub = userDOStub(c.env)
  const res = await stub.fetch(`https://do/turns?limit=${encodeURIComponent(limit)}`, { method: 'GET' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

app.get('/memory/context', async (c) => {
  const stub = userDOStub(c.env)
  const res = await stub.fetch('https://do/context', { method: 'GET' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

// === Context DO — global world-snapshot (gmail+slack+calendar+github+streams) ===
// /memory/context/full → cached JSON blob (10-min refresh cadence)
// /memory/context/full?fresh=1 → force refresh past staleness
// POST /memory/context/refresh → on-demand refresh (auth required via global middleware)
app.get('/memory/context/full', async (c) => {
  const stub = contextDOStub(c.env)
  const fresh = c.req.query('fresh') === '1'
  const res = await stub.fetch(`https://do/blob${fresh ? '/fresh' : ''}`, { method: 'GET' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})
app.get('/memory/context/summary', async (c) => {
  const stub = contextDOStub(c.env)
  const res = await stub.fetch('https://do/summary', { method: 'GET' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})
app.post('/memory/context/refresh', async (c) => {
  const stub = contextDOStub(c.env)
  const res = await stub.fetch('https://do/refresh', { method: 'POST' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

// === Tool Router probe — race Opus + Minimax for one task, return decision ===
// POST /orchestrator/route {task} — for testing the router in isolation.
// Auth required via /memory/* and /orchestrator/* middlewares (added below).
app.post('/orchestrator/route', async (c) => {
  const body = await c.req.json<{ task: string }>()
  if (!body?.task) return fail(c, 400, 'invalid_input', 'task field required')
  const decision = await routeTool(body.task, c.env, c.env.KV)
  return c.json(decision)
})

// === Orchestrator DO — closed-loop goal runner ===
// Auth: /orchestrator/* protected by bearer like /memory/*.
app.use('/orchestrator/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})

app.post('/orchestrator/goal', async (c) => {
  const body = await c.req.json<{ goal: string }>()
  if (!body?.goal) return fail(c, 400, 'invalid_input', 'goal field required')
  const stub = orchestratorDOStub(c.env)
  const res = await stub.fetch('https://do/goal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal: body.goal }),
  })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

app.get('/orchestrator/goal/:id', async (c) => {
  const id = c.req.param('id')
  const stub = orchestratorDOStub(c.env)
  const res = await stub.fetch(`https://do/goal/${encodeURIComponent(id)}`, { method: 'GET' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

app.get('/orchestrator/goals', async (c) => {
  const stub = orchestratorDOStub(c.env)
  const res = await stub.fetch('https://do/goals', { method: 'GET' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

app.post('/orchestrator/tick', async (c) => {
  const stub = orchestratorDOStub(c.env)
  const res = await stub.fetch('https://do/tick', { method: 'POST' })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

// === Council of Ten — direct lane (bearer-auth) ===
// POST /council/ten {goal} → runs the full 8-advisor pipeline immediately
//                           (no orchestrator DO, no plan), returns the result.
// GET  /council/ten/:id   → renders the full trace HTML page (mobile-first).
app.post('/council/ten', async (c) => {
  const body = await c.req.json<{ goal?: string; topic?: string }>()
  const topic = body?.goal || body?.topic
  if (!topic) return fail(c, 400, 'invalid_input', 'goal or topic field required')
  const { runCouncilOfTen } = await import('./orchestrator/council_of_ten')
  const result = await runCouncilOfTen(topic, c.env, c.env.KV, c.env.DB)
  // Best-effort post to #orchestrator on direct calls too — keeps the channel
  // current even when the council is invoked outside the orchestrator DO.
  c.executionCtx.waitUntil((async () => {
    try {
      const { postToChannel, sectionBlock, contextBlock } = await import('./notify/slack_channels')
      const synth = result.synth
      const valid = result.advisors.filter(a => a.verdict).length
      const rec = synth?.recommendation ?? 'unknown'
      const blocks = [
        sectionBlock(`*Council of Ten* — _${topic.slice(0, 200)}_`),
        sectionBlock(`*${rec.toUpperCase()}* · confidence ${((synth?.confidence ?? 0) * 100).toFixed(0)}% · ${valid}/8 advisors · agreement ${result.agreement_pct}%`),
        sectionBlock(synth?.rationale ? `> ${synth.rationale.slice(0, 600)}` : '> (no synth rationale)'),
        contextBlock(
          `synth=${synth?.synth_provider ?? 'none'} · evidence=${result.evidence.source} · ${result.duration_ms}ms`,
          `<https://nao00.nchobah.com/council/ten/${result.id}|view full trace>`,
        ),
      ]
      await postToChannel(c.env, 'orchestrator', { text: `Council of Ten ⇒ ${rec.toUpperCase()} (${valid}/8) — ${topic.slice(0, 100)}`, blocks })
    } catch { /* slack-best-effort */ }
  })())
  return c.json(result)
})

app.get('/council/ten/:id', async (c) => {
  const id = c.req.param('id')
  const { readCouncilTrace } = await import('./orchestrator/council_of_ten')
  const { renderCouncilTracePage } = await import('./orchestrator/council_trace_page')
  const trace = await readCouncilTrace(c.env.KV, id)
  if (!trace) {
    return c.html(`<!doctype html><meta charset=utf-8><title>not found</title><body style="font:14px system-ui;padding:24px"><h1>Council trace not found</h1><p><code>${id.replace(/[<>"&']/g, '')}</code> has either expired (30d TTL) or was never recorded.</p></body>`, 404)
  }
  return c.html(renderCouncilTracePage(trace))
})

// === Slack Events API — inert until SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET land ===
// NO bearer-auth wrapper here — Slack signs its own requests. Auth is HMAC verification.
// See ~/nao00/SLACK-PLAN.md Phase 2 for the manual app-creation steps.
app.post('/slack/events', async (c) => {
  return handleSlackEvent(c.req.raw, c.env, c.executionCtx as any)
})
// GET shows status so you can sanity-check from a browser.
app.get('/slack/events', (c) => c.json({ status: slackAppStatus(c.env), hint: 'POST events from Slack land here once SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET are set.' }))

// === Unified event log — anything that happens writes one row, three readers ===
//   1. #all-nao00 firehose (Slack, you read it)
//   2. /events/recent?since=<ms>  (terminal Anouf polls it)
//   3. (future) OneSignal phone push
app.use('/events/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})
app.get('/events/recent', async (c) => {
  const since = Number(c.req.query('since') ?? '0')
  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200)
  const events = await readEventsSince(c.env, Number.isFinite(since) ? since : 0, limit)
  return c.json({ count: events.length, latest_ts: await latestEventTs(c.env), events })
})
app.get('/events/latest', async (c) => {
  const ts = await latestEventTs(c.env)
  return c.json({ latest_ts: ts })
})
app.post('/events/append', async (c) => {
  // Manual append for tests — and the bridge a non-Worker caller can use.
  const body = await c.req.json<{ kind: string; source: string; text: string; meta?: any }>()
  if (!body?.kind || !body?.source || !body?.text) {
    return fail(c, 400, 'invalid_input', 'kind+source+text required')
  }
  await appendEvent(c.env, body as any)
  return c.json({ ok: true, ts: Date.now() })
})

// === Credentials intake — secure one-time paste form for sending Anouf an API key
// without putting the value into chat / Slack / git.
//   POST /credentials/intake/token  (bearer-auth) — issues a one-time URL
//   GET  /credentials/intake?t=...  (public, gated by token) — paste form HTML
//   POST /credentials/intake?t=...  (public, gated by token) — submits the value
app.post('/credentials/intake/token', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  const url = new URL(c.req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const result = await issueIntakeToken(c.env as any, baseUrl)
  return c.json(result)
})
app.get('/credentials/intake', async (c) => renderIntakeForm(c.req.raw, c.env as any))
app.post('/credentials/intake', async (c) => handleIntakeSubmit(c.req.raw, c.env as any))

// === Tiered synthesis — bearer-auth, manual trigger (cron normally drives) ===
app.use('/synthesis/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})
app.post('/synthesis/tick', async (c) => {
  const result = await synthesisTick(c.env)
  return c.json(result)
})
app.post('/synthesis/10min', async (c) => {
  const { tenMinCheck } = await import('./notify/synthesis')
  return c.json(await tenMinCheck(c.env))
})
app.post('/synthesis/40min', async (c) => {
  const { fortyMinDigest } = await import('./notify/synthesis')
  return c.json(await fortyMinDigest(c.env))
})
app.post('/synthesis/1h', async (c) => {
  const { hourlyStory } = await import('./notify/synthesis')
  return c.json(await hourlyStory(c.env))
})

app.post('/orchestrator/kill', async (c) => {
  const body = await c.req.json<{ id: string }>()
  if (!body?.id) return fail(c, 400, 'invalid_input', 'id field required')
  const stub = orchestratorDOStub(c.env)
  const res = await stub.fetch('https://do/kill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: body.id }),
  })
  return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } })
})

// Nemotron ping — direct call to NVIDIA NIM for ad-hoc long-doc / reasoning work.
// Returns answer + reasoning trace. Bearer-auth protected via the global middleware.
app.post('/nemotron/ask', async (c) => {
  if (!c.env.NVIDIA_API_KEY) return fail(c, 503, 'nvidia_not_configured', 'NVIDIA_API_KEY not bound')
  const body = await c.req.json<{ prompt: string; system?: string; max_tokens?: number; temperature?: number }>()
  if (!body?.prompt) return fail(c, 400, 'invalid_input', 'prompt field required')
  const { nemotronReason } = await import('./tools/nemotron')
  const r = await nemotronReason(
    { prompt: body.prompt, system: body.system, max_tokens: body.max_tokens, temperature: body.temperature },
    c.env.NVIDIA_API_KEY,
    'other',
    c.env.DB
  )
  return c.json(r)
})

// /memory/me — what v2 inspector shows: user context + recent cached skills.
app.get('/memory/me', async (c) => {
  const context = await c.env.KV.get('user:context') || ''
  const skills = await c.env.DB.prepare(
    'SELECT pattern, used_count FROM skills ORDER BY used_count DESC, id DESC LIMIT 5'
  ).all()
  return c.json({ context, recent_skills: skills.results ?? [] })
})

// /history — last N conversations with cache-hit flag for v2 thread badges.
app.get('/history', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100)
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.input, c.final_output, c.created_at,
            EXISTS (SELECT 1 FROM council_steps cs WHERE cs.conversation_id = c.id AND cs.advisor_name = 'cache') AS from_cache
     FROM conversations c
     ORDER BY c.created_at DESC
     LIMIT ?`
  ).bind(limit).all<any>()
  const items = (rows.results ?? []).map((r: any) => ({
    id: r.id, input: r.input, final_output: r.final_output,
    created_at: r.created_at, from_cache: !!r.from_cache
  }))
  return c.json({ count: items.length, items })
})

// === Composio MCP tools (Cloudflare-only path; consumer key works via MCP) ===
app.use('/tools/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})

app.get('/tools/list', async (c) => {
  if (!c.env.COMPOSIO_API_KEY) return fail(c, 503, 'composio_not_configured', 'COMPOSIO_API_KEY not bound')
  const cached = await c.env.KV.get('tools:list', 'json') as { tools: any[]; cached_at: number } | null
  if (cached && Date.now() - cached.cached_at < 24 * 60 * 60 * 1000) {
    return c.json({ tools: cached.tools, cached: true, cached_at: cached.cached_at })
  }
  try {
    const mcp = new ComposioMCP(c.env.COMPOSIO_API_KEY)
    const tools = await mcp.listTools()
    await c.env.KV.put('tools:list', JSON.stringify({ tools, cached_at: Date.now() }), { expirationTtl: 25 * 60 * 60 })
    return c.json({ tools, cached: false, count: tools.length })
  } catch (err: any) {
    return fail(c, 502, 'mcp_list_failed', String(err?.message ?? err))
  }
})

// === Manus archive search (151 past tasks Naoufal ran on Manus, exported 2026-05-07) ===
app.use('/manus/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})

interface ManusEntry { id: string; status: string; created: string; title: string; user: string; asst: string }

async function loadManusDigest(env: Bindings): Promise<ManusEntry[]> {
  const cached = await env.KV.get('manus:digest', 'json') as ManusEntry[] | null
  return cached ?? []
}

app.get('/manus/search', async (c) => {
  const q = (c.req.query('q') ?? '').toLowerCase().trim()
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100)
  const status = c.req.query('status')
  const digest = await loadManusDigest(c.env)
  let results = digest
  if (status) results = results.filter(r => r.status === status)
  if (q) {
    results = results.filter(r =>
      (r.title || '').toLowerCase().includes(q) ||
      (r.user || '').toLowerCase().includes(q) ||
      (r.asst || '').toLowerCase().includes(q)
    )
  }
  results = results.slice(0, limit)
  return c.json({ total: digest.length, returned: results.length, q, status: status ?? null, results })
})

app.get('/manus/get/:id', async (c) => {
  const id = c.req.param('id')
  const digest = await loadManusDigest(c.env)
  const entry = digest.find(r => r.id === id)
  if (!entry) return fail(c, 404, 'not_found', `manus task ${id} not in digest`)
  return c.json({ ...entry, manus_url: `https://manus.im/app/${id}` })
})

app.get('/manus/stats', async (c) => {
  const digest = await loadManusDigest(c.env)
  const by_status: Record<string, number> = {}
  for (const r of digest) by_status[r.status] = (by_status[r.status] ?? 0) + 1
  return c.json({ total: digest.length, by_status })
})

// Composio MCP exposes 7 meta-tools at the top level (COMPOSIO_*). Bare app slugs
// like GMAIL_LIST_LABELS must be wrapped via COMPOSIO_MULTI_EXECUTE_TOOL. Auto-wrap
// here so callers can post {name:"GMAIL_LIST_LABELS", args:{...}} and have it work.
const COMPOSIO_META = new Set([
  'COMPOSIO_MANAGE_CONNECTIONS',
  'COMPOSIO_MULTI_EXECUTE_TOOL',
  'COMPOSIO_REMOTE_BASH_TOOL',
  'COMPOSIO_REMOTE_WORKBENCH',
  'COMPOSIO_SEARCH_TOOLS',
  'COMPOSIO_WAIT_FOR_CONNECTIONS',
  'COMPOSIO_GET_TOOL_SCHEMAS'
])

app.post('/tools/call', async (c) => {
  if (!c.env.COMPOSIO_API_KEY) return fail(c, 503, 'composio_not_configured', 'COMPOSIO_API_KEY not bound')
  const { name, args } = await c.req.json<{ name: string; args?: Record<string, any> }>()
  if (!name) return fail(c, 400, 'invalid_input', 'name field required')
  try {
    const mcp = new ComposioMCP(c.env.COMPOSIO_API_KEY)
    let callName = name
    let callArgs: Record<string, any> = args ?? {}
    let auto_wrapped = false
    if (!COMPOSIO_META.has(name)) {
      callName = 'COMPOSIO_MULTI_EXECUTE_TOOL'
      callArgs = { tools: [{ tool_slug: name, arguments: args ?? {} }] }
      auto_wrapped = true
    }
    const result = await mcp.callTool(callName, callArgs)
    return c.json(auto_wrapped ? { ...result, auto_wrapped, original_slug: name } : result)
  } catch (err: any) {
    return fail(c, 502, 'mcp_call_failed', String(err?.message ?? err))
  }
})

// One-click OAuth: hit COMPOSIO_MANAGE_CONNECTIONS action=add to get a redirect_url for the user to click.
app.post('/tools/connect', async (c) => {
  if (!c.env.COMPOSIO_API_KEY) return fail(c, 503, 'composio_not_configured', 'COMPOSIO_API_KEY not bound')
  const { toolkit } = await c.req.json<{ toolkit: string }>()
  if (!toolkit) return fail(c, 400, 'invalid_input', 'toolkit slug required (e.g. "gmail")')
  try {
    const mcp = new ComposioMCP(c.env.COMPOSIO_API_KEY)
    const result = await mcp.callTool('COMPOSIO_MANAGE_CONNECTIONS', {
      toolkits: [{ name: toolkit, action: 'add' }]
    })
    // Composio puts the redirect_url inside content[0].text as JSON
    const text = result.content?.[0]?.text ?? ''
    let redirect_url: string | null = null
    try {
      const parsed = JSON.parse(text)
      redirect_url = parsed?.data?.results?.[toolkit]?.redirect_url
        ?? parsed?.data?.redirect_url
        ?? parsed?.redirect_url
        ?? null
    } catch {}
    return c.json({ toolkit, redirect_url, raw: text })
  } catch (err: any) {
    return fail(c, 502, 'mcp_connect_failed', String(err?.message ?? err))
  }
})

// Morning briefing — produced daily at 0:00 UTC (= 7am Bangkok).
app.get('/briefing/latest', async (c) => {
  const blob = await c.env.KV.get('briefing:latest')
  if (!blob) return c.json({ ok: false, message: 'no briefing yet — first run is at 0:00 UTC' })
  try { return c.json(JSON.parse(blob)) } catch { return c.json({ raw: blob }) }
})

app.get('/briefing/history', async (c) => {
  const list = await c.env.KV.list({ prefix: 'briefing:history:', limit: 30 })
  const items: any[] = []
  for (const k of list.keys) {
    const blob = await c.env.KV.get(k.name)
    if (blob) {
      try { items.push(JSON.parse(blob)) } catch {}
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return c.json({ count: items.length, items })
})

// Manual trigger for the briefing (auth required) — for testing without waiting for the cron.
app.post('/briefing/run', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  try {
    const result = await runMorningBriefing(c.env, c.executionCtx)
    return c.json({ ok: true, result })
  } catch (err: any) {
    return fail(c, 502, 'briefing_failed', String(err?.message ?? err))
  }
})

// Evening recap — produced daily at 16:00 UTC (= 23:00 Bangkok).
app.get('/recap/latest', async (c) => {
  const blob = await c.env.KV.get('recap:latest')
  if (!blob) return c.json({ ok: false, message: 'no recap yet — first run is at 16:00 UTC' })
  try { return c.json(JSON.parse(blob)) } catch { return c.json({ raw: blob }) }
})

app.get('/recap/history', async (c) => {
  const list = await c.env.KV.list({ prefix: 'recap:history:', limit: 30 })
  const items: any[] = []
  for (const k of list.keys) {
    const blob = await c.env.KV.get(k.name)
    if (blob) {
      try { items.push(JSON.parse(blob)) } catch {}
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return c.json({ count: items.length, items })
})

app.post('/recap/run', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  try {
    const result = await runEveningRecap(c.env, c.executionCtx)
    return c.json({ ok: true, result })
  } catch (err: any) {
    return fail(c, 502, 'recap_failed', String(err?.message ?? err))
  }
})

// Notify — push the latest briefing/recap to gmail/slack via Composio.
// Intended to fire automatically right after each cron, but exposed manually
// for testing. Auth required because these touch external accounts.
app.post('/notify/briefing', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  try {
    const blob = await c.env.KV.get('briefing:latest')
    if (!blob) return fail(c, 404, 'no_briefing', 'run /briefing/run first')
    const briefing = JSON.parse(blob)
    const r = await sendBriefingEmail(c.env, briefing)
    return c.json({ ok: r.ok, result: r })
  } catch (err: any) {
    return fail(c, 502, 'notify_failed', String(err?.message ?? err))
  }
})

app.post('/notify/recap', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  try {
    const blob = await c.env.KV.get('recap:latest')
    if (!blob) return fail(c, 404, 'no_recap', 'run /recap/run first')
    const recap = JSON.parse(blob)
    const r = await sendRecapSlack(c.env, recap)
    return c.json({ ok: r.ok, result: r })
  } catch (err: any) {
    return fail(c, 502, 'notify_failed', String(err?.message ?? err))
  }
})

// Weekly digest — Sunday 17:00 UTC = Monday 00:00 Bangkok (just past midnight).
app.get('/weekly/latest', async (c) => {
  const blob = await c.env.KV.get('weekly:latest')
  if (!blob) return c.json({ ok: false, message: 'no weekly digest yet — first run is Sunday 17:00 UTC' })
  try { return c.json(JSON.parse(blob)) } catch { return c.json({ raw: blob }) }
})

app.get('/weekly/history', async (c) => {
  const list = await c.env.KV.list({ prefix: 'weekly:history:', limit: 30 })
  return c.json({ ok: true, count: (list.keys || []).length, keys: (list.keys || []).map((k: any) => k.name) })
})

app.post('/weekly/run', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  try {
    const r = await runWeeklyDigest(c.env, c.executionCtx)
    return c.json(r)
  } catch (err: any) {
    return fail(c, 502, 'weekly_failed', String(err?.message ?? err))
  }
})

app.post('/notify/weekly', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  try {
    const blob = await c.env.KV.get('weekly:latest')
    if (!blob) return fail(c, 404, 'no_weekly', 'run /weekly/run first')
    const digest = JSON.parse(blob)
    const r = await sendWeeklyDigestSlack(c.env, digest)
    return c.json({ ok: r.ok, result: r })
  } catch (err: any) {
    return fail(c, 502, 'notify_failed', String(err?.message ?? err))
  }
})

// /notify/alert — fleet watchdogs scream here when something's down.
// Posts to NOTIFY_SLACK_CHANNEL as a top-level message (not threaded).
// Body: { text: string, source?: string }
app.post('/notify/alert', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const text = String(body?.text || '').slice(0, 1500)
    const source = String(body?.source || 'watchdog').slice(0, 64)
    if (!text) return fail(c, 400, 'invalid_input', 'body.text required')
    const r = await sendAlertSlack(c.env, text, source)
    return c.json({ ok: r.ok, result: r })
  } catch (err: any) {
    return fail(c, 502, 'notify_failed', String(err?.message ?? err))
  }
})

// /inbox/slack/poll — Naoufal-DMs-the-bot bridge. Pulls the latest unseen
// inbound messages from the Composio slack DM, runs each through the council,
// and replies in-thread. Designed to be hit by Nemoclaw cron every minute
// (the 5-trigger limit on this account is already maxed).
app.post('/inbox/slack/poll', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
}, async (c) => {
  try {
    const r = await pollSlackInbox(c.env)
    return c.json(r)
  } catch (err: any) {
    return fail(c, 502, 'inbox_poll_failed', String(err?.message ?? err))
  }
})

// /inbox/slack/state — last-poll status for the dashboard / debugging.
app.get('/inbox/slack/state', async (c) => {
  const ch = c.env.NOTIFY_SLACK_CHANNEL
  if (!ch) return c.json({ ok: false, error: 'no_NOTIFY_SLACK_CHANNEL' })
  await c.env.DB.exec(
    'CREATE TABLE IF NOT EXISTS slack_inbox_state (channel_id TEXT PRIMARY KEY, last_seen_ts TEXT, last_run_at TEXT, last_inbound INTEGER DEFAULT 0, last_replied INTEGER DEFAULT 0, last_error TEXT)'
  )
  const row = await c.env.DB.prepare(
    'SELECT channel_id, last_seen_ts, last_run_at, last_inbound, last_replied, last_error FROM slack_inbox_state WHERE channel_id = ?'
  ).bind(ch).first()
  return c.json({ ok: true, channel: ch, state: row || null })
})

// Self-reflection — what the 15-min cron produced.
app.get('/reflection/latest', async (c) => {
  const blob = await c.env.KV.get('reflection:latest')
  if (!blob) return c.json({ ok: false, message: 'no reflection yet' })
  try { return c.json(JSON.parse(blob)) } catch { return c.json({ raw: blob }) }
})

app.get('/reflection/history', async (c) => {
  const list = await c.env.KV.list({ prefix: 'reflection:history:', limit: 50 })
  const items: any[] = []
  for (const k of list.keys.slice(0, 25)) {
    const blob = await c.env.KV.get(k.name)
    if (blob) {
      try { items.push(JSON.parse(blob)) } catch {}
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return c.json({ count: items.length, items })
})

// Recent tool calls — for dashboard "Tools" panel.
app.get('/tools/recent', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT cs.response, cs.confidence, cs.duration_ms, c.id AS conv_id, c.input, c.created_at
    FROM council_steps cs
    JOIN conversations c ON c.id = cs.conversation_id
    WHERE cs.advisor_name = 'tool'
    ORDER BY c.created_at DESC
    LIMIT 25
  `).all()
  return c.json(rows)
})

// Self-reflection cron — every 15min runs one Nemotron call so the pillar metric
// stays green AND produces a usable "next-build" suggestion. Nemotron (not the council)
// because: (1) cheaper than firing 3 Anthropic+Mistral calls, (2) gives us real production
// load on the new model, (3) reflection isn't user-facing — Nemotron's reasoning trace is
// the value, not chat polish. Stored in KV at `reflection:latest` and history (180d TTL).
async function selfReflectionTick(env: any, ctx: any) {
  const prompts = [
    'In one sentence: what should nao_00 build or improve next? Pick something concrete and small.',
    'Looking at the recent council activity, what pattern do you notice? One sentence.',
    'What is one risk in the current nao_00 system that we are not yet handling? One sentence.',
    'What would push our pillar metric (API use) from yellow to green sustainably? One sentence.',
    'If you had 30 minutes of dev time right now, what would you ship? One sentence.'
  ]
  const input = prompts[Math.floor(Math.random() * prompts.length)]
  try {
    if (env.NVIDIA_API_KEY) {
      const { nemotronReason } = await import('./tools/nemotron')
      const r = await nemotronReason(
        {
          system: 'You are nao_00, reflecting on your own system. Be concrete and specific. Reply in exactly one sentence.',
          prompt: input,
          max_tokens: 400
        },
        env.NVIDIA_API_KEY,
        'eval',
        env.DB
      )
      const ts = new Date().toISOString()
      const blob = JSON.stringify({
        ts, prompt: input, answer: r.answer, reasoning: r.reasoning,
        model: 'nvidia/nemotron-3-super-120b-a12b',
        input_tokens: r.input_tokens, output_tokens: r.output_tokens, duration_ms: r.duration_ms
      })
      ctx.waitUntil(Promise.all([
        env.KV.put('reflection:latest', blob),
        env.KV.put(`reflection:history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 180 })
      ]))
    } else {
      // Fallback: full council (kept so cron still produces something if NVIDIA key is rotated/missing).
      const result = await councilPipeline(input, env, env.KV, env.DB)
      const ts = new Date().toISOString()
      const blob = JSON.stringify({ ts, prompt: input, answer: result.final_output, conversation_id: result.id })
      ctx.waitUntil(Promise.all([
        env.KV.put('reflection:latest', blob),
        env.KV.put(`reflection:history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 180 })
      ]))
    }
  } catch (err) {
    // Cron failures must not throw — log and move on.
    console.error('selfReflectionTick error', err)
  }
}

export default {
  fetch: app.fetch.bind(app),
  // Two crons: */15 → self-reflection (Nemotron, cheap, keeps pillar metric green).
  // 0 0 * * * → morning briefing (gmail+calendar+nao44 synthesis, daily 7am Bangkok).
  scheduled: async (event: any, env: any, ctx: any) => {
    if (event?.cron === '0 0 * * *') {
      try {
        const briefing = await runMorningBriefing(env, ctx)
        // Push to gmail right after — defaults to draft mode (see src/notify).
        try { await sendBriefingEmail(env, briefing) }
        catch (err) { console.error('briefing notify error', err) }
      } catch (err) { console.error('morning briefing error', err) }
    } else if (event?.cron === '0 16 * * *') {
      try {
        const recap = await runEveningRecap(env, ctx)
        try { await sendRecapSlack(env, recap) }
        catch (err) { console.error('recap notify error', err) }
      } catch (err) { console.error('evening recap error', err) }
    } else if (event?.cron === '0 17 * * SUN' || event?.cron === '0 17 * * 0' || event?.cron === '0 17 * * 7') {
      // Sunday 17:00 UTC — weekly digest. Lands one hour after the daily Sunday
      // recap so today's recap is included in the weekly aggregate.
      try {
        const digest = await runWeeklyDigest(env, ctx)
        try { await sendWeeklyDigestSlack(env, digest) }
        catch (err) { console.error('weekly notify error', err) }
      } catch (err) { console.error('weekly digest error', err) }
    } else if (
      event?.cron === '0 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *' || // v2.42.0 (CURRENT)
      event?.cron === '0 1,2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *' || // v2.41.0
      event?.cron === '0 1,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *' || // v2.40.0
      event?.cron === '0 3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *' || // v2.39.0
      event?.cron === '0 3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23 * * *' || // v2.38.0
      event?.cron === '0 3,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23 * * *' || // v2.37.0
      event?.cron === '0 3,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23 * * *' || // v2.36.0
      event?.cron === '0 3,6,7,8,9,10,11,12,13,15,16,17,18,21,22,23 * * *' || // v2.35.0 (was missing — fixed in 2.36)
      event?.cron === '0 3,6,7,8,9,10,11,13,15,16,17,18,21,22,23 * * *' || // v2.34.0
      event?.cron === '0 3,6,7,8,9,11,13,15,16,17,18,21,22,23 * * *' || // v2.32.0
      event?.cron === '0 3,6,8,9,11,13,15,16,17,18,21,22,23 * * *' || // v2.31.0
      event?.cron === '0 3,6,8,9,11,13,15,16,17,18,21,23 * * *' ||    // v2.30.0
      event?.cron === '0 3,6,8,9,11,13,15,16,18,21,23 * * *' ||       // v2.29.0
      event?.cron === '0 3,6,8,11,13,15,16,18,21,23 * * *' ||         // v2.28.0
      event?.cron === '0 3,6,8,11,13,16,18,21,23 * * *' ||            // v2.27.0
      event?.cron === '0 3,8,11,13,16,18,21,23 * * *' ||              // v2.26.0
      event?.cron === '0 3,8,11,13,16,18,23 * * *' ||                 // v2.25.0
      event?.cron === '0 3,8,11,13,18,23 * * *' ||                    // v2.24.0
      event?.cron === '0 3,8,13,18,23 * * *' ||                       // v2.23.0
      event?.cron === '0 6,12,18 * * *' ||                            // pre-2.22.0
      event?.cron === '0 18 * * *'                                    // pre-2.18.0
    ) {
      // Auto-coverage 23x/day at 01/02/03/04/05/06/07/08/09/10/11/12/13/14/15/16/17/18/19/20/21/22/23 UTC. Each tick picks the
      // dominant topic from the last 24h of organic council inputs OR rotates
      // through 23 external sources (one per axis: cooking/academia/arxiv/money/diy/askubuntu/
      // security/github/math/dsp/stackoverflow/ux/hn/gis/crossvalidated/serverfault/codereview/
      // wikipedia/biology/philosophy/superuser/electronics/bbc) OR evergreen rotation as final
      // fallback. Compounds the cache hands-free. Legacy cron strings kept so any in-flight
      // pre-2.42 schedule still routes correctly during the rollout window.
      try {
        await runAutoCoverage(env, ctx)
      } catch (err) { console.error('auto coverage error', err) }
    } else {
      // */15 cron: self-reflection runs every tick (cheap Nemotron call) AND
      // tiered synthesis layer multiplexes on minute-of-hour:
      //   minute=0  → 1-hour story (Opus)
      //   minute=45 → 40-min digest (Mistral)
      //   every tick → 10-min check (Haiku)
      // Both run in parallel and are scheduled via waitUntil so the cron
      // returns fast.
      // Continuity report — hourly (minute 0 of each */15 cycle)
      const cronMinute = new Date(event.scheduledTime).getMinutes()
      if (cronMinute === 0) {
        ctx.waitUntil(buildContinuityReport(env, env.KV, env.DB).catch((e: any) => console.error('[continuity]', e)))
      }
      ctx.waitUntil(selfReflectionTick(env, ctx))
      ctx.waitUntil(synthesisTick(env).catch((err: any) => console.error('synthesis tick error', err)))
    }
  }
}
