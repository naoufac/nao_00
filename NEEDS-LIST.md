# nao_00 — needs from Naoufal

_(Anouf can't write `/root/needs-list.md` without sudo password — using this path instead. Symlink later.)_

## 🆕 OPENED 2026-05-08 18:05 — Council of Ten gaps

- **Anthropic credit balance** still exhausted. Result: `Opus47` advisor in Council of Ten always returns null with `credit_balance_too_low`, and 1 of 3 synthesizer rotations falls through to majority-vote fallback. Top up via https://console.anthropic.com/settings/plans (~$50 covers ~50 council runs).
- **Mistral rate limit** trips on the free tier when fired alongside the council (advisor + synthesizer same minute). If Mistral becomes the synth and the advisor 429'd, fallback works fine. Long-term: paid Mistral tier or alternate provider for synth.
- **Manus is async-only** — `/v1/tasks` returns a task_id immediately, but the result takes minutes. The council fires the task and returns a `manus_pending_async` slot. To fold Manus answers back into the verdict trail, schedule a follow-up tick (existing `streams/managed_agent_research` settle path is the pattern).
- **Llama 4 Maverick FP8** capacity-gated on Together (consistent 503). Switched to `Llama-3.3-70B-Instruct-Turbo`. Re-enable Maverick later if `/v1/models` shows it healthy.

## 🔥 ACTIVE BLOCKERS

### Create the nao_00 Slack App (5 min, one-time UI step) — UNBLOCKS THE BOT
**Date opened:** 2026-05-08
**Why:** Outbound to channels works today via Composio (`src/notify/slack_channels.ts` is live; 9 channels created in the gab44 workspace). But making the bot LISTEN — replying to @mentions, DMs, slash commands — needs a native Slack App with a bot user, Events API URL, HMAC signing. The worker is already scaffolded at `/slack/events`: signature verification + dispatch are ready. It returns 503 until tokens land.

**Action — at https://api.slack.com/apps → "Create New App" → "From scratch":**
1. App name: `nao_00`. Workspace: **gab44** (the one with #all-nao00, #council, etc.)
2. Sidebar → "OAuth & Permissions" → Bot Token Scopes → add ALL of:
   `chat:write`, `chat:write.public`, `channels:read`, `channels:history`,
   `groups:read`, `groups:history`, `im:read`, `im:history`,
   `app_mentions:read`, `commands`, `users:read`, `team:read`, `files:read`
3. Sidebar → "Event Subscriptions" → toggle ON. Request URL: `https://nao-00.nchobah.workers.dev/slack/events`. Slack will fail to verify until step 8 — that's expected.
4. Same page → "Subscribe to bot events" → add: `app_mention`, `message.im`, `message.channels`, `message.groups`, `file_shared`
5. (Optional) Sidebar → "Slash Commands" → New Command → `/nao` → request URL same as above. Repeat for `/goal` and `/pillar`.
6. Sidebar → "Install App to Workspace" → click → copy the **Bot User OAuth Token** (starts `xoxb-…`).
7. Sidebar → "Basic Information" → "App Credentials" → copy the **Signing Secret**.
8. Anouf wires the secrets:
   ```
   echo "SLACK_BOT_TOKEN=xoxb-..." >> ~/secrets/all-keys.env
   echo "SLACK_SIGNING_SECRET=..."  >> ~/secrets/all-keys.env
   cd ~/nao00
   echo "$SLACK_BOT_TOKEN"      | npx wrangler secret put SLACK_BOT_TOKEN
   echo "$SLACK_SIGNING_SECRET" | npx wrangler secret put SLACK_SIGNING_SECRET
   ```
9. Anouf redeploys. Slack's pending Event-Subscriptions URL probe re-runs and turns green. `/health` reports `slack_app.state: events_live`.
10. Test: DM the `nao_00` bot "hello" → bot replies via the council pipeline.

**Impact if unblocked:** Bot listens. @mentions and DMs flow through the council. Slash commands launch orchestrator goals. Voice notes (file_shared with audio mimetype) get bridged through Scribe v1 STT. The Slack workspace becomes the primary control surface.

### ~~Composio personal API key (ak_…)~~ ✅ UNBLOCKED 2026-05-08 18:00
**Status:** RESOLVED. `COMPOSIO_API_KEY=ak_…YdvV1fas` is in `~/secrets/all-keys.env` and verified live — Composio REST `v3/auth_configs` returned HTTP 200 with anouf-youtube + github-nao auth configs.
**Visible to personal key:** 6 connected accounts (5 github + 1 youtube) — narrower scope than the MCP consumer key (50+ apps). Likely the personal key is scoped to ONE of the 2 orgs Naoufal granted; if we need full-org coverage we may add a second `ak_` from the other org.
**Now possible:** programmatic toolkit ADD (twitter for X, tiktok for gab44 reels, replicate for video gen, etc.) via `POST /api/v3/auth_configs` + `POST /api/v3/connected_accounts`.

### Sudo password / sudoers config for `naoclaw`
**Date opened:** 2026-05-07
**Why:** `sudo /root/...` needs password every time. Anouf can't write to `/root/secrets/`, `/root/needs-list.md`, edit `/etc/systemd/`, or do reboot work for the auto-start pain point #1 without it.
**Action:** Either (a) put `naoclaw ALL=(ALL) NOPASSWD: ALL` in `/etc/sudoers.d/naoclaw`, or (b) add NOPASSWD only for specific commands (`systemctl`, `docker`, `tee /root/needs-list.md`). Choice depends on trust + risk.

## ⏳ PENDING (not blocking, but on the list)

- `GROQ_API_KEY` — cheaper STT replacement than ElevenLabs Scribe
- `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY` in `/root/secrets/all-keys.env` (already as Worker secrets — but `wrangler secret put` from local needs the values too)
- Decide: keep n8n on Anouf or formally rip it out (memory says rejected, reality says it's running)

### BytePlus / ModelArk credentials (Doubao Seed-2.0-pro)
**Date opened:** 2026-05-07
**Why:** Naoufal just provisioned BytePlus ModelArk Seed-2.0-pro (resource ID `muti-20260508031850-wdc5s`, account `3001332880`). Composio has no BytePlus toolkit, so we wire it via direct REST from the Worker (same pattern as Anthropic + Mistral). Adds a Chinese-frontier brain to the council — strong code/reasoning, multilingual, cheaper-per-token than Anthropic.
**Action:** From BytePlus Console → ModelArk → API Key (or Endpoints → that instance), grab:
- `BYTEPLUS_API_KEY` (the Bearer token)
- `BYTEPLUS_BASE_URL` (typically `https://ark.ap-southeast.bytepluses.com/api/v3` for AP region)
- `BYTEPLUS_MODEL_ID` (the endpoint id, likely the `muti-...` string — need to confirm the request shape)
Drop them into `/root/secrets/all-keys.env`.

### ~~Together.ai API key~~ ✅ RESOLVED 2026-05-08
Key landed in `~/secrets/all-keys.env` and pushed as Worker secret. Llama 4 Maverick available via REST. $10 starter credit, auto-recharge configured. See `memory/project_together_ai_live.md`.

### X/Twitter connection mystery
**Date opened:** 2026-05-07
**Why:** Naoufal says he added 5 X accounts to Composio. The MCP consumer key (`ck_HtRPppY7nVK3sgt8qCjx`, org `morg-olm`) shows `twitter` as NOT connected. Possibilities: (a) the 5 are in a different Composio org/account, (b) they're in pending state, (c) he gave Composio dev creds but the connection didn't finalize.
**Action:** Naoufal to confirm in https://app.composio.dev which org the X connections live under, or share a personal API key (ak_) that sees the wider scope.
