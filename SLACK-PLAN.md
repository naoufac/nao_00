# SLACK-PLAN — nao_00 Slack Control Center (2026-05-08)

Goal: nao_00 lives in Naoufal's gab44 Slack workspace as a real, multi-channel
operations center. Channels for each agent surface; native bot that listens
and replies; Composio for outbound NOW, native Slack App for inbound NEXT.

## Workspace

**gab44 workspace** — already wired via Composio MCP (DM bridge `D0ASHUW4Q1F`,
3 existing channels: #social, #new-channel, #all-nao00). Composio's bot user
is in all 3 with 1 member each. We build out from here.

Tier: shipping on **free first**. Pro upgrade ($8.75/user/mo) goes to
NEEDS-LIST — Naoufal can flip the switch when he's ready.

## Channel architecture (9 channels)

| Channel | Purpose | Auto-posters |
|---|---|---|
| `#all-nao00` | firehose / pinned dashboard | every event |
| `#council` | every council Q&A — input + final answer + step trace link | councilPipeline |
| `#orchestrator` | goal lifecycle: created/planned/executed/done/failed | OrchestratorDO |
| `#pillar` | api-use metric, hourly snapshot | self-reflection cron |
| `#briefing` | morning briefing (7am Bangkok = 0:00 UTC) | briefing cron |
| `#recap` | evening recap (11pm Bangkok = 16:00 UTC) | recap cron |
| `#deploys` | every wrangler deploy + version diff | deploy script |
| `#incidents` | failing things — rogue deploys, validator catches, race losers | watchdogs |
| `#gab44` | brand events — posts published, follower count, healing plays | postiz hooks, /streams |
| `#lab` | Naoufal's playground for chatting with bot | none — human-only |

Default: humans MUTE the firehose channels and follow only what they care about.

## Build phases

### Phase 1 — THIS session (outbound + scaffolding)

1. **Channel creation** via `SLACK_CREATE_CHANNEL` for the 8 missing channels.
   `#all-nao00` already exists. Each channel gets a topic + purpose.
2. **`src/notify/slack_channels.ts`** — single helper `postToChannel(env, channel, blocks)`
   used by every auto-poster. Resolves channel name → id once, caches in KV
   for 24h. Falls through to plain text if blocks aren't supplied.
3. **Wire orchestrator** — every state change in OrchestratorDO posts to
   `#orchestrator` (created → planned → step executed → done/failed).
4. **Wire council** — councilPipeline posts a 1-line summary to `#council`
   (input ⇒ final, with link to /history?id=).
5. **Wire pillar** — self-reflection cron posts current api-use snapshot to
   `#pillar` once per hour (skip 14 of 15 ticks, only post when minute == 0).
6. **`/slack/events` endpoint scaffold** — signature verification (HMAC-SHA256
   over `v0:<ts>:<body>`), `url_verification` challenge response, event router
   for `app_mention` + `message.im`. Returns 200 immediately, dispatches
   asynchronously via `ctx.waitUntil(councilPipeline(...))`. Inert until
   bot token + signing secret are added to `/root/secrets/all-keys.env`.
7. **Update `/version` `/health` to surface slack_app_status** — `not_configured`,
   `webhook_only`, or `events_live` based on env presence.

### Phase 2 — NEXT session (after Naoufal creates Slack App)

Manual prereq (one-time, ~5 min on api.slack.com):
1. Create app "nao_00" in Naoufal's gab44 workspace.
2. Add bot scopes: `chat:write`, `channels:read`, `channels:history`, `groups:read`,
   `groups:history`, `im:read`, `im:history`, `app_mentions:read`, `commands`,
   `users:read`, `team:read`, `files:read`.
3. Enable Events API → request URL `https://nao-00.nchobah.workers.dev/slack/events`.
4. Subscribe to bot events: `app_mention`, `message.im`, `message.channels`.
5. (Optional) Slash commands: `/nao` (council), `/goal` (orchestrator), `/pillar`.
6. Install to gab44 workspace → copy Bot User OAuth Token (xoxb-...) and Signing Secret.
7. `echo SLACK_BOT_TOKEN=xoxb-... >> /root/secrets/all-keys.env`
8. `echo SLACK_SIGNING_SECRET=... >> /root/secrets/all-keys.env`
9. `wrangler secret put SLACK_BOT_TOKEN < <(echo $SLACK_BOT_TOKEN)` (or vars block)
10. Redeploy → /slack/events flips from inert to live.

Then I'll wire:
- `app_mention` and `message.im` → councilPipeline reply in-thread
- Slash commands → orchestrator goal creation, pillar query, etc.
- Voice messages (file_shared events with audio mimetype) → Scribe v1 STT → council
- Reactions trigger actions (e.g., :rocket: on a goal step = approve)

## Composio slug corrections (verified 2026-05-08)

CLAUDE.md and memory had old slugs — Composio renamed several:
- ~~`SLACK_LIST_CHANNELS`~~ → **`SLACK_LIST_ALL_CHANNELS`**
- ~~`SLACK_INFO_ABOUT_CURRENT_USERS_TEAM`~~ → not found; use `SLACK_FIND_CHANNELS` or skip
- `SLACK_FETCH_CONVERSATION_HISTORY` — still works
- `SLACK_SEND_MESSAGE` — still works
- `SLACK_CREATE_CHANNEL` — to verify this session

Will save corrected slug list to memory after channel creation.

## Tradeoffs (honest)

- **9 channels = noise risk.** Mitigation: `#all-nao00` is the only "must follow"
  by default; everything else is opt-in.
- **Composio outbound + native inbound** is two transports. Worth it: outbound
  works today; inbound needs the manual app creation. Don't block one on the
  other.
- **Free tier 90-day message retention** in gab44 workspace. Important data
  (incidents, pillar snapshots) gets mirrored to D1 anyway, so retention doesn't
  bite us.
- **Bot looks chatty.** Counter: messages are signal-dense, formatted with blocks,
  collapsible. Naoufal can mute aggressively per channel.

## Day-1 success criteria

- 8 new channels created in gab44 workspace, each with topic+purpose set.
- A goal POSTed to `/orchestrator/goal` → 4 messages appear in `#orchestrator`
  (created → planned → step ok → done).
- Council request → 1 summary message in `#council` with /history link.
- Pillar tick at top of hour → 1 snapshot in `#pillar`.
- `/version` reports `slack_app_status: webhook_only` (Composio path live;
  Events API scaffolded but no token yet).
- NEEDS-LIST has the 10-step manual Slack App creation guide.
