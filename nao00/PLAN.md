# nao_00 — Build Plan & Status (refreshed 2026-05-07)

## Shipped this session
**Priority 1 — Voice layer**  ✅
- `GET /voice` — public tap-and-speak HTML page (mobile-friendly, dark, hold-or-tap)
- `POST /talk` — multipart audio in → ElevenLabs Scribe STT → council → ElevenLabs TTS → audio/mpeg out
- Files: `src/voice/{stt,tts,page}.ts`, routes wired in `src/index.ts`
- `ELEVENLABS_VOICE_ID` env var added (default Rachel: `21m00Tcm4TlvDq8ikWAM`)
- `ELEVENLABS_API_KEY` pushed as Worker secret
- End-to-end verified: 200 OK, ~5.8s roundtrip, transcript+reply headers, conversation logged to D1

**Priority 2 — Auto-improve engine**  ✅
- `src/improve/extractor.ts` — caches confident generic answers in KV `skill:*` (30d TTL) + D1 `skills` table.
  Gate: Mistral confidence ≥ 0.85, decision == "agree", risk == "low", input looks generic (question word, no personal markers, ≤200 chars).
- `src/improve/eval.ts` — every 15 conversations, Opus 4.7 mines the recent transcripts and rewrites `user:context` in KV. Stored under `eval:last_insights` and `eval:insights:<timestamp>` (180d TTL).
- `src/improve/index.ts` exposes `autoImprove()` called from `/council` and `/talk` via `c.executionCtx.waitUntil(...)` (non-blocking).
- New endpoints (auth required):
  - `GET  /improve/skills`   — list cached skills from D1
  - `GET  /improve/insights` — current `user:context` + last insight blob
  - `POST /improve/eval[?force=1]` — manual trigger (force bypasses 15-threshold)
- Forced eval already ran once; `user:context` now reflects the Shopify-vs-healing-sounds tension instead of the static default.
- Bonus fix: nao44 + eval were calling a stale Anthropic model id (`claude-opus-4-20250514`). Now `claude-opus-4-7` everywhere.

## Priority 3 — Composio integration  🟡 root-caused
Probed both transports:
- **MCP at `https://connect.composio.dev/mcp`** — works. `x-consumer-api-key: ck_HtRPppY7nVK3sgt8qCjx` returns a valid `initialize` SSE response.
- **REST at `https://backend.composio.dev/api/v3/*`** — Cloudflare 1010 with default User-Agent (just fingerprinting; setting any sane UA fixes it). With UA fixed, REST returns **401 `Invalid API key: ck_HtRPp*****`**.

**Root cause:** the only Composio credential we have is the **MCP consumer key**. The REST API and the `composio` CLI need a **personal API key** (different namespace, generated in app.composio.dev → settings). That is why CLI calls fail.

**Plan once the personal API key is in `/root/secrets/all-keys.env` as `COMPOSIO_PERSONAL_API_KEY`:**
1. Add a Worker module `src/tools/composio.ts` that proxies tool calls. Cleanest path = MCP from inside the Worker (Cloudflare-to-Cloudflare egress, no 1010), since MCP already works with the consumer key we have.
2. Have `nao44` emit an optional `tool_call` field in its JSON output. If present, the pipeline runs the tool BEFORE consulting Grok, then injects the result into Grok's prompt.
3. Cache tool schemas in KV so we are not re-listing 982 tools per request. Refresh once per day.

## Priority 4 — Custom domain `nao00.nchobah.com`
- Worker route: `wrangler.toml` needs a `[[routes]] pattern = "nao00.nchobah.com/*", custom_domain = true` block.
- DNS: `nchobah.com` zone needs a CNAME / Worker route. (Likely already on Cloudflare since the existing `*.nchobah.workers.dev` works, so this is a 2-line change once we confirm the zone is in the same Cloudflare account.)
- Deferred until 1-3 are stable.

## Open asks for Naoufal — see `/root/needs-list.md`
- `GROQ_API_KEY` (cheaper STT replacement)
- `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` in `/root/secrets/all-keys.env` (already set as Worker secrets — but the local `.env` doesn't have them, so `wrangler secret put` won't work locally without the values)
- `COMPOSIO_PERSONAL_API_KEY` (separate from the MCP consumer key)
- OpenRouter Grok credits
