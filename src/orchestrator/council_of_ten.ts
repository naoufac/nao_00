// Council of Ten — Phase 3 of the orchestrator pipeline.
//
// Architecture (per ~/nao00/PLAN-COUNCIL-OF-TEN.md):
//
//   topic + evidence pack
//     │
//     ├──> 8 advisors run in parallel (30s budget each), each returns:
//     │      {verdict, reason, confidence, key_evidence}
//     │      Failures (timeout, missing key, malformed JSON) → null verdict,
//     │      logged as error string. Council does NOT halt.
//     │
//     └──> Synthesizer (rotated each call: Opus / Gemini Pro / Mistral Large)
//            produces {recommendation, confidence, dissent_map, full_trace}
//
// Hard rules:
//   - Synthesizer rotates per call. The provider that synthesizes is chosen
//     by `Date.now() % 3` so we don't always default to Anthropic.
//   - Synthesizer is NEVER allowed to be a provider whose own advisor is in
//     the panel — but with 8 advisors covering Anthropic/Google/Mistral
//     directly, that just means we strip the advisor's verdict from the
//     synthesizer's view. (Phase-1 simple version: rotate the synth provider.)
//   - Token budget: evidence pack cached with cache_control=ephemeral 1h on
//     Anthropic/Mistral-large lanes that support it.
//   - Per-advisor 30s hard timeout via AbortController.
//   - 5-of-8 quorum: if 5 verdicts arrive, the synthesizer can start (we don't
//     wait for stragglers). The remaining 3 are still recorded if they finish
//     within the 30s window via Promise.all.

import { recordUsage, anthropicUsage, mistralUsage } from '../metrics/api-use'
import { buildEvidencePack, EvidencePack } from './researcher'
import { councilPipeline } from '../council/pipeline'

export type Verdict = 'yes' | 'no' | 'conditional' | null

export interface AdvisorReply {
  advisor: string                  // human label
  provider: string                 // anthropic|google|minimax|together|mistral|nvidia|manus|internal_council
  model: string                    // model id
  verdict: Verdict
  reason: string
  confidence: number               // 0..1
  key_evidence: string[]           // citation ids referenced
  duration_ms: number
  error?: string                   // on failure; verdict will be null
  raw_text?: string                // for the trace page (≤2000 chars)
  input_tokens?: number
  output_tokens?: number
}

export interface DissentItem {
  question: string
  agree: string[]
  disagree: string[]
}

export interface SynthesizerOutput {
  recommendation: 'yes' | 'no' | 'conditional'
  confidence: number
  rationale: string
  dissent_map: DissentItem[]
  synth_provider: string
  synth_model: string
  duration_ms: number
  raw_text?: string
}

export interface CouncilOfTenResult {
  id: string
  topic: string
  evidence: EvidencePack
  advisors: AdvisorReply[]
  synth: SynthesizerOutput | null
  agreement_pct: number            // % of non-null advisors that match the recommendation
  full_trace_url: string
  duration_ms: number
  errors: string[]
}

const TIMEOUT_MS = 30_000
const MIN_QUORUM = 5

const ADVISOR_SYSTEM_PROMPT = `You are one of 8 independent advisors in nao_00's Council of Ten.

Your job: given a question and an EVIDENCE PACK with citations [c1.1, c1.2, ...], output a STRICT JSON verdict. Cite the evidence ids you actually used.

Rules:
- Be honest. If the evidence is thin, say so and lower confidence.
- "yes"/"no"/"conditional" — no other values.
- "conditional" means "yes IF something is true that the evidence doesn't settle".
- key_evidence is an array of citation ids you actually used (e.g. ["c2.1","c4.3"]). Empty if you reasoned from prior knowledge.
- Reason ≤ 280 chars, plain English, no preamble.

Output JSON only, no prose:
{"verdict":"yes|no|conditional","reason":"...","confidence":0.0,"key_evidence":["c1.1"]}`

const SYNTHESIZER_SYSTEM_PROMPT = `You are the Synthesizer for nao_00's Council of Ten.

8 advisors have voted on a question, each with a verdict (yes/no/conditional), reason, confidence, and the citations they referenced. Your job:

1. Aggregate into ONE recommendation: yes / no / conditional.
2. Give an honest confidence (0..1). If the panel split 4/4, confidence MUST be ≤ 0.55.
3. Surface DISSENT — list the substantive questions where the advisors disagreed, with the names that fell on each side.
4. Briefly explain the reasoning the evidence supports (≤ 600 chars).

Output STRICT JSON only:
{
  "recommendation": "yes|no|conditional",
  "confidence": 0.0,
  "rationale": "...",
  "dissent_map": [
    {"question": "...", "agree": ["AdvisorA","AdvisorB"], "disagree": ["AdvisorC"]}
  ]
}`

// ---------- Helpers ----------

function tryParseJson(text: string): any {
  if (!text) return null
  const stripped = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  const m = stripped.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms)
    promise.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

function userPrompt(topic: string, pack: EvidencePack): string {
  return `QUESTION: ${topic}\n\n${pack.pack_text}\n\nProvide your JSON verdict.`
}

function normalizeReply(advisor: string, provider: string, model: string, raw: string, durMs: number, parsed: any): AdvisorReply {
  if (!parsed) {
    return {
      advisor, provider, model,
      verdict: null,
      reason: (raw || '').slice(0, 280),
      confidence: 0,
      key_evidence: [],
      duration_ms: durMs,
      error: 'unparseable_json',
      raw_text: (raw || '').slice(0, 2000),
    }
  }
  const v = String(parsed.verdict || '').toLowerCase()
  const verdict: Verdict = (v === 'yes' || v === 'no' || v === 'conditional') ? v : null
  return {
    advisor, provider, model,
    verdict,
    reason: String(parsed.reason || '').slice(0, 280),
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    key_evidence: Array.isArray(parsed.key_evidence) ? parsed.key_evidence.slice(0, 8).map(String) : [],
    duration_ms: durMs,
    error: verdict ? undefined : 'invalid_verdict_value',
    raw_text: (raw || '').slice(0, 2000),
  }
}

// ---------- Advisor implementations ----------

async function askAnthropic(env: any, model: string, topic: string, pack: EvidencePack, advisorLabel: string): Promise<AdvisorReply> {
  const start = Date.now()
  if (!env.ANTHROPIC_API_KEY) {
    return { advisor: advisorLabel, provider: 'anthropic', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: 0, error: 'no_anthropic_key' }
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'extended-cache-ttl-2025-04-11',
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system: [{ type: 'text', text: ADVISOR_SYSTEM_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } }],
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: userPrompt(topic, pack), cache_control: { type: 'ephemeral', ttl: '1h' } },
          ],
        }],
      }),
    })
    const data: any = await r.json()
    if (data?.error) {
      return { advisor: advisorLabel, provider: 'anthropic', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: `anthropic:${data.error.type || 'error'}:${String(data.error.message || '').slice(0, 120)}` }
    }
    const u = anthropicUsage(data)
    if (env.DB) {
      await recordUsage(env.DB, {
        source: `council_of_ten_${advisorLabel.toLowerCase()}`,
        model,
        input_tokens: u.input, output_tokens: u.output,
        cache_read_tokens: u.cache_read, cache_create_tokens: u.cache_create,
        duration_ms: Date.now() - start,
      })
    }
    const text = data?.content?.[0]?.text || ''
    const parsed = tryParseJson(text)
    const reply = normalizeReply(advisorLabel, 'anthropic', model, text, Date.now() - start, parsed)
    reply.input_tokens = u.input; reply.output_tokens = u.output
    return reply
  } catch (err: any) {
    return { advisor: advisorLabel, provider: 'anthropic', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: String(err?.message ?? err).slice(0, 200) }
  }
}

async function askGemini(env: any, model: string, topic: string, pack: EvidencePack, advisorLabel: string): Promise<AdvisorReply> {
  const start = Date.now()
  if (!env.GEMINI_API_KEY) {
    return { advisor: advisorLabel, provider: 'google', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: 0, error: 'no_gemini_key' }
  }
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ADVISOR_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt(topic, pack) }] }],
        // gemini-2.5-pro is reasoning-only — it spends all tokens on internal "thoughts"
        // before any content frame is emitted. Budget enough headroom for both.
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000, responseMimeType: 'application/json' },
      }),
    })
    const data: any = await r.json()
    if (data?.error) {
      return { advisor: advisorLabel, provider: 'google', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: `gemini:${String(data.error.status || '').toLowerCase()}:${String(data.error.message || '').slice(0, 120)}` }
    }
    const cand = data?.candidates?.[0] || {}
    const parts = cand?.content?.parts || []
    const text = parts.map((p: any) => p?.text || '').join('').trim()
    const parsed = tryParseJson(text)
    const u = data?.usageMetadata || {}
    const input = Number(u.promptTokenCount || 0)
    const output = Number(u.candidatesTokenCount || 0)
    if (env.DB) {
      await recordUsage(env.DB, {
        source: `council_of_ten_${advisorLabel.toLowerCase()}`,
        model,
        input_tokens: input, output_tokens: output,
        duration_ms: Date.now() - start,
      })
    }
    const reply = normalizeReply(advisorLabel, 'google', model, text, Date.now() - start, parsed)
    reply.input_tokens = input; reply.output_tokens = output
    return reply
  } catch (err: any) {
    return { advisor: advisorLabel, provider: 'google', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: String(err?.message ?? err).slice(0, 200) }
  }
}

async function askMinimax(env: any, model: string, topic: string, pack: EvidencePack, advisorLabel: string): Promise<AdvisorReply> {
  const start = Date.now()
  if (!env.MINIMAX_API_KEY) {
    return { advisor: advisorLabel, provider: 'minimax', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: 0, error: 'no_minimax_key' }
  }
  try {
    const r = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system: ADVISOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt(topic, pack) }],
      }),
    })
    const data: any = await r.json()
    if (data?.error) {
      return { advisor: advisorLabel, provider: 'minimax', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: `minimax:${data.error.type || 'error'}:${String(data.error.message || '').slice(0, 120)}` }
    }
    const u = anthropicUsage(data)
    if (env.DB) {
      await recordUsage(env.DB, {
        source: `council_of_ten_${advisorLabel.toLowerCase()}`,
        model,
        input_tokens: u.input, output_tokens: u.output,
        duration_ms: Date.now() - start,
      })
    }
    const blocks: any[] = data?.content || []
    const text = blocks.find(b => typeof b?.text === 'string' && b.text.trim().length > 0)?.text || ''
    const parsed = tryParseJson(text)
    const reply = normalizeReply(advisorLabel, 'minimax', model, text, Date.now() - start, parsed)
    reply.input_tokens = u.input; reply.output_tokens = u.output
    return reply
  } catch (err: any) {
    return { advisor: advisorLabel, provider: 'minimax', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: String(err?.message ?? err).slice(0, 200) }
  }
}

async function askTogether(env: any, model: string, topic: string, pack: EvidencePack, advisorLabel: string): Promise<AdvisorReply> {
  const start = Date.now()
  if (!env.TOGETHER_API_KEY) {
    return { advisor: advisorLabel, provider: 'together', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: 0, error: 'no_together_key' }
  }
  try {
    const r = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.TOGETHER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ADVISOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(topic, pack) },
        ],
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
    })
    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      return { advisor: advisorLabel, provider: 'together', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: `together_${r.status}:${errText.slice(0, 200)}` }
    }
    const data: any = await r.json()
    const choice = data?.choices?.[0] || {}
    const text = (choice?.message?.content || '').trim()
    const usage = data?.usage || {}
    if (env.DB) {
      await recordUsage(env.DB, {
        source: `council_of_ten_${advisorLabel.toLowerCase()}`,
        model,
        input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0,
        duration_ms: Date.now() - start,
      })
    }
    const parsed = tryParseJson(text)
    const reply = normalizeReply(advisorLabel, 'together', model, text, Date.now() - start, parsed)
    reply.input_tokens = usage.prompt_tokens || 0; reply.output_tokens = usage.completion_tokens || 0
    return reply
  } catch (err: any) {
    return { advisor: advisorLabel, provider: 'together', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: String(err?.message ?? err).slice(0, 200) }
  }
}

async function askMistral(env: any, model: string, topic: string, pack: EvidencePack, advisorLabel: string): Promise<AdvisorReply> {
  const start = Date.now()
  if (!env.MISTRAL_API_KEY) {
    return { advisor: advisorLabel, provider: 'mistral', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: 0, error: 'no_mistral_key' }
  }
  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 700,
        messages: [
          { role: 'system', content: ADVISOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(topic, pack) },
        ],
      }),
    })
    const data: any = await r.json()
    if (data?.message && !data?.choices) {
      return { advisor: advisorLabel, provider: 'mistral', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: `mistral:${String(data.message).slice(0, 120)}` }
    }
    const text = data?.choices?.[0]?.message?.content || ''
    const u = mistralUsage(data)
    if (env.DB) {
      await recordUsage(env.DB, {
        source: `council_of_ten_${advisorLabel.toLowerCase()}`,
        model,
        input_tokens: u.input, output_tokens: u.output,
        duration_ms: Date.now() - start,
      })
    }
    const parsed = tryParseJson(text)
    const reply = normalizeReply(advisorLabel, 'mistral', model, text, Date.now() - start, parsed)
    reply.input_tokens = u.input; reply.output_tokens = u.output
    return reply
  } catch (err: any) {
    return { advisor: advisorLabel, provider: 'mistral', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: String(err?.message ?? err).slice(0, 200) }
  }
}

async function askNvidia(env: any, model: string, topic: string, pack: EvidencePack, advisorLabel: string): Promise<AdvisorReply> {
  const start = Date.now()
  if (!env.NVIDIA_API_KEY) {
    return { advisor: advisorLabel, provider: 'nvidia', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: 0, error: 'no_nvidia_key' }
  }
  try {
    const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ADVISOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(topic, pack) },
        ],
        temperature: 0.3,
        max_tokens: 700,
      }),
    })
    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      return { advisor: advisorLabel, provider: 'nvidia', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: `nvidia_${r.status}:${errText.slice(0, 200)}` }
    }
    const data: any = await r.json()
    const text = data?.choices?.[0]?.message?.content || ''
    const usage = data?.usage || {}
    if (env.DB) {
      await recordUsage(env.DB, {
        source: `council_of_ten_${advisorLabel.toLowerCase()}`,
        model,
        input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0,
        duration_ms: Date.now() - start,
      })
    }
    const parsed = tryParseJson(text)
    const reply = normalizeReply(advisorLabel, 'nvidia', model, text, Date.now() - start, parsed)
    reply.input_tokens = usage.prompt_tokens || 0; reply.output_tokens = usage.completion_tokens || 0
    return reply
  } catch (err: any) {
    return { advisor: advisorLabel, provider: 'nvidia', model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: String(err?.message ?? err).slice(0, 200) }
  }
}

async function askManus(env: any, topic: string, pack: EvidencePack, advisorLabel: string): Promise<AdvisorReply> {
  const start = Date.now()
  if (!env.MANUS_API_KEY) {
    return { advisor: advisorLabel, provider: 'manus', model: 'manus-default', verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: 0, error: 'no_manus_key' }
  }
  // Manus is async-by-design: /v1/tasks returns a task_id immediately, then
  // the agent works for several minutes. We can't wait that long inside the
  // 30s council budget, so we FIRE the task and surface "manus_pending" with
  // the task URL as a reference. Synthesizer treats this as a no-verdict slot;
  // the real Manus answer can be folded back in via the /streams managed_agent
  // path on a later orchestrator beat.
  try {
    const r = await fetch('https://api.manus.ai/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'API_KEY': env.MANUS_API_KEY },
      body: JSON.stringify({
        prompt: `${ADVISOR_SYSTEM_PROMPT}\n\nQUESTION: ${topic}\n\n${pack.pack_text}\n\nRespond with the JSON verdict only.`,
      }),
    })
    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      return { advisor: advisorLabel, provider: 'manus', model: 'manus-default', verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: `manus_${r.status}:${errText.slice(0, 200)}` }
    }
    const data: any = await r.json()
    const taskId = data?.task_id || ''
    const taskUrl = data?.task_url || (taskId ? `https://manus.im/app/${taskId}` : '')
    if (env.DB) {
      await recordUsage(env.DB, {
        source: `council_of_ten_${advisorLabel.toLowerCase()}`,
        model: 'manus-default',
        input_tokens: 0, output_tokens: 0,
        duration_ms: Date.now() - start,
      })
    }
    // No verdict yet — Manus is async. Surface the task link in raw_text and
    // mark the slot as "pending" via the error field (synthesizer ignores it).
    return {
      advisor: advisorLabel, provider: 'manus', model: 'manus-default',
      verdict: null,
      reason: `manus task fired (async); see ${taskUrl}`,
      confidence: 0,
      key_evidence: [],
      duration_ms: Date.now() - start,
      error: 'manus_pending_async',
      raw_text: taskUrl,
    }
  } catch (err: any) {
    return { advisor: advisorLabel, provider: 'manus', model: 'manus-default', verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: String(err?.message ?? err).slice(0, 200) }
  }
}

async function askInternalCouncil(env: any, kv: KVNamespace, db: D1Database, topic: string, pack: EvidencePack, advisorLabel: string): Promise<AdvisorReply> {
  const start = Date.now()
  // The 4-voice internal council answers in plain English. We wrap it into the
  // strict-JSON shape by post-parsing.
  try {
    const prompt = `${userPrompt(topic, pack)}\n\nReply with JSON ONLY: {"verdict":"yes|no|conditional","reason":"...","confidence":0.0,"key_evidence":["c1.1"]}`
    const result = await councilPipeline(prompt, env, kv, db)
    const text = result.final_output || ''
    const parsed = tryParseJson(text)
    return normalizeReply(advisorLabel, 'internal_council', 'nao44+mistral+minimax+minouch', text, Date.now() - start, parsed)
  } catch (err: any) {
    return { advisor: advisorLabel, provider: 'internal_council', model: 'nao44+mistral+minimax+minouch', verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: Date.now() - start, error: String(err?.message ?? err).slice(0, 200) }
  }
}

// ---------- Synthesizer ----------

function pickSynthProvider(env: any): { provider: string; model: string } {
  // Rotate Opus / Gemini Pro / Mistral Large per call. Skip any provider whose
  // key isn't bound. Per `feedback_anti_anthropic_bias`: do NOT default to
  // Anthropic.
  const candidates = [
    { provider: 'google', model: 'gemini-2.5-pro', has: !!env.GEMINI_API_KEY },
    { provider: 'mistral', model: 'mistral-large-latest', has: !!env.MISTRAL_API_KEY },
    { provider: 'anthropic', model: 'claude-opus-4-7', has: !!env.ANTHROPIC_API_KEY },
  ].filter(c => c.has)
  if (!candidates.length) return { provider: 'anthropic', model: 'claude-opus-4-7' }
  const idx = Math.floor(Date.now() / 1000) % candidates.length
  return { provider: candidates[idx].provider, model: candidates[idx].model }
}

async function synthesize(env: any, topic: string, advisors: AdvisorReply[]): Promise<SynthesizerOutput | null> {
  const { provider, model } = pickSynthProvider(env)
  const start = Date.now()
  // Hide each advisor's verdict from a synthesizer of its OWN provider — this
  // prevents that provider from rubber-stamping its own opinion. We replace
  // the verdict with "withheld" but keep the reason (which is anonymized later
  // in the trace if needed).
  const filtered = advisors.map(a => ({
    advisor: a.advisor,
    provider: a.provider,
    verdict: a.provider === provider ? 'withheld' : (a.verdict || 'null'),
    confidence: a.confidence,
    reason: a.reason,
    key_evidence: a.key_evidence,
    error: a.error,
  }))
  const userMsg = `QUESTION: ${topic}\n\nADVISOR VERDICTS:\n${JSON.stringify(filtered, null, 2)}\n\nProduce the JSON aggregate.`
  try {
    let text = ''
    let inTok = 0, outTok = 0
    if (provider === 'google') {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYNTHESIZER_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userMsg }] }],
          // Reasoning model needs headroom for both thoughts and content.
          generationConfig: { temperature: 0.2, maxOutputTokens: 4000, responseMimeType: 'application/json' },
        }),
      })
      const data: any = await r.json()
      if (data?.error) throw new Error(`gemini:${data.error.message}`)
      const parts = data?.candidates?.[0]?.content?.parts || []
      text = parts.map((p: any) => p?.text || '').join('').trim()
      inTok = Number(data?.usageMetadata?.promptTokenCount || 0)
      outTok = Number(data?.usageMetadata?.candidatesTokenCount || 0)
    } else if (provider === 'mistral') {
      const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.MISTRAL_API_KEY}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          max_tokens: 1500,
          messages: [
            { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
            { role: 'user', content: userMsg },
          ],
        }),
      })
      const data: any = await r.json()
      if (data?.message && !data?.choices) throw new Error(`mistral:${data.message}`)
      text = data?.choices?.[0]?.message?.content || ''
      const u = mistralUsage(data); inTok = u.input; outTok = u.output
    } else {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system: SYNTHESIZER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
        }),
      })
      const data: any = await r.json()
      if (data?.error) throw new Error(`anthropic:${data.error.message}`)
      text = data?.content?.[0]?.text || ''
      const u = anthropicUsage(data); inTok = u.input; outTok = u.output
    }

    if (env.DB) {
      await recordUsage(env.DB, {
        source: 'council_of_ten_synthesizer',
        model,
        input_tokens: inTok, output_tokens: outTok,
        duration_ms: Date.now() - start,
      })
    }
    const parsed = tryParseJson(text)
    if (!parsed) return null
    const rec = String(parsed.recommendation || '').toLowerCase()
    const recommendation: 'yes' | 'no' | 'conditional' = (rec === 'yes' || rec === 'no' || rec === 'conditional') ? rec as any : 'conditional'
    return {
      recommendation,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      rationale: String(parsed.rationale || '').slice(0, 1000),
      dissent_map: Array.isArray(parsed.dissent_map) ? parsed.dissent_map.slice(0, 6).map((d: any) => ({
        question: String(d?.question || '').slice(0, 200),
        agree: Array.isArray(d?.agree) ? d.agree.slice(0, 8).map(String) : [],
        disagree: Array.isArray(d?.disagree) ? d.disagree.slice(0, 8).map(String) : [],
      })) : [],
      synth_provider: provider,
      synth_model: model,
      duration_ms: Date.now() - start,
      raw_text: text.slice(0, 2000),
    }
  } catch (err: any) {
    // Fallback: majority vote.
    const valid = advisors.filter(a => a.verdict)
    if (!valid.length) return null
    const counts: Record<string, number> = {}
    for (const a of valid) counts[a.verdict!] = (counts[a.verdict!] || 0) + 1
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    const [topVerdict, topCount] = sorted[0]
    return {
      recommendation: topVerdict as any,
      confidence: Math.min(0.55, topCount / valid.length),
      rationale: `Synthesizer (${provider}) failed: ${String(err?.message ?? err).slice(0, 200)}. Fallback to majority vote.`,
      dissent_map: [],
      synth_provider: `${provider}_fallback_majority`,
      synth_model: model,
      duration_ms: Date.now() - start,
    }
  }
}

// ---------- Public entry ----------

export type ProviderTag = 'anthropic' | 'google' | 'minimax' | 'together' | 'mistral' | 'nvidia' | 'manus' | 'internal_council'
export interface AdvisorSlot { label: string; provider: ProviderTag; model: string }

export const ADVISOR_SLOTS: AdvisorSlot[] = [
  { label: 'Opus47',     provider: 'anthropic',        model: 'claude-opus-4-7' },
  { label: 'GeminiPro',  provider: 'google',           model: 'gemini-2.5-pro' },
  { label: 'MiniMaxM27', provider: 'minimax',          model: 'MiniMax-M2.7' },
  // Maverick FP8 is consistently 503'ing on Together (capacity-gated). Fall
  // back to Llama 3.3 70B Turbo which is the canonical free-tier reasoning
  // model on Together — independent training, open weights, fast.
  { label: 'Llama3370B', provider: 'together',         model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { label: 'MistralL',   provider: 'mistral',          model: 'mistral-large-latest' },
  { label: 'Nemotron49', provider: 'nvidia',           model: 'nvidia/llama-3.3-nemotron-super-49b-v1' },
  { label: 'Manus',      provider: 'manus',            model: 'manus-default' },
  // 8th slot: DeepSeek-V3.1 via Together — independent Chinese training data,
  // different alignment style. Forces real provider diversity rather than
  // looping back through nao44 (which IS Opus, already in the panel).
  { label: 'DeepSeekV31',provider: 'together',         model: 'deepseek-ai/DeepSeek-V3.1' },
]

export async function runCouncilOfTen(
  topic: string,
  env: any,
  kv?: KVNamespace,
  db?: D1Database,
): Promise<CouncilOfTenResult> {
  const start = Date.now()
  const id = crypto.randomUUID()
  const errors: string[] = []

  // Phase 1: research
  const evidence = await buildEvidencePack(topic, env)
  if (evidence.errors.length) errors.push(...evidence.errors.map(e => `evidence:${e}`))

  // Phase 2: 8 advisors in parallel, each wrapped in 30s timeout.
  const tasks: Promise<AdvisorReply>[] = ADVISOR_SLOTS.map(slot => {
    let p: Promise<AdvisorReply>
    if (slot.provider === 'anthropic')        p = askAnthropic(env, slot.model, topic, evidence, slot.label)
    else if (slot.provider === 'google')      p = askGemini(env, slot.model, topic, evidence, slot.label)
    else if (slot.provider === 'minimax')     p = askMinimax(env, slot.model, topic, evidence, slot.label)
    else if (slot.provider === 'together')    p = askTogether(env, slot.model, topic, evidence, slot.label)
    else if (slot.provider === 'mistral')     p = askMistral(env, slot.model, topic, evidence, slot.label)
    else if (slot.provider === 'nvidia')      p = askNvidia(env, slot.model, topic, evidence, slot.label)
    else if (slot.provider === 'manus')       p = askManus(env, topic, evidence, slot.label)
    else if ((slot.provider as string) === 'internal_council') p = askInternalCouncil(env, kv!, db!, topic, evidence, slot.label)
    else                                      p = Promise.resolve({ advisor: slot.label, provider: slot.provider, model: slot.model, verdict: null, reason: '', confidence: 0, key_evidence: [], duration_ms: 0, error: 'unknown_provider' } as AdvisorReply)
    return withTimeout(p, TIMEOUT_MS, `${slot.label}_advisor`).catch((err: any) => ({
      advisor: slot.label, provider: slot.provider, model: slot.model,
      verdict: null, reason: '', confidence: 0, key_evidence: [],
      duration_ms: TIMEOUT_MS,
      error: String(err?.message ?? err).slice(0, 200),
    } as AdvisorReply))
  })

  // Wait for ALL to settle (each is timeout-bounded). Promise.all is fine here.
  const advisors = await Promise.all(tasks)

  const validVerdicts = advisors.filter(a => a.verdict !== null)
  if (validVerdicts.length < MIN_QUORUM) {
    errors.push(`quorum_missed:${validVerdicts.length}/${MIN_QUORUM}_minimum`)
  }

  // Phase 3: synthesizer
  let synth: SynthesizerOutput | null = null
  if (validVerdicts.length > 0) {
    synth = await synthesize(env, topic, advisors)
  }

  // Agreement % — fraction of valid advisors whose verdict matches synth.
  let agreement_pct = 0
  if (synth && validVerdicts.length) {
    const matching = validVerdicts.filter(a => a.verdict === synth!.recommendation).length
    agreement_pct = Math.round((matching / validVerdicts.length) * 100)
  }

  const result: CouncilOfTenResult = {
    id,
    topic,
    evidence,
    advisors,
    synth,
    agreement_pct,
    full_trace_url: `/council/ten/${id}`,
    duration_ms: Date.now() - start,
    errors,
  }

  // Persist trace 30 days.
  if (kv) {
    try {
      await kv.put(`council_of_ten:trace:${id}`, JSON.stringify(result), {
        expirationTtl: 30 * 24 * 3600,
      })
    } catch (err: any) {
      errors.push(`kv_persist_failed:${String(err?.message ?? err).slice(0, 100)}`)
    }
  }

  return result
}

export async function readCouncilTrace(kv: KVNamespace, id: string): Promise<CouncilOfTenResult | null> {
  try {
    const raw = await kv.get(`council_of_ten:trace:${id}`)
    if (!raw) return null
    return JSON.parse(raw) as CouncilOfTenResult
  } catch {
    return null
  }
}
