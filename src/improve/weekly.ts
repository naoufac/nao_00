// Weekly digest — runs Sunday 17:00 UTC (= Monday 00:00 Bangkok).
// Aggregates the past 7 days of recaps + briefings + metrics into one paragraph
// + a per-day breakdown. Output is its own KV blob and its own Slack message
// (NOT threaded with the daily recaps — it should anchor the week visually).
//
// Pillar metric: 1 Haiku call per week (cheap) + a few D1 reads.

import { recordUsage, anthropicUsage, buildSnapshot } from '../metrics/api-use'

interface DayPoint {
  date: string        // YYYY-MM-DD (UTC)
  calls: number       // council convos that day
  recap?: string      // one-line recap if we have one
}

interface WeeklyDigest {
  ts: string
  week_id: string     // ISO week, e.g. "2026-W19"
  range: { from: string; to: string }
  totals: {
    calls: number
    tokens: number
    cache_hit: number   // 0..1
  }
  days: DayPoint[]
  weekly: { ok: boolean; paragraph: string }
  duration_ms: number
}

function isoWeekId(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

async function loadDays(env: any): Promise<{ days: DayPoint[]; from: string; to: string }> {
  const now = new Date()
  const to = now.toISOString()
  const fromDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000)
  const from = fromDate.toISOString()

  // Per-day call counts from D1.
  const rows = await env.DB
    .prepare(`SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n
              FROM conversations
              WHERE created_at >= ?
              GROUP BY d
              ORDER BY d ASC`)
    .bind(from)
    .all<{ d: string; n: number }>()
  const calls: Record<string, number> = {}
  for (const r of rows?.results || []) calls[r.d] = r.n

  // Per-day recap from KV history list.
  const recaps: Record<string, string> = {}
  try {
    const list = await env.KV.list({ prefix: 'recap:history:', limit: 30 })
    for (const k of list.keys || []) {
      // key format: recap:history:<iso ts>
      const ts = k.name.slice('recap:history:'.length)
      const day = ts.slice(0, 10)
      if (recaps[day]) continue            // first one per day is enough
      const blob = await env.KV.get(k.name)
      if (!blob) continue
      try {
        const r = JSON.parse(blob)
        const para = String(r?.recap?.paragraph || '').slice(0, 200)
        if (para) recaps[day] = para
      } catch {}
    }
  } catch {}

  // Build day list spanning the 7-day window so missing days still show as 0.
  const days: DayPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 24 * 3600 * 1000)
    const date = dt.toISOString().slice(0, 10)
    days.push({ date, calls: calls[date] || 0, recap: recaps[date] })
  }

  return { days, from, to }
}

async function totals(env: any, days: DayPoint[]): Promise<WeeklyDigest['totals']> {
  // Conversation count from D1 conversations table (load step).
  let calls = 0
  for (const d of days) calls += d.calls

  // Token / cache numbers from the api-use last_7d rollup. When that's unavailable
  // we fall back to 0 rather than guessing — the weekly note shouldn't lie.
  let tokens = 0
  let cache_hit = 0
  try {
    const snap: any = await buildSnapshot(env.DB)
    const last7d = snap?.last_7d
    if (last7d) {
      tokens = Number(last7d.tokens || 0)
      cache_hit = Number(last7d.cache_hit_ratio || 0)
    }
  } catch {}

  return { calls, tokens, cache_hit }
}

async function digestParagraph(env: any, db: any, week_id: string, days: DayPoint[], t: WeeklyDigest['totals']): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return '(no anthropic key — weekly digest skipped)'
  const start = Date.now()
  const dayLines = days.map((d) => `  ${d.date}: ${d.calls} calls${d.recap ? ' — ' + d.recap.slice(0, 120) : ''}`).join('\n')
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 480,
        system: 'You are nao_00 reflecting on Naoufal\'s week. Write ONE warm paragraph (4–6 sentences, max 110 words) that names the through-line of the week, what shifted, and what to carry into next week. End with one fitting emoji. No headers, no bullets.',
        messages: [{
          role: 'user',
          content: `Week: ${week_id}\nTotal council calls: ${t.calls}\nTotal tokens: ${t.tokens}\nCache hit ratio: ${(t.cache_hit * 100).toFixed(1)}%\n\nPer-day breakdown:\n${dayLines}\n\nWrite the weekly digest paragraph.`
        }]
      })
    })
    const data: any = await res.json()
    if (db) {
      const u = anthropicUsage(data)
      await recordUsage(db, {
        source: 'recap', model: 'claude-haiku-4-5-20251001',
        input_tokens: u.input, output_tokens: u.output,
        cache_read_tokens: u.cache_read, cache_create_tokens: u.cache_create,
        duration_ms: Date.now() - start
      })
    }
    return data.content?.[0]?.text?.trim() || '(weekly model returned empty)'
  } catch (err: any) {
    return `(weekly error: ${String(err?.message ?? err).slice(0, 80)})`
  }
}

export async function runWeeklyDigest(env: any, ctx: any): Promise<WeeklyDigest> {
  const start = Date.now()
  const ts = new Date().toISOString()
  const week_id = isoWeekId(new Date())

  const { days, from, to } = await loadDays(env)
  const t = await totals(env, days)
  const paragraph = await digestParagraph(env, env.DB, week_id, days, t)

  const result: WeeklyDigest = {
    ts,
    week_id,
    range: { from, to },
    totals: t,
    days,
    weekly: { ok: paragraph.length > 0, paragraph },
    duration_ms: Date.now() - start
  }

  const blob = JSON.stringify(result)
  ctx.waitUntil(Promise.all([
    env.KV.put('weekly:latest', blob),
    env.KV.put(`weekly:history:${week_id}`, blob, { expirationTtl: 60 * 60 * 24 * 365 })
  ]))

  return result
}
