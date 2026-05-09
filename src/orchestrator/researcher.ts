// Researcher — Phase 2 of Council of Ten.
//
// Fans out 5 parallel queries against you.com (via Composio's YOUSEARCH_YOU_SEARCH
// toolkit, probed live 2026-05-08), packs the citations into an evidence pack
// of ≤2500 tokens. The pack is the same string passed to all 8 advisors so it
// can be cached with Anthropic `cache_control`.
//
// 5-query template (per PLAN-COUNCIL-OF-TEN.md):
//   1. broad — "What is the current state of <topic>"
//   2. recency — "Recent news on <topic> in 2026"
//   3. adversarial — "Counter-arguments to <claim>"
//   4. quantitative — "Specific numbers / metrics for <topic>"
//   5. authority — "Who are the experts on <topic> and what do they say"
//
// Fallback: if YOUSEARCH returns nothing or errors, we drop to
// COMPOSIO_SEARCH_WEB (the multi-engine search lane already used by
// `tools/research.ts`). Both paths surface citations and we never fail the
// whole council if research is degraded — the advisors get a
// "[research unavailable]" pack and are told to flag low confidence.

import { ComposioMCP } from '../tools/composio'

export interface Citation {
  id: string         // c1, c2, c3...
  url: string
  title: string
  snippet: string
  query_idx: number  // which of the 5 queries surfaced it (1..5)
}

export interface EvidencePack {
  topic: string
  queries: string[]              // exactly 5
  pack_text: string              // human-readable concatenation, ≤~2500 tokens
  citations: Citation[]
  source: 'yousearch' | 'composio_search_web' | 'unavailable'
  duration_ms: number
  errors: string[]
}

const QUERY_TEMPLATES = [
  (topic: string) => `What is the current state of ${topic}`,
  (topic: string) => `Recent news on ${topic} in 2026`,
  (topic: string) => `Counter-arguments to ${topic}`,
  (topic: string) => `Specific numbers and metrics for ${topic}`,
  (topic: string) => `Who are the experts on ${topic} and what do they say`,
]

const MAX_PACK_CHARS = 9500   // ~2400 tokens at ~4 chars/token; under 2500 budget
const MAX_SNIPPET_CHARS = 280
const MAX_RESULTS_PER_QUERY = 4

function buildQueries(topic: string): string[] {
  const t = topic.replace(/^\s*should (?:we |i )/i, '').replace(/\?+$/, '').trim() || topic
  return QUERY_TEMPLATES.map(fn => fn(t).slice(0, 200))
}

async function youSearchOne(
  mcp: ComposioMCP,
  query: string,
  qIdx: number,
): Promise<{ citations: Citation[]; error?: string }> {
  try {
    const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
      tools: [{
        tool_slug: 'YOUSEARCH_YOU_SEARCH',
        arguments: { query, count: MAX_RESULTS_PER_QUERY },
      }],
    })
    const text = (result.content || []).map((c: any) => c.text ?? '').join('\n')
    if (!text) return { citations: [], error: 'empty_response' }
    let parsed: any
    try { parsed = JSON.parse(text) } catch { return { citations: [], error: 'unparseable' } }
    const inner = parsed?.data?.results?.[0]?.response ?? parsed?.data?.results?.[0]
    if (!inner) return { citations: [], error: 'no_inner_payload' }
    if (inner.successful === false) return { citations: [], error: String(inner.error || 'tool_error') }
    const data = inner?.data || inner
    // YOUSEARCH packs results as data.results.web[] or data.web[]
    const web = data?.results?.web || data?.web || data?.results?.results?.web || []
    const news = data?.results?.news || data?.news || []
    const merged = [...web, ...news].slice(0, MAX_RESULTS_PER_QUERY)
    const citations: Citation[] = merged.map((r: any, i: number) => {
      const url: string = r?.url || r?.link || ''
      const title: string = String(r?.title || '').slice(0, 200)
      const rawSnip: string = String(
        Array.isArray(r?.snippets) ? r.snippets.join(' ') : (r?.snippet || r?.description || ''),
      ).replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET_CHARS)
      return {
        id: `c${qIdx}.${i + 1}`,
        url,
        title,
        snippet: rawSnip,
        query_idx: qIdx,
      }
    }).filter(c => c.url)
    return { citations }
  } catch (err: any) {
    return { citations: [], error: String(err?.message ?? err).slice(0, 200) }
  }
}

async function composioSearchWebOne(
  mcp: ComposioMCP,
  query: string,
  qIdx: number,
): Promise<{ citations: Citation[]; error?: string }> {
  try {
    const result = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
      tools: [{ tool_slug: 'COMPOSIO_SEARCH_WEB', arguments: { query } }],
    })
    const text = (result.content || []).map((c: any) => c.text ?? '').join('\n')
    if (!text) return { citations: [], error: 'empty_response' }
    let parsed: any
    try { parsed = JSON.parse(text) } catch { return { citations: [], error: 'unparseable' } }
    const inner = parsed?.data?.results?.[0]?.response?.data ?? parsed?.data ?? {}
    const cites = Array.isArray(inner?.citations) ? inner.citations : []
    const results = Array.isArray(inner?.results) ? inner.results : (Array.isArray(inner?.organic) ? inner.organic : [])
    const merged = (cites.length ? cites : results).slice(0, MAX_RESULTS_PER_QUERY)
    const citations: Citation[] = merged.map((r: any, i: number) => ({
      id: `c${qIdx}.${i + 1}`,
      url: String(r?.url || r?.link || r?.id || ''),
      title: String(r?.title || '').slice(0, 200),
      snippet: String(r?.snippet || r?.description || r?.summary || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET_CHARS),
      query_idx: qIdx,
    })).filter((c: Citation) => !!c.url)
    if (!citations.length && inner?.answer) {
      // No citations but a synthesized answer — keep it as a single phantom cite
      return { citations: [{ id: `c${qIdx}.0`, url: 'composio:synthesized', title: 'composio synthesized answer', snippet: String(inner.answer).slice(0, MAX_SNIPPET_CHARS), query_idx: qIdx }] }
    }
    return { citations }
  } catch (err: any) {
    return { citations: [], error: String(err?.message ?? err).slice(0, 200) }
  }
}

function packEvidence(topic: string, queries: string[], allCitations: Citation[]): string {
  const header = `# EVIDENCE PACK — topic: ${topic}\n\n5 queries fanned out via you.com (Composio YOUSEARCH).\n\n`
  let body = ''
  for (let q = 1; q <= 5; q++) {
    const qCites = allCitations.filter(c => c.query_idx === q)
    body += `## Q${q}: ${queries[q - 1]}\n`
    if (!qCites.length) {
      body += `(no results)\n\n`
      continue
    }
    for (const c of qCites) {
      const line = `[${c.id}] ${c.title} — ${c.url}\n  ${c.snippet}\n`
      // Stop appending once we approach the budget; remaining cites still travel
      // in the structured array — we just don't bloat the prompt.
      if (header.length + body.length + line.length > MAX_PACK_CHARS) {
        body += `... (${allCitations.length - qCites.indexOf(c)} more results truncated)\n`
        return (header + body).slice(0, MAX_PACK_CHARS)
      }
      body += line
    }
    body += '\n'
  }
  return (header + body).slice(0, MAX_PACK_CHARS)
}

export async function buildEvidencePack(
  topic: string,
  env: any,
): Promise<EvidencePack> {
  const start = Date.now()
  const queries = buildQueries(topic)
  const errors: string[] = []

  if (!env.COMPOSIO_API_KEY) {
    return {
      topic, queries,
      pack_text: `# EVIDENCE PACK — topic: ${topic}\n\n[research unavailable: COMPOSIO_API_KEY not bound]\n`,
      citations: [], source: 'unavailable',
      duration_ms: Date.now() - start,
      errors: ['no_composio_key'],
    }
  }

  const mcp = new ComposioMCP(env.COMPOSIO_API_KEY)

  // Path A: YOUSEARCH (preferred — direct you.com via Composio).
  const yousearchResults = await Promise.all(
    queries.map((q, i) => youSearchOne(mcp, q, i + 1)),
  )
  let allCitations: Citation[] = []
  let source: EvidencePack['source'] = 'yousearch'
  for (let i = 0; i < yousearchResults.length; i++) {
    const r = yousearchResults[i]
    if (r.error) errors.push(`Q${i + 1} yousearch: ${r.error}`)
    allCitations.push(...r.citations)
  }

  // Path B fallback: if 0 citations across all 5 queries, retry via COMPOSIO_SEARCH_WEB.
  if (allCitations.length === 0) {
    source = 'composio_search_web'
    const fallbackResults = await Promise.all(
      queries.map((q, i) => composioSearchWebOne(mcp, q, i + 1)),
    )
    for (let i = 0; i < fallbackResults.length; i++) {
      const r = fallbackResults[i]
      if (r.error) errors.push(`Q${i + 1} composio_search_web: ${r.error}`)
      allCitations.push(...r.citations)
    }
  }

  if (allCitations.length === 0) source = 'unavailable'
  const pack_text = packEvidence(topic, queries, allCitations)

  return {
    topic,
    queries,
    pack_text,
    citations: allCitations,
    source,
    duration_ms: Date.now() - start,
    errors,
  }
}
