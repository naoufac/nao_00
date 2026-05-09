# nao00 — Architecture (Cloudflare-only)

> "This and That."
> Two halves of every decision — the move and the why.

## The claim

nao00 is a **personal AI council** that runs end-to-end on Cloudflare's developer platform. There is no second cloud, no second runtime, no separate state machine, no separate vector DB, no separate scheduler. **One platform, one mental model.**

The 3 VPS (Anouf/Nemoclaw/Jasmine) exist for *building* nao00 — not for running it. Production is Cloudflare.

## Topology

```
                  Naoufal (voice, text, browser, voice agent)
                            │
                            ▼
        ┌────────────────────────────────────────────┐
        │     Worker `nao-00` (Hono router)          │
        │   /voice  /talk  /council  /improve/*      │
        │   /dashboard  /healing  /health            │
        └───────────────────────────────────────────-┘
            │             │              │
            │             │              │
            ▼             ▼              ▼
   ┌──────────────┐  ┌────────┐   ┌─────────────────┐
   │ Durable Obj  │  │   KV   │   │       D1        │
   │  Naoufal()   │  │  hot   │   │ conversations,  │
   │ per-user     │  │ facts  │   │ council_steps,  │
   │ memory + DO  │  │ skills │   │ skills          │
   │ alarms       │  │ cache  │   └─────────────────┘
   └──────┬───────┘  └────────┘
          │
          ▼
   ┌──────────────┐  ┌──────────┐  ┌─────────────────┐
   │  Vectorize   │  │    R2    │  │   Workers AI    │
   │ semantic     │  │ blobs:   │  │ Whisper, Llama, │
   │ recall       │  │ audio,   │  │ Llama Guard 3,  │
   │ (episodes)   │  │ artifacts│  │ embeddings      │
   └──────────────┘  └──────────┘  └─────────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ Egress over  │
                     │   fetch()    │
                     └──────┬───────┘
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
  Anthropic API       ElevenLabs           Composio MCP
  (Opus/Haiku,        (Scribe v1 STT,      (982 tools via
   prompt cache)       Turbo v2.5 TTS)      consumer key)
```

## Primitive ↔ purpose

| Primitive | Purpose in nao00 |
|-----------|------------------|
| **Workers (V8 isolates)** | Stateless request layer. ~5ms cold start. Global. Routes auth, validates inputs, fans work to the right DO/binding. |
| **Durable Objects** | Per-user `Naoufal` object. Holds short-term context, owns alarms (self-eval cadence), provides single-master serialization for state writes. One DO per `user_id` = trivial multi-tenancy. |
| **KV** | Hot, eventually-consistent cache. Skill cache (`skill:*`), connected-apps cache, last-eval insights. |
| **D1** | SQL of record: `conversations`, `council_steps`, `skills`. Cheap, queryable, joins. |
| **Vectorize** | Semantic recall over episodic memory. Embed each turn → top-K injected into next council prompt. |
| **R2** | Big blobs: audio uploads, generated MP3s, healing-track masters, model artifacts. |
| **Workers AI** | Edge inference for the fast path: Whisper (STT alt), Llama Guard 3 (output moderation, injection defense), embeddings for Vectorize. |
| **Workers Static Assets (`[assets]`)** | Public site (HTML, CSS, MP4s). `run_worker_first` keeps API routes shadowed. |
| **Cron Triggers** | Daily refresh of connected-apps cache, weekly DO compaction, eval rollups. |
| **Workflows + Queues** | Long-running build tasks (e.g. healing batch generation, eval over many turns). Replaces Inngest/Temporal. |
| **Sandboxes (workerd)** | Sandbox for any agent-generated code we ever need to execute. Replaces E2B. |
| **Secrets / Secrets Store** | All API keys live as Worker secrets, never in source. |
| **Custom Domains** | `nao00.nchobah.com` will alias the Worker once cPanel access lands. |

## Data model

### Per-user (Durable Object `Naoufal`)
- `profile` — name, location, time zone, current focus.
- `working_memory` — last N turns (ring buffer, in-DO storage).
- `pending_alarms` — self-eval next-fire, daily check, etc.
- `tool_grants` — which Composio tools this user has authorized.

### Global (KV)
- `skill:<pattern>` — cached confident answers (TTL 30d).
- `eval:last_insights` — most recent self-eval JSON.
- `connected_apps` — Composio app list (refreshed daily).

### Global (D1)
- `conversations(id, user_id, input, final_output, created_at)`
- `council_steps(conversation_id, step_order, advisor_name, response, confidence, duration_ms)`
- `skills(id, pattern, answer, confidence, used_count, created_at)`

### Global (Vectorize)
- Index `nao00-episodes` — one vector per past turn, metadata `{user_id, conversation_id, role, ts}`.

## Council pipeline (per request)

1. Worker receives request, resolves `user_id` (currently constant `naoufal`, multi-tenant later).
2. Routes to `Naoufal` DO via `env.NAOUFAL.idFromName(user_id)`.
3. DO loads working_memory + recent vector-recalled episodes + KV `user:context`.
4. Skill cache check — if hit, return immediately (logged to D1 as a `cache` step).
5. **nao44** (Opus 4.7) — opinion + optional `tool_call`.
6. If `tool_call`: run Composio MCP, inject result, re-prompt nao44 with the tool output (one repair iteration max — strike rule applies).
7. **Mistral** — structured verdict (agree/disagree, risk, confidence).
8. **Llama Guard 3** (Workers AI) — moderate combined output.
9. **Minouch** (Haiku 4.5) — warm delivery, "This and That" framing.
10. DO writes turn to working_memory, embeds + writes to Vectorize, writes row to D1.
11. `waitUntil(autoImprove())` — if confident generic answer, write skill to KV+D1.

All hops carry a `trace_id` so Workers Logs / Analytics Engine can reconstruct the run.

## Why Cloudflare alone

Mapping the top-10 challenges from `research/100-technical-challenges.md`:

| # | Challenge | Cloudflare answer |
|---|-----------|-------------------|
| 1 | Long-term memory | DO + KV + Vectorize tiering |
| 6/90 | Prompt caching | Anthropic prompt cache (called via fetch from Worker) |
| 10/78 | Stateful serverless | Durable Objects |
| 21/22 | Tool selection / schemas | Composio MCP from Worker, schema cached in KV |
| 24 | Tool retries / durability | Workflows + Queues + DO alarms |
| 29/45 | Sandboxed exec | Sandboxes (workerd) |
| 42/47 | Action verification | Action-class taxonomy enforced in Worker; high-stakes routes return a confirm token |
| 48/50 | Injection / moderation | Llama Guard 3 on Workers AI |
| 59/61 | Tracing / cost | Workers Logs + Analytics Engine, trace_id per run |
| 96/97 | STT / TTS latency | ElevenLabs (low-latency tier) called from Worker; Workers AI Whisper as fallback |

Nothing in this list demands a non-Cloudflare component.

## Non-goals (deliberate)

- No self-hosted model weights. We are a consumer of Anthropic + ElevenLabs + Mistral; if economics shift, we re-evaluate. Until then we don't run vLLM.
- No Kubernetes. No Lambda. No Vercel.
- No Telegram. (Hard rule from CLAUDE.md.)
- No new VPS for production paths. The existing 3 are build infra, not runtime.

## Versioning

- `1.6.0` — current production (voice + council + auto-improve + healing).
- `1.7.0` — rebrand + motto on every surface; no behavior change.
- `1.8.0` — `Naoufal` DO + Vectorize wired into council.
- `1.9.0` — Composio MCP tool path + Llama Guard 3 moderation.
- `2.0.0` — multi-tenant (DO per arbitrary user_id) + custom domain cutover.

Every minor is a working ship. Never break a prior endpoint contract.
