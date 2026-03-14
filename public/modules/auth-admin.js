export function isAdminViaLocalClaims({
  accessToken,
  currentUser,
  currentSession,
  hasAdminClaim,
} = {}) {
  const tokenAdmin = hasAdminClaim(accessToken);
  const currentUserAdmin = currentUser?.app_metadata?.is_admin === true || currentUser?.app_metadata?.is_admin === 'true';
  const sessionUserAdmin = currentSession?.user?.app_metadata?.is_admin === true || currentSession?.user?.app_metadata?.is_admin === 'true';
  return !!(tokenAdmin || currentUserAdmin || sessionUserAdmin);
}

export async function isAdminViaRest({
  supabaseUrl,
  supabaseKey,
  accessToken,
  currentUser,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = 10000,
} = {}) {
  if (!currentUser) return false;
  if (!accessToken) return false;

  const fetchFn = fetchImpl || globalThis.fetch?.bind(globalThis);
  if (!fetchFn) {
    throw new Error('fetch is not available in this browser environment');
  }

  const url = `${supabaseUrl}/rest/v1/rpc/is_admin`;
  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => {
    try { controller.abort(); } catch {}
  }, timeoutMs) : null;

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: '{}',
      signal: controller?.signal
    });

    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }

    if (!res.ok) {
      const message = (json && (json.message || json.error_description || json.error))
        ? (json.message || json.error_description || json.error)
        : (text || `${res.status} ${res.statusText}`);
      throw new Error(`is_admin REST failed: ${message}`);
    }

    return !!json;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
