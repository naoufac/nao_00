#!/usr/bin/env bash
# Pull every Manus task + full transcript to ~/manus-export/.
# Manus's own "download all data" agent task fails (we saw it), but the
# REST API serves task list and per-task output fine. So we walk it ourselves.
set -euo pipefail

source ~/secrets/all-keys.env
OUT=~/manus-export
mkdir -p "$OUT/tasks"

cursor=""
page=0
total=0
while :; do
  page=$((page+1))
  url="https://api.manus.ai/v1/tasks?limit=100"
  [ -n "$cursor" ] && url="${url}&after=${cursor}"
  body=$(curl -fs -m 30 -H "API_KEY: $MANUS_API_KEY" "$url")
  count=$(echo "$body" | jq '.data | length')
  total=$((total+count))
  echo "page $page: $count tasks (total $total)"

  echo "$body" | jq -c '.data[]' | while read -r row; do
    id=$(echo "$row" | jq -r '.id')
    [ -f "$OUT/tasks/${id}.json" ] && continue
    full=$(curl -fs -m 30 -H "API_KEY: $MANUS_API_KEY" "https://api.manus.ai/v1/tasks/${id}")
    echo "$full" > "$OUT/tasks/${id}.json"
  done

  has_more=$(echo "$body" | jq -r '.has_more // false')
  [ "$has_more" != "true" ] && break
  cursor=$(echo "$body" | jq -r '.data[-1].id')
done

# Build a flat index for grep-ability
jq -s 'map({id, title:(.metadata.task_title//""), status, created_at, model})' \
  "$OUT/tasks/"*.json > "$OUT/index.json"

echo "done: $total tasks → $OUT/"
echo "size: $(du -sh $OUT | cut -f1)"
