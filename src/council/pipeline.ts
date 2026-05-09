import { callNao44, ImageInput } from './nao44'
import { callMistral } from './mistral'
import { callMinimax } from './minimax'
import { callMinouch } from './minouch'
import { ComposioMCP } from '../tools/composio'
import { researchWeb } from '../tools/research'
import { normalizeForCache } from '../util/filters'
import { postCouncilSummary } from '../notify/slack_channels'
// Research transport: Cloudflare-only. OpenRouter dropped from the fleet 2026-05-07.
// research.ts now uses Workers AI (LLM) + Composio search tools for live web facts.

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

export interface VoiceSignal {
  energy?: number
  energy_peak?: number
  pitch_hz?: number
  duration_ms?: number
}

export async function councilPipeline(
  input: string,
  env: any,
  kv: KVNamespace,
  db: D1Database,
  image?: ImageInput | null,
  voiceSignal?: VoiceSignal | null
): Promise<CouncilResult> {
  const id = crypto.randomUUID()
  const start = Date.now()
  const steps: CouncilStep[] = []

  // Load user context from KV — Context DO writes a fresh summary here every 10min.
  // Falls back to static context if Context DO hasn't run yet.
  const contextSummary = await kv.get('user:context')
  const contextBlobRaw = await kv.get('context:blob')
  let userContext = 'Naoufal. Builder. In Thailand. Building nao_00.'
  if (contextSummary) {
    userContext = contextSummary
    // Enrich with recent email subjects and calendar if available
    if (contextBlobRaw) {
      try {
        const blob = JSON.parse(contextBlobRaw)
        const emailHints = (blob.gmail || []).slice(0, 5).map((e: any) => e.subject).join('; ')
        const calHints = (blob.calendar || []).slice(0, 3).map((e: any) => e.summary).join('; ')
        if (emailHints) userContext += ` recent_emails=[${emailHints}]`
        if (calHints) userContext += ` today_calendar=[${calHints}]`
      } catch {}
    }
  }

  // Check skill cache — skip council if known answer.
  // Images bypass the cache entirely: each picture is unique, caching it would
  // serve a stale text answer to a fresh visual.
  // The cache key MUST go through normalizeForCache so smoke-test floods that
  // include "(ref-XXXX-XXXXXX)" markers collapse onto the same row that the
  // extractor wrote on the first probe. Otherwise every probe is a write-only
  // miss and the hit ratio never climbs.
  const normalizedKey = normalizeForCache(input)
  const cacheKey = `skill:${normalizedKey}`
  const cached = !image && normalizedKey ? await kv.get(cacheKey) : null
  if (cached) {
    const parsed = JSON.parse(cached)
    const dur = Date.now() - start
    const cacheStep = { advisor: 'cache', response: 'Cached skill hit', confidence: parsed.confidence, duration_ms: dur }
    // Persist cache-hit conversations so they show in history and feed the KPI counters.
    const nowIso = new Date().toISOString()
    await db.prepare('INSERT INTO conversations (id, input, final_output, created_at) VALUES (?, ?, ?, ?)').bind(id, input, parsed.answer, nowIso).run()
    await db.prepare('INSERT INTO council_steps (conversation_id, step_order, advisor_name, response, confidence, duration_ms) VALUES (?, ?, ?, ?, ?, ?)').bind(id, 0, 'cache', cacheStep.response, cacheStep.confidence, cacheStep.duration_ms).run()
    // Bump the matched skill's used_count so we know which cached answers actually pay off.
    await db.prepare('UPDATE skills SET used_count = used_count + 1 WHERE pattern = ?').bind(normalizedKey).run()
    // Fire-and-forget Slack mirror to #council. Errors swallowed — the council
    // result must not depend on Slack reachability.
    postCouncilSummary(env, id, input, parsed.answer, dur, true).catch(() => {})
    return { id, input, final_output: parsed.answer, council_steps: [cacheStep], duration_ms: dur }
  }

  // Step 1: nao44 (Opus) — knows Nao, filters for best interest
  const nao44Start = Date.now()
  const nao44Response = await callNao44(input, userContext, env.ANTHROPIC_API_KEY, db, image, voiceSignal)
  // Surface the paralinguistic input as a council step so we can audit it later.
  if (voiceSignal) {
    steps.push({
      advisor: 'voice_signal',
      response: JSON.stringify(voiceSignal),
      confidence: 0.6,
      duration_ms: 0
    })
  }
  if (image) {
    steps.push({
      advisor: 'vision',
      response: `image attached (${image.media_type}, ${image.base64.length} b64 chars) — nao44 saw it directly via Anthropic Vision`,
      confidence: 1,
      duration_ms: 0
    })
  }
  steps.push({
    advisor: 'nao44',
    response: nao44Response.opinion,
    confidence: nao44Response.confidence,
    duration_ms: Date.now() - nao44Start
  })

  // Step 1.5: Tool execution — if nao44 emitted a tool_call, run it.
  // RESEARCH_WEB → OpenRouter perplexity/sonar (live web research).
  // Anything else → Composio MCP (982 tools across gmail, slack, github, etc).
  // Result becomes a step Mistral and Minouch can both see.
  //
  // For multimodal turns, seed toolSummary with the vision evidence so Mistral
  // (text-only) doesn't accuse nao44 of hallucinating the picture.
  let toolSummary = image
    ? `vision=ok nao44 was given a real ${image.media_type} image (${image.base64.length} b64 chars); its visual claims are evidence, not invention`
    : '[no tool used]'
  if (nao44Response.tool_call && nao44Response.tool_call.name) {
    const toolStart = Date.now()
    const tc = nao44Response.tool_call
    const argsStr = JSON.stringify(tc.args ?? {}).slice(0, 300)

    if (tc.name === 'RESEARCH_WEB' && env.COMPOSIO_API_KEY) {
      try {
        const query = String(tc.args?.query ?? input).slice(0, 500)
        const r = await researchWeb(query, env.COMPOSIO_API_KEY, env.AI, db)
        const cites = r.citations.length ? ` citations=${r.citations.join(', ')}` : ''
        toolSummary = `tool=RESEARCH_WEB args=${argsStr} result=${r.answer.slice(0, 3500)}${cites}`
        steps.push({ advisor: 'tool', response: toolSummary, confidence: 0.9, duration_ms: Date.now() - toolStart })
      } catch (err: any) {
        toolSummary = `tool=RESEARCH_WEB args=${argsStr} OUTCOME=EXCEPTION reason=${String(err?.message ?? err).slice(0, 300)}`
        steps.push({ advisor: 'tool', response: toolSummary, confidence: 0, duration_ms: Date.now() - toolStart })
      }
    } else if (env.COMPOSIO_API_KEY) {
      try {
      const mcp = new ComposioMCP(env.COMPOSIO_API_KEY)
      const result = await mcp.callTool(tc.name, tc.args ?? {})
      const text = (result.content || [])
        .map((c: any) => c.text ?? (c.data ? JSON.stringify(c.data) : ''))
        .join('\n')

      // Composio wraps real outcomes inside content[].text as JSON. The MCP envelope
      // can say isError=false even when the underlying tool failed. We parse the
      // inner JSON and check for the documented failure signals: top-level error,
      // successful=false, or any per-tool result.successful=false.
      let outcome: 'ok' | 'tool_error' | 'mcp_error' = result.isError ? 'mcp_error' : 'ok'
      let errorReason: string | null = null
      try {
        const parsed = JSON.parse(text)
        if (parsed?.error) {
          outcome = 'tool_error'
          errorReason = String(parsed.error).slice(0, 300)
        } else if (parsed?.data?.error) {
          outcome = 'tool_error'
          errorReason = String(parsed.data.error).slice(0, 300)
        } else if (parsed?.successful === false) {
          outcome = 'tool_error'
          errorReason = String(parsed.message || parsed.error || 'tool reported successful:false').slice(0, 300)
        } else {
          const inner = parsed?.data?.results
          if (Array.isArray(inner)) {
            const failed = inner.find((r: any) => r?.response?.successful === false || r?.successful === false)
            if (failed) {
              outcome = 'tool_error'
              errorReason = String(failed.response?.error || failed.error || 'sub-tool failed').slice(0, 300)
            }
          }
        }
      } catch { /* not JSON — accept as raw text */ }

      const truncated = text.slice(0, 4000) || '[empty]'
      if (outcome === 'ok') {
        toolSummary = `tool=${tc.name} args=${argsStr} result=${truncated}`
      } else {
        toolSummary = `tool=${tc.name} args=${argsStr} OUTCOME=${outcome.toUpperCase()} reason=${errorReason ?? 'unknown'} raw=${truncated}`
      }
      const confidence = outcome === 'ok' ? 0.9 : (outcome === 'tool_error' ? 0.1 : 0)
      steps.push({
        advisor: 'tool',
        response: toolSummary,
        confidence,
        duration_ms: Date.now() - toolStart
      })
    } catch (err: any) {
      toolSummary = `tool=${tc.name} args=${argsStr} OUTCOME=MCP_EXCEPTION reason=${String(err?.message ?? err).slice(0, 300)}`
      steps.push({
        advisor: 'tool',
        response: toolSummary,
        confidence: 0,
        duration_ms: Date.now() - toolStart
      })
    }
    }
  }

  // Step 2: Mistral + MiniMax in PARALLEL — two reasoning challengers, one round-trip of latency.
  // Mistral = fast structured logic check. MiniMax-M2.7 = frontier reasoning challenger (added 2026-05-08).
  // (Grok dropped from council 2026-05-07 — redirected to revenue use cases, not council)
  const reasonStart = Date.now()
  const [mistralResponse, minimaxResponse] = await Promise.all([
    callMistral(input, nao44Response.opinion, toolSummary, env.MISTRAL_API_KEY, db),
    callMinimax(input, nao44Response.opinion, toolSummary, env.MINIMAX_API_KEY, db)
  ])
  const reasonDuration = Date.now() - reasonStart
  steps.push({
    advisor: 'mistral',
    response: JSON.stringify(mistralResponse.verdict),
    confidence: mistralResponse.confidence,
    duration_ms: reasonDuration
  })
  if (minimaxResponse) {
    steps.push({
      advisor: 'minimax',
      response: JSON.stringify(minimaxResponse),
      confidence: minimaxResponse.confidence,
      duration_ms: reasonDuration
    })
  }

  // Step 4: Minouch (Haiku) — warm delivery
  const minouchStart = Date.now()
  const finalAnswer = await callMinouch(input, steps, env.ANTHROPIC_API_KEY, db)
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

  // Fire-and-forget mirror to #council Slack channel. Doesn't block the response.
  postCouncilSummary(env, id, input, finalAnswer, result.duration_ms, false).catch(() => {})

  return result
}
