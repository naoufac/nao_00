#!/bin/bash
# Aggregates ccusage from each fleet host and POSTs to /metrics/fleet/usage.
# Runs from Anouf (already has SSH keys to fleet root accounts).
# Cron: hourly is enough — usage doesn't change minute-to-minute.

set -u
SECRETS="$HOME/secrets/all-keys.env"
AUTH_TOKEN="$(grep -E '^AUTH_TOKEN=' "$SECRETS" 2>/dev/null | cut -d= -f2-)"
[ -z "$AUTH_TOKEN" ] && AUTH_TOKEN="nao00-council-2026"

INGEST_URL="https://nao00.nchobah.com/metrics/fleet/usage"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

snapshot() {
  local label="$1" cmd="$2"
  bash -c "$cmd" 2>/dev/null \
    | jq --arg h "$label" '{($h): {tokens: .totals.totalTokens, cost_usd: .totals.totalCost}}' \
    > "$WORK_DIR/$label.json" \
    || echo "{\"$label\": {\"error\": \"snapshot failed\"}}" > "$WORK_DIR/$label.json"
}

snapshot anouf   'npx -y ccusage@latest daily --json'
snapshot nemo    'ssh -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=no root@162.243.119.47 npx -y ccusage@latest daily --json'
snapshot jasmine 'ssh -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=no root@192.241.251.184 npx -y ccusage@latest daily --json'
snapshot mayor   'ssh -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=no root@142.93.155.96 npx -y ccusage@latest daily --json'

# Merge all per-host blobs and compute totals.
PAYLOAD="$(jq -s '
  add
  | { captured_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
      method: "ssh+ccusage",
      hosts: . }
  | .fleet_totals = (
      [.hosts[] | select(.tokens != null)]
      | { tokens: (map(.tokens // 0) | add),
          cost_usd: (map(.cost_usd // 0) | add),
          hosts_seen: length,
          hosts_missing: (4 - length) }
    )
' "$WORK_DIR"/*.json)"

curl -sS -X POST "$INGEST_URL" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD" \
  -m 30
echo
