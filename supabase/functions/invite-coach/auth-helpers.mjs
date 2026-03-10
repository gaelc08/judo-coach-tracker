function decodeBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const padding = normalized.length % 4
  const padded = padding === 0 ? normalized : normalized + '='.repeat(4 - padding)

  if (typeof atob === 'function') {
    return atob(padded)
  }

  return Buffer.from(padded, 'base64').toString('utf8')
}

export function decodeJwtPayload(token) {
  const parts = String(token || '').split('.')
  if (parts.length < 2) return null

  try {
    return JSON.parse(decodeBase64Url(parts[1]))
  } catch {
    return null
  }
}

export function hasAdminClaim(token) {
  return isAdminValue(decodeJwtPayload(token)?.app_metadata?.is_admin)
}

export function hasAdminAccess(token, user) {
  return hasAdminClaim(token) || isAdminValue(user?.app_metadata?.is_admin)
}

function isAdminValue(value) {
  return value === true || value === 'true'
}
