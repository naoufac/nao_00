# nao_00 — Council Structure Doctrine
**Drafted 2026-05-07. Applies the Operator's Bible (Berkeley MAST + METR + Maxim AI) to nao_00 specifically. Pin to wall.**

## Why this exists

The two deep-dives say the same thing in different words:
- **Capability isn't the bottleneck.** Opus 4.7 leads τ²-bench (72.8). Nemotron 3 Super wins long context. Both are good enough.
- **Architecture is the bottleneck.** 92% of stalled agent programs fail on plumbing, eval, governance, integration, or trust. Not on the model.
- **Reliability multiplies.** 50 components @ 99% per step = 60% end-to-end. Every link costs.

So nao_00 wins or loses on *structure*, not on whether we wire Nemotron. We define the structure here.

## Anchor numbers (set before we ship anything else)

| Metric | Target | Floor | Where it lives |
|---|---|---|---|
| Task success rate | ≥85% | 75% (ship-blocker) | `/slo` (to be built) |
| Tool error rate | ≤3% | 5% (kill switch) | `/slo` |
| P95 single-turn latency | ≤8s | 20s | `/metrics/api-use` already tracks duration_ms |
| P95 council round-trip | ≤15s | 30s | derived from `conversations.created_at` |
| Loop containment | ≥99% | 97% | step-repetition detector (to be built) |
| Hallucination rate | ≤2% | 5% | LLM-as-judge eval on 1% sample |
| Cost per session | tracked | hard cap $0.05 | api_calls table sum per conversation_id |
| Drift vs 7-day baseline | ≤5% | 10% | nightly diff of the above |

We don't have all of these wired. We pick one or two per session.

## The four laws applied to nao_00

### LAW 1 — Minimum chain
**Status: ✅ already lean.** Our chain is `(cache-check) → nao44 → [tool?] → mistral → minouch`. That's 3-5 calls per turn. We deliberately don't run sub-councils, multi-step planners, or chained sub-agents inside a turn. Keep it that way. Every new advisor must justify itself against the multiplication math.

### LAW 2 — Checkpoint every 5 steps with a verifier ≥80%
**Status: 🟡 partial.** Mistral plays a verdict role — but it's *inside* the chain, not an external check. A real verifier sees the question, the proposed answer, and decides "ship or redo." Two paths:

- **Cheap path:** add a Haiku-based LLM-as-judge that scores Minouch's final answer against the question. If score < 0.6, regenerate once.
- **Stronger path:** use a different provider for verification (Mistral works) so we're not asking the same model to grade itself.

We already roughly have the stronger path — Mistral is a different provider grading nao44. The missing piece is *acting* on the verdict. Today Mistral can say "disagree, risk: medium" and Minouch still ships the answer. We need a regenerate-or-flag policy.

### LAW 3 — Tool circuit breaker
**Status: 🔴 open.** Today `ComposioMCP.callTool` has:
- no per-call timeout
- no retry budget
- no schema validation on response shape
- no exponential backoff on rate-limit
- no fail-degraded path ("tool unavailable, here's an answer without it")

At 8% per-tool failure rate (the bible's median for production tool calls), our council that fires `RESEARCH_WEB` or a Composio tool drops 8% per turn into bad-information land. Fix is straightforward — wrap the tool call with timeout + 1 retry + schema check + a degraded-answer fallback that tells the council "tool didn't return; answer from training only."

### LAW 4 — Degradation over failure
**Status: 🔴 open.** Right now the council always emits an answer. There's no "I'm not sure — here's what I'd need to be sure." The fix is structural: when Mistral confidence < 0.5 OR tool returned tool_error, Minouch's prompt switches to *honesty mode*: "I don't have enough to be useful here; what would help is X." Less impressive in the moment. Massively better for trust over time.

## What we ship (in priority order)

1. **`/slo` endpoint** — exposes the SLO targets above with current values. Foundation for everything. ~30 min ship.
2. **Tool circuit breakers** in `ComposioMCP.callTool` — timeout, retry, schema validation, degraded-answer flag. ~1 hour ship.
3. **Verdict-action policy** — when Mistral says `disagree` AND nao44 confidence < 0.7, regenerate nao44 once with Mistral's contradictions appended to the prompt. ~30 min ship.
4. **Loop-containment detector** — if the same tool is called 3× in a session with the same args, kill the chain. (FM-1.3 step repetition is the #1 MAST failure mode at 15.7%.) ~30 min ship.
5. **Honesty mode in Minouch** — when confidence < 0.5 OR tool_error, switch register. ~15 min ship.

After all five: re-measure. If `task_success` is above 85% and `tool_error` below 3%, we add a long-doc agent (Nemotron) and a verifier subagent (GLM-5 if accessible, else Haiku-as-judge). Until then, no new agents.

## Reasoning routing (when we add models)

Per the rubric in the deep-dive, mapped to our likely jobs:

| Job | Model | Why |
|---|---|---|
| Council reasoning (nao44) | **Opus 4.7** | τ²-bench 72.8 — no-drift |
| Council verdict (Mistral) | **Mistral Large** | structured JSON, different provider |
| Council delivery (Minouch) | **Haiku 4.5** | warmth + speed |
| Verifier subagent | **Haiku 4.5** (today) → **GLM-5** (when accessible) | cheap, ≥80% accuracy needed |
| Long-doc agent | **Nemotron 3 Super** (when key obtained) | RULER@1M 91.8 |
| Background workers / cron eval | **Nemotron 3 Super** (when key obtained) | 2.2× throughput, $0.10/M |
| Research (`RESEARCH_WEB`) | **COMPOSIO_SEARCH_WEB** (today) | already free, on MCP rail |

We do not need Nemotron for the council itself. We need it for jobs that the council *delegates to*. Which we don't have yet.

## Anti-patterns we won't do

- ❌ Add a fourth advisor without removing one (multiplication math)
- ❌ Add a verifier below 50% accuracy (FM-3.3 — strictly worse than no verifier)
- ❌ Treat benchmarks as production proof (Gartner: 12–19pt drop on broad launch)
- ❌ Build agents before instrumenting them (Bible LAW 09)
- ❌ Bind "personality" to model (per P2 in the bible — workloads, not personas)
- ❌ Skip a regression suite (Bible 47%-killer for stalled programs)

## Dashboard rule

The pillar metric (`/metrics/api-use`) measures **activity**. The SLO endpoint will measure **quality**. Both must be visible. Activity green + quality red = a fleet that's busy doing the wrong thing.

## Snapshot

- 2026-05-07 · v1 · doctrine drafted, 5 ships queued.
