// Together.ai client — direct REST.
// Composio has no Together toolkit, so we wire it ourselves alongside Anthropic + Mistral.
// Catalog: Llama 4 Maverick, DeepSeek-V3, Qwen 3, Mixtral, plenty more.
// $10 starter credit, auto-recharge $30 at $25 threshold (per Naoufal 2026-05-08).
//
// Default model: Llama 4 Maverick FP8 — frontier MoE, fast, cheap. Override per-call when needed.

import { recordUsage } from '../metrics/api-use'

// Default chosen for stability — Llama 3.3 70B Turbo is widely available on Together's free tier.
// Llama 4 Maverick FP8 was returning 503 (likely capacity-gated) when this was wired, 2026-05-08.
// Override per-call with opts.model when you need Llama 4 / DeepSeek-V3 / Qwen.
export const DEFAULT_TOGETHER_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'

export interface TogetherCallOpts {
  apiKey: string
  model?: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  max_tokens?: number
  json?: boolean
  db?: D1Database
  // Pillar-metric source tag. Callers should pass a meaningful slug so usage
  // shows up under their lane (e.g. 'extractor_together'). Default is a
  // fleet-distinct fallback so we never pollute 'other' again.
  source?: string
}

export interface TogetherResult {
  text: string
  model: string
  finish_reason: string | null
  usage: { input: number; output: number }
  raw: any
}

export async function callTogether(opts: TogetherCallOpts): Promise<TogetherResult> {
  const start = Date.now()
  const model = opts.model || DEFAULT_TOGETHER_MODEL
  const body: any = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.max_tokens ?? 1024,
  }
  if (opts.json) body.response_format = { type: 'json_object' }

  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`together.ai ${res.status}: ${errText.slice(0, 400)}`)
  }

  const data: any = await res.json()
  const choice = data.choices?.[0] || {}
  const text: string = (choice.message?.content || '').trim()
  const finish_reason: string | null = choice.finish_reason ?? null
  const usage = {
    input: data.usage?.prompt_tokens || 0,
    output: data.usage?.completion_tokens || 0,
  }

  if (opts.db) {
    await recordUsage(opts.db, {
      source: opts.source || 'together_default',
      model,
      input_tokens: usage.input,
      output_tokens: usage.output,
      duration_ms: Date.now() - start,
    })
  }

  return { text, model, finish_reason, usage, raw: data }
}
