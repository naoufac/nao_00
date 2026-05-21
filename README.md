# nao_00 — a personal AI council

**Live:** [nao-00.nchobah.workers.dev](https://nao-00.nchobah.workers.dev)
**Try it (1 free query, no signup):** [/try](https://nao-00.nchobah.workers.dev/try)
**Pricing ($5 USDC / 30 days):** [/pricing](https://nao-00.nchobah.workers.dev/pricing)
**Live revenue meter:** [/revenue](https://nao-00.nchobah.workers.dev/revenue)

---

nao_00 is a personal AI council that survives its own provider outages. When Anthropic credits went dry, Gemini hit its monthly cap, and OpenRouter account got revoked in the same week, the system kept answering via a fallback chain to Qwen.

## The council

- **nao44** (strategist) filters for Naoufal's best interest, emits a tool_call if the answer needs the world.
- **Mistral** runs a structured logic check in parallel.
- **Minimax M2.7** is the challenger — it catches nao44's hallucinations (around half the time, honestly).
- **Minouch** (Haiku) delivers the warm final answer. Opens with a soft "hey", "okay", or "love".

## The funnel

Every Google-indexed page (astrology content, healing meditations, angel numbers) carries a 4-column revenue footer: ElevenLabs affiliate, /healing cross-link, /support tip jar (Solana/USDC/ETH/BTC), and /pricing paid tier.

1,506 SEO pages indexed via IndexNow (Bing/Yandex/Naver/Sezaam). 365 routes on a single Cloudflare Worker. 982 Composio tools available to the council (Gmail, Slack, GitHub, YouTube, LinkedIn, Reddit, Notion, Calendar, Drive, …). Daily auto-broadcast to Slack + LinkedIn + Facebook runs at 7am Bangkok.

## The payment rail

$5 USDC on Solana. No Stripe. No KYC. No OAuth. The /pricing route generates a Solana Pay URI bound to your unique ref via a memo field; the /pricing/verify route polls public Solana RPC for the matching tx and mints a `naop_*` token valid for 30 days.

Wallet: `Ac42Lv4AASDrEvkN1nvXsRDsf11AUx4SLndsVjHSKgfc`

## The stack

- Cloudflare Workers (Hono, D1, KV, Durable Objects)
- Anthropic → Gemini → Qwen (Dashscope) fallback chain on every brain
- ElevenLabs for voice (both STT and TTS)
- Composio MCP for the 982-tool surface
- Solana mainnet for payments

## The honest revenue number

$0. Zero dollars collected as of 2026-05-21. The machine is built - revenue now is a function of time + traffic, not code. If this README gave you something, the tip jar is at /support, and if you want to talk to the council for 30 days it's $5 at /pricing.

Built by [Naoufal](https://nchobah.com) in Thailand.
