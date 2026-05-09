// MiniMax-M2.7 — frontier reasoning challenger.
// Runs in parallel with Mistral. Anthropic-compatible API at api.minimax.io/anthropic.
// Graceful: balance/auth errors return null so the council still completes via Mistral alone.

import { recordUsage, anthropicUsage } from '../metrics/api-use'

export interface MinimaxVerdict {
  decision: 'agree' | 'disagree' | 'partial'
  reason: string
  risk: 'low' | 'medium' | 'high'
  confidence: number
}

export async function callMinimax(
  input: string,
  nao44Opinion: string,
  toolResult: string,
  apiKey: string,
  db?: D1Database
): Promise<MinimaxVerdict | null> {
  if (!apiKey) return null
  const start = Date.now()
  try {
    const response = await fetch('https://api.minimax.io/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        max_tokens: 600,
        system: `You are the Frontier Reasoning Challenger in nao_00's council. SILENT — never address the user.
Output ONLY JSON: {"decision":"agree|disagree|partial","reason":"...","risk":"low|medium|high","confidence":0.0}
Reason field ≤ 280 chars. Challenge nao44's plan with deeper logic than Mistral can reach. Find blind spots.`,
        messages: [{
          role: 'user',
          content: `Question: ${input}\nnao44 plan: ${nao44Opinion}\nTool outcome: ${toolResult}\n\nDeep reasoning challenge — does the plan + tool outcome truly answer the question? Output JSON only.`
        }]
      })
    })
    const data: any = await response.json()
    if (data?.error) {
      // Balance / auth / rate-limit — log and skip without breaking council.
      return null
    }
    if (db) {
      const u = anthropicUsage(data)
      await recordUsage(db, {
        source: 'minimax', model: 'MiniMax-M2.7',
        input_tokens: u.input, output_tokens: u.output,
        duration_ms: Date.now() - start
      })
    }
    // Anthropic-compat returns content blocks. M2.7 emits a "thinking" block
    // before the "text" block — pick the first block that actually has text.
    const blocks: any[] = data?.content || []
    const text = blocks.find(b => typeof b?.text === 'string' && b.text.trim().length > 0)?.text || ''
    try {
      const parsed = JSON.parse(text)
      return {
        decision: parsed.decision ?? 'agree',
        reason: String(parsed.reason ?? '').slice(0, 280),
        risk: parsed.risk ?? 'low',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7
      }
    } catch {
      return { decision: 'agree', reason: text.slice(0, 280), risk: 'low', confidence: 0.5 }
    }
  } catch {
    return null
  }
}
