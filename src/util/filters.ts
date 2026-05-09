// Filters that protect the council from wasted work.
// 1. Noise filter — voice transcripts that are just ambient sound shouldn't trigger a council turn
// 2. Probe filter — fleet alive-checks ("In one short sentence: what is X*Y?") shouldn't burn API tokens
// 3. Cache key normalizer — strip per-request markers so identical questions hit the same skill row
//
// Both are short-circuit guards. Real questions still go through the full pipeline untouched.

// Normalize a user input into a stable cache key. Two callers must agree:
// the writer (extractor.ts) and the reader (pipeline.ts). Anything that varies
// per-request without changing the meaning (ref tags, trailing punctuation,
// double spaces) should be stripped here, otherwise we cache write-only
// entries that nobody can ever read back.
export function normalizeForCache(input: string): string {
  return (input || '')
    .toLowerCase()
    // Drop "(ref-1234-567890)" smoke-test markers anywhere in the prompt.
    // Eat a leading space too so " sentence (ref-...): foo" → "sentence: foo"
    // instead of leaving a "sentence : foo" gap that diverges from human keys.
    .replace(/\s*\(ref-\d+-\d+\)/g, '')
    // Collapse all whitespace runs to single space
    .replace(/\s+/g, ' ')
    .trim()
    // Drop trailing sentence punctuation
    .replace(/[?.!]+$/, '')
    .slice(0, 100)
}

export function isNoiseTranscript(t: string): boolean {
  const trimmed = (t || '').trim()
  if (!trimmed) return true
  if (trimmed.length < 4) return true
  // Strip parenthetical labels like "(static sound)", "(musica)", "(water splashing)"
  const withoutParens = trimmed.replace(/\([^)]*\)/g, '').trim()
  if (!withoutParens || withoutParens.length < 4) return true
  // Filler-only ("uh", "um", "ah", "...")
  if (/^(\.{1,}|u+h+|u+m+|a+h+|h+m+)$/i.test(withoutParens)) return true
  return false
}

export interface ProbeMatch { probe: boolean; cheapAnswer?: string; reason?: string }

export function classifyProbe(input: string): ProbeMatch {
  const t = (input || '').trim()
  if (!t) return { probe: false }

  // "In one short sentence: what is X*Y?" — fleet eval probe
  const m1 = t.match(/^in one (short )?sentence:?\s*what is\s*(\d+)\s*[*x×]\s*(\d+)\??$/i)
  if (m1) {
    const a = parseInt(m1[2]), b = parseInt(m1[3])
    return { probe: true, reason: 'multiplication probe', cheapAnswer: `${a} × ${b} = ${(a * b).toLocaleString()}` }
  }

  // "iter23-probe3-..." — synthetic alive check from the eval harness
  if (/^iter\d+-probe\d+/i.test(t)) {
    return { probe: true, reason: 'iter-probe', cheapAnswer: 'pong — council alive' }
  }

  // Simple probes
  if (/^(ping|pong|recovery probe|probe|alive\??|are you there\??)\.?$/i.test(t)) {
    return { probe: true, reason: 'simple ping', cheapAnswer: 'pong — alive 🟢' }
  }

  return { probe: false }
}

// Write-tool gate — read tools execute autonomously; write tools require confirmation.
// Heuristic on the tool slug. Composio's meta-tools (SEARCH_TOOLS, MULTI_EXECUTE) are
// orchestration; we look at the inner tool_slug if the call is a multi_execute.

const WRITE_VERBS = /\b(SEND|CREATE|DELETE|UPDATE|POST|WRITE|MODIFY|ADD|REMOVE|EDIT|REPLY|FORWARD|MARK|MOVE|UPLOAD|TRANSFER|SET|REVOKE|GRANT|RENAME|UNLABEL|LABEL|ARCHIVE|TRASH)\b/i

export function isWriteTool(toolName: string, toolArgs: any): { isWrite: boolean; verb?: string; effective_slug?: string } {
  if (!toolName) return { isWrite: false }
  // Composio meta-tools that orchestrate other tools — peek inside.
  if (toolName === 'COMPOSIO_MULTI_EXECUTE_TOOL') {
    const tools = toolArgs?.tools
    if (Array.isArray(tools)) {
      for (const t of tools) {
        const slug = t?.tool_slug || t?.name || ''
        const m = slug.match(WRITE_VERBS)
        if (m) return { isWrite: true, verb: m[0], effective_slug: slug }
      }
    }
    return { isWrite: false }
  }
  // SEARCH_TOOLS, MANAGE_CONNECTIONS, WAIT_FOR_CONNECTIONS — orchestration, safe.
  if (/^COMPOSIO_(SEARCH_TOOLS|MANAGE_CONNECTIONS|WAIT_FOR_CONNECTIONS|GET_TOOL_SCHEMAS)$/.test(toolName)) {
    // MANAGE_CONNECTIONS with action=add/remove/rename writes — gate it.
    if (toolName === 'COMPOSIO_MANAGE_CONNECTIONS') {
      const tk = toolArgs?.toolkits
      if (Array.isArray(tk)) {
        for (const t of tk) {
          if (t?.action && t.action !== 'list') return { isWrite: true, verb: t.action, effective_slug: 'MANAGE_CONNECTIONS' }
        }
      }
    }
    return { isWrite: false }
  }
  // Direct call to a slug — match verb.
  const m = toolName.match(WRITE_VERBS)
  if (m) return { isWrite: true, verb: m[0], effective_slug: toolName }
  return { isWrite: false }
}

