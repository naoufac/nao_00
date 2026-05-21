// Daily horoscope-by-email — gmail-driven newsletter for /subscribe opt-ins.
//
// Reads `subscribers` table (status = active, last_email_at older than 18h or
// null), generates today's horoscope for the day-of-year sign, sends via
// Composio GMAIL_SEND_EMAIL, stamps last_email_at.
//
// Designed to be invoked from the 0 0 * * * morning cron (alongside the
// social broadcast). Caps at MAX_PER_RUN per tick so a sudden subscriber
// surge can't blow through Gmail quotas — rest get caught next tick.

import { ComposioMCP } from '../tools/composio'
import { generateDailyHoroscope } from '../gab44/daily'
import { SITE_URL } from '../util/identity'

const MAX_PER_RUN = 40
const COOLDOWN_HOURS = 18
const SIGN_BY_DAY = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const
const SIGN_EMOJI: Record<string, string> = {
  aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋',
  leo: '♌', virgo: '♍', libra: '♎', scorpio: '♏',
  sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
}

function todaySign(): string {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0))
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return SIGN_BY_DAY[dayOfYear % 12]
}

export async function runDailyEmailBroadcast(env: any, _ctx: any, opts: { ignoreCooldown?: boolean } = {}): Promise<{ sent: number; skipped: string[]; total_eligible: number }> {
  const sign = todaySign()
  const Sign = sign[0].toUpperCase() + sign.slice(1)
  const emoji = SIGN_EMOJI[sign] || '✨'
  const today = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(Date.now() - COOLDOWN_HOURS * 3600 * 1000).toISOString()

  // Ensure table exists (idempotent — same DDL as /subscribe handler).
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS subscribers (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, source TEXT, created_at TEXT NOT NULL, status TEXT DEFAULT "active", last_email_at TEXT)'
  ).run()

  const rows = opts.ignoreCooldown
    ? await env.DB.prepare(
        'SELECT id, email FROM subscribers WHERE status = ? ORDER BY created_at ASC LIMIT ?'
      ).bind('active', MAX_PER_RUN).all<{ id: string; email: string }>()
    : await env.DB.prepare(
        'SELECT id, email FROM subscribers WHERE status = ? AND (last_email_at IS NULL OR last_email_at < ?) ORDER BY created_at ASC LIMIT ?'
      ).bind('active', cutoff, MAX_PER_RUN).all<{ id: string; email: string }>()
  const eligible = rows.results || []
  if (eligible.length === 0) return { sent: 0, skipped: [], total_eligible: 0 }

  // Generate today's horoscope once and reuse for everyone.
  let body = ''
  try {
    const h = await generateDailyHoroscope(sign as any, { MINIMAX_API_KEY: env.MINIMAX_API_KEY, KV: env.KV })
    body = String(h?.text || '').trim()
  } catch (err) {
    return { sent: 0, skipped: [`horoscope_gen_failed:${String((err as any)?.message ?? err).slice(0, 200)}`], total_eligible: eligible.length }
  }
  if (!body) return { sent: 0, skipped: ['empty_horoscope'], total_eligible: eligible.length }

  const subject = `${emoji} ${Sign} — ${today}`
  const baseFooter = `

—

If this landed: forward to a friend, tip a few USDC at ${SITE_URL}/support, or ask the council one free question at ${SITE_URL}/try (or unlimited for $5 USDC / 30 days at ${SITE_URL}/pricing).

You opted into the daily nao_00 horoscope at ${SITE_URL}/subscribe. Reply STOP to unsubscribe (manual handling for now).
`

  if (!env.COMPOSIO_API_KEY) return { sent: 0, skipped: ['no_composio_key'], total_eligible: eligible.length }
  const mcp = new ComposioMCP(env.COMPOSIO_API_KEY)
  let sent = 0
  const skipped: string[] = []

  for (const sub of eligible) {
    try {
      const personalBody = `hey love,

${body}${baseFooter}`
      const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
        tools: [{
          tool_slug: 'GMAIL_SEND_EMAIL',
          arguments: { recipient_email: sub.email, subject, body: personalBody },
        }],
      })
      const text = (result.content || []).map((c: any) => c.text ?? '').join('\n')
      let success = false
      try {
        const inner = JSON.parse(text)
        const r0 = inner?.data?.results?.[0]
        success = !!r0?.response?.successful
      } catch { /* ignore */ }
      if (success) {
        await env.DB.prepare('UPDATE subscribers SET last_email_at = ? WHERE id = ?').bind(new Date().toISOString(), sub.id).run()
        sent++
      } else {
        skipped.push(`${sub.email}:send_failed`)
      }
    } catch (err) {
      skipped.push(`${sub.email}:${String((err as any)?.message ?? err).slice(0, 120)}`)
    }
  }
  return { sent, skipped, total_eligible: eligible.length }
}
