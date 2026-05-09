// Slack DM inbox poller — closes the "talk to Anouf from my phone" loop.
//
// Naoufal already gets daily recap/briefing pushed to his Slack DM with the
// Composio bot (channel D0ASHUW4Q1F). This poller adds the REVERSE direction:
// when Naoufal DMs the bot, we run the message through the council and post the
// reply back to the same DM.
//
// Pillar-metric: each polled inbound message → +1 council run → +N LLM calls.
// Product: the council brain (always-on) becomes reachable from his phone via
//          the existing Slack app — no new bot, no new auth, no new install.
//
// State: D1 table `slack_inbox_state` tracks last_seen_ts per channel so we
//        only process messages newer than the last poll.
//
// Trigger: Nemoclaw cron pings POST /inbox/slack/poll every minute. The 5-cron
//          limit on this account is already maxed — that's why we use Nemo.
import { ComposioMCP } from '../tools/composio'
import { councilPipeline } from '../council/pipeline'

export interface SlackPollerEnv {
  COMPOSIO_API_KEY: string
  NOTIFY_SLACK_CHANNEL?: string
  KV: KVNamespace
  DB: D1Database
}

interface SlackMessage {
  type?: string
  subtype?: string
  ts: string
  text?: string
  user?: string
  bot_id?: string
}

async function callComposio(
  apiKey: string,
  slug: string,
  args: Record<string, any>
): Promise<{ ok: boolean; data?: any; error?: string; raw?: string }> {
  const mcp = new ComposioMCP(apiKey)
  const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
    tools: [{ tool_slug: slug, arguments: args }]
  })
  const text = (result.content || []).map((c: any) => c.text ?? '').join('\n')
  if (!text) return { ok: false, error: 'empty_response' }
  let parsed: any
  try { parsed = JSON.parse(text) } catch { return { ok: false, error: 'non_json_response', raw: text.slice(0, 300) } }
  const inner = parsed?.data?.results?.[0]
  if ((result as any)?.isError) return { ok: false, error: String(inner?.error || parsed?.error || 'mcp_is_error'), raw: text.slice(0, 300) }
  if (parsed?.successful === false) return { ok: false, error: String(inner?.error || parsed?.error || 'wrapper_failed'), raw: text.slice(0, 300) }
  if (inner?.error && !inner?.response) return { ok: false, error: String(inner.error), raw: text.slice(0, 300) }
  if (inner?.response?.successful === false) return { ok: false, error: String(inner.response.error || 'tool_failed'), raw: text.slice(0, 300) }
  return { ok: true, data: inner?.response?.data ?? parsed?.data ?? parsed }
}

async function ensureState(db: D1Database) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS slack_inbox_state (channel_id TEXT PRIMARY KEY, last_seen_ts TEXT, last_run_at TEXT, last_inbound INTEGER DEFAULT 0, last_replied INTEGER DEFAULT 0, last_error TEXT)'
  )
}

async function getLastSeen(db: D1Database, channel: string): Promise<string | null> {
  const row = await db.prepare('SELECT last_seen_ts FROM slack_inbox_state WHERE channel_id = ?').bind(channel).first<{ last_seen_ts: string }>()
  return row?.last_seen_ts ?? null
}

async function setState(
  db: D1Database,
  channel: string,
  lastSeen: string,
  inbound: number,
  replied: number,
  error: string | null
) {
  await db
    .prepare(
      `INSERT INTO slack_inbox_state (channel_id, last_seen_ts, last_run_at, last_inbound, last_replied, last_error)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET
         last_seen_ts = excluded.last_seen_ts,
         last_run_at = excluded.last_run_at,
         last_inbound = excluded.last_inbound,
         last_replied = excluded.last_replied,
         last_error = excluded.last_error`
    )
    .bind(channel, lastSeen, new Date().toISOString(), inbound, replied, error)
    .run()
}

export interface PollResult {
  ok: boolean
  channel: string
  inbound: number
  replied: number
  errors: string[]
  duration_ms: number
  detail?: any[]
}

export async function pollSlackInbox(env: SlackPollerEnv): Promise<PollResult> {
  const start = Date.now()
  const channel = env.NOTIFY_SLACK_CHANNEL
  if (!channel) {
    return { ok: false, channel: '', inbound: 0, replied: 0, errors: ['no_NOTIFY_SLACK_CHANNEL'], duration_ms: Date.now() - start }
  }
  if (!env.COMPOSIO_API_KEY) {
    return { ok: false, channel, inbound: 0, replied: 0, errors: ['no_composio_key'], duration_ms: Date.now() - start }
  }

  await ensureState(env.DB)

  // Fetch the most recent slice of conversation. `oldest` is the high-water mark
  // from the previous run; on first run we seed it to "now minus 90s" so the
  // first poll doesn't replay history.
  const lastSeen = await getLastSeen(env.DB, channel)
  const oldest = lastSeen ?? String((Date.now() - 90_000) / 1000)

  const fetched = await callComposio(env.COMPOSIO_API_KEY, 'SLACK_FETCH_CONVERSATION_HISTORY', {
    channel,
    oldest,
    limit: 20
  })
  if (!fetched.ok) {
    await setState(env.DB, channel, oldest, 0, 0, fetched.error ?? 'fetch_failed')
    return { ok: false, channel, inbound: 0, replied: 0, errors: [fetched.error ?? 'fetch_failed'], duration_ms: Date.now() - start }
  }

  const messages: SlackMessage[] = Array.isArray(fetched.data?.messages)
    ? fetched.data.messages
    : Array.isArray(fetched.data?.data?.messages)
    ? fetched.data.data.messages
    : []

  // Filter to inbound, user-authored, new-since-last-seen messages.
  const inbound = messages
    .filter(m => !m.bot_id)
    .filter(m => !m.subtype || m.subtype === '')
    .filter(m => (m.text ?? '').trim().length > 0)
    .filter(m => !lastSeen || Number(m.ts) > Number(lastSeen))
    .sort((a, b) => Number(a.ts) - Number(b.ts))

  const errors: string[] = []
  const detail: any[] = []
  let replied = 0
  let highWater = lastSeen ?? oldest

  for (const msg of inbound) {
    const text = msg.text!.trim()
    try {
      const result = await councilPipeline(text, env as any, env.KV, env.DB)
      const reply = (result?.final_output ?? '').toString().trim() || '(no reply)'

      // Cap to a sane Slack length. Council answers are usually short.
      const slackBody = reply.length > 3500 ? reply.slice(0, 3490) + '…' : reply

      const sent = await callComposio(env.COMPOSIO_API_KEY, 'SLACK_SEND_MESSAGE', {
        channel,
        text: slackBody,
        thread_ts: msg.ts
      })
      if (sent.ok) {
        replied += 1
        detail.push({ ts: msg.ts, ok: true, in: text.slice(0, 80), out: slackBody.slice(0, 80) })
      } else {
        errors.push(`send_fail:${sent.error}`)
        detail.push({ ts: msg.ts, ok: false, error: sent.error })
      }
    } catch (err: any) {
      const e = String(err?.message ?? err).slice(0, 200)
      errors.push(`council_fail:${e}`)
      detail.push({ ts: msg.ts, ok: false, error: e })
    }
    if (Number(msg.ts) > Number(highWater)) highWater = msg.ts
  }

  await setState(env.DB, channel, highWater, inbound.length, replied, errors[0] ?? null)

  return {
    ok: errors.length === 0,
    channel,
    inbound: inbound.length,
    replied,
    errors,
    duration_ms: Date.now() - start,
    detail
  }
}
