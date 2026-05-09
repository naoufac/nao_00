# nao_00 v2 — Build Plan
**Created 2026-05-07. v2 = a forked, gab44-branded mobile-shaped app with visible memory/cache/voice/images, no tutorial needed.**

## Anchor goals (from Naoufal)

1. Single chat surface combining text + voice + image — "modes of the same input, not different tabs."
2. Visible memory + cache — every message badged ("remembered" / "from cache"), tappable to inspect.
3. Voice with synchronicity — VAD turn-taking, emotion as signal, warm-first delivery (no terminal output by voice).
4. Status light for the pillar metric — green/yellow/red dot, no charts.
5. PWA-installable on iOS/Android home screens; Capacitor wrapper later.
6. Works without docs. Non-tech user → "ask, attach photo, speak, see what was remembered" in 10 seconds.

## Non-goals (v2 explicitly does NOT include)

- New backend infrastructure — v2 is a new front-end on top of the existing v1 worker.
- Stripe/billing UI — Helio paylink already exists; expose where it fits.
- A custom voice model — keep ElevenLabs Scribe v1 STT + Turbo v2.5 TTS for now.
- Full chat-history search (defer; surface last 30 days only).

## Architecture

### Surface
- New route on the existing worker: **`/v2`** (or custom domain `app.nchobah.com` later).
- Single SPA-style HTML page served from the worker (or `public/v2/`).
- All API calls back to existing v1 endpoints (`/council`, `/talk`, `/improve/*`, `/tools/*`, `/metrics/api-use`).

### Data model additions (v1 already has most of this)
- D1 `conversations` + `council_steps` — already exist, reused.
- D1 `skills` cache — surfaces as "from cache" badge.
- KV `user:context` — surfaces as "what we remember about you" inspector.
- New endpoint **`GET /memory/me`** — returns `{ context, recent_skills, recent_evals }` for the inspector.
- New endpoint **`GET /history?limit=30`** — returns last 30 conversations with cache-hit boolean.

### UI structure (single page)

```
┌──────────────────────────────────────┐
│ ●  nao_00          🧠⚡🔌   🎤      │  ← status light + memory/cache/apps + voice toggle
├──────────────────────────────────────┤
│                                      │
│  thread (last 30 messages)           │
│  each user msg shows: text/audio chip│
│  each council reply shows badges:    │
│    [remembered] [cached] [time]      │
│                                      │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │  [📎] [type or speak…]    [➤]   │ │  ← single input, tap mic for voice
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### Status light rules (top-left dot)
- 🟢 green: ≥10 advisor calls in last hour (matches `/metrics/api-use`)
- 🟡 yellow: 1–9 advisor calls
- 🔴 red: 0 advisor calls
- Tappable → opens slim drawer showing `last_hour`, `last_24h`, `by_source` numbers.

### Memory inspector (🧠 icon)
- Drawer shows current `user:context`.
- Each line editable; "save" updates KV `user:context`.
- Below: last 5 cached skills (`pattern → answer → used_count`).
- Below: last 3 evals (`ts → insight summary`).

### Cache badge
- After each council reply, if the conversation_id has a `cache` advisor in `council_steps`, badge "from cache (Xms)".
- Otherwise badge "fresh (Xms)".

### Voice (synchronicity)
- Web Audio API VAD: silence > 1.2s = end of user turn.
- Stream audio chunks to existing `/talk` (one-shot for v2 launch — full streaming WS comes in v3).
- Reply audio plays through Web Audio API, can be interrupted by user starting to speak.
- Audio energy + pitch features extracted client-side, sent as JSON metadata alongside the audio: `{ "voice_signal": { "energy": 0.42, "pitch_hz": 180, "duration_ms": 3200 } }`. Worker passes that through to nao44's prompt.

### Image (vision)
- 📎 button on input → file picker → upload via `multipart/form-data` to new `/council/multimodal` endpoint.
- Worker uses Anthropic Vision (already on Opus 4.7) — no new key, just pass `image` content blocks to nao44.
- Image preview chip shows in thread.

## Build sequence (sized for one focused session each)

**Phase 1 — Skeleton (1 session)**
- `public/v2/index.html` + minimal CSS in Naoclaw warm palette.
- Status light, thread, single input. Hits `/council` (text only).
- `GET /v2` worker route serves it.
- Live at `nao00.nchobah.com/v2`.

**Phase 2 — Memory + cache visibility (1 session)**
- Add `GET /memory/me` and `GET /history?limit=30` endpoints.
- Add memory inspector drawer.
- Add "remembered" / "from cache" badges to thread items.

**Phase 3 — Voice (1 session)** ✅ SHIPPED 2026-05-07
- 🎤 button on `/v2` captures audio via `getUserMedia` + `MediaRecorder` (`audio/webm;codecs=opus` preferred, `audio/mp4` fallback).
- Energy-threshold VAD: `AnalyserNode.getByteTimeDomainData` → RMS, threshold `0.025`, requires ≥350ms of speech then 1.2s of silence to end the turn.
- Tap mic again, or speak ≥250ms while bot is replying, to interrupt — interrupt monitor pauses `<audio>` and starts a new listening turn on the same stream.
- Audio POSTed to existing `/talk`; transcript + reply lifted from `X-Transcript` / `X-Reply` headers and rendered as user/bot bubbles with 🎙/🔊 badges.
- Returned `audio/mpeg` plays through a hidden `<audio>` element. `X-Filter: noise` surfaces a 🤫 badge.
- States visualised: `idle` → `listening` (coral pulse) → `thinking` → `speaking` (minouch green) → `idle`.
- Verified: `/talk` healthy from worker (400 with auth, 401 without). Browser-side requires user gesture + mic permission.

**Phase 4 — Image (½ session)** ✅ SHIPPED 2026-05-07
- 📎 attach → client-side downscale to 1024px JPEG (q=0.85) → preview chip → submit.
- `POST /council/multimodal` accepts JSON `{ input, image_base64, image_mime }` (≤5MB cap).
- nao44 receives image as Anthropic Vision content block (Opus 4.7 vision built-in, no extra key).
- Pipeline seeds `toolSummary` with vision evidence so Mistral (text-only) doesn't accuse nao44 of hallucinating the picture.
- Skill cache + autoImprove are skipped on multimodal turns (every image is unique).
- Verified e2e: red 64×64 PNG → "I see a solid red color filling the whole image" in 7s. Mistral agrees. 👁 vision badge in /v2 thread.

**Phase 4 (original spec — kept for reference)**
- 📎 attach → preview → submit.
- New `/council/multimodal` accepts `multipart/form-data` with optional image.
- nao44 receives image as Anthropic Vision content block.

**Phase 5 — PWA (½ session)** ✅ SHIPPED 2026-05-07
- `GET /manifest.webmanifest` — name "nao_00", `start_url=/v2`, `display=standalone`, theme `#c96442`, bg `#faf9f5`, four icons (any 192/512 + maskable 192/512).
- `GET /sw.js` (scope `/` via `Service-Worker-Allowed: /`) — cache `v2-pwa-1`. Strategy:
  - shell (`/v2`, `/manifest.webmanifest`, `/v2/icons/*`): stale-while-revalidate; fall back to cached `/v2` shell offline.
  - GET API (`/metrics/api-use`, `/memory/me`, `/history`): network-first with cached fallback; offline JSON envelope (`{ ok:false, code:'offline' }`) when nothing cached.
  - POST and cross-origin: network-only (no caching of /council, /talk, /council/multimodal).
- Icons generated by `scripts/gen-icons.mjs` (sharp) — coral disc + ink "n" wordmark on cream for `any`, full-bleed coral "n" for `maskable` to survive the Android safe-zone crop. SVG sources kept under `public/v2/icons/_source-*.svg` for re-render.
- v2 head: `<link rel="manifest">`, apple-touch-icon, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, theme-color updated to coral.
- v2 UI:
  - "⬇️ install" pill in the header — only shown when `beforeinstallprompt` fires; hidden again on `appinstalled` or if launched in `display-mode: standalone`.
  - Offline banner ("📡 offline — using cached shell. messages will fail until you're back online.") toggled by `online`/`offline` events.
  - "fresh build is ready — tap to reload" toast when a new SW is `installed` while a controller exists; click → `postMessage('SKIP_WAITING')` + `location.reload()`.
- `wrangler.toml` `run_worker_first` extended with `/manifest.webmanifest` and `/sw.js`.
- Deployed Version `714d5aba-7722-4ffa-a4a3-ca0db67904c4`. Smoke verified:
  - `Content-Type: application/manifest+json` ✓
  - `Service-Worker-Allowed: /` header present ✓
  - icon-192 / icon-maskable-512 200 OK from assets binding ✓
  - v2 HTML carries manifest + apple-touch + install pill + sw.js registration ✓
- Blocker for full PWA verification: needs a real iOS Safari + Android Chrome device test — Lighthouse / DevTools Application panel will pass on desktop Chrome but the install + add-to-home flow has to be eyeballed on phones.

**Phase 5 (original spec — kept for reference)**
- Manifest, icons, service worker for offline shell.
- "Add to home screen" prompt.
- App launches full-screen on install.

**Phase 6 — Polish + voice signal (1 session)**
- Client-side audio feature extraction → `voice_signal` JSON.
- Minouch system prompt: warmth-first register rule.
- Microcopy pass — every label removable in favor of an icon if possible.
- 10-second test: hand to a non-tech person.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Browser VAD janky | Start with silence-threshold-only; upgrade to WebRTC VAD module in v3 |
| iOS Safari audio quirks | Test on real device end of Phase 3; fall back to push-to-talk if needed |
| Memory inspector exposes too much | Only show fields user already knows about (`user:context`, recent skills) — never raw tokens |
| Image upload bloat | 4MB cap client-side; Anthropic Vision accepts up to ~20MB but we don't need it |
| Cron load + user load on same worker | Already separated by handlers; no shared state risk |

## What v2 does NOT change
- Council pipeline (nao44/mistral/minouch) is identical
- All v1 surfaces stay live (`/dashboard`, `/voice`, `/healing`, `/manus`, etc)
- Metrics, MCP, Composio rail — all reused
- Auth — same Bearer `nao00-council-2026`

## Definition of done
- `nao00.nchobah.com/v2` loads on iPhone Safari and Android Chrome.
- Non-tech user can ask a text question, attach a photo, speak a question, and inspect "what we remember" — without instruction.
- Status light reflects pillar metric color in real time (refreshes every 30s).
- "Add to home screen" works on both platforms.
- Cache badge fires for at least one cached-skill question.
