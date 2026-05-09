// auto_drafter — pulls today's gab44 daily horoscope from KV and drafts a
// telegram-friendly post into Postiz (via Composio MCP). Type=draft so
// Naoufal reviews in the postiz UI before publish.
import { ComposioMCP } from '../tools/composio'

const SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
]
const TELEGRAM_INTEGRATION_ID = 'cmow7p7s601wvns0ytszhd9ji'

export interface AutoDrafterEnv {
  KV: KVNamespace
  COMPOSIO_API_KEY: string
}

export async function runAutoDrafter(env: AutoDrafterEnv, db: D1Database) {
  const started = Date.now()
  await db.exec(
    'CREATE TABLE IF NOT EXISTS streams_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, name TEXT, ok INTEGER, count INTEGER, duration_ms INTEGER, error TEXT)'
  )

  const now = new Date()
  const ymd = now.toISOString().slice(0, 10)
  const sign = SIGNS[now.getUTCDate() % 12]
  const key = `gab44:daily:${ymd}:${sign}`

  try {
    const raw = await env.KV.get(key)
    if (!raw) throw new Error(`no horoscope in KV at ${key}`)
    const horoscope = JSON.parse(raw) as { text?: string; horoscope?: string }
    const body = (horoscope.text || horoscope.horoscope || '').trim()
    if (!body) throw new Error(`empty horoscope body for ${sign}`)

    const signLabel = sign.charAt(0).toUpperCase() + sign.slice(1)
    let html =
      `<p><strong>gab44 daily — ${signLabel}</strong></p>` +
      `<p>${body}</p>` +
      `<p>All signs → nao00.nchobah.com/gab44/daily?sign=YOUR_SIGN</p>`
    if (html.length > 4096) html = html.slice(0, 4090) + '…</p>'

    const scheduleAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

    const mcp = new ComposioMCP(env.COMPOSIO_API_KEY)
    const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
      tools: [
        {
          tool_slug: 'POSTIZ_MCP_INTEGRATIONSCHEDULEPOSTTOOL',
          arguments: {
            socialPost: [
              {
                type: 'draft',
                date: scheduleAt,
                shortLink: false,
                integrationId: TELEGRAM_INTEGRATION_ID,
                isPremium: false,
                settings: [],
                postsAndComments: [{ content: html, attachments: [] }]
              }
            ]
          }
        }
      ]
    })

    const text = result?.content?.[0]?.text ?? ''
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch { /* leave null */ }
    if (result?.isError) throw new Error(`mcp returned isError: ${text.slice(0, 300)}`)

    const inner = parsed?.results?.[0] ?? parsed?.[0] ?? parsed
    const data = inner?.data ?? inner?.result ?? inner
    const postId =
      data?.postId ?? data?.id ?? data?.[0]?.id ?? data?.posts?.[0]?.id ?? null

    if (inner && inner.successful === false) {
      throw new Error(`postiz failed: ${inner.error || text.slice(0, 300)}`)
    }

    const duration_ms = Date.now() - started
    await db.prepare(
      'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(new Date().toISOString(), 'auto_drafter', 1, 1, duration_ms, null).run()

    return { ok: true as const, sign, postId, duration_ms }
  } catch (e: any) {
    const duration_ms = Date.now() - started
    const error = e?.message || String(e)
    await db.prepare(
      'INSERT INTO streams_runs (ts, name, ok, count, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(new Date().toISOString(), 'auto_drafter', 0, 0, duration_ms, error).run()
    return { ok: false as const, error, duration_ms }
  }
}
