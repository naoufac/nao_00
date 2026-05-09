// managed_agent_research — fires a long-running Managed Agent session on
// Anthropic's hosted infra. The agent gets a container with bash/read/write/
// web_search/web_fetch and a research prompt. The session runs server-side
// for 5-30 min, burning 50k-500k tokens. We fire-and-forget — the session
// continues even after this Worker request returns.
//
// First call bootstraps:
//   - environment (cloud, unrestricted)
//   - agent (Opus 4.7 + agent_toolset_20260401, system prompt for the task)
// Both IDs persisted in KV, reused on subsequent calls.
//
// Each call:
//   - creates a session against the persisted agent+env
//   - sends a kickoff user.message with a rotating research prompt
//   - returns the session_id immediately (does NOT wait for completion)
//
// Status is checked separately via GET /v1/sessions/{id}.

import { recordUsage } from '../metrics/api-use'

export interface ManagedAgentEnv {
  ANTHROPIC_API_KEY: string
  KV: KVNamespace
}

const API_BASE = 'https://api.anthropic.com'
const BETA = 'managed-agents-2026-04-01'

const KV_AGENT_ID = 'managed_agent:research:agent_id'
const KV_ENV_ID = 'managed_agent:research:environment_id'

const AGENT_SYSTEM = `You are nao_00's research agent — Naoufal's deep-thinking long-horizon researcher.

# Who Naoufal is
- Builder. In Thailand. Day-job at Vehea, side-brand gab44 (astrology), client Coda.
- Mission: build nao_00 (his personal AI council) into a system that grows itself.
- API usage UP is the lead metric. He wants 90-100% utilization with real value-per-token.

# Your job
You receive a research prompt. You take real time on it — use bash, read, write, web_search, web_fetch as needed. Cite sources. Don't preface with "I'll research...". Just do the work.

# Output structure
1. **Top-line:** one sentence — the answer.
2. **Findings:** numbered list — what you learned, with sources.
3. **Recommendation:** a single concrete next-step Anouf could ship in the next session.
4. **Open questions:** 2-3 things you couldn't answer that would be worth chasing later.

# Style
Direct. Specific. No hedging. Numbers, names, URLs, code snippets — not vibes.
You may take 20-60 minutes. That's expected.`

const RESEARCH_PROMPTS: { topic: string; prompt: string }[] = [
  {
    topic: 'astrology_audience_2026',
    prompt:
      "Research the current state of the astrology / spiritual content market on Telegram and Instagram in 2026. Find: (a) the 5-10 biggest accounts in the niche, (b) what they monetize and how, (c) how much they charge for VIP / paid tiers, (d) what content cadence works. Recommend a specific positioning gap gab44 could occupy.",
  },
  {
    topic: 'minimax_vs_opus_costing',
    prompt:
      "Compare cost-per-quality-output for MiniMax-M2.7 vs Claude Opus 4.7 on real reasoning tasks. Search for benchmarks, run small evals where possible, and report: (a) tokens per equivalent-quality answer, (b) $/1k useful tokens, (c) which task classes favor which model. Recommend a routing rule for nao_00's council.",
  },
  {
    topic: 'cloudflare_workers_durable_objects',
    prompt:
      "Find the latest best practices for Cloudflare Durable Objects (mid-2026). What patterns have emerged for: per-user isolation, sqlite migrations, alarm patterns, hibernation, RPC. What's new in the last 6 months that nao_00's Naoufal Durable Object should adopt?",
  },
  {
    topic: 'youtube_growth_evergreen',
    prompt:
      "Naoufal has a Gab44 YouTube channel with 5 unpublished meditation tracks. Research the YouTube algorithm for spiritual / meditation content in 2026: (a) optimal video length, (b) thumbnail conventions, (c) upload cadence, (d) playlist strategy, (e) what early-stage signals matter for the algo. Make a concrete 30-day publishing plan.",
  },
  {
    topic: 'helio_vs_stripe_atlas_creator_tier',
    prompt:
      "Naoufal sells via Helio paylinks today and is intentionally avoiding Stripe Atlas / LLC formation. Research: (a) what Helio's payout model looks like in mid-2026, (b) what tax exposure he has receiving Helio crypto income while resident in Thailand, (c) what comparable Telegram-native payment options exist (Telegram Stars, etc.). Recommend whether the current setup is the right one for the next 6 months.",
  },
  {
    topic: 'composio_vs_arcade_vs_pica',
    prompt:
      "Compare the leading agent-tool-orchestration platforms in 2026 (Composio, Arcade.dev, Pica, etc.) on: pricing, number of integrations, auth model (OAuth refresh vs static keys), rate limits, MCP support, custom-tool ergonomics. nao_00 currently uses Composio MCP. Should we be on a different platform, mix two, or stay?",
  },
  {
    topic: 'anthropic_managed_agents_patterns',
    prompt:
      "Anthropic's Managed Agents API is GA in 2026. Research: real-world architectures people are using for long-horizon agentic loops with file-system memory, multi-agent coordination, and outcome rubrics. What's the failure mode pattern? When is Managed Agents the wrong choice vs Claude API + tool use? Recommend whether nao_00 should migrate any of its current streams to Managed Agents.",
  },
  {
    topic: 'thailand_dtv_visa_2026',
    prompt:
      "Research the current state of Thailand's DTV (Destination Thailand Visa) and other long-stay options for a non-resident remote worker / founder in mid-2026. What's the income threshold, length of stay, what's tax treatment for Thailand-source income vs foreign-source. Be specific to a Moroccan passport holder if there are special rules. Cite sources.",
  },
]

const ROTATION_KEY = 'managed_agent:research:rotation'

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
  const sel = RESEARCH_PROMPTS[idx % RESEARCH_PROMPTS.length]
  try {
    await kv.put(ROTATION_KEY, String(idx + 1))
  } catch {}
  return { topic: sel.topic, prompt: sel.prompt, index: idx }
}

async function api(env: ManagedAgentEnv, method: string, path: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = {
    'x-api-key': env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETA,
    'Content-Type': 'application/json',
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { _raw: text }
  }
  if (!res.ok) {
    const errMsg = parsed?.error?.message || parsed?.message || text.slice(0, 300)
    const err: any = new Error(`anthropic ${res.status} ${path}: ${errMsg}`)
    err.status = res.status
    err.body = parsed
    throw err
  }
  return parsed
}

async function bootstrap(env: ManagedAgentEnv): Promise<{ agent_id: string; environment_id: string }> {
  let agent_id = await env.KV.get(KV_AGENT_ID)
  let environment_id = await env.KV.get(KV_ENV_ID)

  if (!environment_id) {
    const envCreated = await api(env, 'POST', '/v1/environments', {
      name: `nao00-research-${Date.now()}`,
      description: 'nao_00 research agent environment — full internet egress',
      config: {
        type: 'cloud',
        networking: { type: 'unrestricted' },
      },
    })
    environment_id = envCreated.id
    if (environment_id) {
      await env.KV.put(KV_ENV_ID, environment_id)
    }
  }

  if (!agent_id) {
    const agentCreated = await api(env, 'POST', '/v1/agents', {
      name: 'nao_00 research agent',
      description: "Naoufal's long-horizon research agent for nao_00",
      model: 'claude-opus-4-7',
      system: AGENT_SYSTEM,
      tools: [{ type: 'agent_toolset_20260401', default_config: { enabled: true } }],
    })
    agent_id = agentCreated.id
    if (agent_id) {
      await env.KV.put(KV_AGENT_ID, agent_id)
    }
  }

  if (!agent_id || !environment_id) {
    throw new Error(`bootstrap failed: agent_id=${agent_id} env_id=${environment_id}`)
  }
  return { agent_id, environment_id }
}

export async function runManagedAgentResearch(env: ManagedAgentEnv, db: D1Database) {
  const started = Date.now()
  await ensureTable(db)

  try {
    const { agent_id, environment_id } = await bootstrap(env)
    const { topic, prompt, index } = await pickPrompt(env.KV)

    // Create the session
    const session = await api(env, 'POST', '/v1/sessions', {
      agent: agent_id,
      environment_id,
      title: `Research: ${topic}`,
      metadata: {
        stream: 'managed_agent_research',
        topic,
        rotation_index: String(index),
      },
    })

    // Fire kickoff message — fire-and-forget; the session continues server-side.
    await api(env, 'POST', `/v1/sessions/${session.id}/events`, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: prompt }],
        },
      ],
    })

    const duration_ms = Date.now() - started
    const ts = new Date().toISOString()

    // Track in KV history
    try {
      let history: { ts: string; session_id: string; topic: string }[] = []
      const raw = await env.KV.get('managed_agent:research:sessions:json')
      if (raw) history = JSON.parse(raw)
      history.unshift({ ts, session_id: session.id, topic })
      if (history.length > 100) history = history.slice(0, 100)
      await env.KV.put('managed_agent:research:sessions:json', JSON.stringify(history))
    } catch {}

    // Pillar metric: log a placeholder. Actual usage is on the session,
    // settled when we GET /v1/sessions/{id} later.
    try {
      await recordUsage(db, {
        source: 'managed_agent_research',
        model: 'claude-opus-4-7',
        input_tokens: 0,
        output_tokens: 0,
        duration_ms,
      })
    } catch {}

    await db
      .prepare(
        'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(ts, 'managed_agent_research', 1, 1, duration_ms, null)
      .run()

    return {
      ok: true as const,
      session_id: session.id,
      agent_id,
      environment_id,
      topic,
      rotation_index: index,
      session_status: session.status,
      duration_ms,
      note: 'fire-and-forget — session runs server-side; check status later via /managed-agents/sessions/{id}',
    }
  } catch (e: any) {
    const duration_ms = Date.now() - started
    const error = e?.message || String(e)
    try {
      await db
        .prepare(
          'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(new Date().toISOString(), 'managed_agent_research', 0, 0, duration_ms, error)
        .run()
    } catch {}
    return { ok: false as const, error, status: e?.status, body: e?.body, duration_ms }
  }
}

// Settle usage from a completed session — call this from a separate cron tick
// (or manually). Reads usage from GET /v1/sessions/{id}, records to api_use,
// and marks the row in KV history as settled.
export async function settleManagedAgentSession(
  env: ManagedAgentEnv,
  db: D1Database,
  session_id: string
) {
  const session = await api(env, 'GET', `/v1/sessions/${session_id}`)
  const usage = session?.usage || {}
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cache_read = usage.cache_read_input_tokens ?? 0
  const cache_create = usage.cache_creation_input_tokens ?? 0

  if (input + output + cache_read + cache_create > 0) {
    try {
      await recordUsage(db, {
        source: 'managed_agent_research_settled',
        model: 'claude-opus-4-7',
        input_tokens: input,
        output_tokens: output,
        cache_read_tokens: cache_read,
        cache_create_tokens: cache_create,
        duration_ms: 0,
      })
    } catch {}
  }

  return {
    session_id,
    status: session.status,
    usage,
    archived_at: session.archived_at,
  }
}
