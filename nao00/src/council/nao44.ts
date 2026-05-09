export async function callNao44(input: string, userContext: string, apiKey: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: `You are nao44, Naoufal's personal guardian AI. You know him deeply.
Context about Naoufal: ${userContext}

Your role in the council:
- Filter everything for Naoufal's BEST interest
- Consider his emotional state, goals, current situation
- Be honest, protective, strategic
- Respond with your opinion and a confidence score (0-1)

Format your response as JSON: {"opinion": "...", "confidence": 0.0, "needs_world_check": true/false, "grok_question": "..."}`,
      messages: [{ role: 'user', content: input }]
    })
  })
  const data: any = await response.json()
  const text = data.content?.[0]?.text || '{"opinion": "I need more context", "confidence": 0.5}'
  try {
    return JSON.parse(text)
  } catch {
    return { opinion: text, confidence: 0.7, needs_world_check: true, grok_question: input }
  }
}
