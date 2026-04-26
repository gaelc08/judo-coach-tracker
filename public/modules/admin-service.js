// admin-service.js
// Admin role detection: REST check + local claims cache.
// Exports isCurrentUserAdminDB() and __isAdminForUi() (fast synchronous check).

import { isAdminViaLocalClaims, isAdminViaRest } from './auth-admin.js';
import { __hasAdminClaim } from './shared-utils.js';
import { supabaseUrl, supabaseKey } from './env.js';

// These are references to shared state from app-context - injected at init time
let _getCurrentUser = () => null;
let _getCurrentSession = () => null;
let _getCurrentAccessToken = () => null;

export function initAdminService({ getCurrentUser, getCurrentSession, getCurrentAccessToken }) {
  _getCurrentUser = getCurrentUser;
  _getCurrentSession = getCurrentSession;
  _getCurrentAccessToken = getCurrentAccessToken;
}

// ===== Admin cache =====
export let __adminCache = { userId: null, value: null, atMs: 0 };
export let __adminInFlight = null;

export function resetAdminCache(userId = null) {
  __adminCache = { userId, value: null, atMs: 0 };
  __adminInFlight = null;
}

// ===== Fast synchronous admin check (uses cache + local claims) =====
export function __isAdminForUi() {
  const currentUser = _getCurrentUser();
  const currentAccessToken = _getCurrentAccessToken();
  const currentSession = _getCurrentSession();

  if (!currentUser) return false;

  // Use cached value if fresh (5 min TTL)
  const ttlMs = 5 * 60 * 1000;
  if (
    __adminCache.userId === currentUser.id &&
    typeof __adminCache.value === 'boolean' &&
    (Date.now() - __adminCache.atMs) < ttlMs
  ) {
    return __adminCache.value;
  }

  // Fall back to local JWT claims
  return isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim,
  });
}

// ===== Async admin check (REST + local fallback) =====
export async function isCurrentUserAdminDB() {
  const currentUser = _getCurrentUser();
  const currentAccessToken = _getCurrentAccessToken();
  const currentSession = _getCurrentSession();

  if (!currentUser) {
    console.log('DEBUG no currentUser');
    return false;
  }

  const localAdmin = isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim,
  });

  const ttlMs = 5 * 60 * 1000;
  if (
    __adminCache.userId === currentUser.id &&
    typeof __adminCache.value === 'boolean' &&
    (Date.now() - __adminCache.atMs) < ttlMs
  ) {
    return __adminCache.value;
  }

  if (__adminInFlight) {
    try { return await __adminInFlight; } catch { /* fall through */ }
  }

  __adminInFlight = (async () => {
    let value = await isAdminViaRest({
      supabaseUrl,
      supabaseKey,
      accessToken: currentAccessToken,
      currentUser,
      fetchImpl: globalThis.fetch?.bind(globalThis),
    });
    if (!value && localAdmin) {
      console.warn('DEBUG is_admin REST returned false, using local admin claim fallback');
      value = true;
    }
    __adminCache = { userId: currentUser.id, value, atMs: Date.now() };
    return value;
  })();

  try {
    const value = await __adminInFlight;
    console.log('DEBUG is_admin (REST):', value);
    return value;
  } catch (e) {
    console.warn('DEBUG is_admin (REST) failed:', e);
    if (localAdmin) {
      console.warn('DEBUG is_admin using local admin claim fallback:', localAdmin);
      __adminCache = { userId: currentUser.id, value: true, atMs: Date.now() };
      return true;
    }
    if (__adminCache.userId === currentUser.id && typeof __adminCache.value === 'boolean') {
      console.warn('DEBUG is_admin using cached value:', __adminCache.value);
      return __adminCache.value;
    }
    return false;
  } finally {
    __adminInFlight = null;
  }
}
