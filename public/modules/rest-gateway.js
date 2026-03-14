export function createRestGateway({
  supabaseUrl,
  supabaseKey,
  getAccessToken,
  getCurrentUser,
  normalizeEmail,
  toAuditJson,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  logger = console,
} = {}) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('createRestGateway requires supabaseUrl and supabaseKey');
  }

  const fetchFn = fetchImpl || globalThis.fetch?.bind(globalThis);
  if (!fetchFn) {
    throw new Error('fetch is not available in this browser environment');
  }

  async function coachWriteViaRest(coachData, { editingId = null } = {}) {
    const accessToken = getAccessToken?.();
    if (!accessToken) {
      return {
        data: null,
        error: { message: 'No access token available (not logged in yet?)' },
        status: 0,
        statusText: 'NO_TOKEN'
      };
    }

    const isUpdate = !!editingId;
    const baseUrl = `${supabaseUrl}/rest/v1/users`;
    const url = isUpdate
      ? `${baseUrl}?id=eq.${encodeURIComponent(editingId)}`
      : baseUrl;

    const method = isUpdate ? 'PATCH' : 'POST';

    try {
      const res = await fetchFn(url, {
        method,
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(coachData)
      });

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const message = (json && (json.message || json.error_description || json.error))
          ? (json.message || json.error_description || json.error)
          : (text || `${res.status} ${res.statusText}`);
        return { data: null, error: { message }, status: res.status, statusText: res.statusText };
      }

      return { data: Array.isArray(json) ? json : (json ? [json] : []), error: null, status: res.status, statusText: res.statusText };
    } catch (e) {
      return { data: null, error: { message: e?.message || String(e) }, status: 0, statusText: 'FETCH_ERROR' };
    }
  }

  async function restSelect(table, { select = '*', filters = [], order = null, limit = null } = {}) {
    const accessToken = getAccessToken?.();
    if (!accessToken) {
      return {
        data: null,
        error: { message: 'No access token available' },
        status: 0,
        statusText: 'NO_TOKEN'
      };
    }

    const urlObj = new URL(`${supabaseUrl}/rest/v1/${table}`);
    urlObj.searchParams.set('select', select);
    for (const [col, op, value] of filters) {
      urlObj.searchParams.set(col, `${op}.${value}`);
    }
    if (order?.column) {
      const direction = String(order.direction || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
      urlObj.searchParams.set('order', `${order.column}.${direction}`);
    }
    if (Number.isFinite(limit) && Number(limit) > 0) {
      urlObj.searchParams.set('limit', String(limit));
    }
    const url = urlObj.toString();

    try {
      const res = await fetchFn(url, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`
        }
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }

      if (!res.ok) {
        const message = (json && (json.message || json.error_description || json.error))
          ? (json.message || json.error_description || json.error)
          : (text || `${res.status} ${res.statusText}`);
        return { data: null, error: { message }, status: res.status, statusText: res.statusText };
      }

      return { data: Array.isArray(json) ? json : (json ? [json] : []), error: null, status: res.status, statusText: res.statusText };
    } catch (e) {
      return { data: null, error: { message: e?.message || String(e) }, status: 0, statusText: 'FETCH_ERROR' };
    }
  }

  async function logAuditEvent(action, entityType, {
    entityId = null,
    targetUserId = null,
    targetEmail = null,
    metadata = {},
  } = {}) {
    const currentUser = getCurrentUser?.();
    const accessToken = getAccessToken?.();
    if (!currentUser || !accessToken) return null;

    try {
      const resp = await fetchFn(`${supabaseUrl}/rest/v1/rpc/log_audit_event`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({
          p_action: String(action || '').trim(),
          p_entity_type: String(entityType || '').trim(),
          p_entity_id: entityId == null ? null : String(entityId),
          p_target_user_id: targetUserId || null,
          p_target_email: normalizeEmail(targetEmail) || (targetEmail ? String(targetEmail) : null),
          p_metadata: toAuditJson(metadata || {}),
        })
      });
      if (!resp.ok) {
        throw new Error(`Failed to log audit event: ${resp.status}`);
      }
    } catch (e) {
      logger?.warn?.('DEBUG audit log failed:', action, e);
    }

    return null;
  }

  return {
    coachWriteViaRest,
    restSelect,
    logAuditEvent,
  };
}
