// nao_00 v2 — single-page chat surface.
// Phase 1: text input → /council. Status light from /metrics/api-use.
// Phase 2: cache + memory badges, /memory/me + /history drawers.
// Phase 3: voice — MediaRecorder + AnalyserNode VAD → /talk → audio reply with interrupt-on-user-speak.
// Phase 4: image attach → /council/multimodal (Anthropic Vision via nao44).
// Naoclaw warm palette.

export const V2_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="theme-color" content="#c96442" />
<title>nao_00</title>
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" type="image/png" sizes="32x32" href="/v2/icons/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/v2/icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="nao_00" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="application-name" content="nao_00" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg: #faf9f5;
    --ink: #1a1a1a;
    --soft: #6b6b6b;
    --coral: #c96442;
    --coral-soft: #f4d8cc;
    --line: #ebe7df;
    --card: #fff;
    --nao44: #c96442;
    --mistral: #d4a017;
    --minouch: #6b8e6b;
    --green: #5fa55f;
    --yellow: #e0a040;
    --red: #d04040;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    background: var(--bg); color: var(--ink);
    display: flex; flex-direction: column; height: 100dvh;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid var(--line);
    background: var(--bg); position: sticky; top: 0; z-index: 10;
  }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; }
  .light {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--soft); box-shadow: 0 0 0 0 currentColor;
    transition: background .3s, box-shadow .3s;
    cursor: pointer;
  }
  .light.green  { background: var(--green);  color: var(--green);  box-shadow: 0 0 0 4px rgba(95,165,95,.18); }
  .light.yellow { background: var(--yellow); color: var(--yellow); box-shadow: 0 0 0 4px rgba(224,160,64,.18); }
  .light.red    { background: var(--red);    color: var(--red);    box-shadow: 0 0 0 4px rgba(208,64,64,.18); }
  .icons { display: flex; gap: 14px; align-items: center; }
  .icons button {
    background: transparent; border: 0; cursor: pointer;
    font-size: 18px; padding: 4px 6px; border-radius: 8px; color: var(--soft);
  }
  .icons button:hover { background: var(--coral-soft); color: var(--coral); }
  .install-pill {
    display: none; align-items: center; gap: 6px;
    background: var(--coral); color: #fff; border: 0; cursor: pointer;
    font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 999px;
    margin-right: 4px;
  }
  .install-pill.show { display: inline-flex; }
  .install-pill:hover { filter: brightness(1.05); }
  .offline-banner {
    display: none; padding: 6px 12px; background: #f3cccc; color: #8a2a2a;
    font-size: 12px; text-align: center; border-bottom: 1px solid #e8b3b3;
  }
  .offline-banner.show { display: block; }
  .update-toast {
    position: fixed; bottom: 96px; left: 50%; transform: translateX(-50%);
    background: var(--ink); color: #fff; font-size: 13px;
    padding: 10px 14px; border-radius: 999px; cursor: pointer;
    display: none; z-index: 30; box-shadow: 0 8px 24px rgba(0,0,0,.25);
  }
  .update-toast.show { display: block; }

  main {
    flex: 1; overflow-y: auto; padding: 16px 14px 110px;
    display: flex; flex-direction: column; gap: 14px;
  }
  .msg {
    display: flex; flex-direction: column; max-width: 86%;
    padding: 12px 14px; border-radius: 16px; line-height: 1.5;
    font-size: 15px; word-wrap: break-word;
  }
  .msg.user {
    align-self: flex-end; background: var(--coral); color: #fff;
    border-bottom-right-radius: 4px;
  }
  .msg.bot {
    align-self: flex-start; background: var(--card);
    border: 1px solid var(--line); border-bottom-left-radius: 4px;
  }
  .badges {
    display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px;
    font-size: 11px; color: var(--soft);
  }
  .badge {
    padding: 2px 8px; border-radius: 999px; background: var(--bg);
    border: 1px solid var(--line);
  }
  .badge.cache  { color: #5fa55f; border-color: #cfe5cf; }
  .badge.fresh  { color: var(--soft); }
  .badge.tool   { color: var(--coral); border-color: var(--coral-soft); }
  .badge.error  { color: var(--red);   border-color: #f3cccc; }
  .badge.vision { color: #6b8e6b; border-color: #cfe5cf; }

  .msg.user img.attached, .msg.bot img.attached {
    display: block; max-width: 100%; max-height: 220px;
    border-radius: 10px; margin-bottom: 8px; object-fit: cover;
  }
  .preview-strip {
    display: flex; gap: 8px; padding: 6px 8px 0;
  }
  .preview-chip {
    position: relative; width: 56px; height: 56px; border-radius: 10px;
    background-size: cover; background-position: center;
    border: 1px solid var(--line);
  }
  .preview-chip .x {
    position: absolute; top: -6px; right: -6px; width: 18px; height: 18px;
    border-radius: 50%; background: var(--ink); color: #fff; font-size: 11px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; line-height: 1;
  }

  .typing { display: flex; gap: 4px; padding: 6px 0; }
  .typing span {
    width: 6px; height: 6px; border-radius: 50%; background: var(--coral);
    animation: bounce 1.2s infinite; opacity: .5;
  }
  .typing span:nth-child(2) { animation-delay: .15s; }
  .typing span:nth-child(3) { animation-delay: .3s; }
  @keyframes bounce { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }

  .input-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 10px 12px max(10px, env(safe-area-inset-bottom));
    background: var(--bg); border-top: 1px solid var(--line);
  }
  .input-row {
    display: flex; align-items: center; gap: 8px;
    background: var(--card); border: 1px solid var(--line); border-radius: 22px;
    padding: 6px 8px;
  }
  .input-row textarea {
    flex: 1; resize: none; border: 0; outline: none;
    background: transparent; font: inherit; font-size: 15px;
    padding: 8px 4px; max-height: 120px; min-height: 24px;
    color: var(--ink);
  }
  .input-row button {
    border: 0; cursor: pointer; padding: 8px 10px;
    border-radius: 50%; background: transparent; font-size: 18px;
    color: var(--soft);
  }
  .input-row button.send { background: var(--coral); color: #fff; }
  .input-row button:disabled { opacity: .5; cursor: not-allowed; }
  .input-row button.mic-listening {
    background: var(--coral); color: #fff;
    box-shadow: 0 0 0 4px rgba(201,100,66,.18);
    animation: pulse 1.4s infinite;
  }
  .input-row button.mic-speaking {
    background: var(--minouch); color: #fff;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 4px rgba(201,100,66,.18); }
    50%      { box-shadow: 0 0 0 7px rgba(201,100,66,.32); }
  }
  .voice-hint {
    font-size: 11px; color: var(--soft); padding: 4px 12px 0;
    text-align: center; min-height: 14px;
  }

  /* Drawer */
  .drawer {
    position: fixed; inset: 0; background: rgba(0,0,0,.35);
    display: none; align-items: flex-end; z-index: 20;
  }
  .drawer.open { display: flex; }
  .drawer-card {
    background: var(--card); width: 100%; max-height: 80vh; overflow-y: auto;
    border-radius: 18px 18px 0 0; padding: 18px 20px 28px;
  }
  .drawer h3 { margin: 4px 0 12px; font-size: 16px; }
  .drawer .row { font-size: 13px; color: var(--soft); padding: 6px 0; border-bottom: 1px solid var(--line); }
  .drawer .row:last-child { border-bottom: 0; }
  .drawer .close { float: right; cursor: pointer; color: var(--soft); }
</style>
</head>
<body>
<header>
  <div class="brand">
    <span class="light" id="light" title="pillar metric"></span>
    <span>nao_00</span>
  </div>
  <div class="icons">
    <button id="installBtn" class="install-pill" title="add to home">⬇️ install</button>
    <button id="memBtn" title="what i remember about you">🧠</button>
    <button id="cacheBtn" title="recent answers">⚡</button>
    <button id="appsBtn" title="connected apps">🔌</button>
  </div>
</header>
<div id="offlineBanner" class="offline-banner">📡 offline — back online to chat</div>
<div id="updateToast" class="update-toast">fresh build — tap to reload</div>

<main id="thread"></main>

<div class="input-bar">
  <div class="preview-strip" id="previewStrip"></div>
  <div class="input-row">
    <button id="attachBtn" title="attach image">📎</button>
    <input id="fileInput" type="file" accept="image/*" style="display:none" />
    <textarea id="input" rows="1" placeholder="say anything…"></textarea>
    <button id="micBtn" title="hold or tap to speak">🎤</button>
    <button id="sendBtn" class="send" title="send">➤</button>
  </div>
  <div class="voice-hint" id="voiceHint"></div>
</div>
<audio id="player" playsinline></audio>

<div class="drawer" id="drawer">
  <div class="drawer-card">
    <span class="close" onclick="closeDrawer()">close ✕</span>
    <h3 id="drawerTitle">Memory</h3>
    <div id="drawerBody"></div>
  </div>
</div>

<script>
const BEARER = 'nao00-council-2026'; // public for v2 surface; council is read-only safe
const API = '';                       // same origin

const thread = document.getElementById('thread');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const light = document.getElementById('light');
const drawer = document.getElementById('drawer');
const drawerTitle = document.getElementById('drawerTitle');
const drawerBody = document.getElementById('drawerBody');

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
sendBtn.addEventListener('click', send);

// Image attach state — single image per turn (multi later)
const fileInput = document.getElementById('fileInput');
const previewStrip = document.getElementById('previewStrip');
let pendingImage = null; // { base64, mime, dataUrl }

document.getElementById('attachBtn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files && fileInput.files[0];
  fileInput.value = '';
  if (!f) return;
  try {
    pendingImage = await downscale(f, 1024, 0.85);
    renderPreview();
  } catch (err) {
    addMsg('bot', "couldn't read that image — " + err.message, [{ kind: 'error', text: '⚠ image' }]);
  }
});

function renderPreview() {
  previewStrip.innerHTML = '';
  if (!pendingImage) return;
  const chip = document.createElement('div');
  chip.className = 'preview-chip';
  chip.style.backgroundImage = 'url(' + pendingImage.dataUrl + ')';
  const x = document.createElement('div');
  x.className = 'x'; x.textContent = '×';
  x.addEventListener('click', () => { pendingImage = null; renderPreview(); });
  chip.appendChild(x);
  previewStrip.appendChild(chip);
}

function downscale(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({ base64, mime: 'image/jpeg', dataUrl });
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function addMsg(role, text, badges, imageDataUrl) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  if (imageDataUrl) {
    const img = document.createElement('img');
    img.className = 'attached'; img.src = imageDataUrl;
    div.appendChild(img);
  }
  if (text) {
    const t = document.createElement('div');
    t.textContent = text;
    div.appendChild(t);
  }
  if (badges && badges.length) {
    const b = document.createElement('div');
    b.className = 'badges';
    badges.forEach(x => {
      const span = document.createElement('span');
      span.className = 'badge ' + (x.kind || '');
      span.textContent = x.text;
      b.appendChild(span);
    });
    div.appendChild(b);
  }
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
  return div;
}

function addTyping() {
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
  return div;
}

async function send() {
  const text = input.value.trim();
  const img = pendingImage;
  if (!text && !img) return;
  addMsg('user', text, null, img ? img.dataUrl : null);
  input.value = ''; input.style.height = 'auto';
  pendingImage = null; renderPreview();
  sendBtn.disabled = true;
  const typingNode = addTyping();
  const t0 = Date.now();
  try {
    const url = img ? '/council/multimodal' : '/council';
    const body = img
      ? { input: text, image_base64: img.base64, image_mime: img.mime }
      : { input: text };
    const res = await fetch(API + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + BEARER },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    typingNode.remove();
    const ms = Date.now() - t0;
    const badges = [];
    const fromCache = (data.council_steps || []).some(s => s.advisor === 'cache');
    badges.push(fromCache
      ? { kind: 'cache', text: '⚡ from cache · ' + ms + 'ms' }
      : { kind: 'fresh', text: '✨ fresh · ' + ms + 'ms' });
    if (data.multimodal) badges.push({ kind: 'vision', text: '👁 vision' });
    const tool = (data.council_steps || []).find(s => s.advisor === 'tool');
    if (tool) {
      const m = String(tool.response).match(/tool=([A-Z_]+)/);
      badges.push({ kind: 'tool', text: '🔧 ' + (m ? m[1] : 'tool') });
    }
    addMsg('bot', data.final_output || '[no answer]', badges);
  } catch (err) {
    typingNode.remove();
    addMsg('bot', 'something broke — ' + err.message, [{ kind: 'error', text: '⚠ error' }]);
  } finally {
    sendBtn.disabled = false;
    refreshLight();
  }
}

async function refreshLight() {
  try {
    const res = await fetch(API + '/metrics/api-use', { headers: { 'Authorization': 'Bearer ' + BEARER }});
    const m = await res.json();
    light.classList.remove('green', 'yellow', 'red');
    light.classList.add(m.health || 'red');
    light.title = (m.health_note || '?') + ' · ' + (m.last_hour?.calls ?? 0) + ' calls/hr';
  } catch {}
}

light.addEventListener('click', async () => {
  drawerTitle.textContent = 'Pillar metric';
  drawerBody.innerHTML = '<div class="row">loading…</div>';
  drawer.classList.add('open');
  try {
    const res = await fetch(API + '/metrics/api-use', { headers: { 'Authorization': 'Bearer ' + BEARER }});
    const m = await res.json();
    const html = []
      .concat('<div class="row"><b>health</b>: ' + m.health + ' — ' + m.health_note + '</div>')
      .concat('<div class="row"><b>last hour</b>: ' + m.last_hour.calls + ' calls · ' + m.last_hour.tokens + ' tokens</div>')
      .concat('<div class="row"><b>last 24h</b>: ' + m.last_24h.calls + ' calls · ' + m.last_24h.tokens + ' tokens</div>')
      .concat('<div class="row"><b>cache hit ratio</b>: ' + (m.cache_hit_ratio*100).toFixed(1) + '%</div>')
      .concat(Object.entries(m.by_source).map(([k,v]) => '<div class="row"><b>' + k + '</b>: ' + v.calls + ' calls</div>').join(''));
    drawerBody.innerHTML = html.join('');
  } catch (e) { drawerBody.innerHTML = '<div class="row">failed: ' + e.message + '</div>'; }
});

document.getElementById('memBtn').addEventListener('click', async () => {
  drawerTitle.textContent = 'What we remember about you';
  drawerBody.innerHTML = '<div class="row">loading…</div>';
  drawer.classList.add('open');
  try {
    const res = await fetch(API + '/memory/me', { headers: { 'Authorization': 'Bearer ' + BEARER }});
    const m = await res.json();
    const ctx = m.context ? '<div class="row" style="white-space:pre-wrap;color:var(--ink)">' + (m.context).replace(/</g,'&lt;') + '</div>' : '<div class="row">no context yet</div>';
    const skills = (m.recent_skills || []).map(s => '<div class="row">⚡ <b>' + s.pattern + '</b> — used ' + s.used_count + 'x</div>').join('') || '<div class="row">no cached skills yet</div>';
    drawerBody.innerHTML = '<h4 style="margin:6px 0">context</h4>' + ctx + '<h4 style="margin:14px 0 6px">recent cached skills</h4>' + skills;
  } catch (e) { drawerBody.innerHTML = '<div class="row">failed: ' + e.message + '</div>'; }
});

document.getElementById('cacheBtn').addEventListener('click', async () => {
  drawerTitle.textContent = 'Recent answers';
  drawerBody.innerHTML = '<div class="row">loading…</div>';
  drawer.classList.add('open');
  try {
    const res = await fetch(API + '/history?limit=20', { headers: { 'Authorization': 'Bearer ' + BEARER }});
    const m = await res.json();
    drawerBody.innerHTML = (m.items || []).map(it => {
      const tag = it.from_cache ? '⚡' : '✨';
      return '<div class="row">' + tag + ' ' + (it.input || '').slice(0,80) + '</div>';
    }).join('') || '<div class="row">no history yet</div>';
  } catch (e) { drawerBody.innerHTML = '<div class="row">failed: ' + e.message + '</div>'; }
});

document.getElementById('appsBtn').addEventListener('click', () => {
  drawerTitle.textContent = 'Connected apps';
  drawerBody.innerHTML = '<div class="row">gmail · slack · github · notion · drive · calendar · sheets · linkedin · youtube · supabase + 950 more</div>';
  drawer.classList.add('open');
});

function closeDrawer() { drawer.classList.remove('open'); }
drawer.addEventListener('click', e => { if (e.target === drawer) closeDrawer(); });

// === Voice (Phase 3) ===========================================
// Tap mic → MediaRecorder + AnalyserNode VAD. 1.2s silence after speech detected = end-of-turn.
// POST audio to /talk, decode X-Transcript/X-Reply headers, play returned audio.
// While bot audio plays, keep mic open and detect user speech to interrupt and start a new turn.
const micBtn = document.getElementById('micBtn');
const voiceHint = document.getElementById('voiceHint');
const player = document.getElementById('player');

const VOICE = {
  state: 'idle',           // idle | listening | thinking | speaking
  stream: null,
  recorder: null,
  chunks: [],
  audioCtx: null,
  analyser: null,
  freqAnalyser: null,      // separate analyser for pitch (larger fft)
  rafId: null,
  speechStartedAt: 0,
  lastLoudAt: 0,
  silenceMs: 1200,
  energyThreshold: 0.025,  // RMS on [0,1] from 8-bit time-domain data
  minSpeechMs: 350,
  // Voice signal collection — paralinguistic context for nao44.
  energySamples: [],       // RMS values during loud frames
  pitchSamples: [],        // fundamental Hz estimates during loud frames
  // For interrupt-during-playback we run a parallel "monitor" loop on the same analyser
  monitorMode: false,
  micMime: ''
};

function setMicState(s, hint) {
  VOICE.state = s;
  micBtn.classList.remove('mic-listening', 'mic-speaking');
  if (s === 'listening' || s === 'monitoring') micBtn.classList.add('mic-listening');
  else if (s === 'speaking') micBtn.classList.add('mic-speaking');
  voiceHint.textContent = hint || '';
}

async function ensureMic() {
  if (VOICE.stream) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    throw new Error('voice not supported on this browser');
  }
  VOICE.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  VOICE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = VOICE.audioCtx.createMediaStreamSource(VOICE.stream);
  VOICE.analyser = VOICE.audioCtx.createAnalyser();
  VOICE.analyser.fftSize = 1024;
  src.connect(VOICE.analyser);
  // Wider FFT for pitch detection — needs ~2048 to resolve sub-100Hz bins.
  VOICE.freqAnalyser = VOICE.audioCtx.createAnalyser();
  VOICE.freqAnalyser.fftSize = 2048;
  VOICE.freqAnalyser.smoothingTimeConstant = 0.4;
  src.connect(VOICE.freqAnalyser);
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) VOICE.micMime = 'audio/webm;codecs=opus';
  else if (MediaRecorder.isTypeSupported('audio/mp4')) VOICE.micMime = 'audio/mp4';
  else VOICE.micMime = '';
}

function currentEnergy() {
  if (!VOICE.analyser) return 0;
  const buf = new Uint8Array(VOICE.analyser.fftSize);
  VOICE.analyser.getByteTimeDomainData(buf);
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / buf.length); // RMS in [0,1]
}

// Estimate fundamental frequency from the spectrum. We scan only 80–400 Hz
// (typical human speech F0 range) and return the bin with peak amplitude.
// This is a rough indicator — perfect pitch isn't the goal, it's a paralinguistic signal.
function currentPitchHz() {
  const a = VOICE.freqAnalyser;
  if (!a || !VOICE.audioCtx) return 0;
  const bins = a.frequencyBinCount;
  const buf = new Uint8Array(bins);
  a.getByteFrequencyData(buf);
  const sr = VOICE.audioCtx.sampleRate;
  const binHz = sr / a.fftSize;
  const lo = Math.max(1, Math.floor(80 / binHz));
  const hi = Math.min(bins - 1, Math.ceil(400 / binHz));
  let peakBin = 0, peakAmp = 0;
  for (let i = lo; i <= hi; i++) {
    if (buf[i] > peakAmp) { peakAmp = buf[i]; peakBin = i; }
  }
  if (peakAmp < 40) return 0; // too quiet to trust — silence/noise
  return Math.round(peakBin * binHz);
}

function startVadLoop() {
  cancelAnimationFrame(VOICE.rafId);
  VOICE.speechStartedAt = 0;
  VOICE.lastLoudAt = 0;
  VOICE.energySamples = [];
  VOICE.pitchSamples = [];
  const tick = () => {
    if (VOICE.state !== 'listening') return;
    const e = currentEnergy();
    const now = performance.now();
    if (e > VOICE.energyThreshold) {
      if (!VOICE.speechStartedAt) VOICE.speechStartedAt = now;
      VOICE.lastLoudAt = now;
      // Record paralinguistic samples only on loud frames — silence pitch is meaningless.
      VOICE.energySamples.push(e);
      const p = currentPitchHz();
      if (p > 0) VOICE.pitchSamples.push(p);
    } else if (VOICE.speechStartedAt) {
      const speechDur = VOICE.lastLoudAt - VOICE.speechStartedAt;
      const silenceDur = now - VOICE.lastLoudAt;
      if (speechDur > VOICE.minSpeechMs && silenceDur > VOICE.silenceMs) {
        endTurn();
        return;
      }
    }
    VOICE.rafId = requestAnimationFrame(tick);
  };
  VOICE.rafId = requestAnimationFrame(tick);
}

// Build the voice_signal envelope from recorded samples. Returns null if too few
// samples to be meaningful — better to skip than to send noise.
function buildVoiceSignal() {
  const es = VOICE.energySamples;
  const ps = VOICE.pitchSamples;
  if (es.length < 6) return null;
  const energyAvg = es.reduce((s, v) => s + v, 0) / es.length;
  const energyPeak = Math.max(...es);
  const pitchHz = ps.length >= 4
    ? Math.round(ps.slice().sort((a, b) => a - b)[Math.floor(ps.length / 2)]) // median
    : 0;
  const durationMs = VOICE.speechStartedAt && VOICE.lastLoudAt
    ? Math.round(VOICE.lastLoudAt - VOICE.speechStartedAt)
    : 0;
  return {
    energy: +energyAvg.toFixed(3),
    energy_peak: +energyPeak.toFixed(3),
    pitch_hz: pitchHz,
    duration_ms: durationMs
  };
}

function startInterruptMonitor() {
  // Watches mic energy while bot audio plays. If user speaks → pause audio, begin a new listening turn.
  cancelAnimationFrame(VOICE.rafId);
  let loudFor = 0;
  let lastT = performance.now();
  const tick = () => {
    if (VOICE.state !== 'speaking') return;
    const e = currentEnergy();
    const now = performance.now();
    const dt = now - lastT; lastT = now;
    if (e > VOICE.energyThreshold) loudFor += dt; else loudFor = Math.max(0, loudFor - dt);
    if (loudFor > 250) { // ~quarter-second of voice = real interrupt, not a cough
      try { player.pause(); } catch {}
      beginListeningTurn();
      return;
    }
    VOICE.rafId = requestAnimationFrame(tick);
  };
  VOICE.rafId = requestAnimationFrame(tick);
}

async function beginListeningTurn() {
  try { await ensureMic(); } catch (err) {
    setMicState('idle', '');
    addMsg('bot', "i can't hear you — " + err.message, [{ kind: 'error', text: '⚠ mic' }]);
    return;
  }
  if (VOICE.audioCtx && VOICE.audioCtx.state === 'suspended') {
    try { await VOICE.audioCtx.resume(); } catch {}
  }
  VOICE.chunks = [];
  const opts = VOICE.micMime ? { mimeType: VOICE.micMime } : undefined;
  VOICE.recorder = new MediaRecorder(VOICE.stream, opts);
  VOICE.recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) VOICE.chunks.push(e.data); };
  VOICE.recorder.onstop = sendVoiceTurn;
  VOICE.recorder.start();
  setMicState('listening', '🎙 listening — pause when done');
  startVadLoop();
}

function endTurn() {
  if (VOICE.state !== 'listening') return;
  cancelAnimationFrame(VOICE.rafId);
  setMicState('thinking', '🤔 thinking…');
  try { VOICE.recorder && VOICE.recorder.stop(); } catch {}
}

async function sendVoiceTurn() {
  const typingNode = addTyping();
  const t0 = Date.now();
  try {
    const blob = new Blob(VOICE.chunks, { type: VOICE.chunks[0]?.type || 'audio/webm' });
    if (blob.size < 1500) {
      typingNode.remove();
      setMicState('idle', "didn't catch that — tap 🎤 to retry");
      return;
    }
    const fd = new FormData();
    fd.append('audio', blob, 'turn.webm');
    const signal = buildVoiceSignal();
    if (signal) fd.append('voice_signal', JSON.stringify(signal));
    const res = await fetch(API + '/talk', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + BEARER },
      body: fd
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('talk failed (' + res.status + '): ' + t.slice(0, 160));
    }
    const transcript = decodeURIComponent(res.headers.get('X-Transcript') || '');
    const reply = decodeURIComponent(res.headers.get('X-Reply') || '');
    const filter = res.headers.get('X-Filter') || '';
    typingNode.remove();
    if (transcript) addMsg('user', transcript, [{ kind: 'fresh', text: '🎙 voice' }]);
    const ms = Date.now() - t0;
    const badges = [{ kind: 'fresh', text: '🔊 voice · ' + ms + 'ms' }];
    if (filter === 'noise') badges.push({ kind: 'error', text: '🤫 noise filtered' });
    addMsg('bot', reply || '[no reply]', badges);

    const audioBlob = await res.blob();
    const url = URL.createObjectURL(audioBlob);
    player.src = url;
    player.onplay = () => {
      setMicState('speaking', '🔊 speaking — talk to interrupt');
      startInterruptMonitor();
    };
    player.onended = () => {
      cancelAnimationFrame(VOICE.rafId);
      setMicState('idle', 'tap 🎤 to ask again');
    };
    player.onerror = () => {
      cancelAnimationFrame(VOICE.rafId);
      setMicState('idle', '');
    };
    try { await player.play(); } catch { setMicState('idle', ''); }
  } catch (err) {
    typingNode.remove();
    addMsg('bot', 'voice broke — ' + err.message, [{ kind: 'error', text: '⚠ voice' }]);
    setMicState('idle', '');
  } finally {
    refreshLight();
  }
}

micBtn.addEventListener('click', async () => {
  if (VOICE.state === 'idle') {
    await beginListeningTurn();
  } else if (VOICE.state === 'listening') {
    endTurn();
  } else if (VOICE.state === 'speaking') {
    try { player.pause(); } catch {}
    cancelAnimationFrame(VOICE.rafId);
    setMicState('idle', '');
  } else if (VOICE.state === 'thinking') {
    // ignore — request in flight
  }
});

// Initial bot greeting — warm, short, instantly readable.
addMsg('bot', "hey, i'm here 💛 type or tap 🎤 — i'll think it through and tell you straight.");
refreshLight();
setInterval(refreshLight, 30000);

// === PWA (Phase 5) =============================================
// Service worker registration — silent, then expose an install pill when the browser allows it,
// and a "fresh build" toast when a new SW is waiting. Online/offline indicator on top.
(function pwa() {
  const installBtn = document.getElementById('installBtn');
  const offlineBanner = document.getElementById('offlineBanner');
  const updateToast = document.getElementById('updateToast');

  function setOnline(online) {
    if (online) offlineBanner.classList.remove('show');
    else offlineBanner.classList.add('show');
  }
  setOnline(navigator.onLine);
  window.addEventListener('online',  () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        // If a new SW is found on this page load, surface an update toast once it's installed.
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              updateToast.classList.add('show');
              updateToast.onclick = () => {
                sw.postMessage('SKIP_WAITING');
                location.reload();
              };
            }
          });
        });
      } catch (err) {
        // Don't disrupt the page; just log.
        console.warn('SW register failed', err);
      }
    });

    // Some browsers will install/activate the SW silently. If a controller takes over after the
    // first navigation, reload once so the page is served by the SW (and offline mode works
    // immediately, not on the next visit).
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      // Subtle reload — only fire if the page was loaded *without* a controller (very first install).
      // Skip if the SW just took over after an update (we already prompted via updateToast).
    });
  }

  // Install prompt — Chrome/Edge/Android only. iOS users add to home screen via Share menu;
  // we don't show a synthetic prompt there because Apple gives no API.
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.add('show');
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    installBtn.classList.remove('show');
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {}
    deferredPrompt = null;
  });
  window.addEventListener('appinstalled', () => {
    installBtn.classList.remove('show');
    deferredPrompt = null;
  });

  // If we're already running standalone (installed), no prompt needed.
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    installBtn.classList.remove('show');
  }
})();
</script>
</body>
</html>`
