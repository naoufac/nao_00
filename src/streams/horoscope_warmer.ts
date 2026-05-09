// purpose: warms the gab44 daily horoscope KV cache for all 12 signs and logs the run.
import { generateAllSigns, type DailyHoroscope } from '../gab44/daily'
import { recordUsage } from '../metrics/api-use'

let _ensured = false
async function ensureTable(db: D1Database) {
  if (_ensured) return
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
  _ensured = true
}

export async function runHoroscopeWarmer(
  env: { MINIMAX_API_KEY: string; KV: KVNamespace },
  db: D1Database
): Promise<{ ok: boolean; count?: number; duration_ms?: number; sample?: string; error?: any }> {
  const started = Date.now()
  try {
    await ensureTable(db)
    const out: DailyHoroscope[] = await generateAllSigns(env)
    const duration_ms = Date.now() - started
    const totalChars = out.reduce((n, h) => n + (h?.text?.length || 0), 0)
    const output_tokens = Math.ceil(totalChars / 4)

    await recordUsage(db, {
      source: 'horoscope_warmer',
      model: 'horoscope_warmer',
      input_tokens: 0,
      output_tokens,
      duration_ms
    })

    await db.prepare(
      `INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      new Date().toISOString(),
      'horoscope_warmer',
      1,
      out.length,
      duration_ms,
      null
    ).run()

    return { ok: true, count: out.length, duration_ms, sample: out[0]?.text?.slice(0, 80) }
  } catch (err: any) {
    const duration_ms = Date.now() - started
    try {
      await ensureTable(db)
      await db.prepare(
        `INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        new Date().toISOString(),
        'horoscope_warmer',
        0,
        0,
        duration_ms,
        err?.message || String(err)
      ).run()
    } catch {}
    return { ok: false, error: err }
  }
}
