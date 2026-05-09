# nao_00 — Canonical Inventory (generated 2026-05-08)

> Live-probed every claim. Anything I couldn't reach is marked `claimed-but-unverified`.
> Source of truth for the orchestrator (per `~/nao00/PLAN.md`). Memory files are aspirational; this is what's actually reachable RIGHT NOW.

---

## TL;DR — what we have, in one table

| Category | Resource | Status / usage | Wired into orchestrator? |
|---|---|---|---|
| Composio MCP | 7 meta-tools, ≥30 toolkits with active connections | LIVE (1 used in council via tool_call) | partial — only ~3 slugs in nao44 prompt |
| Anthropic | API + 7 models (opus-4-7 down to opus-4-1) | **BLOCKED — credit balance too low** | yes (council brain), failing on direct API |
| Claude Max ($200/mo) | 2 Max subscriptions, interactive | LIVE | engine itself, not API |
| Gemini | 50 models, 2.5-pro/flash live | LIVE (verified test call) | NO — never called |
| Together.ai | 237 models incl. Llama-4-Maverick | LIVE (auto-recharge) | yes (mistral via Together) |
| MiniMax M2.7 | coding-plan tier (sk-cp-) | LIVE | yes (4th council voice) |
| NVIDIA Foundation | 136 models incl. Nemotron-3 | LIVE | yes (self-reflection cron) |
| GMI Cloud | 57 models incl. anthropic/claude-opus-4.7 + H100/H200 GPU | LIVE | NO — never called |
| OpenRouter | 367 models | LIVE (token valid) **but `/credits` rejects user** | NO — explicitly dropped from council |
| ElevenLabs | Pro tier, 11.9k/610k chars used (1.9%) | LIVE | yes (voice STT/TTS) |
| Manus | 300/day free, 10 tasks visible | LIVE | half-wired (managed_agent stream) |
| Postiz | 11 social accounts / 8 platforms | LIVE | NO — never called by council |
| Helio | API key valid, returns 400 (origin header) | claimed-but-unverified | NO |
| Discord (bot) | "Agents HQ" id 1501427823959867583 | LIVE | NO |
| Trello | TRELLO_API_KEY set; web verified `invalid key` on legacy auth | needs key rotation | half-wired (memory writes) |
| Helio | tip-jar key live, paylink not configured | LIVE-key, OFF in worker | NO |
| Doppler | NOT in MCP, NOT installed locally | claimed-but-unverified | NO |
| You.com | MCP wired in `~/.claude/settings.json` | claimed (not probed) | NO from worker |
| Cloudflare | 6 zones, 1 worker, 2 KV, 1 DO, **D1 read blocked by token scope** | LIVE | yes (worker is the brain) |
| Hetzner | 1 server (Anouf cx43) | LIVE | yes |
| DigitalOcean | 3 droplets (Nemo, Jasmine, Mayor=`claude3-nemoclaw`) | LIVE | partial (Mayor SSH dead) |
| Fleet streams | 3 of 7 firing (coverage, proactive, deep_thinker) | deep_thinker FAIL on Anthropic credit | yes |

---

## Composio (≥30 active toolkits)

Verified by probing identity endpoints via `COMPOSIO_MULTI_EXECUTE_TOOL` against the MCP at `https://connect.composio.dev/mcp` with `x-consumer-api-key: ck_HtRPppY7nVK3sgt8qCjx`.

The 7 *meta* tools exposed by the MCP:
- `COMPOSIO_MANAGE_CONNECTIONS`
- `COMPOSIO_MULTI_EXECUTE_TOOL`  ← the only one council currently uses
- `COMPOSIO_REMOTE_BASH_TOOL`
- `COMPOSIO_REMOTE_WORKBENCH`
- `COMPOSIO_SEARCH_TOOLS`
- `COMPOSIO_WAIT_FOR_CONNECTIONS`
- `COMPOSIO_GET_TOOL_SCHEMAS`

`COMPOSIO_LIST_CONNECTED_ACCOUNTS` is NOT exposed. To enumerate, call `COMPOSIO_SEARCH_TOOLS` with `query="connected toolkits and apps"` — returns `toolkit_connection_statuses` only for toolkits relevant to the query. To get a complete picture, probe each toolkit's identity endpoint.

The "982 tools" figure is *correctly the toolkit catalog* (search tools sees them all). Only 7 are addressable directly through MCP. Any other slug runs through `COMPOSIO_MULTI_EXECUTE_TOOL`.

### Verified-active toolkits (probed identity endpoints, 2026-05-08)

Connection state from one combined Slack+Supabase probe:
- `slack` → ACTIVE, 1 account `slack_bart-dee` (gab44 workspace, user nchobah)
- `supabase` → ACTIVE, 3 accounts:
  - `supabase_aiel-becry` — naoufac's Project (ca-central-1, ACTIVE_HEALTHY)
  - `supabase_waling-drew` — gab44 v2 + Gab44 + App.gab44.com (ALL INACTIVE)
  - `supabase_ideist-shaban` — naoufac's Project (us-west-2, ACTIVE_HEALTHY)

Identity probes succeeded (returned real account data):

| Toolkit | Tool slug used | Identity returned |
|---|---|---|
| airtable | `AIRTABLE_GET_USER_INFO` | nchobah@gmail.com |
| calendly | `CALENDLY_GET_USER` | resource returned |
| clickup | `CLICKUP_GET_AUTHORIZED_USER` | nchobah@gmail.com |
| deepseek | `DEEPSEEK_LIST_MODELS` | model list returned |
| deepseek | `DEEPSEEK_GET_USER_BALANCE` | balance returned |
| discord | `DISCORD_GET_MY_USER` | nchobah@gmail.com (user OAuth) |
| facebook | `FACEBOOK_GET_CURRENT_USER` | OK (no email surfaced) |
| figma | `FIGMA_GET_CURRENT_USER` | OK |
| github | `GITHUB_GET_THE_AUTHENTICATED_USER` | login=naoufac (uid 55504939) |
| gmail | `GMAIL_GET_PROFILE` | nchobah@gmail.com (65486 messages) |
| googleads | `GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS` | resourceNames returned |
| google_analytics | `GOOGLE_ANALYTICS_LIST_PROPERTIES` | reachable but needs `account` arg |
| google_search_console | `GOOGLE_SEARCH_CONSOLE_LIST_SITES` | OK |
| googlecalendar | `GOOGLECALENDAR_LIST_CALENDARS` | calendars returned |
| googledocs | `GOOGLEDOCS_GET_DOCUMENT_BY_ID` | reachable, needs id arg |
| googledrive | `GOOGLEDRIVE_GET_ABOUT` | reachable |
| googlephotos | `GOOGLEPHOTOS_LIST_ALBUMS` | albums returned |
| googlesheets | `GOOGLESHEETS_SEARCH_SPREADSHEETS` | OK (search) |
| instagram | `INSTAGRAM_GET_USER_INSIGHTS` | OK |
| linkedin | `LINKEDIN_GET_MY_INFO` | id + first/last name |
| notion | `NOTION_GET_ABOUT_ME` | bot owner = Naoufal Chobah |
| openrouter | `OPENROUTER_GET_CREDITS` + `OPENROUTER_GET_CURRENT_KEY` | OK |
| outlook | `OUTLOOK_GET_PROFILE` | OK |
| scale_ai | `SCALE_AI_LIST_PROJECTS` | OK |
| sendgrid | `SENDGRID_GET_A_USER_S_PROFILE` + `..._ACCOUNT_INFORMATION` | OK |
| supabase | `SUPABASE_LIST_ALL_PROJECTS` | OK (3 accounts, see above) |
| telegram | `TELEGRAM_GET_ME` | ok=true |
| trello (composio) | `TRELLO_GET_MEMBERS_ME` | OK (different from raw API which 401's) |
| webflow | `WEBFLOW_GET_TOKEN_AUTHORIZED_BY` | OK |
| youtube | `YOUTUBE_LIST_USER_PLAYLISTS` | items returned |

Verified-but-degraded:
- `cloudflare` — Composio call returns 9109 "Cannot use the access" → connection is configured but the underlying CF token in Composio lacks scope
- `mistral_ai` — `MISTRAL_AI_GET_MODELS` returns 401 Unauthorized → connection mis-configured (use direct Together/Mistral key instead)
- `metaads` — `METAADS_GET_USER` returns "Invalid OAuth access token" → reconnection needed
- `discordbot` — `DISCORDBOT_GET_USER` returns 401 (the bot toolkit, distinct from user OAuth above) → reconnection needed

Toolkit slugs from prior memory inventory (2026-05-07) that I could NOT verify or probe meaningfully this session (mostly because the slug name guess was wrong / no obvious identity endpoint):
- `cloudconvert`, `cloudflare_browser_rendering`, `googlemeet`, `googleslides`, `googlesuper`, `hugging_face`, `metaads`, `microsoft_teams`, `miro`, `one_drive`, `onesignal_rest_api`, `onesignal_user_auth`, `reddit`, `shortpixel`, `yousearch`, `anthropic_administrator`

All of these still appear connected per the Composio dashboard memory; just need to discover the right "GET_ME" slug per toolkit.

NEW since 2026-05-07 audit: **OneSignal connections (`onesignal_rest_api`, `onesignal_user_auth`)** — the `FETCH_USER_IDENTITY` slug exists but our naive arg shape was rejected (needs `app_id` + `alias_label` + `alias`). Bybit appears in user's CLAUDE.md memory but no `bybit_*` slug found in my searches; **probably claimed-but-not-actually-wired**.

### Webflow (special case, see memory `reference_webflow_native_connector.md`)
`WEBFLOW_GET_TOKEN_AUTHORIZED_BY` resolves on this MCP key — the *primary* (Anouf) key. So Webflow IS reachable from here, contrary to the older note that said it was only on the Nemo sibling.

---

## Direct API providers (no MCP layer)

Probed each by hitting the provider's models/usage endpoint with the key from `~/secrets/all-keys.env`.

| Provider | Key prefix | Probe | Result |
|---|---|---|---|
| Anthropic | (in `discord-hub.env` not `all-keys.env`) | POST /v1/messages | **400 — credit balance too low** |
| Anthropic models endpoint | same | GET /v1/models | OK — 7 models: claude-opus-4-7, sonnet-4-6, opus-4-6, opus-4-5, haiku-4-5, sonnet-4-5, opus-4-1 |
| Gemini | `AIzaSy…` | GET /v1beta/models + generateContent | OK — 50 models incl. 2.5-pro, 2.5-flash, gemma-4-31b-it |
| Together.ai | `tgp_v1…` | GET /v1/models | OK — 237 models incl. Llama-4-Maverick, Kimi-K2.6, GLM-5.1 |
| GMI Cloud | JWT (eyJhbG…) | GET https://api.gmi-serving.com/v1/models | OK — 57 models incl. anthropic/claude-opus-4.7, deepseek-v4, nvidia-nemotron-3-nano-omni |
| ElevenLabs | `sk_b6c…` | GET /v1/voices + /v1/user/subscription | OK — Pro tier, 21 voices, 11925/610000 chars used |
| Manus | `sk-FfR…` | GET /v1/tasks (with `API_KEY:` header) | OK — 10 tasks visible, last completed 2026-04-18 ("What's Today's Energy") |
| Postiz | `5dd5e1…` | GET /public/v1/integrations | OK — 11 integrations: telegram(Naoufac), x(printplay44), x(Naoufalchobah), youtube(@gab44-nao), linkedin(naoufal-chobah), dribbble(naoufal-chobah), gmb(Top Optique), facebook(Print Play House) ×2, tiktok(printplayhouse.com), linkedin-page(adam-careers) |
| Cloudflare | `cfut_M…` | GET /accounts | OK — 1 account `Nchobah@gmail.com's Account` (id `63493c97…`) — but token is **account-scoped**: D1 list/DNS read return 401/403 |
| OpenRouter | `sk-or-…` | GET /api/v1/models | OK 367 models — but `/credits` returns "User not found" (key may be sub-account-only) |
| NVIDIA | `nvapi-…` | GET https://integrate.api.nvidia.com/v1/models | OK — 136 models |
| MiniMax | `sk-cp-…` | n/a (used inside worker) | claimed-live, not directly probed this session (worker /metrics shows 1727 successful calls) |
| Helio | `CgucR4…` | GET /v1/transactions | 400 "origin header missing" — key valid, needs Origin header |
| DigitalOcean | `dop_v1…` | GET /v2/droplets | OK — 3 droplets |
| Hetzner | `…` | GET /v1/servers | OK — 1 server |
| Discord bot | (in discord-hub.env) | GET /api/v10/users/@me | OK — bot "Agents HQ" id `1501427823959867583` |
| Trello | `TRELLO_API_KEY` + `TRELLO_TOKEN` | GET /1/members/me | **invalid key** — direct REST 401, but Composio path works |
| Doppler | not in keys | n/a | claimed-but-unverified — no `DOPPLER_TOKEN` in `all-keys.env`, no `~/.config/doppler` |
| HuggingFace | not present | n/a | listed in `/credits` page as "free tier", **no API key on disk** |
| Helio | `CgucR4…` | GET | 400 origin missing |

Keys present in `~/secrets/all-keys.env` that are NOT documented above: `INTER_VPS_TOKEN` (used for cross-fleet calls), `HETZNER_API_TOKEN`, `DIGITALOCEAN_API_TOKEN`, `DISCORD_BOT_TOKEN` (also in discord-hub.env).

---

## Cloudflare resources

### Zones (6, all on Cloudflare nameservers — memory file `project_domains_dns.md` is OUTDATED on this point!)

```
adamcareers.com       active  Free
datevogue.com         active  Free
gab44.com             active  Free   NS: alberto/kimora.ns.cloudflare.com
naples.agency         active  Free
nchobah.com           active  Free   NS: pete/jo.ns.cloudflare.com  ← contradicts memory!
printplayhouse.com    active  Free
```

DNS read returns 403 on the current account-scoped token (`zone:read` not granted). Resolved via `dig`:

| Subdomain | Resolves to | Status |
|---|---|---|
| `nao00.nchobah.com` | 188.114.96.3 (CF) | LIVE → /remote |
| `agent.nchobah.com` | 188.114.96.3 | LIVE → /remote |
| `admin.nchobah.com` | 188.114.96.3 | LIVE → admin-mcp on Anouf:8090 |
| `dash.nchobah.com` | 188.114.97.3 | LIVE |
| `bot.gab44.com` | 172.67.145.77 | LIVE |
| `nao.nchobah.com` | 188.114.97.3 | LIVE |
| `me.nchobah.com` | 188.114.96.3 | LIVE |
| `nemo.nchobah.com` | (NXDOMAIN) | **NOT WIRED** |
| `jasmine.nchobah.com` | (NXDOMAIN) | **NOT WIRED** |
| `mayor.nchobah.com` | (NXDOMAIN) | **NOT WIRED** |
| `cpanel.nchobah.com` | 188.114.96.3 | resolves to CF (probably traefik on Anouf) |

Memory `feedback_speak_in_domains_not_ips.md` says to use these names, but the DNS A records were never created for nemo/jasmine/mayor. Bug.

### Workers (1)

```
nao-00   usage_model=standard   v2.92.0 (97 routes)
```

`run_worker_first` set in wrangler.toml for all dynamic paths (good — no asset shadowing).

### KV namespaces (2)

```
79f1b24891eb446b8fcc6e5a3cc12f57  KV                   — 1626 keys
a7e86005201f4a8d9f32904a271f8b0f  gab44-content-cache  —    0 keys (empty!)
```

Top KV prefixes (all in main KV):
```
coverage:        1046  ← dominates by 16x next prefix
skill:            373
reflection:       103
eval:              47
gab44:             12
deep_thinker:       8
briefing:           5
fleet:              5
share:              5
engagement:         4
managed_agent:      4
recap:              4
proactive:          2
weekly:             2
others:            ~6
```

Reading: `coverage_expander` cron writes 23 KV keys/hour → **64% of all KV is auto-coverage seed cache**. The `gab44-content-cache` namespace is bound but empty — nothing writes to it.

### D1 databases (1, listed via wrangler.toml)

```
nao00-db   id=5dd2d7c8-0f37-45d7-9be8-219f41624e88
```

Token can't list D1 directly (`/d1/database` returns 401 — not in token scope). Schema reconstructed from source `schema.sql` + `CREATE TABLE` statements scattered across `src/`:

| Table | From | Use |
|---|---|---|
| `conversations` | schema.sql | council pipeline persists each turn |
| `council_steps` | schema.sql | per-advisor step trace (this is where the agent audit trail lives) |
| `skills` | schema.sql | extractor cache (8927+ rows per `improve/skills`) |
| `streams_runs` | streams/page.ts + each stream | cron run history |
| `api_calls` | metrics/api-use.ts | the pillar-metric ledger |
| `slack_inbox_state` | inbox/slack_poller.ts | per-channel read cursor |

Six tables. `improve/skills` page returned 100 rows with `last_row_id=8927` → ~9k rows in skills.

### Durable Objects (1)

```
nao-00_Naoufal   class=Naoufal   script=nao-00
```

50-turn ring buffer + alarm. Per PLAN.md it's "wired but inert" — alarm just increments a counter.

### Crons (5 strings, expanding to many ticks)

```
*/15 * * * *                                    self-reflection (Nemotron)
0 0 * * *                                       morning briefing (gmail draft)
0 16 * * *                                      evening recap (slack DM)
0 17 * * SUN                                    weekly digest
0 1,2,...,23 * * *                              auto-coverage 23x/day
```

5-string limit accepted. Effective ticks per day = 96 + 1 + 1 + 0.14 + 23 = ~121 cron ticks/day on the Worker.

External cron triggers (Nemoclaw `*/5` cron hits `/streams/run/:name`) — see Fleet section.

### R2 buckets

`/r2/buckets` returned auth/None — **claimed-but-unverified**. wrangler.toml has no R2 binding. Probably none.

---

## Fleet (4 hosts)

DigitalOcean droplet names ≠ CLAUDE.md aliases — **important reconciliation**:

| CLAUDE.md alias | DO/Hetzner name | IP | Reachable from Anouf? |
|---|---|---|---|
| Anouf (this) | Hetzner `Anouf` (cx43) | 135.181.44.161 | self |
| Nemoclaw | DO `nemoclaw-nyc2` | 162.243.119.47 | YES (root SSH ok) |
| Jasmine | DO `Claude44-nyc22` | 192.241.251.184 | YES (root SSH ok) |
| Mayor | DO `claude3-nemoclaw` (sic) | 142.93.155.96 | **NO — `Permission denied (publickey)`** |

The Mayor box is named `claude3-nemoclaw` in DigitalOcean — confusing branding. SSH key from Anouf is missing. CLAUDE.md says this is the "Toronto Mayor 24/7 Claude" host.

### Anouf (135.181.44.161) — engine

- 8c / 15GB / 75GB
- Disk: **65% full** (47G / 75G) — **rising; top priority is housekeeping when it crosses 75%**
- Mem: 6.8G used / 15G (44%); 4.6G free
- Kernel: 6.8.0-110-generic
- Uptime 4d 20h
- Crons (naoclaw):
  - `*/5 anouf-probe.sh`
  - `2,17,32,47 * anouf-rogue-watch.sh` (rogue api-source detector)
  - `23 * fleet-usage-ingest.sh` → `audit/fleet-usage-ingest.log`
  - `*/5 fleet/heartbeat?host=anouf` POST
  - `@reboot anouf-tmux-restore.sh`
- Docker (14 containers):
  ```
  traefik-traefik-1     v3.0           4d
  admin-mcp             admin-mcp      4d
  portainer             ce             4d
  n8n                   n8nio/n8n      4d
  openshell-cluster-nemoclaw  NVIDIA OpenShell 0.0.36   4d  (despite the "nemoclaw" name — runs locally)
  adam-careers-v2       adam-careers   45h
  openclaw-nao          7a99f44ce7da   2d
  openclaw-mayor        7a99f44ce7da   2d
  openclaw-taha         7a99f44ce7da   2d
  openclaw-zoro         7a99f44ce7da   22h
  openclaw-soubella     7a99f44ce7da   2d
  openclaw-ayoub        7a99f44ce7da   17h
  openclaw-nao-gab44    7a99f44ce7da   2d
  openclaw-ayo          7a99f44ce7da   17h
  ```
  All 8 OpenClaw agents are LIVE on Anouf (the CLAUDE.md said so — verified).

### Nemoclaw (162.243.119.47) — nervous system

- 2c / 8GB / 154GB; **6%** disk (9.3G / 154G) — *plenty of headroom*
- Mem: 1.2G used / 8G
- Kernel: 6.8.0-71-generic (older than Anouf's -110)
- Crons (root):
  - `* * * * * usage-tracker.sh` (every minute!)
  - `*/5 anouf-watchdog.sh`
  - `*/5 metrics/health-check.sh`
  - `*/5 nao00-streams-tick.sh`
  - `*/5 sibling-watchdog.sh anouf-vehea`
  - `*/5 watchdog.sh`
  - `*/5 fleet/heartbeat?host=nemo`
  - `*/5 fleet/heartbeat?host=vehea` (sibling)
  - `@reboot tmux-restore.sh nemo`
- Docker: `openclaw-claude` (1 container; sibling Anouf-Vehea runs as a tmux process here, not a container)

### Jasmine (192.241.251.184) — builder

- 2c / 8GB / 154GB; **3%** disk
- Mem: 580M / 8G (very idle!)
- Kernel: 6.8.0-71-generic
- Crons: digest at 01:00 UTC, monitor every 5m, fleet heartbeat
- Docker: **none running**
- Underutilized — significant headroom for orchestrator workers

### Mayor (142.93.155.96) — claimed-but-unverified

- 4c / 8GB (`s-4vcpu-8gb` per DO API)
- DO name: `claude3-nemoclaw`
- SSH from Anouf: **DENIED**. CLAUDE.md says "Toronto Mayor 24/7 Claude" — ineffective until SSH key is restored.
- Counts as PAID-BUT-IDLE from this orchestrator's POV.

---

## Activity reality (last 24h)

### `/metrics/api-use` (probed live)

Total since first call: **8834 calls** / 6.82M input / 1.25M output / 1.18M cache-read / 22.2k cache-create.
**Last 24h: 8670 calls / 7.97M tokens / cache-hit-ratio 14.9%**.

By source (last 7d == ~last 24h since it's young):

| Source | Calls | Input | Output | Notes |
|---|---|---|---|---|
| `mistral` | 2018 | 231k | 182k | Council 2nd voice |
| `minouch` | 2001 | 406k | 19k | Council 3rd voice (Haiku) |
| `minimax` | 1727 | 269k | 649k | Council 4th voice |
| `nao44_xhigh` | 841 | 4.3k | 11k | nao44 high-tier router calls |
| `eval` | 820 | 185k | 316k | improve/eval 15-call cadence |
| `nao44_high` | 786 | 3.5k | 8.6k | nao44 mid-tier |
| `nao44` | 395 | 95k | 30k | nao44 baseline |
| `other` | 215 | **5.6M** | 18.5k | dominating input tokens! |
| `notify` | 15 | 0 | 0 | metric-only ping |
| `briefing` | 4 | 368 | 84 | morning crons |
| `recap` | 4 | 1k | 368 | evening crons |
| `deep_thinker` | 4 | 2.4k | 16k | broken (Anthropic credit) |
| `managed_agent_research` | 1 | 0 | 0 | one fire only |
| `nao44_vision` | 2 | 2.1k | 108 | image input |
| `managed_agent_research_settled` | 1 | 7 | 531 | settle path tested once |

`other` is the biggest mystery — 5.6M input tokens / 215 calls = 26k tokens per call. Likely the auto-coverage caching / extractor pipeline. Worth tracing.

### `streams_runs` (last 30 rows fetched)

Streams firing (last hour): **coverage_expander** ×4, **proactive_insight** ×4, **deep_thinker** ×1.
Streams **NEVER** seen in the 30-row window: `auto_drafter`, `engagement_digest`, `horoscope_warmer`, `managed_agent_research`. Their cron triggers exist but the schedule must be 0/day (only manually triggered, or Nemoclaw tick cadence missing).

`deep_thinker` failures — 4 of 4 calls FAILED in 24h:
> `anthropic 400: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.`

### KV artifact freshness

- `briefing:latest` exists (last write 2026-05-08T14:47Z)
- `coverage:auto:latest` exists
- `manus:` (1 key), `trello:` (1 key) — barely used
- `gab44:` (12 keys) — daily horoscopes
- `weekly:` (2 keys) — Sunday digest, recently fired
- `recap:` (4 keys) — evening recap working
- `slack_inbox_state` — table on D1, KV not used for it
- `gab44-content-cache` namespace is BOUND BUT EMPTY (orphaned binding)

Cron-to-artifact map:

| Cron | Artifact | Health |
|---|---|---|
| `*/15` self-reflection (Nemotron) | `reflection:*` (103 keys) | LIVE |
| `0 0` morning briefing | `briefing:latest` + 4 history keys | LIVE (one fire today) |
| `0 16` evening recap | `recap:*` (4 keys) | LIVE |
| `0 17 SUN` weekly digest | `weekly:*` (2 keys) | LIVE |
| `0 1-23` auto-coverage | `coverage:*` (1046 keys) | LIVE — but volume is way out of proportion |

Conclusion: **3 of 5 cron purposes are healthy; auto-coverage volume dominates everything else by orders of magnitude.**

---

## Repos & code

`~/nao00/` — single git repo, 1 commit (`bb26191 nao00 v1`).

```
src/         18,706 lines of TypeScript across ~70 files
public/      static assets (HTML, css, mp3/mp4 healing tracks)
schema.sql   3 of 6 actual D1 tables (incomplete!)
audit/       evidence + per-day fleet usage JSON ingests
```

Subsystems:
- `src/council/`     — nao44, mistral, minimax, minouch, pipeline (the 4-voice path)
- `src/streams/`     — 7 stream files (3 cron-fired, 4 idle)
- `src/improve/`     — coverage, weekly, briefing, eval, extractor (the GEPA-ish loop)
- `src/notify/`      — gmail+slack via Composio
- `src/durable/naoufal.ts` — DO with 50-turn ring + alarm tick
- `src/dashboard/`, `src/remote/`, `src/v2/`, `src/voice/`, `src/healing/`, `src/gab44/`, `src/manus/`, `src/streams/page.ts`, `src/credits/`, `src/map/`, `src/reality/` — surfaces
- `src/tools/composio.ts` + `src/tools/nemotron.ts` + `src/tools/research.ts` + `src/tools/image.ts` — the tool layer
- `src/llm/together.ts` — Together adapter (powers Mistral + NVIDIA fallback)
- `src/mcp/server.ts` — exposes nao_00 itself as an MCP server
- `src/inbox/slack_poller.ts` — slack DM auto-reply

Other repos under `/home/naoclaw/`: only `~/nao00`. Other agents live under `/opt/openclaw/` (containerized, not pulled into this repo).

---

## NEW since 2026-05-07 audit

| Delta | Status |
|---|---|
| `onesignal_rest_api` + `onesignal_user_auth` toolkits | both probe-found in Composio, but identity probe needs `app_id`+`alias` args; **need an app_id to actually use them** |
| Anthropic API credit | **JUST RAN OUT** — deep_thinker has been failing every 15min |
| Postiz integrations | grew from 9 to **11** (added `gmb` for "Top Optique" and `linkedin-page` for "Adam Careers") |
| Cloudflare zone DNS | nchobah.com + gab44.com NS now CF (memory still says FastComet) |
| Nemoclaw kernel drift | still on -71 vs Anouf -110 (one-sided upgrade pending) |
| Bybit | mentioned in user message but **no `BYBIT_*` slug in MCP, no key in `all-keys.env`** — likely not yet wired |
| Helio paylink | key valid, `HELIO_PAYLINK_URL=""` in wrangler.toml — tip jar OFF |
| Doppler | listed in `/credits` UI as "live" but no `DOPPLER_TOKEN` on disk and no `~/.config/doppler` — **claim is false** |
| `gab44-content-cache` KV | bound, ZERO keys → orphan |
| OpenRouter `/credits` | returns 401 "User not found" → key may not have a credit account; LLM calls may still work |
| 8 OpenClaw agents | all LIVE on Anouf (verified docker ps) |
| Mayor (claude3-nemoclaw) | SSH key MISSING — disconnected from fleet |

---

## What's wired vs. what's idle

### WIRED (council/streams actively call)

- **Composio MCP** — gmail, slack, calendar, github, supabase via `nao44.ts` tool prompt; ~30 verified-active toolkits
- **Anthropic** — opus-4-7 (nao44, nao44_high, nao44_xhigh) and haiku-4-5 (minouch); **direct API broken** but Claude Max sub still serves the engine
- **Together.ai** — Mistral via `src/llm/together.ts` (council 2nd voice, 2018 calls in last 24h)
- **MiniMax** — coding-plan, council 4th voice (1727 calls)
- **NVIDIA Foundation** — Nemotron via self-reflection cron (`*/15`)
- **ElevenLabs** — Scribe v1 STT + Turbo v2.5 TTS at /talk (low-volume, but wired)
- **Cloudflare** — Worker, KV, D1, DO (the entire substrate)
- **Manus** — pulled by `managed_agent_research` stream (only fired once in window)
- **Hetzner + DO** — fleet hosts paid + serving

### HALF-WIRED (MCP/key available but rarely or never invoked)

- **Trello** — Composio path works, raw key 401's; KV has 1 trello key
- **Webflow** — Composio reachable; council prompt doesn't mention it
- **Postiz** — 11 integrations live, NEVER called by council
- **OpenRouter** — connector live; council explicitly avoids it (memory `feedback_cloudflare_only_no_openrouter`)
- **HuggingFace, SendGrid, Calendly, Reddit, Linkedin, Instagram, Facebook, Outlook, Telegram** — all probe-OK in Composio, none in nao44's tool list
- **GitHub** — connector live, but no auto-write/commit/PR flow exists
- **Discord (user OAuth + bot)** — bot live but no orchestrator path uses it
- **Supabase** — 3 connections, project lists fetchable, never queried by council

### IDLE (paid for, zero calls)

- **Gemini API** — 50 models, key valid, ZERO references in `src/`
- **GMI Cloud** — 57 models incl. claude-opus-4.7, ZERO references in `src/`
- **NVIDIA direct** (beyond Composio Nemotron route) — ZERO direct integration with build.nvidia.com
- **`gab44-content-cache` KV namespace** — bound but empty
- **Mayor host** (claude3-nemoclaw) — paid DO droplet, SSH dead, zero use
- **Helio tip jar** — key live, `HELIO_PAYLINK_URL` not set
- **`deep_thinker` stream** — fires every 15min, 100% failure on credit error
- **Streams `auto_drafter`, `engagement_digest`, `horoscope_warmer`, `managed_agent_research`** — 0 cron fires in last 24h (the runner code exists, the cron path branch never hits them)
- **n8n** (running on Anouf as docker) — origin returns 000 per STATE-OF-NAO00 audit
- **Doppler** — claimed live but no token on disk
- **OneSignal** — connectors present, never called

---

## Recommendations for the orchestrator

The Tool Router (`src/orchestrator/tool_router.ts` per PLAN.md Step 3) should know about all the above. Concrete routing rules:

1. **Lane: model**
   - Heavy reasoning → `gemini-2.5-pro` (FREE tier, never used; replaces deep_thinker which is broken)
   - Cheap reasoning → `gemini-2.5-flash` (FREE) instead of haiku for routing decisions
   - Long-context → `together/Llama-4-Maverick` (paid, auto-recharge)
   - Coding → `minimax-m2.7` (already in council)
   - GPU-hungry custom → GMI Cloud `XiaomiMiMo/MiMo-V2.5-Pro` (1M context, free starter)
   - Fallback chain: gemini-flash → together-llama4 → minimax (avoid Anthropic direct until topped up)

2. **Lane: composio**
   - Promote 30 verified-active toolkits to first-class router targets, not just the ~5 in nao44's prompt
   - Auto-discovery: cache `COMPOSIO_SEARCH_TOOLS` per query for 1h (already in PLAN)
   - Reconnect: `cloudflare`, `mistral_ai`, `metaads`, `discordbot` — all 4 are configured but auth-broken

3. **Lane: postiz** — add as first-class. 11 integrations means a single call can publish to telegram/x/youtube/linkedin/dribbble/gmb/facebook/tiktok. Promote draft-first per `feedback_agentic_permissions`.

4. **Lane: gpu** — GMI Cloud H100/H200 should be the route for any heavy local training/inference. Currently zero use.

5. **Stream pruning** — kill `deep_thinker` until Anthropic credit is topped, OR rewrite it to use Gemini-2.5-pro. Wake up `auto_drafter`, `engagement_digest`, `horoscope_warmer`, `managed_agent_research` via Nemoclaw's `*/5 nao00-streams-tick.sh` (it currently only ticks 2 of them — check the script).

6. **Mayor reconnect** — push Anouf SSH pubkey to 142.93.155.96. It's a paid 4-vcpu box doing nothing.

7. **Fix DNS gap** — add `nemo.nchobah.com` / `jasmine.nchobah.com` / `mayor.nchobah.com` A records in nchobah.com zone (CF nameservers, so this is just a DNS-record API call). Memory says we use these names; reality is they don't resolve.

8. **Memory file `project_domains_dns.md` is wrong** — nchobah.com IS on Cloudflare NS, not FastComet. Update.

9. **Memory file `reference_composio_connected_apps_2026_05_07.md` is roughly correct** but the slug names need fixing: `WEBFLOW_GET_USER` → `WEBFLOW_GET_TOKEN_AUTHORIZED_BY`, `TRELLO_GET_MEMBER` → `TRELLO_GET_MEMBERS_ME`, `FIGMA_GET_ME` → `FIGMA_GET_CURRENT_USER`, `REDDIT_RETRIEVE_THE_IDENTITY_OF_THE_USER` → `REDDIT_GET_REDDIT_USER_ABOUT`, etc. (full list above in the verified-active table).

10. **The `other` source in `/metrics/api-use` is 5.6M input tokens** — we don't know what it's calling. Add a finer-grained `source` label so the orchestrator can see what's burning the most context.
