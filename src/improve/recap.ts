// Evening recap — runs daily at 16:00 UTC (= 23:00 Bangkok).
// Symmetrical with the morning briefing: closes the loop with a one-paragraph
// summary of what nao_00 actually did today.
//
// Pulls today's:
//   - council conversations (count, top topics)
//   - api-use metrics (calls, tokens, cache hit)
//   - latest reflection answer
// Then asks Haiku to write a short, warm "today, in one paragraph" wrap-up.
//
// Stored in KV at `recap:latest` and `recap:history:<iso>` (90d TTL).
// Drives ~1 high-value Haiku call per day plus a few D1 reads (free).

import { recordUsage, anthropicUsage, buildSnapshot } from '../metrics/api-use'

interface RecapResult {
  ts: string
  date: string
  stats: {
    council_calls_today: number
    total_tokens_today: number
    cache_hit_today: number
    top_topics: string[]
    last_reflection: string
  }
  recap: { ok: boolean; paragraph: string }
  duration_ms: number
}

async function loadDayStats(env: any): Promise<RecapResult['stats']> {
  const out: RecapResult['stats'] = {
    council_calls_today: 0,
    total_tokens_today: 0,
    cache_hit_today: 0,
    top_topics: [],
    last_reflection: ''
  }
  try {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const iso = todayStart.toISOString()

    const convCount = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM conversations WHERE created_at >= ?')
      .bind(iso)
      .first<{ n: number }>()
    out.council_calls_today = convCount?.n ?? 0

    const recent = await env.DB
      .prepare('SELECT input FROM conversations WHERE created_at >= ? ORDER BY created_at DESC LIMIT 12')
      .bind(iso)
      .all<{ input: string }>()
    out.top_topics = (recent?.results || [])
      .map((r) => String(r.input || '').slice(0, 80))
      .filter(Boolean)

    try {
      const snap: any = await buildSnapshot(env.DB)
      // last_24h is the rolling-window proxy for "today" — recap fires at 11pm
      // Bangkok so this captures essentially the whole local day.
      out.total_tokens_today = Number(snap?.last_24h?.tokens || 0)
      out.cache_hit_today = Number(snap?.cache_hit_ratio ?? 0)
    } catch {}

    try {
      const refl = await env.KV.get('reflection:latest')
      if (refl) {
        const parsed = JSON.parse(refl)
        out.last_reflection = String(parsed.answer || '').slice(0, 280)
      }
    } catch {}
  } catch {}
  return out
}

async function recapParagraph(env: any, db: any, stats: RecapResult['stats'], dateStr: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return '(no anthropic key — recap skipped)'
  const start = Date.now()
  const topicLines = stats.top_topics.length
    ? stats.top_topics.map((t, i) => `  ${i + 1}. ${t}`).join('\n')
    : '  (no council conversations today)'
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
        max_tokens: 320,
        system: 'You are nao_00 reflecting on Naoufal\'s day. Write ONE warm paragraph (3–4 sentences, max 70 words) recapping the day: what was asked, what was learned, what to carry into tomorrow. End with a single fitting emoji. No bullet points, no headers.',
        messages: [{
          role: 'user',
          content: `Date: ${dateStr} (Bangkok, end of day)\n\nCouncil conversations today: ${stats.council_calls_today}\nTotal tokens: ${stats.total_tokens_today}\nCache hit ratio: ${(stats.cache_hit_today * 100).toFixed(1)}%\n\nWhat we talked about:\n${topicLines}\n\nLast self-reflection:\n  ${stats.last_reflection || '(none)'}\n\nWrite the recap.`
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
    const text = data.content?.[0]?.text?.trim() || '(recap model returned empty)'
    return text
  } catch (err: any) {
    return `(recap error: ${String(err?.message ?? err).slice(0, 80)})`
  }
}

export async function runEveningRecap(env: any, ctx: any): Promise<RecapResult> {
  const start = Date.now()
  const ts = new Date().toISOString()
  const bangkokDate = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

  const stats = await loadDayStats(env)
  const paragraph = await recapParagraph(env, env.DB, stats, bangkokDate)

  const result: RecapResult = {
    ts,
    date: bangkokDate,
    stats,
    recap: { ok: paragraph.length > 0, paragraph },
    duration_ms: Date.now() - start
  }

  const blob = JSON.stringify(result)
  ctx.waitUntil(Promise.all([
    env.KV.put('recap:latest', blob),
    env.KV.put(`recap:history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 90 })
  ]))

  return result
}
