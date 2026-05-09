import { callNao44 } from './nao44'
import { callGrok } from './grok'
import { callMistral } from './mistral'
import { callMinouch } from './minouch'

export interface CouncilResult {
  id: string
  input: string
  final_output: string
  council_steps: CouncilStep[]
  duration_ms: number
}

export interface CouncilStep {
  advisor: string
  response: string
  confidence: number
  duration_ms: number
}

export async function councilPipeline(
  input: string,
  env: any,
  kv: KVNamespace,
  db: D1Database
): Promise<CouncilResult> {
  const id = crypto.randomUUID()
  const start = Date.now()
  const steps: CouncilStep[] = []

  // Load user context from KV
  const userContext = await kv.get('user:context') || 'Naoufal. Builder. In Thailand. Building nao_00.'

  // Check skill cache — skip council if known answer
  const cacheKey = `skill:${input.toLowerCase().trim().slice(0, 100)}`
  const cached = await kv.get(cacheKey)
  if (cached) {
    const parsed = JSON.parse(cached)
    return {
      id, input,
      final_output: parsed.answer,
      council_steps: [{ advisor: 'cache', response: 'Cached skill hit', confidence: parsed.confidence, duration_ms: 0 }],
      duration_ms: Date.now() - start
    }
  }

  // Step 1: nao44 (Opus) — knows Nao, filters for best interest
  const nao44Start = Date.now()
  const nao44Response = await callNao44(input, userContext, env.ANTHROPIC_API_KEY)
  steps.push({
    advisor: 'nao44',
    response: nao44Response.opinion,
    confidence: nao44Response.confidence,
    duration_ms: Date.now() - nao44Start
  })

  // Step 2: Grok — truth from the world
  const grokStart = Date.now()
  const grokResponse = await callGrok(input, nao44Response.opinion, env.OPENROUTER_API_KEY)
  steps.push({
    advisor: 'grok',
    response: grokResponse.opinion,
    confidence: grokResponse.confidence,
    duration_ms: Date.now() - grokStart
  })

  // Step 3: Mistral — structured logic check
  const mistralStart = Date.now()
  const mistralResponse = await callMistral(input, nao44Response.opinion, grokResponse.opinion, env.MISTRAL_API_KEY)
  steps.push({
    advisor: 'mistral',
    response: JSON.stringify(mistralResponse.verdict),
    confidence: mistralResponse.confidence,
    duration_ms: Date.now() - mistralStart
  })

  // Step 4: Minouch (Haiku) — warm delivery
  const minouchStart = Date.now()
  const finalAnswer = await callMinouch(input, steps, env.ANTHROPIC_API_KEY)
  steps.push({
    advisor: 'minouch',
    response: finalAnswer,
    confidence: 1.0,
    duration_ms: Date.now() - minouchStart
  })

  const result: CouncilResult = {
    id, input,
    final_output: finalAnswer,
    council_steps: steps,
    duration_ms: Date.now() - start
  }

  // Save to D1
  await db.prepare(
    'INSERT INTO conversations (id, input, final_output, created_at) VALUES (?, ?, ?, ?)'
  ).bind(id, input, finalAnswer, new Date().toISOString()).run()

  for (let i = 0; i < steps.length; i++) {
    await db.prepare(
      'INSERT INTO council_steps (conversation_id, step_order, advisor_name, response, confidence, duration_ms) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, i, steps[i].advisor, steps[i].response, steps[i].confidence, steps[i].duration_ms).run()
  }

  return result
}
