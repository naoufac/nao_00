// Slack channel poster — used by every nao_00 surface to fan-out updates
// to the right channel in the gab44 workspace.
//
// Channels (created 2026-05-08 in gab44 workspace):
//   #all-nao00     C0B3FG3K1FS  firehose / pinned dashboard
//   #council       C0B2K846HNJ  every council Q&A
//   #orchestrator  C0B25RXEFF1  goal lifecycle
//   #pillar        C0B2MA3BPFU  api-use snapshots
//   #briefing      C0B2QTWMB2Q  morning briefings
//   #recap         C0B2EUB7L7M  evening recaps
//   #deploys       C0B2EUHJA6P  deploy events
//   #incidents     C0B25RXJVCP  failures
//   #lab           C0B2QTYKM4L  Naoufal's playground
//
// Usage:
//   await postToChannel(env, 'orchestrator', { text: 'goal X done', blocks: [...] })

import { ComposioMCP } from '../tools/composio'
import { appendEvent } from './events_log'

// Hard-coded channel IDs. New channels: add here AND create via Composio.
// (We could resolve names → ids dynamically, but a fixed map is faster + safer
// than a network call on every post. Update this map if anything is renamed.)
export const CHANNEL_IDS: Record<string, string> = {
  'all-nao00':    'C0B3FG3K1FS',
  council:        'C0B2K846HNJ',
  orchestrator:   'C0B25RXEFF1',
  pillar:         'C0B2MA3BPFU',
  briefing:       'C0B2QTWMB2Q',
  recap:          'C0B2EUB7L7M',
  deploys:        'C0B2EUHJA6P',
  incidents:      'C0B25RXJVCP',
  lab:            'C0B2QTYKM4L',
}

export interface PostOpts {
  text: string                  // fallback / notification text (always required)
  blocks?: any[]                // optional Block Kit blocks for rich UI
  thread_ts?: string            // reply in thread
  unfurl_links?: boolean
}

export interface PostResult {
  ok: boolean
  channel: string
  channel_id: string
  ts?: string
  error?: string
}

const SLACK_SLUGS = ['SLACK_SEND_MESSAGE', 'SLACK_SENDS_A_MESSAGE', 'SLACK_CHAT_POST_MESSAGE']

/**
 * Post a message to one of nao_00's named channels via Composio MCP.
 * Falls back across slug variants if Composio renames its tool.
 *
 * Disabled silently if `env.COMPOSIO_API_KEY` is missing (e.g. during local
 * tests) so callers don't have to feature-flag every call site.
 */
export async function postToChannel(
  env: any,
  channelName: keyof typeof CHANNEL_IDS | string,
  opts: PostOpts,
): Promise<PostResult> {
  const channelId = CHANNEL_IDS[channelName as string]
  if (!channelId) {
    return { ok: false, channel: String(channelName), channel_id: '', error: 'unknown_channel' }
  }
  if (!env.COMPOSIO_API_KEY) {
    return { ok: false, channel: String(channelName), channel_id: channelId, error: 'no_composio_key' }
  }

  const mcp = new ComposioMCP(env.COMPOSIO_API_KEY)
  const args: Record<string, any> = {
    channel: channelId,
    text: String(opts.text || '').slice(0, 3000),
  }
  if (opts.blocks) args.blocks = opts.blocks
  if (opts.thread_ts) args.thread_ts = opts.thread_ts
  if (opts.unfurl_links === false) args.unfurl_links = false

  for (const slug of SLACK_SLUGS) {
    try {
      const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [{ tool_slug: slug, arguments: args }],
      })
      const text = (result.content || []).map((c: any) => c.text ?? '').join('\n')
      if (!text) continue
      let parsed: any
      try { parsed = JSON.parse(text) } catch { continue }
      const inner = parsed?.data?.results?.[0]
      const innerError = String(inner?.error || '')
      // If "Tool not found", try the next slug.
      if (innerError && /not.?found|unknown.?tool|no.?such.?tool/i.test(innerError)) continue
      if ((result as any)?.isError) {
        return { ok: false, channel: String(channelName), channel_id: channelId, error: innerError || 'mcp_is_error' }
      }
      if (inner?.response?.successful === false) {
        return { ok: false, channel: String(channelName), channel_id: channelId, error: String(inner.response.error || 'tool_failed') }
      }
      const ts = inner?.response?.data?.ts || inner?.response?.data?.message?.ts || ''
      // Mirror to unified event log so terminal Anouf can poll /events/recent.
      appendEvent(env, {
        kind: 'slack_post',
        source: `slack/#${channelName}`,
        text: opts.text.slice(0, 400),
      }).catch(() => {})
      return { ok: true, channel: String(channelName), channel_id: channelId, ts }
    } catch (err: any) {
      // Network or parse error — try next slug
      continue
    }
  }
  return { ok: false, channel: String(channelName), channel_id: channelId, error: 'all_slugs_failed' }
}

// ---------- Block Kit helpers -------------------------------------------------

export function headerBlock(text: string): any {
  return { type: 'header', text: { type: 'plain_text', text: text.slice(0, 150), emoji: true } }
}

export function sectionBlock(markdown: string): any {
  return { type: 'section', text: { type: 'mrkdwn', text: markdown.slice(0, 2900) } }
}

export function contextBlock(...lines: string[]): any {
  return {
    type: 'context',
    elements: lines.map(l => ({ type: 'mrkdwn', text: l.slice(0, 150) })),
  }
}

export function dividerBlock(): any {
  return { type: 'divider' }
}

// ---------- Specialised posters used across the codebase ---------------------

export async function postCouncilSummary(
  env: any,
  conversationId: string,
  input: string,
  finalAnswer: string,
  durationMs: number,
  fromCache: boolean,
): Promise<PostResult> {
  const inputShort = input.replace(/\n+/g, ' ').slice(0, 280)
  const answerShort = finalAnswer.replace(/\n+/g, ' ').slice(0, 600)
  const dashLink = `https://nao00.nchobah.com/dashboard#${conversationId}`
  const blocks = [
    sectionBlock(`*${fromCache ? '⚡' : '🧠'}* _${inputShort}_`),
    sectionBlock(`> ${answerShort}`),
    contextBlock(
      `${fromCache ? 'cache hit' : 'council'} · ${durationMs}ms`,
      `<${dashLink}|open in dashboard>`,
    ),
  ]
  return postToChannel(env, 'council', { text: `${inputShort} ⇒ ${answerShort}`, blocks })
}

export async function postOrchestratorEvent(
  env: any,
  goalId: string,
  event: 'created' | 'planned' | 'step_ok' | 'step_error' | 'done' | 'failed' | 'killed',
  detail: string,
): Promise<PostResult> {
  const emojiByEvent: Record<string, string> = {
    created: '🎯', planned: '📋', step_ok: '✅', step_error: '⚠️',
    done: '🏁', failed: '💥', killed: '🛑',
  }
  const emoji = emojiByEvent[event] || '•'
  const text = `${emoji} *${event}* · \`${goalId.slice(0, 8)}\` — ${detail.slice(0, 500)}`
  return postToChannel(env, 'orchestrator', { text })
}

export async function postIncident(env: any, title: string, detail: string): Promise<PostResult> {
  const blocks = [
    sectionBlock(`🚨 *${title}*`),
    sectionBlock(detail.slice(0, 2900)),
    contextBlock(`reported ${new Date().toISOString()}`),
  ]
  return postToChannel(env, 'incidents', { text: `🚨 ${title}: ${detail}`.slice(0, 500), blocks })
}

export async function postFirehose(env: any, line: string): Promise<PostResult> {
  return postToChannel(env, 'all-nao00', { text: line.slice(0, 1500) })
}
