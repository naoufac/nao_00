// Image generation via NVIDIA NIM — black-forest-labs/flux.1-schnell.
// Same NVIDIA_API_KEY as Nemotron. Returns base64 JPEG (data URL ready).
// flux.1-schnell = fast variant, 4 steps. Use flux.1-dev for higher quality at slower latency.

import { recordUsage } from '../metrics/api-use'

export type ImageModel = 'flux.1-schnell' | 'flux.1-dev' | 'sdxl-turbo'

const MODEL_URL: Record<ImageModel, string> = {
  'flux.1-schnell': 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell',
  'flux.1-dev':     'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev',
  'sdxl-turbo':     'https://ai.api.nvidia.com/v1/genai/stabilityai/sdxl-turbo'
}

export interface ImageGenCall {
  prompt: string
  model?: ImageModel
  width?: number
  height?: number
  seed?: number
  steps?: number
}

export interface ImageGenResult {
  data_url: string          // ready to drop into <img src=...>
  model: ImageModel
  duration_ms: number
  width: number
  height: number
}

export async function generateImage(
  call: ImageGenCall,
  apiKey: string,
  db?: D1Database
): Promise<ImageGenResult> {
  const start = Date.now()
  const model = call.model ?? 'flux.1-schnell'
  const width = call.width ?? 1024
  const height = call.height ?? 1024
  const steps = call.steps ?? (model === 'flux.1-schnell' ? 4 : 25)

  const res = await fetch(MODEL_URL[model], {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: call.prompt,
      width, height,
      seed: call.seed ?? Math.floor(Math.random() * 1_000_000),
      steps
    })
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`image gen ${res.status}: ${txt.slice(0, 300)}`)
  }

  const data: any = await res.json()
  const b64 = data?.artifacts?.[0]?.base64 ?? data?.image ?? ''
  if (!b64) throw new Error('no image returned')

  const duration_ms = Date.now() - start

  if (db) {
    // Treat each image as one "call" to track usage on the map. We don't have
    // token counts for image models, so we record duration and a synthetic
    // 1-token signal so it appears in the model breakdown.
    await recordUsage(db, {
      source: 'image_gen',
      model: `nvidia/${model}`,
      input_tokens: 1,
      output_tokens: 1,
      cache_read_tokens: 0,
      cache_create_tokens: 0,
      duration_ms
    })
  }

  return {
    data_url: `data:image/jpeg;base64,${b64}`,
    model, duration_ms, width, height
  }
}
