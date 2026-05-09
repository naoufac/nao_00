// Proactive scout — calls MiniMax-M2.7 to surface one actionable insight for Naoufal.
// Stored in KV (latest + capped history) and logged to D1 streams_runs.

import { recordUsage, anthropicUsage } from '../metrics/api-use'

interface Env {
  MINIMAX_API_KEY: string
  KV: KVNamespace
}

const FALLBACK_CONTEXT = 'Naoufal: builder, in Thailand, building nao_00.'
const SYSTEM_PROMPT =
  "You are nao44's proactive scout. Given Naoufal's current context, surface ONE concrete, specific, actionable insight he'd want — a build idea, a market move, a risk to watch, a small win he could grab today. 2-3 sentences. No fluff. No 'have you considered' framing. Just the insight, plainly stated."

async function ensureStreamsTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS streams_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT,
      name TEXT,
      ok INTEGER,
      count INTEGER,
      duration_ms INTEGER,
      error TEXT
    )`
  ).run()
}

async function logRun(
  db: D1Database,
  ok: boolean,
  duration_ms: number,
  error?: string
) {
  try {
    await db
      .prepare(
        `INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(new Date().toISOString(), 'proactive_insight', ok ? 1 : 0, ok ? 1 : 0, duration_ms, error ?? null)
      .run()
  } catch {
    // never break the call path on telemetry failure
  }
}

export async function runProactiveInsight(env: Env, db: D1Database) {
  const t0 = Date.now()
  await ensureStreamsTable(db)

  try {
    const context = (await env.KV.get('user:context')) || FALLBACK_CONTEXT

    const res = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.MINIMAX_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        max_tokens: 350,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Context:\n${context}\n\nGive Naoufal one proactive insight for right now.` }
        ]
      })
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`minimax ${res.status}: ${body.slice(0, 200)}`)
    }

    const data: any = await res.json()
    const blocks: any[] = Array.isArray(data?.content) ? data.content : []
    const textBlock = blocks.find(b => typeof b?.text === 'string' && b.text.trim().length > 0)
    const text = (textBlock?.text || '').trim()
    if (!text) throw new Error('no text block in minimax response')

    const duration_ms = Date.now() - t0
    const generated_at = new Date().toISOString()

    // KV: latest snapshot (7-day TTL)
    await env.KV.put(
      'proactive:latest',
      JSON.stringify({ text, generated_at }),
      { expirationTtl: 60 * 60 * 24 * 7 }
    )

    // KV: history (capped at 50)
    let history: { ts: string; preview: string }[] = []
    try {
      const raw = await env.KV.get('proactive:history:json')
      if (raw) history = JSON.parse(raw)
    } catch {
      history = []
    }
    history.unshift({ ts: generated_at, preview: text.slice(0, 80) })
    if (history.length > 50) history = history.slice(0, 50)
    await env.KV.put('proactive:history:json', JSON.stringify(history))

    // Pillar metric
    const u = anthropicUsage(data)
    await recordUsage(db, {
      source: 'proactive_insight',
      model: 'MiniMax-M2.7-proactive',
      input_tokens: u.input,
      output_tokens: u.output,
      cache_read_tokens: u.cache_read,
      cache_create_tokens: u.cache_create,
      duration_ms
    })

    await logRun(db, true, duration_ms)
    return { ok: true as const, text, duration_ms }
  } catch (e: any) {
    const duration_ms = Date.now() - t0
    const error = e?.message || String(e)
    await logRun(db, false, duration_ms, error)
    return { ok: false as const, error }
  }
}
