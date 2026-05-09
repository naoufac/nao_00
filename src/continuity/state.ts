// Continuity state aggregator — builds the daily report blob.
// Sections: Yesterday, Today, Blockers, Pillar.
// Runs hourly (every 4th */15 tick). Stored in KV with 90-day TTL.

import { buildSnapshot } from "../metrics/api-use"

export interface ContinuityReport {
  ts: number
  date: string
  yesterday: YesterdaySection
  today: TodaySection
  blockers: string[]
  pillar: PillarSection
}

interface YesterdaySection {
  conversations: number
  goals_completed: number
  goals_failed: number
  skills_extracted: number
  top_topics: string[]
  deploys: number
}

interface TodaySection {
  active_goals: { id: string; goal: string; state: string; steps: number }[]
  calendar: string[]
  pending_emails: number
  streams_due: string[]
}

interface PillarSection {
  total_calls_24h: number
  total_tokens_24h: number
  cache_hit_ratio: number
  top_models: { model: string; calls: number }[]
  trend: "up" | "down" | "flat"
  trend_detail: string
}

export async function buildContinuityReport(
  env: any,
  kv: KVNamespace,
  db: D1Database,
): Promise<ContinuityReport> {
  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const yesterdayDate = new Date(now - 86400_000).toISOString().slice(0, 10)

  // Run all queries in parallel
  const [
    yesterdayConvos,
    yesterdayGoals,
    yesterdaySkills,
    todayGoals,
    apiSnapshot,
    contextBlob,
    streamsRuns,
    prev24h,
    prev48h,
  ] = await Promise.allSettled([
    db.prepare(
      "SELECT COUNT(*) as cnt FROM conversations WHERE created_at >= ? AND created_at < ?",
    ).bind(`${yesterdayDate}T00:00:00`, `${today}T00:00:00`).first<{ cnt: number }>(),

    db.prepare(
      "SELECT state, COUNT(*) as cnt FROM goals WHERE created_at >= ? AND created_at < ? GROUP BY state",
    ).bind(now - 86400_000, now - (now % 86400_000)).all().catch(() => ({ results: [] })),

    db.prepare(
      "SELECT COUNT(*) as cnt FROM skills WHERE created_at >= ? AND created_at < ?",
    ).bind(`${yesterdayDate}T00:00:00`, `${today}T00:00:00`).first<{ cnt: number }>(),

    // Active goals from orchestrator
    fetchOrchestratorGoals(env),

    // API metrics
    buildSnapshot(db),

    // Context DO for calendar + emails
    fetchContextBlob(env),

    // Recent streams
    db.prepare("SELECT name, ts FROM streams_runs WHERE ts > ? ORDER BY ts DESC LIMIT 10")
      .bind(now - 86400_000).all().catch(() => ({ results: [] })),

    // 24h API calls
    db.prepare("SELECT COUNT(*) as cnt, SUM(input_tokens + output_tokens) as tokens FROM api_calls WHERE ts > ?")
      .bind(now - 86400_000).first<{ cnt: number; tokens: number }>(),

    // 48h API calls (for trend)
    db.prepare("SELECT COUNT(*) as cnt FROM api_calls WHERE ts > ? AND ts <= ?")
      .bind(now - 2 * 86400_000, now - 86400_000).first<{ cnt: number }>(),
  ])

  // Build yesterday section
  const yesterday: YesterdaySection = {
    conversations: yesterdayConvos.status === "fulfilled" ? (yesterdayConvos.value?.cnt || 0) : 0,
    goals_completed: 0,
    goals_failed: 0,
    skills_extracted: yesterdaySkills.status === "fulfilled" ? (yesterdaySkills.value?.cnt || 0) : 0,
    top_topics: [],
    deploys: 0,
  }

  // Build today section
  const activeGoals: TodaySection["active_goals"] = []
  if (todayGoals.status === "fulfilled" && todayGoals.value) {
    const goals = todayGoals.value as any[]
    for (const g of goals) {
      if (g.state === "planning" || g.state === "running") {
        activeGoals.push({ id: g.id, goal: String(g.goal).slice(0, 200), state: g.state, steps: g.step_count || 0 })
      }
    }
  }

  const calendar: string[] = []
  if (contextBlob.status === "fulfilled" && contextBlob.value) {
    const ctx = contextBlob.value as any
    for (const evt of (ctx.calendar || []).slice(0, 5)) {
      calendar.push(`${evt.summary} (${evt.start})`)
    }
  }

  const todaySection: TodaySection = {
    active_goals: activeGoals,
    calendar,
    pending_emails: contextBlob.status === "fulfilled" ? ((contextBlob.value as any)?.gmail?.length || 0) : 0,
    streams_due: [],
  }

  // Blockers
  const blockers: string[] = []
  if (contextBlob.status === "rejected") blockers.push("Context DO refresh failed")
  const contextVal = contextBlob.status === "fulfilled" ? contextBlob.value as any : null
  if (contextVal?.errors?.length) {
    for (const e of contextVal.errors) blockers.push(`Context: ${e}`)
  }

  // Pillar
  const calls24h = prev24h.status === "fulfilled" ? (prev24h.value?.cnt || 0) : 0
  const tokens24h = prev24h.status === "fulfilled" ? (prev24h.value?.tokens || 0) : 0
  const calls48h = prev48h.status === "fulfilled" ? (prev48h.value?.cnt || 0) : 0
  const trend: PillarSection["trend"] = calls24h > calls48h * 1.1 ? "up" : calls24h < calls48h * 0.9 ? "down" : "flat"

  const pillar: PillarSection = {
    total_calls_24h: calls24h,
    total_tokens_24h: tokens24h,
    cache_hit_ratio: 0,
    top_models: [],
    trend,
    trend_detail: `${calls24h} calls (prev 24h: ${calls48h}) ${trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}`,
  }

  if (apiSnapshot.status === "fulfilled") {
    const snap = apiSnapshot.value as any
    pillar.cache_hit_ratio = snap?.cache_hit_ratio || 0
    pillar.top_models = (snap?.by_model || []).slice(0, 5)
  }

  const report: ContinuityReport = {
    ts: now,
    date: today,
    yesterday,
    today: todaySection,
    blockers,
    pillar,
  }

  // Persist to KV
  await kv.put("continuity:latest", JSON.stringify(report), { expirationTtl: 90 * 86400 })
  await kv.put(`continuity:history:${now}`, JSON.stringify(report), { expirationTtl: 90 * 86400 })

  return report
}

async function fetchOrchestratorGoals(env: any): Promise<any[]> {
  try {
    const stub = env.ORCHESTRATOR_DO.get(env.ORCHESTRATOR_DO.idFromName("primary"))
    const r = await stub.fetch(new Request("http://do/goals"))
    const data = await r.json() as any
    return data?.goals || []
  } catch {
    return []
  }
}

async function fetchContextBlob(env: any): Promise<any> {
  try {
    const stub = env.CONTEXT_DO.get(env.CONTEXT_DO.idFromName("global"))
    const r = await stub.fetch(new Request("http://do/blob"))
    return await r.json()
  } catch {
    return null
  }
}
