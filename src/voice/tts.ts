// ElevenLabs TTS — text → audio (mp3)
// Returns Response so the worker can stream straight to the client.
export async function synthesize(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<Response> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    }
  )
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`TTS failed (${res.status}): ${errText.slice(0, 300)}`)
  }
  return res
}
