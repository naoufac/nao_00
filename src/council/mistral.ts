import { recordUsage, mistralUsage } from '../metrics/api-use'

export async function callMistral(input: string, nao44Opinion: string, toolResult: string, apiKey: string, db?: D1Database) {
  const start = Date.now()
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are the Logic Check in nao_00's council. You are SILENT — you never talk to the user directly.
Your job: validate the logic of the previous two opinions. Find contradictions. Check facts.
Output ONLY JSON: {"verdict": {"decision": "agree|disagree|partial", "reason": "...", "risk": "low|medium|high", "contradictions": []}, "confidence": 0.0}`
        },
        {
          role: 'user',
          content: `Question: ${input}\nnao44: ${nao44Opinion}\nTool result: ${toolResult}\n\nLogic check (does nao44's plan + the tool outcome actually answer the question? flag contradictions):`
        }
      ]
    })
  })
  const data: any = await response.json()
  if (db) {
    const u = mistralUsage(data)
    await recordUsage(db, {
      source: 'mistral', model: 'mistral-large-latest',
      input_tokens: u.input, output_tokens: u.output,
      duration_ms: Date.now() - start
    })
  }
  const text = data.choices?.[0]?.message?.content || '{"verdict":{"decision":"agree","reason":"insufficient data","risk":"low","contradictions":[]},"confidence":0.5}'
  try {
    return JSON.parse(text)
  } catch {
    return { verdict: { decision: 'agree', reason: text, risk: 'low', contradictions: [] }, confidence: 0.5 }
  }
}
