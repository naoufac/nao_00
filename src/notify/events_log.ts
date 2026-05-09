// Unified event log — every Slack post, council turn, orchestrator state
// change, and synthesis tick writes one row here. Three reads of the same
// log:
//   1. #all-nao00 firehose Slack channel  (you, in Slack)
//   2. /events/recent?since=<ts>          (me, polling from terminal)
//   3. OneSignal push (≤5/day budget)      (you, on phone)
//
// Storage: Cloudflare KV. Keys:
//   events:log:<ts-13>         — single event JSON
//   events:cursor:latest       — most-recent ts (for cheap "anything new?" probe)
//
// We don't aggregate or summarize here — that's what the synthesis layer
// (~/nao00/src/notify/synthesis.ts) is for.

export type EventKind =
  | 'slack_post'
  | 'council_turn'
  | 'orchestrator_state'
  | 'synthesis_tick'
  | 'deploy'
  | 'incident'
  | 'manual'

export interface Event {
  kind: EventKind
  ts: number
  source: string                   // e.g. "council", "orchestrator/<goal-id>", "slack/#orchestrator"
  text: string                     // human-readable one-liner
  meta?: Record<string, unknown>   // any structured payload — kept tiny (<1kB)
}

const TTL_DAYS = 7
const TTL_SECONDS = TTL_DAYS * 24 * 3600

function k(ts: number): string {
  // 13-digit ms — sortable as ASCII
  return `events:log:${String(ts).padStart(13, '0')}`
}

/**
 * Append one event. Fire-and-forget — never throws, never blocks the caller.
 */
export async function appendEvent(env: any, evt: Omit<Event, 'ts'> & { ts?: number }): Promise<void> {
  if (!env?.KV) return
  const ts = evt.ts ?? Date.now()
  const row: Event = { ...evt, ts }
  try {
    await Promise.all([
      env.KV.put(k(ts), JSON.stringify(row), { expirationTtl: TTL_SECONDS }),
      env.KV.put('events:cursor:latest', String(ts), { expirationTtl: TTL_SECONDS }),
    ])
  } catch {
    // best-effort
  }
}

/**
 * Read events newer than `sinceMs`. Returns up to `limit` rows, newest first.
 */
export async function readEventsSince(env: any, sinceMs: number, limit = 50): Promise<Event[]> {
  if (!env?.KV) return []
  // KV list with prefix — we get keys back; fetch each in parallel.
  const list = await env.KV.list({ prefix: 'events:log:', limit: Math.min(limit * 4, 1000) })
  const candidates = (list.keys || [])
    .map((k: any) => k.name as string)
    .filter((name: string) => {
      const tsStr = name.slice('events:log:'.length)
      const ts = Number(tsStr)
      return Number.isFinite(ts) && ts > sinceMs
    })
    .sort()
    .reverse()
    .slice(0, limit)

  const rows = await Promise.all(candidates.map((name: string) => env.KV.get(name)))
  const out: Event[] = []
  for (const blob of rows) {
    if (!blob) continue
    try {
      out.push(JSON.parse(blob) as Event)
    } catch {
      // skip malformed
    }
  }
  return out
}

/**
 * Lightweight "is anything new since <ts>" probe — single KV get.
 * Returns the latest ts (0 if none).
 */
export async function latestEventTs(env: any): Promise<number> {
  if (!env?.KV) return 0
  const v = await env.KV.get('events:cursor:latest')
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
