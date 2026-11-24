#!/usr/bin/env bash
set -euo pipefail

base_url="${YALL_API_BASE_URL:-http://127.0.0.1:${PORT:-8080}}"
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

assert_status() {
  local expected="$1"
  local method="$2"
  local path="$3"
  local body="${4:-}"
  local actual

  if [[ -n "$body" ]]; then
    actual="$(curl -sS -o "$response_file" -w '%{http_code}' \
      -X "$method" "$base_url$path" \
      -H 'Content-Type: application/json' \
      --data "$body")"
  else
    actual="$(curl -sS -o "$response_file" -w '%{http_code}' \
      -X "$method" "$base_url$path")"
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL $method $path: expected $expected, got $actual"
    cat "$response_file"
    exit 1
  fi
  echo "PASS $method $path returned $expected"
}

assert_status 200 GET /api/healthz

feed_status="$(curl -sS -o "$response_file" -w '%{http_code}' "$base_url/api/feed")"
if [[ "$feed_status" != "200" ]] || ! jq -e '
  (.items | type == "array") and
  ((.nextCursor == null) or (.nextCursor | type == "string"))
' "$response_file" >/dev/null; then
  echo "FAIL GET /api/feed returned an invalid response (HTTP $feed_status)"
  cat "$response_file"
  exit 1
fi
echo "PASS GET /api/feed returned a paginated database response"

assert_status 401 POST /api/storage/uploads/request-url \
  '{"name":"test.mp4","size":1000,"contentType":"video/mp4"}'
assert_status 401 POST /api/videos/publish '{}'
assert_status 400 GET '/api/feed?mode=invalid'

echo "YOU ALL API smoke checks passed."
