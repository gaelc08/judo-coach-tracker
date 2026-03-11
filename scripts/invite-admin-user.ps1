param(
  [Parameter(Mandatory = $true)]
  [string]$Email,

  [string]$ProjectRef = 'ajbpzueanpeukozjhkiv',

  [string]$RedirectTo = 'https://jccattenom.cantarero.fr/'
)

$ErrorActionPreference = 'Stop'

function Get-ServiceRoleKey {
  $keysJson = npx supabase projects api-keys --project-ref $ProjectRef -o json
  if (-not $keysJson) {
    throw 'Unable to read Supabase project API keys. Make sure the CLI is logged in.'
  }

  $keys = $keysJson | ConvertFrom-Json
  $serviceRole = $keys | Where-Object { $_.id -eq 'service_role' -or $_.name -eq 'service_role' } | Select-Object -First 1

  if (-not $serviceRole -or -not $serviceRole.api_key) {
    throw 'Service role key not found for this Supabase project.'
  }

  return $serviceRole.api_key
}

$serviceRoleKey = Get-ServiceRoleKey
$env:SUPABASE_URL = "https://$ProjectRef.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey
$env:REDIRECT_TO = $RedirectTo

node .\scripts\invite-admin-user.mjs --email $Email --redirect-to $RedirectTo
