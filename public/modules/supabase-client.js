// supabase-client.js
// Initializes the Supabase client with debug fetch/locks wrappers.
// Exports the singleton `supabase` instance and debug helpers.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseKey, supabaseUrl } from './env.js';
import { createAuthNoHangLock, createAuthStorage, detectInviteFlowFromUrlHash } from './auth-runtime.js';

// ===== Network debug (Supabase requests) =====
// We pass a custom fetch into createClient so requests can't bypass our logs.
const __originalFetch = globalThis.fetch?.bind(globalThis);

export const __supabaseFetchDebugWrapped = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input?.url ?? '');
  const isSupabase = String(url).includes('.supabase.co');

  if (isSupabase) {
    console.log('DEBUG fetch ->', url, init);
  }

  if (!__originalFetch) {
    throw new Error('fetch is not available in this browser environment');
  }

  // Add a fetch-level timeout for Supabase calls so they never hang forever.
  let timeoutId;
  let controller;
  let finalInit = init;
  if (isSupabase && !init.signal && typeof AbortController !== 'undefined') {
    controller = new AbortController();
    finalInit = { ...init, signal: controller.signal };
    // Use a longer timeout for Edge Function calls (e.g. HelloAsso sync can take time)
    const fetchTimeoutMs = String(url).includes('/functions/v1/') ? 60000 : 15000;
    timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, fetchTimeoutMs);
  }

  try {
    const res = await __originalFetch(input, finalInit);
    if (isSupabase) {
      console.log('DEBUG fetch <-', url, res.status, res.statusText);
    }
    return res;
  } catch (e) {
    if (isSupabase) {
      console.error('DEBUG fetch error:', url, e);
    }
    throw e;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

// ===== Lock debug (Supabase auth/session can hang before fetch) =====
export const __installLocksShim = () => {
  try {
    const locks = globalThis.navigator?.locks;
    if (!locks || typeof locks.request !== 'function') {
      console.log('DEBUG locks: navigator.locks not available');
      return;
    }
    if (locks.__supabaseDebugWrapped) return;
    const originalRequest = locks.request.bind(locks);
    locks.__supabaseDebugWrapped = true;
    locks.request = (name, options, callback) => {
      const lockName = String(name);
      const startedAt = performance.now();
      let finalOptions = options;
      let finalCallback = callback;
      if (typeof options === 'function') {
        finalCallback = options;
        finalOptions = undefined;
      }
      console.log('DEBUG locks.request ->', lockName);
      const timeoutMs = 2500;
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          console.warn('DEBUG locks.request TIMEOUT (fail-open):', lockName);
          try {
            if (typeof finalCallback === 'function') {
              resolve(finalCallback());
            } else {
              resolve(undefined);
            }
          } catch (e) { reject(e); }
        }, timeoutMs);
      });
      const actualPromise = originalRequest(lockName, finalOptions, finalCallback);
      return Promise.race([actualPromise, timeoutPromise])
        .then((result) => {
          console.log('DEBUG locks.request <-', lockName, `${Math.round(performance.now() - startedAt)}ms`);
          return result;
        })
        .catch((e) => {
          console.error('DEBUG locks.request error:', lockName, e);
          throw e;
        });
    };
    console.log('DEBUG locks shim installed');
  } catch (e) {
    console.warn('DEBUG locks shim failed to install:', e);
  }
};

// Install shims immediately
__installLocksShim();

if (!window.__supabaseFetchDebugWrappedInstalled) {
  window.__supabaseFetchDebugWrappedInstalled = true;
  if (__originalFetch) {
    globalThis.fetch = __supabaseFetchDebugWrapped;
    window.fetch = __supabaseFetchDebugWrapped;
    console.log('DEBUG fetch wrapper installed (globalThis + window)');
    console.log('DEBUG fetch equality:', window.fetch === globalThis.fetch);
  } else {
    console.warn('DEBUG fetch not found; cannot instrument network');
  }
}

export async function debugSupabaseHealthFetch() {
  try {
    const url = `${supabaseUrl}/auth/v1/health`;
    console.log('DEBUG health fetch start:', url);
    const res = await globalThis.fetch(url, { headers: { apikey: supabaseKey } });
    const text = await res.text();
    console.log('DEBUG health fetch done:', res.status, text.slice(0, 200));
  } catch (e) {
    console.error('DEBUG health fetch error:', e);
  }
}

// ===== Auth storage override (avoid getSession/storage lock hangs) =====
const __authStorage = createAuthStorage();
const __authNoHangLock = createAuthNoHangLock({ logger: console });

// Detect invite flow from URL before createClient's detectSessionInUrl consumes the hash.
export let __inviteFlowActive = detectInviteFlowFromUrlHash(window.location.hash);
if (__inviteFlowActive) {
  console.log('DEBUG invite flow detected from URL hash');
}

export function setInviteFlowActive(v) { __inviteFlowActive = v; }

// ===== Supabase singleton =====
export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: __supabaseFetchDebugWrapped },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: __authStorage,
    lock: __authNoHangLock,
  },
});

window.supabase = supabase;
