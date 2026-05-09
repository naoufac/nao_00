#!/usr/bin/env bash
# tail-events.sh — poll /events/recent every 30s, print new events.
# Use case: terminal Anouf wants to know when something happens in Slack /
# the orchestrator / synthesis layer without staying in this session.
#
# Run: bash ~/nao00/scripts/tail-events.sh
# Stop: Ctrl-C
# Background mode (Claude Code Bash run_in_background): same command.
#
# Notes:
# - Uses ~/.events-cursor to track last-seen ts so restart resumes cleanly.
# - Wraps each event in a one-line printout: [ts] kind/source · text
# - Pure bash + curl + jq; no node, no python, no deps.

set -euo pipefail

AUTH=$(grep ^AUTH_TOKEN= ~/secrets/all-keys.env 2>/dev/null | cut -d= -f2- || echo "nao00-council-2026")
[[ -z "$AUTH" ]] && AUTH="nao00-council-2026"

CURSOR_FILE="${HOME}/.events-cursor"
URL_BASE="${EVENTS_BASE:-https://nao-00.nchobah.workers.dev}"
INTERVAL="${EVENTS_INTERVAL:-30}"

# Initialize cursor to "now" on first run so we don't dump 7 days of history.
if [[ ! -f "$CURSOR_FILE" ]]; then
  date +%s%3N > "$CURSOR_FILE"
fi

echo "[tail-events] polling ${URL_BASE}/events/recent every ${INTERVAL}s · cursor=$(cat $CURSOR_FILE)"
echo "[tail-events] events go to stdout; redirect to /tmp/events.log if running in background"

while :; do
  SINCE=$(cat "$CURSOR_FILE")
  RESPONSE=$(curl -fsS \
    -H "Authorization: Bearer $AUTH" \
    "${URL_BASE}/events/recent?since=${SINCE}&limit=50" \
    2>/dev/null || echo '{"events":[],"latest_ts":'"$SINCE"'}')

  # Pull events array, emit each as a line
  echo "$RESPONSE" | jq -r '.events | reverse | .[] | "[\(.ts | tostring | .[0:13])] \(.kind)/\(.source) · \(.text)"' 2>/dev/null || true

  # Advance cursor to latest_ts
  NEW_TS=$(echo "$RESPONSE" | jq -r '.latest_ts // 0' 2>/dev/null || echo "$SINCE")
  if [[ -n "$NEW_TS" && "$NEW_TS" != "0" && "$NEW_TS" != "null" ]]; then
    echo "$NEW_TS" > "$CURSOR_FILE"
  fi

  sleep "$INTERVAL"
done
