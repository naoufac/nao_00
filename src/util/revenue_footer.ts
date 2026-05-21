// Shared "monetize every page" block. Inject this immediately before </body>
// on every gab44 sub-page via the /gab44/* middleware so the long-tail SEO
// surface stops being a dead end. Each page gets:
//   - ElevenLabs affiliate (Naoufal's ref code 6ieh81n1v8o6)
//   - Cross-link to /healing (meditation funnel; also has the same affiliate)
//   - Cross-link to /support (Solana / USDC / ETH / BTC / Helio tip jar)
//
// The block is identified by id="nao00-revenue-footer" so the middleware
// can detect prior injection and stay idempotent (no double-inject on
// re-renders or cached responses).

export const REVENUE_FOOTER_HTML = `
<aside id="nao00-revenue-footer" style="margin:48px auto 0;padding:24px 22px 32px;max-width:880px;border-top:1px solid rgba(34,24,12,0.10);font-family:-apple-system,BlinkMacSystemFont,'Inter',system-ui,sans-serif;color:#5a564e;line-height:1.55;">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;">
    <div>
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c96442;margin-bottom:6px;">✨ Made with</div>
      <div style="font-size:15px;color:#1a1815;line-height:1.5;">The same warm AI voice powers all the meditations on /healing. We use <a href="https://try.elevenlabs.io/6ieh81n1v8o6" target="_blank" rel="noopener" style="color:#c96442;font-weight:600;text-decoration:none;">ElevenLabs</a> — try it free, small commission helps us keep building.</div>
    </div>
    <div>
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c96442;margin-bottom:6px;">🌙 Listen</div>
      <div style="font-size:15px;color:#1a1815;line-height:1.5;">Five free 10-minute guided meditations — sleep, anxiety relief, abundance, letting go, deep healing. <a href="/healing" style="color:#c96442;font-weight:600;text-decoration:none;">Open /healing →</a></div>
    </div>
    <div>
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c96442;margin-bottom:6px;">💛 Support</div>
      <div style="font-size:15px;color:#1a1815;line-height:1.5;">If this page gave you something — leave a tip in crypto. Solana, USDC, ETH, BTC. No login, no middleman. <a href="/support" style="color:#c96442;font-weight:600;text-decoration:none;">Open /support →</a></div>
    </div>
    <div>
      <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c96442;margin-bottom:6px;">💎 Council</div>
      <div style="font-size:15px;color:#1a1815;line-height:1.5;">Talk to the same warm AI council Naoufal built for himself — voice in, voice out, $5 USDC for 30 days unlimited. <a href="/try" style="color:#c96442;font-weight:600;text-decoration:none;">Try one free →</a> · <a href="/pricing" style="color:#c96442;font-weight:600;text-decoration:none;">/pricing →</a></div>
    </div>
  </div>
  <div style="margin-top:22px;font-size:12px;color:#8b8779;text-align:center;">Powered by <a href="/" style="color:#c96442;text-decoration:none;">nao_00</a> — a personal AI council, this and that.</div>
</aside>
`
