// engagement_digest — rolls up the last 24h of activity across nao_00 surfaces
// (D1 streams_runs, council_steps, KV proactive history, gmail unread, slack mentions)
// into one human-readable digest. Stored in KV `engagement:latest:json` and a
// short text preview in `engagement:latest`. Council/dashboard can surface it.

import { ComposioMCP } from '../tools/composio'
import { recordUsage } from '../metrics/api-use'

export interface EngagementEnv {
  KV: KVNamespace
  COMPOSIO_API_KEY: string
}

interface DigestSection {
  label: string
  ok: boolean
  body: string
  meta?: Record<string, unknown>
}

interface Digest {
  ts: string
  window_h: number
  sections: DigestSection[]
  summary: string
}

async function ensureTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS streams_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT, name TEXT, ok INTEGER, count INTEGER, duration_ms INTEGER, error TEXT
    )`
  ).run()
}

async function streamsSection(db: D1Database, sinceIso: string): Promise<DigestSection> {
  try {
    const rows = await db
      .prepare(
        `SELECT name, COUNT(*) AS n,
                SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS ok_n,
                AVG(duration_ms) AS avg_ms
         FROM streams_runs WHERE ts >= ? GROUP BY name ORDER BY n DESC`
      )
      .bind(sinceIso)
      .all<{ name: string; n: number; ok_n: number; avg_ms: number }>()
    const r = rows.results || []
    if (!r.length) return { label: 'streams', ok: true, body: 'no stream runs in window' }
    const lines = r.map(
      (x) =>
        `  · ${x.name}: ${x.ok_n}/${x.n} ok, avg ${Math.round(x.avg_ms || 0)}ms`
    )
    const total = r.reduce((s, x) => s + x.n, 0)
    const okTotal = r.reduce((s, x) => s + x.ok_n, 0)
    return {
      label: 'streams',
      ok: true,
      body: `${total} runs (${okTotal} ok)\n${lines.join('\n')}`,
      meta: { total, ok: okTotal, breakdown: r }
    }
  } catch (e: any) {
    return { label: 'streams', ok: false, body: `error: ${e?.message || e}` }
  }
}

async function councilSection(db: D1Database, sinceIso: string): Promise<DigestSection> {
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM council_steps WHERE ts >= ?`
      )
      .bind(sinceIso)
      .first<{ n: number }>()
    const n = row?.n ?? 0
    return { label: 'council', ok: true, body: `${n} council steps in window`, meta: { n } }
  } catch {
    return { label: 'council', ok: true, body: 'council_steps table not available' }
  }
}

async function proactiveSection(env: EngagementEnv): Promise<DigestSection> {
  try {
    const raw = await env.KV.get('proactive:history:json')
    if (!raw) return { label: 'proactive', ok: true, body: 'no proactive history yet' }
    const arr = JSON.parse(raw) as Array<{ ts: string; preview: string }>
    const last = arr[0]
    return {
      label: 'proactive',
      ok: true,
      body: `${arr.length} insights stored, latest: "${(last?.preview || '').slice(0, 100)}"`,
      meta: { count: arr.length, latest_ts: last?.ts }
    }
  } catch (e: any) {
    return { label: 'proactive', ok: false, body: `error: ${e?.message || e}` }
  }
}

async function apiUseSection(db: D1Database, sinceIso: string): Promise<DigestSection> {
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS calls,
                COALESCE(SUM(input_tokens), 0)  AS in_t,
                COALESCE(SUM(output_tokens), 0) AS out_t
         FROM api_use WHERE ts >= ?`
      )
      .bind(sinceIso)
      .first<{ calls: number; in_t: number; out_t: number }>()
    if (!row || !row.calls) return { label: 'api_use', ok: true, body: 'no api calls logged in window' }
    return {
      label: 'api_use',
      ok: true,
      body: `${row.calls} calls — ${row.in_t} in / ${row.out_t} out tokens`,
      meta: row
    }
  } catch {
    return { label: 'api_use', ok: true, body: 'api_use table not available' }
  }
}

async function gmailSection(env: EngagementEnv): Promise<DigestSection> {
  try {
    const mcp = new ComposioMCP(env.COMPOSIO_API_KEY)
    const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
      tools: [
        {
          tool_slug: 'GMAIL_FETCH_EMAILS',
          arguments: { query: 'is:unread newer_than:1d', max_results: 10 }
        }
      ]
    })
    const text = result?.content?.[0]?.text ?? ''
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch {
      /* leave null */
    }
    const inner = parsed?.results?.[0] ?? parsed?.[0] ?? parsed
    const data = inner?.data ?? inner?.result ?? inner
    const messages = data?.messages || data?.response_data?.messages || []
    const count = Array.isArray(messages) ? messages.length : 0
    const previews = (Array.isArray(messages) ? messages.slice(0, 3) : [])
      .map((m: any) => `  · ${(m.subject || m.snippet || '(no subject)').toString().slice(0, 80)}`)
      .join('\n')
    return {
      label: 'gmail',
      ok: true,
      body: `${count} unread in last 24h${previews ? '\n' + previews : ''}`,
      meta: { count }
    }
  } catch (e: any) {
    return { label: 'gmail', ok: false, body: `mcp error: ${e?.message || e}` }
  }
}

async function slackSection(env: EngagementEnv): Promise<DigestSection> {
  try {
    const mcp = new ComposioMCP(env.COMPOSIO_API_KEY)
    const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
      tools: [
        {
          tool_slug: 'SLACK_SEARCH_MESSAGES',
          arguments: { query: '@naoufal', count: 5, sort: 'timestamp' }
        }
      ]
    })
    const text = result?.content?.[0]?.text ?? ''
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch {
      /* leave null */
    }
    const inner = parsed?.results?.[0] ?? parsed?.[0] ?? parsed
    const data = inner?.data ?? inner?.result ?? inner
    const matches = data?.messages?.matches || data?.matches || []
    const count = Array.isArray(matches) ? matches.length : 0
    return {
      label: 'slack',
      ok: true,
      body: count ? `${count} mentions in last 24h` : 'no recent mentions',
      meta: { count }
    }
  } catch (e: any) {
    return { label: 'slack', ok: false, body: `mcp error: ${e?.message || e}` }
  }
}

function summarize(sections: DigestSection[]): string {
  const parts: string[] = []
  for (const s of sections) {
    const head = s.body.split('\n')[0]
    parts.push(`${s.label}: ${head}`)
  }
  return parts.join(' · ')
}

export async function runEngagementDigest(env: EngagementEnv, db: D1Database) {
  const started = Date.now()
  await ensureTable(db)

  const window_h = 24
  const since = new Date(Date.now() - window_h * 60 * 60 * 1000).toISOString()

  try {
    const sections = await Promise.all([
      streamsSection(db, since),
      councilSection(db, since),
      apiUseSection(db, since),
      proactiveSection(env),
      gmailSection(env),
      slackSection(env)
    ])

    const ts = new Date().toISOString()
    const digest: Digest = {
      ts,
      window_h,
      sections,
      summary: summarize(sections)
    }

    const blob = JSON.stringify(digest)
    await Promise.all([
      env.KV.put('engagement:latest:json', blob, { expirationTtl: 60 * 60 * 24 * 30 }),
      env.KV.put('engagement:latest', digest.summary, { expirationTtl: 60 * 60 * 24 * 30 }),
      env.KV.put(`engagement:history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 90 })
    ])

    const duration_ms = Date.now() - started

    // Pillar-metric record (free aggregation, but log the fact it ran).
    try {
      await recordUsage(db, {
        source: 'engagement_digest',
        model: 'engagement_digest',
        input_tokens: 0,
        output_tokens: 0,
        duration_ms
      })
    } catch {
      /* never block on telemetry */
    }

    await db
      .prepare(
        'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(ts, 'engagement_digest', 1, sections.length, duration_ms, null)
      .run()

    return { ok: true as const, sections: sections.length, summary: digest.summary, duration_ms }
  } catch (e: any) {
    const duration_ms = Date.now() - started
    const error = e?.message || String(e)
    try {
      await db
        .prepare(
          'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(new Date().toISOString(), 'engagement_digest', 0, 0, duration_ms, error)
        .run()
    } catch {
      /* swallow */
    }
    return { ok: false as const, error, duration_ms }
  }
}
