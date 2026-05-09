// Single source of truth for nao00's identity, version, and public URL.
// Anywhere these would otherwise be hardcoded, import from here.

// Bumped 2026-05-07 (anouf, post-shadow) — anyone deploying without bumping this
// will be detectable: /version exposes both VERSION and the live route list, so a
// foreign deploy that lacks /briefing or /recap routes shows up immediately.
// 2.9.0 — last_7d per-source rollup in api-use; weekly digest now reads real
//          totals; recap uses last_24h tokens; external probe live on Anouf.
// 2.10.0 — extended-cache-ttl 1h on nao44 + minouch; second cache breakpoint
//           on nao44 covers userContext block. Targets the 3.5% → ~50%+ lift.
// 2.10.1 — last_24h block exposes cache_read + cache_hit_ratio so the cache
//           lift is visible in the most-watched window (was only in last_7d).
// 2.11.0 — skill cache key normalization. Strips "(ref-XXXX-XXXXXX)" smoke-test
//           markers + trailing punctuation so probe floods collapse onto a
//           single shared cache row instead of write-only singletons. Targets
//           the 99 cached patterns with used_count=0 problem.
// 2.11.1 — ref-strip eats the leading space too, so probe keys collide with
//           the no-ref human form ("…sentence: foo" not "…sentence : foo").
//           Also adds /improve/cleanup-skills (idempotent D1 backfill drop of
//           legacy ref-tagged rows).
// 2.12.0 — skill cache visibility: /metrics/api-use exposes a `skills` block
//           (total_rows, hit_rows, saved_calls, top_5, newest_5). Dashboard
//           right-rail surfaces "Saved by cache: N calls" and a "What the
//           council has learned" list. cleanup-skills also drops the v2.11.0
//           orphans whose pattern still has the " : " gap.
// 2.13.0 — /improve/coverage: given a topic, Nemotron generates N generic
//           factual questions, council runs them, autoImprove caches the
//           confident ones. Drives API use AND useful breadth (compounding
//           cache hits as adjacent organic queries arrive). Persisted at
//           coverage:latest + coverage:history:<ts>; counters at
//           coverage:counters surface on /metrics/api-use + dashboard.
// 2.14.0 — Coverage trigger UI on dashboard right rail: input + count + 🎯 seed
//           button POSTs /improve/coverage and shows live elapsed timer + result.
//           Also fixes a TS-syntax leak (`let v: any = null`) in dashboard JS
//           that was breaking the entire script in browsers — explains why the
//           header indicator/version dot wasn't actually rendering before.
// 2.15.0 — Auto-coverage cron at 18:00 UTC. Each day, picks the dominant topic
//           from the last 24h of organic council inputs (Nemotron extraction)
//           and seeds 5 generic Q's via runCoverage. Compounds the cache with
//           zero operator effort. Endpoints: POST /improve/coverage/auto (manual)
//           + GET /improve/coverage/auto/{latest,history}. Persists at
//           coverage:auto:latest + coverage:cron-history:<ts> (90d TTL).
//           NOTE: extractor switched to Haiku 4.5 mid-session (Nemotron's
//           reasoning chain leaked into content at small max_tokens).
// 2.16.0 — Dashboard surfaces auto-coverage. Right-rail card under the manual
//           seed box shows the last cron run (topic + ok/skip + relative ts) on
//           a 60s refresh; click opens a tabbed modal listing both
//           /improve/coverage/auto/history and /improve/coverage/history with
//           per-run question summaries. Closes the v2.13/v2.15 visibility gap —
//           operator can now eyeball "did the daily seed take?" at a glance.
// 2.17.0 — Evergreen fallback for auto-coverage. When organic queries don't
//           cluster (the v2.15/v2.16 "no_dominant_topic" skip), the cron now
//           rotates through a 40-topic evergreen pool (photosynthesis,
//           mediterranean diet, rust language, …) and seeds the oldest-unseeded.
//           Tracking via `coverage:evergreen:seeded:<topic>` KV keys, picked by
//           min-timestamp so the rotation cycles through all 40 before repeating.
//           AutoCoverageRun gets a `mode: 'organic' | 'evergreen' | 'skip'` field;
//           dashboard label flips between 🤖 organic / 🌱 evergreen accordingly.
//           Cache now grows daily regardless of organic traffic. Hard-skip cases
//           (db_error, extract_error, no_anthropic_key) still surface as 'skip'.
// 2.17.1 — GET /improve/coverage/auto/evergreen — rotation status: seeded list
//           with timestamps, pending list, next_up (= oldest-unseeded). Operator
//           can see how far through the 40-topic pool the cron has cycled.
// 2.17.2 — Dashboard auto-cov card: evergreen pool progress bar + "next: <topic>"
//           subtitle. Reads /improve/coverage/auto/evergreen and renders fill
//           proportional to seeded_count/pool_size. Auto-hides if endpoint 404s.
// 2.18.0 — Auto-coverage cron now fires 3x/day (06/12/18 UTC) instead of 1x.
//           Evergreen pool fills in ~2 weeks instead of 6; pillar (API use)
//           grows by ~10-14 calls/day on quiet days, more when topics cluster.
//           Briefing 00:00 + recap 16:00 + weekly Sun 17:00 unaffected.
// 2.19.0 — External-content seeders: HN top stories + Wikipedia top-articles
//           feed the auto-coverage engine alongside the 40-topic evergreen pool.
//           Priority chain per tick: organic → external (HN/Wiki rotating by
//           UTC hour) → evergreen. Each picked external topic is recorded in
//           coverage:external:seeded:<topic> (30d TTL) so trending headlines
//           don't re-seed daily. New endpoints: GET /improve/coverage/auto/external
//           (rotation status), POST /improve/coverage/auto?source={hn|wikipedia|
//           organic|evergreen} (force a specific stream). AutoCoverageRun gains
//           `source` + `external` fields. Pillar pressure: each external tick
//           adds a fresh world-aware topic, breaking out of the closed evergreen
//           loop — the cache grows with the world, not just from a hardcoded list.
// 2.20.0 — Third external stream: BBC News RSS. Adds the world-news / current-
//           events axis to complement HN (tech) and Wikipedia (cultural lookup).
//           Daily rotation is now 06=hn / 12=wikipedia / 18=bbc — one of each
//           axis per day. Auto path retries cycle through all three sources
//           before falling back to evergreen. ?source=bbc accepted on the manual
//           endpoint. (Reddit was the original target for the third stream but
//           blocks unauth requests; YouTube needs a Data API key Naoufal hasn't
//           provisioned yet — BBC is no-key, no-rate-limit, headline-shaped.)
// 2.21.0 — Multi-topic ticks. Each external auto-tick now extracts THREE
//           distinct topics (Haiku JSON-array call for HN/BBC; first-3-not-seeded
//           for Wikipedia) and runs runCoverage for all three in parallel.
//           Wall-clock stays close to a single-topic tick (Promise.all) but
//           cache growth and API usage scale ~3x per tick. AutoCoverageRun
//           gains `topics_extracted: string[]`, `coverage_runs: any[]`, and
//           `totals: {executed, cached_new, cached_hit}`. `topic_extracted`
//           and `coverage` remain populated with the FIRST entry for dashboard
//           back-compat. Manual `?source=…` calls still pick exactly one topic
//           to keep the operator surface predictable. Pillar pressure: 3 ticks
//           x 3 topics x 5 questions = up to 45 cached answers/day from the
//           external streams alone, plus the same multiplier on API-use rows.
// 2.22.0 — Fourth external stream: arXiv (science/research axis). Atom feed
//           from export.arxiv.org/api/query, sentence-shaped paper titles,
//           Haiku-extracted like HN/BBC. Cron rotation goes from 3 ticks/day
//           to 4 (`0 3,9,15,21 * * *`) with one hour-slot per source:
//           03=arxiv, 09=hn, 15=wikipedia, 21=bbc. nextExternalSource cycles
//           all four; manual `?source=arxiv` accepted. Also adds Wikipedia
//           year-prefix slug blocklist (^\d{4}_) plus Timeline/Outline/Index/
//           Glossary skips — kills slugs that consistently produce 0 generations
//           (e.g. "2026 tamil nadu legislative") so the marker doesn't burn
//           for nothing. Pillar math: 4 ticks × 3 topics × 5 questions =
//           up to 60 cached/day from external alone (was 45 in v2.21).
// 2.23.0 — Fifth external stream: GitHub trending (developer-build axis).
//           api.github.com/search/repositories — repos created in the last 14
//           days with stars:>50, sorted desc. We feed "name — description"
//           strings to the same Haiku extractor, distilling repos to the
//           technical concept they embody (e.g. "vector databases", "agent
//           frameworks") — not the repo handle. Distinct from HN: HN is
//           news/discussion ABOUT software; github is what developers are
//           actively BUILDING. Cron goes 4 → 5 ticks/day
//           (`0 3,8,13,18,23 * * *`): 03=arxiv, 08=github, 13=hn, 18=wikipedia,
//           23=bbc — one of each axis per day, single cron string still under
//           the 5-trigger account limit. nextExternalSource now cycles all
//           five; manual `?source=github` accepted. Pillar math: 5 ticks ×
//           3 topics × 5 questions = up to 75 cached/day from external alone
//           (was 60 in v2.22).
// 2.24.0 — Sixth external stream: Stack Overflow top questions (programming-
//           problem axis). api.stackexchange.com/2.3/questions?sort=votes
//           returns canonical evergreen technical questions; Haiku extractor
//           distills to the underlying concept (e.g. "regex performance",
//           "git history rewriting"). Distinct axis from github (BUILT) and
//           HN (DISCUSSED): SO is what developers are STUCK ON. Cron goes
//           5 → 6 ticks/day (`0 3,8,11,13,18,23 * * *`): 03=arxiv, 08=github,
//           11=stackoverflow, 13=hn, 18=wikipedia, 23=bbc. Trigger STRING
//           count unchanged at 5 (account limit applies to strings, not hours
//           fired). nextExternalSource cycles all six; manual
//           `?source=stackoverflow` accepted. Dashboard auto-cov card adds
//           per-source emoji for arxiv (🔬), github (🐙), stackoverflow (❓).
//           Pillar math: 6 ticks × 3 topics × 5 questions = up to 90 cached/day
//           from external alone (was 75 in v2.23).
// 2.25.0 — Seventh external stream: Server Fault top questions (sysadmin /
//           devops / infrastructure axis). Same fetcher as stackoverflow,
//           parameterized into fetchStackExchange(site, limit) — adding any
//           Stack Exchange site is now a one-line change. Haiku extractor gets
//           a sysadmin-input clause (distill "How do I configure nginx X" →
//           "nginx tuning"). Cron goes 6 → 7 ticks/day (`0 3,8,11,13,16,18,23 * * *`):
//           03=arxiv, 08=github, 11=stackoverflow, 13=hn, 16=serverfault,
//           18=wikipedia, 23=bbc. Trigger STRING count UNCHANGED at 5.
//           nextExternalSource cycles all seven (6 retries cover any starting
//           point); manual `?source=serverfault` accepted. Dashboard adds 🛠️
//           for serverfault. ALSO fixes a latent cron-dispatch bug — the
//           scheduled handler only matched legacy cron strings, so v2.24.0's
//           cron actually fell through to selfReflectionTick. The 36 coverage
//           runs in v2.24 came from manual triggers, not cron. Now properly
//           routes the new + last 4 legacy strings to runAutoCoverage.
//           Pillar math: 7 ticks × 3 topics × 5 questions = up to 105 cached/day
//           from external alone (was 90 in v2.24).
// 2.26.0 — Eighth external stream: Super User top questions (consumer /
//           power-user computing axis). Reuses fetchStackExchange — exactly
//           the one-line trick the v2.25 handoff predicted would compound.
//           Distinct axis from serverfault: SF is pro sysadmin running
//           servers; SU is the END-USER fixing their OWN machine
//           (Windows/Mac/Linux desktop, hardware, browsers, OS troubleshooting).
//           Haiku extractor gets a consumer-computing input clause: "How do I
//           disable …" → "windows registry", "browser caching", "wifi
//           troubleshooting", "ssd trim", etc. Cron goes 7 → 8 ticks/day
//           (`0 3,8,11,13,16,18,21,23 * * *`): 03=arxiv, 08=github,
//           11=stackoverflow, 13=hn, 16=serverfault, 18=wikipedia, 21=superuser,
//           23=bbc. Trigger STRING count UNCHANGED at 5 (5-trigger account
//           limit applies to strings, not hours). nextExternalSource cycles all
//           eight (7 retries cover any starting point); manual
//           `?source=superuser` accepted. Dashboard adds 💻 for superuser.
//           Pillar math: 8 ticks × 3 topics × 5 questions = up to 120 cached/day
//           from external alone (was 105 in v2.25).
// 2.27.0 — Ninth external stream: Ask Ubuntu top questions (Linux-desktop /
//           Ubuntu axis). Reuses fetchStackExchange — third compounding deploy
//           via the one-line SE-multiplexing trick (after serverfault in v2.25
//           and superuser in v2.26). Distinct axis from superuser (broad consumer
//           computing) and serverfault (pro server ops): AU is Ubuntu/Linux-
//           desktop specific — apt/snap, ppa, grub, nvidia drivers, gnome/unity,
//           dual-boot, kernel updates. Haiku extractor gets an Ask-Ubuntu input
//           clause: "How do I install …" → "apt package management", "ppa
//           repositories", "grub bootloader", "snap packages", "nvidia drivers
//           linux", "linux dual boot", "ubuntu kernel update" etc. Cron goes
//           8 → 9 ticks/day (`0 3,6,8,11,13,16,18,21,23 * * *`): 03=arxiv,
//           06=askubuntu, 08=github, 11=stackoverflow, 13=hn, 16=serverfault,
//           18=wikipedia, 21=superuser, 23=bbc. Trigger STRING count UNCHANGED at 5.
//           nextExternalSource cycles all nine (8 retries cover any starting point);
//           manual `?source=askubuntu` accepted. Dashboard adds 🐧 for askubuntu.
//           Pillar math: 9 ticks × 3 topics × 5 questions = up to 135 cached/day
//           from external alone (was 120 in v2.26). Morning Bangkok-time
//           (06 UTC = 13:00 ICT) now gets a fresh stream early in the day,
//           filling the previously empty 03→08 gap.
// 2.28.0 — Tenth external stream: Cross Validated top questions (statistics /
//           ML methodology axis — stats.stackexchange.com, site key "stats").
//           Reuses fetchStackExchange — fourth compounding deploy via the
//           SE-multiplexing trick (after serverfault@v2.25, superuser@v2.26,
//           askubuntu@v2.27). Distinct axis from arxiv (bleeding-edge papers)
//           and stackoverflow (general programming): CV is statistical
//           reasoning + ML methodology + experiment design. Haiku extractor
//           gets a Cross-Validated input clause: "How do I interpret …" /
//           "Why does my model …" → "p value", "bayesian inference", "logistic
//           regression", "cross validation", "confidence intervals", "random
//           forests", "feature engineering", "hypothesis testing",
//           "regularization". Cron goes 9 → 10 ticks/day
//           (`0 3,6,8,11,13,15,16,18,21,23 * * *`): 03=arxiv, 06=askubuntu,
//           08=github, 11=stackoverflow, 13=hn, 15=crossvalidated,
//           16=serverfault, 18=wikipedia, 21=superuser, 23=bbc. Trigger STRING
//           count UNCHANGED at 5. nextExternalSource cycles all ten (9 retries
//           cover any starting point); manual `?source=crossvalidated` accepted.
//           Dashboard adds 📊 for crossvalidated. Pillar math: 10 ticks × 3
//           topics × 5 questions = up to 150 cached/day from external alone
//           (was 135 in v2.27). 15 UTC slot fills the previous gap between
//           hn@13 and serverfault@16 — afternoon Bangkok (22:00 ICT) gets a
//           methodology-axis stream while Naoufal sleeps.
// 2.29.0 — Eleventh external stream: Mathematics SE top questions (pure-math
//           axis — math.stackexchange.com, site key "math"). Reuses
//           fetchStackExchange — fifth compounding deploy via the SE-multiplexing
//           trick (after serverfault@v2.25, superuser@v2.26, askubuntu@v2.27,
//           crossvalidated@v2.28). Distinct axis from arxiv (bleeding-edge
//           papers), stackoverflow (general programming), and crossvalidated
//           (applied stats + ML methodology): math.SE is undergrad-through-grad
//           pure mathematics — linear algebra, calculus, real analysis, group
//           theory, number theory, topology, probability, combinatorics. Haiku
//           extractor gets a Math-SE input clause: "Prove that …" / "Show that
//           …" / "Find the eigenvalues …" → "linear algebra", "eigenvalues",
//           "integration by parts", "group theory", "modular arithmetic",
//           "infinite series", "matrix decomposition", "differential equations",
//           "complex analysis", "graph theory", "limits", "taylor series".
//           Cron goes 10 → 11 ticks/day (`0 3,6,8,9,11,13,15,16,18,21,23 * * *`):
//           03=arxiv, 06=askubuntu, 08=github, 09=math, 11=stackoverflow,
//           13=hn, 15=crossvalidated, 16=serverfault, 18=wikipedia,
//           21=superuser, 23=bbc. Trigger STRING count UNCHANGED at 5.
//           nextExternalSource cycles all eleven (10 retries cover any starting
//           point); manual `?source=math` accepted. Dashboard adds 📐 for math.
//           Pillar math: 11 ticks × 3 topics × 5 questions = up to 165 cached/day
//           from external alone (was 150 in v2.28). 09 UTC slot fills the
//           previous gap between github@08 and stackoverflow@11 — late-morning
//           Bangkok (16:00 ICT) gets a pure-math axis to seed the cache.
// 2.30.0 — Twelfth external stream: Code Review SE top questions (code-review /
//           idiomatic-style axis — codereview.stackexchange.com, site key
//           "codereview"). Reuses fetchStackExchange — sixth compounding deploy
//           via the SE-multiplexing trick (after serverfault@v2.25,
//           superuser@v2.26, askubuntu@v2.27, crossvalidated@v2.28, math@v2.29).
//           Distinct axis from stackoverflow (problems / "how do I X") and github
//           (artifacts / what's being SHIPPED): codereview is "is this code GOOD"
//           territory — code smells, refactoring triggers, idiomatic constructs,
//           naming, encapsulation, design patterns, performance vs readability
//           trade-offs. Haiku extractor gets a Code-Review input clause:
//           "[Language] [thing] — please review" / "Refactoring my [thing]" /
//           "Is this idiomatic …" → "code refactoring", "design patterns",
//           "code smells", "single responsibility principle", "naming
//           conventions", "error handling patterns", "object encapsulation",
//           "function composition", "code readability", "separation of concerns",
//           "dependency injection". Cron goes 11 → 12 ticks/day
//           (`0 3,6,8,9,11,13,15,16,17,18,21,23 * * *`): 03=arxiv, 06=askubuntu,
//           08=github, 09=math, 11=stackoverflow, 13=hn, 15=crossvalidated,
//           16=serverfault, 17=codereview, 18=wikipedia, 21=superuser, 23=bbc.
//           Trigger STRING count UNCHANGED at 5. nextExternalSource cycles all
//           twelve (11 retries cover any starting point); manual
//           `?source=codereview` accepted. Dashboard adds 🔍 for codereview.
//           Pillar math: 12 ticks × 3 topics × 5 questions = up to 180 cached/day
//           from external alone (was 165 in v2.29). 17 UTC slot fills the
//           previous gap between serverfault@16 and wikipedia@18 — late-evening
//           Bangkok (00:00 ICT next day) gets a code-review axis. Note: 17 UTC
//           on Sunday triggers BOTH the weekly digest (cron `0 17 * * SUN`) and
//           the codereview tick (cron `0 3,...,17,...,23 * * *`) as separate
//           Cloudflare scheduled events — handler routes each cleanly.
// 2.31.0 — Thirteenth external stream: Electrical Engineering SE top questions
//           (electronics / EE / embedded axis — electronics.stackexchange.com,
//           site key "electronics"). Reuses fetchStackExchange — seventh
//           compounding deploy via the SE-multiplexing trick (after
//           serverfault@v2.25, superuser@v2.26, askubuntu@v2.27,
//           crossvalidated@v2.28, math@v2.29, codereview@v2.30). Genuinely
//           distinct axis from any of the 12 prior sources (none cover
//           hardware/EE) — fills the gap between pure software (SO/SF/SU/AU/CR)
//           and physical-world engineering. Haiku extractor gets an Electronics
//           input clause: "How does this circuit …" / "Why is my [component] …" /
//           "How do I drive a [thing] from a [thing]" → "ohms law", "voltage
//           divider", "transistor biasing", "operational amplifier", "pull-up
//           resistor", "decoupling capacitors", "switching power supply", "pcb
//           routing", "i2c protocol", "spi bus", "microcontroller interrupts",
//           "adc sampling", "h-bridge", "ground loops", "rf shielding", "pwm
//           signals", "schmitt trigger". Cron goes 12 → 13 ticks/day
//           (`0 3,6,8,9,11,13,15,16,17,18,21,22,23 * * *`): 03=arxiv,
//           06=askubuntu, 08=github, 09=math, 11=stackoverflow, 13=hn,
//           15=crossvalidated, 16=serverfault, 17=codereview, 18=wikipedia,
//           21=superuser, 22=electronics, 23=bbc. Trigger STRING count
//           UNCHANGED at 5. nextExternalSource cycles all thirteen (12 retries
//           cover any starting point); manual `?source=electronics` accepted.
//           Dashboard adds ⚡ for electronics. Pillar math: 13 ticks × 3
//           topics × 5 questions = up to 195 cached/day from external alone
//           (was 180 in v2.30). 22 UTC slot fills the previous gap between
//           superuser@21 and bbc@23 — late-night UTC (05:00 ICT, early Bangkok
//           morning while Naoufal sleeps) gets an EE/hardware axis. Stack
//           Exchange API budget: now 8 SE sites × 1/site/tick × 13 ticks/day
//           ≈ 13 req/day across SE — still safely under the 300 req/day
//           unauth limit.
// 2.42.0 — Twenty-third external stream: Home Improvement Stack Exchange
//           top questions (residential trades / home-repair axis —
//           diy.stackexchange.com, site key "diy"). Seventeenth
//           compounding deploy via the SE-multiplexing trick (after
//           serverfault@v2.25, superuser@v2.26, askubuntu@v2.27,
//           crossvalidated@v2.28, math@v2.29, codereview@v2.30,
//           electronics@v2.31, security@v2.32, dsp@v2.34, ux@v2.35,
//           gis@v2.36, biology@v2.37, money@v2.38, philosophy@v2.39,
//           cooking@v2.40, academia@v2.41). Genuinely distinct axis —
//           electronics covers low-voltage circuits, superuser covers
//           desktop computing; diy is hands-on residential trades
//           (plumbing, residential electrical, drywall, framing,
//           woodworking, HVAC basics, paint, tile, roofing). Haiku
//           extractor gets a diy input clause: "How do I fix …" /
//           "Why is my [fixture] …" / "What is the best way to
//           [install/replace] …" → "drywall patching", "stud finder",
//           "circuit breaker", "dripping faucet", "drain snake",
//           "window flashing", "toilet flange", "wood joinery",
//           "deck staining", "grout sealing", "load bearing wall",
//           "subfloor moisture", "pex vs copper", "gfci outlet",
//           "vapor barrier", "joist hangers", "shower diverter",
//           "p trap", "miter joint", "shim leveling", "thinset mortar",
//           "drainage slope". Cron goes 22 → 23 ticks/day
//           (`0 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *`):
//           01=cooking, 02=academia, 03=arxiv, 04=money, 05=diy (NEW),
//           06=askubuntu, 07=security, 08=github, 09=math, 10=dsp,
//           11=stackoverflow, 12=ux, 13=hn, 14=gis, 15=crossvalidated,
//           16=serverfault, 17=codereview, 18=wikipedia, 19=biology,
//           20=philosophy, 21=superuser, 22=electronics, 23=bbc.
//           Trigger STRING count UNCHANGED at 5. Dashboard adds 🔨 for
//           diy. Pillar math: 23 ticks × 3 topics × 5 questions =
//           up to 345 cached/day from external alone (was 330 in v2.41).
//           05 UTC slot fills the LAST free hour outside the reserved
//           00/16/17 windows — Bangkok 12:00 (noon) gets a hands-on
//           residential-trades axis. Stack Exchange API budget: now 18
//           SE sites × 1/site/tick × 23 ticks/day ≈ 23 req/day across
//           SE — still safely under the 300 req/day unauth limit.
//           Source code change footprint: <30 lines (ninth consecutive
//           deploy validating the v2.33 registry-pattern promise). v2.42
//           cron string added to the index.ts OR-chain on the same diff.
//           All three local source-union types in auto_coverage.ts
//           (AutoCoverageRun.source + force_source + local `let source`
//           var) include 'diy'. NOTE: After v2.42 all 23 non-reserved
//           hours are used; v2.43+ requires a different multiplexing
//           strategy (per-day source rotation on the same hour, or
//           sub-hour ticks if the platform allows) to add a 24th source.
// 2.41.0 — Twenty-second external stream: Academia Stack Exchange top
//           questions (academic process / scholarly career axis —
//           academia.stackexchange.com, site key "academia"). Sixteenth
//           compounding deploy via the SE-multiplexing trick (after
//           serverfault@v2.25, superuser@v2.26, askubuntu@v2.27,
//           crossvalidated@v2.28, math@v2.29, codereview@v2.30,
//           electronics@v2.31, security@v2.32, dsp@v2.34, ux@v2.35,
//           gis@v2.36, biology@v2.37, money@v2.38, philosophy@v2.39,
//           cooking@v2.40). Genuinely distinct axis from arxiv (raw
//           bleeding-edge papers) and crossvalidated (statistical method):
//           academia.SE is about NAVIGATING academia as a process —
//           publishing, advising, grants, postdocs, peer review,
//           conference logistics, PhD progression. Haiku extractor gets
//           an academia input clause: "How do I …" / "Should I …" /
//           "Is it acceptable to …" / "How long does [process] take" →
//           "peer review process", "h index", "thesis defense", "grant
//           writing", "conference deadlines", "postdoc search", "phd
//           advisor relationship", "journal impact factor", "open access
//           publishing", "academic conferences", "tenure track",
//           "academic citation", "predatory journals", "recommendation
//           letters", "academic plagiarism", "double blind review",
//           "thesis committee", "research ethics", "academic cv",
//           "manuscript revision". Cron goes 21 → 22 ticks/day
//           (`0 1,2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *`):
//           01=cooking, 02=academia (NEW), 03=arxiv, 04=money,
//           06=askubuntu, 07=security, 08=github, 09=math, 10=dsp,
//           11=stackoverflow, 12=ux, 13=hn, 14=gis, 15=crossvalidated,
//           16=serverfault, 17=codereview, 18=wikipedia, 19=biology,
//           20=philosophy, 21=superuser, 22=electronics, 23=bbc.
//           Trigger STRING count UNCHANGED at 5. Dashboard adds 🎓 for
//           academia. Pillar math: 22 ticks × 3 topics × 5 questions =
//           up to 330 cached/day from external alone (was 315 in v2.40).
//           02 UTC slot fills the previously empty post-cooking
//           pre-arxiv window — Bangkok 09:00 (mid-morning) gets a
//           scholarly-career axis. Stack Exchange API budget: now 17
//           SE sites × 1/site/tick × 22 ticks/day ≈ 22 req/day across
//           SE — still safely under the 300 req/day unauth limit.
//           Source code change footprint: <30 lines (eighth consecutive
//           deploy validating the v2.33 registry-pattern promise). v2.41
//           cron string added to the index.ts OR-chain on the same diff.
//           All three local source-union types in auto_coverage.ts
//           (AutoCoverageRun.source + force_source + local `let source`
//           var) include 'academia'.
// 2.40.0 — Twenty-first external stream: Seasoned Advice / Cooking Stack
//           Exchange top questions (culinary technique / food chemistry /
//           baking / knife skills / preservation axis —
//           cooking.stackexchange.com, site key "cooking"). Fifteenth
//           compounding deploy via the SE-multiplexing trick (after
//           serverfault@v2.25, superuser@v2.26, askubuntu@v2.27,
//           crossvalidated@v2.28, math@v2.29, codereview@v2.30,
//           electronics@v2.31, security@v2.32, dsp@v2.34, ux@v2.35,
//           gis@v2.36, biology@v2.37, money@v2.38, philosophy@v2.39).
//           Genuinely distinct axis — no other source covers food /
//           kitchen knowledge. Haiku extractor gets a cooking input
//           clause: "How do I …" / "Why does my [dish] …" / "Can I
//           substitute [ingredient] for …" → "knife sharpening",
//           "sourdough starter", "deglazing pan", "egg substitutes",
//           "caramelization vs maillard", "ingredient substitutions",
//           "salting meat", "tempering chocolate", "stock vs broth",
//           "yeast fermentation", "emulsification", "umami flavor",
//           "pressure cooking", "sous vide", "braising vs stewing",
//           "dough hydration", "kitchen knife types", "deep fry oil
//           temperature", "blooming spices", "resting meat", "cast
//           iron seasoning", "blanching vegetables", "roux thickening",
//           "leavening agents". Cron goes 20 → 21 ticks/day
//           (`0 1,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *`):
//           01=cooking (NEW), 03=arxiv, 04=money, 06=askubuntu,
//           07=security, 08=github, 09=math, 10=dsp, 11=stackoverflow,
//           12=ux, 13=hn, 14=gis, 15=crossvalidated, 16=serverfault,
//           17=codereview, 18=wikipedia, 19=biology, 20=philosophy,
//           21=superuser, 22=electronics, 23=bbc. Trigger STRING count
//           UNCHANGED at 5. Dashboard adds 🍳 for cooking. Pillar math:
//           21 ticks × 3 topics × 5 questions = up to 315 cached/day
//           from external alone (was 300 in v2.39). 01 UTC slot fills
//           the previously empty pre-arxiv window — Bangkok 08:00
//           (early-morning) gets a culinary axis. Stack Exchange API
//           budget: now 16 SE sites × 1/site/tick × 21 ticks/day ≈ 21
//           req/day across SE — still safely under the 300 req/day
//           unauth limit. Source code change footprint: <30 lines
//           (seventh consecutive deploy validating the v2.33 registry-
//           pattern promise). v2.40 cron string added to the index.ts
//           OR-chain on the same diff. All three local source-union
//           types in auto_coverage.ts (AutoCoverageRun.source +
//           force_source + local `let source` var) include 'cooking'.
// 2.39.0 — Twentieth external stream: Philosophy Stack Exchange top questions
//           (formal-philosophy axis — philosophy.stackexchange.com, site key
//           "philosophy"). Fourteenth compounding deploy via the
//           SE-multiplexing trick (after serverfault@v2.25, superuser@v2.26,
//           askubuntu@v2.27, crossvalidated@v2.28, math@v2.29, codereview@v2.30,
//           electronics@v2.31, security@v2.32, dsp@v2.34, ux@v2.35, gis@v2.36,
//           biology@v2.37, money@v2.38). Genuinely distinct axis — no other
//           source covers ethics / logic / epistemology / metaphysics /
//           philosophy of mind / philosophy of science / political philosophy
//           / aesthetics. Haiku extractor gets a philosophy input clause:
//           "What did [thinker] mean by …" / "How can we know …" / "Is it
//           ethical to …" → "categorical imperative", "trolley problem",
//           "modus ponens", "modus tollens", "epistemic justification",
//           "mind body problem", "free will determinism", "moral relativism",
//           "utilitarianism", "deontological ethics", "virtue ethics", "social
//           contract", "ship of theseus", "problem of evil", "ontological
//           argument", "phenomenology", "logical positivism", "the is ought
//           gap", "qualia", "naturalistic fallacy", "transcendental
//           idealism", "existentialism". Cron goes 19 → 20 ticks/day
//           (`0 3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 * * *`):
//           03=arxiv, 04=money, 06=askubuntu, 07=security, 08=github,
//           09=math, 10=dsp, 11=stackoverflow, 12=ux, 13=hn, 14=gis,
//           15=crossvalidated, 16=serverfault, 17=codereview, 18=wikipedia,
//           19=biology, 20=philosophy (NEW), 21=superuser, 22=electronics,
//           23=bbc. Trigger STRING count UNCHANGED at 5. Dashboard adds 🤔
//           for philosophy. Pillar math: 20 ticks × 3 topics × 5 questions =
//           up to 300 cached/day from external alone (was 285 in v2.38). 20
//           UTC slot (Bangkok 03:00) fills the gap between biology@19 and
//           superuser@21 — late-night-Bangkok gets a philosophy axis. Stack
//           Exchange API budget: now 15 SE sites × 1/site/tick × 20 ticks/day
//           ≈ 20 req/day across SE — still safely under the 300 req/day
//           unauth limit. Source code change footprint: <30 lines (sixth
//           consecutive deploy validating the v2.33 registry-pattern
//           promise). v2.39 cron string added to the index.ts OR-chain on
//           the same diff. All three local source-union types in
//           auto_coverage.ts (AutoCoverageRun.source + force_source +
//           local `let source` var) include 'philosophy'.
// 2.38.0 — Nineteenth external stream: Personal Finance & Money Stack Exchange
//           top questions (practical-finance axis — money.stackexchange.com,
//           site key "money"). Thirteenth compounding deploy via the
//           SE-multiplexing trick (after serverfault@v2.25, superuser@v2.26,
//           askubuntu@v2.27, crossvalidated@v2.28, math@v2.29, codereview@v2.30,
//           electronics@v2.31, security@v2.32, dsp@v2.34, ux@v2.35, gis@v2.36,
//           biology@v2.37). Genuinely distinct axis — no other source covers
//           personal finance (budgeting, investing, taxes, retirement,
//           mortgages, credit, insurance, banking). Haiku extractor gets a
//           money input clause: "Should I …" / "How do I …" / "What is the
//           difference between [account/instrument]" → "compound interest",
//           "index fund investing", "roth ira", "401k rollover", "mortgage
//           amortization", "credit utilization", "tax loss harvesting",
//           "emergency fund", "asset allocation", "dollar cost averaging",
//           "capital gains tax", "estate planning", "term vs whole life
//           insurance", "ach vs wire", "checking vs savings", "credit score
//           factors", "etf vs mutual fund", "bond duration", "inflation
//           hedging", "umbrella insurance". Cron goes 18 → 19 ticks/day
//           (`0 3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23 * * *`):
//           03=arxiv, 04=money (NEW), 06=askubuntu, 07=security, 08=github,
//           09=math, 10=dsp, 11=stackoverflow, 12=ux, 13=hn, 14=gis,
//           15=crossvalidated, 16=serverfault, 17=codereview, 18=wikipedia,
//           19=biology, 21=superuser, 22=electronics, 23=bbc. Trigger STRING
//           count UNCHANGED at 5. Dashboard adds 💰 for money. Pillar math:
//           19 ticks × 3 topics × 5 questions = up to 285 cached/day from
//           external alone (was 270 in v2.37). 04 UTC slot fills the previous
//           gap between arxiv@03 and askubuntu@06 — Bangkok 11:00 (mid-morning)
//           gets a personal-finance axis. Stack Exchange API budget: now 14 SE
//           sites × 1/site/tick × 19 ticks/day ≈ 19 req/day across SE — still
//           safely under the 300 req/day unauth limit. Source code change
//           footprint: <30 lines (fifth consecutive deploy validating the
//           v2.33 registry-pattern promise). v2.38 cron string added to the
//           index.ts OR-chain on the same diff. Also fixes a v2.37 lurking
//           type bug where the local `source` variable union in
//           runAutoCoverage omitted 'biology' even though externalSourceForHour
//           could return it; now includes both 'biology' and 'money'.
// 2.37.0 — Eighteenth external stream: Biology Stack Exchange top questions
//           (life sciences axis — biology.stackexchange.com, site key "biology").
//           Twelfth compounding deploy via the SE-multiplexing trick (after
//           serverfault@v2.25, superuser@v2.26, askubuntu@v2.27,
//           crossvalidated@v2.28, math@v2.29, codereview@v2.30,
//           electronics@v2.31, security@v2.32, dsp@v2.34, ux@v2.35, gis@v2.36).
//           Genuinely distinct axis — arxiv skews ML/CS, no other source covers
//           cell biology / genetics / ecology / physiology / evolution /
//           microbiology / neuroscience / biochemistry. Haiku extractor gets a
//           biology input clause: "Why does …" / "How does …" / "What is the
//           difference between [process/structure]" → "cell division", "dna
//           replication", "protein folding", "genetic drift", "natural
//           selection", "enzyme kinetics", "neural signaling", "photosynthesis
//           pathways", "crispr editing", "mitochondrial dna", "ribosome
//           function", "antibody response", "speciation", "ecological niche",
//           "trophic cascade", "homeostasis regulation", "cell signaling",
//           "gene expression", "meiosis recombination", "phylogenetic trees",
//           "stem cell differentiation", "action potential". Cron goes
//           17 → 18 ticks/day
//           (`0 3,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23 * * *`):
//           03=arxiv, 06=askubuntu, 07=security, 08=github, 09=math, 10=dsp,
//           11=stackoverflow, 12=ux, 13=hn, 14=gis, 15=crossvalidated,
//           16=serverfault, 17=codereview, 18=wikipedia, 19=biology (NEW),
//           21=superuser, 22=electronics, 23=bbc. Trigger STRING count UNCHANGED
//           at 5. Dashboard adds 🧬 for biology. Pillar math: 18 ticks × 3
//           topics × 5 questions = up to 270 cached/day from external alone
//           (was 255 in v2.36). 19 UTC slot fills the previous gap between
//           wikipedia@18 and superuser@21 — Bangkok 02:00 (deep sleep) gets a
//           life-sciences axis. Stack Exchange API budget: now 13 SE sites ×
//           1/site/tick × 18 ticks/day ≈ 18 req/day across SE — still safely
//           under the 300 req/day unauth limit. Source code change footprint:
//           <30 lines (fourth consecutive deploy validating the v2.33
//           registry-pattern promise). v2.37 cron string also added to the
//           index.ts OR-chain on the same diff (the v2.36 lesson — never bump
//           wrangler.toml without the matcher).
// 2.36.0 — Seventeenth external stream: GIS Stack Exchange top questions
//           (geographic information systems / mapping / spatial-analysis axis —
//           gis.stackexchange.com, site key "gis"). Eleventh compounding deploy
//           via the SE-multiplexing trick (after serverfault@v2.25,
//           superuser@v2.26, askubuntu@v2.27, crossvalidated@v2.28, math@v2.29,
//           codereview@v2.30, electronics@v2.31, security@v2.32, dsp@v2.34,
//           ux@v2.35). Genuinely distinct axis — no other source covers GIS
//           or cartography. Haiku extractor gets a GIS input clause: "How do I
//           project …" / "Why is my shapefile …" / "What is the difference
//           between [crs/format]" / "How do I geocode …" → "coordinate reference
//           systems", "shapefile format", "geojson schema", "raster vs vector",
//           "spatial joins", "map projections", "postgis queries", "tile
//           servers", "qgis plugins", "arcgis pro", "kriging interpolation",
//           "remote sensing", "satellite imagery", "lidar processing",
//           "georeferencing", "geocoding", "openstreetmap", "spatial indexing",
//           "dem elevation models", "ndvi vegetation index", "topology rules",
//           "buffer analysis". Cron goes 16 → 17 ticks/day
//           (`0 3,6,7,8,9,10,11,12,13,14,15,16,17,18,21,22,23 * * *`):
//           03=arxiv, 06=askubuntu, 07=security, 08=github, 09=math, 10=dsp,
//           11=stackoverflow, 12=ux, 13=hn, 14=gis (NEW), 15=crossvalidated,
//           16=serverfault, 17=codereview, 18=wikipedia, 21=superuser,
//           22=electronics, 23=bbc. Trigger STRING count UNCHANGED at 5.
//           Dashboard adds 🗺️ for gis. Pillar math: 17 ticks × 3 topics × 5
//           questions = up to 255 cached/day from external alone (was 240 in
//           v2.35). 14 UTC slot fills the previous gap between hn@13 and
//           crossvalidated@15 — late-afternoon Bangkok (21:00 ICT) gets a GIS
//           axis. Stack Exchange API budget: now 12 SE sites × 1/site/tick ×
//           17 ticks/day ≈ 17 req/day across SE — still safely under the 300
//           req/day unauth limit. Source code change footprint: <30 lines (third
//           consecutive deploy validating the v2.33 registry-pattern promise).
//           ALSO recovers a regression: the v2.35.0 cron string was bumped in
//           wrangler.toml but never added to the cron-matcher in src/index.ts,
//           so the v2.35.0 cron actually fell through to selfReflectionTick
//           after deploy (UX@12 cron tick never reached runAutoCoverage).
//           v2.36.0 adds BOTH the v2.35.0 and v2.36.0 strings to the matcher
//           — the dsp@10 + ux@12 streams that were silently dropped will start
//           firing again on the next 10/12 UTC ticks.
// 2.35.0 — Sixteenth external stream: User Experience SE top questions
//           (UX / interaction-design / usability axis — ux.stackexchange.com,
//           site key "ux"). Tenth compounding deploy via the SE-multiplexing
//           trick (after serverfault@v2.25, superuser@v2.26, askubuntu@v2.27,
//           crossvalidated@v2.28, math@v2.29, codereview@v2.30, electronics@v2.31,
//           security@v2.32, dsp@v2.34). Genuinely distinct axis — no other
//           source covers UX/design (electronics is hardware, codereview is
//           code-style, the dev-SE sites are functional). Haiku extractor gets
//           a UX input clause: "How should I design …" / "Is it better to …" /
//           "When should I use …" / "Why do users …" → "information
//           architecture", "form design", "navigation patterns", "user
//           onboarding", "progressive disclosure", "affordances", "fitts law",
//           "hick law", "error message design", "empty states", "loading
//           indicators", "modal dialogs", "responsive design", "accessibility
//           wcag", "mobile first design", "color contrast", "typography
//           hierarchy", "user flow", "card sorting", "wireframing", "design
//           systems", "microcopy", "dark patterns", "user research". Cron goes
//           15 → 16 ticks/day (`0 3,6,7,8,9,10,11,12,13,15,16,17,18,21,22,23 * * *`):
//           03=arxiv, 06=askubuntu, 07=security, 08=github, 09=math, 10=dsp,
//           11=stackoverflow, 12=ux (NEW), 13=hn, 15=crossvalidated,
//           16=serverfault, 17=codereview, 18=wikipedia, 21=superuser,
//           22=electronics, 23=bbc. Trigger STRING count UNCHANGED at 5.
//           Dashboard adds 🎨 for ux. Pillar math: 16 ticks × 3 topics × 5
//           questions = up to 240 cached/day from external alone (was 225 in
//           v2.34). 12 UTC slot fills the gap between stackoverflow@11 and
//           hn@13 — midday Bangkok (19:00 ICT) gets a UX axis. Stack Exchange
//           API budget: now 11 SE sites × 1/site/tick × 16 ticks/day ≈ 16
//           req/day across SE — still safely under the 300 req/day unauth
//           limit. Source code change footprint: <30 lines (validates the
//           v2.33 registry-pattern promise for the second consecutive deploy).
// 2.34.0 — Fifteenth external stream: Signal Processing SE top questions
//           (DSP / digital filters / spectral analysis axis —
//           dsp.stackexchange.com, site key "dsp"). FIRST source added via the
//           v2.33 registry refactor — confirms the "<10 lines" promise from
//           the v2.33 changelog: one entry to ExternalSource union, one entry
//           each to EXTERNAL_SOURCES + SOURCE_FETCHERS + SOURCE_CLAUSES, one
//           one-line wrapper (fetchDsp), one hour-window in
//           externalSourceForHour, plus cron + dashboard icon. Total source
//           code change <30 lines (with new clause text + comment block).
//           Reuses fetchStackExchange — ninth compounding deploy via the
//           SE-multiplexing trick (after serverfault@v2.25, superuser@v2.26,
//           askubuntu@v2.27, crossvalidated@v2.28, math@v2.29, codereview@v2.30,
//           electronics@v2.31, security@v2.32). Distinct axis from electronics
//           (more circuits-leaning) and from math (more applied / signal-domain
//           — sampling, filter design, transforms). Haiku extractor gets a DSP
//           input clause: "How do I implement …" / "Why does my filter …" /
//           "What is the difference between [transform/filter]" / "How do I
//           sample …" / "How do I window …" → "fast fourier transform", "fir
//           filter design", "iir filter stability", "windowing functions",
//           "sampling theorem", "discrete cosine transform", "z transform",
//           "convolution theorem", "spectrogram", "kalman filter", "matched
//           filter", "wavelet transform", "phase locked loop", "decimation
//           upsampling", "frequency response", "white noise", "aliasing",
//           "group delay". Cron goes 14 → 15 ticks/day
//           (`0 3,6,7,8,9,10,11,13,15,16,17,18,21,22,23 * * *`): 03=arxiv,
//           06=askubuntu, 07=security, 08=github, 09=math, 10=dsp (NEW),
//           11=stackoverflow, 13=hn, 15=crossvalidated, 16=serverfault,
//           17=codereview, 18=wikipedia, 21=superuser, 22=electronics, 23=bbc.
//           Trigger STRING count UNCHANGED at 5. nextExternalSource cycles all
//           fifteen via the EXTERNAL_SOURCES ring (no manual chain to update);
//           manual `?source=dsp` accepted via the EXTERNAL_SOURCE_SET membership
//           check (no manual OR-chain to update). Dashboard adds 🎛️ for dsp.
//           Pillar math: 15 ticks × 3 topics × 5 questions = up to 225 cached/day
//           from external alone (was 210 in v2.32). 10 UTC slot fills the
//           previous gap between math@09 and stackoverflow@11 — late-morning
//           Bangkok (17:00 ICT) gets a DSP axis. Stack Exchange API budget:
//           now 10 SE sites × 1/site/tick × 15 ticks/day ≈ 15 req/day across
//           SE — still safely under the 300 req/day unauth limit.
// 2.33.0 — Source registry refactor (NO new source, NO behavior change).
//           Internal reshape of external_seeder.ts to prepare for the next
//           5+ sources without bloating the Haiku prompt or the dispatch.
//           Per the v2.32 handoff "REFACTOR ALERT" (system prompt was ~2200
//           chars / 11 input-shape clauses, ~30% past the v2.29 compression
//           threshold), this lands BEFORE adding the 15th source. Three new
//           registries:
//           1) `EXTERNAL_SOURCES: readonly ExternalSource[]` — ordered cycle
//              ring (hour-sorted: arxiv → askubuntu → security → github → math
//              → stackoverflow → hn → crossvalidated → serverfault →
//              codereview → wikipedia → superuser → electronics → bbc).
//              `nextExternalSource` collapses from a 14-line if-chain to
//              `EXTERNAL_SOURCES[(i + 1) % len]`. Retry budget computed as
//              `EXTERNAL_SOURCES.length - 1` instead of hardcoded 13.
//           2) `SOURCE_FETCHERS: Record<ExternalSource, fetcher>` —
//              `pickExternalTopics`'s 13-arm nested ternary becomes
//              `await SOURCE_FETCHERS[source](20)`. Type-safe (TS flags missing
//              keys), and adding a new fetcher is a one-line entry.
//           3) `SOURCE_CLAUSES: Record<ExternalSource, string>` — per-source
//              Haiku input-shape clauses (empty string for hn/wikipedia/bbc
//              which need no distillation guidance). New `buildSystemPrompt()`
//              concatenates BASE + clauses-iterated-over-EXTERNAL_SOURCES +
//              TAIL. Resulting prompt is BYTE-IDENTICAL to v2.32's
//              hand-concatenated string (verified by inspection: same clause
//              order, single space separators, same lead/trail). Adding a
//              source's clause = one record entry.
//           Auto-coverage's `force_source` OR-chains (3 of them, totaling
//           ~40 lines) collapse to `isExternalSource(force)` calls backed by
//           `EXTERNAL_SOURCE_SET`. Same in `index.ts` `?source=` query
//           validation. No new endpoints. No cron change. No dashboard change.
//           No identity change beyond the version bump. The next session can
//           add source N+1 in <10 lines: one entry to EXTERNAL_SOURCES, one
//           to SOURCE_FETCHERS, one to SOURCE_CLAUSES, one hour-window in
//           `externalSourceForHour`, and one cron-string update — no prompt
//           growth, no ternary growth, no OR-chain growth.
// 2.32.0 — Fourteenth external stream: Information Security SE top questions
//           (infosec / cryptography / defensive engineering axis —
//           security.stackexchange.com, site key "security"). Reuses
//           fetchStackExchange — eighth compounding deploy via the SE-multiplexing
//           trick (after serverfault@v2.25, superuser@v2.26, askubuntu@v2.27,
//           crossvalidated@v2.28, math@v2.29, codereview@v2.30, electronics@v2.31).
//           Genuinely distinct axis from any of the 13 prior sources (none cover
//           security/crypto). Haiku extractor gets a Security input clause:
//           "Is it safe to …" / "How do I protect against …" / "Should I use
//           [auth scheme]" → "tls handshake", "password hashing", "csrf
//           protection", "sql injection", "xss prevention", "key derivation
//           function", "session management", "two factor authentication",
//           "rate limiting", "buffer overflow", "zero day vulnerabilities",
//           "public key cryptography", "salting passwords", "oauth flow",
//           "certificate pinning", "side channel attacks". Cron goes 13 → 14
//           ticks/day (`0 3,6,7,8,9,11,13,15,16,17,18,21,22,23 * * *`):
//           03=arxiv, 06=askubuntu, 07=security (NEW), 08=github, 09=math,
//           11=stackoverflow, 13=hn, 15=crossvalidated, 16=serverfault,
//           17=codereview, 18=wikipedia, 21=superuser, 22=electronics, 23=bbc.
//           Trigger STRING count UNCHANGED at 5. nextExternalSource cycles all
//           fourteen (13 retries cover any starting point); manual
//           `?source=security` accepted. Dashboard adds 🔒 for security. Pillar
//           math: 14 ticks × 3 topics × 5 questions = up to 210 cached/day from
//           external alone (was 195 in v2.31). 07 UTC slot fills the previous
//           gap between askubuntu@06 and github@08 — early Bangkok afternoon
//           (14:00 ICT) gets an infosec/crypto axis. Stack Exchange API budget:
//           now 9 SE sites × 1/site/tick × 14 ticks/day ≈ 14 req/day across SE
//           — still safely under the 300 req/day unauth limit.
// 2.43.0 — Twenty-fourth external stream: Science Fiction & Fantasy Stack
//           Exchange (speculative-fiction-canon / world-building axis —
//           scifi.stackexchange.com, site key "scifi"). FIRST per-day-rotation
//           deploy: with all 23 non-reserved hours filled in v2.42, the
//           dispatcher can no longer add a 24th source via a new hour. Instead
//           `externalSourceForHour(hour, dayOfWeek)` now consults the UTC
//           day-of-week. Hour 05 splits: Sun → scifi, Mon-Sat → diy. diy still
//           runs 6/7 days; scifi runs 1/7 (weekly axis bonus). No cron string
//           change — same `0 1,2,…,23 * * *`. Trigger STRING count UNCHANGED
//           at 5. Genuinely distinct axis from any of the 23 prior sources —
//           wikipedia covers cultural lookup of REAL history/people, BBC
//           covers REAL world news; scifi.SE is the canon-deep dive into
//           INVENTED universes (Star Wars / Star Trek / LOTR / Harry Potter /
//           Foundation / Dune / Discworld / Westeros / cyberpunk / hard SF).
//           Haiku extractor gets a scifi input clause: "Why did [character]
//           …" / "How does [magic system / FTL] work in [series]" / "What is
//           the difference between [species/factions]" → "hyperspace travel",
//           "the force jedi", "time travel paradox", "middle earth geography",
//           "asimov three laws", "warp drive star trek", "dune spice melange",
//           "hogwarts houses", "westeros politics", "alien biology", "first
//           contact protocol", "magic system rules", "lightsaber combat
//           forms", "ringworld engineering", "foundation psychohistory",
//           "horcrux soul magic", "ender game tactics", "dystopian society",
//           "space opera tropes", "post apocalyptic fiction", "speculative
//           biology", "alternate history fiction", "deus ex machina".
//           Dashboard adds 🚀 for scifi. Pillar math: same 23 ticks/day, but
//           on Sundays hour 05 is scifi instead of diy — adds a fresh axis
//           for ~52 ticks/year (≈260 cached/year on top of the daily compound).
//           Stack Exchange API budget: now 19 SE sites × ≤1/site/tick × 23
//           ticks/day ≈ 23 req/day across SE — still safely under the 300
//           req/day unauth limit. Source code change footprint: <40 lines
//           (tenth consecutive deploy validating the v2.33 registry-pattern
//           promise; +1 LOC for the dayOfWeek arg + 1 LOC for the Sun branch
//           + 1 LOC for the date-snapshot at call site). All FOUR local
//           source-union types in auto_coverage.ts (AutoCoverageRun.source
//           + force_source + local `let source` var) include 'scifi'.
//           index.ts EXTERNAL_SOURCE_SET picks up scifi automatically via
//           the EXTERNAL_SOURCES export, no OR-chain change needed.
//           STRUCTURAL UNLOCK: this is the dispatch shape v2.44+ will use to
//           keep adding axes without burning more cron hours — pick a hour,
//           pick a day-of-week, point at a new source. The Mon-Sat default
//           is unchanged; only Sunday rotates.
// 2.44.0 — Twenty-fifth external stream: History Stack Exchange (academic
//           historiography / primary-source / period-analysis axis —
//           history.stackexchange.com, site key "history"). FIRST Saturday
//           rotation (v2.43 was the first Sunday rotation), validating that
//           the per-day-rotation dispatcher generalizes to ANY weekday — not
//           just Sunday. Hour 02 splits: Sat → history, Sun-Fri → academia.
//           academia still runs 6/7 days; history runs 1/7. No cron string
//           change — same `0 1,2,…,23 * * *`. Trigger STRING count UNCHANGED
//           at 5. Genuinely distinct axis from any of the 24 prior sources —
//           wikipedia covers cultural lookup of historical people/events at
//           a popular-encyclopedia level, BBC covers world news, scifi covers
//           INVENTED universes; history.SE is the rigorous evaluation of REAL
//           historical events with primary-source citations / period-context
//           / historiographical debate (separate from academia.SE which is
//           about academic-life PROCESS — peer review, thesis defense, h-index
//           — rather than historical CONTENT). Haiku extractor gets a history
//           input clause: "Why did [civilization/empire] …" / "When did
//           [event] …" / "What is the evidence for [claim]" → "roman empire
//           fall", "byzantine succession", "feudal japan shogunate",
//           "industrial revolution", "ottoman empire decline", "thirty years
//           war", "renaissance florence", "ming dynasty", "abbasid caliphate",
//           "carolingian empire", "war of the roses", "spanish reconquista",
//           "han dynasty silk road", "napoleonic wars", "treaty of westphalia",
//           "athenian democracy", "punic wars", "viking expansion", "mongol
//           conquests", "crusades historiography", "primary source analysis",
//           "scholastic period", "magna carta", "americas pre columbian",
//           "feudalism economy", "enlightenment philosophy", "absolutism
//           monarchy". Dashboard adds 📜 for history. Pillar math: same 23
//           ticks/day, but on Saturdays hour 02 is history instead of academia
//           — adds a fresh axis for ~52 ticks/year (≈260 cached/year on top
//           of the daily compound, mirroring the v2.43 scifi-Sunday gain).
//           Stack Exchange API budget: now 20 SE sites × ≤1/site/tick × 23
//           ticks/day ≈ 23 req/day across SE — still safely under the 300
//           req/day unauth limit. Source code change footprint: <30 lines
//           (back to the registry-pattern minimum since dayOfWeek threading
//           was already done in v2.43). All FOUR local source-union types
//           in auto_coverage.ts (AutoCoverageRun.source + force_source +
//           local `let source` var + dispatcher signature) include 'history'.
//           index.ts EXTERNAL_SOURCE_SET picks up history automatically via
//           the EXTERNAL_SOURCES export, no OR-chain change needed. Eleventh
//           consecutive registry-pattern deploy. SECOND per-day rotation
//           branch — Mon-Sat default + per-weekday overrides is now a proven
//           multi-day pattern, not a one-off Sunday hack.
// 2.45.0 — Twenty-sixth external stream: Gardening & Landscaping Stack
//           Exchange (practical horticulture / garden-management axis —
//           gardening.stackexchange.com, site key "gardening"). SECOND
//           Saturday-rotation deploy (after history@v2.44), confirming
//           that the per-day-rotation lane scales: each weekday at an
//           existing hour can take a new source on top of the daily
//           primary. Hour 19 splits: Sat → gardening, Sun-Fri → biology.
//           biology still runs 6/7 days; gardening runs 1/7. No cron
//           string change — same `0 1,2,…,23 * * *`. Trigger STRING count
//           UNCHANGED at 5. Genuinely distinct axis from any of the 25
//           prior sources — biology.SE is academic life-sciences (cell
//           biology, evolution, neuroscience); gardening.SE is hands-on
//           green-thumb knowledge (soil amendments, pest ID, hardiness
//           zones, companion planting, pruning windows, mulching, raised
//           beds, drip irrigation, seed starting, transplant shock).
//           Haiku extractor gets a gardening input clause: "Why is my
//           [plant] …" / "How do I [prune/fertilize/water] …" / "When
//           should I [plant/transplant/harvest]" → "soil ph amendments",
//           "tomato blight prevention", "raised bed construction",
//           "companion planting", "compost troubleshooting", "drip
//           irrigation design", "pruning fruit trees", "powdery mildew
//           control", "seed starting indoors", "hardiness zone planning",
//           "mulching benefits", "container vegetable gardening",
//           "perennial division", "lawn renovation", "transplant shock
//           recovery", "aphid pest control", "root bound plants",
//           "nitrogen deficiency", "cover crops", "vegetable rotation",
//           "leaf mold composting", "frost protection", "deadheading
//           flowers", "hardening off seedlings", "soil drainage".
//           Dashboard adds 🌷 for gardening. Pillar math: same 23
//           ticks/day, but on Saturdays hour 19 is gardening instead of
//           biology — adds a fresh axis for ~52 ticks/year (≈260
//           cached/year on top of the daily compound, mirroring the
//           v2.43 scifi-Sunday and v2.44 history-Saturday gains). Stack
//           Exchange API budget: now 21 SE sites × ≤1/site/tick × 23
//           ticks/day ≈ 23 req/day across SE — still safely under the
//           300 req/day unauth limit. Source code change footprint: <30
//           lines (registry pattern + 1-line dayOfWeek branch on hour 19).
//           All FOUR local source-union types in auto_coverage.ts
//           (AutoCoverageRun.source + force_source + local `let source`
//           var + dispatcher signature) include 'gardening'. index.ts
//           EXTERNAL_SOURCE_SET picks up gardening automatically via the
//           EXTERNAL_SOURCES export, no OR-chain change needed. Twelfth
//           consecutive registry-pattern deploy. THIRD per-day rotation
//           branch (Sat 02 history + Sat 19 gardening + Sun 05 scifi);
//           Saturday now has TWO rotation slots, demonstrating that any
//           weekday can carry multiple new axes without colliding.
// 2.46.0 — Multi-provider extractor: pillar resilience under credit
//           outage. extractTopicsFromTitles now tries Anthropic Haiku
//           first (the cheap, cached, primary path), and on empty
//           response falls back to Together.ai Llama-3.3-70B-Turbo
//           with the same system + user prompts. Triggered by the
//           2026-05-08 incident where the Anthropic credit balance
//           emptied out and EVERY external auto-coverage tick silent-
//           failed for hours under v2.44, then surfaced as
//           `extract_empty: type=invalid_request_error msg=Your credit
//           balance is too low …` under v2.45's diagnostic surface.
//           v2.46 makes the next such outage non-fatal — Together is
//           independent of Anthropic billing, the JSON-array output
//           format is unchanged, and the existing parser handles both
//           providers byte-identically. AutoCoverageRun now carries
//           an `extractor` field ('haiku' | 'together:<model>') so
//           the dashboard / `/improve/coverage/auto/latest` shows
//           which path actually produced the topics — fallback is
//           NEVER silent, just non-blocking. recordUsage logs the
//           Together call under model='meta-llama/Llama-3.3-70B-
//           Instruct-Turbo' so the pillar metric correctly attributes
//           the spend. Behavior when both providers are healthy is
//           byte-identical to v2.45. No new routes, no cron change,
//           no new sources. Source footprint: ~50 LOC across
//           external_seeder.ts (import callTogether + retry block +
//           extractor return field) and auto_coverage.ts (extractor
//           threading + AutoCoverageRun field). Pillar metric stops
//           flatlining the moment this deploys.
// 2.47.0 — Twenty-seventh external stream: Chess Stack Exchange (chess
//           theory / strategic analysis / game canon axis —
//           chess.stackexchange.com, site key "chess"). THIRD
//           Saturday-rotation deploy (after history@v2.44 and
//           gardening@v2.45), confirming a single weekday can carry
//           multiple new axes without colliding. Hour 12 splits:
//           Sat → chess, Sun-Fri → ux. ux still runs 6/7 days; chess
//           runs 1/7. Saturday now has THREE rotation slots
//           (02 history + 12 chess + 19 gardening). No cron string
//           change — same `0 1,2,…,23 * * *`. Trigger STRING count
//           UNCHANGED at 5. Genuinely distinct axis from any of the 26
//           prior sources — no math.SE / codereview.SE / philosophy.SE
//           coverage of game-theoretic strategic domains; chess.SE is
//           a deep tradition with concrete named concepts (Sicilian
//           Defense, Ruy Lopez, King's Indian, Queen's Gambit, en
//           passant, castling, fork/pin/skewer, zugzwang, zwischenzug,
//           Lucena/Philidor positions, opposition endgame, isolated
//           queen pawn, hanging pawns, minority attack, Capablanca
//           endgame technique). Haiku extractor (with Together
//           fallback inherited from v2.46) gets a chess input clause:
//           "Why does [white/black] play …" / "How should I respond
//           to [opening] …" / "What is the best move in [position]"
//           / "Is [variation] sound" → "sicilian najdorf", "ruy lopez
//           theory", "king's indian defense", "queen's gambit
//           declined", "french defense", "caro kann", "english
//           opening", "endgame opposition", "rook pawn endgames",
//           "lucena position", "philidor position", "isolated queen
//           pawn", "hanging pawns", "minority attack", "fork pin
//           skewer", "discovered check", "double attack tactics",
//           "zugzwang endgames", "zwischenzug tactics", "positional
//           sacrifice", "pawn structure", "piece activity", "king
//           safety", "elo rating system", "fide tournament rules",
//           "chess engine analysis", "blitz time controls",
//           "castling rules", "en passant rule", "fischer random
//           chess960", "capablanca endgame technique", "tactical
//           motifs". Dashboard adds ♟️ for chess. Pillar math: same
//           23 ticks/day, but on Saturdays hour 12 is chess instead
//           of ux — adds a fresh axis for ~52 ticks/year (≈260
//           cached/year on top of the daily compound, mirroring the
//           v2.43 scifi-Sunday and v2.44/v2.45 Saturday gains). Stack
//           Exchange API budget: now 22 SE sites × ≤1/site/tick × 23
//           ticks/day ≈ 23 req/day across SE — still safely under the
//           300 req/day unauth limit. Source code change footprint:
//           <30 lines (registry pattern + 1-line dayOfWeek branch on
//           hour 12). All FOUR local source-union types in
//           auto_coverage.ts (AutoCoverageRun.source + force_source +
//           local `let source` var + dispatcher signature) include
//           'chess'. index.ts EXTERNAL_SOURCE_SET picks up chess
//           automatically via the EXTERNAL_SOURCES export, no
//           OR-chain change needed. Thirteenth consecutive
//           registry-pattern deploy. FOURTH per-day rotation branch
//           (Sat 02 history + Sat 12 chess + Sat 19 gardening +
//           Sun 05 scifi). Builds on v2.46's resilience — fallback
//           extractor catches Anthropic outages here too, so chess
//           Saturdays seed even when primary credits are dark.
// 2.48.0 — Twenty-eighth external stream: Movies & TV Stack Exchange
//           (film canon / narrative craft / cinematic technique axis —
//           movies.stackexchange.com, site key "movies"). FOURTH
//           Saturday-rotation deploy (after history@v2.44, gardening@v2.45,
//           chess@v2.47), pushing Saturday to FOUR rotation slots in
//           a single weekday — first multi-axis weekend stack of this
//           density. Hour 18 splits: Sat → movies, Sun-Fri → wikipedia.
//           wikipedia still runs 6/7 days; movies runs 1/7. Saturday now
//           has FOUR rotation slots (02 history + 12 chess + 18 movies +
//           19 gardening). No cron string change — same `0 1,2,…,23 * * *`.
//           Trigger STRING count UNCHANGED at 5. Genuinely distinct axis
//           from any of the 27 prior sources — no philosophy.SE /
//           academia.SE / scifi.SE coverage of cinema-as-cinema; movies.SE
//           is the canon-and-craft layer (auteur theory, three-act
//           structure, montage, mise en scène, hero's journey, hays code,
//           neorealism, french new wave, dogme 95, kuleshov effect, jump
//           cut, long take, dolly zoom, chiaroscuro lighting, foley sound
//           design, miyazaki animation, kurosawa composition, hitchcock
//           suspense, scorsese tracking shots, kubrick framing, wes
//           anderson symmetry). Haiku extractor (with Together fallback
//           inherited from v2.46) gets a movies input clause: "Why does
//           [character] …" / "What does [scene/symbol] mean" / "How was
//           [shot/effect] achieved" / "Why did [director] choose …" →
//           "auteur theory", "three act structure", "kuleshov effect",
//           "dolly zoom shot", "long take cinematography", "chiaroscuro
//           lighting", "miyazaki animation", "kurosawa composition",
//           "hitchcock suspense", "french new wave", "italian neorealism",
//           "dogme 95 movement", "hero's journey narrative", "unreliable
//           narrator film", "non linear storytelling", "mise en scene",
//           "montage editing", "diegetic sound", "foley sound design",
//           "studio system hollywood", "hays code era", "method acting
//           tradition", "screenplay structure", "production design",
//           "color grading film", "establishing shot grammar", "match on
//           action editing", "film noir", "silent era cinema", "stop
//           motion animation", "practical effects vs cgi", "wes anderson
//           symmetry", "tarantino dialogue", "scorsese tracking shots",
//           "kubrick framing". Dashboard adds 🎬 for movies. Pillar
//           math: same 23 ticks/day, but on Saturdays hour 18 is movies
//           instead of wikipedia — adds a fresh axis for ~52 ticks/year
//           (≈260 cached/year on top of the daily compound, mirroring
//           the v2.43 scifi-Sunday and v2.44/v2.45/v2.47 Saturday gains).
//           Stack Exchange API budget: now 23 SE sites × ≤1/site/tick ×
//           23 ticks/day ≈ 23 req/day across SE — still safely under
//           the 300 req/day unauth limit. Source code change footprint:
//           <30 lines (registry pattern + 1-line dayOfWeek branch on
//           hour 18). All FOUR local source-union types in
//           auto_coverage.ts (AutoCoverageRun.source + force_source +
//           local `let source` var + dispatcher signature) include
//           'movies'. index.ts EXTERNAL_SOURCE_SET picks up movies
//           automatically via the EXTERNAL_SOURCES export, no
//           OR-chain change needed. Fourteenth consecutive
//           registry-pattern deploy. FIFTH per-day rotation branch
//           (Sat 02 history + Sat 12 chess + Sat 18 movies +
//           Sat 19 gardening + Sun 05 scifi). Builds on v2.46's
//           resilience — fallback extractor catches Anthropic outages
//           here too, so movies Saturdays seed even when primary
//           credits are dark. Saturday density milestone: a single
//           weekday now carries four day-specific axes layered on
//           top of the 23 hourly axes the rest of the week shares.
// 2.49.0 — Twenty-ninth external stream: Board & Card Games Stack Exchange
//           (tabletop strategy / game-design canon axis —
//           boardgames.stackexchange.com, site key "boardgames"). FIFTH
//           Saturday-rotation deploy (after history@v2.44, gardening@v2.45,
//           chess@v2.47, movies@v2.48), pushing Saturday to FIVE rotation
//           slots in a single weekday — first FIVE-axis weekend stack.
//           Hour 13 splits: Sat → boardgames, Sun-Fri → hn. hn still runs
//           6/7 days; boardgames runs 1/7. Saturday now has FIVE rotation
//           slots (02 history + 12 chess + 13 boardgames + 18 movies +
//           19 gardening). No cron string change — same `0 1,2,…,23 * * *`.
//           Trigger STRING count UNCHANGED at 5. Genuinely distinct axis
//           from chess.SE — chess is one specific game, boardgames covers
//           the broader strategy / euro / wargame canon (Catan, Carcassonne,
//           Ticket to Ride, Agricola, Puerto Rico, Twilight Imperium,
//           Terraforming Mars, Wingspan, Scythe, Gloomhaven, Pandemic,
//           Magic: The Gathering, Backgammon, Bridge, Go, Shogi, Poker,
//           D&D combat). Haiku extractor (with Together fallback inherited
//           from v2.46) gets a boardgames input clause: "Why is [mechanic]
//           balanced" / "How does [card/rule] interact with …" / "What is
//           the optimal strategy for [game]" / "Is [edge case] resolved
//           by …" → "euro game design", "worker placement mechanic",
//           "deck building strategy", "area control wargame", "auction
//           bidding mechanic", "engine building", "asymmetric factions",
//           "kingmaker problem", "analysis paralysis", "catan opening
//           strategy", "carcassonne tile placement", "ticket to ride
//           routes", "agricola farm management", "puerto rico role
//           selection", "twilight imperium grand strategy", "terraforming
//           mars engine", "wingspan combos", "scythe asymmetric power",
//           "gloomhaven campaign", "pandemic cooperative", "magic the
//           gathering mana curve", "commander format edh", "limited draft
//           theory", "go fuseki opening", "shogi castle", "backgammon
//           pip count", "poker pot odds", "bridge bidding convention".
//           Dashboard adds 🎲 for boardgames. Pillar math: same 23
//           ticks/day, but on Saturdays hour 13 is boardgames instead
//           of hn — adds a fresh axis for ~52 ticks/year (≈260 cached/year
//           on top of the daily compound, mirroring the v2.43 scifi-Sunday
//           and v2.44/v2.45/v2.47/v2.48 Saturday gains). Stack Exchange
//           API budget: now 24 SE sites × ≤1/site/tick × 23 ticks/day
//           ≈ 24 req/day across SE — still safely under the 300 req/day
//           unauth limit. Source code change footprint: <30 lines (registry
//           pattern + 1-line dayOfWeek branch on hour 13). All FOUR local
//           source-union types in auto_coverage.ts include 'boardgames'.
//           index.ts EXTERNAL_SOURCE_SET picks up boardgames automatically
//           via the EXTERNAL_SOURCES export, no OR-chain change needed.
//           Fifteenth consecutive registry-pattern deploy. SIXTH per-day
//           rotation branch (Sat 02 history + Sat 12 chess + Sat 13
//           boardgames + Sat 18 movies + Sat 19 gardening + Sun 05 scifi).
//           Builds on v2.46's resilience — fallback extractor catches
//           Anthropic outages here too, so boardgames Saturdays seed even
//           when primary credits are dark. Saturday density milestone:
//           a single weekday now carries FIVE day-specific axes layered
//           on top of the 23 hourly axes the rest of the week shares.
// 2.50.0 — Thirtieth external stream: The Workplace Stack Exchange
//           (career / professional norms / workplace dynamics axis —
//           workplace.stackexchange.com, site key "workplace"). FIRST
//           Friday-rotation deploy, opening the FRIDAY lane (after 4
//           Saturday-only deploys at v2.44/45/47/48/49 + 1 Sunday-only
//           at v2.43). Hour 06 splits: Fri → workplace, Sun-Thu+Sat →
//           askubuntu. askubuntu still runs 6/7 days; workplace runs 1/7.
//           No cron string change — same `0 1,2,…,23 * * *`. Trigger
//           STRING count UNCHANGED at 5. Genuinely distinct axis from
//           academia.SE (academic-track careers) and money.SE (personal
//           finance) — workplace.SE is the day-to-day professional realm:
//           salary negotiation, performance reviews, giving notice,
//           managing up, remote work etiquette, imposter syndrome,
//           behavioral interviews, IC vs management track, 1on1
//           frameworks, constructive feedback, conflict resolution,
//           burnout prevention, compensation benchmarking, stock
//           vesting, exit interviews, professional references, LinkedIn
//           optimization, mentorship, psychological safety, OKRs.
//           Haiku extractor (with Together fallback inherited from
//           v2.46) gets a workplace input clause: "How do I tell my
//           manager …" / "Should I quit if …" / "Is it appropriate to
//           …" / "How should I respond when [colleague/boss] …" / "What
//           is the best way to ask for [raise/promotion/feedback]" →
//           "salary negotiation tactics", "performance review
//           preparation", "giving notice professionally", "managing up
//           effectively", "remote work etiquette", "code switching at
//           work", "imposter syndrome career", "career pivot strategy",
//           "informational interview", "behavioral interview star
//           method", "1on1 meeting framework", "constructive feedback
//           delivery", "difficult conversations workplace", "psychological
//           safety team", "radical candor framework", "okrs goal setting".
//           Dashboard adds 💼 for workplace. Pillar math: same 23
//           ticks/day, but on Fridays hour 06 is workplace instead of
//           askubuntu — adds a fresh axis for ~52 ticks/year (≈260
//           cached/year on top of the daily compound). Stack Exchange
//           API budget: now 25 SE sites × ≤1/site/tick × 23 ticks/day
//           ≈ 25 req/day across SE — still safely under the 300 req/day
//           unauth limit. Source code change footprint: <30 lines
//           (registry pattern + 1-line dayOfWeek branch on hour 06).
//           All FOUR local source-union types in auto_coverage.ts include
//           'workplace'. index.ts EXTERNAL_SOURCE_SET picks up workplace
//           automatically via the EXTERNAL_SOURCES export, no OR-chain
//           change needed. Sixteenth consecutive registry-pattern deploy.
//           SEVENTH per-day rotation branch (Sat 02 history + Fri 06
//           workplace + Sat 12 chess + Sat 13 boardgames + Sat 18 movies
//           + Sat 19 gardening + Sun 05 scifi). FIRST Friday-only branch
//           — proves the day-specific override pattern generalizes to
//           non-weekend days. Builds on v2.46's resilience — fallback
//           extractor catches Anthropic outages here too, so workplace
//           Fridays seed even when primary credits are dark.
// 2.51.0 — Thirty-first external stream: Parenting Stack Exchange
//           (child development / family dynamics / domestic life canon
//           axis — parenting.stackexchange.com, site key "parenting").
//           SECOND Sunday-rotation deploy (after scifi@v2.43), opening a
//           SECOND Sunday lane and bringing weekly day-specific axes to
//           SEVEN total. Hour 11 splits: Sun → parenting, Mon-Sat →
//           stackoverflow. stackoverflow still runs 6/7 days; parenting
//           runs 1/7. No cron string change — same `0 1,2,…,23 * * *`.
//           Trigger STRING count UNCHANGED at 5. Genuinely distinct axis
//           from any prior source — no psychology / human-development
//           coverage in academia.SE; parenting.SE is the applied
//           family-life domain (attachment theory, authoritative vs
//           permissive vs free-range parenting, sleep methods like
//           Ferber/cry-it-out/cosleeping, baby-led weaning, picky eating,
//           potty training, toddler tantrums, sibling rivalry, blended
//           families, co-parenting after divorce, homeschool curricula,
//           Montessori/Waldorf/Reggio approaches, executive function
//           development, emotion coaching, growth mindset, teen autonomy,
//           screen addiction). Haiku extractor (with Together fallback
//           inherited from v2.46) gets a parenting input clause: "How do
//           I get my [age] year old to …" / "Is it normal for my child
//           to …" / "How should I respond when my [toddler/teen] …" →
//           "attachment parenting theory", "authoritative parenting
//           style", "positive discipline framework", "sleep training
//           methods", "ferber method sleep", "cosleeping safety", "baby
//           led weaning", "potty training readiness", "toddler tantrums",
//           "sibling rivalry resolution", "co parenting after divorce",
//           "montessori method home", "waldorf education", "reggio
//           emilia approach", "free range parenting", "helicopter
//           parenting effects", "executive function development",
//           "emotion coaching method", "growth mindset parenting",
//           "teen autonomy negotiation", "screen addiction adolescent".
//           Dashboard adds 👶 for parenting. Pillar math: same 23
//           ticks/day, but on Sundays hour 11 is parenting instead of
//           stackoverflow — adds a fresh axis for ~52 ticks/year (≈260
//           cached/year on top of the daily compound). Stack Exchange
//           API budget: now 26 SE sites × ≤1/site/tick × 23 ticks/day
//           ≈ 26 req/day across SE — still safely under the 300 req/day
//           unauth limit. Source code change footprint: <30 lines
//           (registry pattern + 1-line dayOfWeek branch on hour 11).
//           All FOUR local source-union types in auto_coverage.ts
//           include 'parenting'. index.ts EXTERNAL_SOURCE_SET picks up
//           parenting automatically via the EXTERNAL_SOURCES export, no
//           OR-chain change needed. Seventeenth consecutive registry-
//           pattern deploy. EIGHTH per-day rotation branch (Sat 02
//           history + Fri 06 workplace + Sun 11 parenting + Sat 12 chess
//           + Sat 13 boardgames + Sat 18 movies + Sat 19 gardening +
//           Sun 05 scifi). SECOND Sunday-only branch — Sunday now
//           carries TWO day-specific axes (05 scifi + 11 parenting),
//           proving multi-axis stacking generalizes beyond Saturday.
//           Builds on v2.46's resilience — fallback extractor catches
//           Anthropic outages here too, so parenting Sundays seed even
//           when primary credits are dark. Distribution rationale:
//           Sunday morning UTC = family-time energy worldwide; rotating
//           from pure-code (stackoverflow) to family-life (parenting)
//           matches the day's gestalt. THREE-DEPLOY SESSION (v2.49
//           boardgames + v2.50 workplace + v2.51 parenting) following
//           the same v2.47/v2.48 cadence — three new axes shipped in
//           a single autonomous session at <30 LOC + <5 minutes per
//           axis, validating the registry pattern at scale.
// 2.52.0 — QUAD-PACK external sources: anime + hermeneutics + bicycles +
//           japanese — FOUR new Stack Exchange axes shipped in one deploy.
//           Source count goes 31 → 35. Day-specific overrides go 8 → 12.
//           Opens TWO new weekday rotation lanes (Tue + Wed):
//           - anime (anime.stackexchange.com) — Sun hour 13 (replaces hn).
//             THIRD Sunday lane. Studio Ghibli, Madhouse, Kyoto Animation,
//             Trigger, SHAFT; Miyazaki/Anno/Yuasa/Hosoda/Yamada/Shinkai/
//             Tezuka traditions; shonen/seinen/shojo/isekai/mecha/slice-of-
//             life; manga panel composition, sakuga animation, manga-to-
//             anime adaptation craft.
//           - hermeneutics (hermeneutics.stackexchange.com) — Sun hour 20
//             (replaces philosophy). FOURTH Sunday lane. Documentary
//             hypothesis, synoptic problem, Q source; form/source/redaction
//             criticism; midrash + Talmudic + halakhic methods; hadith
//             authentication + isnad + tafsir; Septuagint/Vulgate/Masoretic;
//             patristic, Reformation, liberation, feminist hermeneutics.
//           - bicycles (bicycles.stackexchange.com) — Wed hour 14 (replaces
//             gis). FIRST Wednesday lane — opens the WEDNESDAY rotation.
//             Gear ratios, cadence, chain/cassette wear, frame geometry
//             road/gravel/MTB, suspension, bike fit, FTP test, training
//             zones, bikepacking, randonneuring, fixed-gear, cyclocross.
//           - japanese (japanese.stackexchange.com) — Tue hour 15 (replaces
//             crossvalidated). FIRST Tuesday lane — opens the TUESDAY
//             rotation. Kanji etymology, joyo list, jukugo compounds,
//             on/kun readings; particles, te/masu/plain forms, keigo
//             registers; godan/ichidan verbs; conditional/volitional
//             forms; dialects, classical Japanese, kanbun, manyogana,
//             loanwords gairaigo, onomatopoeia gitaigo, honorifics.
//           After v2.52: Tue (japanese), Wed (bicycles), Fri (workplace),
//           Sat (5 axes), Sun (4 axes). Mon + Thu still unclaimed — next
//           expansion targets. SE site count: 26 → 30. Daily SE budget
//           ≈ 30 req/day vs 300 req/day limit — still huge headroom.
//           ~100 LOC across 4 sources. Cron trigger string UNCHANGED.
//           Dashboard gets 🎌 anime / 📖 hermeneutics / 🚴 bicycles /
//           🗾 japanese label branches. FIRST quad-pack deploy in the
//           project's history — proves the registry pattern scales not
//           just to "one new axis at a time" but to bulk axis-pack
//           additions with no incremental risk. Eighteenth consecutive
//           registry-pattern deploy.
// 2.53.0 — DUAL-PACK external sources: quant + linguistics — claims the
//           LAST TWO unclaimed weekdays (Mon + Thu). Source count
//           35 → 37. Day-specific overrides 12 → 14. After v2.53 ALL
//           SEVEN weekdays carry at least one day-specific override —
//           the rotation matrix is now FULLY POPULATED:
//           - quant (quant.stackexchange.com) — Mon hour 04 (replaces
//             money). FIRST Monday lane — opens the MONDAY rotation.
//             Mathematical/computational finance: Black-Scholes, binomial
//             trees, Monte Carlo, stochastic vol (Heston/Dupire), greeks,
//             VaR/ES, term-structure models (Hull-White/Vasicek/CIR/LMM),
//             yield curve bootstrapping, CDS pricing, Markowitz/efficient
//             frontier, CAPM/Fama-French, risk parity, Kelly, Black-
//             Litterman, Itô calculus, Girsanov, Feynman-Kac, jump
//             diffusion, market microstructure, statistical arbitrage,
//             GARCH, no-arbitrage / FTAP. Distinct from money.SE which
//             is consumer personal finance — quant.SE is the academic /
//             quant-trading axis.
//           - linguistics (linguistics.stackexchange.com) — Thu hour 15
//             (replaces crossvalidated). FIRST Thursday lane — opens
//             the THURSDAY rotation. General linguistics across ALL
//             human languages: IPA + phoneme/allophone, prosody, tone,
//             morpheme types, ergative/accusative alignment, case
//             typology, gender/classifiers, aspect/TAM/evidentiality,
//             X-bar/minimalism/dependency syntax, binding, theta roles,
//             truth-conditional/Montague semantics, Gricean implicature,
//             speech acts, Indo-European reconstruction, comparative
//             method, Grimm's law, Great Vowel Shift, creole/pidgin,
//             sociolinguistic variation, code-switching, universal
//             grammar, linguistic relativity, construction grammar,
//             prototype theory, frame semantics. Distinct from
//             japanese.SE (Tue 15) which is Japanese-specific —
//             linguistics.SE is the cross-language theoretical axis.
//             Hour 15 is now THREE-WAY (Tue=japanese, Thu=linguistics,
//             else crossvalidated) — first time a single hour carries
//             three distinct weekday axes.
//           ~70 LOC across 4 files (external_seeder.ts type+fetcher+
//           registry+clauses, auto_coverage.ts type+hour rules+comment,
//           page.ts labels, identity.ts changelog). After v2.53: full
//           weekday matrix complete (Mon=quant, Tue=japanese, Wed=
//           bicycles, Thu=linguistics, Fri=workplace, Sat=5 axes,
//           Sun=4 axes). 14 day-specific overrides total. SE site count
//           30 → 32. Daily SE budget ≈ 32 req/day vs 300 req/day limit
//           — abundant headroom. Cron trigger string UNCHANGED. Route
//           count UNCHANGED. Wrangler config UNCHANGED. Dashboard gets
//           📈 quant + 🔤 linguistics label branches. SECOND multi-pack
//           deploy (v2.52 was QUAD, this is DUAL) — proves the registry
//           pattern handles arbitrary axis-pack widths. Nineteenth
//           consecutive registry-pattern deploy.
// 2.54.0 — RPG external source — Saturday hour 21 (replaces superuser
//           Sat-only). SIXTH Saturday-rotation axis on top of the
//           existing five (02 history, 12 chess, 13 boardgames, 18
//           movies, 19 gardening). Saturday now claims SIX of 23 hours
//           with day-specific rotations — proves a single weekday can
//           absorb arbitrarily many axis-rotations as long as the hours
//           stay distinct. Source count 37 → 38. Day-specific overrides
//           14 → 15. Distinct from chess.SE (chess specifically) and
//           boardgames.SE (board games proper) — rpg.SE covers the
//           tabletop role-playing axis: D&D 5e / Pathfinder 2e / OSR /
//           PbtA / Blades in the Dark / Fate / GURPS / WoD / Vampire /
//           CoC / Shadowrun / Starfinder / 40k RPG; system mastery,
//           build optimization, encounter design, GM craft, session
//           zero, safety tools (lines and veils, X card), sandbox vs
//           railroad, hex crawl exploration, theater-of-mind vs
//           battlemap, virtual tabletops (roll20, foundry), dice
//           probability via anydice. Same registry pattern: ~30 LOC.
//           Cron trigger string UNCHANGED. Route count UNCHANGED.
//           Wrangler config UNCHANGED. Dashboard gets 🐉 rpg label.
//           Twentieth consecutive registry-pattern deploy.
// 2.55.0 — QUAD-PACK weekday second-axis stacking — matheducators +
//           softwareengineering + engineering + politics. Claims the
//           SECOND axis on every previously-single-axis weekday:
//           - Tue 09 → matheducators (replaces math) [pedagogy of math, NOT pure math]
//           - Wed 17 → softwareengineering (replaces codereview) [architecture/design, NOT working code]
//           - Thu 22 → engineering (replaces electronics) [mechanical/civil/structural, NOT EE]
//           - Fri 23 → politics (replaces bbc) [political science, NOT current news]
//           After this deploy, weekday lane counts are: Mon=1, Tue=2,
//           Wed=2, Thu=2, Fri=2, Sat=6, Sun=4 — total 19 day-specific
//           overrides across 23 hourly ticks. Source count 38 → 42.
//           Day-specific overrides 15 → 19. FOUR new sources in ONE
//           deploy validates that the registry-pattern scales linearly
//           regardless of pack size. Each new clause carefully chosen to
//           be axis-DISTINCT from its primary: matheducators.SE focuses
//           on classroom dynamics + curriculum + proof literacy + math
//           anxiety + concept-image research, distinct from math.SE
//           (pure mathematics theorems and problems). softwareengineering.SE
//           focuses on architecture / patterns / methodology (DDD, SOLID,
//           DI, agile, TDD) distinct from codereview.SE (style on
//           working code). engineering.SE focuses on mechanical/civil/
//           structural physical-world engineering (beams, fluids,
//           thermodynamics, manufacturing) distinct from electronics.SE
//           (circuits/embedded). politics.SE focuses on political-science
//           theory (electoral systems, comparative government, IR theory)
//           distinct from bbc (current news headlines). Same registry
//           pattern: ~30 LOC per source = ~120 LOC total. Cron trigger
//           string UNCHANGED. Route count UNCHANGED. Wrangler config
//           UNCHANGED. Dashboard gets 4 new emoji labels. Twenty-first
//           consecutive registry-pattern deploy. After this deploy ALL
//           7 weekdays have at least 1 lane and 5 of 7 have ≥2 lanes —
//           rotation matrix transitioning from "claim every weekday"
//           era (v2.52→v2.54) to "stack depth on each weekday" era.
// 2.56.0 — TRIPLE-PACK Mon depth — music + photo + ham. Mon was the
//           ONLY remaining single-axis weekday after v2.55 (only quant
//           at hour 04 separating it from money on every other day).
//           v2.56 takes Mon from 1 → 4 lanes in ONE deploy by claiming
//           three previously-untouched evening hours:
//           - Mon 11 → music (replaces stackoverflow) [music theory /
//             harmony / instruments / performance / production / mixing —
//             axis NO other day touches]
//           - Mon 18 → photo (replaces wikipedia) [photography craft —
//             cameras / lenses / lighting / composition / editing —
//             distinct from movies.SE which is film canon]
//           - Mon 22 → ham (replaces electronics) [amateur radio
//             operating / propagation / antennas / FCC / digital modes —
//             distinct from electronics.SE which is circuits/embedded EE,
//             same separation as engineering.SE vs electronics.SE in v2.55]
//           After this deploy, weekday lane counts are: Mon=4, Tue=2,
//           Wed=2, Thu=2, Fri=2, Sat=6, Sun=4 — total 22 day-specific
//           overrides across 23 hourly ticks. Source count 42 → 45.
//           Day-specific overrides 19 → 22. After this deploy Mon JUMPS
//           from being the lowest-density weekday (1 lane) to being the
//           SECOND-DENSEST weekday (4 lanes), tied with Sun and behind
//           only Sat (6 lanes). Mon now carries: 04 quant (academic
//           finance) → 11 music (creative/performance) → 18 photo
//           (creative/visual) → 22 ham (operating/regulatory). The
//           gestalt is "Mon = the autodidact's day" — quant for the
//           morning rigor, music for the lunchtime reset, photo for the
//           evening creative axis, ham for the late-night hobby/skill
//           stack. TRIPLE-PACK validates 3-source deploys at the same
//           wall-clock pace as QUAD-PACK (~10 min). Each new clause
//           carefully chosen to be axis-DISTINCT from its primary:
//           music.SE = theory/practice/production (NOT band news);
//           photo.SE = craft/composition/editing (NOT camera-purchase
//           news, distinct from movies.SE film canon); ham.SE = HF/VHF
//           operating + antennas + propagation + FCC rules (operational
//           layer, distinct from electronics.SE circuits and from
//           engineering.SE mechanical). Same registry pattern: ~30 LOC
//           per source = ~90 LOC. Cron UNCHANGED. Route count UNCHANGED.
//           Wrangler config UNCHANGED. Dashboard gets 3 new emoji labels
//           (🎵 music / 📷 photo / 📻 ham). Twenty-second consecutive
//           registry-pattern deploy. After this deploy EVERY weekday
//           except Sun (which already has 4) has at least 2 lanes, and
//           the only remaining single-axis hours are the structural ones
//           (cooking 01, arxiv 03, security 07, github 08, dsp 10,
//           serverfault 16) — these are intentional always-on lanes
//           that anchor the rotation rather than candidates for
//           override. v2.57+ should pivot to STACKING TRIPLE-axis (third
//           override per weekday) rather than chasing remaining
//           single-axis hours.
// 2.57.0 — TRIPLE-PACK third-axis stacking — buddhism + tex +
//           expatriates. Validates that THIRD-axis stacking works
//           structurally (nested ternary depth +1) using the same
//           registry pattern. Three different weekdays each gain a
//           third lane:
//           - Sun 19 → buddhism (replaces biology) [contemplative
//             practice / dharma / meditation / monastic ethics — pairs
//             with hermeneutics' scriptural axis on Sun. FIFTH Sun lane.]
//           - Tue 17 → tex (replaces codereview) [LaTeX typesetting /
//             math macros / TikZ / BibTeX — pairs with matheducators+
//             japanese language/precision axis on Tue. THIRD Tue lane.]
//           - Wed 11 → expatriates (replaces stackoverflow) [visa /
//             residency / cross-border tax / work-abroad — pairs with
//             bicycles' practical-life-skills axis on Wed. THIRD Wed
//             lane.]
//           After this deploy, weekday lane counts are: Mon=4, Tue=3,
//           Wed=3, Thu=2, Fri=2, Sat=6, Sun=5 — total 25 day-specific
//           overrides across 23 hourly ticks. Source count 45 → 48.
//           Day-specific overrides 22 → 25. Three of seven weekdays
//           now have ≥3 lanes (Mon, Tue, Wed). Weekday density now
//           skews toward "stack-rich front half / sparse back half"
//           (Mon-Wed avg 3.33, Thu-Fri avg 2, Sat-Sun avg 5.5 due to
//           weekend pop). v2.58 candidates pivot to filling Thu/Fri
//           third-axis or claiming a Sat seventh-axis. Same registry
//           pattern: ~30 LOC per source = ~90 LOC. Cron UNCHANGED.
//           Route count UNCHANGED. Wrangler config UNCHANGED. Dashboard
//           gets 3 new emoji labels (☸️ buddhism / 📐 tex / ✈️
//           expatriates). Twenty-third consecutive registry-pattern
//           deploy. Each new clause carefully chosen to be axis-
//           DISTINCT from its primary: buddhism.SE is contemplative-
//           ethical-doctrinal (NOT religious-news), tex.SE is
//           document-typesetting (NOT pure math content — distinct
//           from math.SE which is theorems and matheducators.SE which
//           is pedagogy), expatriates.SE is residency/visa/tax
//           (NOT travel-tourism — distinct from any other source).
//           SECOND TRIPLE-PACK in same UTC morning (after v2.56)
//           validates 3-source deploys at <15 minute wall-clock cadence.
// 2.58.0 — DUAL-PACK Thu/Fri third-axis at hour 12 — puzzling + bricks.
//           Brings Thu and Fri from 2 → 3 lanes uniformly. Hour 12 was the
//           last hour with only one day-override (Sat=chess); now stacks
//           three day-overrides (Sat=chess, Thu=puzzling, Fri=bricks) +
//           default ux. First time hour-12 reaches depth-3 ternary;
//           validates the same nested-override pattern at a different
//           hour from v2.57 (which stacked at hours 11/17/19).
//           - Thu 12 → puzzling (replaces ux) [recreational logic
//             puzzles / riddles / cipher / cryptic crosswords / sudoku
//             / weighing puzzles / lateral thinking — a brain-tease lane
//             distinct from chess.SE (Sat) which is competitive game,
//             and from rpg.SE which is narrative gaming. Pairs with
//             linguistics+engineering on Thu.]
//           - Fri 12 → bricks (replaces ux) [LEGO building / parts /
//             techniques / Technic / Mindstorms / collecting — a light
//             hobbyist lane that pairs with workplace+politics on Fri,
//             rounding out the day with a creative/fun axis.]
//           After this deploy, weekday lane counts are: Mon=4, Tue=3,
//           Wed=3, Thu=3, Fri=3, Sat=6, Sun=5. ALL SEVEN weekdays now
//           have ≥3 lanes. Total 27 day-specific overrides across 23
//           hourly ticks. Source count 48 → 50 (round-number milestone).
//           Same registry pattern: ~110 LOC across 4 files. Cron
//           UNCHANGED. Route count UNCHANGED. Wrangler config UNCHANGED.
//           Dashboard gets 2 new emoji labels (🧩 puzzling / 🧱 bricks).
//           Twenty-fourth consecutive registry-pattern deploy. Each new
//           clause carefully chosen to be axis-DISTINCT from its primary:
//           puzzling.SE is recreational-logic-puzzle (NOT real-world
//           problem solving and NOT competitive games), bricks.SE is
//           LEGO-building (NOT generic toy news, distinct from any
//           prior source). Validates that THIRD TRIPLE/DUAL-pack in
//           same UTC morning is sustainable cadence.
// 2.59.0 — DUAL-PACK Mon FIFTH lane + Sat SEVENTH lane — ai + astronomy.
//           Mon goes 4 → 5 lanes; Sat goes 6 → 7 lanes (densest day in
//           the rotation). Picks two NON-anchor hours (13, 14) so the
//           anchor lanes (cooking 01, arxiv 03, security 07, github 08,
//           dsp 10, serverfault 16) remain untouched per the structural
//           constraint.
//           - Mon 13 → ai (replaces hn) [AI theory / ML algorithms /
//             neural nets / RL / NLP / interpretability / alignment.
//             FIFTH Mon lane. Pairs with the existing Mon "autodidact /
//             technical-deepwork" stack: quant 04, music 11, photo 18,
//             ham 22 — adding ai 13 makes Mon the most-technical
//             weekday by lane density. Distinct from arxiv (general
//             research), github (repo-level code), stackoverflow
//             (programming Q&A) — ai.SE is conceptual ML/AI theory.]
//           - Sat 14 → astronomy (replaces gis) [stargazing /
//             observational astronomy / stellar physics / cosmology /
//             solar system / spacecraft missions. SEVENTH Sat lane.
//             Pairs with Sat's "weekend curiosity" stack: history 02,
//             chess 12, boardgames 13, movies 18, gardening 19, rpg 21
//             — adds a science-of-the-night-sky lane. Distinct from
//             arxiv (papers), philosophy.SE (epistemology), and any
//             other source.]
//           After this deploy, weekday lane counts are: Mon=5, Tue=3,
//           Wed=3, Thu=3, Fri=3, Sat=7, Sun=5. Total 29 day-specific
//           overrides across 23 hourly ticks. Source count 50 → 52.
//           Same registry pattern: ~115 LOC across 4 files. Cron
//           UNCHANGED. Route count UNCHANGED. Wrangler config UNCHANGED.
//           Dashboard gets 2 new emoji labels (🤖 ai / 🔭 astronomy).
//           Twenty-fifth consecutive registry-pattern deploy. Anchor
//           hours (01, 03, 07, 08, 10, 16) confirmed untouched. Hour 13
//           reaches depth-3 ternary; hour 14 reaches depth-2 ternary.
//           THIRD multi-source pack in same UTC morning (after v2.56
//           triple, v2.57 triple, v2.58 dual). Total session: 7 new
//           sources across 4 deploys at <60 minute wall-clock cadence.
// 2.60.0 — TRIPLE-PACK Tue/Thu/Fri push to 4 lanes — judaism + pets +
//           outdoors. Brings Tue, Thu, Fri each from 3 → 4 lanes. After
//           this deploy, weekday minimum lane count is 4 (was 3); the
//           lane distribution is Mon=5, Tue=4, Wed=3, Thu=4, Fri=4,
//           Sat=7, Sun=5. Wed remains at 3 deliberately — adding a Wed
//           override at hour 02 would push that hour to depth-4 ternary,
//           a v2.61 candidate paired with a hour-rule lookup-table
//           refactor. All three new entries pick NON-anchor hours per
//           the structural constraint (anchor hours 01, 03, 07, 08, 10,
//           16 stay untouched).
//           - Tue 02 → judaism (replaces academia) [Mi Yodeya — rabbinic
//             law / halakha / Tanakh / Talmud / liturgy / kashrut /
//             holidays. FOURTH Tue lane. Pairs with Tue's
//             "structured-knowledge" stack: matheducators 09, japanese
//             15, tex 17 — adds rigorous textual/legal corpus.
//             Distinct from hermeneutics (general textual interpretation,
//             Sun lane) and philosophy (epistemology) — judaism.SE is
//             specifically rabbinic-Jewish-law sourced.]
//           - Thu 06 → pets (replaces askubuntu) [domestic-animal care —
//             dogs/cats/rodents/birds/fish/reptiles, behavior, training,
//             nutrition, health. FOURTH Thu lane. Pairs with Thu's
//             "applied-craft" stack: puzzling 12, linguistics 15,
//             engineering 22 — adds a softer life-skill axis.
//             Distinct from biology.SE (Mon-Fri lane at 19, but
//             scientific not pet-care) and gardening (Sat 19).]
//           - Fri 14 → outdoors (replaces gis) [hiking / backpacking /
//             camping / climbing / kayaking / wilderness skills /
//             navigation / survival. FOURTH Fri lane. Pairs with Fri's
//             stack: workplace 06, bricks 12, politics 23 — outdoors
//             is the recreation/skills counterweight to the working-
//             week framing of those three. Distinct from bicycles
//             (Wed 14, urban cycling) and academia.]
//           After this deploy, source count 52 → 55. Day-specific
//           overrides 29 → 32. Same registry pattern: ~145 LOC across 4
//           files. Cron UNCHANGED. Route count UNCHANGED. Wrangler
//           config UNCHANGED. Dashboard gets 3 new emoji labels (✡️
//           judaism / 🐾 pets / 🏕️ outdoors). Twenty-sixth consecutive
//           registry-pattern deploy. Hour 02 reaches depth-3 ternary;
//           hour 06 reaches depth-3 ternary; hour 14 reaches depth-4
//           ternary (first instance, flagged for v2.61 lookup-table
//           refactor). FOURTH multi-source pack in same UTC morning
//           (after v2.56 triple, v2.57 triple, v2.58 dual, v2.59 dual).
//           Total session-cluster: 10 new sources across 5 deploys.
// 2.61.0 — LOOKUP-TABLE REFACTOR + Wed FOURTH lane (christianity). Two
//           changes ship together: (a) the 23-arm nested-ternary at
//           auto_coverage.ts:247-271 is replaced by a (hour, day) →
//           ExternalSource lookup table — `HOUR_DEFAULTS` for the always-on
//           daily axis and `HOUR_DAY_OVERRIDES` for weekly day-specific
//           rotations. The function body is now a single null-coalescing
//           chain. Adding a new override = one line in HOUR_DAY_OVERRIDES;
//           depth-4 readability debt eliminated. Behavior is byte-identical
//           to v2.60 for all 23 hours × 7 days = 161 (hour, day) pairs
//           verified by hand-walk of every override before deploy. (b) Wed
//           02 → christianity.SE replaces academia weekly — FOURTH Wed lane.
//           Christian theology / denominational doctrine / sacraments /
//           liturgy / church history. Distinct from judaism's Tue-02 rabbinic
//           axis (different revelation tradition) and hermeneutics' Sun-20
//           textual-criticism axis (this is doctrinal not exegetical).
//           After v2.61: lane distribution Mon=5, Tue=4, Wed=4, Thu=4,
//           Fri=4, Sat=7, Sun=5 — ALL SEVEN WEEKDAYS at ≥4 lanes for the
//           first time. Source count 55 → 56. Day-specific overrides 32 → 33.
//           Anchor hours (1, 3, 7, 8, 10, 16) live in HOUR_DEFAULTS only —
//           structurally barred from override by table shape (no entries in
//           HOUR_DAY_OVERRIDES for those hours). Files touched: ~85 LOC
//           across 4 files (external_seeder.ts +~50, auto_coverage.ts ~70
//           lines reshaped, dashboard/page.ts +3, identity.ts +25 + bump).
//           Cron UNCHANGED. Route count UNCHANGED. Wrangler config
//           UNCHANGED. Dashboard gets ✝️ christianity emoji label.
//           Twenty-seventh consecutive registry-pattern deploy.
// 2.62.0 — Mon SIXTH lane (datascience.SE). Mon 02 →
//           datascience.stackexchange.com replaces academia weekly. Applied
//           ML / data-science practice / feature engineering / model
//           deployment / data pipelines — practitioner-framed, distinct
//           from ai.SE's theory axis (Mon 13) and crossvalidated.SE's
//           statistics axis (default 15). With Mon at SIX lanes,
//           Mon becomes the first weekday to clear the 6-lane bar (Sat is
//           still champion at 7). Source count 56 → 57. Day-specific
//           overrides 33 → 34. Lookup-table addition: a single line under
//           hour-2 bucket (`1: 'datascience'`). No depth growth — the
//           v2.61 refactor pays off on its first add. Lane distribution
//           after v2.62: Mon=6, Tue=4, Wed=4, Thu=4, Fri=4, Sat=7, Sun=5
//           — TWO weekdays at ≥6 lanes. Files touched: ~70 LOC across 4
//           files. Cron UNCHANGED. Route count UNCHANGED. Wrangler config
//           UNCHANGED. Dashboard gets 📊 datascience emoji label.
//           Twenty-eighth consecutive registry-pattern deploy. ETA-on-add
//           validated: <5 min wall-clock.
// 2.63.0 — Sun SIXTH lane (writers.SE). Sun 21 → writing.stackexchange.com
//           replaces superuser weekly. Creative-writing craft / fiction
//           technique / story structure / character development /
//           prose style / worldbuilding / publishing & editing —
//           author-craft framed, distinct from linguistics SE (Thu 15,
//           phonology/morphology/syntax/semantics) and from any
//           english-language-usage axis. With Sun at SIX lanes, Mon and
//           Sun both clear the 6-lane bar (Sat is still champion at 7).
//           The single-line override at hour-21 bucket gains
//           `0: 'writers'`. Source count 57 → 58. Day-specific overrides
//           34 → 35. Lane distribution after v2.63: Mon=6, Tue=4, Wed=4,
//           Thu=4, Fri=4, Sat=7, Sun=6 — THREE weekdays at ≥6 lanes.
//           Files touched: ~70 LOC across 4 files. Cron UNCHANGED. Route
//           count UNCHANGED. Wrangler config UNCHANGED. Dashboard gets
//           ✍️ writers emoji label. Twenty-ninth consecutive
//           registry-pattern deploy. Site key for writers.SE is "writing"
//           (StackExchange API key, not "writers").
// v2.64.0  Tue FIFTH lane via vegetarianism.SE (~06 UTC). Plant-based
//           diet / vegan cooking / nutritional completeness / meat
//           substitutes / ethical food choices — practitioner-framed,
//           distinct from cooking SE technique focus and from pets SE
//           nutrition. Tue 06 → vegetarianism (replaces askubuntu
//           weekly). Lane density Mon=6, Tue=5, Wed=4, Thu=4, Fri=4,
//           Sat=7, Sun=6 — first weekday to break the 4-lane floor.
//           Visible asymmetry now Wed/Thu/Fri at 4. ~30 LOC across
//           4 files via the v2.61 lookup table. Thirtieth consecutive
//           registry-pattern deploy.
// v2.65.0  Wed FIFTH lane via coffee.SE (~06 UTC). Specialty coffee /
//           brewing / roasting / espresso / grinding / equipment /
//           origin / sensory evaluation — aficionado-framed coffee
//           craft, distinct from cooking SE general-cuisine focus.
//           Wed 06 → coffee (replaces askubuntu weekly). Lane density
//           Mon=6, Tue=5, Wed=5, Thu=4, Fri=4, Sat=7, Sun=6 — three
//           weekdays now at ≥5 lanes. Visible asymmetry now Thu/Fri.
//           Thirty-first consecutive registry-pattern deploy.
// v2.66.0  Thu FIFTH lane via travel.SE (~11 UTC). International
//           travel / visas / airline ops / customs / transit /
//           destination logistics — tourist & traveler frame, distinct
//           from expatriates SE relocation focus and outdoors SE
//           wilderness. Thu 11 → travel (replaces stackoverflow
//           weekly). Lane density Mon=6, Tue=5, Wed=5, Thu=5, Fri=4,
//           Sat=7, Sun=6 — only Friday remains at 4. Thirty-second
//           consecutive registry-pattern deploy.
// v2.67.0  Fri FIFTH lane via fitness.SE (~18 UTC). Exercise
//           programming / resistance training / hypertrophy / strength
//           / cardio / form & technique / recovery / mobility / sports
//           nutrition — practitioner-framed gym & training, distinct
//           from outdoors SE wilderness endurance. Fri 18 → fitness
//           (replaces wikipedia weekly). Lane density Mon=6, Tue=5,
//           Wed=5, Thu=5, Fri=5, Sat=7, Sun=6 — ALL WEEKDAYS now at
//           ≥5 lanes. Milestone plateau reached. Thirty-third
//           consecutive registry-pattern deploy. 62 distinct external
//           sources, 39 weekly day-specific overrides across 23 ticks.
// v2.71.0  WEEKDAY-8 PARTIAL — Tue/Wed/Thu/Fri all step from 7 → 8
//           lanes in a single deploy; partial parity with Mon/Sun=9
//           champions, still down by 1. FOUR new SE lanes added at once:
//           Tue 19 → sports (Sports SE — rules of games / training
//             science / game strategy / athlete performance / sports
//             history / equipment — replaces biology weekly, distinct
//             from fitness Fri-18 exercise programming and biology
//             default wet-lab; sports-craft register).
//           Wed 19 → aviation (Aviation SE — piloting / aircraft
//             systems / flight ops / ATC / navigation / ATPL CPL PPL —
//             replaces biology weekly, distinct from space Thu-04
//             spaceflight engineering and biology default; aviation-
//             craft register).
//           Thu 04 → space (Space Exploration SE — spaceflight
//             engineering / orbital mechanics / launch vehicles /
//             mission ops / spacecraft systems — replaces money weekly,
//             distinct from astronomy Sat-14 observational and aviation
//             Wed-19 atmospheric flight; spaceflight-engineering tier).
//           Fri 13 → woodworking (Woodworking SE — joinery / furniture /
//             hand tools / power tools / wood selection / finishing /
//             sharpening — replaces hn weekly, distinct from crafts
//             Sun-18 textile/fiber/jewelry craft and diy default home
//             repair; woodworking-craft register).
//           Lane density: Mon=9, Tue=8, Wed=8, Thu=8, Fri=8, Sat=7,
//           Sun=9 — visible asymmetry shrinks from 7-vs-9 to 7-vs-9
//           (Sat alone at 7, Mon/Sun at 9, four weekdays at 8). FIVE
//           days at the 8-lane plateau, only Sat remains at 7. Source
//           count 76 → 80. Day-specific overrides 53 → 57. Lookup-
//           table additions touch three hour buckets (04, 13, 19), no
//           nested-ternary depth. Files touched: ~190 LOC across 4
//           files. Cron UNCHANGED. Route count UNCHANGED. Wrangler
//           config UNCHANGED. Dashboard gets ⚽ sports, ✈️ aviation,
//           🚀 space, 🪚 woodworking emoji labels. Thirty-seventh
//           registry-pattern deploy (fourth multi-axis batch — single
//           batch four-axis variant, repeating v2.69/v2.70 mid-density
//           tier).
// v2.70.0  WEEKDAY-7 PARITY — Tue/Wed/Thu/Fri all step from 6 → 7
//           lanes in a single deploy; full Sat parity for the four
//           weekday peers. FOUR new SE lanes added at once:
//           Tue 13 → ell (English Language Learners — articles /
//             tenses / phrasal verbs / learner-frame English usage —
//             replaces hn weekly, distinct from linguistics general
//             theory and from japanese/italian/russian native-language
//             axes; learner-craft is its own register).
//           Wed 04 → economics (economic theory — micro / macro /
//             game theory / public finance / monetary policy / trade /
//             econometrics — replaces money weekly, distinct from quant
//             Mon-04 quantitative-finance modeling and from money
//             default personal-finance frame; theory-craft).
//           Thu 13 → bioinformatics (computational biology / genomics /
//             sequence alignment / NGS pipelines / single-cell /
//             phylogenetics — replaces hn weekly, distinct from biology
//             default wet-lab biology and datascience Mon-02 applied
//             ML; bio-data craft).
//           Fri 11 → cstheory (research-level theoretical CS /
//             complexity theory / circuit lower bounds / approximation
//             hardness / quantum / type theory — replaces stackoverflow
//             weekly, distinct from cs.SE Thu-17 undergraduate-tier
//             algorithms; research-craft tier).
//           Lane density: Mon=9, Tue=7, Wed=7, Thu=7, Fri=7, Sat=7,
//           Sun=9 — visible asymmetry shrinks from a 6-vs-9 spread to
//           a 7-vs-9 spread. FIVE days at the 7-lane plateau, only
//           Mon and Sun remain champions at 9. Source count 72 → 76.
//           Day-specific overrides 49 → 53. Lookup-table additions
//           touch four hour buckets (04, 11, 13, 13), no nested-ternary
//           depth. Files touched: ~190 LOC across 4 files. Cron
//           UNCHANGED. Route count UNCHANGED. Wrangler config
//           UNCHANGED. Dashboard gets 🇬🇧 ell, 📈 economics,
//           🧬 bioinformatics, 🔬 cstheory emoji labels.
//           Thirty-sixth registry-pattern deploy (third multi-axis
//           batch — single batch four-axis variant, repeating the
//           v2.69 mid-density tier).
// v2.69.0  WEEKDAY MID-PEAKS — Tue/Wed/Thu/Fri all step from 5 → 6
//           lanes in a single deploy. FOUR new SE lanes added at once:
//           Tue 04 → russian (Russian grammar / cases / aspect /
//             cyrillic / dialects / etymology — replaces money weekly,
//             distinct from japanese SE Asian-lang and italian SE
//             Romance-lang axes).
//           Wed 13 → dba (RDBMS administration / SQL tuning / index
//             strategy / replication / locking / transactions /
//             internals — replaces hn weekly, distinct from
//             stackoverflow general programming and softwareengineering
//             architecture-discussion focus).
//           Thu 17 → cs (theoretical CS / algorithms & complexity /
//             automata / computability / formal languages / discrete
//             math foundations — replaces codereview weekly, distinct
//             from softwareengineering Wed-17 architecture and
//             codereview style focus).
//           Fri 04 → cogsci (cognition / perception / decision-making /
//             attention / memory / consciousness — mind-science framed,
//             replaces money weekly, distinct from skeptics Mon-20
//             debunking and philosophy default theory).
//           Lane density: Mon=9, Tue=6, Wed=6, Thu=6, Fri=6, Sat=7,
//           Sun=9 — visible asymmetry shrinks from a 5-vs-9 spread
//           to a 6-vs-9 spread. EVERY day now ≥6 lanes. Source count
//           68 → 72. Day-specific overrides 45 → 49. Lookup-table
//           additions touch three hour buckets (04, 13, 17), no
//           nested-ternary depth. Files touched: ~190 LOC across 4
//           files. Cron UNCHANGED. Route count UNCHANGED. Wrangler
//           config UNCHANGED. Dashboard gets 🇷🇺 russian, 🗄️ dba,
//           🧮 cs, 🧠 cogsci emoji labels. Thirty-fifth registry-pattern
//           deploy (second multi-axis batch — single batch four-axis
//           variant, mid-density tier between v2.67 single-axis and
//           v2.68 six-axis ceiling test).
// v2.68.0  MILESTONE — Mon=7 + Sun=7 reach Saturday parity in a
//           single deploy. SIX new SE lanes added at once:
//           Mon 19 → ethereum (smart contracts / solidity / EVM / gas /
//             DeFi / wallets / L2 / rollups — replaces biology weekly,
//             distinct from quant Mon-04 finance focus).
//           Mon 20 → skeptics (claim evaluation / scientific scrutiny /
//             rationalist debunking / evidence standards — replaces
//             philosophy weekly, distinct from philosophy theory).
//           Mon 21 → emacs (elisp / org-mode / packages / init config /
//             modal craft — replaces superuser weekly, distinct from
//             superuser general consumer support).
//           Sun 06 → mythology (myth canon / folklore / pantheons /
//             comparative mythography — replaces askubuntu weekly,
//             distinct from hermeneutics biblical scholarship).
//           Sun 18 → crafts (handmade craft / fiber / textile / paper /
//             leather / metalwork / jewelry / woodcraft — replaces
//             wikipedia weekly).
//           Sun 22 → italian (Italian grammar / vocabulary / idiom /
//             dialects — replaces electronics weekly, distinct from
//             japanese SE Asian-language axis).
//           Lane density: Mon=7, Tue=5, Wed=5, Thu=5, Fri=5, Sat=7,
//           Sun=7 — THREE days at the 7-lane plateau. Visible
//           asymmetry now strictly Tue/Wed/Thu/Fri at 5. Source count
//           62 → 68. Day-specific overrides 39 → 45. Lookup-table
//           additions touch six hour buckets (06, 18, 19, 20, 21, 22),
//           no nested-ternary depth. Files touched: ~270 LOC across
//           4 files. Cron UNCHANGED. Route count UNCHANGED. Wrangler
//           config UNCHANGED. Dashboard gets ⟠ ethereum, 🤔 skeptics,
//           🅴 emacs, 🐉 mythology, 🧶 crafts, 🇮🇹 italian emoji
//           labels. Thirty-fourth registry-pattern deploy (single
//           batch six-axis variant — first multi-axis deploy since
//           v2.32 refactor).
//
// v2.72 — Sat parity push, two-axis batch (TWENTY-FIFTH consecutive
//           registry-pattern deploy, fifth multi-axis variant since
//           v2.32 refactor). Sat was the SOLE trailing day after v2.71
//           — Mon=Sun=9 champions, Tue/Wed/Thu/Fri=8 plateau, Sat=7
//           lone. Two new Sat lanes in one deploy bring Sat from
//           7→9 — full champion parity:
//             Sat 04 → earthscience (Earth Science SE — geology /
//               meteorology / oceanography / climate / seismology /
//               volcanology / hydrology / atmospheric science /
//               tectonics; replaces money default for Sat, distinct
//               from astronomy Sat-14 observational and biology
//               default wet-lab; earth-system-science register).
//             Sat 22 → worldbuilding (Worldbuilding SE — fictional
//               world creation / setting design / speculative biology /
//               magic systems / fictional tech / culture building;
//               replaces electronics default for Sat, distinct from
//               writers Sun-21 prose-craft and scifi Sun-05 canon
//               analysis; worldbuilding-craft register).
//           Lane density: Mon=9, Tue=8, Wed=8, Thu=8, Fri=8,
//           **Sat=9**, Sun=9 — THREE days at the 9-lane champion
//           tier (Mon/Sat/Sun), four days at 8 (Tue/Wed/Thu/Fri).
//           Visible asymmetry collapses from "Sat=7 lone trailing"
//           to "weekday-vs-weekend 8-vs-9". Source count 80 → 82.
//           Day-specific overrides 57 → 59. Lookup-table additions
//           touch two hour buckets (04, 22), no nested-ternary
//           depth. Files touched: ~80 LOC across 4 files. Cron
//           UNCHANGED. Route count UNCHANGED. Wrangler config
//           UNCHANGED. Dashboard gets 🌍 earthscience, 🗺️
//           worldbuilding emoji labels. Twenty-fifth registry-pattern
//           deploy (fifth multi-axis batch — single batch two-axis,
//           same density tier as v2.69/v2.70/v2.71).
//
// v2.73 — Tue weekday parity push, single new lane (TWENTY-SIXTH
//           consecutive registry-pattern deploy, returning to
//           single-axis variant after the v2.72 two-axis batch).
//           After v2.72, weekday-vs-weekend asymmetry was strictly
//           8-vs-9 with weekend champions Mon/Sat/Sun=9 and
//           weekdays Tue/Wed/Thu/Fri=8. v2.73 starts the weekday
//           parity push by lifting Tue to 9:
//             Tue 22 → poker (Poker SE — game theory / pot odds /
//               equity / GTO / range construction / EV / tournament
//               vs cash; replaces electronics default for Tue,
//               distinct from chess Sat-12 board-game theory,
//               sports SE rules, and matheducators pedagogy;
//               poker-craft register).
//           Lane density: Mon=9, **Tue=9**, Wed=8, Thu=8, Fri=8,
//           Sat=9, Sun=9 — FOUR days at the 9-lane champion tier
//           (Mon/Tue/Sat/Sun). Three days remain at 8 (Wed/Thu/Fri).
//           Visible asymmetry collapses from "weekday-vs-weekend
//           4-vs-3 trailing" to "Wed/Thu/Fri three lone trailing
//           days". Source count 82 → 83. Day-specific overrides
//           59 → 60. Lookup-table addition touches one hour bucket
//           (22), no nested-ternary depth. Files touched: ~30 LOC
//           across 4 files. Cron UNCHANGED. Route count UNCHANGED.
//           Wrangler config UNCHANGED. Dashboard gets ♠️ poker
//           emoji label. Twenty-sixth registry-pattern deploy
//           (single-axis variant — back to <30 LOC/<5 min cadence
//           after the multi-axis batches v2.68–v2.72).
//
// v2.74 — FULL CHAMPION PARITY: Wed/Thu/Fri parity push, three-axis
//           batch (TWENTY-SEVENTH consecutive registry-pattern deploy,
//           sixth multi-axis variant since the v2.32 refactor). After
//           v2.73, four days were at the 9-lane champion tier
//           (Mon/Tue/Sat/Sun) and three weekdays (Wed/Thu/Fri) lone-
//           trailed at 8. v2.74 lifts ALL THREE remaining weekdays
//           to 9 in one deploy — first time the system reaches FULL
//           champion parity across all 7 days simultaneously:
//             Wed 22 → cseducators (CS Educators SE — CS pedagogy /
//               curriculum design / classroom dynamics / introductory
//               programming / data structures teaching / assessment;
//               replaces electronics default for Wed, distinct from
//               matheducators Tue-09 math pedagogy, softwareengineering
//               Wed-17 architecture, cs Thu-17 undergraduate
//               algorithms; cs-pedagogy register).
//             Thu 19 → genealogy (Genealogy & Family History SE —
//               family-history research / archival sources / vital
//               records / paleography / kurrent script / DNA matches /
//               immigration records; replaces biology default for
//               Thu, distinct from history Sat-02 academic
//               historiography and biology default wet-lab;
//               genealogy-craft register).
//             Fri 22 → lifehacks (Lifehacks SE — practical everyday
//               optimizations / household tips / repurposing common
//               items / clever workarounds / minor home fixes /
//               organization; replaces electronics default for Fri,
//               distinct from diy default residential trades,
//               woodworking Fri-13 joinery, outdoors Fri-14
//               wilderness; lifehacks-craft register).
//           Lane density: Mon=9, Tue=9, **Wed=9**, **Thu=9**,
//           **Fri=9**, Sat=9, Sun=9 — SEVEN days at the 9-lane
//           champion tier (FULL champion parity, FIRST TIME). Three
//           lone trailing weekdays Wed/Thu/Fri collapse simultaneously.
//           Source count 83 → 86. Day-specific overrides 60 → 63.
//           Lookup-table additions touch two hour buckets (19, 22),
//           no nested-ternary depth. Files touched: ~115 LOC across
//           4 files. Cron UNCHANGED. Route count UNCHANGED. Wrangler
//           config UNCHANGED. Dashboard gets 🎓 cseducators, 🌳
//           genealogy, 💡 lifehacks emoji labels. Twenty-seventh
//           registry-pattern deploy (sixth multi-axis batch — single
//           batch three-axis variant, restoring full-week parity in
//           one deploy).
// v2.75.0 — TENTH-LANE BREAKTHROUGH (Mon-12 → opensource). First day
//           lifted past the 9-lane champion tier into 10 lanes:
//             Mon 12 → opensource (Open Source SE — open-source
//               licensing / governance / CLA / DCO / copyleft vs
//               permissive / license compatibility / forking
//               etiquette / trademark policy; replaces ux default
//               for Mon, distinct from softwareengineering Wed-17
//               architecture, github default trending, codereview
//               default style; open-source-governance register).
//           Lane density: **Mon=10**, Tue=9, Wed=9, Thu=9, Fri=9,
//           Sat=9, Sun=9 — Mon FIRST DAY past champion tier into the
//           10-lane density tier. Source count 86 → 87. Day-specific
//           overrides 63 → 64. Lookup-table addition touches one
//           hour bucket (12), no nested-ternary depth. Files touched:
//           ~30 LOC across 4 files. Cron UNCHANGED. Route count
//           UNCHANGED. Wrangler config UNCHANGED. Dashboard gets
//           ⚖️ opensource emoji label. Twenty-eighth registry-pattern
//           deploy (single-axis variant; revives the single-axis
//           cadence after a v2.74 multi-axis batch).
// v2.76.0 — SECOND TENTH-LANE PUSH (Tue-12 → martialarts, Fri-09 →
//           freelancing). Two more days lifted into the 10-lane tier:
//             Tue 12 → martialarts (Martial Arts SE — technique /
//               training methodology / lineage / weapons forms / kata
//               / sparring / grappling / striking; replaces ux default
//               for Tue, distinct from sports Tue-19 rules and fitness
//               Fri-18 exercise programming; martial-arts-craft
//               register).
//             Fri 09 → freelancing (Freelancing SE — contract
//               negotiation / pricing / scope / client management /
//               invoicing / tax handling; replaces math default for
//               Fri, distinct from workplace Fri-06 employee dynamics,
//               money default personal finance, quant Mon-04
//               derivatives; freelance-business register).
//           Lane density: Mon=10, **Tue=10, Fri=10**, Wed=9, Thu=9,
//           Sat=9, Sun=9 — THREE days past the champion tier into the
//           10-lane density tier. Source count 87 → 89. Day-specific
//           overrides 64 → 66. Lookup-table additions touch two hour
//           buckets (9, 12), no nested-ternary depth. Files touched:
//           ~50 LOC across 4 files. Cron UNCHANGED. Route count
//           UNCHANGED. Wrangler config UNCHANGED. Dashboard gets 🥋
//           martialarts and 🧾 freelancing emoji labels. Twenty-ninth
//           registry-pattern deploy (seventh multi-axis batch —
//           two-axis variant lifting two days into the new tier in one
//           deploy).
// v2.77.0 — THIRD TENTH-LANE PUSH (Wed-09 → spanish, Sat-11 → homebrew,
//           Sun-12 → sound, Thu-21 → 3dprinting). FOUR more days lifted
//           into the 10-lane tier — ENTIRE WEEK now at 10 lanes:
//             Wed 09 → spanish (Spanish Language SE — grammar /
//               vocabulary / conjugation / idiom / dialectal variation
//               / pronunciation / etymology; replaces math default for
//               Wed, distinct from russian Tue-04, japanese Tue-15,
//               italian Sun-22, ell Tue-13 learner-frame, linguistics
//               Thu-15 theory; Spanish-language-craft register).
//             Sat 11 → homebrew (Homebrewing SE — beer / mead / cider /
//               wine / kombucha / yeast / fermentation / mashing /
//               hopping / water chemistry; replaces stackoverflow
//               default for Sat, distinct from coffee Wed-06 specialty
//               coffee, cooking 01 default, vegetarianism Tue-06 diet;
//               homebrewing-craft register).
//             Sun 12 → sound (Sound Design SE — audio engineering /
//               recording / mixing / mastering / signal processing /
//               microphone technique / room acoustics / field recording
//               / foley; replaces ux default for Sun, distinct from
//               music Mon-11 theory and dsp Mon-10 signal-math;
//               audio-engineering-craft register).
//             Thu 21 → 3dprinting (3D Printing SE — FDM / SLA / resin
//               / filament / nozzle calibration / slicer settings / bed
//               leveling / retraction / extrusion / supports / adhesion
//               / warping; replaces superuser default for Thu, distinct
//               from electronics EE Mon-22, engineering mechanical
//               Thu-22, woodworking Fri-13 traditional joinery;
//               additive-manufacturing-craft register).
//           Lane density: **Mon=Tue=Wed=Thu=Fri=Sat=Sun=10** — ENTIRE
//           WEEK PAST CHAMPION TIER, all seven days at the 10-lane
//           density tier. Source count 89 → 93. Day-specific overrides
//           66 → 70. Lookup-table additions touch four hour buckets
//           (9, 11, 12, 21), no nested-ternary depth. Files touched:
//           ~95 LOC across 4 files. Cron UNCHANGED. Route count
//           UNCHANGED. Wrangler config UNCHANGED. Dashboard gets 🇪🇸
//           spanish, 🍺 homebrew, 🎧 sound, and 🖨️ 3dprinting emoji
//           labels. Thirtieth registry-pattern deploy (eighth multi-
//           axis batch — four-axis variant lifting four days into the
//           new tier in a single deploy, completing 7-day uniform
//           coverage at 10 lanes).
// v2.78.0 — ELEVENTH-LANE PUSH (four-axis batch lifting Mon/Tue/Wed/Sat
//           from 10 → 11 lanes). Adds scientific-computing-craft scicomp at
//           Mon-15, video-game-craft gaming at Tue-21, binary-RE-craft
//           reverseengineering at Wed-12, literary-criticism-craft
//           literature at Sat-09. Wires four new SE fetchers, four new
//           SOURCE_CLAUSES (scientific-computing / video-game /
//           binary-RE / literary-criticism distillation framing,
//           ~130 quoted phrases each), four new HOUR_DAY_OVERRIDES
//           entries, four new dashboard emoji labels. THIRTY-FIRST
//           registry-pattern deploy (NINTH multi-axis batch — second
//           four-axis variant in a row). Cleans up the three stale
//           literal-union force_source/source fields in auto_coverage.ts
//           (action item 3 carried over from v2.74–v2.77 last-states):
//           replaced with `ExternalSource | 'organic' | 'evergreen'`
//           — silences tsc on the prior 25+ missing entries with no
//           runtime change (gating still uses isExternalSource).
//           Lane density after v2.78: Mon=Tue=Wed=Sat=11, Thu=Fri=Sun=10
//           (uniform-density grid broken intentionally — v2.79 will
//           lift the remaining 3 days to 11). 97 distinct external
//           sources (93 + scicomp + gaming + reverseengineering +
//           literature); 92 SE site count.
// v2.79.0 — UNIFORM 11-LANE WEEK (three-axis batch lifting Thu/Fri/Sun
//           from 10 → 11 lanes — closing the asymmetric grid left by
//           v2.78 into uniform 11-density across all 7 days). Adds
//           apple-power-user-craft apple at Thu-09, android-power-user-
//           craft android at Fri-15, interpersonal-skills-craft
//           interpersonal at Sun-15. Wires three new SE fetchers, three
//           new SOURCE_CLAUSES (apple-platform / android-platform /
//           interpersonal-skills distillation framing, ~60–70 quoted
//           phrases each), three new HOUR_DAY_OVERRIDES entries (slotted
//           into existing hour-9 and hour-15 buckets), three new
//           dashboard emoji labels. THIRTY-SECOND registry-pattern deploy
//           (TENTH multi-axis batch). Lane density after v2.79: ALL 7
//           days at 11 lanes (Mon=Tue=Wed=Thu=Fri=Sat=Sun=11) — the
//           uniform 11-density tier that v2.77 v2.78 progress toward.
//           100 distinct external sources (97 + apple + android +
//           interpersonal); 95 SE site count.
// v2.80.0 — TWELFTH-LANE PUSH (four-axis batch opening the 12-density
//           tier on top of the v2.79 uniform-11 grid). Adds wordpress-
//           cms-power-user-craft wordpress at Mon-17, raspberrypi-sbc-
//           hobbyist-craft raspberrypi at Tue-18, graphic-design-craft
//           graphicdesign at Sat-17, cryptography-theory-craft crypto at
//           Sun-04. Wires four new SE fetchers, four new SOURCE_CLAUSES
//           (wordpress / raspberry-pi / graphic-design / cryptography
//           distillation framing, ~55–80 quoted phrases each), four new
//           HOUR_DAY_OVERRIDES entries (slotted into existing hour-4,
//           hour-17 and hour-18 buckets), four new dashboard emoji
//           labels. THIRTY-THIRD registry-pattern deploy (ELEVENTH
//           multi-axis batch — tied with v2.71's four-axis ceiling). Lane
//           density after v2.80: Mon=12, Tue=12, Wed=11, Thu=11, Fri=11,
//           Sat=12, Sun=12 — twelfth-lane tier opens on the four lifted
//           days. 104 distinct external sources (100 + wordpress +
//           raspberrypi + graphicdesign + crypto); 99 SE site count.
// v2.81.0 — UNIFORM 12-LANE WEEK (three-axis batch lifting Wed/Thu/Fri
//           from 11 → 12 lanes — closing the asymmetric 12-tier left by
//           v2.80 into uniform 12-density across all 7 days). Adds
//           arduino-microcontroller-hobbyist-craft arduino at Wed-18,
//           drupal-cms-power-user-craft drupal at Thu-18, wolfram-
//           language-craft mathematica at Fri-19. Wires three new SE
//           fetchers, three new SOURCE_CLAUSES (arduino /
//           drupal-cms / wolfram-language distillation framing, ~60–72
//           quoted phrases each), three new HOUR_DAY_OVERRIDES entries
//           (slotted into existing hour-18 and hour-19 buckets), three
//           new dashboard emoji labels. THIRTY-FOURTH registry-pattern
//           deploy (TWELFTH multi-axis batch). Lane density after v2.81:
//           ALL 7 days at 12 lanes (Mon=Tue=Wed=Thu=Fri=Sat=Sun=12) —
//           the uniform 12-density tier; the v2.80→v2.81 asymmetric→
//           uniform progression mirrors v2.78→v2.79 for the 11-tier.
//           107 distinct external sources (104 + arduino + drupal +
//           mathematica); 102 SE site count.
// v2.82.0 — THIRTEENTH-LANE PUSH (4-axis batch: Wed/Thu/Sat/Sun).
//           Wed 21 → vi (vim power-user craft), Thu 14 → robotics
//           (ROS / SLAM / control / kinematics), Sat 15 → magento
//           (Adobe Commerce e-commerce), Sun 17 → softwarerecs
//           (software discovery & alternatives). Opens the 13-tier
//           on lower-conflict free slots; mirrors v2.74/v2.78/v2.80
//           asymmetric pattern (4 days now, 3 days closing later).
//           111 distinct external sources (107 + vi + robotics +
//           magento + softwarerecs); 106 SE site count. THIRTY-FIFTH
//           consecutive registry-pattern deploy.
// v2.83.0 — UNIFORM THIRTEEN-LANE WEEK (3-axis batch: Mon/Tue/Fri).
//           Mon 09 → retrocomputing (vintage 8/16-bit, CP/M, Amiga,
//           Atari/C64), Tue 11 → avp (Audio/Video Production NLE / DAW
//           / color grading / mastering), Fri 17 → sustainability
//           (green tech / circular economy / footprint). Closes the
//           uniform 13-tier on Mon/Tue/Fri — every day now at 13 lanes.
//           Mirrors v2.79/v2.81 asymmetric→uniform closing pattern.
// 2.84.0  FOURTEENTH-LANE TIER OPENING — 4-axis asymmetric batch:
//           tor → Wed-15 (security/anonymity), iot → Sat-06 (protocol/cloud
//           edge), musicfans → Sun-09 (fandom/discovery), pm → Thu-20
//           (project mgmt). Mon/Tue/Wed/Sat/Sun bump 13→14 (only Mon hits
//           later — Wed/Sat/Sun/Thu fire next), Fri+Mon+Tue stay at 13
//           pending v2.85+ closing batch. 118 distinct external sources
//           (114 + tor + iot + musicfans + pm); 113 SE site count.
//           THIRTY-SEVENTH consecutive registry-pattern deploy.
// 2.85.0  UNIFORM 14-LANE CLOSE — 3-axis batch on Mon/Tue/Fri:
//           or → Mon-14 (operations-research-optimization), ebooks → Tue-20
//           (ebook-reading-craft), salesforce → Fri-21 (salesforce-crm-platform).
//           Brings all 7 days to 14 lanes. 121 distinct external sources
//           (118 + or + ebooks + salesforce); 116 SE site count.
//           THIRTY-EIGHTH consecutive registry-pattern deploy.
// 2.86.0  FIFTEENTH-LANE TIER OPENING — 4-axis asymmetric batch:
//           sharepoint → Wed-20 (enterprise-intranet-collaboration), tridion →
//           Thu-23 (enterprise-tridion-wcm), moderators → Sat-20 (community-
//           moderation-craft), codegolf → Sun-23 (code-golf-byte-craft).
//           Wed/Thu/Sat/Sun bump 14→15 (Wed/Thu/Sat/Sun fire next),
//           Mon/Tue/Fri stay at 14 pending v2.87+ closing batch.
//           125 distinct external sources (121 + sharepoint + tridion +
//           moderators + codegolf); 120 SE site count. THIRTY-NINTH
//           consecutive registry-pattern deploy.
// 2.87.0  UNIFORM 15-LANE CLOSE — 3-axis batch on Mon/Tue/Fri:
//           bitcoin → Mon-23 (bitcoin-protocol-craft, 32012 Q), sitecore →
//           Tue-23 (dotnet-cms-craft, 13908 Q), craftcms → Fri-05 (php-cms-
//           craft, 14620 Q). Brings all 7 days to 15 lanes — closes the
//           v2.86 asymmetric tier-open. 128 distinct external sources
//           (125 + bitcoin + sitecore + craftcms); 123 SE site count.
//           FORTIETH consecutive registry-pattern deploy.
// 2.88.0  SIXTEENTH-LANE TIER OPENING — 4-axis asymmetric batch:
//           hsm → Wed-00 (history-of-science-and-math-craft, 5247 Q —
//           NOTE: SE param "hsm" = History of Science and Mathematics,
//           NOT Hardware Security Modules; clause initially mis-targeted
//           and corrected in v2.88.1), elementaryos → Thu-05
//           (desktop-linux-distro-craft, 8222 Q), monero → Sat-23
//           (privacy-coin-craft, 4445 Q), materials → Sun-00
//           (materials-science-craft, 5125 Q). Wed/Thu/Sat/Sun bump
//           15→16; Mon/Tue/Fri stay at 15 pending v2.89 closing batch.
//           132 distinct external sources (128 + hsm + elementaryos +
//           monero + materials); 127 SE site count. FORTY-FIRST
//           consecutive registry-pattern deploy.
// 2.88.1  HSM CLAUSE CORRECTION — rewrote SOURCE_CLAUSES.hsm from
//           hardware-security-modules to history-of-science-and-math
//           (newton/euclid/gauss/galileo/kepler/noether). Lane was
//           functional in v2.88 via Together extractor; clause hint was
//           mis-targeted. No structural change. FORTY-SECOND consecutive
//           registry-pattern deploy.
// 2.89.0  UNIFORM 16-LANE CLOSE — 3-axis batch on Mon/Tue/Fri:
//           devops → Mon-00 (devops-platform-engineering-craft, 5619 Q),
//           quantumcomputing → Tue-00 (quantum-computing-craft, 13225 Q),
//           gamedev → Fri-20 (game-engine-programming-craft, 57768 Q —
//           Fri-00 was occupied by politics wraparound, so Fri lane
//           landed at hour 20). Brings all 7 days to 16 lanes — closes
//           the v2.88 sixteenth-lane tier. SE param→name verified for
//           all 3 via /2.3/sites BEFORE drafting clauses (the v2.88.1
//           lesson stuck). 135 distinct external sources (132 + devops
//           + quantumcomputing + gamedev); 130 SE site count. FORTY-
//           THIRD consecutive registry-pattern deploy. SEVENTH tier-
//           pair following the asymmetric-open + uniform-close pattern.
// v2.90.0 — Slack inbox poller (`src/inbox/slack_poller.ts`). Closes the
//           reverse direction on the Slack DM that already pushes the
//           daily briefing/recap: when Naoufal DMs the Composio bot, we
//           pull via SLACK_FETCH_CONVERSATION_HISTORY, run through the
//           council, and reply in-thread with SLACK_SEND_MESSAGE.
//           Trigger: Nemoclaw cron pings POST /inbox/slack/poll every
//           60s (the 5-trigger cron limit on this account is maxed).
//           State in D1 (`slack_inbox_state.last_seen_ts` per channel).
//           Why: this session Naoufal said "i wanna talk to you from now on"
//           — the council brain is always-on but the CLI Anouf-builder is
//           not. Slack DM closes the gap from his phone without violating
//           CLAUDE.md rule #1 (no Telegram-as-control).
// v2.91.0 — SEVENTEENTH-LANE TIER OPENING (4-axis asymmetric on Wed/Thu/
//           Sat/Sun). 4 new SE sources added: chemistry (47407 Q,
//           general chemistry — Wed-05), networkengineering (17033 Q,
//           BGP/OSPF/MPLS/VLAN — Thu-00), blender (122651 Q, 3D content
//           creation — Sat-00), psychology (8215 Q, Psychology &
//           Neuroscience SE — Sun-14). 139 distinct external sources
//           (135 + 4). Lane density: ASYMMETRIC 17/16 — Wed/Thu/Sat/Sun
//           at 17, Mon/Tue/Fri stay at 16 pending v2.92 closing batch.
//           EIGHTH asymmetric-open + uniform-close tier-pair starts here.
//           134 weekly day-specific overrides (130 + 4). Pre-flight
//           verified all 4 slugs via TWO-call ritual (`/2.3/info` +
//           `/2.3/sites`). Quote-parity clean pre-write.
// v2.92.0 — SEVENTEENTH-LANE TIER CLOSING (3-axis uniform on Mon/Tue/
//           Fri). 3 new SE sources: law (31855 Q, US-centric legal
//           doctrine — Mon-05), medicalsciences (8020 Q, applied
//           clinical practice — Tue-05), langdev (974 Q, Programming
//           Language Design and Implementation — Fri-02). 142 distinct
//           external sources (139 + 3). Lane density: UNIFORM 17/17 —
//           every weekday now carries 17 axes. EIGHTH tier-pair complete.
//           137 weekly day-specific overrides (134 + 3). Pre-flight
//           verified all 3 slugs via TWO-call ritual. Quote-parity clean
//           after one fix on medicalsciences (missing opening quote on
//           "calcium channel blocker") and one trim on law (77 → 64 to
//           land in 60-69 budget).
// v2.93.0 — EIGHTEENTH-LANE TIER OPENING (4-axis asymmetric on Mon/Tue/
//           Sat/Sun). 4 new SE sources: drones (953 Q, drone-pilot-
//           craft — Mon-06), proofassistants (1625 Q, formal-
//           verification-craft — Tue-14), solana (8271 Q, solana-
//           program-craft — Sat-05), french (14325 Q, french-grammar-
//           craft — Sun-02). 146 distinct external sources (142 + 4).
//           Lane density: ASYMMETRIC 18/17 — Mon/Tue/Sat/Sun at 18,
//           Wed/Thu/Fri stay at 17 pending v2.94 closing batch.
//           NINTH asymmetric-open + uniform-close tier-pair starts here.
//           141 weekly day-specific overrides (137 + 4). Pre-flight
//           verified all 4 slugs via TWO-call ritual. Quote-parity
//           clean pre-write (zero defects).
// v2.94.0 — EIGHTEENTH-LANE TIER PARTIAL CLOSE (2-axis on Wed+Thu —
//           Fri stays asymmetric at 17 because no Fri hour <23 is
//           free). 2 new SE sources: german (18578 Q, german-grammar-
//           craft / Kasus / Konjunktiv / Wechselpräpositionen / Umlaut
//           / Eszett — Wed-23, replaces bbc weekly), chinese (12382 Q,
//           mandarin-grammar-craft / pinyin / tones / hanzi / classifier
//           / ba-construction / le aspect / shi-de cleft — Thu-02,
//           replaces academia weekly). 148 distinct external sources
//           (146 + 2). Lane density: ASYMMETRIC 18/17 — Mon/Tue/Wed/
//           Thu/Sat/Sun at 18, Fri stays at 17 (Fri-only-17). NINTH
//           tier-pair partial-close (Fri unfilled until next axis push
//           opens nineteenth tier). 143 weekly day-specific overrides
//           (141 + 2). Pre-flight verified both slugs via TWO-call
//           ritual (/2.3/info Q-count + /2.3/sites slug→name). Quote-
//           parity clean pre-write (german=136, chinese=138; both
//           even). Phrase budget: german 65 / chinese 66 — both in
//           60-69 range.
// v2.95.0 — DEPTH-OVER-WIDTH PIVOT — 7-LANE SOURCE_CLAUSES DEEPENING.
//           No new external sources, no new hour overrides — STRUCTURAL
//           CEILING reached at v2.94 (ALL 7 weekdays at 17 non-anchor
//           hours). v2.95 grows distill-richness instead of axis count
//           by deepening the 7 oldest / shallowest lanes from <20
//           phrases to 80-94 phrases each: arxiv (3→86, anchor 03),
//           github (4→86, anchor 08), stackoverflow (7→88, daily Mon),
//           serverfault (9→86, anchor 16), superuser (9→89, daily Sat),
//           askubuntu (10→87, daily Sun), math (17→94, daily Tue).
//           +551 distinct phrases across 7 lanes. Quote-parity EVEN,
//           single-quote parity EVEN, phrase budget IN (60-99) for all
//           7. No EXTERNAL_SOURCES change, no SOURCE_FETCHERS change,
//           no HOUR_DAY_OVERRIDES change, no dashboard emoji change.
//           First DEPTH deploy validates the same registry pattern on
//           a new axis (richer extraction prompts, not more lanes).
//           Cross-session aggregate now spans width AND depth.
// v2.96.0 — DEEPENING ROUND TWO — 7-LANE SOURCE_CLAUSES DEEPENING.
//           Continues the depth pivot from v2.95 by deepening the next
//           bottom-density tier — completes anchor-lane deepening.
//           crossvalidated (14→97, daily Wed), codereview (17→98,
//           daily ring), security (21→99, anchor 07), electronics
//           (22→96, daily ring), dsp (24→99, anchor 10), biology
//           (26→98, daily ring), cooking (29→98, anchor 01). With
//           v2.96 ALL SIX anchor lanes (cooking 01, arxiv 03,
//           security 07, github 08, dsp 10, serverfault 16) are now
//           at 86-99 phrases — every daily-fired anchor has the
//           richer extraction prompt. +511 distinct phrases. Quote-
//           parity EVEN, single-quote parity EVEN, phrase budget IN
//           (60-99) for all 7 (counts: 97, 98, 99, 96, 99, 98, 98).
//           No EXTERNAL_SOURCES change, no SOURCE_FETCHERS change,
//           no HOUR_DAY_OVERRIDES change, no dashboard emoji change.
//           FORTY-NINTH consecutive registry-pattern deploy. SECOND
//           DEPTH deploy. ANCHOR-DEEPENING MILESTONE: every anchor
//           is now deep — daily extraction quality leveled up across
//           all 6 anchor hours (01/03/07/08/10/16).
// v2.97.0 — DEEPENING ROUND THREE — 7-LANE SOURCE_CLAUSES DEEPENING.
//           Anchor lanes complete (v2.95 + v2.96); v2.97 lifts the
//           lowest-density weekly-firing tier from 27-29 phrases to
//           86-91 phrases each: gis (27→89), money (27→90), philosophy
//           (27→87), academia (27→86), diy (28→89), scifi (28→90),
//           ux (29→91). +429 distinct phrases. Quote-parity EVEN,
//           single-quote parity EVEN, phrase budget IN (60-99) for
//           all 7 (counts: 91, 89, 90, 87, 86, 89, 90). No
//           EXTERNAL_SOURCES change, no SOURCE_FETCHERS change, no
//           HOUR_DAY_OVERRIDES change, no dashboard emoji change.
//           FIFTIETH consecutive registry-pattern deploy. THIRD DEPTH
//           deploy. Per-deploy daily-quality multiplier drops vs
//           v2.95/v2.96 (these are weekly-firing lanes — anchors are
//           saturated). Cross-session aggregate keeps growing.
// v2.98.0 — DEEPENING ROUND FOUR — 7-LANE SOURCE_CLAUSES DEEPENING.
//           Continues v2.97 path on the next-bottom tier (30-43
//           phrases pre-deploy): history (31→88), gardening (30→85),
//           chess (38→86), movies (42→87), boardgames (42→88),
//           workplace (41→87), genealogy (42→86). +319 distinct
//           phrases. Quote-parity EVEN, single-quote parity EVEN,
//           phrase budget IN (60-99) for all 7 (counts: 85, 86, 86,
//           87, 87, 88, 88). No EXTERNAL_SOURCES change, no
//           SOURCE_FETCHERS change, no HOUR_DAY_OVERRIDES change, no
//           dashboard emoji change. FIFTY-FIRST consecutive
//           registry-pattern deploy. FOURTH DEPTH deploy. New bottom
//           tier post-deploy: parenting (43), hermeneutics (46),
//           cseducators (47), bicycles (48), anime/japanese/lifehacks
//           (52). v2.99 candidate: that 43-52 cluster.
// v2.99.0 — DEEPENING ROUND FIVE — 7-LANE SOURCE_CLAUSES DEEPENING.
//           Continues v2.98 path on the 43-52 bottom tier:
//           parenting (43→87), hermeneutics (46→87), cseducators
//           (47→84), bicycles (48→86), anime (52→92), japanese
//           (52→91), lifehacks (52→87). +274 distinct phrases.
//           Quote-parity EVEN 7/7, single-quote parity EVEN 7/7,
//           phrase budget IN (60-99) 7/7 (counts: 84, 86, 87, 87,
//           87, 91, 92). No EXTERNAL_SOURCES change, no
//           SOURCE_FETCHERS change, no HOUR_DAY_OVERRIDES change,
//           no dashboard emoji change. FIFTY-SECOND consecutive
//           registry-pattern deploy. FIFTH DEPTH deploy. New bottom
//           tier post-deploy: opensource (57), graphicdesign (57),
//           quant (58), homebrew/mathematica (60),
//           freelancing/raspberrypi/moderators/craftcms (61).
//           Per-deploy daily-quality multiplier still 1x (anchors
//           saturated since v2.96). Atomic Python-script pattern
//           (`/tmp/v299_deepen.py`) re-used; pre-write parity +
//           budget + dedupe checks gated the write. Zero defects.
// v3.0.0 — DEEPENING ROUND SIX (2026-05-08). Pure DEPTH, NO new
//          sources/fetchers/cron/routes. Lifted 7 bottom-density
//          lanes to 81 e.g. phrases each: opensource 53→81 (+28),
//          graphicdesign 53→81 (+28), quant 53→81 (+28),
//          homebrew 56→81 (+25), mathematica 56→81 (+25),
//          freelancing 57→81 (+24), raspberrypi 57→81 (+24).
//          Total: +182 distinct e.g. phrases across 7 lanes.
//          Numbered milestone: SIXTH consecutive depth deploy,
//          FIFTY-THIRD registry-pattern deploy. Atomic Python
//          script `/tmp/v300_deepen.py` — preserves intros
//          verbatim, appends only to (e.g. ...) parenthetical,
//          dedupes against existing phrases, gates write on
//          parity + budget [60,99] + round-trip wrap. Zero
//          quote-parity defects, zero deploy retries.
export const VERSION = '3.0.0'

// User-visible display name — no underscore, no dash.
// (Worker name is "nao-00" because Cloudflare requires it; project handle "nao_00"
// stays inside system prompts where it's part of the AI's formal identity.)
export const DISPLAY_NAME = 'nao00'

export const TAGLINE = 'This and That.'

// Canonical public URL. Used for og:url, canonical, sitemap, share links, JSON-LD.
export const SITE_URL = 'https://nao00.nchobah.com'
