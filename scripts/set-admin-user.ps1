param(
  [Parameter(Mandatory = $true)]
  [string]$Email,

  [string]$ProjectRef = 'ajbpzueanpeukozjhkiv',

  [switch]$RemoveAdmin
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

function Get-AllUsers {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers
  )

  $users = @()
  $page = 1
  $perPage = 200

  while ($true) {
    $url = "$BaseUrl/auth/v1/admin/users?page=$page&per_page=$perPage"
    $response = Invoke-RestMethod -Method Get -Uri $url -Headers $Headers
    $batch = @($response.users)
    $users += $batch

    if ($batch.Count -lt $perPage) {
      break
    }

    $page += 1
  }

  return $users
}

$normalizedEmail = $Email.Trim().ToLowerInvariant()
$serviceRoleKey = Get-ServiceRoleKey
$baseUrl = "https://$ProjectRef.supabase.co"
$headers = @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
}

$users = Get-AllUsers -BaseUrl $baseUrl -Headers $headers
$user = $users | Where-Object { $_.email -and $_.email.ToLowerInvariant() -eq $normalizedEmail } | Select-Object -First 1

if (-not $user) {
  throw "User not found in Supabase Auth: $Email"
}

$appMetadata = @{}
if ($user.app_metadata) {
  $user.app_metadata.PSObject.Properties | ForEach-Object {
    $appMetadata[$_.Name] = $_.Value
  }
}

$appMetadata.is_admin = -not $RemoveAdmin.IsPresent

$body = @{
  app_metadata = $appMetadata
} | ConvertTo-Json -Depth 10

$updateHeaders = @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
}

$result = Invoke-RestMethod -Method Put -Uri "$baseUrl/auth/v1/admin/users/$($user.id)" -Headers $updateHeaders -Body $body

$status = if ($RemoveAdmin.IsPresent) { 'removed' } else { 'granted' }
Write-Host "Admin access $status for $($result.email) ($($result.id))."
Write-Host "app_metadata: $((@($result.app_metadata | ConvertTo-Json -Compress -Depth 10)) -join '')"
