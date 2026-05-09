import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { councilPipeline } from './council/pipeline'
import { transcribe } from './voice/stt'
import { synthesize } from './voice/tts'
import { VOICE_PAGE_HTML } from './voice/page'
import { autoImprove, maybeRunSelfEval } from './improve'

type Bindings = {
  KV: KVNamespace
  DB: D1Database
  AUTH_TOKEN: string
  ANTHROPIC_API_KEY: string
  OPENROUTER_API_KEY: string
  MISTRAL_API_KEY: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_VOICE_ID: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Health check (no auth)
app.get('/health', (c) => c.json({ status: 'alive', name: 'nao_00', version: '1.0.0' }))

// Voice page (public HTML — bearer is injected so the page can call /talk)
app.get('/voice', (c) => {
  const html = VOICE_PAGE_HTML.replace('__BEARER__', c.env.AUTH_TOKEN)
  return c.html(html)
})

// Auth for everything below
app.use('/council/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})
app.use('/talk', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})
app.use('/improve/*', async (c, next) => {
  const auth = bearerAuth({ token: c.env.AUTH_TOKEN })
  return auth(c, next)
})

// Text input -> council -> text response
app.post('/council', async (c) => {
  const { input } = await c.req.json<{ input: string }>()
  if (!input) return c.json({ error: 'input required' }, 400)

  const result = await councilPipeline(input, c.env, c.env.KV, c.env.DB)
  c.executionCtx.waitUntil(autoImprove(input, result, c.env, c.env.KV, c.env.DB))
  return c.json(result)
})

// Voice input -> council -> voice response
// Body: multipart/form-data with field "audio" (Blob)
// Response: audio/mpeg, with X-Transcript / X-Reply headers (URI-encoded)
app.post('/talk', async (c) => {
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    return c.json({ error: 'multipart/form-data body required with field "audio"' }, 400)
  }
  const audio = form.get('audio')
  if (!(audio instanceof Blob) || audio.size === 0) {
    return c.json({ error: 'audio file required (multipart field "audio")' }, 400)
  }

  let transcript: string
  try {
    transcript = await transcribe(audio, c.env.ELEVENLABS_API_KEY)
  } catch (err: any) {
    return c.json({ error: 'stt_failed', detail: String(err?.message || err) }, 502)
  }

  const result = await councilPipeline(transcript, c.env, c.env.KV, c.env.DB)
  c.executionCtx.waitUntil(autoImprove(transcript, result, c.env, c.env.KV, c.env.DB))

  const reply = result.final_output
  const voiceId = c.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
  let ttsRes: Response
  try {
    ttsRes = await synthesize(reply, c.env.ELEVENLABS_API_KEY, voiceId)
  } catch (err: any) {
    return c.json({
      error: 'tts_failed',
      detail: String(err?.message || err),
      transcript,
      reply,
      conversation_id: result.id
    }, 502)
  }

  return new Response(ttsRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'X-Conversation-Id': result.id,
      'X-Transcript': encodeURIComponent(transcript),
      'X-Reply': encodeURIComponent(reply)
    }
  })
})

// Council history
app.get('/council/history', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT id, input, final_output, created_at FROM conversations ORDER BY created_at DESC LIMIT 50'
  ).all()
  return c.json(results)
})

// Retrieve past session
app.get('/council/:id', async (c) => {
  const id = c.req.param('id')
  const conv = await c.env.DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(id).first()
  if (!conv) return c.json({ error: 'not found' }, 404)
  const steps = await c.env.DB.prepare('SELECT * FROM council_steps WHERE conversation_id = ? ORDER BY step_order').bind(id).all()
  return c.json({ conversation: conv, steps: steps.results })
})

// Auto-improve introspection
app.get('/improve/skills', async (c) => {
  const results = await c.env.DB.prepare(
    'SELECT id, pattern, answer, confidence, used_count, created_at FROM skills ORDER BY id DESC LIMIT 100'
  ).all()
  return c.json(results)
})

app.get('/improve/insights', async (c) => {
  const last = await c.env.KV.get('eval:last_insights')
  const userContext = await c.env.KV.get('user:context')
  return c.json({
    user_context: userContext,
    last_insights: last ? JSON.parse(last) : null
  })
})

app.post('/improve/eval', async (c) => {
  // ?force=1 ignores the 15-conversation threshold (for ops / manual runs)
  const force = c.req.query('force') === '1'
  const out = await maybeRunSelfEval(c.env, c.env.KV, c.env.DB, { force })
  return c.json(out)
})

export default app
