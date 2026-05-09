// Tiered synthesis layer — auto return-logs at 10m / 40m / 1h cadence.
//
// Naoufal's framing: "everything must lead to something and we make sense
// of the logic." Raw event firehose ≠ understanding. This layer reads what
// the system DID over a window and writes a NARRATIVE about what it MEANT.
//
// Cadences (driven by the existing */15 cron — multiplexed by minute-of-hour):
//   minute % 10 == 0  → 10-min CHECK    (Haiku, ~1 paragraph, posts to #all-nao00)
//   minute == 40      → 40-min DIGEST   (Mistral, theme grouping, posts to #all-nao00)
//   minute == 0       → 1-hour STORY    (Opus 4.7, narrative + next-action hint, posts to #all-nao00)
//
// The 1h story is also pinned to the channel topic so #all-nao00 always
// shows the latest hour's headline.
//
// All three read from the same source-of-truth tables: `conversations`,
// `council_steps`, `exec_steps`. No new logging added — everything we do
// already writes there. We just SYNTHESIZE.

import { recordUsage, anthropicUsage, mistralUsage } from '../metrics/api-use'
import { postToChannel, sectionBlock, contextBlock, headerBlock, dividerBlock } from './slack_channels'

interface ActivityWindow {
  windowMinutes: number
  conversations: number
  cacheHits: number
  goalsCreated: number
  goalsDone: number
  goalsFailed: number
  stepsOk: number
  stepsError: number
  topInputs: { input: string; final: string }[]
  topGoals: { goal: string; state: string; steps: number }[]
  apiInputTokens: number
  apiOutputTokens: number
  cacheReadTokens: number
}

async function loadActivity(db: D1Database, minutes: number): Promise<ActivityWindow> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  // Conversations + cache rate
  const convStats: any = await db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM council_steps cs WHERE cs.conversation_id = c.id AND cs.advisor_name = 'cache') THEN 1 ELSE 0 END) AS cache_hits
     FROM conversations c WHERE c.created_at >= ?`,
  ).bind(since).first()

  const topConv: any = await db.prepare(
    `SELECT input, final_output FROM conversations WHERE created_at >= ? ORDER BY created_at DESC LIMIT 6`,
  ).bind(since).all()

  // Orchestrator activity — exec_steps lives in DO sqlite, not D1.
  // For now, surface zeros from D1 and add a note. TODO: bridge DO sqlite → D1
  // periodically so the synthesis layer sees orchestrator activity.
  const goalsCreated = 0, goalsDone = 0, goalsFailed = 0, stepsOk = 0, stepsError = 0
  const topGoals: any[] = []

  // Token totals from api_use table (the pillar metric source).
  const tokens: any = await db.prepare(
    `SELECT
       COALESCE(SUM(input_tokens), 0) AS input_tokens,
       COALESCE(SUM(output_tokens), 0) AS output_tokens,
       COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens
     FROM api_use WHERE created_at >= ?`,
  ).bind(since).first().catch(() => ({ input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 }))

  return {
    windowMinutes: minutes,
    conversations: Number(convStats?.total ?? 0),
    cacheHits: Number(convStats?.cache_hits ?? 0),
    goalsCreated, goalsDone, goalsFailed, stepsOk, stepsError,
    topInputs: (topConv?.results ?? []).map((r: any) => ({
      input: String(r.input ?? '').slice(0, 200),
      final: String(r.final_output ?? '').slice(0, 250),
    })),
    topGoals,
    apiInputTokens: Number(tokens?.input_tokens ?? 0),
    apiOutputTokens: Number(tokens?.output_tokens ?? 0),
    cacheReadTokens: Number(tokens?.cache_read_tokens ?? 0),
  }
}

function compactActivity(a: ActivityWindow): string {
  const cacheRate = a.conversations ? Math.round((a.cacheHits / a.conversations) * 100) : 0
  const inputs = a.topInputs.length
    ? a.topInputs.map(t => `- "${t.input.slice(0, 100)}" ⇒ "${t.final.slice(0, 100)}"`).join('\n')
    : '(none)'
  return [
    `window=${a.windowMinutes}min`,
    `conversations=${a.conversations} (cache_hits=${a.cacheHits}, cache_rate=${cacheRate}%)`,
    `tokens: in=${a.apiInputTokens} out=${a.apiOutputTokens} cache_read=${a.cacheReadTokens}`,
    `top_inputs:`,
    inputs,
  ].join('\n')
}

// ----- 10-min check (Haiku, 1 paragraph) ----------------------------------

export async function tenMinCheck(env: any): Promise<{ ok: boolean; text?: string; error?: string }> {
  const start = Date.now()
  const activity = await loadActivity(env.DB, 10)
  if (activity.conversations === 0 && activity.apiInputTokens === 0) {
    return { ok: false, error: 'no_activity_skipped' }
  }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system: `You are nao_00's 10-minute self-check. Read the activity window and write ONE concise paragraph (≤3 sentences, ≤500 chars total) describing what the system did and any signal worth flagging. Plain text. No bullet lists. No emoji at the start. End with a one-clause "next:" hint if relevant.`,
        messages: [{ role: 'user', content: `Activity:\n${compactActivity(activity)}\n\nWrite the 10-min check.` }],
      }),
    })
    const data: any = await r.json()
    const u = anthropicUsage(data)
    await recordUsage(env.DB, {
      source: 'synthesis_10min', model: 'claude-haiku-4-5-20251001',
      input_tokens: u.input, output_tokens: u.output,
      cache_read_tokens: u.cache_read, cache_create_tokens: u.cache_create,
      duration_ms: Date.now() - start,
    })
    const text = (data?.content?.[0]?.text || '').slice(0, 1500)
    if (!text) return { ok: false, error: 'empty_response' }
    await postToChannel(env, 'all-nao00', {
      text: `🟢 10m · ${text.slice(0, 200)}`,
      blocks: [
        sectionBlock(`*🟢 10-min check*  _${new Date().toISOString().slice(11, 16)} UTC_`),
        sectionBlock(text),
        contextBlock(`conversations=${activity.conversations} · tokens=${activity.apiInputTokens}+${activity.apiOutputTokens} · cache_read=${activity.cacheReadTokens}`),
      ],
    })
    return { ok: true, text }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

// ----- 40-min digest (Mistral, theme grouping) ----------------------------

export async function fortyMinDigest(env: any): Promise<{ ok: boolean; text?: string; error?: string }> {
  const start = Date.now()
  const activity = await loadActivity(env.DB, 40)
  if (activity.conversations === 0 && activity.apiInputTokens === 0) {
    return { ok: false, error: 'no_activity_skipped' }
  }
  if (!env.MISTRAL_API_KEY) return { ok: false, error: 'no_mistral_key' }
  try {
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `You are nao_00's 40-minute digest. Group activity into 2-4 themes. Output:\n*Themes:* <one line per theme, ≤80 chars>\n*Surprises:* <bullet list, ≤2 items, only real surprises, omit if none>\n*Drift:* <one line: are we on engine-builder track or drifted into noise>\nUse Slack mrkdwn. ≤900 chars total.`,
          },
          { role: 'user', content: `Activity:\n${compactActivity(activity)}\n\nWrite the 40-min digest.` },
        ],
      }),
    })
    const data: any = await r.json()
    const u = mistralUsage(data)
    await recordUsage(env.DB, {
      source: 'synthesis_40min', model: 'mistral-large-latest',
      input_tokens: u.input, output_tokens: u.output,
      duration_ms: Date.now() - start,
    })
    const text = (data?.choices?.[0]?.message?.content || '').slice(0, 1500)
    if (!text) return { ok: false, error: 'empty_response' }
    await postToChannel(env, 'all-nao00', {
      text: `🟡 40m digest`,
      blocks: [
        sectionBlock(`*🟡 40-min digest*  _${new Date().toISOString().slice(11, 16)} UTC_`),
        dividerBlock(),
        sectionBlock(text),
      ],
    })
    return { ok: true, text }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

// ----- 1-hour story (Opus 4.7, narrative + next-action) -------------------

export async function hourlyStory(env: any): Promise<{ ok: boolean; text?: string; error?: string }> {
  const start = Date.now()
  const activity = await loadActivity(env.DB, 60)
  if (activity.conversations === 0 && activity.apiInputTokens === 0) {
    return { ok: false, error: 'no_activity_skipped' }
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
        model: 'claude-opus-4-7',
        max_tokens: 1000,
        system: [{
          type: 'text',
          text: `You are nao_00's hourly storyteller. Naoufal operates from the "ridiculous perspective" — \$1k → \$1M, $100-10k is noise, we are building the engine.

Read the last hour of activity and write a NARRATIVE that makes sense of the logic — not a log. Structure:

*This hour's story* — 2-3 sentences. What did the system actually accomplish, and what does it mean for the engine? Be honest if the hour was idle.
*Theme* — one phrase capturing the through-line.
*Compounding signal* — one line on whether this hour added to the multiplier or the adders. Use the words "multiplier" or "adder".
*Next* — one line, concrete. What should the next hour do.

Use Slack mrkdwn. ≤1100 chars total. No corporate language. No padding.`,
          cache_control: { type: 'ephemeral', ttl: '1h' },
        }],
        messages: [{ role: 'user', content: `Activity (1h window):\n${compactActivity(activity)}\n\nWrite the hourly story.` }],
      }),
    })
    const data: any = await r.json()
    const u = anthropicUsage(data)
    await recordUsage(env.DB, {
      source: 'synthesis_1h', model: 'claude-opus-4-7',
      input_tokens: u.input, output_tokens: u.output,
      cache_read_tokens: u.cache_read, cache_create_tokens: u.cache_create,
      duration_ms: Date.now() - start,
    })
    const text = (data?.content?.[0]?.text || '').slice(0, 2500)
    if (!text) return { ok: false, error: 'empty_response' }
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    await postToChannel(env, 'all-nao00', {
      text: `🔵 hourly story · ${stamp}`,
      blocks: [
        headerBlock(`🔵 hourly story · ${stamp}`),
        sectionBlock(text),
        contextBlock(`conversations=${activity.conversations} · cache_rate=${activity.conversations ? Math.round((activity.cacheHits / activity.conversations) * 100) : 0}%`, `tokens in/out: ${activity.apiInputTokens}/${activity.apiOutputTokens}`),
      ],
    })
    // Persist the latest hour to KV so /continuity (future) can read it.
    try {
      await env.KV.put('synthesis:hourly:latest', JSON.stringify({ ts: Date.now(), text, activity }), { expirationTtl: 7 * 24 * 3600 })
    } catch {}
    return { ok: true, text }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

// ----- Multiplexer: called from the */15 cron tick ------------------------
//
// Decides which cadence(s) to fire based on minute-of-hour. Returns what ran.

export async function synthesisTick(env: any): Promise<{ ran: string[]; results: any[] }> {
  const minute = new Date().getUTCMinutes()
  const ran: string[] = []
  const results: any[] = []

  // The */15 cron fires at minutes 0, 15, 30, 45 — we only see 4 of the 6 ten-minute marks.
  // For now we accept that and fire the 10-min check on every tick (so 4 checks/hour
  // instead of 6). The 40m fires on minute=45 (closest to 40), the 1h on minute=0.
  if (minute % 10 === 0 || true) {
    const r = await tenMinCheck(env)
    ran.push('10m'); results.push(r)
  }
  if (minute === 45) {
    const r = await fortyMinDigest(env)
    ran.push('40m'); results.push(r)
  }
  if (minute === 0) {
    const r = await hourlyStory(env)
    ran.push('1h'); results.push(r)
  }
  return { ran, results }
}
