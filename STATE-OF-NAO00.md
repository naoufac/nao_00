# STATE OF NAO_00 — Reality Audit
_generated 2026-05-07 22:55, **revised 23:20**, **orchestrator update 2026-05-08 17:25** by Anouf · live-probed every claim · evidence in `audit/evidence/`_

This document is the **single source of truth**. CLAUDE.md and memory files are aspirational; this is what's actually reachable RIGHT NOW.

> **Self-correction at 23:20:** the first pass of this audit accused several routes of being broken when in fact I was probing them with the wrong HTTP method or wrong slug names. Lesson — I almost recreated the same lie pattern I was hired to fight. Re-probed everything carefully below. Only one route was actually missing (`/notify/alert`), and I just shipped it.

> **2026-05-08 18:05 update — Council of Ten LIVE.** Phases 2-7 of `PLAN-COUNCIL-OF-TEN.md` shipped end-to-end. Highlights:
> - **Researcher** (`src/orchestrator/researcher.ts`) — 5 parallel you.com queries via Composio `YOUSEARCH_YOU_SEARCH` (probed live; toolkit `yousearch` ACTIVE). Falls back to `COMPOSIO_SEARCH_WEB`. Builds ≤2500-token evidence pack with citation ids `c1.1..c5.4`.
> - **Council of Ten runner** (`src/orchestrator/council_of_ten.ts`) — 8 advisors in parallel, 30s timeout each: Opus 4.7, Gemini 2.5 Pro, MiniMax M2.7, Llama 3.3 70B Turbo (Maverick FP8 capacity-gated), Mistral Large, Nemotron-49B (NVIDIA NIM), Manus (fire-async), DeepSeek-V3.1 (Together — replaces internal CouncilTrio because nao44 == Opus, already in panel). Strict-JSON verdict per advisor. Synthesizer **rotates Opus / Gemini Pro / Mistral Large per call** (anti-Anthropic-bias) and falls back to majority vote on synth failure. Tokens recorded as `council_of_ten_<advisor>` in api_calls.
> - **Tool Router lane** — `council_of_ten` lane added; trigger keywords (`decide|should i|compare|research|council|deep think|ten`) plus confidence-floor 0.7 escalation. Verified: "should we buy Google AI Ultra subscription" routed by MiniMax to `council_of_ten` directly (conf 0.95).
> - **Orchestrator wiring** — `executeStep` handles new lane, posts SUMMARY to `#orchestrator` Slack on every run.
> - **Direct endpoint** `POST /council/ten` (bearer-auth) — runs the 8-advisor pipeline without orchestrator overhead.
> - **Trace page** `GET /council/ten/:id` — public (UUID is the cap), mobile-first HTML, shows question, 5 queries, citations, 8 advisor cards with verdict tags + cited evidence, synthesizer rationale, dissent map. Persisted to KV `council_of_ten:trace:<id>` for 30 days.
> - **Day-1 verification** — POST `/orchestrator/goal {"goal":"should we buy Google AI Ultra subscription"}` → done in 5 ticks → step routed `council_of_ten` → 5/8 advisors voted (Opus skipped on credit-out, Mistral rate-limited, Manus async-pending) → synthesizer outputs `conditional` @ 75% confidence, agreement 80%, 2 dissent items, evidence: 20 you.com citations. Trace page renders. Slack post fires (best-effort, behind composio).
> - **GEMINI_API_KEY** uploaded to wrangler secrets this session (was missing).
> - **Gap noted**: Anthropic credit balance is exhausted, so Opus47 advisor + (1 of 3) synthesizer rotations always fail. Mistral and Gemini cover the synthesizer reliably; council still produces verdicts.
>
> ---
>
> **2026-05-08 17:25 update — Orchestrator closed loop is LIVE.** Three new pieces shipped this session per `~/nao00/PLAN.md` Steps 1+2+3:
> - **Context DO** (`src/durable/context.ts`) — global world-snapshot DO. Refreshes every 10 min via alarm. Slack pulls verified (6 messages from gab44 DM). Gmail/Calendar/GitHub shape-extraction needs an iteration (returning 0 — Composio response shape varies by tool; `pickArray` helper covers common paths but the inner data nesting is per-tool). Endpoints: `GET /memory/context/full`, `GET /memory/context/summary`, `POST /memory/context/refresh`.
> - **Tool Router with race lanes** (`src/orchestrator/tool_router.ts`) — Haiku 4.5 vs MiniMax-M2.7 race in parallel; fastest valid wins. Loser is shadow-logged to KV for scoring. KV cache 1h. Verified: "list gmail labels" → composio/GMAIL_LIST_LABELS in 1.3s; "weather Bangkok" → managed_agent/deep_research in 10.4s. Both decided by Minimax. Endpoint: `POST /orchestrator/route`.
> - **Orchestrator DO** (`src/durable/orchestrator.ts`) — sqlite-backed goals/plan_steps/exec_steps tables. Opus 4.7 planner, alarm-driven runner, re-plan on failure (cap 3), 10-step + 10-min wall-clock caps, kill switch at `KV: orchestrator:enabled=false`. End-to-end probe: goal "list gmail labels and tell me the count" → planned (1 step) → routed (Minimax) → executed → 22 real labels returned → state=done in 5s. Endpoints: `POST /orchestrator/goal`, `GET /orchestrator/goal/:id`, `GET /orchestrator/goals`, `POST /orchestrator/tick`, `POST /orchestrator/kill`.
>
> Migration v2 added to wrangler.toml (`new_sqlite_classes = ["ContextDO", "OrchestratorDO"]`). All 7 orchestrator routes + 4 context routes registered (107 total in /version). Next iterations: gmail/cal/gh shape extraction, lanes for managed_agent/playwright/postiz/onesignal/gmi_gpu, councilPipeline integration to read context blob before nao44.

---

## 🟢 SHIPPED & VERIFIED (re-probed correctly)

Public surfaces (HTTP 200):
- `/health` (v2.14.0), `/version` (route_count 72), `/dashboard`, `/remote`, `/voice`, `/healing`, `/manus`, `/gab44`, `/v2`, `/map`

API:
- POST `/council` (council pipeline, ~7s)
- GET `/history`
- GET `/improve/skills`, `/improve/insights`
- POST `/improve/eval`, `/improve/coverage`, GET `/improve/coverage/{latest,history}`
- GET `/memory/profile`, `/memory/turns`, `/memory/context`, `/memory/me`
- GET `/tools/list` (Composio MCP integrated)
- GET `/metrics/api-use` — **404 calls / 192K input / 33K output / 34K cache hits**
- POST `/notify/briefing` (gmail draft mode → real draft id returned)
- POST `/notify/recap` (slack send mode → replied to 2026-W19 thread)
- **POST `/notify/alert` ← shipped this session, 23:18 UTC (slack ts 1778195894.155089)**

Healing meditations — **all 5 tracks LIVE in both formats**:
| Track | mp3 | mp4 |
|---|---|---|
| track-01-deep-healing | 200 | 200 |
| track-02-deep-sleep | 200 | 200 |
| track-03-anxiety-relief | 200 | 200 |
| track-04-abundance | 200 | 200 |
| track-05-letting-go | 200 | 200 |

Custom domains (working):
- `nao00.nchobah.com` → 302 → `/remote` ✓
- `agent.nchobah.com` → 302 → `/remote` ✓
- `admin.nchobah.com` → 200 (via traefik on Anouf, routes to admin-mcp:8090)

Cron triggers (5 schedules confirmed in deploy output):
- `*/15 * * * *` — self-reflection (Nemotron)
- `0 0 * * *` — morning briefing (gmail)
- `0 16 * * *` — evening recap (slack)
- `0 17 * * SUN` — weekly digest
- `0 18 * * *` — auto-coverage (just added by linter)

Fleet watchdog:
- Nemoclaw: `*/5 * * * * /root/anouf-watchdog.sh` → POSTs to `/notify/alert` on >30 min Anouf silence ✓
- Daily-loop crons on Jasmine: digest 01:00 UTC, monitor every 5m

---

## 🔴 STILL BROKEN

### ~~Custom subdomains with no DNS~~ — FIXED 2026-05-08 (this section was WRONG)
- ✅ `dash.nchobah.com` → HTTP 200 (probed)
- ✅ `dash.gab44.com` → HTTP 200 (probed)
- ✅ `bot.gab44.com` → HTTP 200 (probed)
- ✅ `nao.nchobah.com`, `me.nchobah.com` added in v2.90.1
- Both `nchobah.com` and `gab44.com` are on Cloudflare nameservers (verified via `dig NS`).
- Earlier audit assumed FastComet NS — it was stale. Don't trust this section pre-v2.90.

### Apex domain
- `nchobah.com` — DNS apex points to **135.181.44.161 (Anouf)** but traefik has no Host(`nchobah.com`) rule → 404
- `www.nchobah.com` → 188.114.97.3 (CF) → 404 (no zone-level CF route either)
- `dashboard.nchobah.com` → 308 → `naoclaw.nchobah.com` → connection refused (dead chain — naoclaw.nchobah.com unresolvable)

### nchobah.com nameserver state
Memory file (`project_domains_dns.md`) is still right: `nchobah.com` is on FastComet NS, not Cloudflare. Specific subdomains work via CNAMEs that point to `*.workers.dev`. Migration to CF nameservers is the unlock for full custom-domain support.

---

## 🧠 NAOUFAL'S EXPLICIT PAIN-POINT LIST (verbatim, 2026-05-08)

Found in nemo orchestrator queue:

1. **Agents die on reboot — no auto-start** ← still open
2. **New sessions spawn Opus 4.6 instead of 4.7** ← still open
3. **Naoufal clicks 'OK' on every permission prompt manually** ← still open
4. **Dashboard has been 'in progress' for days, looks unchanged** ← still open
5. **No buttons to start/talk/pause agents** ← still open
6. **No live view of what agents are shipping** ← still open

These are the actual product gaps.

---

## 📦 ANOUF ARCHITECTURE — FULL TRUTH

**Anouf (135.181.44.161) is a microservices host**, not just the worker source:

Container stack (docker):
- **traefik** on :80/:443 (reverse proxy)
- **8 OpenClaw agent runtimes:** nao, mayor, taha, zoro, soubella, ayoub, ayo, nao-gab44 (all on 127.0.0.1:80xx)
- **adam-careers-v2** (port 3001 → adam-careers website)
- **n8n** (port 5678, routed via traefik for n8n.nchobah.com — origin issue, returns 000)
- **portainer** (port 9000)
- **admin-mcp** (port 8090, served via admin.nchobah.com)
- **openshell-cluster-nemoclaw** (NVIDIA OpenShell, despite the host name)

Memory `[Virtuals.io + n8n verdicts]` says n8n was rejected — but it's live as part of this stack. Either reconcile the verdict or remove n8n.

---

## 🛠️ NEXT MOVES (revised, in order)

1. ✅ **Build /notify/alert** — DONE 23:18 UTC
2. ⬜ **Pin Opus 4.7** (pain point #2) — find where 4.6 leaks into new sessions
3. ⬜ **Auto-start on reboot** (pain point #1) — docker `restart=unless-stopped` on the openclaw containers + systemd unit for the watchdog cron
4. ⬜ **DNS truth-up** — either ship the missing 3 subdomains or remove from CLAUDE.md/wrangler routes
5. ⬜ **Surface this doc on /dashboard** as a "Reality" tab
6. ⬜ **Decide on n8n** — formal yes or formal no, then act
