// Shared response convention for nao00.
//
// Every response carries:
//   - X-Request-Id      : opaque correlation id for logs / debugging
//   - Server-Timing     : total handler duration in ms
//
// Errors use a standard JSON shape so any client can branch on it:
//   { ok: false, error: { code, message, detail? }, request_id }
//
// Success shapes are intentionally NOT rewrapped — existing consumers (the dashboard,
// remote, MCP clients) read the existing shapes directly. New endpoints that want the
// envelope can use `ok(c, data)`.

import type { Context, MiddlewareHandler } from 'hono'

type Vars = { request_id: string }

export interface ErrorBody {
  code: string
  message: string
  detail?: unknown
}

export function newRequestId(): string {
  // 12 random hex chars — short enough to read in a log, long enough to dedupe.
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const observability: MiddlewareHandler<{ Variables: Vars }> = async (c, next) => {
  const rid = c.req.header('x-request-id') || newRequestId()
  c.set('request_id', rid)
  const start = Date.now()
  try {
    await next()
  } finally {
    const dur = Date.now() - start
    c.header('X-Request-Id', rid)
    c.header('Server-Timing', `total;dur=${dur}`)
  }
}

function ridOf(c: Context): string {
  try { return (c as Context<{ Variables: Vars }>).get('request_id') || newRequestId() }
  catch { return newRequestId() }
}

export function fail(c: Context, status: number, code: string, message: string, detail?: unknown) {
  const rid = ridOf(c)
  c.header('X-Request-Id', rid)
  return c.json({ ok: false, error: { code, message, ...(detail !== undefined ? { detail } : {}) }, request_id: rid }, status as any)
}

export function ok<T>(c: Context, data: T) {
  const rid = ridOf(c)
  c.header('X-Request-Id', rid)
  return c.json({ ok: true, data, request_id: rid })
}
