// nao_00 dashboard — unified interface
// Voice + chat + decomposed council steps + history + insights + system map.
// Token is injected at render time so the page can call /council, /talk, /improve/*.

export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>nao00 — This and That</title>
<style>
  :root {
    --bg:#0b0f14; --panel:#11161d; --line:#1d2530;
    --txt:#e6edf3; --mute:#8b97a8;
    --mint:#4ee0a8; --sun:#ffd166; --peach:#ffa07a; --rose:#ff7eb9; --sky:#7ed4fc; --lilac:#c084fc; --lime:#a3e635;
    --accent:var(--mint); --warn:var(--sun); --err:#ff6b6b; --you:#6aa1ff;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:var(--bg); color:var(--txt); font:14px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif; height:100%; }
  body { display:grid; grid-template-columns: 280px 1fr 320px; grid-template-rows: 48px 1fr; height:100vh; }
  header { grid-column: 1 / -1; display:flex; align-items:center; gap:10px; padding:0 16px; background:linear-gradient(90deg,#11161d 0%,#15202a 60%,#11161d 100%); border-bottom:1px solid var(--line); }
  header .planet { font-size:18px; filter:drop-shadow(0 0 6px rgba(125,212,252,.45)); }
  header .dot { width:8px; height:8px; border-radius:50%; background:var(--mint); box-shadow:0 0 10px var(--mint); animation:pulse 2.4s ease-in-out infinite; }
  @keyframes pulse { 50% { transform:scale(1.25); opacity:.75; } }
  header h1 { font-size:14px; margin:0; font-weight:600; letter-spacing:.02em; background:linear-gradient(90deg,var(--mint),var(--sky),var(--lilac)); -webkit-background-clip:text; background-clip:text; color:transparent; }
  header .crumb { color:var(--mute); font-size:12px; margin-left:auto; display:flex; gap:8px; align-items:center; }
  aside.left, aside.right { background:var(--panel); border-right:1px solid var(--line); overflow-y:auto; }
  aside.right { border-right:0; border-left:1px solid var(--line); }
  aside h2 { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--mute); margin:14px 14px 6px; display:flex; align-items:center; gap:6px; }
  aside h2 .ico { font-size:13px; filter:saturate(1.2); }
  aside ul { list-style:none; margin:0; padding:0 8px; }
  aside li { padding:8px 10px; border-radius:6px; cursor:pointer; font-size:13px; border:1px solid transparent; }
  aside li:hover { background:#0f141b; border-color:var(--line); }
  aside li.active { background:#16202b; border-color:var(--line); }
  aside li .when { display:block; color:var(--mute); font-size:11px; margin-top:2px; }
  main { display:flex; flex-direction:column; min-width:0; min-height:0; }
  #stream { flex:1; overflow-y:auto; padding:16px 18px; }
  .turn { margin-bottom:18px; }
  .turn .you { color:var(--you); margin-bottom:8px; }
  .turn .you b { font-weight:600; }
  .steps { background:#0d131a; border:1px solid var(--line); border-radius:10px; padding:8px; margin:8px 0; }
  .step { display:grid; grid-template-columns: 90px 1fr auto; gap:8px; padding:6px 8px; border-radius:6px; align-items:start; }
  .step + .step { border-top:1px dashed var(--line); }
  .step .who { color:var(--mute); font-size:12px; font-variant:all-small-caps; letter-spacing:.06em; }
  .step.who-nao44 .who { color:var(--lilac); }
  .step.who-nao44 .who::before { content:'🧠 '; }
  .step.who-mistral .who { color:var(--sun); }
  .step.who-mistral .who::before { content:'⚖️ '; }
  .step.who-minouch .who { color:var(--mint); }
  .step.who-minouch .who::before { content:'💚 '; }
  .step.who-cache .who { color:var(--sky); }
  .step.who-cache .who::before { content:'⚡ '; }
  .step.who-grok .who { color:var(--err); text-decoration:line-through; opacity:.6; }
  .step.who-grok .who::before { content:'🪦 '; }
  .step.who-tool .who { color:var(--peach); }
  .step.who-tool .who::before { content:'🔧 '; }
  .step.who-tool .body { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; color:#ffd2b3; }
  .step .body { font-size:12.5px; color:#cbd5e1; white-space:pre-wrap; }
  .step .meta { color:var(--mute); font-size:11px; text-align:right; }
  .reply { background:linear-gradient(135deg,#0f1f17 0%,#101a14 100%); border:1px solid #1f4030; border-radius:12px; padding:12px 14px; box-shadow:inset 0 0 0 1px rgba(78,224,168,.06); }
  .reply b { color:var(--mint); font-weight:600; }
  .reply b::before { content:'💚 '; }
  .reply audio { display:block; margin-top:8px; width:100%; filter:hue-rotate(140deg); }
  form#composer { display:flex; gap:8px; padding:12px 14px; border-top:1px solid var(--line); background:var(--panel); }
  form#composer textarea { flex:1; resize:none; min-height:42px; max-height:160px; background:#0d131a; color:var(--txt); border:1px solid var(--line); border-radius:10px; padding:10px 12px; font:inherit; transition:border-color .15s ease, box-shadow .15s ease; }
  form#composer textarea:focus { outline:0; border-color:var(--mint); box-shadow:0 0 0 3px rgba(78,224,168,.12); }
  form#composer button { background:linear-gradient(135deg,var(--mint),#3ec48b); color:#06281c; font-weight:700; border:0; border-radius:10px; padding:8px 16px; cursor:pointer; box-shadow:0 4px 12px rgba(78,224,168,.18); transition:transform .08s ease; }
  form#composer button:hover { transform:translateY(-1px); }
  form#composer button.mic { background:#1f2933; color:var(--txt); border:1px solid var(--line); box-shadow:none; }
  form#composer button.mic.recording { background:linear-gradient(135deg,var(--err),#e94d6c); color:#fff; animation:pulse 1s ease-in-out infinite; }
  form#composer button:disabled { opacity:.55; cursor:wait; transform:none; }
  pre.json { background:#0d131a; border:1px solid var(--line); border-radius:6px; padding:8px; font-size:11px; color:#a3b1c2; overflow-x:auto; }
  .kpis { display:grid; grid-template-columns: repeat(4,1fr); gap:10px; padding:12px 18px 4px; }
  .kpi { background:linear-gradient(135deg,#101820 0%,#0d131a 100%); border:1px solid var(--line); border-radius:12px; padding:10px 12px; position:relative; overflow:hidden; }
  .kpi::after { content:''; position:absolute; top:-30%; right:-30%; width:80px; height:80px; border-radius:50%; opacity:.15; filter:blur(18px); }
  .kpi.k-usage::after  { background:var(--mint); }
  .kpi.k-cache::after  { background:var(--sky); }
  .kpi.k-speed::after  { background:var(--sun); }
  .kpi.k-saved::after  { background:var(--lilac); }
  .kpi .label { font-size:11px; color:var(--mute); text-transform:uppercase; letter-spacing:.06em; display:flex; gap:6px; align-items:center; }
  .kpi .v { font-size:22px; font-weight:700; margin-top:2px; }
  .kpi .sub { font-size:11px; color:var(--mute); margin-top:2px; }
  .kpi.k-usage .v { color:var(--mint); }
  .kpi.k-cache .v { color:var(--sky); }
  .kpi.k-speed .v { color:var(--sun); }
  .kpi.k-saved .v { color:var(--lilac); }
  .fleet { padding:0 14px; display:flex; flex-direction:column; gap:6px; }
  .fleet .node { background:#0d131a; border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:12px; }
  .fleet .node .nm { font-weight:600; }
  .fleet .node .dom { color:var(--sky); font-size:11px; }
  .fleet .node .ip { color:var(--mute); font-size:11px; }
  .fleet .node .role { color:var(--mute); font-size:11px; margin-top:2px; }
  .kv { display:grid; grid-template-columns: 1fr; gap:6px; padding:0 14px; }
  .kv .row { display:flex; justify-content:space-between; padding:6px 8px; border-radius:6px; background:#0d131a; border:1px solid var(--line); font-size:12px; }
  .kv .row .k { color:var(--mute); }
  .kv .row .v { font-weight:500; }
  .pill { display:inline-block; padding:2px 9px; border-radius:999px; font-size:11px; background:#1f2933; color:var(--mute); border:1px solid var(--line); }
  .pill.live { background:rgba(78,224,168,.12); color:var(--mint); border-color:rgba(78,224,168,.35); }
  .pill.warm { background:rgba(255,209,102,.12); color:var(--sun); border-color:rgba(255,209,102,.35); }
  .pill.sky { background:rgba(126,212,252,.12); color:var(--sky); border-color:rgba(126,212,252,.35); }
  .pill.rose { background:rgba(255,126,185,.12); color:var(--rose); border-color:rgba(255,126,185,.35); }
  .empty { color:var(--mute); padding:14px; font-style:italic; }
  details { padding:6px 14px; }
  details summary { cursor:pointer; font-size:12px; color:var(--mute); }
  details[open] summary { color:var(--txt); }
  a { color:var(--you); text-decoration:none; }
  .auto-cov { margin:8px 14px 4px; padding:8px 10px; background:linear-gradient(135deg,#0f1820 0%,#0d131a 100%); border:1px solid var(--line); border-radius:8px; cursor:pointer; transition:border-color .15s ease, transform .08s ease; }
  .auto-cov:hover { border-color:var(--lilac); transform:translateY(-1px); }
  .auto-cov .row1 { display:flex; align-items:center; gap:6px; font-size:12px; }
  .auto-cov .row1 .lbl { color:var(--mute); font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; }
  .auto-cov .row1 .topic { font-weight:600; color:var(--lilac); }
  .auto-cov .row1 .topic.skip { color:var(--mute); font-style:italic; font-weight:500; }
  .auto-cov .row2 { font-size:11px; color:var(--mute); margin-top:3px; display:flex; gap:8px; }
  .modal-back { position:fixed; inset:0; background:rgba(5,8,12,.72); display:none; align-items:center; justify-content:center; z-index:50; backdrop-filter:blur(3px); }
  .modal-back.open { display:flex; }
  .modal { width:min(720px, 92vw); max-height:82vh; background:var(--panel); border:1px solid var(--line); border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.5); display:flex; flex-direction:column; overflow:hidden; }
  .modal h3 { margin:0; padding:12px 16px; border-bottom:1px solid var(--line); font-size:13px; display:flex; align-items:center; gap:8px; }
  .modal h3 .x { margin-left:auto; cursor:pointer; color:var(--mute); padding:2px 8px; border-radius:6px; }
  .modal h3 .x:hover { background:#1a242e; color:var(--txt); }
  .modal .tabs { display:flex; gap:2px; padding:8px 16px 0; border-bottom:1px solid var(--line); }
  .modal .tab { padding:7px 12px; font-size:12px; cursor:pointer; color:var(--mute); border-bottom:2px solid transparent; margin-bottom:-1px; }
  .modal .tab.active { color:var(--lilac); border-bottom-color:var(--lilac); }
  .modal .body { overflow-y:auto; padding:8px 16px 14px; flex:1; }
  .modal .item { padding:10px 12px; border:1px solid var(--line); border-radius:8px; margin-top:8px; background:#0d131a; }
  .modal .item .top { display:flex; align-items:center; gap:8px; font-size:12.5px; }
  .modal .item .top .topic { font-weight:600; color:var(--lilac); }
  .modal .item .top .topic.skip { color:var(--mute); font-style:italic; font-weight:500; }
  .modal .item .top .ts { margin-left:auto; color:var(--mute); font-size:11px; }
  .modal .item .stats { color:var(--mute); font-size:11px; margin-top:4px; }
  .modal .item .qs { margin-top:6px; font-size:11.5px; color:#cbd5e1; line-height:1.5; }
  .modal .item .qs .q { padding:3px 0; border-top:1px dashed var(--line); }
  .modal .item .qs .q:first-child { border-top:0; }
  .pill.ok { background:rgba(78,224,168,.12); color:var(--mint); border-color:rgba(78,224,168,.35); }
  .pill.skip { background:rgba(139,151,168,.14); color:var(--mute); border-color:rgba(139,151,168,.35); }
  @media (max-width: 1100px) { body { grid-template-columns: 220px 1fr; } aside.right { display:none; } }
  @media (max-width: 720px)  { body { grid-template-columns: 1fr; grid-template-rows: 48px auto 1fr; } aside.left { max-height:140px; } }
</style>
</head>
<body>
  <header>
    <span class="planet">🪐</span>
    <span class="dot"></span>
    <h1>nao00 · this and that</h1>
    <span class="crumb" id="hello">loading…</span>
    <a href="/healing" style="color:#ffd25c;text-decoration:none;font-size:12px;margin-left:14px;padding:4px 10px;border:1px solid #ffd25c44;border-radius:999px;background:#ffd25c11">✨ Healing Sounds</a>
    <a href="/reality" style="color:#ff7eb9;text-decoration:none;font-size:12px;margin-left:8px;padding:4px 10px;border:1px solid #ff7eb944;border-radius:999px;background:#ff7eb911">🔎 Reality</a>
    <a href="/remote" style="color:#7ed4fc;text-decoration:none;font-size:12px;margin-left:8px;padding:4px 10px;border:1px solid #7ed4fc44;border-radius:999px;background:#7ed4fc11">🎛 Remote</a>
    <a href="/tasks" style="color:#7fffa6;text-decoration:none;font-size:12px;margin-left:8px;padding:4px 10px;border:1px solid #7fffa644;border-radius:999px;background:#7fffa611">🎯 Tasks</a>
    <a href="/docs" style="color:#ffd897;text-decoration:none;font-size:12px;margin-left:8px;padding:4px 10px;border:1px solid #ffd89744;border-radius:999px;background:#ffd89711">📚 Docs</a>
  </header>

  <aside class="left">
    <h2><span class="ico">💬</span> Conversations</h2>
    <ul id="history"><li class="empty">loading…</li></ul>
  </aside>

  <main>
    <div class="kpis" id="kpis">
      <div class="kpi k-usage"><div class="label">📈 council calls · today</div><div class="v" id="kpiToday">—</div><div class="sub" id="kpiTodaySub">—</div></div>
      <div class="kpi k-cache"><div class="label">⚡ cache hit · 7d</div><div class="v" id="kpiCache">—</div><div class="sub" id="kpiCacheSub">—</div></div>
      <div class="kpi k-speed"><div class="label">🏎 avg latency · 7d</div><div class="v" id="kpiSpeed">—</div><div class="sub">target ≤ 8s full · ≤ 200ms cached</div></div>
      <div class="kpi k-saved"><div class="label">💰 saved by cache · 7d</div><div class="v" id="kpiSaved">—</div><div class="sub">ms not spent on LLMs</div></div>
    </div>
    <div id="stream"></div>
    <form id="composer">
      <button type="button" class="mic" id="micBtn" title="hold to talk, tap to toggle">🎙️</button>
      <textarea id="msg" placeholder="ask the council… (Shift+Enter = newline, Enter = send)"></textarea>
      <button type="submit" id="sendBtn">send ✨</button>
    </form>
  </main>

  <aside class="right">
    <h2><span class="ico">🧠</span> Council state</h2>
    <div class="kv">
      <div class="row"><span class="k">💓 Health</span><span class="v" id="healthCell"><span class="pill live">checking…</span></span></div>
      <div class="row"><span class="k">⚡ Skills cached</span><span class="v" id="skillsCount">—</span></div>
      <div class="row"><span class="k">🪄 Saved by cache</span><span class="v" id="skillsSaved">—</span></div>
      <div class="row"><span class="k">💬 Conversations</span><span class="v" id="convCount">—</span></div>
      <div class="row"><span class="k">🌱 Last self-eval</span><span class="v" id="lastEval">—</span></div>
    </div>

    <h2><span class="ico">🌟</span> What the council has learned</h2>
    <ul id="skillsTop"><li class="empty">—</li></ul>

    <h2><span class="ico">🎯</span> Coverage seeded</h2>
    <div class="kv">
      <div class="row"><span class="k">runs</span><span class="v" id="covRuns">—</span></div>
      <div class="row"><span class="k">topics</span><span class="v" id="covTopics">—</span></div>
      <div class="row"><span class="k">skills added</span><span class="v" id="covSeeded">—</span></div>
      <div class="row"><span class="k">last topic</span><span class="v" id="covLast">—</span></div>
    </div>
    <div style="padding:8px 14px;display:flex;gap:6px;align-items:center">
      <input id="covTopicInput" placeholder="seed a topic… (e.g. mars)" style="flex:1;background:#0d131a;color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font:inherit;font-size:12px" />
      <input id="covCountInput" type="number" min="1" max="10" value="5" title="questions to seed (1–10)" style="width:46px;background:#0d131a;color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:6px 6px;font:inherit;font-size:12px;text-align:center" />
      <button id="covSeedBtn" type="button" style="background:linear-gradient(135deg,var(--lilac),#9a64dd);color:#1a0e2e;font-weight:700;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px">🎯 seed</button>
    </div>
    <div id="covSeedStatus" style="padding:0 14px 4px;font-size:11px;color:var(--mute)"></div>

    <div class="auto-cov" id="autoCovCard" title="click for full history (manual + auto)">
      <div class="row1">
        <span class="lbl" id="autoCovLbl">🤖 auto · daily 18:00 UTC</span>
        <span class="topic" id="autoCovTopic">—</span>
      </div>
      <div class="row2">
        <span id="autoCovStatus">loading…</span>
        <span style="margin-left:auto" id="autoCovWhen">—</span>
      </div>
      <div class="row3" id="autoCovEvergreen" style="display:none;margin-top:6px">
        <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mute)">
          <span>🌱 evergreen pool</span>
          <span id="autoCovPoolNum" style="color:var(--lilac);font-weight:600">—</span>
          <span style="margin-left:auto">next: <span id="autoCovNextUp" style="color:var(--mint)">—</span></span>
        </div>
        <div style="margin-top:4px;height:3px;background:#0a0e13;border-radius:2px;overflow:hidden">
          <div id="autoCovPoolBar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--mint),var(--lilac));transition:width .6s ease;border-radius:2px"></div>
        </div>
      </div>
      <div class="row4" id="autoCovExternal" style="display:none;margin-top:4px">
        <div style="display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--mute)">
          <span>🌍 external · 30d</span>
          <span id="autoCovExtNum" style="color:var(--sky);font-weight:600">—</span>
          <span style="margin-left:auto">last: <span id="autoCovExtLast" style="color:var(--sky)">—</span></span>
        </div>
      </div>
    </div>

    <h2><span class="ico">🌅</span> Today's focus</h2>
    <div id="briefingCard" class="empty" style="padding:8px 14px;font-size:12.5px;line-height:1.5;color:var(--txt)">— loading —</div>

    <h2><span class="ico">🌙</span> Evening recap</h2>
    <div id="recapCard" class="empty" style="padding:8px 14px;font-size:12.5px;line-height:1.5;color:var(--txt)">— loading —</div>

    <h2><span class="ico">🪞</span> You, according to nao_00</h2>
    <div id="userCtx" class="empty">no insights yet</div>

    <h2><span class="ico">🔌</span> Connected (Composio)</h2>
    <ul id="apps"><li class="empty">—</li></ul>
    <div style="padding:6px 14px;display:flex;gap:6px">
      <input id="connectSlug" placeholder="gmail, github, slack…" style="flex:1;background:#0d131a;color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font:inherit;font-size:12px" />
      <button id="connectBtn" type="button" style="background:linear-gradient(135deg,var(--sky),#5fa7d6);color:#04161f;font-weight:700;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px">+ connect</button>
    </div>
    <div id="connectStatus" style="padding:0 14px;font-size:11px;color:var(--mute)"></div>

    <h2><span class="ico">🔴</span> Live activity <span id="liveDot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--err);margin-left:6px;box-shadow:0 0 8px var(--err);animation:pulse 1.6s ease-in-out infinite;"></span> <span id="liveCount" style="margin-left:auto;font-size:10.5px;color:var(--mute);font-variant:tabular-nums;">—</span></h2>
    <ul id="recentTools"><li class="empty">—</li></ul>

    <h2><span class="ico">🛰️</span> Fleet</h2>
    <div id="fleet" class="fleet"></div>

    <h2><span class="ico">🛤️</span> Endpoints</h2>
    <!-- coverage history modal lives at body root via JS for proper overlay -->

    <details>
      <summary>list</summary>
      <pre class="json">🩺 GET  /health
🎙️ GET  /voice
🎙️ POST /talk            (audio in → audio out)
🧠 POST /council         (text in → text out)
📜 GET  /council/history
🔍 GET  /council/:id
⚡ GET  /improve/skills
🪞 GET  /improve/insights
🌱 POST /improve/eval[?force=1]
🪐 GET  /dashboard       (this page)
📊 GET  /dashboard/state (json: aggregate state)</pre>
    </details>
  </aside>

  <div class="modal-back" id="covModal">
    <div class="modal" role="dialog" aria-label="Coverage history">
      <h3>🎯 Coverage history <span class="x" id="covModalClose">✕</span></h3>
      <div class="tabs">
        <div class="tab active" data-tab="auto" id="covTabAuto">🤖 auto-cron</div>
        <div class="tab" data-tab="manual" id="covTabManual">🎯 manual seeds</div>
      </div>
      <div class="body" id="covModalBody"><div class="empty" style="padding:20px">loading…</div></div>
    </div>
  </div>

<script>
const TOKEN = "__BEARER__";
const auth = { headers: { Authorization: "Bearer " + TOKEN } };
const $ = (id) => document.getElementById(id);

const TOOLKIT_ICON = {
  gmail: '📧', googlecalendar: '📅', googledrive: '📁', googlesheets: '📊',
  slack: '💬', github: '🐙', notion: '📒', youtube: '📺', linkedin: '💼',
  supabase: '🗄️', twitter: '🐦', x: '🐦', discord: '🎮', trello: '📋', reddit: '👽',
  cloudflare: '☁️', stripe: '💳', dropbox: '📦', figma: '🎨', airtable: '🗂️'
};
const iconFor = (tk) => TOOLKIT_ICON[tk] || '🔌';

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

function renderTurn(input, result, opts = {}) {
  const wrap = el('div', 'turn');
  const you = el('div', 'you');
  you.innerHTML = '<b>🙋 you</b> · ' + escapeHtml(input);
  wrap.appendChild(you);

  const steps = el('div', 'steps');
  for (const s of result.council_steps || []) {
    const r = el('div', 'step who-' + (s.advisor || s.advisor_name));
    const who = el('div', 'who', (s.advisor || s.advisor_name));
    const body = el('div', 'body', truncate(s.response, 600));
    const meta = el('div', 'meta', formatMeta(s));
    r.appendChild(who); r.appendChild(body); r.appendChild(meta);
    steps.appendChild(r);
  }
  wrap.appendChild(steps);

  const reply = el('div', 'reply');
  reply.innerHTML = '<b>minouch</b> · ' + escapeHtml(result.final_output || '');
  if (opts.audioUrl) {
    const a = document.createElement('audio');
    a.controls = true; a.autoplay = true; a.src = opts.audioUrl;
    reply.appendChild(a);
  }
  wrap.appendChild(reply);
  $('stream').appendChild(wrap);
  $('stream').scrollTop = $('stream').scrollHeight;
}

function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function truncate(s, n) { s = String(s||''); return s.length > n ? s.slice(0, n) + '…' : s; }
function formatMeta(s) {
  const conf = (s.confidence != null) ? Number(s.confidence).toFixed(2) : '';
  const ms = s.duration_ms != null ? s.duration_ms + 'ms' : '';
  return [conf && ('conf ' + conf), ms].filter(Boolean).join(' · ');
}
function fmtAgo(iso) {
  if (!iso) return '—';
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return Math.round(d) + 's ago';
  if (d < 3600) return Math.round(d/60) + 'm ago';
  if (d < 86400) return Math.round(d/3600) + 'h ago';
  return Math.round(d/86400) + 'd ago';
}

async function refreshBriefing() {
  try {
    const r = await fetch('/briefing/latest');
    const d = await r.json();
    const card = $('briefingCard');
    if (!d.ok && d.message) { card.textContent = d.message; card.className = 'empty'; return; }
    const focus = escapeHtml(d.focus?.line || '(no focus line yet)');
    const inbox = escapeHtml(d.gmail?.summary || '—');
    const cal   = escapeHtml(d.calendar?.summary || '—');
    const when  = fmtAgo(d.ts);
    card.className = '';
    card.innerHTML =
      '<div style="font-weight:600;color:var(--sun);margin-bottom:6px">✨ ' + focus + '</div>' +
      '<div style="color:var(--mute);font-size:11.5px">📧 ' + inbox + '</div>' +
      '<div style="color:var(--mute);font-size:11.5px">📅 ' + cal + '</div>' +
      '<div style="color:var(--mute);font-size:10.5px;margin-top:6px">' + when + '</div>';
  } catch (e) { /* silent */ }
}

async function refreshRecap() {
  try {
    const r = await fetch('/recap/latest');
    const d = await r.json();
    const card = $('recapCard');
    if (!d.ok && d.message) { card.textContent = d.message; card.className = 'empty'; return; }
    const para = escapeHtml(d.recap?.paragraph || '(no recap yet)');
    const calls = d.stats?.council_calls_today ?? 0;
    const tokens = d.stats?.total_tokens_today ?? 0;
    const when = fmtAgo(d.ts);
    card.className = '';
    card.innerHTML =
      '<div style="color:var(--lilac);font-size:12px;margin-bottom:6px">' + para + '</div>' +
      '<div style="color:var(--mute);font-size:11px">📊 ' + calls + ' calls · ' + tokens.toLocaleString() + ' tokens today</div>' +
      '<div style="color:var(--mute);font-size:10.5px;margin-top:4px">' + when + '</div>';
  } catch (e) { /* silent */ }
}

async function refreshState() {
  try {
    const [res, vres] = await Promise.all([
      fetch('/dashboard/state', auth),
      fetch('/version').catch(() => null)
    ]);
    const s = await res.json();
    // /version drives a tiny header indicator: green if briefing/recap/notify
    // routes are all present, red on shadow regression. Failure to reach
    // /version is itself shown as red (no version string => something's wrong).
    let v = null;
    try { v = vres ? await vres.json() : null; } catch {}
    const intact = v && !v.error && v.has_briefing && v.has_recap && v.has_notify;
    const dot = intact ? '🟢' : '🔴';
    const ver = v?.version || s.health?.version || '?';
    const rc = v?.route_count;
    $('hello').textContent = 'hi nao · ' + dot + ' v' + ver + (rc ? ' · ' + rc + ' routes' : '');
    $('healthCell').innerHTML = '<span class="pill live">' + (s.health?.status || '?') + '</span>';
    $('skillsCount').textContent = s.skills_count;
    $('skillsSaved').textContent = (s.skills_saved_calls ?? 0) + ' calls';
    const skillsTop = $('skillsTop'); skillsTop.innerHTML = '';
    (s.skills_top || []).forEach(r => {
      const li = el('li');
      li.innerHTML = '<span class="pill sky" style="margin-right:6px">×' + r.used_count + '</span>' + escapeHtml(truncate(r.pattern, 80));
      skillsTop.appendChild(li);
    });
    if (!s.skills_top?.length) skillsTop.appendChild(el('li','empty','no hits yet'));
    const cov = s.coverage || {};
    $('covRuns').textContent = cov.runs ?? 0;
    $('covTopics').textContent = cov.topics_seen ?? 0;
    $('covSeeded').textContent = (cov.total_seeded ?? 0) + ' skills';
    $('covLast').textContent = cov.last_topic ? truncate(cov.last_topic, 22) : '—';
    $('convCount').textContent = s.conversation_count;
    $('lastEval').textContent = fmtAgo(s.last_eval_at);
    $('userCtx').textContent = s.user_context || 'no insights yet';
    $('userCtx').className = s.user_context ? '' : 'empty';
    const apps = $('apps'); apps.innerHTML = '';
    (s.connected_apps || []).forEach(a => {
      const li = el('li');
      li.innerHTML = '<span style="margin-right:6px">' + iconFor(a.toolkit) + '</span><b>' + escapeHtml(a.toolkit) + '</b> <span class="pill sky">' + escapeHtml(a.label) + '</span>';
      apps.appendChild(li);
    });
    if (!s.connected_apps?.length) apps.appendChild(el('li','empty','—'));
    const hist = $('history'); hist.innerHTML = '';
    (s.history || []).forEach(c => {
      const li = el('li');
      li.innerHTML = '<div>' + escapeHtml(truncate(c.input, 80)) + '</div><span class="when">' + fmtAgo(c.created_at) + '</span>';
      li.onclick = () => loadConversation(c.id);
      hist.appendChild(li);
    });
    if (!s.history?.length) hist.appendChild(el('li','empty','no chats yet'));

    const k = s.kpis || {};
    $('kpiToday').textContent = k.council_calls_today ?? '—';
    $('kpiTodaySub').textContent = '7d total: ' + (k.council_calls_7d ?? '—');
    const hr = (k.cache_hit_rate_7d ?? 0) * 100;
    $('kpiCache').textContent = hr.toFixed(0) + '%';
    $('kpiCacheSub').textContent = (k.council_calls_7d ?? 0) + ' calls · target 30%+';
    $('kpiSpeed').textContent = (k.avg_duration_ms_7d ?? 0) + ' ms';
    $('kpiSaved').textContent = ((k.cache_savings_ms_7d || 0) / 1000).toFixed(1) + ' s';

    const fl = $('fleet'); fl.innerHTML = '';
    (s.fleet || []).forEach(n => {
      const node = el('div', 'node');
      node.innerHTML = '<div><span class="nm">' + escapeHtml(n.name) + '</span> · <span class="dom">' + escapeHtml(n.domain) + '</span></div><div class="ip">' + escapeHtml(n.ip) + '</div><div class="role">' + escapeHtml(n.role) + '</div>';
      fl.appendChild(node);
    });
  } catch (e) {
    console.warn(e);
  }
}

async function loadConversation(id) {
  const res = await fetch('/council/' + id, auth);
  if (!res.ok) return;
  const data = await res.json();
  $('stream').innerHTML = '';
  renderTurn(data.conversation.input, {
    council_steps: data.steps.map(s => ({ advisor: s.advisor_name, response: s.response, confidence: s.confidence, duration_ms: s.duration_ms })),
    final_output: data.conversation.final_output
  });
}

// Text input
$('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const ta = $('msg');
  const input = ta.value.trim();
  if (!input) return;
  ta.value = '';
  $('sendBtn').disabled = true;
  const placeholder = el('div', 'turn');
  placeholder.innerHTML = '<div class="you"><b>you</b> · ' + escapeHtml(input) + '</div><div class="steps"><div class="step"><div class="who">…</div><div class="body">council thinking…</div><div class="meta"></div></div></div>';
  $('stream').appendChild(placeholder); $('stream').scrollTop = $('stream').scrollHeight;
  try {
    const res = await fetch('/council', { method: 'POST', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) });
    const data = await res.json();
    placeholder.remove();
    renderTurn(input, data);
    refreshState();
  } catch (err) {
    placeholder.querySelector('.body').textContent = 'error: ' + err.message;
  } finally {
    $('sendBtn').disabled = false;
  }
});
$('msg').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('composer').requestSubmit(); }
});

// Voice input
let mediaRecorder = null, chunks = [], micStream = null;
const micBtn = $('micBtn');
async function startRec() {
  if (!navigator.mediaDevices?.getUserMedia) return alert('no mic');
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
  mediaRecorder = mime ? new MediaRecorder(micStream, { mimeType: mime }) : new MediaRecorder(micStream);
  chunks = [];
  mediaRecorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
  mediaRecorder.onstop = handleStop;
  mediaRecorder.start();
  micBtn.classList.add('recording'); micBtn.textContent = '■';
}
function stopRec() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.stop();
  micStream?.getTracks().forEach(t => t.stop());
  micBtn.classList.remove('recording'); micBtn.textContent = '🎙';
}
async function handleStop() {
  const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
  if (blob.size < 1000) return;
  $('sendBtn').disabled = true;
  const placeholder = el('div', 'turn');
  placeholder.innerHTML = '<div class="you"><b>you</b> · 🎙 …</div><div class="steps"><div class="step"><div class="who">…</div><div class="body">transcribing + council…</div><div class="meta"></div></div></div>';
  $('stream').appendChild(placeholder); $('stream').scrollTop = $('stream').scrollHeight;
  try {
    const fd = new FormData(); fd.append('audio', blob, 'rec.webm');
    const res = await fetch('/talk', { method: 'POST', headers: auth.headers, body: fd });
    if (!res.ok) throw new Error('talk failed: ' + res.status);
    const transcript = decodeURIComponent(res.headers.get('X-Transcript') || '');
    const reply = decodeURIComponent(res.headers.get('X-Reply') || '');
    const convId = res.headers.get('X-Conversation-Id');
    const audioBlob = await res.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    placeholder.remove();
    // Fetch the steps for that conversation to show decomposition
    let steps = [];
    if (convId) {
      try {
        const cv = await fetch('/council/' + convId, auth).then(r => r.json());
        steps = (cv.steps || []).map(s => ({ advisor: s.advisor_name, response: s.response, confidence: s.confidence, duration_ms: s.duration_ms }));
      } catch {}
    }
    renderTurn(transcript || '🎙 (no transcript)', { council_steps: steps, final_output: reply }, { audioUrl });
    refreshState();
  } catch (err) {
    placeholder.querySelector('.body').textContent = 'error: ' + err.message;
  } finally {
    $('sendBtn').disabled = false;
  }
}
micBtn.addEventListener('click', () => { mediaRecorder?.state === 'recording' ? stopRec() : startRec(); });

async function refreshAutoCoverage() {
  try {
    const [r, eg, ex] = await Promise.all([
      fetch('/improve/coverage/auto/latest', auth),
      fetch('/improve/coverage/auto/evergreen', auth).catch(() => null),
      fetch('/improve/coverage/auto/external', auth).catch(() => null)
    ]);
    const d = await r.json();
    const evg = eg ? await eg.json().catch(() => null) : null;
    const ext = ex ? await ex.json().catch(() => null) : null;
    const lblEl = $('autoCovLbl');
    const topicEl = $('autoCovTopic');
    const statusEl = $('autoCovStatus');
    const whenEl = $('autoCovWhen');
    const cadence = '3x/day';
    if (!d || (d.ok === false && !d.reason && !d.topic_extracted)) {
      lblEl.textContent = '🤖 auto · ' + cadence;
      topicEl.textContent = 'first run · 06:00 UTC';
      topicEl.className = 'topic skip';
      statusEl.innerHTML = '<span class="pill">⏳ pending</span>';
      whenEl.textContent = '—';
    } else {
      const mode = d.mode || (d.ok && d.topic_extracted ? 'organic' : 'skip');
      const src = d.source || mode;
      if (mode === 'external' && src === 'hn') {
        lblEl.textContent = '🟠 hn · ' + cadence;
      } else if (mode === 'external' && src === 'wikipedia') {
        lblEl.textContent = '📖 wikipedia · ' + cadence;
      } else if (mode === 'external' && src === 'bbc') {
        lblEl.textContent = '📰 bbc · ' + cadence;
      } else if (mode === 'external' && src === 'arxiv') {
        lblEl.textContent = '🔬 arxiv · ' + cadence;
      } else if (mode === 'external' && src === 'github') {
        lblEl.textContent = '🐙 github · ' + cadence;
      } else if (mode === 'external' && src === 'stackoverflow') {
        lblEl.textContent = '❓ stackoverflow · ' + cadence;
      } else if (mode === 'external' && src === 'serverfault') {
        lblEl.textContent = '🛠️ serverfault · ' + cadence;
      } else if (mode === 'external' && src === 'superuser') {
        lblEl.textContent = '💻 superuser · ' + cadence;
      } else if (mode === 'external' && src === 'askubuntu') {
        lblEl.textContent = '🐧 askubuntu · ' + cadence;
      } else if (mode === 'external' && src === 'crossvalidated') {
        lblEl.textContent = '📊 crossvalidated · ' + cadence;
      } else if (mode === 'external' && src === 'math') {
        lblEl.textContent = '📐 math · ' + cadence;
      } else if (mode === 'external' && src === 'codereview') {
        lblEl.textContent = '🔍 codereview · ' + cadence;
      } else if (mode === 'external' && src === 'electronics') {
        lblEl.textContent = '⚡ electronics · ' + cadence;
      } else if (mode === 'external' && src === 'security') {
        lblEl.textContent = '🔒 security · ' + cadence;
      } else if (mode === 'external' && src === 'dsp') {
        lblEl.textContent = '🎛️ dsp · ' + cadence;
      } else if (mode === 'external' && src === 'ux') {
        lblEl.textContent = '🎨 ux · ' + cadence;
      } else if (mode === 'external' && src === 'gis') {
        lblEl.textContent = '🗺️ gis · ' + cadence;
      } else if (mode === 'external' && src === 'biology') {
        lblEl.textContent = '🧬 biology · ' + cadence;
      } else if (mode === 'external' && src === 'money') {
        lblEl.textContent = '💰 money · ' + cadence;
      } else if (mode === 'external' && src === 'philosophy') {
        lblEl.textContent = '🤔 philosophy · ' + cadence;
      } else if (mode === 'external' && src === 'cooking') {
        lblEl.textContent = '🍳 cooking · ' + cadence;
      } else if (mode === 'external' && src === 'academia') {
        lblEl.textContent = '🎓 academia · ' + cadence;
      } else if (mode === 'external' && src === 'diy') {
        lblEl.textContent = '🔨 diy · ' + cadence;
      } else if (mode === 'external' && src === 'scifi') {
        lblEl.textContent = '🚀 scifi · ' + cadence;
      } else if (mode === 'external' && src === 'history') {
        lblEl.textContent = '📜 history · ' + cadence;
      } else if (mode === 'external' && src === 'gardening') {
        lblEl.textContent = '🌷 gardening · ' + cadence;
      } else if (mode === 'external' && src === 'chess') {
        lblEl.textContent = '♟️ chess · ' + cadence;
      } else if (mode === 'external' && src === 'movies') {
        lblEl.textContent = '🎬 movies · ' + cadence;
      } else if (mode === 'external' && src === 'boardgames') {
        lblEl.textContent = '🎲 boardgames · ' + cadence;
      } else if (mode === 'external' && src === 'workplace') {
        lblEl.textContent = '💼 workplace · ' + cadence;
      } else if (mode === 'external' && src === 'parenting') {
        lblEl.textContent = '👶 parenting · ' + cadence;
      } else if (mode === 'external' && src === 'anime') {
        lblEl.textContent = '🎌 anime · ' + cadence;
      } else if (mode === 'external' && src === 'hermeneutics') {
        lblEl.textContent = '📖 hermeneutics · ' + cadence;
      } else if (mode === 'external' && src === 'bicycles') {
        lblEl.textContent = '🚴 bicycles · ' + cadence;
      } else if (mode === 'external' && src === 'japanese') {
        lblEl.textContent = '🗾 japanese · ' + cadence;
      } else if (mode === 'external' && src === 'quant') {
        lblEl.textContent = '📈 quant · ' + cadence;
      } else if (mode === 'external' && src === 'linguistics') {
        lblEl.textContent = '🔤 linguistics · ' + cadence;
      } else if (mode === 'external' && src === 'rpg') {
        lblEl.textContent = '🐉 rpg · ' + cadence;
      } else if (mode === 'external' && src === 'matheducators') {
        lblEl.textContent = '👩‍🏫 matheducators · ' + cadence;
      } else if (mode === 'external' && src === 'softwareengineering') {
        lblEl.textContent = '🏛️ softwareengineering · ' + cadence;
      } else if (mode === 'external' && src === 'engineering') {
        lblEl.textContent = '🛠️ engineering · ' + cadence;
      } else if (mode === 'external' && src === 'politics') {
        lblEl.textContent = '🏛️ politics · ' + cadence;
      } else if (mode === 'external' && src === 'music') {
        lblEl.textContent = '🎵 music · ' + cadence;
      } else if (mode === 'external' && src === 'photo') {
        lblEl.textContent = '📷 photo · ' + cadence;
      } else if (mode === 'external' && src === 'ham') {
        lblEl.textContent = '📻 ham · ' + cadence;
      } else if (mode === 'external' && src === 'buddhism') {
        lblEl.textContent = '☸️ buddhism · ' + cadence;
      } else if (mode === 'external' && src === 'tex') {
        lblEl.textContent = '📐 tex · ' + cadence;
      } else if (mode === 'external' && src === 'expatriates') {
        lblEl.textContent = '✈️ expatriates · ' + cadence;
      } else if (mode === 'external' && src === 'puzzling') {
        lblEl.textContent = '🧩 puzzling · ' + cadence;
      } else if (mode === 'external' && src === 'bricks') {
        lblEl.textContent = '🧱 bricks · ' + cadence;
      } else if (mode === 'external' && src === 'ai') {
        lblEl.textContent = '🤖 ai · ' + cadence;
      } else if (mode === 'external' && src === 'astronomy') {
        lblEl.textContent = '🔭 astronomy · ' + cadence;
      } else if (mode === 'external' && src === 'judaism') {
        lblEl.textContent = '✡️ judaism · ' + cadence;
      } else if (mode === 'external' && src === 'pets') {
        lblEl.textContent = '🐾 pets · ' + cadence;
      } else if (mode === 'external' && src === 'outdoors') {
        lblEl.textContent = '🏕️ outdoors · ' + cadence;
      } else if (mode === 'external' && src === 'christianity') {
        lblEl.textContent = '✝️ christianity · ' + cadence;
      } else if (mode === 'external' && src === 'datascience') {
        lblEl.textContent = '📊 datascience · ' + cadence;
      } else if (mode === 'external' && src === 'writers') {
        lblEl.textContent = '✍️ writers · ' + cadence;
      } else if (mode === 'external' && src === 'vegetarianism') {
        lblEl.textContent = '🥬 vegetarianism · ' + cadence;
      } else if (mode === 'external' && src === 'coffee') {
        lblEl.textContent = '☕ coffee · ' + cadence;
      } else if (mode === 'external' && src === 'travel') {
        lblEl.textContent = '🧳 travel · ' + cadence;
      } else if (mode === 'external' && src === 'fitness') {
        lblEl.textContent = '🏋️ fitness · ' + cadence;
      } else if (mode === 'external' && src === 'ethereum') {
        lblEl.textContent = '⟠ ethereum · ' + cadence;
      } else if (mode === 'external' && src === 'skeptics') {
        lblEl.textContent = '🤔 skeptics · ' + cadence;
      } else if (mode === 'external' && src === 'emacs') {
        lblEl.textContent = '🅴 emacs · ' + cadence;
      } else if (mode === 'external' && src === 'mythology') {
        lblEl.textContent = '🐉 mythology · ' + cadence;
      } else if (mode === 'external' && src === 'crafts') {
        lblEl.textContent = '🧶 crafts · ' + cadence;
      } else if (mode === 'external' && src === 'italian') {
        lblEl.textContent = '🇮🇹 italian · ' + cadence;
      } else if (mode === 'external' && src === 'russian') {
        lblEl.textContent = '🇷🇺 russian · ' + cadence;
      } else if (mode === 'external' && src === 'dba') {
        lblEl.textContent = '🗄️ dba · ' + cadence;
      } else if (mode === 'external' && src === 'cs') {
        lblEl.textContent = '🧮 cs · ' + cadence;
      } else if (mode === 'external' && src === 'cogsci') {
        lblEl.textContent = '🧠 cogsci · ' + cadence;
      } else if (mode === 'external' && src === 'ell') {
        lblEl.textContent = '🇬🇧 ell · ' + cadence;
      } else if (mode === 'external' && src === 'economics') {
        lblEl.textContent = '📈 economics · ' + cadence;
      } else if (mode === 'external' && src === 'bioinformatics') {
        lblEl.textContent = '🧬 bioinformatics · ' + cadence;
      } else if (mode === 'external' && src === 'cstheory') {
        lblEl.textContent = '🔬 cstheory · ' + cadence;
      } else if (mode === 'external' && src === 'sports') {
        lblEl.textContent = '⚽ sports · ' + cadence;
      } else if (mode === 'external' && src === 'aviation') {
        lblEl.textContent = '✈️ aviation · ' + cadence;
      } else if (mode === 'external' && src === 'space') {
        lblEl.textContent = '🚀 space · ' + cadence;
      } else if (mode === 'external' && src === 'woodworking') {
        lblEl.textContent = '🪚 woodworking · ' + cadence;
      } else if (mode === 'external' && src === 'earthscience') {
        lblEl.textContent = '🌍 earthscience · ' + cadence;
      } else if (mode === 'external' && src === 'worldbuilding') {
        lblEl.textContent = '🗺️ worldbuilding · ' + cadence;
      } else if (mode === 'external' && src === 'poker') {
        lblEl.textContent = '♠️ poker · ' + cadence;
      } else if (mode === 'external' && src === 'cseducators') {
        lblEl.textContent = '🎓 cseducators · ' + cadence;
      } else if (mode === 'external' && src === 'genealogy') {
        lblEl.textContent = '🌳 genealogy · ' + cadence;
      } else if (mode === 'external' && src === 'lifehacks') {
        lblEl.textContent = '💡 lifehacks · ' + cadence;
      } else if (mode === 'external' && src === 'opensource') {
        lblEl.textContent = '⚖️ opensource · ' + cadence;
      } else if (mode === 'external' && src === 'martialarts') {
        lblEl.textContent = '🥋 martialarts · ' + cadence;
      } else if (mode === 'external' && src === 'freelancing') {
        lblEl.textContent = '🧾 freelancing · ' + cadence;
      } else if (mode === 'external' && src === 'spanish') {
        lblEl.textContent = '🇪🇸 spanish · ' + cadence;
      } else if (mode === 'external' && src === 'homebrew') {
        lblEl.textContent = '🍺 homebrew · ' + cadence;
      } else if (mode === 'external' && src === 'sound') {
        lblEl.textContent = '🎧 sound · ' + cadence;
      } else if (mode === 'external' && src === '3dprinting') {
        lblEl.textContent = '🖨️ 3dprinting · ' + cadence;
      } else if (mode === 'external' && src === 'scicomp') {
        lblEl.textContent = '🧪 scicomp · ' + cadence;
      } else if (mode === 'external' && src === 'gaming') {
        lblEl.textContent = '🎮 gaming · ' + cadence;
      } else if (mode === 'external' && src === 'reverseengineering') {
        lblEl.textContent = '🔍 reverseengineering · ' + cadence;
      } else if (mode === 'external' && src === 'literature') {
        lblEl.textContent = '📖 literature · ' + cadence;
      } else if (mode === 'external' && src === 'apple') {
        lblEl.textContent = '🍎 apple · ' + cadence;
      } else if (mode === 'external' && src === 'android') {
        lblEl.textContent = '🤖 android · ' + cadence;
      } else if (mode === 'external' && src === 'interpersonal') {
        lblEl.textContent = '🫂 interpersonal · ' + cadence;
      } else if (mode === 'external' && src === 'wordpress') {
        lblEl.textContent = '📝 wordpress · ' + cadence;
      } else if (mode === 'external' && src === 'raspberrypi') {
        lblEl.textContent = '🥧 raspberrypi · ' + cadence;
      } else if (mode === 'external' && src === 'graphicdesign') {
        lblEl.textContent = '🖼️ graphicdesign · ' + cadence;
      } else if (mode === 'external' && src === 'crypto') {
        lblEl.textContent = '🔐 crypto · ' + cadence;
      } else if (mode === 'external' && src === 'arduino') {
        lblEl.textContent = '🔌 arduino · ' + cadence;
      } else if (mode === 'external' && src === 'drupal') {
        lblEl.textContent = '💧 drupal · ' + cadence;
      } else if (mode === 'external' && src === 'mathematica') {
        lblEl.textContent = '∑ mathematica · ' + cadence;
      } else if (mode === 'external' && src === 'vi') {
        lblEl.textContent = '⌨️ vi · ' + cadence;
      } else if (mode === 'external' && src === 'robotics') {
        lblEl.textContent = '🦾 robotics · ' + cadence;
      } else if (mode === 'external' && src === 'magento') {
        lblEl.textContent = '🛒 magento · ' + cadence;
      } else if (mode === 'external' && src === 'softwarerecs') {
        lblEl.textContent = '🧰 softwarerecs · ' + cadence;
      } else if (mode === 'external' && src === 'retrocomputing') {
        lblEl.textContent = '💾 retrocomputing · ' + cadence;
      } else if (mode === 'external' && src === 'avp') {
        lblEl.textContent = '🎬 avp · ' + cadence;
      } else if (mode === 'external' && src === 'sustainability') {
        lblEl.textContent = '🌍 sustainability · ' + cadence;
      } else if (mode === 'external' && src === 'tor') {
        lblEl.textContent = '🧅 tor · ' + cadence;
      } else if (mode === 'external' && src === 'iot') {
        lblEl.textContent = '📡 iot · ' + cadence;
      } else if (mode === 'external' && src === 'musicfans') {
        lblEl.textContent = '🎶 musicfans · ' + cadence;
      } else if (mode === 'external' && src === 'pm') {
        lblEl.textContent = '📋 pm · ' + cadence;
      } else if (mode === 'external' && src === 'or') {
        lblEl.textContent = '🧮 or · ' + cadence;
      } else if (mode === 'external' && src === 'ebooks') {
        lblEl.textContent = '📚 ebooks · ' + cadence;
      } else if (mode === 'external' && src === 'salesforce') {
        lblEl.textContent = '☁️ salesforce · ' + cadence;
      } else if (mode === 'external' && src === 'sharepoint') {
        lblEl.textContent = '🏢 sharepoint · ' + cadence;
      } else if (mode === 'external' && src === 'tridion') {
        lblEl.textContent = '🧩 tridion · ' + cadence;
      } else if (mode === 'external' && src === 'moderators') {
        lblEl.textContent = '🛡️ moderators · ' + cadence;
      } else if (mode === 'external' && src === 'codegolf') {
        lblEl.textContent = '⛳ codegolf · ' + cadence;
      } else if (mode === 'external' && src === 'bitcoin') {
        lblEl.textContent = '₿ bitcoin · ' + cadence;
      } else if (mode === 'external' && src === 'sitecore') {
        lblEl.textContent = '🧱 sitecore · ' + cadence;
      } else if (mode === 'external' && src === 'craftcms') {
        lblEl.textContent = '🔨 craftcms · ' + cadence;
      } else if (mode === 'external' && src === 'hsm') {
        lblEl.textContent = '📜 hsm · ' + cadence;
      } else if (mode === 'external' && src === 'elementaryos') {
        lblEl.textContent = '🐧 elementaryos · ' + cadence;
      } else if (mode === 'external' && src === 'monero') {
        lblEl.textContent = 'ɱ monero · ' + cadence;
      } else if (mode === 'external' && src === 'materials') {
        lblEl.textContent = '⚗ materials · ' + cadence;
      } else if (mode === 'external' && src === 'devops') {
        lblEl.textContent = '⚙ devops · ' + cadence;
      } else if (mode === 'external' && src === 'quantumcomputing') {
        lblEl.textContent = '⚛ quantumcomputing · ' + cadence;
      } else if (mode === 'external' && src === 'gamedev') {
        lblEl.textContent = '🎮 gamedev · ' + cadence;
      } else if (mode === 'external' && src === 'chemistry') {
        lblEl.textContent = '🧪 chemistry · ' + cadence;
      } else if (mode === 'external' && src === 'networkengineering') {
        lblEl.textContent = '🌐 networkengineering · ' + cadence;
      } else if (mode === 'external' && src === 'blender') {
        lblEl.textContent = '🎨 blender · ' + cadence;
      } else if (mode === 'external' && src === 'psychology') {
        lblEl.textContent = '🧠 psychology · ' + cadence;
      } else if (mode === 'external' && src === 'law') {
        lblEl.textContent = '⚖️ law · ' + cadence;
      } else if (mode === 'external' && src === 'medicalsciences') {
        lblEl.textContent = '🩺 medicalsciences · ' + cadence;
      } else if (mode === 'external' && src === 'langdev') {
        lblEl.textContent = '🔣 langdev · ' + cadence;
      } else if (mode === 'external' && src === 'drones') {
        lblEl.textContent = '🚁 drones · ' + cadence;
      } else if (mode === 'external' && src === 'proofassistants') {
        lblEl.textContent = '∀ proofassistants · ' + cadence;
      } else if (mode === 'external' && src === 'solana') {
        lblEl.textContent = '◎ solana · ' + cadence;
      } else if (mode === 'external' && src === 'french') {
        lblEl.textContent = '🥖 french · ' + cadence;
      } else if (mode === 'external' && src === 'german') {
        lblEl.textContent = '🥨 german · ' + cadence;
      } else if (mode === 'external' && src === 'chinese') {
        lblEl.textContent = '🥟 chinese · ' + cadence;
      } else if (mode === 'evergreen') {
        lblEl.textContent = '🌱 evergreen · ' + cadence;
      } else if (mode === 'organic') {
        lblEl.textContent = '🤖 organic · ' + cadence;
      } else {
        lblEl.textContent = '🤖 auto · ' + cadence;
      }
      if (d.ok && d.topic_extracted) {
        topicEl.textContent = truncate(d.topic_extracted, 32);
        topicEl.className = 'topic';
        const cov = d.coverage || {};
        const cn = cov.count_cached_new ?? 0;
        const ex = cov.count_executed ?? 0;
        const dur = Math.round((cov.duration_ms || d.duration_ms || 0) / 1000);
        statusEl.innerHTML = '<span class="pill ok">✓ +' + cn + ' cached</span> · ' + ex + ' run · ' + dur + 's';
      } else {
        topicEl.textContent = d.reason || 'skipped';
        topicEl.className = 'topic skip';
        statusEl.innerHTML = '<span class="pill skip">skipped</span> · ' + (d.inputs_sampled ?? 0) + ' inputs sampled';
      }
      whenEl.textContent = fmtAgo(d.ts);
    }
    // Evergreen pool progress
    const egEl = $('autoCovEvergreen');
    if (evg && typeof evg.pool_size === 'number' && evg.pool_size > 0) {
      const seeded = evg.seeded_count || 0;
      const total = evg.pool_size;
      const pct = Math.round((seeded / total) * 100);
      $('autoCovPoolNum').textContent = seeded + '/' + total;
      $('autoCovPoolBar').style.width = pct + '%';
      $('autoCovNextUp').textContent = evg.next_up ? truncate(evg.next_up, 22) : '—';
      egEl.style.display = '';
    } else {
      egEl.style.display = 'none';
    }
    // External seeder counter (HN + Wikipedia, 30d window)
    const exEl = $('autoCovExternal');
    if (ext && typeof ext.seeded_count === 'number') {
      $('autoCovExtNum').textContent = String(ext.seeded_count);
      const last = (ext.seeded && ext.seeded[0] && ext.seeded[0].topic) || '—';
      $('autoCovExtLast').textContent = truncate(last, 22);
      exEl.style.display = '';
    } else {
      exEl.style.display = 'none';
    }
  } catch (e) { console.warn('autoCov', e); }
}

let _covHistAuto = null, _covHistManual = null, _covCurrentTab = 'auto';
async function loadCovHistory() {
  const body = $('covModalBody');
  body.innerHTML = '<div class="empty" style="padding:20px">loading…</div>';
  try {
    const [a, m] = await Promise.all([
      fetch('/improve/coverage/auto/history', auth).then(r => r.json()),
      fetch('/improve/coverage/history', auth).then(r => r.json())
    ]);
    _covHistAuto = a?.items || [];
    _covHistManual = m?.items || [];
    renderCovTab(_covCurrentTab);
  } catch (err) {
    body.innerHTML = '<div class="empty" style="padding:20px;color:var(--err)">load failed: ' + escapeHtml(err.message) + '</div>';
  }
}
function renderCovTab(which) {
  _covCurrentTab = which;
  $('covTabAuto').classList.toggle('active', which === 'auto');
  $('covTabManual').classList.toggle('active', which === 'manual');
  const body = $('covModalBody'); body.innerHTML = '';
  const list = which === 'auto' ? _covHistAuto : _covHistManual;
  if (!list || !list.length) {
    body.innerHTML = '<div class="empty" style="padding:20px">no runs yet</div>';
    return;
  }
  for (const it of list) {
    const item = el('div', 'item');
    const top = el('div', 'top');
    let topicText, topicCls = 'topic', pill;
    if (which === 'auto') {
      if (it.ok && it.topic_extracted) {
        topicText = it.topic_extracted;
        pill = '<span class="pill ok">✓ ok</span>';
      } else {
        topicText = it.reason || 'skipped';
        topicCls = 'topic skip';
        pill = '<span class="pill skip">skip</span>';
      }
    } else {
      topicText = it.topic || '?';
      pill = '<span class="pill ok">✓</span>';
    }
    top.innerHTML = pill + ' <span class="' + topicCls + '">' + escapeHtml(truncate(topicText, 50)) + '</span><span class="ts">' + fmtAgo(it.ts) + '</span>';
    item.appendChild(top);
    const cov = which === 'auto' ? it.coverage : it;
    if (cov && cov.count_executed != null) {
      const stats = el('div', 'stats');
      const cn = cov.count_cached_new ?? 0, ch = cov.count_cached_hit ?? 0, sk = cov.count_skipped ?? 0;
      const dur = Math.round((cov.duration_ms || 0) / 1000);
      stats.textContent = (cov.count_executed ?? 0) + ' run · +' + cn + ' new · ' + ch + ' hits · ' + sk + ' skipped · ' + dur + 's';
      item.appendChild(stats);
      if (cov.questions?.length) {
        const qs = el('div', 'qs');
        for (const q of cov.questions.slice(0, 5)) {
          const row = el('div', 'q');
          row.textContent = '· ' + truncate(q.question, 110);
          qs.appendChild(row);
        }
        item.appendChild(qs);
      }
    } else if (which === 'auto' && it.inputs_sampled != null) {
      const stats = el('div', 'stats');
      stats.textContent = it.inputs_sampled + ' inputs sampled · ' + Math.round((it.duration_ms || 0) / 1000) + 's';
      item.appendChild(stats);
    }
    body.appendChild(item);
  }
}
function openCovModal() { $('covModal').classList.add('open'); loadCovHistory(); }
function closeCovModal() { $('covModal').classList.remove('open'); }
$('autoCovCard').addEventListener('click', openCovModal);
$('covModalClose').addEventListener('click', closeCovModal);
$('covModal').addEventListener('click', (e) => { if (e.target.id === 'covModal') closeCovModal(); });
$('covTabAuto').addEventListener('click', () => renderCovTab('auto'));
$('covTabManual').addEventListener('click', () => renderCovTab('manual'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('covModal').classList.contains('open')) closeCovModal(); });

var __seenToolIds = new Set();
var __toolBootstrapped = false;
async function refreshRecentTools() {
  try {
    const res = await fetch('/tools/recent', auth);
    const rows = await res.json();
    const list = (rows.results || rows || []);
    const ul = $('recentTools'); ul.innerHTML = '';
    var lc = $('liveCount'); if (lc) lc.textContent = list.length ? (list.length + ' shown') : 'idle';
    if (!list.length) { ul.appendChild(el('li','empty','no tool calls yet')); return; }
    list.slice(0, 8).forEach(r => {
      const li = el('li');
      const m = String(r.response || '').match(/tool=([A-Z0-9_]+)/);
      const tool = m ? m[1] : '?';
      const inputPreview = truncate(r.input || '', 70);
      const id = r.id || (r.conv_id + ':' + r.created_at);
      const isNew = __toolBootstrapped && !__seenToolIds.has(id);
      li.innerHTML = '<div><span class="pill warm">🔧</span> <b>' + escapeHtml(tool) + '</b>' + (isNew ? ' <span style="color:var(--mint);font-size:10px;font-weight:700;letter-spacing:.05em">·NEW</span>' : '') + '</div><div style="color:var(--mute);font-size:11px;margin-top:2px">' + escapeHtml(inputPreview) + '</div><span class="when">' + fmtAgo(r.created_at) + ' · ' + (r.duration_ms||0) + 'ms</span>';
      li.onclick = () => loadConversation(r.conv_id);
      ul.appendChild(li);
      if (isNew && li.animate) {
        li.animate(
          [{ background: 'rgba(78,224,168,0.30)' }, { background: 'transparent' }],
          { duration: 2200, easing: 'ease-out' }
        );
      }
      __seenToolIds.add(id);
    });
    __toolBootstrapped = true;
  } catch (e) { console.warn(e); var lc2 = $('liveCount'); if (lc2) lc2.textContent = 'offline'; }
}

$('covSeedBtn').addEventListener('click', async () => {
  const topic = $('covTopicInput').value.trim();
  const count = Math.max(1, Math.min(parseInt($('covCountInput').value, 10) || 5, 10));
  if (!topic) { $('covSeedStatus').textContent = 'enter a topic first'; return; }
  const btn = $('covSeedBtn');
  const status = $('covSeedStatus');
  btn.disabled = true;
  const started = Date.now();
  status.style.color = 'var(--sun)';
  status.textContent = 'seeding "' + topic + '" × ' + count + ' …';
  const tick = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    status.textContent = 'seeding "' + topic + '" × ' + count + ' … ' + s + 's';
  }, 1000);
  try {
    const res = await fetch('/improve/coverage', {
      method: 'POST',
      headers: { ...auth.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, count })
    });
    const data = await res.json();
    clearInterval(tick);
    if (!res.ok) {
      status.style.color = 'var(--err)';
      status.textContent = 'failed: ' + (data.error || ('http ' + res.status));
    } else {
      const newCnt = data.count_cached_new ?? 0;
      const exec = data.count_executed ?? 0;
      const dur = Math.round((data.duration_ms || (Date.now() - started)) / 1000);
      status.style.color = 'var(--mint)';
      status.textContent = '✓ ' + exec + ' run · +' + newCnt + ' cached · ' + dur + 's';
      $('covTopicInput').value = '';
      refreshState();
    }
  } catch (err) {
    clearInterval(tick);
    status.style.color = 'var(--err)';
    status.textContent = 'error: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});
$('covTopicInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('covSeedBtn').click(); } });

$('connectBtn').addEventListener('click', async () => {
  const slug = $('connectSlug').value.trim().toLowerCase();
  if (!slug) return;
  $('connectStatus').textContent = 'requesting redirect for ' + slug + '…';
  try {
    const res = await fetch('/tools/connect', {
      method: 'POST',
      headers: { ...auth.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolkit: slug })
    });
    const data = await res.json();
    if (data.redirect_url) {
      $('connectStatus').innerHTML = 'opening OAuth for <b>' + escapeHtml(slug) + '</b> → <a href="' + escapeHtml(data.redirect_url) + '" target="_blank" rel="noopener">' + escapeHtml(slug) + ' link</a>';
      window.open(data.redirect_url, '_blank', 'noopener');
    } else {
      $('connectStatus').textContent = 'no redirect url returned: ' + (data.error || JSON.stringify(data).slice(0,200));
    }
  } catch (err) {
    $('connectStatus').textContent = 'error: ' + err.message;
  }
});
$('connectSlug').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('connectBtn').click(); } });

refreshState();
refreshRecentTools();
refreshBriefing();
refreshRecap();
refreshAutoCoverage();
setInterval(() => { refreshState(); }, 30000);
setInterval(() => { refreshRecentTools(); }, 10000);
setInterval(refreshBriefing, 5 * 60 * 1000);
setInterval(refreshRecap, 5 * 60 * 1000);
setInterval(refreshAutoCoverage, 60 * 1000);
</script>
</body>
</html>`
