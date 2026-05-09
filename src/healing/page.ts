import { SITE_URL } from '../util/identity'

export const HEALING_PAGE_HTML = (helioPaylink: string = '') => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Healing Sounds — 10 Minute Meditations to Reset, Sleep, Heal</title>
<meta name="description" content="Five 10-minute guided meditations: deep healing, sleep, anxiety relief, abundance, letting go. Made with love. Free to listen." />
<meta property="og:title" content="Healing Sounds — 10 Minute Meditations" />
<meta property="og:description" content="Five 10-minute guided meditations to reset, sleep, heal." />
<meta property="og:type" content="website" />
<meta property="og:url" content="${SITE_URL}/healing" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Healing Sounds — 10 Minute Meditations" />
<meta name="twitter:description" content="Five 10-minute guided meditations: deep healing, sleep, anxiety relief, abundance, letting go. Free." />
<link rel="canonical" href="${SITE_URL}/healing" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='52' font-size='52'%3E%E2%9C%A8%3C/text%3E%3C/svg%3E" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","name":"Healing Sounds — 5 Guided Meditations","numberOfItems":5,"itemListElement":[
 {"@type":"AudioObject","position":1,"name":"Deep Healing Meditation 10 Minutes","duration":"PT10M01S","contentUrl":"${SITE_URL}/healing/track-01-deep-healing.mp3","description":"Body scan meditation to release tension and restore inner peace."},
 {"@type":"AudioObject","position":2,"name":"Deep Sleep Meditation 10 Minutes","duration":"PT10M12S","contentUrl":"${SITE_URL}/healing/track-02-deep-sleep.mp3","description":"Gentle sleep meditation with soft voice and calming silence."},
 {"@type":"AudioObject","position":3,"name":"Anxiety Relief Meditation 10 Minutes","duration":"PT10M17S","contentUrl":"${SITE_URL}/healing/track-03-anxiety-relief.mp3","description":"Box breathing and 5-senses grounding to calm anxiety."},
 {"@type":"AudioObject","position":4,"name":"Abundance Affirmations 10 Minutes","duration":"PT10M54S","contentUrl":"${SITE_URL}/healing/track-04-abundance.mp3","description":"Powerful abundance affirmations spoken three times for daily listening."},
 {"@type":"AudioObject","position":5,"name":"Letting Go Meditation 10 Minutes","duration":"PT10M11S","contentUrl":"${SITE_URL}/healing/track-05-letting-go.mp3","description":"Guided release and forgiveness meditation."}
]}
</script>
<style>
  :root{
    --bg-1:#0b0420; --bg-2:#1a0533; --bg-3:#3a0a4f;
    --ink:#f6e9ff; --ink-soft:#cbb8e3; --accent:#ffd25c; --accent-2:#ff7eb6;
    --card:#1c0d3aaa; --card-edge:#5b2a8a;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;
    color:var(--ink);
    background:radial-gradient(1200px 700px at 80% -10%, #4b1170 0%, transparent 60%),
               radial-gradient(900px 600px at -10% 110%, #ff7eb633 0%, transparent 55%),
               linear-gradient(180deg, var(--bg-1), var(--bg-2) 60%, var(--bg-3));
    min-height:100vh;
    line-height:1.55;
    -webkit-font-smoothing:antialiased;
  }
  header{
    text-align:center; padding:64px 20px 28px; max-width:880px; margin:0 auto;
  }
  .pill{
    display:inline-block; font-size:12px; letter-spacing:.18em; text-transform:uppercase;
    color:var(--accent); border:1px solid #ffd25c44; padding:6px 12px; border-radius:999px;
    background:#ffd25c11;
  }
  h1{
    font-size:clamp(34px,6vw,58px); margin:18px 0 8px; line-height:1.05;
    background:linear-gradient(90deg,#fff,#ffd25c 40%,#ff7eb6 80%);
    -webkit-background-clip:text; background-clip:text; color:transparent;
  }
  .sub{ color:var(--ink-soft); font-size:18px; max-width:600px; margin:0 auto;}
  .grid{
    display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr));
    gap:22px; max-width:1180px; margin:36px auto 0; padding:0 22px;
  }
  .card{
    background:var(--card); border:1px solid var(--card-edge);
    border-radius:18px; padding:18px; backdrop-filter: blur(10px);
    transition: transform .2s ease, border-color .2s ease;
  }
  .card:hover{ transform: translateY(-3px); border-color:#9a55d4 }
  .card h3{ margin:6px 0 4px; font-size:20px}
  .card .meta{ color:var(--ink-soft); font-size:13px; margin-bottom:10px}
  video{ width:100%; border-radius:12px; background:#000; aspect-ratio:16/9 }
  .desc{ font-size:14.5px; color:var(--ink-soft); margin-top:8px}
  .row{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; align-items:center}
  .chip{ font-size:12px; padding:4px 8px; border-radius:999px; background:#ffd25c1c; color:var(--accent); border:1px solid #ffd25c33}
  .dl{ font-size:12px; padding:4px 10px; border-radius:999px; color:#1a0533; background:linear-gradient(90deg,#ffd25c,#ff7eb6); text-decoration:none; font-weight:600; margin-left:auto }
  .dl:hover{ filter:brightness(1.1) }
  .share{ display:flex; gap:10px; justify-content:center; margin-top:18px; flex-wrap:wrap }
  .share a{
    display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:999px;
    background:#ffffff14; border:1px solid #ffffff22; color:var(--ink); text-decoration:none; font-size:13px;
    transition:background .2s ease;
  }
  .share a:hover{ background:#ffffff22 }
  .cta{
    max-width:1180px; margin:48px auto 24px; padding:28px;
    background:linear-gradient(135deg,#ffd25c22,#ff7eb622);
    border:1px solid #ffd25c44; border-radius:20px; text-align:center;
  }
  .cta h2{ margin:0 0 8px; font-size:26px}
  .cta a.btn{
    display:inline-block; margin-top:14px; padding:12px 22px; border-radius:999px;
    background:linear-gradient(90deg,#ffd25c,#ff7eb6); color:#1a0533; font-weight:700;
    text-decoration:none;
  }
  footer{
    text-align:center; padding:30px 20px 60px; color:#9d8ab9; font-size:13px;
  }
  footer a{ color:var(--accent); text-decoration:none }
  .affiliates{ margin-top:18px; font-size:13px; color:var(--ink-soft) }
  .affiliates a{ color:var(--accent-2); text-decoration:none; margin:0 6px }
</style>
</head>
<body>
<header>
  <span class="pill">✨ Healing Sounds · This and That</span>
  <h1>Five 10-Minute Meditations<br/>to Reset, Sleep, Heal</h1>
  <p class="sub">
    Crafted with a soft voice, slow pace, and golden silence.
    Headphones recommended. Allow yourself to be guided.
  </p>
</header>

<section class="grid" id="tracks">
  <article class="card">
    <video preload="metadata" controls playsinline poster="" src="/healing/track-01-deep-healing.mp4"></video>
    <h3>🌅 Deep Healing Meditation</h3>
    <div class="meta">10:01 · Body scan · Inner peace</div>
    <p class="desc">Release tension, soften the body, restore inner peace. Let golden healing light flow through every cell.</p>
    <div class="row">
      <span class="chip">healing</span><span class="chip">body scan</span><span class="chip">stress relief</span>
      <a class="dl" href="/healing/track-01-deep-healing.mp3" download>⬇ MP3</a>
    </div>
  </article>

  <article class="card">
    <video preload="metadata" controls playsinline src="/healing/track-02-deep-sleep.mp4"></video>
    <h3>🌙 Deep Sleep Meditation</h3>
    <div class="meta">10:12 · Drift to sleep</div>
    <p class="desc">A gentle voice to guide you out of the day and into deep restorative sleep. Long calming silence at the end so you simply drift away.</p>
    <div class="row">
      <span class="chip">sleep</span><span class="chip">insomnia</span><span class="chip">bedtime</span>
      <a class="dl" href="/healing/track-02-deep-sleep.mp3" download>⬇ MP3</a>
    </div>
  </article>

  <article class="card">
    <video preload="metadata" controls playsinline src="/healing/track-03-anxiety-relief.mp4"></video>
    <h3>🕊️ Anxiety Relief — Calm in the Storm</h3>
    <div class="meta">10:17 · Box breathing · 5-senses grounding</div>
    <p class="desc">When the storm is loud, return to your body and your breath. Box breathing, 5-4-3-2-1 grounding, soft affirmations.</p>
    <div class="row">
      <span class="chip">anxiety</span><span class="chip">grounding</span><span class="chip">panic</span>
      <a class="dl" href="/healing/track-03-anxiety-relief.mp3" download>⬇ MP3</a>
    </div>
  </article>

  <article class="card">
    <video preload="metadata" controls playsinline src="/healing/track-04-abundance.mp4"></video>
    <h3>💛 Abundance Affirmations</h3>
    <div class="meta">10:54 · Listen daily for 21 days</div>
    <p class="desc">Powerful abundance affirmations spoken three times to plant deep belief. Listen morning or as you fall asleep.</p>
    <div class="row">
      <span class="chip">manifestation</span><span class="chip">money</span><span class="chip">prosperity</span>
      <a class="dl" href="/healing/track-04-abundance.mp3" download>⬇ MP3</a>
    </div>
  </article>

  <article class="card">
    <video preload="metadata" controls playsinline src="/healing/track-05-letting-go.mp4"></video>
    <h3>🌊 Letting Go — Release</h3>
    <div class="meta">10:11 · Forgiveness · Surrender</div>
    <p class="desc">Gently release what you've been carrying. The river is patient. So is your healing.</p>
    <div class="row">
      <span class="chip">letting go</span><span class="chip">forgiveness</span><span class="chip">emotional healing</span>
      <a class="dl" href="/healing/track-05-letting-go.mp3" download>⬇ MP3</a>
    </div>
  </article>
</section>

${helioPaylink ? `<section class="cta" style="background:linear-gradient(135deg,#ff7eb633,#ffd25c33);border-color:#ff7eb677">
  <h2>💛 Support this work</h2>
  <p>If these meditations gave you something — leave a tip. Pay-what-you-want. Keeps the project alive and growing.</p>
  <a class="btn" href="${helioPaylink}" target="_blank" rel="noopener">✨ Tip with Helio</a>
  <p style="margin-top:14px;font-size:12px;color:var(--ink-soft)">Crypto-native checkout · USDC, SOL, ETH · No login</p>
</section>` : ''}

<section class="cta">
  <h2>💌 Share with someone who needs a soft moment</h2>
  <p>These meditations are 100% free, made with love. If they help you — pass them on.</p>
  <div class="share">
    <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(SITE_URL + '/healing')}&text=Five%20free%2010-minute%20healing%20meditations.%20Worth%20saving." target="_blank" rel="noopener">🐦 Tweet</a>
    <a href="https://api.whatsapp.com/send?text=Five%20free%2010-minute%20healing%20meditations%20%E2%80%94%20deep%20healing%2C%20sleep%2C%20anxiety%20relief%2C%20abundance%2C%20letting%20go.%20${encodeURIComponent(SITE_URL + '/healing')}" target="_blank" rel="noopener">💬 WhatsApp</a>
    <a href="https://www.reddit.com/submit?url=${encodeURIComponent(SITE_URL + '/healing')}&title=Five+free+10-minute+guided+healing+meditations" target="_blank" rel="noopener">🟠 Reddit</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE_URL + '/healing')}" target="_blank" rel="noopener">📘 Facebook</a>
    <a href="#" onclick="navigator.clipboard.writeText('${SITE_URL}/healing'); this.textContent='✓ Copied'; return false;">🔗 Copy link</a>
  </div>
  <p style="margin-top:22px; font-size:14px; color:var(--ink-soft)">
    Made with <a href="https://try.elevenlabs.io/6ieh81n1v8o6" target="_blank" rel="noopener" style="color:var(--accent-2); font-weight:600">ElevenLabs voice AI</a> — try the same tools we use to craft these.
  </p>
  <div class="affiliates">
    Tools that make this possible (we earn a small commission):
    <a href="https://try.elevenlabs.io/6ieh81n1v8o6" target="_blank" rel="noopener">ElevenLabs voice</a> ·
    <a href="https://www.cloudflare.com/" target="_blank" rel="noopener">Cloudflare</a>
  </div>
</section>

<footer>
  Made with love by <a href="https://nchobah.com">Naoufal</a> · Powered by nao00 · this and that ·
  <a href="${SITE_URL}/dashboard">Dashboard</a>
</footer>

<script>
  // Pause others when one plays — gentle UX
  document.querySelectorAll('video').forEach((v) => {
    v.addEventListener('play', () => {
      document.querySelectorAll('video').forEach((o) => { if (o !== v) o.pause() })
    })
  })
</script>
</body>
</html>`
