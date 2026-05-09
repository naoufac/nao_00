// Self-eval — every N interactions, ask Anthropic to mine the recent council
// transcripts for recurring themes and update Naoufal's user_context.

const EVAL_EVERY = 15

interface ConvRow {
  id: string
  input: string
  final_output: string
  created_at: string
}

async function shouldEvalRun(kv: KVNamespace, db: D1Database): Promise<boolean> {
  const totalRow = await db.prepare('SELECT COUNT(*) AS n FROM conversations').first<{ n: number }>()
  const total = totalRow?.n ?? 0
  const lastRaw = await kv.get('eval:last_run_count')
  const last = lastRaw ? Number(lastRaw) : 0
  if (total - last < EVAL_EVERY) return false
  // Stamp BEFORE running so two parallel hits do not double-trigger
  await kv.put('eval:last_run_count', String(total))
  return true
}

export async function maybeRunSelfEval(
  env: { ANTHROPIC_API_KEY: string },
  kv: KVNamespace,
  db: D1Database,
  options: { force?: boolean } = {}
): Promise<{ ran: boolean; insights?: string }> {
  if (!options.force && !(await shouldEvalRun(kv, db))) return { ran: false }

  const rowsRes = await db
    .prepare(
      'SELECT id, input, final_output, created_at FROM conversations ORDER BY created_at DESC LIMIT 15'
    )
    .all<ConvRow>()
  const rows = rowsRes.results || []
  if (rows.length === 0) return { ran: false }

  const transcript = rows
    .map((r, i) => `[${i + 1}] (${r.created_at})\nQ: ${r.input}\nA: ${r.final_output}`)
    .join('\n\n')

  const prompt = `You are reviewing the last ${rows.length} conversations Naoufal had with his personal AI council.
Mine them for signal:

1. Recurring topics — what does he keep returning to?
2. Tensions — decisions he is wrestling with.
3. Stable preferences — things about how he wants to work or live.
4. A short refreshed user_context (one paragraph, ~3 sentences) that future council runs should know.

Output ONLY JSON:
{"recurring_topics":[],"tensions":[],"preferences":[],"user_context":"..."}

Transcript:
${transcript}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return { ran: false, insights: `eval_failed:${res.status}:${errText.slice(0, 200)}` }
  }
  const data: any = await res.json()
  const text: string = data.content?.[0]?.text || ''

  let parsed: any = null
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try { parsed = JSON.parse(match[0]) } catch {}
    }
  }
  if (!parsed) return { ran: true, insights: 'unparseable' }

  const stamp = new Date().toISOString()
  await kv.put(`eval:insights:${stamp}`, JSON.stringify(parsed), { expirationTtl: 60 * 60 * 24 * 180 })

  if (typeof parsed.user_context === 'string' && parsed.user_context.trim().length > 0) {
    await kv.put('user:context', parsed.user_context.trim())
  }

  await kv.put('eval:last_insights', JSON.stringify({ at: stamp, ...parsed }))
  return { ran: true, insights: stamp }
}
