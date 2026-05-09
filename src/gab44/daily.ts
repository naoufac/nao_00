// Daily horoscope generator for gab44 — Naoufal's astrology brand.
// Uses MiniMax-M2.7 (Anthropic-compatible endpoint, coding-plan tier).
// Per-sign+date cache in KV so repeated reads same day don't burn quota.

const SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
] as const

export type Sign = typeof SIGNS[number]

export function isValidSign(s: string): s is Sign {
  return (SIGNS as readonly string[]).includes(s.toLowerCase())
}

export interface DailyHoroscope {
  sign: Sign
  date: string  // YYYY-MM-DD
  text: string
  source: string
  cached: boolean
  generated_at: string
}

const SYSTEM_PROMPT = `You are gab44 — a warm, modern astrology voice. Naoufal's brand. You write daily horoscopes that feel like a sweet friend texting you, not a printed calendar.

Style: warm, specific, modern, never woo-woo. No "the planets align" filler. Mention one concrete energy, one practical move, one tiny encouragement. 3-5 sentences max. No emojis in the body — leave that for the post layer.

Output ONLY the horoscope text. No headers, no preamble, no sign mention (the caller knows which sign it is).`

export async function generateDailyHoroscope(
  sign: Sign,
  env: { MINIMAX_API_KEY: string; KV: KVNamespace },
  forceFresh = false
): Promise<DailyHoroscope> {
  const date = new Date().toISOString().slice(0, 10)
  const key = `gab44:daily:${date}:${sign}`

  if (!forceFresh) {
    const cached = await env.KV.get(key)
    if (cached) {
      const parsed = JSON.parse(cached) as DailyHoroscope
      return { ...parsed, cached: true }
    }
  }

  const response = await fetch('https://api.minimax.io/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.MINIMAX_API_KEY}`
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.7',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Daily horoscope for ${sign}, ${date}. Write it now.`
      }]
    })
  })

  const data: any = await response.json()
  if (data?.error) {
    throw new Error(`minimax: ${data.error?.message || JSON.stringify(data.error)}`)
  }

  const blocks: any[] = data?.content || []
  const text = blocks.find(b => typeof b?.text === 'string' && b.text.trim().length > 0)?.text?.trim() || ''
  if (!text) {
    throw new Error('minimax returned no text content')
  }

  const result: DailyHoroscope = {
    sign,
    date,
    text,
    source: 'minimax-m2.7',
    cached: false,
    generated_at: new Date().toISOString()
  }

  // Cache 36h — covers same-day reads in any timezone, expires before tomorrow's run.
  await env.KV.put(key, JSON.stringify(result), { expirationTtl: 36 * 3600 })

  return result
}

export async function generateAllSigns(
  env: { MINIMAX_API_KEY: string; KV: KVNamespace }
): Promise<DailyHoroscope[]> {
  // Sequential — minimax coding-plan tier rate-limits parallel reasoning calls.
  const out: DailyHoroscope[] = []
  for (const sign of SIGNS) {
    try {
      out.push(await generateDailyHoroscope(sign, env))
    } catch (err: any) {
      out.push({
        sign,
        date: new Date().toISOString().slice(0, 10),
        text: `(generation failed: ${err.message?.slice(0, 80) || 'unknown'})`,
        source: 'minimax-m2.7',
        cached: false,
        generated_at: new Date().toISOString()
      })
    }
  }
  return out
}

export { SIGNS }
