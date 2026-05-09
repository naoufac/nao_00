// ElevenLabs Scribe v1 STT — audio → text
// Docs: https://api.elevenlabs.io/v1/speech-to-text  (model_id "scribe_v1")
export async function transcribe(audio: Blob, apiKey: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', audio, 'audio.webm')
  fd.append('model_id', 'scribe_v1')

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: fd
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`STT failed (${res.status}): ${errText.slice(0, 300)}`)
  }
  const data: any = await res.json()
  const text = (data.text ?? data.transcript ?? '').trim()
  if (!text) throw new Error('STT returned empty transcript')
  return text
}
