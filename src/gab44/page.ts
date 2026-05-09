// gab44.com landing — Naoclaw warm palette per design north star.
// Soft cream background, warm coral accents, JetBrains Mono accents.
// "warm, clean, Claude-flavored" — explicit tone match with nemo.nchobah.com:4444.

export const GAB44_PAGE_HTML = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>gab44 — astrology with soul ✨</title>
<meta name="description" content="Daily energy, life-path readings, and healing sounds — by Naoufal." />
<meta property="og:title" content="gab44 — astrology with soul" />
<meta property="og:description" content="Daily energy, life-path readings, and healing sounds." />
<style>
  :root {
    --bg-0:#faf9f5; --bg-1:#fff; --bg-2:#f1ede4; --bg-3:#e6e0d2;
    --line:rgba(34,24,12,0.10); --line-strong:rgba(34,24,12,0.18);
    --fg:#1a1815; --fg-dim:#5a564e; --fg-muted:#8b8779; --fg-on-accent:#fffaf2;
    --accent:#c96442; --accent-2:#b85432; --accent-soft:#fdebe2;
    --cyan:#0ca8c9; --violet:#6943e0; --magenta:#c4308a;
    --green:#2e9e6a; --amber:#d59315; --red:#d63d4d;
    --shadow-1: 0 1px 2px rgba(20,14,4,0.04), 0 4px 14px rgba(20,14,4,0.06);
    --shadow-2: 0 8px 28px rgba(20,14,4,0.10);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background:
      radial-gradient(1100px 600px at -10% -10%, #fdf5e9 0%, transparent 50%),
      radial-gradient(900px 500px at 110% 110%, #f5e8df 0%, transparent 60%),
      var(--bg-0);
    color: var(--fg); line-height: 1.55; min-height: 100vh;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 56px 24px 96px; }
  .nav { font-size: 13px; margin-bottom: 32px; display: flex; gap: 18px; flex-wrap: wrap; }
  .nav a { color: var(--accent); text-decoration: none; font-weight: 500; }
  .nav a:hover { text-decoration: underline; }
  .brand-mark {
    display: inline-flex; align-items: center; gap: 10px;
    font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase;
    color: var(--fg-muted); font-weight: 700; margin-bottom: 14px;
  }
  .brand-mark .dot { width: 10px; height: 10px; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
  h1 {
    font-size: 60px; line-height: 1.02; margin: 8px 0 14px;
    letter-spacing: -0.02em; font-weight: 800; color: var(--fg);
  }
  h1 .accent { color: var(--accent); }
  .sub { font-size: 19px; color: var(--fg-dim); max-width: 560px; margin: 0 0 36px; }
  .grid { display: grid; gap: 14px; }
  .card {
    background: var(--bg-1); border: 1px solid var(--line);
    padding: 22px 24px 22px; border-radius: 16px;
    box-shadow: var(--shadow-1);
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.05s;
  }
  .card:hover { border-color: var(--line-strong); box-shadow: var(--shadow-2); }
  .card h2 { margin: 0 0 6px; font-size: 21px; font-weight: 700; color: var(--fg); }
  .card p { margin: 0 0 16px; color: var(--fg-dim); }
  .card.featured { border-color: var(--accent); }
  .card.featured h2 { color: var(--accent-2); }
  .cta {
    display: inline-block; background: var(--accent); color: var(--fg-on-accent);
    font-weight: 600; padding: 11px 22px; border-radius: 999px;
    text-decoration: none; font-size: 14px; transition: background 0.15s, transform 0.05s;
  }
  .cta:hover { background: var(--accent-2); }
  .cta:active { transform: translateY(1px); }
  .cta.outline {
    background: transparent; color: var(--fg); border: 1px solid var(--line-strong);
  }
  .cta.outline:hover { background: var(--bg-2); }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .stars { font-size: 22px; letter-spacing: 6px; color: var(--accent); opacity: 0.7; }
  .agent-row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-top: 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--fg-muted); }
  .agent-row .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 10px; border-radius: 999px; background: var(--bg-2);
  }
  .agent-row .pill .d { width: 7px; height: 7px; border-radius: 50%; }
  .pill.nao44   .d { background: var(--violet); }
  .pill.mistral .d { background: var(--green); }
  .pill.minouch .d { background: var(--cyan); }
  footer {
    margin-top: 56px; padding-top: 24px; border-top: 1px solid var(--line);
    color: var(--fg-muted); font-size: 13px;
  }
  footer a { color: var(--fg-dim); text-decoration: none; }
  footer a:hover { text-decoration: underline; }
  @media (max-width: 520px) { h1 { font-size: 42px; } .sub { font-size: 17px; } }
</style>
</head>
<body>
  <main class="wrap">
    <nav class="nav">
      <a href="/dashboard">dashboard</a>
      <a href="/voice">voice</a>
      <a href="/healing">healing</a>
      <a href="/manus">manus</a>
      <a href="/metrics/api-use">metrics</a>
    </nav>

    <div class="brand-mark"><span class="dot"></span> gab44 ✦ astrology with soul</div>
    <h1>readings, written for <span class="accent">one human</span> at a time.</h1>
    <p class="sub">
      Daily energy. Life-path mappings. Healing sounds. A council of three quiet advisors
      behind every answer — built by someone who actually does this for his own family.
    </p>

    <div class="grid">
      <div class="card featured">
        <h2>🔮 Telegram bot — coming next</h2>
        <p>Free daily horoscope in your DMs. Personal life-path readings on demand. Powered by the same council that built this page.</p>
        <a class="cta" href="#telegram">Notify me when it's live →</a>
        <div class="agent-row">
          <span class="pill nao44"><span class="d"></span>nao44 · guardian</span>
          <span class="pill mistral"><span class="d"></span>mistral · logic check</span>
          <span class="pill minouch"><span class="d"></span>minouch · warm voice</span>
        </div>
      </div>

      <div class="card">
        <h2>🌿 Healing sounds</h2>
        <p>Five guided meditations, original audio, free to listen. Made slowly, with care.</p>
        <a class="cta outline" href="/healing">Listen →</a>
      </div>

      <div class="card">
        <h2>✉️ Personal life-path reading</h2>
        <p>For you, your partner, your kid, your parent. A real reading written for one human, not a template. Available via Telegram once the bot ships.</p>
        <span class="stars">✦ ✧ ✦ ✧ ✦</span>
      </div>

      <div class="card">
        <h2>🛠️ Tools we actually use</h2>
        <p>Honest picks — these are what we run our own work on.</p>
        <div class="row">
          <a class="cta outline" href="https://try.elevenlabs.io/6ieh81n1v8o6" target="_blank" rel="noopener">🎙️ ElevenLabs</a>
          <a class="cta outline" href="https://www.iherb.com" target="_blank" rel="noopener">🌿 iHerb</a>
        </div>
      </div>
    </div>

    <footer>
      <p>gab44 is a personal brand by <a href="https://nchobah.com">Naoufal Chobah</a>. Made in Chiang Mai with respect to the practice. 🇲🇦🇹🇭</p>
      <p style="opacity:0.6">v1 · ${new Date().toISOString().slice(0,10)} · powered by <a href="/dashboard">nao_00</a></p>
    </footer>
  </main>
</body>
</html>`
