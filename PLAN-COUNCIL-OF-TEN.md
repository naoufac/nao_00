# PLAN — Council of Ten (research-grounded multi-model advisory)

**2026-05-08 — Naoufal asked for "10 parallel sub-agent requests, you.com
research, claude opus 4.7 second advice, 5 other reasoning agents — feed
the loop of research data to the plan."**

This is the deep-reasoning lane that the Orchestrator can call when a goal
warrants more than one round-trip. It pairs with what shipped earlier today:

- **Tool Router** routes a step to a lane. One of those lanes is now `council_of_ten`.
- **Orchestrator DO** spawns a goal → Tool Router → if `council_of_ten`,
  this whole pipeline runs as one super-step.
- **Synthesis layer** narrates the result on the next 10/40/60-min beat.

## Architecture (the 10 agents)

```
                       ┌─────────────────────────┐
                       │  Researcher (you.com)   │  step 0 — gather evidence
                       │  (5 parallel queries)   │
                       └──────────┬──────────────┘
                                  │ evidence pack
                                  v
       ┌──────────────────────────┼──────────────────────────────────────────┐
       │  step 1 — 8 advisors run in parallel against the same prompt+evidence │
       └──────────────────────────┼──────────────────────────────────────────┘
        ┌──────┬─────┬─────┬─────┴─────┬──────┬──────┬──────┐
        v      v     v     v           v      v      v      v
     Opus47  Gem25Pro Mini-M2.7 Llama4Mav  MistralL Nemotron Manus  CouncilTrio
     (Anth)  (Google) (MiniMax) (Together) (Mistral) (NVIDIA) (peer) (existing)
        │      │     │     │           │      │      │      │
        └──────┴─────┴─────┴───────────┴──────┴──────┴──────┘
                                  │ 8 verdicts (JSON each)
                                  v
                       ┌─────────────────────────┐
                       │  Synthesizer (Opus xhigh)│  step 2 — weighted aggregate
                       │  + dissent-surface     │     "what the 8 agree on,
                       │                         │      what they split on,
                       │                         │      what the evidence backs"
                       └──────────┬──────────────┘
                                  │ final recommendation + confidence + dissent map
                                  v
                       ┌─────────────────────────┐
                       │  Plan-back loop          │  step 3 — feed verdict
                       │  (re-route + execute)    │     into orchestrator's
                       │                         │     next plan step
                       └─────────────────────────┘
```

## The 8 advisor slots (rationale)

Why these eight and not random-eight:

| Slot | Model | Why this one | Cost/call |
|---|---|---|---|
| Opus 4.7 | claude-opus-4-7 (Anthropic) | gold-standard reasoning, "second opinion" anchor | $$$ |
| Gemini 2.5 Pro | gemini-2.5-pro (Google) | independent training, 1M context for evidence dump | $$ |
| MiniMax M2.7 | MiniMax-M2.7 (MiniMax) | frontier reasoning, free-tier coding plan | $ |
| Llama 4 Maverick | meta-llama/Llama-4-Maverick-FP8 (Together) | open-source check, 128 expert MoE | $ |
| Mistral Large | mistral-large-latest (Mistral) | structured logic, JSON discipline | $$ |
| Nemotron 49B | nvidia/llama-3.3-nemotron-super-49b-v1 (NVIDIA) | long-context reasoning, free via NIM | $ (free tier) |
| Manus | api.manus.ai/v1/tasks | execution-oriented (asks "how do we do this") | $ (300/day free) |
| Council Trio | nao44 + mistral + minimax (existing pipeline) | meta-vote — what does the council itself say | $$ |

Diversity goal: **independent training + different perspectives**. If 7 of 8
agree, that's signal. If they're split 4-4, the synthesizer surfaces the
fault line — Naoufal sees the actual disagreement, not a fake consensus.

## The 5 you.com queries

Researcher emits **5 parallel queries** per question, picked by Haiku from a
template:
1. "What is the current state of <topic>" — broad
2. "Recent news on <topic> in 2026" — recency
3. "Counter-arguments to <claim>" — adversarial
4. "Specific numbers / metrics for <topic>" — quantitative
5. "Who are the experts on <topic> and what do they say" — authority

Each returns ≤500 tokens of cited evidence. All 5 packs are concatenated
and pass-through to all 8 advisors. The advisors are told: "rely on this
evidence; flag if your answer would change with different evidence."

## Orchestrator wiring

New lane in Tool Router: `council_of_ten`. Triggers when:
- Task has the word "decide", "should I", "which is better", "compare", "research"
- OR task confidence from the regular router is < 0.7
- OR Naoufal explicitly says "council" / "deep think" / "ten"

When `council_of_ten` is picked:
1. New file `src/orchestrator/council_of_ten.ts` exposes `runCouncilOfTen(task, env)`
2. Returns a structured object: `{recommendation, confidence, evidence[], advisor_verdicts[], dissent_map, full_trace_url}`
3. Orchestrator's `executeStep` recognizes this lane → calls the runner →
   posts a SUMMARY to `#orchestrator` with a "view full trace" link to a
   new `/council-of-ten/:id` page.

## you.com lane — auth path

Per `feedback_auth_over_api`: prefer OAuth/auth-flow over raw API. You.com
MCP is already wired in `~/.claude/settings.json` (per CLAUDE.md). For the
WORKER to use it, two paths:
- **Path A (preferred):** Composio adds you.com as an OAuth toolkit. Search
  via `COMPOSIO_SEARCH_TOOLS` — if it exists, `YOUCOM_*` slugs.
- **Path B (fallback):** Direct REST against you.com — needs a YOUCOM_API_KEY.

Probe Path A first. If unavailable, document Path B in NEEDS-LIST.

## Cost & cadence

- Per call: ~$0.05 you.com + ~$0.50 Opus + $0.30 Gemini + $0.10 Mistral +
  $free MiniMax/Llama4/Nemotron/Manus + $0.20 Council Trio + $0.30 synthesizer
  ≈ **$1.45/run**
- Budget: triggered by Tool Router only when warranted (confidence-gated),
  expected ~5 runs/day = ~$7/day = ~$200/month
- Per "ridiculous perspective": $200/mo for a 10-agent advisory bench is a
  multiplier, not an adder. ✅

## Build phases

1. ✅ Plan written (this file) — 2026-05-08 17:50
2. **`src/orchestrator/researcher.ts`** — you.com fan-out + evidence packer
3. **`src/orchestrator/council_of_ten.ts`** — 8-advisor parallel runner +
   synthesizer
4. **Tool Router lane addition** — `council_of_ten` lane + trigger rules
5. **Wire into Orchestrator DO** — `executeStep` handles new lane
6. **`/council-of-ten/:id` trace page** — full transcript view
7. **#orchestrator slack post** — summary + trace link on each run

## Tradeoffs (honest)

- **3-5 second floor latency** — even fully parallel, Opus high-effort + 1M-
  context Gemini + you.com round-trip means this isn't realtime. Use only
  for high-stakes steps.
- **Synthesizer is a SPOF** — if it fails, we have 8 verdicts and no
  aggregation. Mitigation: synthesizer falls back to majority vote of
  advisors with same lane signature.
- **8 = a lot of tokens** — first pass burns ~50k tokens per run. Cache
  the evidence pack with `cache_control` so the 2nd advisor onwards reads
  cache, not fresh.
- **OS, "another agent can build the current version"** — yes. This plan
  is self-contained. A sibling agent (Anouf-Vehea or a fresh session) can
  pick up Phase 2 from here without coordination — every artifact is in
  this file or the existing codebase.

## Day-1 success criteria

- POST `/orchestrator/goal {"goal":"should we buy Google AI Ultra"}` →
  Tool Router routes to `council_of_ten` (confidence-gated) →
  10 agents run → synthesizer outputs YES/NO/CONDITIONAL with dissent map →
  posted to #orchestrator with trace link → orchestrator's next step
  re-plans the action ("buy" or "don't buy").
- Trace page at `/council-of-ten/:id` shows: question, 5 you.com queries +
  citations, 8 advisor verdicts, synthesizer reasoning, dissent map.
- Naoufal opens his phone, sees one Slack message, decides in 30 seconds.
