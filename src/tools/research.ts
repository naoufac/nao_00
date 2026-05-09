// Web research tool — Cloudflare-only path via Composio's COMPOSIO_SEARCH_WEB.
// (OpenRouter dropped from the fleet 2026-05-07 — research now rides the same
// MCP rail that powers gmail/slack/etc.)
//
// COMPOSIO_SEARCH_WEB returns a search-grounded answer plus citations under
// data.citations[]. The toolkit "composio_search" does not require auth.

import { ComposioMCP } from './composio'

export interface ResearchResult {
  answer: string
  citations: string[]
  duration_ms: number
}

export async function researchWeb(
  query: string,
  composioApiKey: string,
  _aiBinding: any,
  _db?: D1Database
): Promise<ResearchResult> {
  const start = Date.now()
  const mcp = new ComposioMCP(composioApiKey)
  // COMPOSIO_SEARCH_WEB is invoked via the meta-tool COMPOSIO_MULTI_EXECUTE_TOOL
  // because individual composio_search slugs aren't exposed directly on the MCP surface.
  const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
    tools: [{ tool_slug: 'COMPOSIO_SEARCH_WEB', arguments: { query } }]
  })
  const text = (result.content || [])
    .map((c: any) => c.text ?? (c.data ? JSON.stringify(c.data) : ''))
    .join('\n')

  let answer = ''
  const citations: string[] = []
  try {
    const parsed = JSON.parse(text)
    // Multi-execute wraps each call: { data: { results: [{ response: { data: {...} } }] } }
    const inner = parsed?.data?.results?.[0]?.response?.data ?? parsed?.data ?? parsed
    answer = inner?.answer ?? inner?.content ?? inner?.summary ?? ''
    const cites = inner?.citations ?? []
    if (Array.isArray(cites)) {
      for (const c of cites.slice(0, 5)) {
        const url = c?.url ?? c?.id ?? ''
        const title = c?.title ?? ''
        if (url) citations.push(title ? `${title} — ${url}` : url)
      }
    }
    if (!answer) {
      const results = inner?.results ?? inner?.organic ?? []
      if (Array.isArray(results) && results.length) {
        answer = results.slice(0, 3).map((r: any) => `${r.title ?? ''}: ${r.snippet ?? r.description ?? ''}`).join('\n')
      }
    }
  } catch {
    answer = text.slice(0, 1500)
  }

  if (!answer) answer = '[research returned no answer]'
  return { answer, citations, duration_ms: Date.now() - start }
}
