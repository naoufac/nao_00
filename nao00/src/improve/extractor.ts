// Skill extractor — caches confident, low-risk, generic answers in KV
// so future identical questions skip the council entirely.

import type { CouncilResult } from '../council/pipeline'

const QUESTION_WORDS = ['what', 'how', 'why', 'when', 'who', 'where', 'which', 'is ', 'are ', 'does', 'do ', 'can ']
const PERSONAL_MARKERS = [
  ' i ', "i'm", 'my ', 'me ', 'mine', 'myself',
  'today', 'tonight', 'right now', 'this week', 'this month',
  'should i', 'do i', 'am i', 'naoufal'
]

function looksGeneric(input: string): boolean {
  const lower = ' ' + input.toLowerCase().trim() + ' '
  if (lower.length > 200) return false
  if (!QUESTION_WORDS.some((q) => lower.includes(q))) return false
  if (PERSONAL_MARKERS.some((p) => lower.includes(p))) return false
  return true
}

function parseMistral(stepResponse: string): { decision?: string; risk?: string } {
  try {
    const obj = JSON.parse(stepResponse)
    return { decision: obj?.decision, risk: obj?.risk }
  } catch {
    return {}
  }
}

export async function extractSkill(
  input: string,
  result: CouncilResult,
  kv: KVNamespace,
  db: D1Database
): Promise<{ cached: boolean; reason?: string }> {
  const mistralStep = result.council_steps.find((s) => s.advisor === 'mistral')
  if (!mistralStep) return { cached: false, reason: 'no_mistral_step' }

  const mistralConfidence = mistralStep.confidence
  const { decision, risk } = parseMistral(mistralStep.response)

  if (mistralConfidence < 0.85) return { cached: false, reason: 'low_confidence' }
  if (decision !== 'agree') return { cached: false, reason: `mistral_${decision || 'unknown'}` }
  if (risk && risk !== 'low') return { cached: false, reason: `risk_${risk}` }
  if (!looksGeneric(input)) return { cached: false, reason: 'not_generic' }

  const cacheKey = `skill:${input.toLowerCase().trim().slice(0, 100)}`
  const value = JSON.stringify({
    answer: result.final_output,
    confidence: mistralConfidence,
    source_id: result.id,
    cached_at: new Date().toISOString()
  })
  // 30-day TTL — long enough to be useful, short enough that the world can change
  await kv.put(cacheKey, value, { expirationTtl: 60 * 60 * 24 * 30 })

  await db
    .prepare(
      'INSERT INTO skills (pattern, answer, confidence, created_at, used_count) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(input.toLowerCase().trim().slice(0, 100), result.final_output, mistralConfidence, new Date().toISOString(), 0)
    .run()

  return { cached: true }
}
