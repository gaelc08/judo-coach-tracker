// public/modules/debug-shims.js
import { supabaseKey, supabaseUrl } from './env.js';

const __originalFetch = globalThis.fetch?.bind(globalThis);
const __supabaseFetchDebugWrapped = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input?.url ?? '');
  const isSupabase = String(url).includes('.supabase.co');
  if (isSupabase) console.log('DEBUG fetch ->', url, init);
  if (!__originalFetch) throw new Error('fetch unavailable');
  let timeoutId, controller, finalInit = init;
  if (isSupabase && !init.signal && typeof AbortController !== 'undefined') {
    controller = new AbortController();
    finalInit = { ...init, signal: controller.signal };
    timeoutId = setTimeout(() => { try { controller.abort(); } catch {} }, 15000);
  }
  try {
    const res = await __originalFetch(input, finalInit);
    if (isSupabase) console.log('DEBUG fetch <-', url, res.status, res.statusText);
    return res;
  } catch (e) {
    if (isSupabase) console.error('DEBUG fetch error:', url, e);
    throw e;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const __installLocksShim = () => {
  try {
    const locks = globalThis.navigator?.locks;
    if (!locks || typeof locks.request !== 'function') return;
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
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          console.warn('DEBUG locks.request TIMEOUT:', lockName);
          try {
            resolve(typeof finalCallback === 'function' ? finalCallback() : undefined);
          } catch (e) { reject(e); }
        }, 2500);
      });
      return Promise.race([originalRequest(lockName, finalOptions, finalCallback), timeoutPromise])
        .then(result => {
          console.log('DEBUG locks.request <-', lockName, `${Math.round(performance.now() - startedAt)}ms`);
          return result;
        })
        .catch(e => { console.error('DEBUG locks.request error:', lockName, e); throw e; });
    };
    console.log('DEBUG locks shim installed');
  } catch (e) {
    console.warn('DEBUG locks shim failed:', e);
  }
};

async function debugSupabaseHealthFetch() {
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

export { __supabaseFetchDebugWrapped, __installLocksShim, debugSupabaseHealthFetch };
