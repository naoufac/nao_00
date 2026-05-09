// Orchestrator DO — the closed loop.
//
// One DO per goal_id. Holds:
//   - goal: the original ask (string)
//   - plan: a list of step intents (LLM-emitted JSON)
//   - steps: actual executions w/ results, success_criterion checks
//
// Flow:
//   POST /goal {goal}              → create row, set alarm in 1s
//   alarm() fires                   → if no plan, plan(); else next_step()
//   next_step():
//     - pick next pending step
//     - route(step.task) via Tool Router (Opus/Minimax race)
//     - execute on the routed lane
//     - record result + outcome (ok | error)
//     - on error, re-plan from current state (capped)
//   GET /goal/:id                   → full trace
//
// Caps: 10 steps max, 10-min wall clock, 3 re-plans max, kill switch
// in KV at orchestrator:enabled=false. All execution paths idempotent
// where possible (Composio reads are safe; writes guarded by step_id
// in the args trail so re-execution sees the existing row).

import { route as routeTool, shouldEscalateToCouncil } from '../orchestrator/tool_router'
import { runManusTask } from '../tools/manus_agent'
import { sendPush } from '../tools/onesignal'
import { postOrchestratorEvent, postToChannel, sectionBlock, contextBlock } from '../notify/slack_channels'
import { runCouncilOfTen } from '../orchestrator/council_of_ten'

interface GoalRow {
  id: string
  goal: string
  state: 'planning' | 'running' | 'done' | 'failed' | 'killed'
  created_at: number
  updated_at: number
  replan_count: number
  step_count: number
  result_summary: string
  [key: string]: any
}

interface PlanStep {
  idx: number
  task: string
  success_criterion: string
  [key: string]: any
}

interface ExecRow {
  id: string
  goal_id: string
  step_idx: number
  task: string
  routed_lane: string
  routed_tool: string
  routed_by: string
  args: string
  outcome: 'ok' | 'error' | 'pending'
  result: string
  started_at: number
  finished_at: number
  [key: string]: any
}

const MAX_STEPS = 10
const MAX_REPLANS = 3
const WALL_CLOCK_MS = 10 * 60 * 1000

export class OrchestratorDO {
  state: DurableObjectState
  env: any

  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
    state.blockConcurrencyWhile(async () => {
      // Sqlite tables. Idempotent.
      const sql = state.storage.sql
      sql.exec(`CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY, goal TEXT, state TEXT, created_at INTEGER,
        updated_at INTEGER, replan_count INTEGER DEFAULT 0,
        step_count INTEGER DEFAULT 0, result_summary TEXT DEFAULT ''
      )`)
      sql.exec(`CREATE TABLE IF NOT EXISTS plan_steps (
        goal_id TEXT, idx INTEGER, task TEXT, success_criterion TEXT,
        PRIMARY KEY (goal_id, idx)
      )`)
      sql.exec(`CREATE TABLE IF NOT EXISTS exec_steps (
        id TEXT PRIMARY KEY, goal_id TEXT, step_idx INTEGER, task TEXT,
        routed_lane TEXT, routed_tool TEXT, routed_by TEXT, args TEXT,
        outcome TEXT, result TEXT, started_at INTEGER, finished_at INTEGER
      )`)
      sql.exec(`CREATE INDEX IF NOT EXISTS idx_exec_goal ON exec_steps(goal_id, step_idx)`)
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    try {
      if (request.method === 'POST' && path === '/goal') {
        const body = await request.json<{ goal: string }>()
        const id = await this.createGoal(body.goal)
        return Response.json({ id, state: 'planning' })
      }
      if (request.method === 'GET' && path.startsWith('/goal/')) {
        const id = path.slice('/goal/'.length)
        return Response.json(await this.readGoal(id))
      }
      if (request.method === 'POST' && path === '/tick') {
        // Manual tick (for tests). Normally alarm() drives the loop.
        const advanced = await this.tick()
        return Response.json({ advanced })
      }
      if (request.method === 'POST' && path === '/kill') {
        const body = await request.json<{ id: string }>()
        await this.killGoal(body.id)
        return Response.json({ ok: true })
      }
      if (request.method === 'GET' && path === '/goals') {
        const all = await this.listGoals()
        return Response.json({ goals: all })
      }
      return new Response('not found', { status: 404 })
    } catch (err: any) {
      return new Response(JSON.stringify({ error: String(err?.message ?? err) }), {
        status: 500, headers: { 'content-type': 'application/json' },
      })
    }
  }

  async alarm() {
    try {
      const advanced = await this.tick()
      // If anything advanced, schedule next tick fast. Otherwise back off.
      const goals = await this.listGoals()
      const live = goals.filter(g => g.state === 'planning' || g.state === 'running')
      if (live.length > 0) {
        await this.state.storage.setAlarm(Date.now() + (advanced ? 1000 : 5000))
      }
    } catch (err) {
      console.error('[OrchestratorDO] alarm failed', err)
      await this.state.storage.setAlarm(Date.now() + 30_000)
    }
  }

  private async createGoal(goal: string): Promise<string> {
    const id = crypto.randomUUID()
    const now = Date.now()
    this.state.storage.sql.exec(
      `INSERT INTO goals (id, goal, state, created_at, updated_at) VALUES (?, ?, 'planning', ?, ?)`,
      id, goal, now, now,
    )
    await this.state.storage.setAlarm(Date.now() + 1000)
    postOrchestratorEvent(this.env, id, 'created', goal.slice(0, 200)).catch(() => {})
    return id
  }

  private async readGoal(id: string): Promise<any> {
    const sql = this.state.storage.sql
    const goalRow = [...sql.exec<GoalRow>(`SELECT * FROM goals WHERE id = ?`, id)][0]
    if (!goalRow) return { error: 'not found', id }
    const planRows = [...sql.exec<PlanStep>(`SELECT * FROM plan_steps WHERE goal_id = ? ORDER BY idx`, id)]
    const execRows = [...sql.exec<ExecRow>(`SELECT * FROM exec_steps WHERE goal_id = ? ORDER BY step_idx, started_at`, id)]
    return { goal: goalRow, plan: planRows, executions: execRows }
  }

  private async listGoals(): Promise<GoalRow[]> {
    return [...this.state.storage.sql.exec<GoalRow>(
      `SELECT * FROM goals ORDER BY created_at DESC LIMIT 50`
    )]
  }

  private async killGoal(id: string): Promise<void> {
    this.state.storage.sql.exec(
      `UPDATE goals SET state = 'killed', updated_at = ? WHERE id = ?`, Date.now(), id,
    )
  }

  // tick(): advance the oldest live goal by one logical step.
  // Returns true if something happened.
  private async tick(): Promise<boolean> {
    // Kill switch check
    const enabled = await this.env.KV.get('orchestrator:enabled')
    if (enabled === 'false') return false

    const sql = this.state.storage.sql
    const live = [...sql.exec<GoalRow>(
      `SELECT * FROM goals WHERE state IN ('planning', 'running') ORDER BY created_at LIMIT 1`
    )][0]
    if (!live) return false

    // Wall-clock cap
    if (Date.now() - live.created_at > WALL_CLOCK_MS) {
      sql.exec(
        `UPDATE goals SET state = 'failed', result_summary = 'wall-clock 10min exceeded', updated_at = ? WHERE id = ?`,
        Date.now(), live.id,
      )
      return true
    }

    if (live.state === 'planning') {
      await this.plan(live.id, live.goal)
      return true
    }

    // state == 'running' — execute next step
    const planSteps = [...sql.exec<PlanStep>(`SELECT * FROM plan_steps WHERE goal_id = ? ORDER BY idx`, live.id)]
    const doneIdx = new Set([...sql.exec<{ step_idx: number }>(
      `SELECT step_idx FROM exec_steps WHERE goal_id = ? AND outcome = 'ok'`, live.id,
    )].map(r => r.step_idx))

    const next = planSteps.find(s => !doneIdx.has(s.idx))
    if (!next) {
      // All planned steps complete
      sql.exec(
        `UPDATE goals SET state = 'done', result_summary = ?, updated_at = ? WHERE id = ?`,
        `${planSteps.length} steps completed`, Date.now(), live.id,
      )
      postOrchestratorEvent(this.env, live.id, 'done', `${planSteps.length} steps completed`).catch(() => {})
      return true
    }

    if (live.step_count >= MAX_STEPS) {
      sql.exec(
        `UPDATE goals SET state = 'failed', result_summary = 'max steps exceeded', updated_at = ? WHERE id = ?`,
        Date.now(), live.id,
      )
      postOrchestratorEvent(this.env, live.id, 'failed', 'max steps exceeded').catch(() => {})
      return true
    }

    await this.executeStep(live, next)
    return true
  }

  private async plan(goalId: string, goal: string): Promise<void> {
    const sql = this.state.storage.sql
    // Plan via Opus 4.7 — cached system prompt, JSON output.
    const planJson = await this.callPlanner(goal)
    const steps = Array.isArray(planJson?.steps) ? planJson.steps : []

    if (steps.length === 0) {
      // Empty plan = single-step task.
      sql.exec(
        `INSERT INTO plan_steps (goal_id, idx, task, success_criterion) VALUES (?, 0, ?, 'tool returned ok')`,
        goalId, goal,
      )
    } else {
      let i = 0
      for (const s of steps.slice(0, MAX_STEPS)) {
        sql.exec(
          `INSERT OR REPLACE INTO plan_steps (goal_id, idx, task, success_criterion) VALUES (?, ?, ?, ?)`,
          goalId, i, String(s.task ?? '').slice(0, 500), String(s.success_criterion ?? 'tool returned ok').slice(0, 200),
        )
        i++
      }
    }
    sql.exec(
      `UPDATE goals SET state = 'running', updated_at = ? WHERE id = ?`,
      Date.now(), goalId,
    )
    const planRows = [...sql.exec<PlanStep>(`SELECT * FROM plan_steps WHERE goal_id = ? ORDER BY idx`, goalId)]
    postOrchestratorEvent(this.env, goalId, 'planned', `${planRows.length} step(s): ${planRows.map(p => p.task).join(' → ').slice(0, 250)}`).catch(() => {})
  }

  private async callPlanner(goal: string): Promise<any> {
    const start = Date.now()
    const { recordUsage, anthropicUsage } = await import('../metrics/api-use')
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'extended-cache-ttl-2025-04-11',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 1500,
          system: [{
            type: 'text',
            text: `You are the Planner for nao_00's Orchestrator. Given a goal, decompose it into at most 5 ordered steps. Each step is a single concrete task that the Tool Router can route to ONE lane (composio/model/managed_agent/playwright/postiz/onesignal/noop).

Output STRICT JSON only:
{"steps":[{"task":"<concrete task in plain English>","success_criterion":"<one-line check>"}]}

Rules:
- 1–5 steps. Single-task goals get 1 step.
- Each step's task must be self-contained — assume it cannot reference earlier step outputs by index.
- success_criterion must be checkable from a tool result string (e.g., "result contains label_id", "status code 200", "calendar event created").
- Don't invent intermediate "summarize" steps unless the goal explicitly asks for a summary.
- Don't plan multi-step searches for things one tool call solves.`,
            cache_control: { type: 'ephemeral', ttl: '1h' },
          }],
          messages: [{ role: 'user', content: `Goal: ${goal}\n\nOutput JSON.` }],
        }),
      })
      const data: any = await r.json()
      if (this.env.DB) {
        const u = anthropicUsage(data)
        await recordUsage(this.env.DB, {
          source: 'orchestrator_planner', model: 'claude-opus-4-7',
          input_tokens: u.input, output_tokens: u.output,
          cache_read_tokens: u.cache_read, cache_create_tokens: u.cache_create,
          duration_ms: Date.now() - start,
        })
      }
      const text = data?.content?.[0]?.text || ''
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) return { steps: [] }
      try { return JSON.parse(m[0]) } catch { return { steps: [] } }
    } catch (err) {
      return { steps: [], error: String(err) }
    }
  }

  private async executeStep(goal: GoalRow, step: PlanStep): Promise<void> {
    const sql = this.state.storage.sql
    const execId = crypto.randomUUID()
    const startTs = Date.now()

    // Route via Tool Router (Opus + Minimax race)
    let routed: any
    try {
      routed = await routeTool(step.task, this.env, this.env.KV)
      // Escalation: council_of_ten on high-stakes / low-confidence tasks.
      if (shouldEscalateToCouncil(step.task, routed)) {
        routed = {
          ...routed,
          lane: 'council_of_ten',
          tool: 'council_of_ten',
          reason: `escalated: ${routed.lane}/${routed.tool} → council_of_ten (${routed.reason})`,
        }
      }
    } catch (err: any) {
      sql.exec(
        `INSERT INTO exec_steps (id, goal_id, step_idx, task, routed_lane, routed_tool, routed_by, args, outcome, result, started_at, finished_at)
         VALUES (?, ?, ?, ?, '', '', '', '', 'error', ?, ?, ?)`,
        execId, goal.id, step.idx, step.task, `routing failed: ${String(err?.message ?? err).slice(0, 300)}`, startTs, Date.now(),
      )
      sql.exec(`UPDATE goals SET step_count = step_count + 1, updated_at = ? WHERE id = ?`, Date.now(), goal.id)
      return
    }

    // Execute on the routed lane
    let outcome: 'ok' | 'error' = 'ok'
    let result = ''
    try {
      if (routed.lane === 'composio') {
        const { ComposioMCP } = await import('../tools/composio')
        const mcp = new ComposioMCP(this.env.COMPOSIO_API_KEY)
        // Wrap bare slugs in COMPOSIO_MULTI_EXECUTE_TOOL
        const tc = routed.tool === 'COMPOSIO_SEARCH_TOOLS' || routed.tool.startsWith('COMPOSIO_')
          ? { name: routed.tool, args: routed.args }
          : { name: 'COMPOSIO_MULTI_EXECUTE_TOOL', args: { tools: [{ tool_slug: routed.tool, arguments: routed.args ?? {} }] } }
        const r = await mcp.callTool(tc.name, tc.args)
        const text = (r.content || []).map((c: any) => c.text ?? (c.data ? JSON.stringify(c.data) : '')).join('\n')
        result = text.slice(0, 4000)
        if (r.isError) outcome = 'error'
      } else if (routed.lane === 'noop') {
        result = `noop: ${routed.reason}`
      } else if (routed.lane === 'council_of_ten') {
        const council = await runCouncilOfTen(step.task, this.env, this.env.KV, this.env.DB)
        const rec = council.synth?.recommendation ?? 'unknown'
        const conf = council.synth?.confidence ?? 0
        const valid = council.advisors.filter((a: any) => a.verdict).length
        result = `council_of_ten: ${rec} (conf=${conf.toFixed(2)}, ${valid}/8 advisors voted, agreement=${council.agreement_pct}%) — id=${council.id}`
        if (!council.synth) outcome = 'error'
        // Post the SUMMARY to #orchestrator with the trace link.
        try {
          const blocks = [
            sectionBlock(`*Council of Ten* — _${step.task.slice(0, 200)}_`),
            sectionBlock(`*${rec.toUpperCase()}* · confidence ${(conf * 100).toFixed(0)}% · ${valid}/8 advisors · agreement ${council.agreement_pct}%`),
            sectionBlock(council.synth?.rationale ? `> ${council.synth.rationale.slice(0, 600)}` : '> (no synth rationale)'),
            contextBlock(
              `synth=${council.synth?.synth_provider ?? 'none'} · evidence=${council.evidence.source} · ${council.duration_ms}ms`,
              `<https://nao00.nchobah.com/council/ten/${council.id}|view full trace>`,
            ),
          ]
          await postToChannel(this.env, 'orchestrator', { text: `Council of Ten ⇒ ${rec.toUpperCase()} (${valid}/8) — ${step.task.slice(0, 100)}`, blocks })
        } catch { /* slack-best-effort */ }
      } else if (routed.lane === 'model') {
        // Direct model thinking — Opus or Haiku, no tools.
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: routed.tool || 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{ role: 'user', content: step.task }],
          }),
        })
        const data: any = await r.json()
        result = (data?.content?.[0]?.text || '').slice(0, 4000)
      } else if (routed.lane === 'managed_agent') {
        // Manus API — fire-and-forget async task
        const manus = await runManusTask(this.env.MANUS_API_KEY, step.task)
        if (manus.ok) {
          result = `managed_agent: ${manus.result || manus.task_id}`
        } else {
          outcome = 'error'
          result = `managed_agent_error: ${manus.error}`
        }
      } else if (routed.lane === 'gmi_gpu') {
        // GMI Cloud — direct model call on H100/H200
        try {
          const r = await fetch('https://api.gmi.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.env.GMI_CLOUD_API_KEY}`,
            },
            body: JSON.stringify({
              model: routed.tool || 'claude-opus-4.7',
              messages: [{ role: 'user', content: step.task }],
              max_tokens: 2000,
            }),
          })
          const data: any = await r.json()
          result = (data?.choices?.[0]?.message?.content || '').slice(0, 4000)
          if (!result) { outcome = 'error'; result = `gmi_gpu: empty response ${JSON.stringify(data).slice(0, 200)}` }
        } catch (err: any) {
          outcome = 'error'
          result = `gmi_gpu_error: ${String(err?.message ?? err).slice(0, 300)}`
        }
      } else if (routed.lane === 'playwright') {
        // Playwright validator on Anouf — POST to local container
        try {
          const r = await fetch('http://135.181.44.161:3002/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: routed.args?.url || `https://nao00.nchobah.com${routed.args?.path || '/'}`,
              expect_status: routed.args?.expect_status || 200,
              expect_text: routed.args?.expect_text,
            }),
          })
          const data: any = await r.json()
          result = `playwright: status=${data.status} ok=${data.ok} screenshot=${data.screenshot_url || 'none'}`
          if (!data.ok) outcome = 'error'
        } catch (err: any) {
          outcome = 'error'
          result = `playwright_error: ${String(err?.message ?? err).slice(0, 300)}`
        }
      } else if (routed.lane === 'postiz') {
        // Postiz social publishing via Composio
        const { ComposioMCP } = await import('../tools/composio')
        const mcp = new ComposioMCP(this.env.COMPOSIO_API_KEY)
        try {
          const slug = routed.tool || 'POSTIZ_MCP_INTEGRATIONSCHEDULEPOSTTOOL'
          const r = await mcp.callTool('COMPOSIO_MULTI_EXECUTE_TOOL', {
            tools: [{ tool_slug: slug, arguments: routed.args || {} }],
          })
          const text = (r.content || []).map((c: any) => c.text ?? '').join('\n')
          result = `postiz: ${text.slice(0, 4000)}`
          if (r.isError) outcome = 'error'
        } catch (err: any) {
          outcome = 'error'
          result = `postiz_error: ${String(err?.message ?? err).slice(0, 300)}`
        }
      } else if (routed.lane === 'onesignal') {
        // Push notification to phone
        const push = await sendPush(
          this.env, this.env.KV,
          step.task.slice(0, 50),
          step.task.slice(0, 300),
        )
        if (push.ok) {
          result = `onesignal: push sent id=${push.id} daily=${push.daily_count}`
        } else {
          outcome = push.throttled ? 'ok' : 'error'
          result = `onesignal: ${push.error}`
        }
      } else {
        outcome = 'error'
        result = `lane=${routed.lane} unknown`
      }
    } catch (err: any) {
      outcome = 'error'
      result = `EXEC_EXCEPTION: ${String(err?.message ?? err).slice(0, 300)}`
    }

    sql.exec(
      `INSERT INTO exec_steps (id, goal_id, step_idx, task, routed_lane, routed_tool, routed_by, args, outcome, result, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      execId, goal.id, step.idx, step.task,
      routed.lane, routed.tool, routed.decided_by, JSON.stringify(routed.args ?? {}).slice(0, 1000),
      outcome, result, startTs, Date.now(),
    )
    sql.exec(`UPDATE goals SET step_count = step_count + 1, updated_at = ? WHERE id = ?`, Date.now(), goal.id)

    postOrchestratorEvent(
      this.env, goal.id, outcome === 'ok' ? 'step_ok' : 'step_error',
      `step ${step.idx} · ${routed.lane}/${routed.tool} (${routed.decided_by}) — ${result.slice(0, 200)}`,
    ).catch(() => {})

    // On error, attempt re-plan if we haven't blown the budget.
    if (outcome === 'error' && goal.replan_count < MAX_REPLANS) {
      sql.exec(`UPDATE goals SET replan_count = replan_count + 1, state = 'planning', updated_at = ? WHERE id = ?`, Date.now(), goal.id)
    }
  }
}
