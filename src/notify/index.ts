// Notify — push the daily briefing + recap to real channels (gmail, slack)
// via Composio MCP. Closes the loop on the daily cycle: nao_00 doesn't just
// store its thinking, it actually shows up in Naoufal's day.
//
// Pillar-metric impact: each notification = +1 Composio MCP call = api-use ↑.
// Product impact: "your AI sent me an email this morning" is a real touchpoint.
//
// Modes:
//   GMAIL — default 'draft' (per agentic_permissions: draft-first the first time
//           we touch a channel). Flip env.NOTIFY_GMAIL_MODE='send' once Naoufal
//           has reviewed a few drafts and approves auto-send.
//   SLACK — default 'send' to NOTIFY_SLACK_CHANNEL (a channel id or @user).
//           If the env var is unset, we log skip — never error.

import { ComposioMCP } from '../tools/composio'
import { recordUsage } from '../metrics/api-use'

interface NotifyResult {
  ok: boolean
  channel: 'gmail' | 'slack'
  mode: string
  detail?: string
  error?: string
  duration_ms: number
}

async function callComposio(env: any, slug: string, args: Record<string, any>): Promise<{ ok: boolean; data?: any; error?: string }> {
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
    // Composio MULTI_EXECUTE failure shapes (any one of these = failure):
    //   1. parsed.successful === false          (top-level wrapper failed)
    //   2. parsed.data.results[0].error         (inner tool errored — common for "Tool X not found")
    //   3. parsed.data.results[0].response.successful === false  (inner tool returned ok:false)
    //   4. result.isError                        (MCP-level transport error)
    const inner = parsed?.data?.results?.[0]
    if ((result as any)?.isError) {
      return { ok: false, error: String(inner?.error || parsed?.error || 'mcp_is_error') }
    }
    if (parsed?.successful === false) {
      return { ok: false, error: String(inner?.error || parsed?.error || 'wrapper_failed') }
    }
    if (inner?.error && !inner?.response) {
      return { ok: false, error: String(inner.error) }
    }
    if (inner?.response?.successful === false) {
      return { ok: false, error: String(inner.response.error || 'tool failed') }
    }
    return { ok: true, data: inner?.response?.data ?? parsed?.data ?? parsed }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 300) }
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function briefingHtml(b: any): string {
  const focus = escapeHtml(b?.focus?.line || '(no focus line)')
  const gmail = escapeHtml(b?.gmail?.summary || '')
  const cal = escapeHtml(b?.calendar?.summary || '')
  return `
<div style="font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; line-height:1.55; color:#2b2825; max-width:560px;">
  <div style="font-size:13px; color:#998c7a; margin-bottom:6px;">nao_00 · morning briefing · ${escapeHtml(b?.date || '')}</div>
  <h2 style="font-weight:600; font-size:20px; color:#c96442; margin:0 0 14px;">🌅 today's focus</h2>
  <p style="font-size:17px; color:#2b2825; margin:0 0 20px;">${focus}</p>

  <h3 style="font-size:13px; color:#998c7a; text-transform:uppercase; letter-spacing:.04em; margin:18px 0 6px;">📥 inbox</h3>
  <pre style="background:#faf9f5; border-radius:8px; padding:10px 12px; font-family:ui-monospace, monospace; font-size:13px; white-space:pre-wrap; margin:0 0 14px;">${gmail}</pre>

  <h3 style="font-size:13px; color:#998c7a; text-transform:uppercase; letter-spacing:.04em; margin:18px 0 6px;">📅 calendar</h3>
  <pre style="background:#faf9f5; border-radius:8px; padding:10px 12px; font-family:ui-monospace, monospace; font-size:13px; white-space:pre-wrap; margin:0 0 18px;">${cal}</pre>

  <div style="font-size:12px; color:#bcaf9c; margin-top:24px;">— minouch · <a style="color:#bcaf9c;" href="https://nao00.nchobah.com/dashboard">dashboard</a></div>
</div>`.trim()
}

function briefingPlain(b: any): string {
  const focus = b?.focus?.line || '(no focus line)'
  const gmail = b?.gmail?.summary || ''
  const cal = b?.calendar?.summary || ''
  return `🌅 today's focus — ${b?.date || ''}\n\n${focus}\n\n— inbox —\n${gmail}\n\n— calendar —\n${cal}\n\n— minouch · https://nao00.nchobah.com/dashboard`
}

function recapSlackBlocks(r: any): any[] {
  const para = r?.recap?.paragraph || '(no recap)'
  const stats = r?.stats || {}
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🌙 ${r?.date || ''} — evening recap` }
    },
    { type: 'section', text: { type: 'mrkdwn', text: para } },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `*${stats.council_calls_today ?? 0}* convos today · cache hit *${((stats.cache_hit_today ?? 0) * 100).toFixed(1)}%* · <https://nao00.nchobah.com/dashboard|dashboard>`
      }]
    }
  ]
}

// ISO week id (e.g. "2026-W19") — daily recaps for the same week reply-thread
// to one parent message so the DM list isn't a wall of nightly posts.
function isoWeekId(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function weeklySlackBlocks(d: any): any[] {
  const para = d?.weekly?.paragraph || '(no digest)'
  const days = d?.days || []
  const totals = d?.totals || {}
  const dayLine = days.map((day: any) => `${day.date?.slice(5) || '??'} · ${day.calls || 0}`).join('  ·  ')
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📚 ${d?.week_id || ''} — weekly digest` }
    },
    { type: 'section', text: { type: 'mrkdwn', text: para } },
    { type: 'divider' },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `*${totals.calls || 0}* calls · *${totals.tokens || 0}* tokens · cache *${((totals.cache_hit || 0) * 100).toFixed(1)}%*`
      }]
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: dayLine || '(no daily breakdown)' }]
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<https://nao00.nchobah.com/dashboard|dashboard> · <https://nao00.nchobah.com/metrics/api-use|metrics>` }]
    }
  ]
}

export async function sendBriefingEmail(env: any, briefing: any): Promise<NotifyResult> {
  const start = Date.now()
  const to = env.NOTIFY_GMAIL_TO || 'naoufal@vehea.com'
  const mode = (env.NOTIFY_GMAIL_MODE || 'draft').toLowerCase() === 'send' ? 'send' : 'draft'
  const slug = mode === 'send' ? 'GMAIL_SEND_EMAIL' : 'GMAIL_CREATE_EMAIL_DRAFT'

  const subject = `🌅 ${briefing?.date || ''} — ${(briefing?.focus?.line || 'today').slice(0, 80)}`
  const args = {
    recipient_email: to,
    subject,
    body: briefingHtml(briefing),
    is_html: true,
    extra_recipients: []
  }

  const r = await callComposio(env, slug, args)
  try {
    await recordUsage(env.DB, {
      source: 'notify' as any, model: slug,
      input_tokens: 0, output_tokens: 0,
      duration_ms: Date.now() - start
    })
  } catch {}

  if (!r.ok) return { ok: false, channel: 'gmail', mode, error: r.error, duration_ms: Date.now() - start }
  // Try a few common id field shapes Composio returns.
  const id = r.data?.id || r.data?.message_id || r.data?.draft?.id || ''
  return {
    ok: true,
    channel: 'gmail',
    mode,
    detail: id ? `${mode} id: ${id}` : `${mode} ok`,
    duration_ms: Date.now() - start
  }
}

// Shared Slack post helper. Composio's *current* slug is SLACK_SEND_MESSAGE
// (verified 2026-05-07 via COMPOSIO_SEARCH_TOOLS). The earlier-believed
// SLACK_SENDS_A_MESSAGE / SLACK_CHAT_POST_MESSAGE return "Tool not found" —
// we keep them as last-resort fallbacks in case Composio renames again.
async function postToSlack(env: any, args: Record<string, any>): Promise<{ ok: boolean; ts?: string; error?: string; slug: string }> {
  const candidates = ['SLACK_SEND_MESSAGE', 'SLACK_SENDS_A_MESSAGE', 'SLACK_CHAT_POST_MESSAGE']
  let slug = candidates[0]
  let r = await callComposio(env, slug, args)
  for (let i = 1; i < candidates.length && !r.ok && /not.?found|unknown.?tool|no.?such.?tool/i.test(r.error || ''); i++) {
    slug = candidates[i]
    r = await callComposio(env, slug, args)
  }
  // ts can live in several spots depending on which Slack tool variant won.
  const ts = r.data?.ts || r.data?.message?.ts || r.data?.message_ts || r.data?.response_metadata?.ts || ''
  return { ok: r.ok, ts, error: r.error, slug }
}

export async function sendRecapSlack(env: any, recap: any): Promise<NotifyResult> {
  const start = Date.now()
  const channel = env.NOTIFY_SLACK_CHANNEL
  if (!channel) {
    return { ok: false, channel: 'slack', mode: 'send', error: 'no_NOTIFY_SLACK_CHANNEL_configured', duration_ms: Date.now() - start }
  }

  const blocks = recapSlackBlocks(recap)
  const fallbackText = `🌙 ${recap?.date || ''} — ${recap?.recap?.paragraph || ''}`.slice(0, 1500)

  // Threading: keep one parent message per ISO week so the DM stays tidy.
  // Each daily recap replies to the week's parent ts.
  const weekId = isoWeekId()
  const threadKey = `notify:slack:recap:thread:${weekId}`
  let parentTs: string | null = null
  try { parentTs = await env.KV.get(threadKey) } catch {}

  const args: Record<string, any> = { channel, text: fallbackText, blocks }
  if (parentTs) args.thread_ts = parentTs

  let r = await postToSlack(env, args)
  let createdParent = false

  // If first attempt fails because the stored thread_ts is invalid (e.g. message
  // deleted), drop it and retry as a fresh post so we don't lose today's recap.
  if (!r.ok && parentTs && /thread_not_found|invalid_thread_ts|message_not_found/i.test(r.error || '')) {
    delete args.thread_ts
    r = await postToSlack(env, args)
    parentTs = null
  }

  // First message of the week → store the new parent ts so subsequent recaps
  // reply-thread to it. We never overwrite an existing parent.
  if (r.ok && !parentTs && r.ts) {
    try {
      // 60-day TTL is enough for one ISO week with slack delete-after-30 settings room.
      await env.KV.put(threadKey, r.ts, { expirationTtl: 60 * 60 * 24 * 60 })
      createdParent = true
    } catch {}
  }

  try {
    await recordUsage(env.DB, {
      source: 'notify' as any, model: r.slug,
      input_tokens: 0, output_tokens: 0,
      duration_ms: Date.now() - start
    })
  } catch {}

  if (!r.ok) return { ok: false, channel: 'slack', mode: 'send', error: r.error, duration_ms: Date.now() - start }
  const detail = parentTs
    ? `replied to ${weekId} thread (${parentTs})`
    : createdParent
      ? `started ${weekId} thread (${r.ts})`
      : (r.ts ? `slack ts: ${r.ts}` : 'slack ok')
  return {
    ok: true,
    channel: 'slack',
    mode: 'send',
    detail,
    duration_ms: Date.now() - start
  }
}

export async function sendAlertSlack(env: any, text: string, source = 'watchdog'): Promise<NotifyResult> {
  const start = Date.now()
  const channel = env.NOTIFY_SLACK_CHANNEL
  if (!channel) return { ok: false, channel: 'slack', mode: 'send', error: 'no_NOTIFY_SLACK_CHANNEL_configured', duration_ms: Date.now() - start }
  const stamp = new Date().toISOString().replace('T',' ').slice(0,19) + 'Z'
  const fallback = `🚨 [${source}] ${text}`.slice(0, 1500)
  const r = await postToSlack(env, { channel, text: fallback })
  try {
    await recordUsage(env.DB, { source: 'notify' as any, model: r.slug, input_tokens: 0, output_tokens: 0, duration_ms: Date.now() - start })
  } catch {}
  return r.ok
    ? { ok: true, channel: 'slack', mode: 'send', detail: `alert posted (${stamp}) ts=${r.ts}`, duration_ms: Date.now() - start }
    : { ok: false, channel: 'slack', mode: 'send', error: r.error, duration_ms: Date.now() - start }
}

export async function sendWeeklyDigestSlack(env: any, digest: any): Promise<NotifyResult> {
  const start = Date.now()
  const channel = env.NOTIFY_SLACK_CHANNEL
  if (!channel) {
    return { ok: false, channel: 'slack', mode: 'send', error: 'no_NOTIFY_SLACK_CHANNEL_configured', duration_ms: Date.now() - start }
  }
  const blocks = weeklySlackBlocks(digest)
  const fallbackText = `📚 ${digest?.week_id || ''} — ${digest?.weekly?.paragraph || ''}`.slice(0, 1500)

  // Weekly digest is its own top-level message — NOT threaded to the daily
  // recap thread. It should be its own anchor in the DM.
  const r = await postToSlack(env, { channel, text: fallbackText, blocks })

  try {
    await recordUsage(env.DB, {
      source: 'notify' as any, model: r.slug,
      input_tokens: 0, output_tokens: 0,
      duration_ms: Date.now() - start
    })
  } catch {}

  if (!r.ok) return { ok: false, channel: 'slack', mode: 'send', error: r.error, duration_ms: Date.now() - start }
  return {
    ok: true,
    channel: 'slack',
    mode: 'send',
    detail: r.ts ? `weekly slack ts: ${r.ts}` : 'weekly slack ok',
    duration_ms: Date.now() - start
  }
}
