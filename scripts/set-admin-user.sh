#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="ajbpzueanpeukozjhkiv"
REMOVE_ADMIN="false"
EMAIL=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/set-admin-user.sh --email user@example.com [--project-ref <ref>]
  bash scripts/set-admin-user.sh --email user@example.com --remove-admin [--project-ref <ref>]

Requirements:
  - WSL / bash
  - npx available
  - python3 available
  - Supabase CLI already authenticated: npx supabase login
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --email)
      EMAIL="${2:-}"
      shift 2
      ;;
    --project-ref)
      PROJECT_REF="${2:-}"
      shift 2
      ;;
    --remove-admin)
      REMOVE_ADMIN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$EMAIL" ]]; then
  echo "Missing required argument: --email" >&2
  usage
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required." >&2
  exit 1
fi

EMAIL="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')"
BASE_URL="https://${PROJECT_REF}.supabase.co"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

KEYS_JSON="$TMP_DIR/api-keys.json"
USER_JSON="$TMP_DIR/user.json"
BODY_JSON="$TMP_DIR/body.json"
UPDATED_JSON="$TMP_DIR/updated-user.json"

npx supabase projects api-keys --project-ref "$PROJECT_REF" -o json > "$KEYS_JSON"

SERVICE_ROLE_KEY="$({
  python3 - "$KEYS_JSON" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    keys = json.load(f)

for key in keys:
    if key.get('id') == 'service_role' or key.get('name') == 'service_role':
        print(key.get('api_key', ''))
        break
else:
    raise SystemExit(1)
PY
} || true)"

if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Unable to read service_role key. Make sure the Supabase CLI is logged in." >&2
  exit 1
fi

find_user_by_email() {
  local page=1
  local per_page=200

  while true; do
    local response
    response="$(curl -fsSL \
      -H "apikey: $SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      "$BASE_URL/auth/v1/admin/users?page=$page&per_page=$per_page")"

    printf '%s' "$response" > "$USER_JSON"

    local result
    result="$({
      python3 - "$USER_JSON" "$EMAIL" <<'PY'
import json
import sys

path, wanted = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    payload = json.load(f)

users = payload.get('users') or []
match = next((u for u in users if (u.get('email') or '').lower() == wanted.lower()), None)
if match:
    print(json.dumps(match))
else:
    print('')
PY
    } || true)"

    if [[ -n "$result" ]]; then
      printf '%s' "$result"
      return 0
    fi

    local count
    count="$({
      python3 - "$USER_JSON" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    payload = json.load(f)
print(len(payload.get('users') or []))
PY
    } || true)"

    if [[ "$count" -lt "$per_page" ]]; then
      return 1
    fi

    page=$((page + 1))
  done
}

USER_PAYLOAD="$(find_user_by_email || true)"
if [[ -z "$USER_PAYLOAD" ]]; then
  echo "User not found in Supabase Auth: $EMAIL" >&2
  exit 1
fi

printf '%s' "$USER_PAYLOAD" > "$USER_JSON"

python3 - "$USER_JSON" "$REMOVE_ADMIN" > "$BODY_JSON" <<'PY'
import json
import sys

path = sys.argv[1]
remove_admin = sys.argv[2].lower() == 'true'

with open(path, 'r', encoding='utf-8') as f:
    user = json.load(f)

app_metadata = dict(user.get('app_metadata') or {})
app_metadata['is_admin'] = not remove_admin

json.dump({'app_metadata': app_metadata}, sys.stdout)
PY

USER_ID="$({
  python3 - "$USER_JSON" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    user = json.load(f)
print(user['id'])
PY
} || true)"

curl -fsSL -X PUT \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data @"$BODY_JSON" \
  "$BASE_URL/auth/v1/admin/users/$USER_ID" > "$UPDATED_JSON"

STATUS="granted"
if [[ "$REMOVE_ADMIN" == "true" ]]; then
  STATUS="removed"
fi

UPDATED_EMAIL="$({
  python3 - "$UPDATED_JSON" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    user = json.load(f)
print(user.get('email', ''))
PY
} || true)"

UPDATED_METADATA="$({
  python3 - "$UPDATED_JSON" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    user = json.load(f)
print(json.dumps(user.get('app_metadata') or {}, separators=(',', ':')))
PY
} || true)"

echo "Admin access $STATUS for $UPDATED_EMAIL ($USER_ID)."
echo "app_metadata: $UPDATED_METADATA"
