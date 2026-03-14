export function __safeBase64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  const padLength = remainder === 0 ? 0 : 4 - remainder;
  const padded = normalized + '='.repeat(padLength);
  return window.atob(padded);
}

export function __maskEmail(email) {
  if (email == null) return null;
  const value = String(email).trim();
  if (!value) return null;
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return '[invalid-email]';

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const maskedLocal = local.length <= 2
    ? `${local[0]}${'*'.repeat(Math.max(local.length - 1, 0))}`
    : `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}`;

  return `${maskedLocal}@${domain}`;
}

export function __normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  return value || null;
}

export function __decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(__safeBase64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

export function __describeJwt(token) {
  const value = String(token || '').trim();
  if (!value) {
    return { present: false };
  }

  const payload = __decodeJwtPayload(value);
  const expMs = typeof payload?.exp === 'number' ? payload.exp * 1000 : null;

  return {
    present: true,
    length: value.length,
    segments: value.split('.').length,
    sub: payload?.sub || null,
    email: __maskEmail(payload?.email),
    appMetadataIsAdmin: payload?.app_metadata?.is_admin ?? null,
    role: payload?.role || null,
    aud: payload?.aud || null,
    iss: payload?.iss || null,
    exp: payload?.exp ?? null,
    expIso: expMs ? new Date(expMs).toISOString() : null,
    expired: expMs ? expMs <= Date.now() : null
  };
}

export function __hasAdminClaim(token) {
  const isAdmin = __decodeJwtPayload(token)?.app_metadata?.is_admin;
  return isAdmin === true || isAdmin === 'true';
}

export function __normalizeMonth(value) {
  const s = String(value ?? '').trim();
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : s;
}

export function __toAuditJson(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof File) {
    return {
      name: value.name || null,
      size: Number(value.size) || 0,
      type: value.type || null,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => __toAuditJson(item));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => typeof entry !== 'function' && entry !== undefined)
        .map(([key, entry]) => [key, __toAuditJson(entry)])
    );
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) return value;
  return String(value);
}

export function __escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
