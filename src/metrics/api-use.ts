// Pillar metric — API utilization telemetry.
// Religion: API use UP = system alive. This module is how we measure it.
//
// Every Anthropic / Mistral call should call recordUsage() with the response usage block.
// The /metrics/api-use endpoint aggregates and exposes the numbers.

interface UsageRecord {
  source: string  // free-form tag (nao44, minouch, tool_router_*, orchestrator_*, etc.) — by_source aggregation handles arbitrary values
  model: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  cache_create_tokens?: number
  duration_ms?: number
}

let _ensured = false
async function ensureTable(db: D1Database) {
  if (_ensured) return
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS api_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      source TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_create_tokens INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0
    )`
  ).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS api_calls_ts ON api_calls(ts)`).run()
  _ensured = true
}

export async function recordUsage(db: D1Database, r: UsageRecord) {
  try {
    await ensureTable(db)
    await db.prepare(
      `INSERT INTO api_calls (ts, source, model, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(),
      r.source,
      r.model,
      r.input_tokens || 0,
      r.output_tokens || 0,
      r.cache_read_tokens || 0,
      r.cache_create_tokens || 0,
      r.duration_ms || 0
    ).run()
  } catch (e) {
    // Telemetry must never break the request path.
  }
}

// Pull usage from the Anthropic response shape.
export function anthropicUsage(data: any): { input: number; output: number; cache_read: number; cache_create: number } {
  const u = data?.usage ?? {}
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_create: u.cache_creation_input_tokens ?? 0
  }
}

export function mistralUsage(data: any): { input: number; output: number } {
  const u = data?.usage ?? {}
  return { input: u.prompt_tokens ?? 0, output: u.completion_tokens ?? 0 }
}

export interface ApiUseSnapshot {
  total_calls: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_read_tokens: number
  total_cache_create_tokens: number
  by_source: Record<string, { calls: number; input: number; output: number }>
  last_hour: { calls: number; tokens: number }
  last_24h: { calls: number; tokens: number; cache_read: number; cache_hit_ratio: number }
  last_7d: {
    calls: number
    tokens: number
    cache_hit_ratio: number
    by_source: Record<string, { calls: number; input: number; output: number }>
    by_day: { day: string; calls: number; input: number; output: number; cache_read: number }[]
  }
  cache_hit_ratio: number
  health: 'green' | 'yellow' | 'red'
  health_note: string
  skills: {
    total_rows: number
    hit_rows: number          // used_count > 0
    saved_calls: number       // SUM(used_count) — every cache hit was a council call we didn't make
    top_5: { pattern: string; used_count: number; confidence: number }[]
    newest_5: { pattern: string; created_at: string }[]
  }
  coverage: {
    runs: number               // number of /improve/coverage runs
    topics_seen: number        // distinct topics we've covered
    total_seeded: number       // skills added by coverage runs (count_cached_new sum)
    total_executed: number     // council calls fired by coverage runs
    last_topic: string | null
    last_ts: string | null
  }
}

export async function buildSnapshot(db: D1Database, kv?: KVNamespace): Promise<ApiUseSnapshot> {
  await ensureTable(db)
  const totals = await db.prepare(
    `SELECT COUNT(*) AS calls,
            COALESCE(SUM(input_tokens), 0) AS input,
            COALESCE(SUM(output_tokens), 0) AS output,
            COALESCE(SUM(cache_read_tokens), 0) AS cache_read,
            COALESCE(SUM(cache_create_tokens), 0) AS cache_create
     FROM api_calls`
  ).first() as any

  const bySource = await db.prepare(
    `SELECT source,
            COUNT(*) AS calls,
            COALESCE(SUM(input_tokens), 0) AS input,
            COALESCE(SUM(output_tokens), 0) AS output
     FROM api_calls GROUP BY source`
  ).all<any>()

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const lastHour = await db.prepare(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens FROM api_calls WHERE ts >= ?`
  ).bind(oneHourAgo).first() as any

  const last24h = await db.prepare(
    `SELECT COUNT(*) AS calls,
            COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
            COALESCE(SUM(input_tokens), 0) AS input,
            COALESCE(SUM(cache_read_tokens), 0) AS cache_read
     FROM api_calls WHERE ts >= ?`
  ).bind(oneDayAgo).first() as any

  // last_7d aggregates — totals + by_source + by_day. The weekly digest reads
  // these instead of stubbing today × 7.
  const last7Totals = await db.prepare(
    `SELECT COUNT(*) AS calls,
            COALESCE(SUM(input_tokens), 0) AS input,
            COALESCE(SUM(output_tokens), 0) AS output,
            COALESCE(SUM(cache_read_tokens), 0) AS cache_read
     FROM api_calls WHERE ts >= ?`
  ).bind(sevenDaysAgo).first() as any

  const last7BySource = await db.prepare(
    `SELECT source,
            COUNT(*) AS calls,
            COALESCE(SUM(input_tokens), 0) AS input,
            COALESCE(SUM(output_tokens), 0) AS output
     FROM api_calls WHERE ts >= ?
     GROUP BY source`
  ).bind(sevenDaysAgo).all<any>()

  const last7ByDay = await db.prepare(
    `SELECT substr(ts, 1, 10) AS day,
            COUNT(*) AS calls,
            COALESCE(SUM(input_tokens), 0) AS input,
            COALESCE(SUM(output_tokens), 0) AS output,
            COALESCE(SUM(cache_read_tokens), 0) AS cache_read
     FROM api_calls WHERE ts >= ?
     GROUP BY day ORDER BY day ASC`
  ).bind(sevenDaysAgo).all<any>()

  const totalInput = Number(totals.input || 0)
  const cacheRead = Number(totals.cache_read || 0)
  const cacheRatio = totalInput > 0 ? cacheRead / (totalInput + cacheRead) : 0

  // Health heuristic — based on the religion (API use UP = alive).
  const callsLastHour = Number(lastHour.calls || 0)
  let health: 'green' | 'yellow' | 'red' = 'red'
  let note = 'system idle — no API calls in the last hour'
  if (callsLastHour >= 10) { health = 'green'; note = 'busy and alive' }
  else if (callsLastHour >= 1) { health = 'yellow'; note = 'lightly active' }

  const by_source: Record<string, { calls: number; input: number; output: number }> = {}
  for (const row of (bySource.results ?? [])) {
    by_source[row.source] = {
      calls: Number(row.calls || 0),
      input: Number(row.input || 0),
      output: Number(row.output || 0)
    }
  }

  const last7BySourceMap: Record<string, { calls: number; input: number; output: number }> = {}
  for (const row of (last7BySource.results ?? [])) {
    last7BySourceMap[row.source] = {
      calls: Number(row.calls || 0),
      input: Number(row.input || 0),
      output: Number(row.output || 0)
    }
  }

  const last7Input = Number(last7Totals.input || 0)
  const last7CacheRead = Number(last7Totals.cache_read || 0)
  const last7CacheRatio = last7Input + last7CacheRead > 0
    ? last7CacheRead / (last7Input + last7CacheRead) : 0

  const last7Days: { day: string; calls: number; input: number; output: number; cache_read: number }[] =
    (last7ByDay.results ?? []).map((row: any) => ({
      day: String(row.day || ''),
      calls: Number(row.calls || 0),
      input: Number(row.input || 0),
      output: Number(row.output || 0),
      cache_read: Number(row.cache_read || 0)
    }))

  // Skill cache summary — what has the system actually learned?
  // skills table is created by extractor.ts on first write, so guard the query.
  let skillsSummary = {
    total_rows: 0,
    hit_rows: 0,
    saved_calls: 0,
    top_5: [] as { pattern: string; used_count: number; confidence: number }[],
    newest_5: [] as { pattern: string; created_at: string }[]
  }
  try {
    const skillTotals = await db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN used_count > 0 THEN 1 ELSE 0 END) AS hit_rows,
              COALESCE(SUM(used_count), 0) AS saved_calls
       FROM skills`
    ).first<{ total: number; hit_rows: number; saved_calls: number }>()
    const top = await db.prepare(
      `SELECT pattern, used_count, confidence FROM skills
       WHERE used_count > 0 ORDER BY used_count DESC LIMIT 5`
    ).all<{ pattern: string; used_count: number; confidence: number }>()
    const newest = await db.prepare(
      `SELECT pattern, created_at FROM skills ORDER BY id DESC LIMIT 5`
    ).all<{ pattern: string; created_at: string }>()
    skillsSummary = {
      total_rows: Number(skillTotals?.total || 0),
      hit_rows: Number(skillTotals?.hit_rows || 0),
      saved_calls: Number(skillTotals?.saved_calls || 0),
      top_5: (top.results ?? []).map(r => ({
        pattern: String(r.pattern || ''),
        used_count: Number(r.used_count || 0),
        confidence: Number(r.confidence || 0)
      })),
      newest_5: (newest.results ?? []).map(r => ({
        pattern: String(r.pattern || ''),
        created_at: String(r.created_at || '')
      }))
    }
  } catch {
    // skills table not created yet — leave defaults.
  }

  // Coverage counters — best-effort, KV-backed. Optional; older callers that
  // don't pass kv just see the default zeros.
  let coverageSummary = {
    runs: 0,
    topics_seen: 0,
    total_seeded: 0,
    total_executed: 0,
    last_topic: null as string | null,
    last_ts: null as string | null
  }
  if (kv) {
    try {
      const raw = await kv.get('coverage:counters')
      if (raw) {
        const c = JSON.parse(raw)
        coverageSummary = {
          runs: Number(c.runs || 0),
          topics_seen: Array.isArray(c.topics) ? c.topics.length : 0,
          total_seeded: Number(c.total_seeded || 0),
          total_executed: Number(c.total_executed || 0),
          last_topic: c.last_topic ?? null,
          last_ts: c.last_ts ?? null
        }
      }
    } catch {
      // KV miss / parse error — leave defaults.
    }
  }

  return {
    total_calls: Number(totals.calls || 0),
    total_input_tokens: totalInput,
    total_output_tokens: Number(totals.output || 0),
    total_cache_read_tokens: cacheRead,
    total_cache_create_tokens: Number(totals.cache_create || 0),
    by_source,
    last_hour: { calls: callsLastHour, tokens: Number(lastHour.tokens || 0) },
    last_24h: (() => {
      const inp = Number(last24h.input || 0)
      const cr = Number(last24h.cache_read || 0)
      const ratio = inp + cr > 0 ? cr / (inp + cr) : 0
      return {
        calls: Number(last24h.calls || 0),
        tokens: Number(last24h.tokens || 0),
        cache_read: cr,
        cache_hit_ratio: Math.round(ratio * 1000) / 1000
      }
    })(),
    last_7d: {
      calls: Number(last7Totals.calls || 0),
      tokens: last7Input + Number(last7Totals.output || 0),
      cache_hit_ratio: Math.round(last7CacheRatio * 1000) / 1000,
      by_source: last7BySourceMap,
      by_day: last7Days
    },
    cache_hit_ratio: Math.round(cacheRatio * 1000) / 1000,
    health,
    health_note: note,
    skills: skillsSummary,
    coverage: coverageSummary
  }
}
