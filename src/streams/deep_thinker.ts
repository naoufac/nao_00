// deep_thinker — picks a curated meaty prompt and runs Opus 4.7 with adaptive
// thinking + xhigh effort + a generous task_budget, streaming. Designed to be
// the highest-token-per-call stream we have. Every run burns 20k-60k tokens.
//
// 24 runs/day x ~30k tokens = ~720k tokens/day from this stream alone, dwarfing
// the rest of the system. Pillar metric: this is the engine.

import { recordUsage, anthropicUsage } from '../metrics/api-use'

export interface DeepThinkerEnv {
  ANTHROPIC_API_KEY: string
  KV: KVNamespace
}

// Curated prompts that benefit from extended reasoning. Mix:
// - long-horizon strategy on Naoufal's projects (gab44, council, nao_00)
// - meaty technical questions (architecture, optimization, market analysis)
// - synthesis prompts that require stepping back and looking at the system
const DEEP_PROMPTS: { topic: string; prompt: string }[] = [
  {
    topic: 'gab44_growth_strategy',
    prompt:
      "Naoufal's gab44 is a personal astrology brand on Telegram + YouTube + Helio + Gumroad with mobile apps deferred until traction. Daily horoscope posts are running. What is the highest-leverage single move he could make in the next 30 days to hit first $1k MRR? Think through 3-5 candidate moves, score each on (effort, impact, time-to-revenue, defensibility), and recommend the one move plus a one-week execution plan.",
  },
  {
    topic: 'council_v3_architecture',
    prompt:
      "The current nao_00 council is nao44 (Opus 4.7) → mistral || minimax → minouch (Haiku 4.5). It works but every voice query takes ~10s. Sketch a v3 architecture that cuts p50 latency to under 4s while preserving the warmth of the final voice. Consider: parallelism, speculative execution, prompt caching strategies, model routing by query class, streaming the first audible chunk early. Walk through the design, the migration path, and the failure modes.",
  },
  {
    topic: 'multi_brand_engine',
    prompt:
      "Naoufal has Vehea (employer), Coda (Vehea's client), and gab44 (his brand). The nao_00 system serves all three but needs to clearly separate identity, voice, audience, and content streams per brand. Design the data model and the routing layer. What goes in shared infra? What MUST stay per-brand? How does an agent know which brand it's currently acting on? Be specific — table schemas, routing rules, brand-config shape.",
  },
  {
    topic: 'pillar_metric_compounding',
    prompt:
      "API usage is the pillar metric for nao_00 — Naoufal wants 90-100% utilization. List 10 concrete patterns for compounding API usage growth (more usage drives MORE usage rather than just spending the budget once). For each: the mechanism, an example implementation, the failure mode that flatlines it. Rank them by how compounding the loop is.",
  },
  {
    topic: 'youtube_gab44_topology',
    prompt:
      "gab44 has 3 connected YouTube accounts and a default channel. Healing Sounds has 5 meditation videos staged but unpublished. Astrology daily horoscopes are text-only. Design the YouTube content pipeline: what posts where, what cross-posts vs originals, what's automated vs human-touch, what success metrics fan back into the council. Specific cadence per channel for the next 90 days.",
  },
  {
    topic: 'memory_growth',
    prompt:
      "nao_00's auto-improve loop rewrites user:context KV every 15 turns. The skill cache stores Q->A pairs in D1+KV. Coverage_expander backfills missing topics. Sketch the next layer: episodic memory (specific past conversations Naoufal might want recalled by content). What's the index? How is it queried during a council step? What goes in the durable object vs KV vs D1? What's the eviction policy? What's the privacy model when other agents use the council?",
  },
  {
    topic: 'risk_audit',
    prompt:
      "Audit the nao_00 system for the 5 highest-risk failure modes that could either (a) lose Naoufal's data, (b) generate a public embarrassment, (c) leak credentials, or (d) cause a runaway cost spike. For each: the trigger, the blast radius, the existing safeguard (or lack), and the cheapest hardening that would make it survivable.",
  },
  {
    topic: 'cross_agent_protocol',
    prompt:
      "Anouf (Hetzner), Jasmine (DO builder), Nemoclaw (DO monitor), Mayor (Toronto) are agents running on separate hosts. Today they coordinate via SSH and shared dashboard. Design a proper inter-agent message protocol: what messages exist, transport, ordering guarantees, idempotency, who's the source of truth, how a new agent joins, how a failed agent is detected and handled. Specific enough that I could implement it in the next session.",
  },
  {
    topic: 'voice_paralinguistic_v2',
    prompt:
      "The voice path captures energy, pitch_hz, and duration_ms today and feeds them as a paralinguistic cue to nao44. What other paralinguistic signals would meaningfully improve the council's responses (without being creepy)? For each: how to extract it, how to feed it to the council, what behavior change it should produce, and how to measure that the change is actually improving outcomes for Naoufal.",
  },
  {
    topic: 'stream_strategy',
    prompt:
      "nao_00 currently has 5 streams: horoscope_warmer, proactive_insight, auto_drafter, engagement_digest, coverage_expander. Each runs on cron. What is the second-order economics of streams — why does adding more streams keep paying off, where does the curve flatten, what's the right meta-policy for deciding whether to add stream N+1? Propose 3 streams that aren't built yet and rank them.",
  },
  {
    topic: 'naoufal_taste_modeling',
    prompt:
      "The auto-improve loop captures Naoufal's preferences via memory entries. But TASTE is harder than preferences — what tone he likes, what kind of cleverness, what palette, what register. Sketch a 'taste profile' for Naoufal based on what's already in CLAUDE.md and the memory directory. Then describe how the council should USE the taste profile differently from the preferences profile during a response.",
  },
  {
    topic: 'cost_per_outcome',
    prompt:
      "The pillar metric is API usage UP. The counter-balance metric is value-per-token: are we burning tokens that produce real outcomes for Naoufal, or just feeding the meter? Define value-per-token operationally. List 5 leading indicators and 5 lagging indicators. For each, where would the data live, how would the council see it, how would it influence future calls? Be concrete enough to wire it.",
  },
]

const ROTATION_KEY = 'deep_thinker:rotation'

async function ensureTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS streams_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT, name TEXT, ok INTEGER, count INTEGER, duration_ms INTEGER, error TEXT
    )`
    )
    .run()
}

async function pickPrompt(kv: KVNamespace): Promise<{ topic: string; prompt: string; index: number }> {
  let idx = 0
  try {
    const raw = await kv.get(ROTATION_KEY)
    if (raw) idx = parseInt(raw, 10) || 0
  } catch {
    idx = 0
  }
  const sel = DEEP_PROMPTS[idx % DEEP_PROMPTS.length]
  try {
    await kv.put(ROTATION_KEY, String(idx + 1))
  } catch {
    /* swallow */
  }
  return { topic: sel.topic, prompt: sel.prompt, index: idx }
}

// Parse SSE message stream. Accumulate text deltas, thinking summary deltas,
// and capture final usage from the message_delta event.
async function consumeStream(
  body: ReadableStream<Uint8Array>
): Promise<{ text: string; thinking: string; usage: any; stop_reason?: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let thinking = ''
  let usage: any = {}
  let stop_reason: string | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? '' // keep partial line
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      let evt: any
      try {
        evt = JSON.parse(payload)
      } catch {
        continue
      }
      if (evt.type === 'content_block_delta') {
        const d = evt.delta
        if (d?.type === 'text_delta' && typeof d.text === 'string') text += d.text
        else if (d?.type === 'thinking_delta' && typeof d.thinking === 'string') thinking += d.thinking
      } else if (evt.type === 'message_delta') {
        if (evt.delta?.stop_reason) stop_reason = evt.delta.stop_reason
        if (evt.usage) usage = { ...usage, ...evt.usage }
      } else if (evt.type === 'message_start' && evt.message?.usage) {
        usage = { ...usage, ...evt.message.usage }
      }
    }
  }
  return { text, thinking, usage, stop_reason }
}

const SYSTEM_PROMPT = `You are nao44 in deep-think mode — Naoufal's strategist running offline. You have time and budget. Use them.

# Who Naoufal is
- Builder. In Thailand. Day-job at Vehea, side-brand gab44 (astrology), client Coda.
- Mission: build nao_00 — his personal AI council — into a system that grows itself. API usage up = system health.
- Tone he wants: warm, cheerful, never corporate. Don't pitch admin/money moves unless asked.

# Your job in deep-think mode
- The prompt is a question that benefits from real reasoning. Take the time. Use thinking.
- Be specific. Be concrete. Numbers, names, file paths, schemas, cadences — not vibes.
- Disagree with the framing of the question if the question is asking the wrong thing.
- Output a structured response: a short top-line conclusion, then the reasoning, then the next 3 concrete actions.

# Output format
1. **Top-line:** one sentence — the answer.
2. **Reasoning:** 3-8 paragraphs — why, with the tradeoffs that mattered.
3. **Next 3 actions:** numbered list — exactly 3, each one a thing Anouf could do in the next session.`

export async function runDeepThinker(env: DeepThinkerEnv, db: D1Database) {
  const started = Date.now()
  await ensureTable(db)

  const { topic, prompt, index } = await pickPrompt(env.KV)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'task-budgets-2026-03-13',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 32000,
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: {
          effort: 'xhigh',
          task_budget: { type: 'tokens', total: 80000 },
        },
        stream: true,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`anthropic ${res.status}: ${errBody.slice(0, 400)}`)
    }

    const { text, thinking, usage, stop_reason } = await consumeStream(res.body)

    if (!text && !thinking) {
      throw new Error(`empty response (stop_reason=${stop_reason ?? 'unknown'})`)
    }

    const duration_ms = Date.now() - started
    const ts = new Date().toISOString()

    // Persist latest deep-thought + capped history.
    const blob = JSON.stringify({
      ts,
      topic,
      prompt,
      response: text,
      thinking_summary: thinking,
      stop_reason,
      usage,
      duration_ms,
    })
    await Promise.all([
      env.KV.put('deep_thinker:latest:json', blob, { expirationTtl: 60 * 60 * 24 * 30 }),
      env.KV.put('deep_thinker:latest', text.slice(0, 600), { expirationTtl: 60 * 60 * 24 * 30 }),
      env.KV.put(`deep_thinker:history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 90 }),
    ])

    // History rotation index
    try {
      let history: { ts: string; topic: string; preview: string; tokens: number }[] = []
      const raw = await env.KV.get('deep_thinker:history:json')
      if (raw) history = JSON.parse(raw)
      const totalTokens =
        (usage?.input_tokens || 0) +
        (usage?.output_tokens || 0) +
        (usage?.cache_read_input_tokens || 0) +
        (usage?.cache_creation_input_tokens || 0)
      history.unshift({
        ts,
        topic,
        preview: text.slice(0, 100),
        tokens: totalTokens,
      })
      if (history.length > 30) history = history.slice(0, 30)
      await env.KV.put('deep_thinker:history:json', JSON.stringify(history))
    } catch {
      /* swallow */
    }

    // Pillar-metric record. Uses the same anthropicUsage shape.
    try {
      const u = anthropicUsage({ usage })
      await recordUsage(db, {
        source: 'deep_thinker',
        model: 'claude-opus-4-7',
        input_tokens: u.input,
        output_tokens: u.output,
        cache_read_tokens: u.cache_read,
        cache_create_tokens: u.cache_create,
        duration_ms,
      })
    } catch {
      /* never block on telemetry */
    }

    await db
      .prepare(
        'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(ts, 'deep_thinker', 1, 1, duration_ms, null)
      .run()

    return {
      ok: true as const,
      topic,
      rotation_index: index,
      output_tokens: usage?.output_tokens ?? 0,
      input_tokens: usage?.input_tokens ?? 0,
      cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
      stop_reason,
      preview: text.slice(0, 240),
      duration_ms,
    }
  } catch (e: any) {
    const duration_ms = Date.now() - started
    const error = e?.message || String(e)
    try {
      await db
        .prepare(
          'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(new Date().toISOString(), 'deep_thinker', 0, 0, duration_ms, error)
        .run()
    } catch {
      /* swallow */
    }
    return { ok: false as const, topic, rotation_index: index, error, duration_ms }
  }
}
