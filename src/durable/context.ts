// Context DO — singleton "world snapshot" for the council.
// One instance keyed 'global'. Refreshes every 10 min via alarm():
// pulls gmail (last 30 subj+from+snippet), slack DMs (gab44 + starred),
// calendar (today + next 24h), github PRs, last 3 streams_runs. Compresses
// to a ~3kB JSON blob. Council reads this BEFORE every nao44 call so the
// world-state hits prompt cache instead of being fetched per-turn.
//
// Why a DO and not just KV: we need the compress-and-cache step to run
// once globally, not once per request. KV is the read substrate; DO is
// the writer-of-record + alarm host.

export interface ContextBlob {
  refreshed_at: number
  refresh_duration_ms: number
  gmail: { subject: string; from: string; snippet: string }[]
  slack: { channel: string; user: string; text: string; ts: string }[]
  calendar: { summary: string; start: string; end: string }[]
  github: { repo: string; title: string; url: string; state: string }[]
  streams: { name: string; ts: number; summary: string }[]
  errors: string[]
}

const FRESH_MS = 10 * 60 * 1000   // 10 min
const STALE_MS = 30 * 60 * 1000   // 30 min — past this, force refresh on read

export class ContextDO {
  state: DurableObjectState
  env: any

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
    // Self-schedule alarm if not set. First refresh in 5s so /version probes
    // the route immediately, subsequent refreshes every 10 min via alarm().
    state.blockConcurrencyWhile(async () => {
      const next = await state.storage.getAlarm()
      if (next === null) await state.storage.setAlarm(Date.now() + 5_000)
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (request.method === 'GET' && path === '/blob') {
        const blob = await this.getBlob(false)
        return Response.json(blob)
      }
      if (request.method === 'GET' && path === '/blob/fresh') {
        const blob = await this.getBlob(true)
        return Response.json(blob)
      }
      if (request.method === 'POST' && path === '/refresh') {
        const blob = await this.refresh()
        return Response.json(blob)
      }
      if (request.method === 'GET' && path === '/summary') {
        // Cheap one-line summary for the council's userContext prefix.
        const blob = await this.getBlob(false)
        return Response.json({ summary: this.summarize(blob), refreshed_at: blob.refreshed_at })
      }
      return new Response('not found', { status: 404 })
    } catch (err: any) {
      return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
        status: 500, headers: { 'content-type': 'application/json' }
      })
    }
  }

  async alarm() {
    try {
      await this.refresh()
    } catch (err) {
      // Don't let a refresh failure stop the cadence — schedule the next tick anyway.
      console.error('[ContextDO] alarm refresh failed', err)
    }
    await this.state.storage.setAlarm(Date.now() + FRESH_MS)
  }

  private async getBlob(forceFresh: boolean): Promise<ContextBlob> {
    const cached = await this.state.storage.get<ContextBlob>('blob')
    const age = cached ? Date.now() - cached.refreshed_at : Infinity
    if (cached && !forceFresh && age < STALE_MS) return cached
    return this.refresh()
  }

  private async refresh(): Promise<ContextBlob> {
    const start = Date.now()
    const errors: string[] = []
    const apiKey = this.env.COMPOSIO_API_KEY
    const blob: ContextBlob = {
      refreshed_at: start,
      refresh_duration_ms: 0,
      gmail: [], slack: [], calendar: [], github: [], streams: [], errors
    }

    if (!apiKey) {
      errors.push('COMPOSIO_API_KEY missing — context blob is empty')
      blob.refresh_duration_ms = Date.now() - start
      await this.state.storage.put('blob', blob)
      return blob
    }

    // Run all five fetches in parallel. Each is wrapped so one failure
    // doesn't sink the others (Composio rate-limits gmail and slack
    // independently).
    const [gmail, slack, cal, gh, streams] = await Promise.allSettled([
      this.fetchComposio(apiKey, 'GMAIL_FETCH_EMAILS', { max_results: 30, query: 'in:inbox' }),
      this.fetchComposio(apiKey, 'SLACK_FETCH_CONVERSATION_HISTORY', { channel: 'D0ASHUW4Q1F', limit: 20 }),
      this.fetchComposio(apiKey, 'GOOGLECALENDAR_LIST_EVENTS', {
        timeMin: new Date(Date.now() - 6 * 3600_000).toISOString(),
        timeMax: new Date(Date.now() + 24 * 3600_000).toISOString(),
        max_results: 20,
        single_events: true,
        order_by: 'startTime',
      }),
      this.fetchComposio(apiKey, 'GITHUB_LIST_PULL_REQUESTS', { owner: 'naoclaw', repo: 'nao00', state: 'open' }),
      this.fetchStreams(),
    ])

    const pickArray = (v: any, ...keys: string[]): any[] => {
      if (!v || typeof v !== 'object') return []
      for (const k of keys) {
        const found = k.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), v)
        if (Array.isArray(found)) return found
      }
      return []
    }

    if (gmail.status === 'fulfilled') {
      blob.gmail = pickArray(gmail.value, 'messages', 'data.messages').slice(0, 30).map((m: any) => ({
        subject: String(m.subject ?? '').slice(0, 120),
        from: String(m.sender ?? m.from ?? '').slice(0, 80),
        snippet: String(m.preview?.body ?? m.snippet ?? '').slice(0, 200),
      }))
    } else errors.push(`gmail:${String(gmail.reason).slice(0, 100)}`)

    if (slack.status === 'fulfilled') {
      blob.slack = pickArray(slack.value, 'messages', 'data.messages').slice(0, 15).map((m: any) => ({
        channel: 'gab44-DM',
        user: String(m.user ?? '').slice(0, 32),
        text: String(m.text ?? '').slice(0, 200),
        ts: String(m.ts ?? ''),
      }))
    } else errors.push(`slack:${String(slack.reason).slice(0, 100)}`)

    if (cal.status === 'fulfilled') {
      blob.calendar = pickArray(cal.value, 'items', 'data.items', 'events').slice(0, 15).map((e: any) => ({
        summary: String(e.summary ?? '').slice(0, 120),
        start: String(e.start?.dateTime ?? e.start?.date ?? ''),
        end: String(e.end?.dateTime ?? e.end?.date ?? ''),
      }))
    } else errors.push(`calendar:${String(cal.reason).slice(0, 100)}`)

    if (gh.status === 'fulfilled') {
      blob.github = pickArray(gh.value, 'pulls', 'data', 'data.pulls').slice(0, 10).map((p: any) => ({
        repo: 'naoclaw/nao00',
        title: String(p.title ?? '').slice(0, 120),
        url: String(p.html_url ?? p.url ?? ''),
        state: String(p.state ?? 'open'),
      }))
    } else errors.push(`github:${String(gh.reason).slice(0, 100)}`)

    if (streams.status === 'fulfilled') blob.streams = streams.value
    else errors.push(`streams:${String(streams.reason).slice(0, 100)}`)

    blob.refresh_duration_ms = Date.now() - start
    await this.state.storage.put('blob', blob)
    // Write summary to KV so councilPipeline reads it without a DO fetch.
    // This is the bridge: Context DO refreshes every 10min, KV serves reads.
    if (this.env.KV) {
      const summary = this.summarize(blob)
      await this.env.KV.put('user:context', summary, { expirationTtl: 1800 })
      await this.env.KV.put('context:blob', JSON.stringify(blob), { expirationTtl: 1800 })
    }
    return blob
  }

  private async fetchComposio(apiKey: string, slug: string, args: any): Promise<any> {
    // No mutex — DO instance is singleton + single-threaded; CF serializes concurrent fetches.
    const { ComposioMCP } = await import('../tools/composio')
    const mcp = new ComposioMCP(apiKey)
    const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
      tools: [{ tool_slug: slug, arguments: args }],
    })
    const text = (result.content || [])
      .map((c: any) => c.text ?? (c.data ? JSON.stringify(c.data) : ''))
      .join('\n')
    let parsed: any = {}
    try { parsed = JSON.parse(text) } catch { /* leave empty */ }
    // Composio MULTI_EXECUTE wraps inner results under data.results[0].response
    const inner = parsed?.data?.results?.[0]?.response ?? parsed?.data ?? parsed
    return inner
  }

  private async fetchStreams(): Promise<{ name: string; ts: number; summary: string }[]> {
    try {
      const r: any = await this.env.DB.prepare(
        'SELECT name, ts, summary FROM streams_runs ORDER BY ts DESC LIMIT 3'
      ).all()
      return (r.results ?? []).map((row: any) => ({
        name: String(row.name ?? ''),
        ts: Number(row.ts ?? 0),
        summary: String(row.summary ?? '').slice(0, 200),
      }))
    } catch {
      return []
    }
  }

  private summarize(b: ContextBlob): string {
    const ageM = Math.round((Date.now() - b.refreshed_at) / 60_000)
    const parts: string[] = []
    parts.push(`[ctx age=${ageM}m]`)
    if (b.gmail.length) parts.push(`gmail:${b.gmail.length} latest="${b.gmail[0].subject}"`)
    if (b.slack.length) parts.push(`slack:${b.slack.length}`)
    if (b.calendar.length) parts.push(`cal:${b.calendar.length} next="${b.calendar[0].summary}"`)
    if (b.github.length) parts.push(`prs:${b.github.length}`)
    if (b.errors.length) parts.push(`errs=${b.errors.length}`)
    return parts.join(' ')
  }
}
