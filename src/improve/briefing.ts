// Morning briefing — runs daily at 0:00 UTC (= 7:00 AM Bangkok).
// Composes a real digest from Naoufal's connected accounts:
//   1. Gmail — last 24h important / unread
//   2. Calendar — today's events
//   3. nao44 — one-line "what to focus on" synthesis
// Stored in KV at `briefing:latest` and `briefing:history:<iso>` (90d TTL).
// Drives ~5 high-value API calls daily without Naoufal lifting a finger.

import { ComposioMCP } from '../tools/composio'
import { recordUsage, anthropicUsage } from '../metrics/api-use'

interface BriefingResult {
  ts: string
  date: string                    // YYYY-MM-DD in Bangkok TZ
  gmail: { ok: boolean; summary: string; raw?: any }
  calendar: { ok: boolean; summary: string; raw?: any }
  focus: { ok: boolean; line: string }
  duration_ms: number
}

async function callComposioSlug(env: any, slug: string, args: Record<string, any>): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!env.COMPOSIO_API_KEY) return { ok: false, error: 'no_composio_key' }
  try {
    const mcp = new ComposioMCP(env.COMPOSIO_API_KEY)
    const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
      tools: [{ tool_slug: slug, arguments: args }]
    })
    const text = (result.content || []).map((c: any) => c.text ?? '').join('\n')
    if (!text) return { ok: false, error: 'empty_response' }
    let parsed: any
    try { parsed = JSON.parse(text) } catch { return { ok: false, error: 'non_json_response' } }
    const inner = parsed?.data?.results?.[0]
    if (inner?.response?.successful === false) {
      return { ok: false, error: String(inner.response.error || 'tool failed') }
    }
    // Composio nests the actual payload at data.results[0].response.data; everything
    // higher than that is envelope. Calendar especially relies on this exact path.
    return { ok: true, data: inner?.response?.data ?? parsed?.data ?? parsed }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 300) }
  }
}

// Composio GMAIL_FETCH_EMAILS response: { messages: [{ subject, sender, preview, messageTimestamp, ... }], ... }
function summarizeGmail(d: any): string {
  if (!d) return 'no data'
  const msgs = d.messages || []
  if (!Array.isArray(msgs) || msgs.length === 0) return 'inbox quiet — 0 messages in window'
  const lines = msgs.slice(0, 5).map((m: any, i: number) => {
    const subj = m.subject || m.preview || '(no subject)'
    const from = String(m.sender || '').replace(/<.*?>/, '').replace(/"/g, '').trim().slice(0, 40)
    return `  ${i + 1}. ${String(subj).slice(0, 80)} — ${from}`
  }).join('\n')
  return `${msgs.length} message(s):\n${lines}`
}

// Composio GOOGLECALENDAR_FIND_EVENT response wraps the event list at data.event_data.event_data[].
function summarizeCalendar(d: any): string {
  if (!d) return 'no data'
  const events = d.event_data?.event_data || d.events || d.items || []
  if (!Array.isArray(events) || events.length === 0) return 'calendar clear today'
  const lines = events.slice(0, 8).map((e: any, i: number) => {
    const summary = e.summary || e.title || '(no title)'
    const start = e.start?.dateTime || e.start?.date || ''
    // Pull HH:MM from a dateTime; date-only events get "all-day".
    const t = /T\d{2}:\d{2}/.test(String(start)) ? String(start).slice(11, 16) : 'all-day'
    return `  ${i + 1}. ${t} — ${String(summary).slice(0, 80)}`
  }).join('\n')
  return `${events.length} event(s):\n${lines}`
}

async function focusLine(env: any, db: any, gmailSummary: string, calSummary: string, dateStr: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) return 'focus: (no anthropic key)'
  const start = Date.now()
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        system: 'You are nao44, briefing Naoufal. Given today\'s inbox and calendar, output ONE sentence (max 30 words) naming the single most important thing to focus on today. Direct, warm, no preamble. End with a fitting emoji.',
        messages: [{
          role: 'user',
          content: `Date: ${dateStr} (Bangkok)\n\nInbox:\n${gmailSummary}\n\nCalendar:\n${calSummary}\n\nWhat is THE focus today?`
        }]
      })
    })
    const data: any = await res.json()
    if (db) {
      const u = anthropicUsage(data)
      await recordUsage(db, {
        source: 'briefing', model: 'claude-haiku-4-5-20251001',
        input_tokens: u.input, output_tokens: u.output,
        cache_read_tokens: u.cache_read, cache_create_tokens: u.cache_create,
        duration_ms: Date.now() - start
      })
    }
    const text = data.content?.[0]?.text?.trim() || '(briefing model returned empty)'
    return text
  } catch (err: any) {
    return `focus: (error ${String(err?.message ?? err).slice(0, 80)})`
  }
}

export async function runMorningBriefing(env: any, ctx: any): Promise<BriefingResult> {
  const start = Date.now()
  const ts = new Date().toISOString()
  // Bangkok = UTC+7
  const bangkokDate = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

  // Gmail — last 24h, anything important or unread. Composio's GMAIL_FETCH_EMAILS
  // accepts a Gmail search query string in `query`.
  const gmail = await callComposioSlug(env, 'GMAIL_FETCH_EMAILS', {
    query: 'newer_than:1d (is:important OR is:unread) -category:promotions -category:social',
    max_results: 10
  })
  const gmailSummary = gmail.ok ? summarizeGmail(gmail.data) : `gmail error: ${gmail.error}`

  // Calendar — today only.
  const cal = await callComposioSlug(env, 'GOOGLECALENDAR_FIND_EVENT', {
    calendar_id: 'primary',
    timeMin: `${bangkokDate}T00:00:00+07:00`,
    timeMax: `${bangkokDate}T23:59:59+07:00`,
    single_events: true,
    max_results: 20
  })
  const calSummary = cal.ok ? summarizeCalendar(cal.data) : `calendar error: ${cal.error}`

  const focus = await focusLine(env, env.DB, gmailSummary, calSummary, bangkokDate)

  const result: BriefingResult = {
    ts,
    date: bangkokDate,
    gmail: { ok: gmail.ok, summary: gmailSummary, raw: undefined },
    calendar: { ok: cal.ok, summary: calSummary, raw: undefined },
    focus: { ok: focus.length > 0, line: focus },
    duration_ms: Date.now() - start
  }

  const blob = JSON.stringify(result)
  ctx.waitUntil(Promise.all([
    env.KV.put('briefing:latest', blob),
    env.KV.put(`briefing:history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 90 })
  ]))

  return result
}
