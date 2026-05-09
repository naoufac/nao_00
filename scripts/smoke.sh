#!/usr/bin/env bash
# nao00 smoke test — one command, all the surfaces.
# Run after every deploy. Exit 0 = all green, 1 = at least one regression.
#
# Usage:
#   scripts/smoke.sh                                   # uses default URL + bearer
#   BASE=https://nao00.nchobah.com TOKEN=... scripts/smoke.sh
set -uo pipefail

BASE="${BASE:-https://nao00.nchobah.com}"
TOKEN="${TOKEN:-nao00-council-2026}"

green=$'\e[32m'; red=$'\e[31m'; dim=$'\e[2m'; bold=$'\e[1m'; reset=$'\e[0m'
pass=0; fail=0

# Run a check.
#   $1 name, $2 method, $3 path, $4 expected status, $5 optional grep pattern in body, $6 optional curl extra args
check() {
  local name="$1" method="$2" path="$3" want_status="$4" want_body="${5:-}" extra="${6:-}"
  local url="$BASE$path"
  local tmp; tmp=$(mktemp)
  local code
  code=$(eval curl -sS -o "$tmp" -w '%{http_code}' -X "$method" $extra "$url")
  local ok_status=0 ok_body=0
  [[ "$code" == "$want_status" ]] && ok_status=1
  if [[ -z "$want_body" ]]; then ok_body=1
  else grep -q -- "$want_body" "$tmp" && ok_body=1
  fi
  if (( ok_status && ok_body )); then
    printf "%s✓%s %-44s %s%s%s\n" "$green" "$reset" "$name" "$dim" "$code" "$reset"
    ((pass++))
  else
    printf "%s✗%s %-44s %sgot %s, wanted %s%s\n" "$red" "$reset" "$name" "$bold" "$code" "$want_status" "$reset"
    head -c 200 "$tmp" | sed 's/^/    /'
    echo
    ((fail++))
  fi
  rm -f "$tmp"
}

AUTH="-H 'Authorization: Bearer $TOKEN'"

echo "${bold}smoke ${BASE}${reset}"
echo

# Public surfaces
check "health"                    GET  /health             200 '"status":"alive"'
check "robots.txt"                GET  /robots.txt         200 'Sitemap'
check "sitemap.xml"               GET  /sitemap.xml        200 '<urlset'
check "healing page"              GET  /healing            200 'Healing Sounds'
check "voice page"                GET  /voice              200 '<title>'
check "remote page"               GET  /remote             200 ''
check "metrics/api-use"           GET  /metrics/api-use    200 ''
check "404 returns envelope"      GET  /no-such-route      404 '"ok":false'
check "/mcp GET (info)"           GET  /mcp                200 'MCP server'

# Auth required — these should 401 without token
check "council without auth"      POST /council            401 '' "-H 'content-type: application/json' -d '{\"input\":\"hi\"}'"
check "tools/list without auth"   GET  /tools/list         401 ''

# With auth
check "tools/list (with auth)"    GET  /tools/list         200 '"tools"'                                  "$AUTH"
check "tools/recent"              GET  /tools/recent       200 ''                                        "$AUTH"
check "dashboard/state"           GET  /dashboard/state    200 '"kpis"'                                  "$AUTH"
check "council/history"           GET  /council/history    200 ''                                        "$AUTH"
check "improve/skills"            GET  /improve/skills     200 ''                                        "$AUTH"
check "improve/insights"          GET  /improve/insights   200 ''                                        "$AUTH"
check "memory/profile"            GET  /memory/profile     200 ''                                        "$AUTH"
check "manus/stats"               GET  /manus/stats        200 ''                                        "$AUTH"
check "council probe (cheap)"     POST /council            200 '"probe":true' "$AUTH -H 'content-type: application/json' -d '{\"input\":\"alive?\"}'"
check "tools/connect rejects empty" POST /tools/connect    400 '"invalid_input"' "$AUTH -H 'content-type: application/json' -d '{}'"

# Observability — every response should carry X-Request-Id
rid=$(curl -sSI "$BASE/health" | grep -i '^x-request-id:' | tr -d '\r')
if [[ -n "$rid" ]]; then
  printf "%s✓%s %-44s %s%s%s\n" "$green" "$reset" "X-Request-Id header on /health" "$dim" "$rid" "$reset"
  ((pass++))
else
  printf "%s✗%s %-44s %smissing X-Request-Id%s\n" "$red" "$reset" "X-Request-Id header on /health" "$bold" "$reset"
  ((fail++))
fi

echo
total=$((pass + fail))
if (( fail == 0 )); then
  printf "${green}all green${reset} — ${bold}%d/%d${reset}\n" "$pass" "$total"
  exit 0
else
  printf "${red}regressions${reset} — ${bold}%d/%d failed${reset}\n" "$fail" "$total"
  exit 1
fi
