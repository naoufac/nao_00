// Tool Router — pick the right lane + tool for a task.
//
// "this and that" — we race TWO judges in parallel:
//   A. Opus 4.7 (deep reasoning, slower, costs more)
//   B. MiniMax-M2.7 (frontier reasoning, faster, free-tier coding-plan)
//
// Whichever returns a valid JSON decision FIRST wins. The other call is
// allowed to finish (we don't abort) but its result is shadow-logged for
// scoring — over time we'll know which judge is faster + better and can
// retire the slower one or shift weight.
//
// Result is cached in KV by normalize(task) for 1h. So a second identical
// task in the same window is free.
//
// Lanes are deliberately enumerated — the LLM cannot invent new lanes,
// only pick from this list. Slug existence is verified for `composio`
// against the known-active set; for `model` against a hard allowlist.

import { recordUsage, anthropicUsage } from '../metrics/api-use'

export type Lane =
  | 'composio'        // 982 tools (gmail, slack, github, calendar, drive, ...)
  | 'model'           // direct LLM call (no tools, just thinking)
  | 'managed_agent'   // Anthropic Managed Agent (deep web research)
  | 'gmi_gpu'         // GMI Cloud H100/H200 for custom compute
  | 'playwright'      // headless browser via Anouf validator container
  | 'postiz'          // social media fan-out
  | 'onesignal'       // phone push (≤5/day budget)
  | 'council_of_ten'  // 8-advisor parallel deep-reasoning lane with you.com research
  | 'noop'            // no tool needed; the task is pure conversation

const LANES: Lane[] = ['composio', 'model', 'managed_agent', 'gmi_gpu', 'playwright', 'postiz', 'onesignal', 'council_of_ten', 'noop']

// Trigger words that ALWAYS escalate to the council_of_ten lane regardless of
// the LLM judges' picks. "decide" / "should I" / "compare" / "research" /
// "council" / "deep think" / "ten". Also escalate when the routed confidence
// is below 0.7 — the council is the high-stakes safety net.
const COUNCIL_TRIGGER_RE = /\b(decide|should\s+(?:i|we)|which\s+is\s+better|compare|research|council|deep\s+think|ten\s+advisors?)\b/i
const COUNCIL_CONFIDENCE_FLOOR = 0.7
export function shouldEscalateToCouncil(task: string, decision: { lane: Lane; confidence: number }): boolean {
  if (decision.lane === 'council_of_ten') return false   // already routed there
  if (decision.lane === 'noop') return false             // pure chitchat
  if (COUNCIL_TRIGGER_RE.test(task)) return true
  if (decision.confidence < COUNCIL_CONFIDENCE_FLOOR) return true
  return false
}

const MODEL_ALLOWLIST = [
  'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
  'gemini-2.5-pro', 'gemini-2.5-flash',
  'MiniMax-M2.7',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  'nvidia/llama-3.3-nemotron-super-49b-v1',
]

export interface RouteDecision {
  lane: Lane
  tool: string          // composio slug, model id, etc. Empty for noop.
  args: any             // arguments object (LLM may leave gaps for the orchestrator to fill)
  reason: string        // ≤200 chars why this lane
  confidence: number    // 0..1
  decided_by: 'opus' | 'minimax' | 'fallback' | 'cache'
  decided_in_ms: number
  shadow?: { decided_by: 'opus' | 'minimax'; lane: Lane; tool: string; agreed: boolean }
}

const ROUTER_SYSTEM_PROMPT = `You are the Tool Router for nao_00 — Naoufal's personal AI council. Given a task, pick the BEST lane + tool from a fixed list. Output STRICT JSON only, no prose.

Lanes (pick exactly one):
- "composio": for any external SaaS action (gmail, slack, github, calendar, drive, sheets, notion, linkedin, youtube, postiz)
- "model": pure thinking, summarization, drafting — no external tools needed
- "managed_agent": deep web research with citations (slow, expensive, use only when worth it)
- "gmi_gpu": custom compute on H100/H200 (very rare — only if user explicitly asks for GPU)
- "playwright": headless browser to render or screenshot a page
- "postiz": multi-platform social media post fan-out
- "onesignal": send a phone push notification to Naoufal (≤5/day budget — use sparingly)
- "council_of_ten": deep reasoning — fan-out you.com research + 8 model advisors + synthesizer. Use when the task says "decide", "should I", "compare", "which is better", "research", "council", or any high-stakes consequential decision.
- "noop": no tool needed; task is pure conversation, no world-state required

Common composio slugs (use exactly): GMAIL_SEND_EMAIL, GMAIL_FETCH_EMAILS, GMAIL_LIST_LABELS, GMAIL_REPLY_TO_THREAD, GOOGLECALENDAR_LIST_EVENTS, GOOGLECALENDAR_CREATE_EVENT, SLACK_SEND_MESSAGE, SLACK_FETCH_CONVERSATION_HISTORY, GITHUB_LIST_PULL_REQUESTS, GITHUB_CREATE_AN_ISSUE, GOOGLEDRIVE_FIND_FILE, GOOGLEDRIVE_CREATE_FILE_FROM_TEXT, NOTION_CREATE_PAGE, LINKEDIN_CREATE_LINKED_IN_POST, POSTIZ_MCP_INTEGRATIONSCHEDULEPOSTTOOL, COMPOSIO_SEARCH_TOOLS.

Output schema (JSON, no other text):
{"lane":"<lane>","tool":"<slug-or-empty>","args":{...},"reason":"<≤200 chars>","confidence":0.0}

Rules:
- If the task is ambiguous about what tool, set lane=composio tool=COMPOSIO_SEARCH_TOOLS args={"queries":["..."]} so the orchestrator can resolve it next step.
- Never invent tool slugs not in the list above. If unsure, use COMPOSIO_SEARCH_TOOLS.
- For "what's the weather", "who is X today", "latest news on Y" — use lane=managed_agent OR lane=composio tool=COMPOSIO_SEARCH_TOOLS args={"queries":["RESEARCH_WEB"]}.
- For "draft me an email", "summarize this", "what should I say" — use lane=model tool=claude-opus-4-7.
- confidence below 0.5 means "I'd actually want a human in the loop" — be honest.`

function normalizeTask(task: string): string {
  return task.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').slice(0, 200).trim()
}

function validateDecision(d: any): d is { lane: Lane; tool: string; args: any; reason: string; confidence: number } {
  if (!d || typeof d !== 'object') return false
  if (!LANES.includes(d.lane)) return false
  if (typeof d.tool !== 'string') return false
  if (typeof d.reason !== 'string') return false
  if (typeof d.confidence !== 'number') return false
  // Model-lane sanity: tool must be in allowlist
  if (d.lane === 'model' && d.tool && !MODEL_ALLOWLIST.includes(d.tool)) return false
  return true
}

async function callOpusJudge(task: string, env: any): Promise<any> {
  const start = Date.now()
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'extended-cache-ttl-2025-04-11',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',  // Haiku for routing — cheap; Opus reserved for council
      max_tokens: 400,
      system: [{ type: 'text', text: ROUTER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      messages: [{ role: 'user', content: `Task: ${task}\n\nOutput JSON decision.` }],
    }),
  })
  const data: any = await response.json()
  if (env.DB) {
    const u = anthropicUsage(data)
    await recordUsage(env.DB, {
      source: 'tool_router_haiku', model: 'claude-haiku-4-5-20251001',
      input_tokens: u.input, output_tokens: u.output,
      cache_read_tokens: u.cache_read, cache_create_tokens: u.cache_create,
      duration_ms: Date.now() - start,
    })
  }
  const text = data?.content?.[0]?.text || ''
  return tryParseJson(text)
}

async function callMinimaxJudge(task: string, env: any): Promise<any> {
  if (!env.MINIMAX_API_KEY) return null
  const start = Date.now()
  const response = await fetch('https://api.minimax.io/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      max_tokens: 400,
      system: ROUTER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Task: ${task}\n\nOutput JSON decision.` }],
    }),
  })
  const data: any = await response.json()
  if (data?.error) return null
  if (env.DB) {
    const u = anthropicUsage(data)
    await recordUsage(env.DB, {
      source: 'tool_router_minimax', model: 'MiniMax-M2.7',
      input_tokens: u.input, output_tokens: u.output,
      duration_ms: Date.now() - start,
    })
  }
  const blocks: any[] = data?.content || []
  const text = blocks.find(b => typeof b?.text === 'string' && b.text.trim().length > 0)?.text || ''
  return tryParseJson(text)
}

function tryParseJson(text: string): any {
  // Models sometimes wrap JSON in ```json ... ``` or prepend a sentence.
  const stripped = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  // Take the first {...} block we can find.
  const m = stripped.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

export async function route(task: string, env: any, kv?: KVNamespace): Promise<RouteDecision> {
  const start = Date.now()
  const normalized = normalizeTask(task)

  // Cache hit?
  if (kv && normalized) {
    const cached = await kv.get(`router:${normalized}`)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        return { ...parsed, decided_by: 'cache', decided_in_ms: Date.now() - start }
      } catch { /* fall through */ }
    }
  }

  // Race the two judges. Don't abort the loser — let it finish for shadow-log.
  const opusPromise = callOpusJudge(task, env).catch((e) => ({ __error: String(e) }))
  const minimaxPromise = callMinimaxJudge(task, env).catch((e) => ({ __error: String(e) }))

  // Helper: race-with-validation. We resolve as soon as ANY judge returns
  // a valid decision; if the first one back is malformed, wait for the next.
  type Tagged = { judge: 'opus' | 'minimax'; result: any }
  const taggedOpus: Promise<Tagged> = opusPromise.then(r => ({ judge: 'opus' as const, result: r }))
  const taggedMinimax: Promise<Tagged> = minimaxPromise.then(r => ({ judge: 'minimax' as const, result: r }))

  let winner: { decision: any; judge: 'opus' | 'minimax' } | null = null
  let loserPromise: Promise<Tagged> | null = null
  let firstResult: Tagged | null = null
  let secondResult: Tagged | null = null

  // Wait for first
  firstResult = await Promise.race([taggedOpus, taggedMinimax])
  if (firstResult.result && !firstResult.result.__error && validateDecision(firstResult.result)) {
    winner = { decision: firstResult.result, judge: firstResult.judge }
    loserPromise = firstResult.judge === 'opus' ? taggedMinimax : taggedOpus
  } else {
    // First was invalid — wait for the other
    loserPromise = firstResult.judge === 'opus' ? taggedMinimax : taggedOpus
    secondResult = await loserPromise
    if (secondResult.result && !secondResult.result.__error && validateDecision(secondResult.result)) {
      winner = { decision: secondResult.result, judge: secondResult.judge }
      loserPromise = null  // already consumed
    }
  }

  let decision: RouteDecision
  if (winner) {
    decision = {
      lane: winner.decision.lane,
      tool: winner.decision.tool || '',
      args: winner.decision.args ?? {},
      reason: String(winner.decision.reason ?? '').slice(0, 200),
      confidence: Number(winner.decision.confidence ?? 0.5),
      decided_by: winner.judge,
      decided_in_ms: Date.now() - start,
    }
    // Shadow-log the loser asynchronously — don't block the response.
    if (loserPromise) {
      loserPromise.then((r) => {
        if (r.result && !r.result.__error && validateDecision(r.result)) {
          const agreed = r.result.lane === decision.lane && r.result.tool === decision.tool
          // Best-effort write to KV for later analysis
          if (kv) {
            const stamp = Date.now()
            kv.put(`router:shadow:${stamp}`, JSON.stringify({
              task: task.slice(0, 200),
              winner: { judge: decision.decided_by, lane: decision.lane, tool: decision.tool },
              loser: { judge: r.judge, lane: r.result.lane, tool: r.result.tool },
              agreed,
            }), { expirationTtl: 7 * 24 * 3600 }).catch(() => {})
          }
        }
      }).catch(() => {})
    }
  } else {
    // Both judges failed — safe fallback
    decision = {
      lane: 'composio',
      tool: 'COMPOSIO_SEARCH_TOOLS',
      args: { queries: [task.slice(0, 200)] },
      reason: 'both judges failed; fall back to tool search',
      confidence: 0.3,
      decided_by: 'fallback',
      decided_in_ms: Date.now() - start,
    }
  }

  // Cache the decision (1h)
  if (kv && normalized && decision.decided_by !== 'fallback') {
    kv.put(`router:${normalized}`, JSON.stringify({
      lane: decision.lane,
      tool: decision.tool,
      args: decision.args,
      reason: decision.reason,
      confidence: decision.confidence,
    }), { expirationTtl: 3600 }).catch(() => {})
  }

  return decision
}
