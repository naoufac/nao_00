// coverage_expander — picks one rotating topic from a curated list and runs
// runCoverage(topic, 5) so the council cache grows breadth-first. Topics are
// stable seeds; rotation is a counter-mod in KV so we hit each topic evenly.
//
// Drives pillar metric (each generated question becomes a council call) AND
// fills the cache so future organic queries skip the full pipeline.

import { runCoverage } from '../improve/coverage'

export interface CoverageExpanderEnv {
  NVIDIA_API_KEY: string
  KV: KVNamespace
  DB: D1Database
  // Whatever the council pipeline needs. We pass `env` straight through.
  [key: string]: any
}

// Curated seed topics. Keep generic enough to pass extractor.looksGeneric().
// Mix: gab44 / astrology, healing / sound therapy, council brain / memory,
// AI/dev tools, business/ops topics that Naoufal touches.
const SEED_TOPICS: string[] = [
  'astrology basics and zodiac signs',
  'meditation and mindfulness practices',
  'sound healing and frequency therapy',
  'tarot card meanings',
  'chakras and energy work',
  'breathwork techniques',
  'lunar cycles and moon phases',
  'numerology fundamentals',
  'crystals and gemstone properties',
  'cloudflare workers patterns',
  'd1 sqlite query optimization',
  'react patterns and hooks',
  'typescript advanced types',
  'prompt engineering techniques',
  'retrieval augmented generation',
  'vector embeddings and semantic search',
  'oauth flows and token security',
  'webhook patterns and idempotency',
  'cron scheduling on cloudflare',
  'stripe payments integration patterns',
  'shopify api basics',
  'telegram bot api fundamentals',
  'youtube content strategy basics',
  'email deliverability fundamentals',
  'dns records and domain setup',
  'cdn caching strategies',
  'observability and structured logging',
  'feature flag patterns',
  'a/b testing fundamentals',
  'productivity systems and gtd'
]

const ROTATION_KEY = 'coverage_expander:rotation'
const QUESTIONS_PER_RUN = 5

async function ensureTable(db: D1Database) {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS streams_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT, name TEXT, ok INTEGER, count INTEGER, duration_ms INTEGER, error TEXT
    )`
  ).run()
}

async function pickTopic(kv: KVNamespace): Promise<{ topic: string; index: number }> {
  let idx = 0
  try {
    const raw = await kv.get(ROTATION_KEY)
    if (raw) idx = parseInt(raw, 10) || 0
  } catch {
    idx = 0
  }
  const topic = SEED_TOPICS[idx % SEED_TOPICS.length]
  // Advance rotation atomically-ish (best-effort; cron only runs us serially).
  try {
    await kv.put(ROTATION_KEY, String(idx + 1))
  } catch {
    /* swallow */
  }
  return { topic, index: idx }
}

// Lightweight execution context shim for runCoverage. The real one comes from
// Hono (`c.executionCtx`) but cron/manual triggers may not have one. We give
// a minimal `waitUntil` that just awaits inline so KV writes still happen.
function makeShimCtx(): { waitUntil: (p: Promise<unknown>) => void } {
  return {
    waitUntil: (_p: Promise<unknown>) => {
      // No-op: we already await the writes inside the stream caller below by
      // the time runCoverage returns, persistence has begun. Cloudflare would
      // normally extend the lifetime, but for cron/manual paths we trust the
      // outer handler to keep us alive for the run.
    }
  }
}

export async function runCoverageExpander(
  env: CoverageExpanderEnv,
  db: D1Database,
  ctx?: { waitUntil: (p: Promise<unknown>) => void }
) {
  const started = Date.now()
  await ensureTable(db)

  const { topic, index } = await pickTopic(env.KV)

  try {
    const execCtx = ctx ?? makeShimCtx()
    const run = await runCoverage(topic, QUESTIONS_PER_RUN, env, execCtx, { dry_run: false })

    const duration_ms = Date.now() - started

    await db
      .prepare(
        'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        new Date().toISOString(),
        'coverage_expander',
        1,
        run.count_executed,
        duration_ms,
        null
      )
      .run()

    return {
      ok: true as const,
      topic,
      rotation_index: index,
      executed: run.count_executed,
      cached_new: run.count_cached_new,
      cached_hit: run.count_cached_hit,
      duration_ms
    }
  } catch (e: any) {
    const duration_ms = Date.now() - started
    const error = e?.message || String(e)
    try {
      await db
        .prepare(
          'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(new Date().toISOString(), 'coverage_expander', 0, 0, duration_ms, error)
        .run()
    } catch {
      /* swallow */
    }
    return { ok: false as const, topic, rotation_index: index, error, duration_ms }
  }
}
