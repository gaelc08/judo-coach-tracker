#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="ajbpzueanpeukozjhkiv"
REDIRECT_TO="https://jccattenom.cantarero.fr/"
EMAIL=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/invite-admin-user.sh --email user@example.com [--project-ref <ref>] [--redirect-to <url>]

Requirements:
  - WSL / bash
  - node
  - npx
  - Supabase CLI already authenticated: npx supabase login

Behavior:
  - creates/invites the auth user by e-mail
  - sets app_metadata.is_admin = true
  - Supabase sends the invitation e-mail so the user can set a password
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
    --redirect-to)
      REDIRECT_TO="${2:-}"
      shift 2
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

if ! command -v node >/dev/null 2>&1; then
  echo "node is required." >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required." >&2
  exit 1
fi

SERVICE_ROLE_KEY="$(npx supabase projects api-keys --project-ref "$PROJECT_REF" -o json | python3 -c "import json,sys; keys=json.load(sys.stdin); print(next((k.get('api_key','') for k in keys if k.get('id')=='service_role' or k.get('name')=='service_role'), ''))")"

if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Unable to read service_role key. Make sure the Supabase CLI is logged in." >&2
  exit 1
fi

export SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export REDIRECT_TO="$REDIRECT_TO"

node scripts/invite-admin-user.mjs --email "$EMAIL" --redirect-to "$REDIRECT_TO"
