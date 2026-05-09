// Nemotron 3 Super (NVIDIA NIM) — long-context + reasoning-mode model.
// $0.10/M input, $0.50/M output (or free community tier on build.nvidia.com).
// 91.75% RULER@1M — best long-context retention in open weights.
// Council brain stays Opus 4.7; this is for jobs the council *delegates*:
//   - long-doc Q&A
//   - background workers (cron self-reflection, eval mining)
//   - high-volume fan-out
// Returns both final content and the model's reasoning trace (for audit).

import { recordUsage } from '../metrics/api-use'

export interface NemotronCall {
  prompt: string
  system?: string
  max_tokens?: number
  temperature?: number
}

export interface NemotronResult {
  answer: string
  reasoning: string
  duration_ms: number
  input_tokens: number
  output_tokens: number
}

export async function nemotronReason(
  call: NemotronCall,
  apiKey: string,
  source: 'eval' | 'research' | 'other' = 'other',
  db?: D1Database
): Promise<NemotronResult> {
  const start = Date.now()
  const messages: any[] = []
  if (call.system) messages.push({ role: 'system', content: call.system })
  messages.push({ role: 'user', content: call.prompt })

  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-3-super-120b-a12b',
      messages,
      max_tokens: call.max_tokens ?? 1024,
      temperature: call.temperature ?? 0.3
    })
  })

  const data: any = await res.json()
  const duration_ms = Date.now() - start
  const choice = data?.choices?.[0]?.message ?? {}
  const usage = data?.usage ?? {}

  if (db) {
    await recordUsage(db, {
      source,
      model: 'nvidia/nemotron-3-super-120b-a12b',
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      cache_read_tokens: 0,
      cache_create_tokens: 0,
      duration_ms
    })
  }

  return {
    answer: String(choice.content ?? '').trim(),
    reasoning: String(choice.reasoning_content ?? choice.reasoning ?? '').trim(),
    duration_ms,
    input_tokens: usage.prompt_tokens ?? 0,
    output_tokens: usage.completion_tokens ?? 0
  }
}
