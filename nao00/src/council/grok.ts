export async function callGrok(input: string, nao44Opinion: string, apiKey: string) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://nao-00.nchobah.workers.dev',
      'X-Title': 'nao_00 council'
    },
    body: JSON.stringify({
      model: 'x-ai/grok-4',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `You are the Truth Layer in nao_00's council. Your job:
- Provide real-time truth and world data
- Challenge the first opinion if needed
- Bring a DIFFERENT perspective
- Be honest about what you don't know
- Format: JSON {"opinion": "...", "confidence": 0.0, "agrees_with_nao44": true/false, "new_data": "..."}`
        },
        {
          role: 'user',
          content: `Question: ${input}\n\nnao44's opinion: ${nao44Opinion}\n\nWhat does the world say? Do you agree or disagree?`
        }
      ]
    })
  })
  const data: any = await response.json()
  const text = data.choices?.[0]?.message?.content || '{"opinion": "Unable to verify", "confidence": 0.5}'
  try {
    return JSON.parse(text)
  } catch {
    return { opinion: text, confidence: 0.6, agrees_with_nao44: true, new_data: '' }
  }
}
