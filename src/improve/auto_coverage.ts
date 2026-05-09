// Auto-coverage cron — picks the dominant topic from the last 24h of organic
// council inputs, then fans out 5 generic factual questions about it via the
// existing runCoverage flow. Compounds the cache passively, with zero operator
// effort. Result lands at coverage:auto:latest + coverage:cron-history:<ts>.
//
// Topic extraction uses Haiku 4.5. If organic traffic doesn't cluster, fall
// back to an evergreen rotation so the cache still grows daily. Tracks which
// evergreens have been seeded in KV (`coverage:evergreen:seeded:<topic>`), so
// the rotation cycles through the full pool before repeating.

import { runCoverage } from './coverage'
import { recordUsage, anthropicUsage } from '../metrics/api-use'
import { pickExternalTopics, markExternalSeeded, EXTERNAL_SOURCES, type ExternalSource } from './external_seeder'

// O(1) membership test for force_source guard. Set is built once at module load.
const EXTERNAL_SOURCE_SET: ReadonlySet<ExternalSource> = new Set(EXTERNAL_SOURCES)
function isExternalSource(s: string | undefined | null): s is ExternalSource {
  return !!s && EXTERNAL_SOURCE_SET.has(s as ExternalSource)
}

// How many topics we try to extract per external tick on the auto path.
// Each topic kicks off its own runCoverage (5 questions). Three topics in
// parallel turns one tick into ~15 cached answers + ~3x API usage — exactly
// what the pillar metric is for. Manual ?source= calls still pick only one,
// to keep the operator surface predictable.
const TOPICS_PER_AUTO_TICK = 3

export interface AutoCoverageRun {
  ts: string
  duration_ms: number
  // First topic — kept for back-compat with dashboard (renders d.topic_extracted).
  topic_extracted: string | null
  // All topics seeded this run (1 for manual / forced runs, up to TOPICS_PER_AUTO_TICK for auto).
  topics_extracted?: string[]
  inputs_sampled: number
  ok: boolean
  reason?: string
  mode?: 'organic' | 'external' | 'evergreen' | 'skip'
  source?: ExternalSource | 'organic' | 'evergreen'
  external?: { source: ExternalSource; fetched: number; candidates: string[] }
  // Which LLM produced the topics — 'haiku' (primary) or 'together:<model>'
  // (fallback when Anthropic credits empty). Absent when Wikipedia path is used.
  extractor?: string
  // First topic's coverage run — back-compat field for dashboard.
  coverage?: any
  // Per-topic coverage runs. Single entry for manual runs, up to N for auto.
  coverage_runs?: any[]
  // Aggregate counters across all topics — convenient for the dashboard pill.
  totals?: { count_executed: number; count_cached_new: number; count_cached_hit: number }
}

// Evergreen topics: subject-matter the council should know cold. Picked to be
// concrete (not meta), broad (lots of generic question variants), and the kind
// of thing a personal AI is asked about. Rotation guarantees daily growth even
// when organic traffic is too quiet to cluster.
export const EVERGREEN_TOPICS: string[] = [
  'photosynthesis', 'mediterranean diet', 'rust language', 'world war 2',
  'mars exploration', 'cryptocurrency basics', 'yoga poses', 'mindfulness meditation',
  'sourdough baking', 'machine learning', 'climate change', 'human dna',
  'roman empire', 'jazz history', 'quantum mechanics', 'tea ceremony',
  'ancient egypt', 'ocean ecosystems', 'bee behavior', 'volcanic eruptions',
  'painting techniques', 'tibetan buddhism', 'french wine regions', 'space telescopes',
  'forest ecosystems', 'human heart', 'silk road trade', 'samurai history',
  'permaculture gardening', 'ancient greek philosophy', 'origami', 'sleep science',
  'antarctica', 'african wildlife', 'classical music eras', 'dna replication',
  'world rivers', 'great barrier reef', 'arctic ice', 'edible mushrooms'
]

async function pickEvergreenTopic(env: any): Promise<string> {
  // Pick the topic with the OLDEST last-seeded timestamp (or never seeded).
  // KV.list is bounded — only 40 keys so a single call covers all.
  const seenAt = new Map<string, number>()
  try {
    const list = await env.KV.list({ prefix: 'coverage:evergreen:seeded:' })
    for (const k of list.keys ?? []) {
      const topic = k.name.replace('coverage:evergreen:seeded:', '')
      const v = await env.KV.get(k.name)
      const ts = v ? Date.parse(v) : 0
      if (Number.isFinite(ts)) seenAt.set(topic, ts)
    }
  } catch (_err) {
    // KV miss — fall through to deterministic seed of zeros
  }
  let best = EVERGREEN_TOPICS[0]
  let bestTs = Number.POSITIVE_INFINITY
  for (const t of EVERGREEN_TOPICS) {
    const ts = seenAt.get(t) ?? 0
    if (ts < bestTs) { bestTs = ts; best = t }
  }
  return best
}

async function markEvergreenSeeded(env: any, topic: string, ts: string): Promise<void> {
  try {
    await env.KV.put(`coverage:evergreen:seeded:${topic}`, ts)
  } catch (_err) { /* non-fatal */ }
}

async function pickDominantTopic(env: any): Promise<{ topic: string | null; sampled: number; reason?: string }> {
  let inputs: string[] = []
  try {
    const rows = await env.DB.prepare(
      `SELECT input FROM conversations
       WHERE created_at > datetime('now', '-24 hours')
       ORDER BY created_at DESC
       LIMIT 80`
    ).all<{ input: string }>()
    inputs = (rows.results ?? [])
      .map((r) => String(r.input || '').trim().slice(0, 200))
      .filter((s) => s.length > 0 && s.length < 200)
  } catch (err: any) {
    return { topic: null, sampled: 0, reason: `db_error: ${String(err?.message ?? err).slice(0, 80)}` }
  }

  if (inputs.length < 3) {
    return { topic: null, sampled: inputs.length, reason: 'not_enough_inputs' }
  }
  if (!env.ANTHROPIC_API_KEY) {
    return { topic: null, sampled: inputs.length, reason: 'no_anthropic_key' }
  }

  // Haiku, not Nemotron — for a tight one-phrase extraction the reasoning model's
  // chain-of-thought tends to leak into the content field with a small token
  // budget. Haiku follows the format instruction reliably and is already on the
  // hot path for briefing/recap.
  const sample = inputs.slice(0, 60).map((s) => `- ${s}`).join('\n')
  const callStart = Date.now()
  let answer = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 30,
        system:
          'You extract a single subject-matter topic from a list of recent user queries. ' +
          'The topic should be a concrete subject like "mars", "photosynthesis", "world war 2", ' +
          '"yoga", "rust language" — NOT meta-categories like "questions" or "facts" or "queries". ' +
          'Output ONE phrase, 1 to 4 words, lowercase, no quotes, no punctuation, no preamble. ' +
          'If the queries are too varied, too personal, or have no concrete subject in common, ' +
          'output exactly: none',
        messages: [{ role: 'user', content: `Recent queries:\n${sample}\n\nDominant subject-matter topic (1-4 words, lowercase, or "none"):` }]
      })
    })
    const data: any = await res.json()
    if (env.DB) {
      const u = anthropicUsage(data)
      await recordUsage(env.DB, {
        source: 'eval',
        model: 'claude-haiku-4-5-20251001',
        input_tokens: u.input,
        output_tokens: u.output,
        cache_read_tokens: u.cache_read,
        cache_create_tokens: u.cache_create,
        duration_ms: Date.now() - callStart
      })
    }
    answer = String(data?.content?.[0]?.text || '').trim()
  } catch (err: any) {
    return { topic: null, sampled: inputs.length, reason: `extract_error: ${String(err?.message ?? err).slice(0, 80)}` }
  }

  // Clean: lowercase, strip wrapping quotes / trailing punct, collapse whitespace.
  // Take only the first line — extractor models sometimes append a justification.
  let topic = answer.toLowerCase().split(/\r?\n/)[0]
  topic = topic.replace(/^["'`]+|["'`]+$/g, '').replace(/[.!?,:;]+$/, '').replace(/\s+/g, ' ').trim()
  // Drop obvious non-answers.
  if (!topic || topic === 'none' || topic === 'n/a' || topic === 'unknown') {
    return { topic: null, sampled: inputs.length, reason: 'no_dominant_topic' }
  }
  // If the model emitted a sentence anyway, keep only the first 4 words.
  const words = topic.split(/\s+/).filter(Boolean)
  if (words.length > 4) topic = words.slice(0, 4).join(' ')
  if (topic.length < 2 || topic.length > 60) {
    return { topic: null, sampled: inputs.length, reason: 'topic_invalid_length' }
  }

  return { topic, sampled: inputs.length }
}

// Pick which external source to try first based on the UTC hour AND day-of-week
// of the run. v2.43+ — all 23 non-reserved hours (01..23 minus 16/17 reserved
// duals) are filled, so further axis growth comes from per-day rotation: a
// given hour can map to a different source depending on the weekday.
//
// Default daily map (Mon–Sat) — one of each axis per day:
//   01:00 → cooking        (culinary technique / food chemistry / baking / knife skills)
//   02:00 → academia       (academic process / scholarly career)
//   03:00 → arxiv          (science / research)
//   04:00 → money          (personal finance — budgeting, investing, taxes, credit)
//   05:00 → diy            (home improvement / residential trades — plumbing, electrical, drywall, woodworking)
//   06:00 → askubuntu      (Linux-desktop / Ubuntu — apt, ppa, grub, drivers)
//   07:00 → security       (infosec / cryptography / defensive engineering)
//   08:00 → github         (developer-build — what's being SHIPPED)
//   09:00 → math           (pure mathematics — linear algebra, calculus, group theory)
//   10:00 → dsp            (signal processing — FFT, filters, sampling, spectra)
//   11:00 → stackoverflow  (programming-problem — what's being ASKED)
//   12:00 → ux             (UX / interaction-design — how INTERFACES are designed)
//   13:00 → hn             (tech / startup zeitgeist — what's being DISCUSSED)
//   14:00 → gis            (GIS / spatial analysis / cartography — how SPACE is mapped)
//   15:00 → crossvalidated (statistics / ML methodology — how MODELS are REASONED about)
//   16:00 → serverfault    (sysadmin / infra — how operators RUN things)
//   17:00 → codereview     (code-review / idiomatic style — is this code GOOD)
//   18:00 → wikipedia      (cultural lookup)
//   19:00 → biology        (life sciences — how LIVING things work)
//   20:00 → philosophy     (ethics / logic / epistemology — how MINDS reason)
//   21:00 → superuser      (consumer / power-user computing — how END-USERS fix THEIR machine)
//   22:00 → electronics    (EE / circuits / embedded — how the PHYSICAL world works)
//   23:00 → bbc            (world news / current events)
//
// Per-day rotation overrides — give the cache a weekly extra axis instead of
// compounding the same primary 7×/week:
//   02:00 (Sat) → history             (academic historiography — replaces academia weekly)
//   02:00 (Tue) → judaism              (Mi Yodeya rabbinic — replaces academia weekly) [v2.60, FOURTH Tue lane]
//   02:00 (Wed) → christianity         (Christian theology / denominational doctrine — replaces academia weekly) [v2.61, FOURTH Wed lane]
//   02:00 (Mon) → datascience          (applied ML / DS practice / feature engineering / model deployment — replaces academia weekly) [v2.62, SIXTH Mon lane]
//   04:00 (Mon) → quant                (quantitative finance / derivatives pricing / stochastic calc — replaces money weekly) [v2.53, FIRST Mon lane]
//   04:00 (Wed) → economics             (economic theory — micro/macro/game theory/public finance/monetary/trade — replaces money weekly, distinct from quant Mon-04 finance and personal money default) [v2.70, SEVENTH Wed lane]
//   04:00 (Thu) → space                 (spaceflight engineering — orbital mechanics / launch vehicles / mission ops / spacecraft systems — replaces money weekly, distinct from astronomy Sat-14 observational and aviation Wed-19 atmospheric) [v2.71, EIGHTH Thu lane]
//   04:00 (Sat) → earthscience          (geology / meteorology / oceanography / climate science / seismology / volcanology — replaces money weekly, distinct from astronomy Sat-14 observational and biology default) [v2.72, EIGHTH Sat lane]
//   05:00 (Sun) → scifi                (speculative fiction canon — replaces diy weekly)
//   06:00 (Fri) → workplace            (career / professional norms — replaces askubuntu weekly)
//   06:00 (Thu) → pets                 (domestic-animal care — replaces askubuntu weekly) [v2.60, FOURTH Thu lane]
//   06:00 (Tue) → vegetarianism        (plant-based diet / vegan cooking / nutritional completeness — replaces askubuntu weekly) [v2.64, FIFTH Tue lane]
//   06:00 (Wed) → coffee               (specialty coffee / brewing / roasting / espresso / equipment — replaces askubuntu weekly) [v2.65, FIFTH Wed lane]
//   06:00 (Sun) → mythology            (myth canon / folklore / pantheons / comparative mythography — distinct from hermeneutics biblical scholarship — replaces askubuntu weekly) [v2.68, SEVENTH Sun lane]
//   09:00 (Tue) → matheducators        (PEDAGOGY of math — curriculum / proof literacy / classroom dynamics — replaces math weekly) [v2.55, SECOND Tue lane]
//   09:00 (Fri) → freelancing           (contract negotiation / pricing / scope / client management / invoicing / tax handling — replaces math weekly, distinct from workplace Fri-06 employee dynamics, money default personal finance, quant Mon-04 derivatives — freelance-business frame) [v2.76, TENTH Fri lane]
//   09:00 (Wed) → spanish                (Spanish grammar / vocabulary / conjugation / idiom / dialectal variation / pronunciation / etymology — replaces math weekly, distinct from russian Tue-04, japanese Tue-15, italian Sun-22, ell Tue-13 learner-frame, linguistics Thu-15 theory — Spanish-language-craft frame) [v2.77, TENTH Wed lane]
//   11:00 (Mon) → music                (music theory / harmony / instruments / performance / production — replaces stackoverflow weekly) [v2.56, SECOND Mon lane]
//   11:00 (Sun) → parenting            (child development / family dynamics — replaces stackoverflow weekly)
//   11:00 (Wed) → expatriates          (visa / residency / cross-border tax / work-abroad — replaces stackoverflow weekly) [v2.57, THIRD Wed lane]
//   11:00 (Thu) → travel               (international travel / visas / airline ops / customs / transit — distinct from expatriates relocation — replaces stackoverflow weekly) [v2.66, FIFTH Thu lane]
//   11:00 (Fri) → cstheory              (research-level theoretical CS — complexity theory / circuit lower bounds / hardness of approximation / quantum / type theory — replaces stackoverflow weekly, distinct from cs.SE Thu-17 undergraduate-tier algorithms) [v2.70, SEVENTH Fri lane]
//   11:00 (Sat) → homebrew                (homebrewing beer / mead / cider / wine / kombucha / yeast / fermentation / mashing / hopping / water chemistry — replaces stackoverflow weekly, distinct from coffee Wed-06 specialty coffee, cooking 01 default, vegetarianism Tue-06 diet — homebrewing-craft frame) [v2.77, TENTH Sat lane]
//   12:00 (Sat) → chess                (chess theory / strategic analysis — replaces ux weekly)
//   12:00 (Thu) → puzzling             (puzzles / logic / lateral thinking — replaces ux weekly) [v2.58]
//   12:00 (Fri) → bricks               (LEGO building / mocs / set design — replaces ux weekly) [v2.58]
//   13:00 (Sat) → boardgames           (tabletop strategy / game-design canon — replaces hn weekly)
//   13:00 (Sun) → anime                (anime / manga / studio craft canon — replaces hn weekly) [v2.52]
//   13:00 (Mon) → ai                   (AI / ML theory — replaces hn weekly) [v2.59, FIFTH Mon lane]
//   13:00 (Tue) → ell                   (English Language Learners — articles / tenses / phrasal verbs / learner-frame — distinct from linguistics theory and japanese/italian/russian L2 — replaces hn weekly) [v2.70, SEVENTH Tue lane]
//   13:00 (Thu) → bioinformatics        (computational biology / genomics / sequence alignment / NGS pipelines / single-cell / phylogenetics — replaces hn weekly, distinct from biology default and datascience Mon-02) [v2.70, SEVENTH Thu lane]
//   13:00 (Fri) → woodworking           (joinery / hand tools / power tools / wood selection / finishing / sharpening — replaces hn weekly, distinct from crafts Sun-18 textile/fiber and diy default) [v2.71, EIGHTH Fri lane]
//   12:00 (Mon) → opensource            (open-source licensing / governance / CLA / DCO / copyleft vs permissive / license compatibility / forking etiquette / trademark policy — replaces ux weekly, distinct from softwareengineering Wed-17 architecture, github default trending, codereview default style — open-source-governance frame) [v2.75, TENTH Mon lane]
//   12:00 (Tue) → martialarts           (technique / training / lineage / weapons forms / kata / sparring / grappling / striking — replaces ux weekly, distinct from sports Tue-19 rules and fitness Fri-18 exercise programming — martial-arts-craft frame) [v2.76, TENTH Tue lane]
//   12:00 (Sun) → sound                   (audio engineering / recording / mixing / mastering / signal processing / microphone technique / room acoustics / field recording / foley — replaces ux weekly, distinct from music Mon-11 theory and dsp Mon-10 signal-math — audio-engineering-craft frame) [v2.77, TENTH Sun lane]
//   14:00 (Wed) → bicycles             (cycling drivetrain / fit / training — replaces gis weekly) [v2.52, FIRST Wed lane]
//   14:00 (Sat) → astronomy            (astronomy / cosmology — replaces gis weekly) [v2.59]
//   14:00 (Fri) → outdoors             (hiking / camping / wilderness — replaces gis weekly) [v2.60, FOURTH Fri lane]
//   15:00 (Tue) → japanese             (Japanese language / kanji / grammar — replaces crossvalidated weekly) [v2.52, FIRST Tue lane]
//   15:00 (Thu) → linguistics          (general linguistics — phonology/morphology/syntax/semantics across all languages — replaces crossvalidated weekly) [v2.53, FIRST Thu lane]
//   17:00 (Tue) → tex                  (LaTeX typesetting / mathematical macros / TikZ / BibTeX — replaces codereview weekly) [v2.57, THIRD Tue lane]
//   17:00 (Wed) → softwareengineering  (architecture / design patterns / methodology — replaces codereview weekly) [v2.55, SECOND Wed lane]
//   18:00 (Mon) → photo                (photography — cameras / lenses / lighting / composition / editing — replaces wikipedia weekly) [v2.56, THIRD Mon lane]
//   18:00 (Sat) → movies               (film canon / narrative craft — replaces wikipedia weekly)
//   18:00 (Fri) → fitness              (exercise programming / hypertrophy / strength training / form / recovery / sports nutrition — replaces wikipedia weekly) [v2.67, FIFTH Fri lane]
//   18:00 (Sun) → crafts               (handmade craft / fiber / textile / paper / leather / metalwork / jewelry / woodcraft — replaces wikipedia weekly) [v2.68, SEVENTH Sun lane]
//   19:00 (Sat) → gardening            (practical horticulture — replaces biology weekly)
//   19:00 (Sun) → buddhism             (contemplative practice / dharma / meditation lineages — replaces biology weekly) [v2.57, FIFTH Sun lane]
//   19:00 (Mon) → ethereum             (smart contracts / solidity / EVM / gas / DeFi / wallets / L2 — distinct from quant axis — replaces biology weekly) [v2.68, SEVENTH Mon lane]
//   19:00 (Tue) → sports                (sports rules / training science / game strategy / athlete performance — replaces biology weekly, distinct from fitness Fri-18 exercise programming) [v2.71, EIGHTH Tue lane]
//   19:00 (Wed) → aviation              (piloting / aircraft systems / flight ops / ATC / navigation — replaces biology weekly, distinct from space Thu-04 spaceflight) [v2.71, EIGHTH Wed lane]
//   19:00 (Thu) → genealogy              (family-history research / archival sources / vital records / paleography / DNA matches / immigration records — replaces biology weekly, distinct from history Sat-02 academic historiography and biology default) [v2.74, NINTH Thu lane]
//   20:00 (Sun) → hermeneutics         (biblical scholarship / textual criticism — replaces philosophy weekly) [v2.52]
//   20:00 (Mon) → skeptics             (claim evaluation / scientific scrutiny / rationalist debunking / evidence standards — replaces philosophy weekly) [v2.68, SEVENTH Mon lane]
//   21:00 (Sat) → rpg                  (TTRPG / system mastery / GM craft — replaces superuser weekly) [v2.54, SIXTH Sat axis]
//   21:00 (Sun) → writers               (creative writing craft / fiction technique / story structure — replaces superuser weekly) [v2.63, SIXTH Sun lane]
//   21:00 (Mon) → emacs                (elisp / org-mode / packages / config — power-user emacs craft — replaces superuser weekly) [v2.68, SEVENTH Mon lane]
//   21:00 (Thu) → 3dprinting             (FDM / SLA / resin / filament / nozzle / slicer / bed leveling / retraction / extrusion / supports / adhesion / warping — replaces superuser weekly, distinct from electronics EE Mon-22, engineering mechanical Thu-22, woodworking Fri-13 traditional joinery — additive-manufacturing-craft frame) [v2.77, TENTH Thu lane]
//   22:00 (Thu) → engineering          (mechanical / civil / structural — distinct from electronics — replaces electronics weekly) [v2.55, SECOND Thu lane]
//   22:00 (Mon) → ham                  (amateur radio operating / propagation / antennas / FCC / digital modes — distinct from electronics SE — replaces electronics weekly) [v2.56, FOURTH Mon lane]
//   22:00 (Sun) → italian              (Italian grammar / vocabulary / idiom / dialects — Italian-language craft, distinct from japanese SE — replaces electronics weekly) [v2.68, SEVENTH Sun lane]
//   22:00 (Sat) → worldbuilding         (fictional world creation / setting design / speculative biology / magic systems / fictional tech / culture building — replaces electronics weekly, distinct from writers Sun-21 prose-craft and scifi Sun-05 canon) [v2.72, NINTH Sat lane]
//   22:00 (Tue) → poker                  (poker game theory / pot odds / equity / GTO / range construction / EV / tournament vs cash — replaces electronics weekly, distinct from chess Sat-12 board-game theory, sports SE rules, matheducators pedagogy) [v2.73, NINTH Tue lane]
//   22:00 (Wed) → cseducators            (CS pedagogy / curriculum design / classroom dynamics / introductory programming / data structures teaching / assessment — replaces electronics weekly, distinct from matheducators Tue-09 math pedagogy, softwareengineering Wed-17 architecture, cs Thu-17 algorithms) [v2.74, NINTH Wed lane]
//   22:00 (Fri) → lifehacks              (practical everyday optimizations / household tips / repurposing common items / clever workarounds / minor home fixes / organization — replaces electronics weekly, distinct from diy default residential trades, woodworking Fri-13 joinery, outdoors Fri-14 wilderness) [v2.74, NINTH Fri lane]
//   23:00 (Fri) → politics             (political science / electoral systems / political theory — replaces bbc weekly) [v2.55, SECOND Fri lane]
//   23:00 (Wed) → german                (German grammar / Kasus / Wortstellung / Konjunktiv / trennbares Verb / Wechselpräposition / Adjektivendung / Umlaut / Eszett / Hochdeutsch — replaces bbc weekly, distinct from french Sun-02 french-craft, italian Sun-22 italian-craft, japanese Tue-15 japanese-craft, spanish Wed-09 spanish-craft, russian Tue-04 russian-craft — german-grammar-craft frame) [v2.94, EIGHTEENTH Wed lane]
//   02:00 (Thu) → chinese                (Mandarin pinyin / tones / hanzi / classifier / ba-construction / le aspect / shi-de cleft / radical / simplified vs traditional — replaces academia weekly, distinct from japanese Tue-15 japanese-craft, ell Tue-13 english-learner, linguistics Thu-15 academic-linguistics — mandarin-grammar-craft frame) [v2.94, EIGHTEENTH Thu lane]
//
// dayOfWeek follows the JS / Date.getUTCDay() convention: 0 = Sunday,
// 1 = Monday, ..., 6 = Saturday. Hour windows are non-overlapping. Manual
// triggers fall through (?source=…).
//
// v2.61 — extracted from a 23-arm nested ternary into a (hour, day) lookup
// table. HOUR_DEFAULTS gives the always-on daily axis per UTC hour. Anchor
// hours (1, 3, 7, 8, 10, 16) are unaffected by overrides — keeping them in
// the defaults table preserves the structural rule "anchor hours never
// override". HOUR_DAY_OVERRIDES maps a (hour, dayOfWeek) pair to a
// weekly source that wins when present. New per-day axes = one line in
// HOUR_DAY_OVERRIDES, no nested-ternary depth to manage.
const HOUR_DEFAULTS: Record<number, ExternalSource> = {
  0: 'bbc',       // wraparound for hour 0/0:30 — same as 23
  1: 'cooking',
  2: 'academia',
  3: 'arxiv',
  4: 'money',
  5: 'diy',
  6: 'askubuntu',
  7: 'security',
  8: 'github',
  9: 'math',
  10: 'dsp',
  11: 'stackoverflow',
  12: 'ux',
  13: 'hn',
  14: 'gis',
  15: 'crossvalidated',
  16: 'serverfault',
  17: 'codereview',
  18: 'wikipedia',
  19: 'biology',
  20: 'philosophy',
  21: 'superuser',
  22: 'electronics',
  23: 'bbc',
}

// Day-of-week (0=Sun, 1=Mon, ..., 6=Sat) keyed inside each hour bucket. Empty
// inner record = no overrides for that hour. Adding a new weekly axis = one
// line under the right hour. The earlier nested-ternary at hour 14 had hit
// depth-4 in v2.60; this table absorbs further additions without depth growth.
const HOUR_DAY_OVERRIDES: Record<number, Partial<Record<number, ExternalSource>>> = {
  2: { 6: 'history', 2: 'judaism', 3: 'christianity', 1: 'datascience', 5: 'langdev', 0: 'french', 4: 'chinese' }, // Sat=history, Tue=judaism, Wed=christianity, Mon=datascience, Fri=langdev, Sun=french, Thu=chinese
  4: { 1: 'quant', 2: 'russian', 3: 'economics', 5: 'cogsci', 4: 'space', 6: 'earthscience', 0: 'crypto' }, // Mon=quant, Tue=russian, Wed=economics, Fri=cogsci, Thu=space, Sat=earthscience, Sun=crypto
  5: { 0: 'scifi', 5: 'craftcms', 4: 'elementaryos', 3: 'chemistry', 1: 'law', 2: 'medicalsciences', 6: 'solana' },   // Sun=scifi, Fri=craftcms, Thu=elementaryos, Wed=chemistry, Mon=law, Tue=medicalsciences, Sat=solana
  6: { 5: 'workplace', 4: 'pets', 2: 'vegetarianism', 3: 'coffee', 0: 'mythology', 6: 'iot', 1: 'drones' }, // Fri=workplace, Thu=pets, Tue=vegetarianism, Wed=coffee, Sun=mythology, Sat=iot, Mon=drones
  9: { 2: 'matheducators', 5: 'freelancing', 3: 'spanish', 6: 'literature', 4: 'apple', 1: 'retrocomputing', 0: 'musicfans' }, // Tue=matheducators, Fri=freelancing, Wed=spanish, Sat=literature, Thu=apple, Mon=retrocomputing, Sun=musicfans
  11: { 1: 'music', 0: 'parenting', 3: 'expatriates', 4: 'travel', 5: 'cstheory', 6: 'homebrew', 2: 'avp' }, // Mon=music, Sun=parenting, Wed=expatriates, Thu=travel, Fri=cstheory, Sat=homebrew, Tue=avp
  12: { 6: 'chess', 4: 'puzzling', 5: 'bricks', 1: 'opensource', 2: 'martialarts', 0: 'sound', 3: 'reverseengineering' }, // Sat=chess, Thu=puzzling, Fri=bricks, Mon=opensource, Tue=martialarts, Sun=sound, Wed=reverseengineering
  13: { 6: 'boardgames', 0: 'anime', 1: 'ai', 3: 'dba', 2: 'ell', 4: 'bioinformatics', 5: 'woodworking' }, // Sat=boardgames, Sun=anime, Mon=ai, Wed=dba, Tue=ell, Thu=bioinformatics, Fri=woodworking
  14: { 3: 'bicycles', 6: 'astronomy', 5: 'outdoors', 4: 'robotics', 1: 'or', 0: 'psychology', 2: 'proofassistants' },  // Wed=bicycles, Sat=astronomy, Fri=outdoors, Thu=robotics, Mon=or, Sun=psychology, Tue=proofassistants
  15: { 2: 'japanese', 4: 'linguistics', 1: 'scicomp', 5: 'android', 0: 'interpersonal', 6: 'magento', 3: 'tor' }, // Tue=japanese, Thu=linguistics, Mon=scicomp, Fri=android, Sun=interpersonal, Sat=magento, Wed=tor
  17: { 2: 'tex', 3: 'softwareengineering', 4: 'cs', 1: 'wordpress', 6: 'graphicdesign', 0: 'softwarerecs', 5: 'sustainability' },   // Tue=tex, Wed=softwareengineering, Thu=cs, Mon=wordpress, Sat=graphicdesign, Sun=softwarerecs, Fri=sustainability
  18: { 6: 'movies', 1: 'photo', 5: 'fitness', 0: 'crafts', 2: 'raspberrypi', 3: 'arduino', 4: 'drupal' },         // Sat=movies, Mon=photo, Fri=fitness, Sun=crafts, Tue=raspberrypi, Wed=arduino, Thu=drupal
  19: { 6: 'gardening', 0: 'buddhism', 1: 'ethereum', 2: 'sports', 3: 'aviation', 4: 'genealogy', 5: 'mathematica' }, // Sat=gardening, Sun=buddhism, Mon=ethereum, Tue=sports, Wed=aviation, Thu=genealogy, Fri=mathematica
  20: { 0: 'hermeneutics', 1: 'skeptics', 4: 'pm', 2: 'ebooks', 3: 'sharepoint', 6: 'moderators', 5: 'gamedev' },     // Sun=hermeneutics, Mon=skeptics, Thu=pm, Tue=ebooks, Wed=sharepoint, Sat=moderators, Fri=gamedev
  21: { 6: 'rpg', 0: 'writers', 1: 'emacs', 4: '3dprinting', 2: 'gaming', 3: 'vi', 5: 'salesforce' }, // Sat=rpg, Sun=writers, Mon=emacs, Thu=3dprinting, Tue=gaming, Wed=vi, Fri=salesforce
  22: { 4: 'engineering', 1: 'ham', 0: 'italian', 6: 'worldbuilding', 2: 'poker', 3: 'cseducators', 5: 'lifehacks' }, // Thu=engineering, Mon=ham, Sun=italian, Sat=worldbuilding, Tue=poker, Wed=cseducators, Fri=lifehacks
  23: { 5: 'politics', 4: 'tridion', 0: 'codegolf', 1: 'bitcoin', 2: 'sitecore', 6: 'monero', 3: 'german' },   // Fri=politics, Thu=tridion, Sun=codegolf, Mon=bitcoin, Tue=sitecore, Sat=monero, Wed=german
  0: { 5: 'politics', 3: 'hsm', 0: 'materials', 1: 'devops', 2: 'quantumcomputing', 4: 'networkengineering', 6: 'blender' },        // Fri=politics (00:00/00:30 wraparound), Wed=hsm, Sun=materials, Mon=devops, Tue=quantumcomputing, Thu=networkengineering, Sat=blender
}

function externalSourceForHour(hour: number, dayOfWeek: number): ExternalSource {
  return HOUR_DAY_OVERRIDES[hour]?.[dayOfWeek] ?? HOUR_DEFAULTS[hour] ?? 'bbc'
}

// Cycle to the next external source when the first one returns nothing.
// Walks EXTERNAL_SOURCES in order (defined in external_seeder.ts, hour-sorted),
// wrapping at the end. Adding a new source = one entry in EXTERNAL_SOURCES,
// nothing to update here.
function nextExternalSource(s: ExternalSource): ExternalSource {
  const i = EXTERNAL_SOURCES.indexOf(s)
  return EXTERNAL_SOURCES[(i + 1) % EXTERNAL_SOURCES.length]
}

export async function runAutoCoverage(
  env: any,
  ctx: any,
  opts: { force_source?: ExternalSource | 'organic' | 'evergreen'; topic_count?: number } = {}
): Promise<AutoCoverageRun> {
  const start = Date.now()
  const ts = new Date().toISOString()
  const force = opts.force_source
  // Allow operator to override the per-tick topic count (1..5). Defaults to
  // TOPICS_PER_AUTO_TICK so manual triggers exercise the same multi-path the cron does.
  const requestedCount = Math.max(1, Math.min(opts.topic_count ?? TOPICS_PER_AUTO_TICK, 5))

  // Step 1 — try organic clustering (best signal: real questions Naoufal asked).
  // Skip if caller forced a non-organic source.
  let pick: { topic: string | null; sampled: number; reason?: string } =
    { topic: null, sampled: 0 }
  if (!force || force === 'organic') {
    pick = await pickDominantTopic(env)
  }

  // Hard-skip cases that mean the SYSTEM is broken (not just "quiet day").
  // Surface the real error rather than papering over it with a fallback.
  const HARD_SKIP = new Set(['no_anthropic_key'])
  const isDbErr = (pick.reason ?? '').startsWith('db_error')
  const isExtractErr = (pick.reason ?? '').startsWith('extract_error')
  const systemBroken = isDbErr || isExtractErr || HARD_SKIP.has(pick.reason ?? '')

  let topics: string[] = pick.topic ? [pick.topic] : []
  let mode: 'organic' | 'external' | 'evergreen' = 'organic'
  let source: ExternalSource | 'organic' | 'evergreen' = 'organic'
  let externalMeta: { source: ExternalSource; fetched: number; candidates: string[] } | undefined
  let fallbackReason: string | undefined
  // Track which extractor produced the topic ('haiku' primary, 'together:<model>'
  // when Anthropic credits are empty / rate-limited). Surfaced on AutoCoverageRun
  // so the dashboard / `/improve/coverage/auto/latest` shows when we fell back.
  let extractor: string | undefined

  // Step 2 — external sources. Tried before evergreen so each tick adds fresh,
  // world-aware topics instead of cycling a hardcoded list. On the auto path:
  // ask each source for TOPICS_PER_AUTO_TICK distinct topics in one Haiku call
  // (Wikipedia bypasses Haiku entirely). If a source comes back empty, cycle
  // to the next. Forced runs (?source=…) still pick exactly one.
  if ((topics.length === 0 || force) && !systemBroken && (!force || force === 'organic' || force === 'evergreen' || isExternalSource(force))) {
    const now = new Date()
    const hour = now.getUTCHours()
    const dayOfWeek = now.getUTCDay()
    const sourceToTry: ExternalSource = isExternalSource(force) ? force : externalSourceForHour(hour, dayOfWeek)

    // Both auto and forced paths use the requested count. Default is
    // TOPICS_PER_AUTO_TICK, overridable via ?count=N on the manual endpoint.
    const wantCount = requestedCount

    const ext = await pickExternalTopics(env, sourceToTry, wantCount)
    externalMeta = { source: ext.source, fetched: ext.fetched, candidates: ext.candidates }
    if (ext.extractor) extractor = ext.extractor
    const noPickReasons: string[] = []
    if (ext.picked.length) {
      topics = ext.picked
      mode = 'external'
      source = ext.source
    } else if (isExternalSource(force)) {
      // Caller explicitly asked for an external source — don't silently fall through.
      fallbackReason = `external_${ext.source}_no_pick: ${ext.reason ?? 'unknown'}`
    } else {
      noPickReasons.push(`${ext.source}=${ext.reason ?? '?'}`)
      let nextSrc = nextExternalSource(sourceToTry)
      // (EXTERNAL_SOURCES.length - 1) retries cover all sources from any starting point.
      const maxRetries = EXTERNAL_SOURCES.length - 1
      for (let attempt = 0; attempt < maxRetries && topics.length === 0; attempt++) {
        const alt = await pickExternalTopics(env, nextSrc, wantCount)
        externalMeta = { source: alt.source, fetched: alt.fetched, candidates: alt.candidates }
        if (alt.extractor) extractor = alt.extractor
        if (alt.picked.length) {
          topics = alt.picked
          mode = 'external'
          source = alt.source
          break
        }
        noPickReasons.push(`${alt.source}=${alt.reason ?? '?'}`)
        nextSrc = nextExternalSource(nextSrc)
      }
      if (topics.length === 0) {
        fallbackReason = `external_all_no_pick: ${noPickReasons.join(' / ')}`
      }
    }
  }

  // Step 3 — evergreen rotation (final fallback, guarantees daily growth).
  // Always single-topic — evergreen pool is small, no point burning multiple
  // entries on one tick.
  if (topics.length === 0 && !systemBroken && (!force || force === 'evergreen')) {
    const t = await pickEvergreenTopic(env)
    topics = [t]
    mode = 'evergreen'
    source = 'evergreen'
  }

  if (topics.length === 0) {
    const out: AutoCoverageRun = {
      ts,
      duration_ms: Date.now() - start,
      topic_extracted: null,
      inputs_sampled: pick.sampled,
      ok: false,
      reason: pick.reason ?? fallbackReason,
      mode: 'skip',
      ...(externalMeta ? { external: externalMeta } : {}),
      ...(extractor ? { extractor } : {})
    }
    const blob = JSON.stringify(out)
    ctx.waitUntil(Promise.all([
      env.KV.put('coverage:auto:latest', blob),
      env.KV.put(`coverage:cron-history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 90 })
    ]))
    return out
  }

  // Run all topics in parallel — each runCoverage is sequential internally
  // (5 council calls), so wall-clock stays close to a single-topic run while
  // total API usage scales with topic count.
  const covs = await Promise.all(topics.map(async (t) => {
    try {
      return await runCoverage(t, 5, env, ctx)
    } catch (err: any) {
      return { error: String(err?.message ?? err).slice(0, 200), count_executed: 0, count_cached_new: 0, count_cached_hit: 0 }
    }
  }))

  // Mark each topic seeded only if its coverage actually executed something.
  const totals = { count_executed: 0, count_cached_new: 0, count_cached_hit: 0 }
  let okFlag = false
  for (let i = 0; i < topics.length; i++) {
    const t = topics[i]
    const cov: any = covs[i]
    const executed = cov?.count_executed ?? 0
    totals.count_executed += executed
    totals.count_cached_new += cov?.count_cached_new ?? 0
    totals.count_cached_hit += cov?.count_cached_hit ?? 0
    if (executed > 0) {
      okFlag = true
      if (mode === 'evergreen') ctx.waitUntil(markEvergreenSeeded(env, t, ts))
      if (mode === 'external') ctx.waitUntil(markExternalSeeded(env, t, ts))
    }
  }

  const out: AutoCoverageRun = {
    ts,
    duration_ms: Date.now() - start,
    topic_extracted: topics[0],
    topics_extracted: topics,
    inputs_sampled: pick.sampled,
    ok: okFlag,
    mode,
    source,
    coverage: covs[0],
    coverage_runs: covs,
    totals,
    ...(externalMeta ? { external: externalMeta } : {}),
    ...(extractor ? { extractor } : {}),
    ...(mode !== 'organic' ? { reason: pick.reason ?? fallbackReason ?? `fallback_${mode}` } : {})
  }
  const blob = JSON.stringify(out)
  ctx.waitUntil(Promise.all([
    env.KV.put('coverage:auto:latest', blob),
    env.KV.put(`coverage:cron-history:${ts}`, blob, { expirationTtl: 60 * 60 * 24 * 90 })
  ]))
  return out
}
