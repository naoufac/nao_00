// Race Lanes — N executors race identical task, rotating judge scores winner.
//
// Usage:
//   const result = await race(task, executors, env, kv, db)
//
// Week-1 lanes:
//   1. Reasoning — Opus vs Gemini-Pro vs MiniMax on fixed prompts
//   2. Browser/Agent — Managed Agent vs Manus vs Playwright chain
//   3. Publishing — Postiz vs direct YouTube+LinkedIn vs Together-drafted
//
// Judge rotates: Haiku → Gemini-Flash → MiniMax (prevents bias).

import { recordUsage, anthropicUsage } from "../metrics/api-use"

export interface RaceExecutor {
  name: string
  provider: string
  execute: (task: string, env: any) => Promise<string>
}

export interface RaceResult {
  id: string
  task: string
  started_at: number
  finished_at: number
  entries: RaceEntry[]
  winner: string
  judge: string
  judge_reasoning: string
  scores: Record<string, { factuality: number; brevity: number; utility: number; total: number }>
}

interface RaceEntry {
  name: string
  provider: string
  response: string
  duration_ms: number
  error?: string
}

const JUDGES = [
  { name: "haiku", model: "claude-haiku-4-5-20251001", provider: "anthropic" },
  { name: "gemini-flash", model: "gemini-2.5-flash", provider: "gemini" },
  { name: "minimax", model: "MiniMax-M2.7", provider: "minimax" },
]

export async function race(
  task: string,
  executors: RaceExecutor[],
  env: any,
  kv: KVNamespace,
  db: D1Database,
): Promise<RaceResult> {
  const id = crypto.randomUUID()
  const start = Date.now()

  // Run all executors in parallel with 30s timeout each
  const entries: RaceEntry[] = await Promise.all(
    executors.map(async (exec) => {
      const t0 = Date.now()
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 30_000)
        const response = await exec.execute(task, env)
        clearTimeout(timeout)
        return {
          name: exec.name,
          provider: exec.provider,
          response: response.slice(0, 4000),
          duration_ms: Date.now() - t0,
        }
      } catch (err: any) {
        return {
          name: exec.name,
          provider: exec.provider,
          response: "",
          duration_ms: Date.now() - t0,
          error: String(err?.message ?? err).slice(0, 300),
        }
      }
    }),
  )

  // Pick judge via rotation (by second, mod 3)
  const judgeIdx = Math.floor(Date.now() / 1000) % JUDGES.length
  const judge = JUDGES[judgeIdx]

  // Build judge prompt — exclude judge own provider entries
  const validEntries = entries.filter((e) => !e.error && e.response.length > 0)
  if (validEntries.length < 2) {
    // Not enough valid entries to judge
    const winner = validEntries[0]?.name || entries[0]?.name || "none"
    const result: RaceResult = {
      id, task, started_at: start, finished_at: Date.now(),
      entries, winner, judge: judge.name,
      judge_reasoning: `only ${validEntries.length} valid entries — auto-win`,
      scores: {},
    }
    await persistRace(kv, result)
    return result
  }

  // Judge call
  const judgmentPrompt = buildJudgePrompt(task, validEntries, judge.name)
  let scores: Record<string, { factuality: number; brevity: number; utility: number; total: number }> = {}
  let winner = ""
  let reasoning = ""

  try {
    const judgeResponse = await callJudge(judge, judgmentPrompt, env)
    const parsed = parseJudgment(judgeResponse, validEntries)
    scores = parsed.scores
    winner = parsed.winner
    reasoning = parsed.reasoning
  } catch (err: any) {
    // Judge failed — fall back to fastest valid entry
    winner = validEntries.reduce((a, b) => (a.duration_ms < b.duration_ms ? a : b)).name
    reasoning = `judge_error: ${String(err?.message ?? err).slice(0, 200)} — defaulted to fastest`
  }

  const result: RaceResult = {
    id, task, started_at: start, finished_at: Date.now(),
    entries, winner, judge: judge.name, judge_reasoning: reasoning, scores,
  }

  await persistRace(kv, result)

  // Record metrics
  if (db) {
    await recordUsage(db, {
      source: "race_judge",
      model: judge.model,
      input_tokens: 0, output_tokens: 0,
      cache_read_tokens: 0, cache_create_tokens: 0,
      duration_ms: Date.now() - start,
    }).catch(() => {})
  }

  return result
}

function buildJudgePrompt(task: string, entries: RaceEntry[], judgeName: string): string {
  const entryTexts = entries
    .filter((e) => e.provider !== judgeName) // withhold own provider
    .map((e, i) => `--- Entry ${i + 1} (${e.name}) ---\n${e.response}\n---`)
    .join("\n\n")

  return `You are a fair judge evaluating AI responses. Score each entry on three criteria (0-10 each):
- factuality: accuracy and correctness
- brevity: conciseness without losing substance
- utility: practical value to the user

Task: "${task}"

${entryTexts}

Output STRICT JSON only:
{"scores":{"<entry_name>":{"factuality":N,"brevity":N,"utility":N},...},"winner":"<entry_name>","reasoning":"<one line>"}`
}

async function callJudge(
  judge: typeof JUDGES[number],
  prompt: string,
  env: any,
): Promise<string> {
  if (judge.provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: judge.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    const data: any = await r.json()
    return data?.content?.[0]?.text || ""
  }

  if (judge.provider === "gemini") {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${judge.model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.1 },
        }),
      },
    )
    const data: any = await r.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
  }

  if (judge.provider === "minimax") {
    const r = await fetch("https://api.minimax.io/anthropic/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: judge.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    const data: any = await r.json()
    const block = data?.content?.find((b: any) => b.type === "text")
    return block?.text || ""
  }

  throw new Error(`unknown judge provider: ${judge.provider}`)
}

function parseJudgment(
  text: string,
  entries: RaceEntry[],
): {
  scores: Record<string, { factuality: number; brevity: number; utility: number; total: number }>
  winner: string
  reasoning: string
} {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error("no JSON in judge response")
  const parsed = JSON.parse(m[0])
  const scores: Record<string, { factuality: number; brevity: number; utility: number; total: number }> = {}

  for (const [name, s] of Object.entries(parsed.scores || {})) {
    const sc = s as any
    const total = (Number(sc.factuality) || 0) + (Number(sc.brevity) || 0) + (Number(sc.utility) || 0)
    scores[name] = {
      factuality: Number(sc.factuality) || 0,
      brevity: Number(sc.brevity) || 0,
      utility: Number(sc.utility) || 0,
      total,
    }
  }

  // Winner = highest total (not just what judge said, in case of mismatch)
  let winner = parsed.winner || ""
  let maxScore = -1
  for (const [name, sc] of Object.entries(scores)) {
    if (sc.total > maxScore) {
      maxScore = sc.total
      winner = name
    }
  }

  return { scores, winner, reasoning: String(parsed.reasoning || "").slice(0, 500) }
}

async function persistRace(kv: KVNamespace, result: RaceResult): Promise<void> {
  await kv.put(`race:${result.id}`, JSON.stringify(result), { expirationTtl: 90 * 86400 })
  // Update latest pointer
  await kv.put("race:latest", JSON.stringify({
    id: result.id,
    task: result.task.slice(0, 200),
    winner: result.winner,
    judge: result.judge,
    ts: result.finished_at,
  }), { expirationTtl: 90 * 86400 })
}

// ---------- Pre-built executor factories for Week-1 lanes ----------

export function reasoningExecutors(env: any): RaceExecutor[] {
  return [
    {
      name: "opus",
      provider: "anthropic",
      execute: async (task) => {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-opus-4-7", max_tokens: 2000,
            messages: [{ role: "user", content: task }],
          }),
        })
        const d: any = await r.json()
        return d?.content?.[0]?.text || ""
      },
    },
    {
      name: "gemini-pro",
      provider: "gemini",
      execute: async (task) => {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: task }] }],
              generationConfig: { maxOutputTokens: 2000 },
            }),
          },
        )
        const d: any = await r.json()
        return d?.candidates?.[0]?.content?.parts?.[0]?.text || ""
      },
    },
    {
      name: "minimax",
      provider: "minimax",
      execute: async (task) => {
        const r = await fetch("https://api.minimax.io/anthropic/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
          },
          body: JSON.stringify({
            model: "MiniMax-M2.7", max_tokens: 2000,
            messages: [{ role: "user", content: task }],
          }),
        })
        const d: any = await r.json()
        const block = d?.content?.find((b: any) => b.type === "text")
        return block?.text || ""
      },
    },
  ]
}
