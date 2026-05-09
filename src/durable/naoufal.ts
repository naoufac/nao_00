// Naoufal — per-user Durable Object.
// One DO per user_id. Holds:
//   - profile (name, focus, time zone)
//   - working_memory ring buffer (last N turns)
//   - alarms (self-eval cadence, daily refresh)
// Persistent storage uses the SQLite-backed DO API (free tier).
// This is the foundation of nao00's memory model. Everything per-user
// flows through here.

export interface Turn {
  ts: number
  input: string
  output: string
  conversation_id: string
}

export interface Profile {
  name: string
  focus: string
  tz: string
  updated_at: number
}

const RING_CAPACITY = 50  // last 50 turns kept in working memory

export class Naoufal {
  state: DurableObjectState
  env: any

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      if (request.method === 'GET' && path === '/profile') {
        const profile = (await this.state.storage.get<Profile>('profile')) ?? {
          name: 'Naoufal', focus: 'building nao00', tz: 'Asia/Bangkok', updated_at: Date.now()
        }
        return Response.json(profile)
      }

      if (request.method === 'PUT' && path === '/profile') {
        const patch = await request.json<Partial<Profile>>()
        const current = (await this.state.storage.get<Profile>('profile')) ?? {
          name: 'Naoufal', focus: '', tz: 'Asia/Bangkok', updated_at: 0
        }
        const next: Profile = { ...current, ...patch, updated_at: Date.now() }
        await this.state.storage.put('profile', next)
        return Response.json(next)
      }

      if (request.method === 'GET' && path === '/turns') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? RING_CAPACITY), RING_CAPACITY)
        const turns = await this.recentTurns(limit)
        return Response.json({ turns, total: turns.length })
      }

      if (request.method === 'POST' && path === '/turns') {
        const body = await request.json<Turn>()
        await this.appendTurn(body)
        return Response.json({ ok: true })
      }

      if (request.method === 'GET' && path === '/context') {
        // The "context blob" injected before each council call.
        // Profile + last 5 turns formatted for prompt prefix.
        const profile = (await this.state.storage.get<Profile>('profile')) ?? {
          name: 'Naoufal', focus: 'building nao00', tz: 'Asia/Bangkok', updated_at: Date.now()
        }
        const turns = await this.recentTurns(5)
        return Response.json({ profile, recent_turns: turns })
      }

      if (request.method === 'POST' && path === '/alarm/self-eval') {
        const inMs = Number(url.searchParams.get('in_ms') ?? 60 * 60 * 1000)
        await this.state.storage.setAlarm(Date.now() + inMs)
        return Response.json({ scheduled_at: Date.now() + inMs })
      }

      return new Response('not found', { status: 404 })
    } catch (err: any) {
      return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    }
  }

  // Alarm fires for self-eval cadence. Trigger an eval pass via the parent worker
  // by calling a tagged URL that the worker recognizes (out of scope for v1.8.0;
  // the alarm just records it ran).
  async alarm() {
    const ran = (await this.state.storage.get<number>('eval_alarm_count')) ?? 0
    await this.state.storage.put('eval_alarm_count', ran + 1)
    await this.state.storage.put('last_eval_alarm', Date.now())
  }

  // Ring buffer using ordered keys: turn:<padded-index>
  private async appendTurn(t: Turn): Promise<void> {
    const head = (await this.state.storage.get<number>('turn_head')) ?? 0
    const next = head + 1
    const slot = next % RING_CAPACITY
    const key = `turn:${String(slot).padStart(4, '0')}`
    await this.state.storage.put(key, t)
    await this.state.storage.put('turn_head', next)
  }

  private async recentTurns(limit: number): Promise<Turn[]> {
    const head = (await this.state.storage.get<number>('turn_head')) ?? 0
    if (head === 0) return []
    const want = Math.min(limit, RING_CAPACITY, head)
    const out: Turn[] = []
    for (let i = 0; i < want; i++) {
      const idx = head - i
      const slot = idx % RING_CAPACITY
      const key = `turn:${String(slot).padStart(4, '0')}`
      const t = await this.state.storage.get<Turn>(key)
      if (t) out.push(t)
    }
    return out  // newest first
  }
}
