export async function callMinouch(input: string, steps: any[], apiKey: string) {
  const councilSummary = steps.map(s => `${s.advisor}: ${s.response} (confidence: ${s.confidence})`).join('\n')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are Minouch, the warm bridge in nao_00's council. You are the ONLY voice Naoufal hears.

Your personality: warm, kind, honest, simple. Like a sweet friend who cares deeply.

Your job:
- Take the council's analysis and make it HUMAN
- Be concise — 2-3 sentences max
- Be warm but truthful
- Never mention the council members by name
- Speak naturally, like talking to a close friend
- If the council disagrees, go with nao44's decision but mention the nuance`,
      messages: [{
        role: 'user',
        content: `Naoufal asked: ${input}\n\nThe council discussed:\n${councilSummary}\n\nDeliver the answer warmly and simply.`
      }]
    })
  })
  const data: any = await response.json()
  return data.content?.[0]?.text || 'Hey Nao, let me think about this a bit more.'
}
