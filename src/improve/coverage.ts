// /improve/coverage — given a topic, fan out a portfolio of generic questions
// through the council and let autoImprove cache them. The point is BOTH:
//   1. drives API use (pillar metric) — N council calls per run
//   2. expands cache breadth so future organic queries about adjacent facts
//      hit the cache instead of the full pipeline (compounding savings)
//
// Question generation uses Nemotron (cheap + already wired). Each question is
// formatted to pass extractor.looksGeneric(): starts with "in one short sentence:",
// includes a question word, no personal markers, ≤200 chars.

import { councilPipeline } from '../council/pipeline'
import { autoImprove } from './index'
import { nemotronReason } from '../tools/nemotron'
import { normalizeForCache } from '../util/filters'

export interface CoverageQuestion {
  question: string
  status: 'cached_hit' | 'cached_new' | 'skipped' | 'failed'
  reason?: string
  duration_ms?: number
}

export interface CoverageRun {
  ts: string
  topic: string
  count_requested: number
  count_generated: number
  count_executed: number
  count_cached_new: number
  count_cached_hit: number
  count_skipped: number
  duration_ms: number
  questions: CoverageQuestion[]
  dry_run: boolean
}

const QUESTION_PREFIX = 'In one short sentence:'

function looksGenericish(q: string): boolean {
  // Mirror extractor.looksGeneric heuristics so we don't burn calls that
  // can't be cached anyway.
  const lower = ' ' + q.toLowerCase().trim() + ' '
  if (lower.length > 200) return false
  const QUESTION_WORDS = ['what', 'how', 'why', 'when', 'who', 'where', 'which']
  if (!QUESTION_WORDS.some((w) => lower.includes(w))) return false
  const PERSONAL = [' i ', "i'm", 'my ', 'me ', 'mine', 'myself', 'today', 'tonight', 'right now', 'should i', 'do i', 'am i', 'naoufal']
  if (PERSONAL.some((p) => lower.includes(p))) return false
  return true
}

async function generateQuestions(
  topic: string,
  count: number,
  env: any
): Promise<string[]> {
  if (!env.NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY not bound — coverage needs Nemotron for question generation')
  }
  const system =
    'You generate diverse fact-based questions about a topic. ' +
    'Each must be answerable in ONE short sentence. ' +
    'No opinions, no personal questions, no advice questions. ' +
    'Cover different angles (definition, history, mechanism, examples, comparison, scale). ' +
    'Return ONLY a JSON array of strings, nothing else.'
  const prompt =
    `Topic: "${topic}"\n\n` +
    `Generate ${count} distinct generic factual questions about this topic. ` +
    `Each question MUST start with "${QUESTION_PREFIX}" and end with "?". ` +
    `Each must include a question word (what/how/why/when/where/who/which). ` +
    `No use of "I", "you", "my", "today", or first-person framing. ` +
    `Return strictly: ["${QUESTION_PREFIX} ...?", "${QUESTION_PREFIX} ...?", ...]`

  const r = await nemotronReason(
    { system, prompt, max_tokens: 800, temperature: 0.6 },
    env.NVIDIA_API_KEY,
    'eval',
    env.DB
  )
  // Try to find a JSON array in the response.
  const m = r.answer.match(/\[[\s\S]*\]/)
  if (!m) return []
  try {
    const arr = JSON.parse(m[0])
    if (!Array.isArray(arr)) return []
    return arr
      .map((s) => String(s || '').trim())
      .filter((s) => s.length > 0)
      .map((s) => (s.toLowerCase().startsWith('in one') ? s : `${QUESTION_PREFIX} ${s}`))
  } catch {
    return []
  }
}

export async function runCoverage(
  topic: string,
  count: number,
  env: any,
  ctx: any,
  opts: { dry_run?: boolean } = {}
): Promise<CoverageRun> {
  const start = Date.now()
  const requested = Math.max(1, Math.min(count || 5, 10))
  const dry_run = !!opts.dry_run

  let generated: string[] = []
  try {
    generated = await generateQuestions(topic, requested, env)
  } catch (err: any) {
    const ts = new Date().toISOString()
    return {
      ts, topic, count_requested: requested, count_generated: 0,
      count_executed: 0, count_cached_new: 0, count_cached_hit: 0, count_skipped: 0,
      duration_ms: Date.now() - start,
      questions: [{ question: '', status: 'failed', reason: String(err?.message || err) }],
      dry_run
    }
  }

  // Filter to only those that pass our looksGenericish gate; drop dups via normalize.
  const seen = new Set<string>()
  const filtered: string[] = []
  for (const q of generated) {
    if (!looksGenericish(q)) continue
    const norm = normalizeForCache(q)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    filtered.push(q)
  }

  const questions: CoverageQuestion[] = []

  if (dry_run) {
    for (const q of filtered) questions.push({ question: q, status: 'skipped', reason: 'dry_run' })
    const ts = new Date().toISOString()
    return {
      ts, topic, count_requested: requested, count_generated: generated.length,
      count_executed: 0, count_cached_new: 0, count_cached_hit: 0, count_skipped: filtered.length,
      duration_ms: Date.now() - start, questions, dry_run
    }
  }

  // Snapshot which keys exist BEFORE so we can tell new-vs-hit per question.
  const beforeKeys = new Set<string>()
  try {
    const rows = await env.DB.prepare('SELECT pattern FROM skills').all<{ pattern: string }>()
    for (const r of rows.results ?? []) beforeKeys.add(String(r.pattern))
  } catch { /* skills table missing — first run */ }

  // Run sequentially, not in parallel: each council call is heavy and we want
  // observable, ordered progress. With cap=10 the worst case is well under
  // Workers' 30s wall clock per request — but we still spawn the heavy work in
  // ctx.waitUntil for safety on bigger counts.
  let cached_new = 0
  let cached_hit = 0
  let skipped = 0
  let executed = 0

  for (const q of filtered) {
    const qStart = Date.now()
    const norm = normalizeForCache(q)
    const wasKnown = beforeKeys.has(norm)
    try {
      const result = await councilPipeline(q, env, env.KV, env.DB)
      executed += 1
      // autoImprove handles cache write + skill row insertion
      await autoImprove(q, result, env, env.KV, env.DB)
      const fromCache = result.council_steps.length === 1 && result.council_steps[0].advisor === 'cache'
      if (fromCache || wasKnown) {
        cached_hit += 1
        questions.push({ question: q, status: 'cached_hit', duration_ms: Date.now() - qStart })
      } else {
        cached_new += 1
        questions.push({ question: q, status: 'cached_new', duration_ms: Date.now() - qStart })
      }
    } catch (err: any) {
      skipped += 1
      questions.push({ question: q, status: 'failed', reason: String(err?.message || err), duration_ms: Date.now() - qStart })
    }
  }

  const ts = new Date().toISOString()
  const run: CoverageRun = {
    ts, topic,
    count_requested: requested,
    count_generated: generated.length,
    count_executed: executed,
    count_cached_new: cached_new,
    count_cached_hit: cached_hit,
    count_skipped: skipped,
    duration_ms: Date.now() - start,
    questions, dry_run
  }

  // Persist summary + history. 90d TTL on history.
  const blob = JSON.stringify(run)
  ctx.waitUntil(Promise.all([
    env.KV.put('coverage:latest', blob),
    env.KV.put(`coverage:history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 90 }),
    bumpCounters(env.KV, run)
  ]))

  return run
}

async function bumpCounters(kv: KVNamespace, run: CoverageRun): Promise<void> {
  // Lightweight running totals for the dashboard. Not transactional — best-effort.
  const raw = await kv.get('coverage:counters')
  const cur = raw ? safeJson(raw) : { runs: 0, topics: [] as string[], total_seeded: 0, total_executed: 0 }
  cur.runs = (cur.runs || 0) + 1
  cur.total_seeded = (cur.total_seeded || 0) + run.count_cached_new
  cur.total_executed = (cur.total_executed || 0) + run.count_executed
  const seenTopics: string[] = Array.isArray(cur.topics) ? cur.topics : []
  if (!seenTopics.includes(run.topic)) seenTopics.push(run.topic)
  cur.topics = seenTopics.slice(-50)
  cur.last_topic = run.topic
  cur.last_ts = run.ts
  await kv.put('coverage:counters', JSON.stringify(cur))
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}
