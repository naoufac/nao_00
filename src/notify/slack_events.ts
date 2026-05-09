// Slack Events API endpoint scaffold.
//
// INERT until both env.SLACK_BOT_TOKEN AND env.SLACK_SIGNING_SECRET are set.
// While inert, the endpoint returns 503 to anyone who hits it (including
// Slack's verification probe). Once tokens land, it:
//   1. Verifies HMAC-SHA256 signature on the raw body (Slack-Signature header)
//   2. Handles `url_verification` challenge (one-time during app install)
//   3. Dispatches `app_mention` and `message.im` events to the council pipeline
//   4. Replies in-thread with the council's final answer
//
// Slack delivers events via POST. We ALWAYS return 200 within 3 seconds —
// dispatch happens in `ctx.waitUntil(...)` so the council can take 10+ seconds
// without Slack retrying.

import { councilPipeline } from '../council/pipeline'
import { postToChannel, CHANNEL_IDS } from './slack_channels'

export interface SlackEventStatus {
  configured: boolean
  signing_secret_set: boolean
  bot_token_set: boolean
  state: 'not_configured' | 'webhook_only' | 'events_live'
}

export function slackAppStatus(env: any): SlackEventStatus {
  const signing_secret_set = !!env.SLACK_SIGNING_SECRET
  const bot_token_set = !!env.SLACK_BOT_TOKEN
  const state: SlackEventStatus['state'] =
    !signing_secret_set && !bot_token_set
      ? (env.COMPOSIO_API_KEY ? 'webhook_only' : 'not_configured')
      : (signing_secret_set && bot_token_set ? 'events_live' : 'webhook_only')
  return { configured: signing_secret_set && bot_token_set, signing_secret_set, bot_token_set, state }
}

// HMAC-SHA256(signingSecret, "v0:<timestamp>:<rawBody>") = "v0=<hex>"
async function verifySlackSignature(
  signingSecret: string,
  timestampHeader: string,
  signatureHeader: string,
  rawBody: string,
): Promise<boolean> {
  const ts = Number(timestampHeader)
  if (!Number.isFinite(ts)) return false
  // Reject replays older than 5 min
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`v0:${timestampHeader}:${rawBody}`))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  const expected = `v0=${hex}`

  // Constant-time comparison
  if (expected.length !== signatureHeader.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i)
  return diff === 0
}

export async function handleSlackEvent(
  request: Request,
  env: any,
  ctx: ExecutionContext,
): Promise<Response> {
  const status = slackAppStatus(env)
  if (!status.configured) {
    return new Response(JSON.stringify({
      error: 'slack_app_not_configured',
      hint: 'Add SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET to env (wrangler secret put). See ~/nao00/SLACK-PLAN.md Phase 2.',
      status,
    }), { status: 503, headers: { 'content-type': 'application/json' } })
  }

  // Read body ONCE — needed both for signature verification and JSON parsing.
  const rawBody = await request.text()

  const ts = request.headers.get('x-slack-request-timestamp') || ''
  const sig = request.headers.get('x-slack-signature') || ''
  const ok = await verifySlackSignature(env.SLACK_SIGNING_SECRET, ts, sig, rawBody)
  if (!ok) {
    return new Response(JSON.stringify({ error: 'bad_signature' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    })
  }

  let payload: any
  try { payload = JSON.parse(rawBody) } catch {
    return new Response(JSON.stringify({ error: 'bad_json' }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  // url_verification challenge — one-time when Slack first registers the URL.
  if (payload?.type === 'url_verification') {
    return new Response(JSON.stringify({ challenge: payload.challenge }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }

  // event_callback — actual events
  if (payload?.type === 'event_callback') {
    const event = payload.event || {}
    // Ignore bot's own messages to prevent loops.
    if (event?.bot_id || event?.subtype === 'bot_message') {
      return new Response('ok', { status: 200 })
    }

    if (event?.type === 'app_mention' || event?.type === 'message') {
      // Only respond to direct messages or @mentions in shared channels.
      // event.channel_type === 'im' for DMs.
      const isDM = event?.channel_type === 'im'
      const isMention = event?.type === 'app_mention'
      if (!isDM && !isMention) return new Response('ok', { status: 200 })

      // Dispatch async — Slack needs 200 within 3s.
      ctx.waitUntil(handleConversationalEvent(event, env))
      return new Response('ok', { status: 200 })
    }
  }

  // Fall-through: ack so Slack doesn't retry.
  return new Response('ok', { status: 200 })
}

async function handleConversationalEvent(event: any, env: any): Promise<void> {
  try {
    // Strip the bot @mention from the text if present.
    const rawText = String(event?.text ?? '').trim()
    const text = rawText.replace(/<@U[A-Z0-9]+>/g, '').trim()
    if (!text) return

    const result = await councilPipeline(text, env, env.KV, env.DB, null, null)

    // Reply in the same channel + thread.
    const channelId = event?.channel
    const threadTs = event?.thread_ts || event?.ts  // start a thread on root mention
    if (!channelId) return

    // Find a friendly channel name for our helper, or pass id directly.
    const friendlyName = (Object.entries(CHANNEL_IDS).find(([_, id]) => id === channelId)?.[0]) || channelId
    if (CHANNEL_IDS[friendlyName]) {
      await postToChannel(env, friendlyName, {
        text: result.final_output.slice(0, 2500),
        thread_ts: threadTs,
      })
    } else {
      // Channel isn't in our known map — post via raw composio fallback.
      // Reuse the logic in slack_channels by adding a one-off id-keyed entry.
      ;(CHANNEL_IDS as any)[channelId] = channelId
      await postToChannel(env, channelId, {
        text: result.final_output.slice(0, 2500),
        thread_ts: threadTs,
      })
    }
  } catch (err) {
    console.error('[slack_events] handleConversationalEvent failed', err)
  }
}
