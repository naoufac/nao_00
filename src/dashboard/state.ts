import { VERSION } from '../util/identity'

// Aggregate state for the dashboard's right rail and history.
// Connected-apps list is precomputed in KV ('dashboard:connected_apps')
// — set/refreshed by /dashboard/state/refresh, which calls Composio.

export interface DashboardState {
  health: { status: string; version: string }
  conversation_count: number
  skills_count: number
  last_eval_at: string | null
  user_context: string | null
  connected_apps: { toolkit: string; label: string }[]
  history: { id: string; input: string; final_output: string; created_at: string }[]
  kpis: {
    council_calls_today: number
    council_calls_7d: number
    cache_hit_rate_7d: number   // 0..1 — fraction of recent council calls served from skill cache
    avg_duration_ms_7d: number  // mean response time over recent council calls
    cache_savings_ms_7d: number // ms saved by cache hits over the same window
  }
  // Top patterns the council has actually learned. Mirrors metrics/api-use.skills.
  // Surfaces the system's growth — what facts the cache is actively serving.
  skills_top: { pattern: string; used_count: number }[]
  skills_saved_calls: number
  coverage: {
    runs: number
    topics_seen: number
    total_seeded: number
    last_topic: string | null
    last_ts: string | null
  }
  fleet: { name: string; domain: string; ip: string; role: string }[]
}

export async function buildDashboardState(env: any, kv: KVNamespace, db: D1Database): Promise<DashboardState> {
  const todayStartIso = (() => {
    const d = new Date()
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
  })()
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400_000).toISOString()

  const [convRow, skillRow, skillTopRows, skillSaved, todayRow, weekConvRow, cacheStepsRow, weekStepsRow, lastInsightsStr, userCtx, appsStr, hist, coverageRaw] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM conversations').first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM skills').first<{ n: number }>(),
    db.prepare('SELECT pattern, used_count FROM skills WHERE used_count > 0 ORDER BY used_count DESC LIMIT 5').all<{ pattern: string; used_count: number }>().catch(() => ({ results: [] as any[] })),
    db.prepare('SELECT COALESCE(SUM(used_count),0) AS n FROM skills').first<{ n: number }>().catch(() => ({ n: 0 })),
    db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE created_at >= ?').bind(todayStartIso).first<{ n: number }>(),
    db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE created_at >= ?').bind(sevenDaysAgoIso).first<{ n: number }>(),
    db.prepare(`
      SELECT COUNT(*) AS hits, COALESCE(SUM(duration_ms),0) AS hit_ms
      FROM council_steps cs
      JOIN conversations c ON c.id = cs.conversation_id
      WHERE c.created_at >= ? AND cs.advisor_name = 'cache'
    `).bind(sevenDaysAgoIso).first<{ hits: number; hit_ms: number }>(),
    db.prepare(`
      SELECT
        COUNT(DISTINCT cs.conversation_id) AS n,
        COALESCE(SUM(cs.duration_ms),0) AS total_ms
      FROM council_steps cs
      JOIN conversations c ON c.id = cs.conversation_id
      WHERE c.created_at >= ?
    `).bind(sevenDaysAgoIso).first<{ n: number; total_ms: number }>(),
    kv.get('eval:last_insights'),
    kv.get('user:context'),
    kv.get('dashboard:connected_apps'),
    db.prepare('SELECT id, input, final_output, created_at FROM conversations ORDER BY created_at DESC LIMIT 25').all(),
    kv.get('coverage:counters')
  ])

  let coverage = {
    runs: 0,
    topics_seen: 0,
    total_seeded: 0,
    last_topic: null as string | null,
    last_ts: null as string | null
  }
  if (coverageRaw) {
    try {
      const c = JSON.parse(coverageRaw)
      coverage = {
        runs: Number(c.runs || 0),
        topics_seen: Array.isArray(c.topics) ? c.topics.length : 0,
        total_seeded: Number(c.total_seeded || 0),
        last_topic: c.last_topic ?? null,
        last_ts: c.last_ts ?? null
      }
    } catch {}
  }

  let last_eval_at: string | null = null
  if (lastInsightsStr) {
    try { last_eval_at = JSON.parse(lastInsightsStr).at || null } catch {}
  }

  let connected_apps: { toolkit: string; label: string }[] = []
  if (appsStr) {
    try { connected_apps = JSON.parse(appsStr) } catch {}
  }

  // Cache savings: each cache hit averted the mean non-cache latency. We approximate by:
  //   savings = hits * (mean_full_council_ms - mean_cache_ms)
  // Mean full-council ms over the window comes from conversation rows themselves (we don't store it,
  // so we use the recent council_steps total / non-cache convs as a stand-in).
  const weekConv = weekConvRow?.n ?? 0
  const hits = cacheStepsRow?.hits ?? 0
  const fullConvs = Math.max(weekConv - hits, 0)
  const totalMs = weekStepsRow?.total_ms ?? 0
  const hitMs = cacheStepsRow?.hit_ms ?? 0
  const fullMs = Math.max(totalMs - hitMs, 0)
  const meanFull = fullConvs > 0 ? fullMs / fullConvs : 0
  const meanCache = hits > 0 ? hitMs / hits : 0
  const cacheSavings = Math.round(hits * Math.max(meanFull - meanCache, 0))
  const avgDuration = weekConv > 0 ? Math.round(totalMs / weekConv) : 0
  const cacheHitRate = weekConv > 0 ? hits / weekConv : 0

  return {
    health: { status: 'alive', version: VERSION },
    conversation_count: convRow?.n ?? 0,
    skills_count: skillRow?.n ?? 0,
    skills_top: ((skillTopRows as any).results ?? []).map((r: any) => ({
      pattern: String(r.pattern || ''),
      used_count: Number(r.used_count || 0)
    })),
    skills_saved_calls: Number((skillSaved as any)?.n ?? 0),
    coverage,
    last_eval_at,
    user_context: userCtx,
    connected_apps,
    history: (hist.results as any[]) || [],
    kpis: {
      council_calls_today: todayRow?.n ?? 0,
      council_calls_7d: weekConv,
      cache_hit_rate_7d: Math.round(cacheHitRate * 1000) / 1000,
      avg_duration_ms_7d: avgDuration,
      cache_savings_ms_7d: cacheSavings
    },
    fleet: [
      { name: 'Anouf',     domain: 'anouf.nchobah.com',     ip: '135.181.44.161', role: 'engine — builds nao_00, runs the worker upstream' },
      { name: 'Nemoclaw',  domain: 'nemo.nchobah.com',      ip: '162.243.119.47', role: 'nervous system — monitoring, shared dashboard :4444' },
      { name: 'Jasmine',   domain: 'jasmine.nchobah.com',   ip: '192.241.251.184', role: 'builder — production deploys' },
      { name: 'Mayor',     domain: 'mayor.nchobah.com',     ip: '142.93.155.96',   role: 'Toronto — Mayor 24/7 Claude' },
      { name: 'FastComet', domain: 'cpanel.nchobah.com',    ip: '69.72.248.210',   role: 'cPanel host — domain + email' }
    ]
  }
}

// Refresh the connected-apps cache via Composio MCP (which returns user-facing connections,
// unlike the v3 REST list which is scoped narrower). Called manually via POST /dashboard/state/refresh.
const TOOLKITS_TO_PROBE = [
  'gmail', 'googlecalendar', 'googledrive', 'googlesheets',
  'slack', 'github', 'notion', 'youtube', 'linkedin',
  'supabase', 'twitter', 'discord', 'trello', 'reddit'
]

function parseSse(raw: string): any | null {
  // streamable-http returns "event: message\ndata: {json}\n\n"
  const m = raw.match(/data:\s*(\{[\s\S]*\})\s*$/m)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

export async function refreshConnectedApps(env: any, kv: KVNamespace): Promise<{ count: number; apps: { toolkit: string; label: string }[] }> {
  const consumerKey = env.COMPOSIO_API_KEY
  if (!consumerKey) throw new Error('COMPOSIO_API_KEY not bound')

  const mcpRes = await fetch('https://connect.composio.dev/mcp', {
    method: 'POST',
    headers: {
      'x-consumer-api-key': consumerKey,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'COMPOSIO_MANAGE_CONNECTIONS',
        arguments: { toolkits: TOOLKITS_TO_PROBE.map((name) => ({ name, action: 'list' })) }
      }
    })
  })
  if (!mcpRes.ok) throw new Error(`composio_mcp_${mcpRes.status}`)
  const text = await mcpRes.text()
  const parsed = parseSse(text)
  if (!parsed?.result?.content?.[0]?.text) throw new Error('mcp_unexpected_shape')
  const inner = JSON.parse(parsed.result.content[0].text)
  const results = inner?.data?.results || {}

  const apps: { toolkit: string; label: string }[] = []
  for (const [toolkit, info] of Object.entries(results) as [string, any][]) {
    if (info.status !== 'active') continue
    const labels = (info.accounts || [])
      .filter((a: any) => a.status === 'active')
      .map((a: any) => {
        const u = a.user_info || {}
        return u.emailAddress || u.email || u.user || u.login || u.team || a.alias || 'connected'
      })
    if (labels.length) apps.push({ toolkit, label: labels.join(', ') })
  }
  apps.sort((a, b) => a.toolkit.localeCompare(b.toolkit))

  await kv.put('dashboard:connected_apps', JSON.stringify(apps), { expirationTtl: 60 * 60 * 24 })
  return { count: apps.length, apps }
}
