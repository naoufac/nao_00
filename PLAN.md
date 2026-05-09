# PLAN — Orchestrator-shaped rethink (2026-05-08)

Replaces the v2.57 third-axis-stacking plan. That kind of work is on the
"stop doing" list now — pillar metric was being gamed by SE seeders that
nobody reads. New direction: build the orchestrator that uses the 982
Composio tools and the 50 Gemini models we already pay for.

## Diagnosis

The system is **request-shaped, not agent-shaped**:

1. `councilPipeline` is linear — nao44 → maybe-1-tool → mistral||minimax →
   minouch → exit. No loop, no plan, no state machine. The Naoufal DO has
   a 50-turn ring buffer and an `alarm()` that just increments a counter
   — wired but inert.
2. The 7 streams (deep_thinker, managed_agent_research, auto_drafter,
   engagement_digest, coverage_expander, proactive_insight, horoscope_warmer)
   are disconnected token-burners. Each fires its own cron, cold-loads
   context, writes KV blobs nobody reads.
3. Tool composition is a hand-coded English bullet list in `nao44.ts`
   (~30 Composio slugs of 982). The other 950 are functionally invisible.

## Target shape

```
[Naoufal: voice/text/slack-DM]            [crons: hourly tick]
            |                                    |
            v                                    v
   ┌──────────────────────────────────────────────────────┐
   │ Orchestrator DO  ── owns Goals, Plans, Step queue    │
   │  · plan(goal)   · next_step()   · observe(result)    │
   │  · re-plan on failure   · emit continuity row        │
   └──────────────────────────────────────────────────────┘
       |              |              |              |
       v              v              v              v
   Tool Router    Context DO     Fleet leader    Validator
   composio(982)  gmail summ.    Anouf lease     Playwright
   model lane     slack summ.    heartbeats      screenshot
   managed agent  calendar       takeover hook   diff + KV
   GMI GPU        repo state
   playwright     last-deploys
```

## Migration — 7 steps, ordered by leverage

### Step 1 — Context Durable Object  ⬅ **STARTING HERE**
- New `src/durable/context.ts` peer to `Naoufal`. Sqlite-backed.
- Refresh every 10 min (piggyback on existing `*/15` cron — every 2nd
  tick): pull GMAIL_FETCH_EMAILS (last 30 subj+from+snippet),
  SLACK_FETCH_CONVERSATION_HISTORY (gab44 DM + starred channels),
  GOOGLECALENDAR_LIST_EVENTS (today + next 24h), GITHUB_LIST_PULL_REQUESTS
  (nao00 repo), last 3 streams_runs rows. Compress to ~3 kB JSON.
- `councilPipeline` reads `context_blob` from Context DO and inlines it
  into `userContext` BEFORE nao44 call (with `cache_control` so each
  10-min window is cache-hit).
- Verify: GET `/memory/context` returns the new blob; cache-create
  tokens go up at the start of each 10-min window then drop to read.
- Failure modes: Composio rate limits — gate each preload behind a 60s
  KV mutex; fallback to last-known-good blob.

### Step 2 — Orchestrator Durable Object
- New `src/durable/orchestrator.ts`. Sqlite tables: `goals`, `plans`,
  `steps` with depends_on + success_criterion.
- `src/orchestrator/planner.ts` — Opus 4.7 emits strict JSON plan.
- `src/orchestrator/runner.ts` — alarm-driven loop, re-plans on failure,
  capped 30 step executions per goal, 10-min wall clock, kill switch
  in KV (`orchestrator:enabled=false`).
- POST `/orchestrator/goal` to create; GET `/orchestrator/goal/:id` for
  the step trace.

### Step 3 — Tool Router
- `src/orchestrator/tool_router.ts`. `route(task) → {lane, tool_id, args_schema}`.
- Lanes: composio(982), model({opus|haiku|gemini-pro|gemini-flash|together-llama4|minimax|nemotron}),
  managed_agent, gmi_gpu, playwright, postiz.
- Routing call uses Haiku 4.5 with cache_control (5x cheaper than Opus).
- KV-cache routing decisions keyed on `normalize(task)` for 1h.
- Slug-existence check on every router output (Composio search verifies,
  model lane has hard allowlist).

### Step 3.5 — OneSignal lane (added 2026-05-08, late session)
- Naoufal connected OneSignal premium ($39, gab44 brand) to Composio MCP.
- This is the "council screams to phone" channel — closes the trio with
  /voice (in→out) and Slack DM bridge (in→out).
- Wire into the orchestrator's Continuity + Validator hooks so phone
  buzzes on: deploy fail, Goal completion, pillar metric drop, race
  result available. Throttle to ≤5 pushes/day so it stays useful.
- No Twilio. No relitigation.

### Step 4 — `/continuity` page
- Hourly aggregator (every 4th `*/15` tick) emits 4-section report:
  Yesterday, Today, Blockers, Pillar.
- Stored at KV `continuity:latest` + `continuity:history:<ts>` (90d TTL).
- Page at `/continuity` — three columns, mobile-first, no JS, ~100ms
  server-render. **No auth** (read-only).

### Step 5 — Validator (Playwright on Anouf)
- New container `nao00-validator` on Anouf, ~150 LOC headless playwright.
- HTTP `POST /validate {url, expect_status, expect_text?}` returns
  `{ok, status, screenshot_url, diff?}`.
- New `scripts/deploy.sh`: deploy → poll `/version` → validate every
  route → screenshot to GOOGLEDRIVE_CREATE_FILE_FROM_TEXT in
  `nao00-deploys/<version>/` → fail → wrangler rollback.
- Orchestrator's `lane=playwright` calls the same endpoint for in-flow
  screenshots.

### Step 6 — Lease-based fleet rotation
- POST `/fleet/lease {host, role}` — atomic KV op via DO mutex.
  Lease TTL 5 min. Roles: `builder | validator | continuity`.
- `~/nao00/scripts/lease-watch.sh` on Anouf, Jasmine, Mayor: every 60s
  try-acquire → if won, run active Goal → if lost, poll.
- Handoff: leader writes `goal_id` + `step_idx` to `lease:active:builder`
  per heartbeat; backup reads on takeover, calls
  `/orchestrator/goal/:id/resume`. Steps idempotent because each has
  explicit success_criterion checked before re-execution.
- Split-brain referee: Nemoclaw pings both leader candidates and screams
  in `/continuity` if both claim.

### Step 7 — 3-parallel best-in-class race lanes
- `src/orchestrator/race.ts` — `race(task, [{name, executor}])` runs N
  executors against same task, scores via judge model (rotating
  Haiku/Gemini-flash/MiniMax to avoid bias), persists winner.
- Week-1 lanes:
  1. **Reasoning** — Opus xhigh vs Gemini 2.5-pro vs MiniMax-M2.7 on
     30-prompt fixed eval. Score: factuality + brevity + utility.
  2. **Browser/agent** — Anthropic Managed Agent vs Manus task vs
     Playwright+Together-Llama4 chain on 10-task eval. Score:
     time-to-cited-answer + citation accuracy.
  3. **Publishing** — Postiz fan-out vs direct YT+LinkedIn vs
     Together-drafted+human-reviewed over 7 days. Score: posts/day
     actually published + engagement per post.
- Routing rule lands in Tool Router after week 2.

## Stop doing (quick-fix list)

1. Adding more cron strings — Orchestrator alarms replace them.
2. Hand-listing Composio slugs in nao44 system prompt — Tool Router subsumes.
3. Isolated KV blobs from each stream — write to `orchestrator.steps`.
4. Cold-fetching Naoufal context every turn — Context DO blob.
5. SE seeders / v2.57 third-axis stacking — gaming the pillar metric.
6. Editing without screenshot validation — Validator gates every deploy.
7. Naoufal DO alarm() incrementing a counter — kick the Orchestrator.
8. Deploy scripts that need interactive input — wrap in --yes / expect.

## Tradeoffs (honest)

- Orchestrator DO is a SPOF until sharded — measure first, shard by
  `goal.source` if queue fills.
- Tool Router adds ~$0.10/day at expected 100 steps — trivial vs.
  hand-coding 982 slug bullets.
- Playwright on Anouf = +1 Docker container — Anouf already runs 8.
- Lease rotation can split-brain under network partitions — Nemoclaw
  reduces window, doesn't close it.
- Race lanes burn 3x tokens — weekly cadence only, not hot path.

## Day-7 success criteria

- `/continuity` is the page Naoufal opens first thing on his phone.
- Failed deploy never reaches a custom domain — Validator caught it,
  screenshot in Drive.
- CLI hang → next box has the Goal queue within 5 min.
- Council turn pre-knows last 50 emails + today's calendar + gab44 PRs
  without latency on the request path.
- Race produces "best model per task class" report — week 4 routing is
  data-driven, not vibes.

## Critical files (read before changing)

- `src/index.ts` — single 1,403-line entry; will mount orchestrator,
  continuity, fleet-lease, race endpoints.
- `src/council/pipeline.ts` — replace single-tool branch with
  `if (nao44.tool_call) → orchestrator.spawnGoal(...)`; read Context
  DO before nao44 call.
- `src/durable/naoufal.ts` — template for new Context + Orchestrator DOs.
- `wrangler.toml` — add Context, Orchestrator DO bindings + migration
  `tag = "v2"` with `new_sqlite_classes`. Collapse 23-hour cron string
  to single `0 * * * *` once orchestrator owns the work.
- `src/tools/composio.ts` — entire 982-tool surface lives here.

---

**Status: starting Step 1 (Context DO) immediately.**
