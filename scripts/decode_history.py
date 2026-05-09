#!/usr/bin/env python3
"""decode_history.py — extract structure from every chat, memory, and doc.

Outputs to ~/nao00/DECODE/ a set of clean Markdown indexes:
  INDEX.md      — dashboard with NUMBERS
  KEYS.md       — every secret/key pattern found, REDACTED
  MEMORIES.md   — 82 memories categorized by type
  DECISIONS.md  — architectural decisions extracted from PLAN/STATE/audit docs
  DEMANDS.md    — Naoufal's orders/demands extracted from session transcripts
  BIASES.md     — bias corrections (feedback memories tagged bias)
  RECURRING.md  — keywords mentioned 5+ times (the system's vocabulary)
  SESSIONS.md   — 170-session table with first-message previews

Run: python3 ~/nao00/scripts/decode_history.py
Idempotent — overwrites DECODE/ each run.
"""
from __future__ import annotations
import json, os, re, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
MEMORY_DIR = HOME / ".claude/projects/-home-naoclaw/memory"
SESSION_DIR = HOME / ".claude/projects/-home-naoclaw"
NAO00 = HOME / "nao00"
DECODE = NAO00 / "DECODE"
DECODE.mkdir(parents=True, exist_ok=True)

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    fm = text[3:end].strip()
    body = text[end+4:].lstrip("\n")
    out = {}
    for line in fm.splitlines():
        if ":" not in line: continue
        k, v = line.split(":", 1)
        out[k.strip()] = v.strip()
    return out, body

def redact_key(value: str) -> str:
    """Show first 4 + last 4 chars only."""
    if len(value) <= 12:
        return "*" * len(value)
    return f"{value[:4]}…{value[-4:]} ({len(value)} chars)"

def short(s: str, n: int = 140) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[:n-1] + "…"

# ----------------------------------------------------------------------------
# 1. KEYS — find secret patterns across all sources, redacted
# ----------------------------------------------------------------------------

KEY_PATTERNS = [
    ("Anthropic", r"sk-ant-api03-[A-Za-z0-9_\-]{20,}"),
    ("OpenAI",    r"sk-proj-[A-Za-z0-9_\-]{20,}"),
    ("Google",    r"AIza[A-Za-z0-9_\-]{30,}"),
    ("Slack bot", r"xoxb-[A-Za-z0-9_\-]{20,}"),
    ("Slack user",r"xoxp-[A-Za-z0-9_\-]{20,}"),
    ("GitHub",    r"gh[pous]_[A-Za-z0-9]{30,}"),
    ("Composio MCP (ck_)",  r"ck_[A-Za-z0-9_\-]{15,}"),
    ("Composio REST (ak_)", r"ak_[A-Za-z0-9_\-]{15,}"),
    ("Stripe live",     r"sk_live_[A-Za-z0-9]{20,}"),
    ("Stripe test",     r"sk_test_[A-Za-z0-9]{20,}"),
    ("ElevenLabs",      r"sk_eleven_[A-Za-z0-9_\-]{20,}"),
    ("Together.ai",     r"tgp_v[0-9]_[A-Za-z0-9_\-]{30,}"),
    ("MiniMax (sk-cp-)", r"sk-cp-[A-Za-z0-9_\-]{20,}"),
    ("Mistral",         r"[A-Za-z0-9]{32}"),  # broad — last in priority
    ("Cloudflare token (40 hex)", r"\b[a-f0-9]{40}\b"),
]

def find_keys() -> dict[str, list[tuple[str, str]]]:
    """Return {provider: [(redacted, source_path), ...]}"""
    found = defaultdict(list)
    seen = set()  # (provider, redacted) — dedupe across sources
    sources: list[Path] = []

    # env files
    for p in [HOME/"secrets/all-keys.env"]:
        if p.exists():
            sources.append(p)
    # nao00 markdown docs
    for p in NAO00.glob("*.md"):
        sources.append(p)
    # NEEDS-LIST and audit
    for p in (NAO00/"audit").glob("*.md"):
        sources.append(p)
    # Memory files
    for p in MEMORY_DIR.glob("*.md"):
        sources.append(p)

    for src in sources:
        try:
            text = src.read_text(errors="ignore")
        except Exception:
            continue
        for provider, pat in KEY_PATTERNS:
            for m in re.findall(pat, text):
                # Skip if "Mistral" generic regex matches a hex string we already
                # captured under Cloudflare.
                if provider == "Mistral" and re.fullmatch(r"[a-f0-9]{32}", m):
                    continue
                key = (provider, redact_key(m))
                if key in seen:
                    continue
                seen.add(key)
                found[provider].append((redact_key(m), str(src.relative_to(HOME))))
    return found

# ----------------------------------------------------------------------------
# 2. MEMORIES — categorized index
# ----------------------------------------------------------------------------

def parse_memories() -> dict:
    mems = []
    for p in sorted(MEMORY_DIR.glob("*.md")):
        if p.name == "MEMORY.md": continue
        try:
            text = p.read_text(errors="ignore")
        except Exception:
            continue
        fm, body = parse_frontmatter(text)
        mems.append({
            "file": p.name,
            "name": fm.get("name", p.stem),
            "type": fm.get("type", "untyped"),
            "description": fm.get("description", ""),
            "body_chars": len(body),
            "is_bias": "bias" in (fm.get("name", "") + fm.get("description", "")).lower()
                      or "default" in fm.get("description", "").lower()
                      or "stop" in fm.get("name", "").lower(),
        })
    return mems

# ----------------------------------------------------------------------------
# 3. SESSIONS — parse jsonl headers, extract first user message + counts
# ----------------------------------------------------------------------------

def parse_sessions() -> list[dict]:
    sessions = []
    files = sorted(SESSION_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime)
    for fp in files:
        first_user_msg = ""
        user_turns = 0
        assistant_turns = 0
        tool_calls = 0
        first_ts = ""
        last_ts = ""
        try:
            with fp.open() as f:
                for line in f:
                    try:
                        d = json.loads(line)
                    except Exception:
                        continue
                    ts = d.get("timestamp") or ""
                    if ts and not first_ts: first_ts = ts
                    if ts: last_ts = ts
                    t = d.get("type")
                    if t == "user":
                        user_turns += 1
                        if not first_user_msg:
                            msg = d.get("message", {})
                            content = msg.get("content")
                            if isinstance(content, str):
                                first_user_msg = content
                            elif isinstance(content, list):
                                for c in content:
                                    if isinstance(c, dict) and c.get("type") == "text":
                                        first_user_msg = c.get("text", "")
                                        break
                                    if isinstance(c, str):
                                        first_user_msg = c
                                        break
                    elif t == "assistant":
                        assistant_turns += 1
                        msg = d.get("message", {})
                        content = msg.get("content")
                        if isinstance(content, list):
                            tool_calls += sum(1 for c in content
                                              if isinstance(c, dict) and c.get("type") == "tool_use")
        except Exception:
            continue
        sessions.append({
            "file": fp.name,
            "id": fp.stem,
            "first_ts": first_ts,
            "last_ts": last_ts,
            "size_bytes": fp.stat().st_size,
            "user_turns": user_turns,
            "assistant_turns": assistant_turns,
            "tool_calls": tool_calls,
            "first_user": short(first_user_msg, 220),
        })
    return sessions

# ----------------------------------------------------------------------------
# 4. DEMANDS — pull commanding/imperative phrases from user messages
# ----------------------------------------------------------------------------

DEMAND_VERBS = [
    "ship", "build", "make", "create", "wire", "deploy", "fix", "add",
    "remove", "delete", "rename", "move", "find", "show", "list", "decide",
    "research", "go", "stop", "start", "send", "post", "store", "save",
    "remember", "forget",
]
DEMAND_RE = re.compile(
    r"(?<![a-z])(?:please\s+)?(?:" + "|".join(DEMAND_VERBS) + r")\s+[a-z][^.!?\n]{4,140}",
    re.IGNORECASE,
)

def find_demands(sessions: list[dict]) -> list[tuple[str, str]]:
    demands: list[tuple[str, str]] = []
    seen = set()
    for fp in sorted(SESSION_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with fp.open() as f:
                for line in f:
                    try:
                        d = json.loads(line)
                    except Exception:
                        continue
                    if d.get("type") != "user": continue
                    msg = d.get("message", {})
                    content = msg.get("content")
                    text = ""
                    if isinstance(content, str):
                        text = content
                    elif isinstance(content, list):
                        for c in content:
                            if isinstance(c, dict) and c.get("type") == "text":
                                text += " " + c.get("text", "")
                            elif isinstance(c, str):
                                text += " " + c
                    text = text.strip()
                    if not text or len(text) < 8: continue
                    # Skip system-reminders and tool_use_id-only
                    if "<system-reminder>" in text: continue
                    if "<command-name>" in text: continue
                    for m in DEMAND_RE.findall(text):
                        m_short = short(m, 160).lower()
                        if m_short in seen: continue
                        seen.add(m_short)
                        demands.append((d.get("timestamp", ""), short(m, 200)))
        except Exception:
            continue
    demands.sort(reverse=True)
    return demands

# ----------------------------------------------------------------------------
# 5. RECURRING — keyword frequency across all docs + sessions
# ----------------------------------------------------------------------------

KEYWORDS = [
    "council", "orchestrator", "pillar", "gab44", "vehea", "coda",
    "slack", "gmail", "calendar", "github", "notion", "drive",
    "composio", "anthropic", "claude", "opus", "haiku", "sonnet",
    "gemini", "mistral", "minimax", "together", "llama", "nemotron",
    "manus", "postiz", "elevenlabs", "helio", "youtube", "tiktok",
    "cloudflare", "worker", "durable object", "sqlite", "kv", "d1",
    "voice", "healing", "dashboard", "remote control", "credits",
    "ridiculous", "multiplier", "this and that", "buddha",
    "bias", "block", "blocker", "needs", "ship", "deploy",
    "racing", "race lane", "synthesis", "tiered", "10-min", "1-hour",
]

def keyword_counts() -> Counter:
    c = Counter()
    sources = list(NAO00.rglob("*.md")) + list(MEMORY_DIR.glob("*.md"))
    for p in sources:
        if "node_modules" in str(p): continue
        try:
            text = p.read_text(errors="ignore").lower()
        except Exception:
            continue
        for kw in KEYWORDS:
            c[kw] += len(re.findall(r"(?<![a-z])" + re.escape(kw) + r"(?![a-z])", text))
    return c

# ----------------------------------------------------------------------------
# 6. DECISIONS — extract from architectural docs
# ----------------------------------------------------------------------------

DECISION_DOCS = [
    NAO00/"PLAN.md",
    NAO00/"V2_PLAN.md",
    NAO00/"PLAN-COUNCIL-OF-TEN.md",
    NAO00/"SLACK-PLAN.md",
    NAO00/"STATE-OF-NAO00.md",
    NAO00/"INVENTORY.md",
    NAO00/"COUNCIL_STRUCTURE.md",
    NAO00/"ARCHITECTURE.md",
]

DECISION_RE = re.compile(
    r"(?:^|\n)#{2,3}\s+(?P<title>[^\n]{6,120})|"
    r"\*\*(?:Decision|Verdict|Status|Next move)[^*]*\*\*[:\s]+(?P<line>[^\n]{6,200})",
)

def find_decisions() -> list[tuple[str, str, str]]:
    out: list[tuple[str, str, str]] = []
    for p in DECISION_DOCS:
        if not p.exists(): continue
        text = p.read_text(errors="ignore")
        for m in DECISION_RE.finditer(text):
            line = m.group("title") or m.group("line") or ""
            line = line.strip().strip("*").strip()
            if line:
                out.append((p.name, m.start(), short(line, 160)))
    return out

# ----------------------------------------------------------------------------
# 7. Write the indexes
# ----------------------------------------------------------------------------

def write_keys(found: dict[str, list[tuple[str, str]]]):
    lines = ["# KEYS — every secret pattern found, REDACTED",
             "",
             "_All values shown as first-4 + last-4 only. Generated by `scripts/decode_history.py`._",
             ""]
    total = sum(len(v) for v in found.values())
    lines.append(f"**Total unique key fragments: {total} across {len(found)} provider patterns.**")
    lines.append("")
    for provider in sorted(found.keys()):
        items = found[provider]
        lines.append(f"## {provider} ({len(items)})")
        lines.append("")
        for redacted, src in items[:50]:
            lines.append(f"- `{redacted}` — `{src}`")
        if len(items) > 50:
            lines.append(f"- _… and {len(items)-50} more_")
        lines.append("")
    (DECODE/"KEYS.md").write_text("\n".join(lines))

def write_memories(mems: list[dict]):
    lines = ["# MEMORIES — 82 indexed by type",
             "", "_From `~/.claude/projects/-home-naoclaw/memory/`._", ""]
    by_type: dict[str, list] = defaultdict(list)
    for m in mems: by_type[m["type"]].append(m)
    lines.append(f"**Total memories: {len(mems)}**")
    for t in sorted(by_type):
        lines.append(f"- {t}: {len(by_type[t])}")
    lines.append("")
    bias_count = sum(1 for m in mems if m["is_bias"])
    lines.append(f"**Bias-related memories: {bias_count}**")
    lines.append("")
    for t in ["feedback", "project", "reference", "untyped"]:
        if t not in by_type: continue
        lines.append(f"## {t} ({len(by_type[t])})")
        lines.append("")
        for m in sorted(by_type[t], key=lambda x: x["file"]):
            lines.append(f"- **[{m['name']}]({'../../.claude/projects/-home-naoclaw/memory/'+m['file']})** — {m['description'][:160]}")
        lines.append("")
    (DECODE/"MEMORIES.md").write_text("\n".join(lines))

def write_sessions(sessions: list[dict]):
    lines = ["# SESSIONS — 170 transcripts",
             "", "_Sorted oldest-first. Sourced from `.claude/projects/-home-naoclaw/*.jsonl`._", ""]
    total_user = sum(s["user_turns"] for s in sessions)
    total_assistant = sum(s["assistant_turns"] for s in sessions)
    total_tools = sum(s["tool_calls"] for s in sessions)
    total_bytes = sum(s["size_bytes"] for s in sessions)
    lines.append(f"**Sessions:** {len(sessions)}")
    lines.append(f"**User turns total:** {total_user}")
    lines.append(f"**Assistant turns total:** {total_assistant}")
    lines.append(f"**Tool calls total:** {total_tools}")
    lines.append(f"**Bytes total:** {total_bytes:,} ({total_bytes/1024/1024:.1f} MB)")
    if sessions:
        lines.append(f"**Span:** {sessions[0]['first_ts'][:10]} → {sessions[-1]['last_ts'][:10]}")
    lines.append("")
    lines.append("| # | first_ts | turns U/A | tools | first user message |")
    lines.append("|---|---|---|---|---|")
    for i, s in enumerate(sessions):
        ts = s["first_ts"][:16].replace("T", " ") if s["first_ts"] else "-"
        first = s["first_user"].replace("|", "\\|")[:140]
        lines.append(f"| {i+1} | {ts} | {s['user_turns']}/{s['assistant_turns']} | {s['tool_calls']} | {first} |")
    (DECODE/"SESSIONS.md").write_text("\n".join(lines))

def write_demands(demands: list[tuple[str, str]]):
    lines = ["# DEMANDS — orders/asks extracted from your user messages",
             "", "_Imperative phrases (build/ship/wire/decide/...) found in user turns. Newest first._", ""]
    lines.append(f"**Total unique demand-phrases: {len(demands)}**")
    lines.append("")
    for ts, line in demands[:300]:
        lines.append(f"- `{ts[:16]}` — {line}")
    if len(demands) > 300:
        lines.append(f"\n_… and {len(demands)-300} more (truncated for readability)._")
    (DECODE/"DEMANDS.md").write_text("\n".join(lines))

def write_biases(mems: list[dict]):
    lines = ["# BIASES — feedback corrections you gave me",
             "", "_All `feedback`-typed memories surface here; bias-related ones flagged._", ""]
    fb = [m for m in mems if m["type"] == "feedback"]
    biases = [m for m in mems if m["is_bias"]]
    lines.append(f"**Feedback memories total:** {len(fb)}")
    lines.append(f"**Explicit bias corrections:** {len(biases)}")
    lines.append("")
    if biases:
        lines.append("## 🚩 Explicit bias corrections")
        lines.append("")
        for m in sorted(biases, key=lambda x: x["file"]):
            lines.append(f"- **{m['name']}** — {m['description']}")
        lines.append("")
    lines.append("## All feedback memories")
    lines.append("")
    for m in sorted(fb, key=lambda x: x["file"]):
        lines.append(f"- **{m['name']}** — {m['description']}")
    (DECODE/"BIASES.md").write_text("\n".join(lines))

def write_decisions(decisions: list[tuple[str, int, str]]):
    lines = ["# DECISIONS — architectural + business",
             "", "_Headings + flagged decision lines from PLAN/STATE/INVENTORY docs._", ""]
    by_doc: dict[str, list] = defaultdict(list)
    for doc, _, line in decisions: by_doc[doc].append(line)
    lines.append(f"**Documents scanned:** {len(by_doc)}")
    lines.append(f"**Decision/heading lines found:** {len(decisions)}")
    lines.append("")
    for doc in sorted(by_doc):
        lines.append(f"## {doc} ({len(by_doc[doc])})")
        lines.append("")
        for line in by_doc[doc][:60]:
            lines.append(f"- {line}")
        if len(by_doc[doc]) > 60:
            lines.append(f"- _… and {len(by_doc[doc])-60} more headings/decisions_")
        lines.append("")
    (DECODE/"DECISIONS.md").write_text("\n".join(lines))

def write_recurring(counts: Counter):
    lines = ["# RECURRING — vocabulary frequency across all docs",
             "", "_Mentions of each tracked keyword across ~95 markdown files (memory + nao00 docs)._", ""]
    items = [(k, v) for k, v in counts.items() if v > 0]
    items.sort(key=lambda x: -x[1])
    lines.append(f"**Tracked keywords:** {len(KEYWORDS)} · **with ≥1 hit:** {len(items)}")
    lines.append("")
    lines.append("| keyword | mentions |")
    lines.append("|---|---|")
    for k, v in items:
        lines.append(f"| {k} | {v} |")
    (DECODE/"RECURRING.md").write_text("\n".join(lines))

def write_index(stats: dict):
    lines = [
        "# DECODE — perfect structure, dashboard with NUMBERS",
        "",
        f"_Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC by `scripts/decode_history.py`._",
        "",
        "Naoufal's order (verbatim): _\"make the perfect structure to go deep into all the chat fucking decode it understand it get all the infos from it everyt key every everydescision every demandes biyesde stuff repeated stuff document everything with numbers i inisist on numbers data data data we operate with data we trust that and clarity to seee.\"_",
        "",
        "---",
        "",
        "## 📊 Top-line numbers",
        "",
        f"- **Sessions:** {stats['sessions']}",
        f"- **User turns total:** {stats['user_turns']:,}",
        f"- **Assistant turns total:** {stats['assistant_turns']:,}",
        f"- **Tool calls total:** {stats['tool_calls']:,}",
        f"- **Session bytes:** {stats['session_bytes']/1024/1024:.1f} MB",
        f"- **Date span:** {stats['span']}",
        f"- **Memories indexed:** {stats['memories']} · feedback={stats['feedback']} · project={stats['project']} · reference={stats['reference']}",
        f"- **Bias corrections (explicit):** {stats['biases']}",
        f"- **Demand-phrases extracted:** {stats['demands']}",
        f"- **Decision lines extracted:** {stats['decisions']}",
        f"- **Key fragments found (redacted):** {stats['keys']}",
        f"- **Markdown docs scanned:** {stats['docs']}",
        "",
        "---",
        "",
        "## 📂 Index of artifacts",
        "",
        "| File | Contains | Numbers |",
        "|---|---|---|",
        f"| [KEYS.md](KEYS.md) | Every secret pattern found, redacted (4-char fingerprint only) | {stats['keys']} unique fragments across {stats['key_providers']} providers |",
        f"| [MEMORIES.md](MEMORIES.md) | 82 memories grouped by type, with descriptions | feedback={stats['feedback']} · project={stats['project']} · reference={stats['reference']} |",
        f"| [SESSIONS.md](SESSIONS.md) | 170-row table of every chat session w/ first message + turn counts | {stats['sessions']} rows |",
        f"| [DEMANDS.md](DEMANDS.md) | Imperative phrases extracted from user turns, newest first | {stats['demands']} phrases |",
        f"| [BIASES.md](BIASES.md) | Feedback memories + bias corrections | {stats['biases']} explicit, {stats['feedback']} feedback total |",
        f"| [DECISIONS.md](DECISIONS.md) | Architectural decisions from PLAN/STATE/INVENTORY | {stats['decisions']} lines |",
        f"| [RECURRING.md](RECURRING.md) | Keyword frequency table — the system's vocabulary | {stats['kw_with_hits']} of {len(KEYWORDS)} tracked keywords have hits |",
        "",
        "---",
        "",
        "## 🔁 Re-running",
        "",
        "```",
        "python3 ~/nao00/scripts/decode_history.py",
        "```",
        "",
        "Idempotent. Each run overwrites `~/nao00/DECODE/`. Safe to schedule via cron.",
        "",
        "## ⚠️ Caveats",
        "",
        "- The Mistral key regex (32-hex) is broad — false positives possible. Cross-check against `~/secrets/all-keys.env` before treating any redacted hex as a Mistral key.",
        "- Demands extraction uses imperative-verb pattern matching; some phrases may be quotes from documentation rather than your actual orders. Read with that in mind.",
        "- Decisions are pulled from heading/bold patterns in PLAN docs — not full prose. For deeper context, click through to the source doc.",
        "- Sessions count includes harness-internal events; user turns + assistant turns are the ones that matter.",
    ]
    (DECODE/"INDEX.md").write_text("\n".join(lines))

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def main():
    print("[decode] scanning…")
    keys = find_keys()
    keys_total = sum(len(v) for v in keys.values())
    print(f"[decode]   keys: {keys_total} fragments across {len(keys)} providers")

    mems = parse_memories()
    print(f"[decode]   memories: {len(mems)}")

    sessions = parse_sessions()
    print(f"[decode]   sessions: {len(sessions)}")

    demands = find_demands(sessions)
    print(f"[decode]   demands: {len(demands)}")

    decisions = find_decisions()
    print(f"[decode]   decisions: {len(decisions)}")

    counts = keyword_counts()
    kw_hits = sum(1 for v in counts.values() if v > 0)
    print(f"[decode]   recurring: {kw_hits} keywords with hits")

    print("[decode] writing artifacts…")
    write_keys(keys)
    write_memories(mems)
    write_sessions(sessions)
    write_demands(demands)
    write_biases(mems)
    write_decisions(decisions)
    write_recurring(counts)

    by_type: dict[str, int] = defaultdict(int)
    for m in mems: by_type[m["type"]] += 1
    biases = sum(1 for m in mems if m["is_bias"])
    total_user = sum(s["user_turns"] for s in sessions)
    total_assistant = sum(s["assistant_turns"] for s in sessions)
    total_tools = sum(s["tool_calls"] for s in sessions)
    total_bytes = sum(s["size_bytes"] for s in sessions)
    span = "—"
    if sessions:
        span = f"{sessions[0]['first_ts'][:10]} → {sessions[-1]['last_ts'][:10]}"

    docs_scanned = len(list(MEMORY_DIR.glob("*.md"))) + len(list(NAO00.rglob("*.md")))
    write_index({
        "sessions": len(sessions),
        "user_turns": total_user,
        "assistant_turns": total_assistant,
        "tool_calls": total_tools,
        "session_bytes": total_bytes,
        "span": span,
        "memories": len(mems),
        "feedback": by_type.get("feedback", 0),
        "project": by_type.get("project", 0),
        "reference": by_type.get("reference", 0),
        "biases": biases,
        "demands": len(demands),
        "decisions": len(decisions),
        "keys": keys_total,
        "key_providers": len(keys),
        "docs": docs_scanned,
        "kw_with_hits": kw_hits,
    })
    print("[decode] done. See ~/nao00/DECODE/INDEX.md")

if __name__ == "__main__":
    main()
