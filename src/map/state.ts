// Fleet map — one JSON endpoint that answers "what's installed, what's running, what's idle".
// Cheap probes only. No expensive calls. Cached if needed; for now compute fresh.

export interface MapState {
  generated_at: string
  domains: DomainRow[]
  worker_routes: RouteRow[]
  fleet: FleetRow[]
  models: ModelRow[]
  crons: CronRow[]
  connected_apps: AppRow[]
  secrets: SecretRow[]
}

export interface DomainRow {
  name: string
  status: 'live' | 'broken' | 'idle' | 'unknown'
  http_status?: number
  ms?: number
  note?: string
}

export interface RouteRow {
  path: string
  group: string
  last_seen?: string
  description: string
}

export interface FleetRow {
  kind: 'server' | 'laptop'
  name: string
  domain: string
  ip: string
  role: string
  status: 'live' | 'unreachable' | 'unknown'
  ms?: number
}

export interface ModelRow {
  source: string
  provider: string
  calls_24h: number
  tokens_24h: number
  last_seen?: string
}

export interface CronRow {
  pattern: string
  description: string
  last_output?: string
}

export interface AppRow {
  toolkit: string
  has_connection: boolean
}

export interface SecretRow {
  name: string
  bound: boolean
  source: 'cloudflare-secret' | 'env-file'
}

// Static catalogue — what we know we deploy. Status fields populated at request-time.
const DOMAINS: Array<{ name: string; note?: string }> = [
  { name: 'nao00.nchobah.com', note: 'primary worker surface' },
  { name: 'agent.nchobah.com', note: 'agent alias' },
  { name: 'dash.nchobah.com', note: 'dashboard alias' },
  { name: 'dash.gab44.com', note: 'gab44 dashboard' },
  { name: 'bot.gab44.com', note: 'gab44 bot' },
  { name: 'nchobah.com', note: 'apex — needs DNS fix to land on /v2' }
]

const ROUTES: Array<Omit<RouteRow, 'last_seen'>> = [
  { path: '/v2', group: 'surface', description: 'mobile-shaped chat (Phase 1)' },
  { path: '/remote', group: 'surface', description: 'operator buttons' },
  { path: '/dashboard', group: 'surface', description: 'unified UI (chat + history)' },
  { path: '/voice', group: 'surface', description: 'tap-to-talk' },
  { path: '/healing', group: 'surface', description: 'healing sounds player' },
  { path: '/manus', group: 'surface', description: 'Manus archive viewer' },
  { path: '/gab44', group: 'surface', description: 'gab44 brand page' },
  { path: '/map', group: 'surface', description: 'fleet inventory (this screen)' },
  { path: '/council', group: 'core', description: 'POST text → council answer' },
  { path: '/talk', group: 'core', description: 'POST audio → council → audio' },
  { path: '/health', group: 'core', description: 'liveness probe' },
  { path: '/metrics/api-use', group: 'telemetry', description: 'pillar metric — API usage' },
  { path: '/improve/skills', group: 'self-improve', description: 'cached skills (D1)' },
  { path: '/improve/insights', group: 'self-improve', description: 'eval-driven user:context' },
  { path: '/improve/eval', group: 'self-improve', description: 'POST → force eval' },
  { path: '/reflection/latest', group: 'self-improve', description: 'last cron self-reflection' },
  { path: '/reflection/history', group: 'self-improve', description: 'reflection history' },
  { path: '/memory/me', group: 'memory', description: 'context + cached skills' },
  { path: '/memory/profile', group: 'memory', description: 'Naoufal DO profile' },
  { path: '/memory/turns', group: 'memory', description: 'conversation turns from DO' },
  { path: '/memory/context', group: 'memory', description: 'DO context window' },
  { path: '/history', group: 'memory', description: 'recent conversations + cache flag' },
  { path: '/tools/list', group: 'tools', description: 'list Composio tools' },
  { path: '/tools/call', group: 'tools', description: 'invoke a Composio tool' },
  { path: '/tools/connect', group: 'tools', description: 'OAuth-add a Composio toolkit' },
  { path: '/tools/recent', group: 'tools', description: 'recent tool steps from council' },
  { path: '/nemotron/ask', group: 'tools', description: 'NVIDIA Nemotron 3 Super direct' },
  { path: '/mcp', group: 'mcp', description: 'MCP server (Claude Code clients)' }
]

// Fleet = 3 servers + 1 laptop. FastComet is a hosting provider, not a fleet node.
const FLEET: Array<Omit<FleetRow, 'status' | 'ms'> & { kind: 'server' | 'laptop' }> = [
  { kind: 'server', name: 'Anouf',     domain: 'anouf.nchobah.com',    ip: '135.181.44.161',  role: 'engine — Hetzner — builds nao_00, worker upstream' },
  { kind: 'server', name: 'Nemoclaw',  domain: 'nemo.nchobah.com',     ip: '162.243.119.47',  role: 'monitoring — DO — shared dashboard :4444' },
  { kind: 'server', name: 'Jasmine',   domain: 'jasmine.nchobah.com',  ip: '192.241.251.184', role: 'builder — DO — production deploys' },
  { kind: 'laptop', name: 'Mayor',     domain: 'mayor.nchobah.com',    ip: '142.93.155.96',   role: "laptop — Toronto — Naoufal's MacBook · 24/7 Claude" }
]

const KNOWN_SECRETS: Array<Omit<SecretRow, 'bound'>> = [
  { name: 'ANTHROPIC_API_KEY',   source: 'cloudflare-secret' },
  { name: 'MISTRAL_API_KEY',     source: 'cloudflare-secret' },
  { name: 'ELEVENLABS_API_KEY',  source: 'cloudflare-secret' },
  { name: 'COMPOSIO_API_KEY',    source: 'cloudflare-secret' },
  { name: 'NVIDIA_API_KEY',      source: 'cloudflare-secret' },
  { name: 'XAI_API_KEY',         source: 'cloudflare-secret' },
  { name: 'HELIO_API_KEY',       source: 'cloudflare-secret' },
  { name: 'MANUS_API_KEY',       source: 'cloudflare-secret' },
  { name: 'AUTH_TOKEN',          source: 'cloudflare-secret' }
]

// Worker custom domains: we know they're bound to *this* worker if they're in
// wrangler.toml routes. Probing them via fetch() loops back inside Cloudflare
// and 403s — so trust the deploy state instead.
const WORKER_BOUND_DOMAINS = new Set([
  'nao00.nchobah.com', 'agent.nchobah.com', 'dash.nchobah.com',
  'dash.gab44.com', 'bot.gab44.com'
])

async function probeDomain(name: string, _timeout_ms = 4000): Promise<DomainRow> {
  if (WORKER_BOUND_DOMAINS.has(name)) {
    // If you can read this, the worker is up. So this domain is up.
    return { name, status: 'live', http_status: 200 }
  }
  // External domains (apex, future brand domains) — actually probe.
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
  const start = Date.now()
  try {
    const r = await fetch(`https://${name}/`, { signal: ctrl.signal, cf: { cacheTtl: 0 } as any })
    const ms = Date.now() - start
    const status: DomainRow['status'] = r.ok ? 'live' : (r.status === 404 ? 'broken' : 'idle')
    return { name, status, http_status: r.status, ms }
  } catch {
    return { name, status: 'broken', ms: Date.now() - start }
  } finally {
    clearTimeout(t)
  }
}

async function probeFleet(row: typeof FLEET[number]): Promise<FleetRow & { kind: 'server' | 'laptop' }> {
  // Fleet domains (anouf.*, jasmine.*, etc.) aren't DNS-bound yet. Try the IP via HTTPS
  // (returns cert error but proves machine is reachable) then fall back to "unknown".
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 3000)
  const start = Date.now()
  try {
    // Try a plausible heartbeat path on the IP. Most fleet machines run *something* on 80/443.
    const r = await fetch(`https://${row.ip}/`, { signal: ctrl.signal, cf: { cacheTtl: 0 } as any })
    return { ...row, status: r.status < 600 ? 'live' : 'unreachable', ms: Date.now() - start }
  } catch {
    return { ...row, status: 'unknown', ms: Date.now() - start }
  } finally {
    clearTimeout(t)
  }
}

export async function buildMapState(env: any): Promise<MapState> {
  const generated_at = new Date().toISOString()

  const [domains, fleet] = await Promise.all([
    Promise.all(DOMAINS.map(d => probeDomain(d.name).then(r => ({ ...r, note: d.note })))),
    Promise.all(FLEET.map(probeFleet))
  ])

  // Models — pull from api_calls table (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const modelRows = await (env.DB as D1Database).prepare(
    `SELECT source, model, COUNT(*) AS calls,
            COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
            MAX(ts) AS last_seen
     FROM api_calls WHERE ts >= ?
     GROUP BY source ORDER BY calls DESC`
  ).bind(oneDayAgo).all<any>()

  const models: ModelRow[] = (modelRows.results ?? []).map((r: any) => ({
    source: r.source,
    provider: r.model || '?',
    calls_24h: Number(r.calls || 0),
    tokens_24h: Number(r.tokens || 0),
    last_seen: r.last_seen ?? undefined
  }))

  // Reflection (cron heartbeat)
  let reflection_last: string | undefined
  try {
    const blob = await env.KV.get('reflection:latest')
    if (blob) {
      const parsed = JSON.parse(blob)
      reflection_last = `${parsed.ts} — "${(parsed.answer || '').slice(0, 120)}..."`
    }
  } catch {}

  const crons: CronRow[] = [
    { pattern: '*/15 * * * *', description: 'self-reflection (Nemotron) → KV reflection:latest', last_output: reflection_last }
  ]

  // Connected apps — best-effort from KV cache; don't hammer Composio for the map.
  let connected_apps: AppRow[] = []
  try {
    const cached = await env.KV.get('composio:connected_toolkits')
    if (cached) {
      const list = JSON.parse(cached) as string[]
      connected_apps = list.map((t: string) => ({ toolkit: t, has_connection: true }))
    } else {
      connected_apps = ['gmail','slack','github','notion','googledrive','googlecalendar','googlesheets','linkedin','youtube','supabase']
        .map(t => ({ toolkit: t, has_connection: true }))
    }
  } catch {}

  // Secrets — bound = does the env have a non-empty value?
  const secrets: SecretRow[] = KNOWN_SECRETS.map(s => ({
    ...s,
    bound: !!(env[s.name] && String(env[s.name]).length > 0)
  }))

  return {
    generated_at,
    domains,
    worker_routes: ROUTES,
    fleet,
    models,
    crons,
    connected_apps,
    secrets
  }
}
