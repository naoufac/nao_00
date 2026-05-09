export const VOICE_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>nao00 — This and That</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; padding: 0; height: 100%; background: #050505; color: #f7f7f7;
    font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    padding: env(safe-area-inset-top) 24px env(safe-area-inset-bottom); box-sizing: border-box; }
  header { padding-top: 32px; font-size: 14px; letter-spacing: 0.18em; opacity: 0.55; text-transform: uppercase; }
  main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    width: 100%; gap: 28px; }
  #status { font-size: 15px; opacity: 0.7; min-height: 22px; text-align: center; padding: 0 16px; }
  #transcript { font-size: 17px; line-height: 1.5; opacity: 0.85; max-width: 28rem;
    text-align: center; min-height: 2.5em; padding: 0 8px; }
  #reply { font-size: 19px; line-height: 1.45; max-width: 28rem; text-align: center; padding: 0 8px;
    min-height: 2.5em; }
  #btn { width: 168px; height: 168px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.18);
    background: radial-gradient(circle at 35% 30%, #2a2a2a, #0c0c0c 70%); color: #f7f7f7;
    font-size: 17px; font-weight: 500; letter-spacing: 0.05em; cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.2s ease, background 0.2s ease;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6); -webkit-tap-highlight-color: transparent; }
  #btn:active { transform: scale(0.97); }
  #btn.recording { background: radial-gradient(circle at 35% 30%, #c43232, #5a0f0f 70%);
    box-shadow: 0 0 0 6px rgba(196,50,50,0.18), 0 12px 40px rgba(196,50,50,0.45); }
  #btn:disabled { opacity: 0.5; cursor: not-allowed; }
  footer { padding-bottom: 18px; font-size: 12px; opacity: 0.4; }
  audio { display: none; }
</style>
</head>
<body>
  <header>nao00 · this and that</header>
  <main>
    <div id="reply"></div>
    <div id="transcript"></div>
    <button id="btn" type="button">Tap to talk</button>
    <div id="status">Idle</div>
  </main>
  <footer>Hold-to-talk works too. Audio stays inside the council. <span style="opacity:.7">— this and that.</span></footer>
  <audio id="player" autoplay playsinline></audio>

<script>
(function () {
  const TOKEN = "__BEARER__";
  const btn = document.getElementById("btn");
  const status = document.getElementById("status");
  const transcriptEl = document.getElementById("transcript");
  const replyEl = document.getElementById("reply");
  const player = document.getElementById("player");

  let mediaRecorder = null;
  let chunks = [];
  let recording = false;
  let busy = false;

  const setStatus = (t) => { status.textContent = t; };

  async function ensureRecorder() {
    if (mediaRecorder) return mediaRecorder;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatus("Recording not supported on this browser");
      throw new Error("MediaRecorder unavailable");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : (MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "");
    mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = handleStop;
    return mediaRecorder;
  }

  async function startRecording() {
    if (busy || recording) return;
    try {
      const rec = await ensureRecorder();
      chunks = [];
      transcriptEl.textContent = "";
      replyEl.textContent = "";
      rec.start();
      recording = true;
      btn.classList.add("recording");
      btn.textContent = "Listening…";
      setStatus("Recording");
    } catch (err) {
      console.error(err);
      setStatus("Mic permission denied");
    }
  }

  function stopRecording() {
    if (!recording || !mediaRecorder) return;
    recording = false;
    btn.classList.remove("recording");
    btn.textContent = "Thinking…";
    setStatus("Sending to council");
    mediaRecorder.stop();
  }

  async function handleStop() {
    busy = true;
    btn.disabled = true;
    try {
      const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      const fd = new FormData();
      fd.append("audio", blob, "input.webm");
      const res = await fetch("/talk", {
        method: "POST",
        headers: { Authorization: "Bearer " + TOKEN },
        body: fd
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error("Council failed (" + res.status + "): " + errText.slice(0, 200));
      }
      const transcript = res.headers.get("X-Transcript") || "";
      const reply = res.headers.get("X-Reply") || "";
      if (transcript) transcriptEl.textContent = "“" + decodeURIComponent(transcript) + "”";
      if (reply) replyEl.textContent = decodeURIComponent(reply);

      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      player.src = url;
      try { await player.play(); } catch (_) {}
      setStatus("Done. Tap to ask again.");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Something broke");
    } finally {
      btn.disabled = false;
      btn.textContent = "Tap to talk";
      busy = false;
    }
  }

  // Tap toggle
  btn.addEventListener("click", () => {
    if (busy) return;
    if (recording) stopRecording(); else startRecording();
  });
  // Hold-to-talk on touch devices (in addition to tap toggle)
  let holdTimer = null;
  btn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    holdTimer = setTimeout(() => { if (!recording) startRecording(); }, 120);
  }, { passive: false });
  btn.addEventListener("touchend", () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (recording) stopRecording();
  });
})();
</script>
</body>
</html>`;
