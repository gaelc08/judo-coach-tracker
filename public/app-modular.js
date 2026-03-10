// app-modular.js
// Uses Supabase JS SDK

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ----- Supabase config -----
const supabaseUrl = 'https://ajbpzueanpeukozjhkiv.supabase.co';
const supabaseKey = 'sb_publishable_efac8Xr0Gyfy1J6uFt_X1Q_Z5hB1pe9';

// Bump this string when deploying to confirm the browser loaded the latest JS.
const __BUILD_ID = '2026-03-10-invite-jwt-4';
console.log('DEBUG BUILD:', __BUILD_ID);

let __deferredInstallPrompt = null;

function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const swUrl = new URL('sw.js', window.location.href);
        const scopeUrl = new URL('./', window.location.href);
        const reg = await navigator.serviceWorker.register(swUrl.href, {
          scope: scopeUrl.pathname
        });
        console.log('DEBUG service worker registered:', reg.scope);
      } catch (e) {
        console.warn('DEBUG service worker registration failed:', e);
      }
    });
  }

  const installBtn = document.getElementById('installAppBtn');
  if (!installBtn) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    __deferredInstallPrompt = event;
    installBtn.style.display = 'inline-block';
  });

  window.addEventListener('appinstalled', () => {
    __deferredInstallPrompt = null;
    installBtn.style.display = 'none';
  });

  installBtn.addEventListener('click', async () => {
    if (!__deferredInstallPrompt) return;
    __deferredInstallPrompt.prompt();
    try {
      await __deferredInstallPrompt.userChoice;
    } catch {}
    __deferredInstallPrompt = null;
    installBtn.style.display = 'none';
  });
}

// ===== Network debug (Supabase requests) =====
// We pass a custom fetch into createClient so requests can't bypass our logs.
const __originalFetch = globalThis.fetch?.bind(globalThis);
const __supabaseFetchDebugWrapped = async (input, init = {}) => {
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
    timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 15000);
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
// Supabase Auth uses the Web Locks API in some browsers to coordinate storage access.
// If an extension or browser bug causes a lock promise to never resolve, all DB calls can hang.
const __installLocksShim = () => {
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
          } catch (e) {
            reject(e);
          }
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

async function debugSupabaseHealthFetch() {
  try {
    const url = `${supabaseUrl}/auth/v1/health`;
    console.log('DEBUG health fetch start:', url);
    const res = await globalThis.fetch(url, {
      headers: {
        apikey: supabaseKey
      }
    });
    const text = await res.text();
    console.log('DEBUG health fetch done:', res.status, text.slice(0, 200));
  } catch (e) {
    console.error('DEBUG health fetch error:', e);
  }
}

// ===== Auth storage override (avoid getSession/storage lock hangs) =====
// Prefer persistent localStorage so invite / password-reset sessions survive a
// reload, but fall back to in-memory storage if Web Storage is unavailable.
const __authStorage = (() => {
  const store = new Map();
  let persistentStorage = null;

  try {
    const probeKey = '__judo_coach_tracker_auth_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    persistentStorage = window.localStorage;
  } catch (_) {
    persistentStorage = null;
  }

  return {
    getItem: (key) => {
      try {
        const value = persistentStorage?.getItem(key);
        if (value != null) return value;
      } catch (_) {
        persistentStorage = null;
      }
      return store.has(key) ? store.get(key) : null;
    },
    setItem: (key, value) => {
      const normalized = String(value);
      try {
        persistentStorage?.setItem(key, normalized);
      } catch (_) {
        persistentStorage = null;
      }
      store.set(key, normalized);
    },
    removeItem: (key) => {
      try {
        persistentStorage?.removeItem(key);
      } catch (_) {
        persistentStorage = null;
      }
      store.delete(key);
    }
  };
})();

// Custom lock implementation to avoid Web Locks API hangs.
// Signature varies by gotrue-js version; we accept (name, fn) or (name, acquireTimeout, fn).
const __authNoHangLock = async (...args) => {
  const lockName = String(args?.[0] ?? '');
  const maybeFn = args[args.length - 1];
  const fn = (typeof maybeFn === 'function') ? maybeFn : null;
  const timeoutMs = (typeof args?.[1] === 'number' && args.length >= 3) ? args[1] : 2500;
  const startedAt = performance.now();

  if (!fn) {
    console.warn('DEBUG auth.lock called without fn', args);
    return undefined;
  }

  console.log('DEBUG auth.lock ->', lockName, `timeout=${timeoutMs}`);
  try {
    const fnPromise = Promise.resolve().then(() => fn());
    const timeoutToken = Symbol('auth.lock.timeout');
    const raced = await Promise.race([
      fnPromise,
      new Promise((resolve) => setTimeout(() => resolve(timeoutToken), timeoutMs))
    ]);

    if (raced === timeoutToken) {
      console.warn('DEBUG auth.lock TIMEOUT (returning undefined):', lockName);
      return undefined;
    }

    console.log('DEBUG auth.lock <-', lockName, `${Math.round(performance.now() - startedAt)}ms`);
    return raced;
  } catch (e) {
    console.error('DEBUG auth.lock error:', lockName, e);
    // Fail-open: let callers continue.
    return undefined;
  }
};

const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: __supabaseFetchDebugWrapped
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: __authStorage,
    lock: __authNoHangLock
  }
});
window.supabase = supabase;

// ===== In‑memory state =====
let coaches = [];
let timeData = {};
let currentCoach = null;
let frozenMonths = new Set(); // keys: "coach_id-YYYY-MM"
const __now = new Date();
let currentMonth = `${__now.getFullYear()}-${String(__now.getMonth() + 1).padStart(2, "0")}`;
let selectedDay = null;
let editMode = false;
let editingCoachId = null;
let currentUser = null;
let currentSession = null;
let currentAccessToken = null;
let __eventListenersSetup = false;

function __safeBase64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  const padLength = remainder === 0 ? 0 : 4 - remainder;
  const padded = normalized + '='.repeat(padLength);
  return window.atob(padded);
}

function __maskEmail(email) {
  const value = String(email || '').trim();
  if (!value) return null;
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return value;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const maskedLocal = local.length <= 2
    ? `${local[0]}${'*'.repeat(Math.max(local.length - 1, 0))}`
    : `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}`;

  return `${maskedLocal}@${domain}`;
}

function __decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(__safeBase64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

function __describeJwt(token) {
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
    role: payload?.role || null,
    aud: payload?.aud || null,
    iss: payload?.iss || null,
    exp: payload?.exp ?? null,
    expIso: expMs ? new Date(expMs).toISOString() : null,
    expired: expMs ? expMs <= Date.now() : null
  };
}

function __collectInviteDebug({ token = currentAccessToken, inviteEmail, ...extra } = {}) {
  return {
    buildId: __BUILD_ID,
    href: window.location.href,
    currentUserId: currentUser?.id || null,
    currentUserEmail: __maskEmail(currentUser?.email),
    currentSessionUserId: currentSession?.user?.id || null,
    currentSessionEmail: __maskEmail(currentSession?.user?.email),
    sessionExpiresAt: currentSession?.expires_at || null,
    jwt: __describeJwt(token),
    ...extra,
    inviteEmail: __maskEmail(inviteEmail)
  };
}

function __getInviteDebugReport() {
  return [
    '=== INVITE DEBUG REPORT START ===',
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      debug: window.__inviteDebugLast || null
    }, null, 2),
    '=== INVITE DEBUG REPORT END ==='
  ].join('\n');
}

async function __copyInviteDebugReport() {
  const report = __getInviteDebugReport();
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(report);
  }
  return report;
}

window.__getInviteDebugReport = __getInviteDebugReport;
window.__copyInviteDebugReport = __copyInviteDebugReport;

function __normalizeMonth(value) {
  const s = String(value ?? '').trim();
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : s;
}

async function __coachWriteViaRest(coachData, { editingId = null } = {}) {
  if (!currentAccessToken) {
    return {
      data: null,
      error: { message: 'No access token available (not logged in yet?)' },
      status: 0,
      statusText: 'NO_TOKEN'
    };
  }

  const isUpdate = !!editingId;
  const baseUrl = `${supabaseUrl}/rest/v1/coaches`;
  const url = isUpdate
    ? `${baseUrl}?id=eq.${encodeURIComponent(editingId)}`
    : baseUrl;

  const method = isUpdate ? 'PATCH' : 'POST';

  try {
    const res = await globalThis.fetch(url, {
      method,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${currentAccessToken}`,
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

async function __restSelect(table, { select = '*', filters = [] } = {}) {
  if (!currentAccessToken) {
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
  const url = urlObj.toString();

  try {
    const res = await globalThis.fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${currentAccessToken}`
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

// ===== Holiday data (dynamically fetched, with static fallback) =====

// Static fallback data per year (used if API calls fail)
const __publicHolidaysFallback = {
  2025: {
    "2025-01-01": "Jour de l'An",
    "2025-04-21": "Lundi de Pâques",
    "2025-05-01": "Fête du Travail",
    "2025-05-08": "Victoire 1945",
    "2025-05-29": "Ascension",
    "2025-06-09": "Lundi de Pentecôte",
    "2025-07-14": "Fête Nationale",
    "2025-08-15": "Assomption",
    "2025-11-01": "Toussaint",
    "2025-11-11": "Armistice",
    "2025-12-25": "Noël"
  },
  2026: {
    "2026-01-01": "Jour de l'An",
    "2026-04-06": "Lundi de Pâques",
    "2026-05-01": "Fête du Travail",
    "2026-05-08": "Victoire 1945",
    "2026-05-14": "Ascension",
    "2026-05-25": "Lundi de Pentecôte",
    "2026-07-14": "Fête Nationale",
    "2026-08-15": "Assomption",
    "2026-11-01": "Toussaint",
    "2026-11-11": "Armistice",
    "2026-12-25": "Noël"
  },
  2027: {
    "2027-01-01": "Jour de l'An",
    "2027-03-29": "Lundi de Pâques",
    "2027-05-01": "Fête du Travail",
    "2027-05-08": "Victoire 1945",
    "2027-05-06": "Ascension",
    "2027-05-17": "Lundi de Pentecôte",
    "2027-07-14": "Fête Nationale",
    "2027-08-15": "Assomption",
    "2027-11-01": "Toussaint",
    "2027-11-11": "Armistice",
    "2027-12-25": "Noël"
  }
};

const __schoolHolidaysFallback = {
  2025: [
    { start: "2025-02-22", end: "2025-03-09", name: "Vacances d'Hiver" },
    { start: "2025-04-19", end: "2025-05-04", name: "Vacances de Printemps" },
    { start: "2025-07-05", end: "2025-09-01", name: "Vacances d'Été" },
    { start: "2025-10-18", end: "2025-11-03", name: "Vacances de Toussaint" },
    { start: "2025-12-20", end: "2026-01-05", name: "Vacances de Noël" }
  ],
  2026: [
    { start: "2026-02-14", end: "2026-03-02", name: "Vacances d'Hiver" },
    { start: "2026-04-11", end: "2026-04-27", name: "Vacances de Printemps" },
    { start: "2026-07-04", end: "2026-08-31", name: "Vacances d'Été" },
    { start: "2026-10-17", end: "2026-11-02", name: "Vacances de Toussaint" },
    { start: "2026-12-19", end: "2027-01-04", name: "Vacances de Noël" }
  ],
  2027: [
    { start: "2027-02-13", end: "2027-03-01", name: "Vacances d'Hiver" },
    { start: "2027-04-10", end: "2027-04-26", name: "Vacances de Printemps" },
    { start: "2027-07-03", end: "2027-08-31", name: "Vacances d'Été" },
    { start: "2027-10-23", end: "2027-11-08", name: "Vacances de Toussaint" },
    { start: "2027-12-18", end: "2028-01-03", name: "Vacances de Noël" }
  ]
};

// Runtime caches (in-memory per session, keyed by year)
const __publicHolidaysCache = {};
const __schoolHolidaysCache = {};

async function fetchPublicHolidays(year) {
  if (__publicHolidaysCache[year]) return __publicHolidaysCache[year];
  try {
    const res = await globalThis.fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/FR`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const map = {};
    for (const h of data) {
      map[h.date] = h.localName || h.name;
    }
    __publicHolidaysCache[year] = map;
    return map;
  } catch (e) {
    console.warn(`fetchPublicHolidays(${year}) failed, using fallback:`, e.message);
    const fallback = __publicHolidaysFallback[year] || {};
    __publicHolidaysCache[year] = fallback;
    return fallback;
  }
}

async function fetchSchoolHolidays(year) {
  if (__schoolHolidaysCache[year]) return __schoolHolidaysCache[year];
  try {
    // French government open data API for school holidays (zone B = Grand Est region)
    const startDate = `${year - 1}-09-01`;
    const endDate = `${year + 1}-08-31`;
    const params = new URLSearchParams({
      where: `location="Zone B" AND start_date>="${startDate}" AND end_date<="${endDate}"`,
      limit: "50",
      timezone: "Europe/Paris"
    });
    const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?${params}`;
    const res = await globalThis.fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const holidays = (json.results || []).map(r => ({
      start: r.start_date ? r.start_date.slice(0, 10) : "",
      end: r.end_date ? r.end_date.slice(0, 10) : "",
      name: r.description || r.population || "Vacances scolaires"
    })).filter(h => h.start && h.end);
    if (holidays.length === 0) throw new Error("API returned empty holidays, using fallback data");
    __schoolHolidaysCache[year] = holidays;
    return holidays;
  } catch (e) {
    console.warn(`fetchSchoolHolidays(${year}) failed, using fallback:`, e.message);
    const fallback = __schoolHolidaysFallback[year] || __schoolHolidaysFallback[2026];
    __schoolHolidaysCache[year] = fallback;
    return fallback;
  }
}

// Current year's holiday data (populated when calendar renders)
let publicHolidays = {};
let schoolHolidays = [];

// ===== Init =====
async function debugSession() {
  try {
    const timeoutMs = 3000;
    const res = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`getSession timed out after ${timeoutMs}ms (startup)`)), timeoutMs))
    ]);
    console.log('DEBUG Supabase session:', res);
  } catch (e) {
    console.error('DEBUG getSession failed:', e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log('DEBUG DOMContentLoaded');
  setupPWA();
  setupAuthListeners();
  debugSession();
  // Low-noise probe that should always produce a network request if fetch works.
  // Helps distinguish "Supabase hangs before fetch" from "network blocked".
  debugSupabaseHealthFetch();
});

// ===== Auth =====
let __adminCache = { userId: null, value: null, atMs: 0 };
let __adminInFlight = null;

async function __isAdminViaRest() {
  if (!currentUser) return false;
  if (!currentAccessToken) return false;

  const url = `${supabaseUrl}/rest/v1/rpc/is_admin`;
  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timeoutMs = 10000;
  const timeoutId = controller ? setTimeout(() => {
    try { controller.abort(); } catch {}
  }, timeoutMs) : null;

  try {
    const res = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${currentAccessToken}`,
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

async function isCurrentUserAdminDB() {
  if (!currentUser) {
    console.log('DEBUG no currentUser');
    return false;
  }

  const ttlMs = 5 * 60 * 1000;
  if (__adminCache.userId === currentUser.id && typeof __adminCache.value === 'boolean' && (Date.now() - __adminCache.atMs) < ttlMs) {
    return __adminCache.value;
  }

  if (__adminInFlight) {
    try {
      return await __adminInFlight;
    } catch {
      // fall through
    }
  }

  __adminInFlight = (async () => {
    const value = await __isAdminViaRest();
    __adminCache = { userId: currentUser.id, value, atMs: Date.now() };
    return value;
  })();

  try {
    const value = await __adminInFlight;
    console.log('DEBUG is_admin (REST):', value);
    return value;
  } catch (e) {
    console.warn('DEBUG is_admin (REST) failed:', e);
    if (__adminCache.userId === currentUser.id && typeof __adminCache.value === 'boolean') {
      console.warn('DEBUG is_admin using cached value:', __adminCache.value);
      return __adminCache.value;
    }
    return false;
  } finally {
    __adminInFlight = null;
  }
}


function setupAuthListeners() {
  console.log('DEBUG setupAuthListeners called');

  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const registerBtn = document.getElementById("registerBtn");
  const loginBtn = document.getElementById("loginBtn");
  const resetPasswordBtn = document.getElementById("resetPasswordBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const statusSpan = document.getElementById("authStatus");
  const appContainer = document.getElementById("appContainer");

  console.log('DEBUG auth elements:', {
    emailInput,
    passwordInput,
    registerBtn,
    loginBtn,
    resetPasswordBtn,
    logoutBtn,
    statusSpan,
    appContainer
  });

  if (!loginBtn || !logoutBtn) {
    console.error('DEBUG loginBtn or logoutBtn not found in DOM');
  }

  registerBtn.addEventListener("click", async () => {
    console.log('DEBUG register click');
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      alert("Enter email and password");
      return;
    }
    try {
      const { data, error } = await supabase.auth.signUp({ email, password: pass });
      console.log('DEBUG signUp result:', { data, error });
      if (error) throw error;
      statusSpan.textContent = "Account created & logged in.";
    } catch (e) {
      console.error('DEBUG register error:', e);
      alert(e.message);
    }
  });

  loginBtn.addEventListener("click", async () => {
    console.log('DEBUG login click');
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) {
      alert("Enter email and password");
      return;
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      console.log('DEBUG signInWithPassword result:', { data, error });
      if (error) throw error;
    } catch (e) {
      console.error('DEBUG login error:', e);
      alert(e.message);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    console.log('DEBUG logout click');
    logoutBtn.disabled = true;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) {
        console.error('Logout error:', error);
        alert('Logout failed: ' + error.message);
        return;
      }
      currentUser = null;
      document.getElementById('appContainer').style.display = 'none';
      document.getElementById('authContainer').style.display = 'flex';
      console.log('DEBUG manual UI reset');
    } catch (e) {
      console.error('Logout exception:', e);
      alert('Logout exception: ' + e.message);
    } finally {
      logoutBtn.disabled = false;
    }
  });



  // Auth state change (single handler)

  resetPasswordBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) {
      alert("Enter your email address first.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      alert("Password reset email sent. Check your inbox.");
    } catch (e) {
      alert(e.message);
    }
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('DEBUG onAuthStateChange:', event, session);
    currentSession = session || null;
    currentAccessToken = session?.access_token || null;
    window.__lastSession = currentSession;
    if (currentAccessToken) {
      console.log('DEBUG access token present:', String(currentAccessToken).slice(0, 12) + '...');
      console.log('DEBUG access token details:', __describeJwt(currentAccessToken));
    } else {
      console.log('DEBUG access token missing');
    }

    // Handle password recovery: show reset form instead of the main app
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById("passwordResetModal").classList.add("active");
      // Use onclick assignment (not addEventListener) so re-fires replace the handler cleanly.
      document.getElementById("updatePasswordBtn").onclick = async () => {
        const newPass = document.getElementById("newPasswordInput").value;
        const confirmPass = document.getElementById("confirmPasswordInput").value;
        if (!newPass) { alert("Veuillez saisir un nouveau mot de passe."); return; }
        if (newPass.length < 8) { alert("Le mot de passe doit contenir au moins 8 caractères."); return; }
        if (newPass !== confirmPass) { alert("Les mots de passe ne correspondent pas."); return; }
        const { error } = await supabase.auth.updateUser({ password: newPass });
        if (error) {
          alert(error.message);
        } else {
          document.getElementById("newPasswordInput").value = "";
          document.getElementById("confirmPasswordInput").value = "";
          document.getElementById("passwordResetModal").classList.remove("active");
          alert("Mot de passe mis à jour avec succès. Veuillez vous reconnecter.");
          await supabase.auth.signOut();
        }
      };
      return;
    }

    const user = session?.user;
    const select = document.getElementById("coachSelect");

    if (user) {
      currentUser = user;
      statusSpan.textContent = `Connecté : ${user.email}`;
      // Hide auth container, show app
      document.getElementById("authContainer").style.display = "none";
      document.getElementById("appContainer").style.display = "block";

      // --- VERIFICATION DU ROLE ---
      const isAdmin = await isCurrentUserAdminDB();
      if (isAdmin) {
        document.getElementById("addCoachBtn").style.display = "inline-block";
        document.getElementById("editCoachBtn").style.display = "inline-block";
        document.getElementById("freezeBtn").style.display = "inline-block";
        document.getElementById("importGroup").style.display = "flex";
      } else {
        document.getElementById("addCoachBtn").style.display = "none";
        document.getElementById("editCoachBtn").style.display = "none";
        document.getElementById("freezeBtn").style.display = "none";
        document.getElementById("importGroup").style.display = "none";
      }

      // Coach selector UX: coaches should not have to pick themselves.
      if (select) {
        select.disabled = !isAdmin;
      }

      // Reload data, but don't wipe the UI first; if a background auth lock stalls,
      // we prefer to keep the last known data visible.
      const prevCoaches = coaches;
      const prevTimeData = timeData;
      const prevCurrentCoach = currentCoach;

      try {
        await loadAllDataFromSupabase({ isAdminOverride: isAdmin });
        // Ensure select is populated after load.
        if (select) loadCoaches();
        if (!isAdmin && coaches.length > 0) {
          currentCoach = coaches[0];
        }
        if (currentCoach && select) select.value = currentCoach.id;
      } catch (e) {
        console.error("Failed to load data:", e);
        // Keep previous state on failure
        coaches = (coaches && coaches.length) ? coaches : (prevCoaches || []);
        timeData = (timeData && Object.keys(timeData).length) ? timeData : (prevTimeData || {});
        currentCoach = currentCoach || prevCurrentCoach || null;
        if (select) loadCoaches();
      }

      if (!__eventListenersSetup) {
        setupEventListeners();
        __eventListenersSetup = true;
      }
      try {
        updateCalendar();
        updateSummary();
      } catch (e) {
        console.error("Failed to update UI:", e);
      }
    } else {
      currentUser = null;
      currentSession = null;
      currentAccessToken = null;
      coaches = [];
      timeData = {};
      currentCoach = null;
      if (select) select.innerHTML = '<option value="">-- Sélectionner --</option>';
      statusSpan.textContent = "Non connecté.";
      // Show auth container, hide app
      document.getElementById("authContainer").style.display = "flex";
      document.getElementById("appContainer").style.display = "none";
    }
  });
}

// ===== Data loading =====
async function loadAllDataFromSupabase({ isAdminOverride } = {}) {
  const isAdmin = (typeof isAdminOverride === 'boolean') ? isAdminOverride : await isCurrentUserAdminDB();
  console.log('DEBUG loadAllDataFromSupabase start, isAdmin=', isAdmin);
  if (!currentUser) return;
  if (!currentAccessToken) throw new Error('No access token; cannot load data');
  
  // Coaches
  coaches = [];
  if (isAdmin) {
    const res = await __restSelect('coaches');
    if (res.error) throw new Error(res.error.message);
    coaches = (res.data || []).map(d => ({ id: d.id, ...d }));
  } else {
    // For coach, prefer owner_uid = current user id (RLS-friendly)
    let res = await __restSelect('coaches', { filters: [['owner_uid', 'eq', currentUser.id]] });
    if (res.error) throw new Error(res.error.message);
    let rows = res.data || [];

    // If no profile found by owner_uid, try to claim one by email.
    // This handles the invitation flow: admin pre-created a profile (owner_uid = null)
    // and the coach has now logged in for the first time after accepting the invite.
    if (rows.length === 0 && currentUser.email) {
      const claimRes = await globalThis.fetch(`${supabaseUrl}/rest/v1/rpc/claim_coach_profile`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${currentAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      if (claimRes.ok) {
        // Successfully claimed (or no unclaimed profile found — either way, re-query by owner_uid)
        res = await __restSelect('coaches', { filters: [['owner_uid', 'eq', currentUser.id]] });
        if (res.error) throw new Error(res.error.message);
        rows = res.data || [];
      } else {
        // Log the failure but do not block the user; they simply won't have a linked profile yet.
        const text = await claimRes.text().catch(() => '');
        console.warn('DEBUG claim_coach_profile failed:', claimRes.status, text);
      }
    }

    coaches = rows.map(d => ({ id: d.id, ...d }));
  }
  loadCoaches();

  // Time data
  timeData = {};
  let timeSnap = [];

  if (isAdmin) {
    const res = await __restSelect('time_data');
    if (res.error) throw new Error(res.error.message);
    timeSnap = res.data || [];
  } else {
    // For coach, load timeData for their coach
    if (coaches.length > 0) {
      const coachId = coaches[0].id;
      const res = await __restSelect('time_data', { filters: [['coach_id', 'eq', coachId]] });
      if (res.error) throw new Error(res.error.message);
      timeSnap = res.data || [];
    } else {
      timeSnap = [];
    }
  }

  (timeSnap || []).forEach((data) => {
    const key = `${data.coach_id}-${data.date}`;
    timeData[key] = {
      hours: data.hours || 0,
      competition: !!data.competition,
      km: data.km || 0,
      description: data.description || "",
      departurePlace: data.departure_place || "",
      arrivalPlace: data.arrival_place || "",
      peage: data.peage || 0,
      justificationUrl: data.justification_url || "",
      coachId: data.coach_id || null,
      ownerUid: data.owner_uid || null,
      ownerEmail: data.owner_email || null,
      id: data.id
    };
  });


  // Filtre local par coach sélectionné (utile surtout pour l'admin)
  if (currentCoach) {
    Object.keys(timeData).forEach((key) => {
      if (timeData[key].coachId !== currentCoach.id) {
        delete timeData[key];
      }
    });
  }

  // Load frozen timesheets
  frozenMonths = new Set();
  const frozenRes = await __restSelect('frozen_timesheets');
  if (!frozenRes.error) {
    (frozenRes.data || []).forEach(r => frozenMonths.add(`${r.coach_id}-${r.month}`));
  }
}


// ===== Freeze helpers =====
function isCurrentMonthFrozen() {
  if (!currentCoach || !currentMonth) return false;
  return frozenMonths.has(`${currentCoach.id}-${__normalizeMonth(currentMonth)}`);
}

function updateFreezeUI() {
  const frozen = isCurrentMonthFrozen();
  const banner = document.getElementById("frozenBanner");
  const btn = document.getElementById("freezeBtn");
  if (banner) banner.style.display = frozen ? "block" : "none";
  if (btn) {
    if (frozen) {
      btn.textContent = "🔓 Dégeler la fiche";
      btn.classList.add("frozen");
    } else {
      btn.textContent = "🔒 Geler la fiche";
      btn.classList.remove("frozen");
    }
  }
}

async function toggleFreezeMonth() {
  if (!currentCoach || !currentMonth) {
    alert("Veuillez sélectionner un entraîneur et un mois.");
    return;
  }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) {
    alert("Seul l'admin peut geler ou dégeler une fiche.");
    return;
  }

  if (!currentAccessToken) {
    alert("Session invalide. Reconnectez-vous puis réessayez.");
    return;
  }

  const normalizedMonth = __normalizeMonth(currentMonth);
  const frozen = isCurrentMonthFrozen();
  const key = `${currentCoach.id}-${normalizedMonth}`;
  if (frozen) {
    const urlObj = new URL(`${supabaseUrl}/rest/v1/frozen_timesheets`);
    urlObj.searchParams.set('coach_id', `eq.${currentCoach.id}`);
    urlObj.searchParams.set('month', `eq.${normalizedMonth}`);
    const res = await globalThis.fetch(urlObj.toString(), {
      method: 'DELETE',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${currentAccessToken}`
      }
    });
    if (!res.ok) {
      const text = await res.text();
      alert("Erreur lors du dégel : " + (text || `${res.status} ${res.statusText}`));
      return;
    }
    frozenMonths.delete(key);
  } else {
    const res = await globalThis.fetch(`${supabaseUrl}/rest/v1/frozen_timesheets`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${currentAccessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates'
      },
      body: JSON.stringify({ coach_id: currentCoach.id, month: normalizedMonth, frozen_by: currentUser?.email || null })
    });
    if (!res.ok) {
      const text = await res.text();
      const lower = String(text || '').toLowerCase();
      if (lower.includes('check constraint') || lower.includes('23514')) {
        alert("Erreur lors du gel : la colonne month de frozen_timesheets refuse la valeur. Appliquez la correction SQL du format YYYY-MM dans la migration frozen_timesheets.");
      } else {
        alert("Erreur lors du gel : " + (text || `${res.status} ${res.statusText}`));
      }
      return;
    }
    frozenMonths.add(key);
  }
  currentMonth = normalizedMonth;
  updateFreezeUI();
}

// ===== Event listeners =====
function setupEventListeners() {
  // Set month picker to the current month
  document.getElementById("monthSelect").value = currentMonth;

  // App-level logout button (in the header)
  const logoutBtnApp = document.getElementById("logoutBtnApp");
  if (logoutBtnApp) {
    logoutBtnApp.addEventListener("click", async () => {
      logoutBtnApp.disabled = true;
      try {
        const { error } = await supabase.auth.signOut({ scope: "global" });
        if (error) {
          alert("Déconnexion échouée : " + error.message);
          return;
        }
        currentUser = null;
        document.getElementById("appContainer").style.display = "none";
        document.getElementById("authContainer").style.display = "flex";
      } catch (e) {
        alert("Erreur de déconnexion : " + e.message);
      } finally {
        logoutBtnApp.disabled = false;
      }
    });
  }

  document.getElementById("addCoachBtn").onclick = () => {
    editMode = false;
    editingCoachId = null;
    clearCoachForm();
    document.getElementById("coachOwnerUid").value = "";
    document.getElementById("inviteCoach").style.display = "none";
    document.getElementById("coachModal").classList.add("active");
  };

  document.getElementById("editCoachBtn").onclick = () => {
    if (!currentCoach) {
      alert("Select a coach first.");
      return;
    }
    editMode = true;
    editingCoachId = currentCoach.id;

    document.getElementById("coachName").value = currentCoach.name;
    document.getElementById("coachFirstName").value = currentCoach.first_name || "";
    document.getElementById("coachEmail").value = currentCoach.email || "";
    document.getElementById("coachAddress").value = currentCoach.address || "";
    document.getElementById("coachVehicle").value = currentCoach.vehicle || "";
    document.getElementById("coachFiscalPower").value = currentCoach.fiscal_power || "";
    document.getElementById("coachRate").value = currentCoach.hourly_rate;
    document.getElementById("dailyAllowance").value = currentCoach.daily_allowance;
    document.getElementById("kmRate").value = currentCoach.km_rate;
    document.getElementById("coachOwnerUid").value = currentCoach.owner_uid || "";
    // Show the invite button when the coach profile has an email (re-send invite at any time)
    const inviteBtn = document.getElementById("inviteCoach");
    inviteBtn.style.display = currentCoach.email ? "inline-block" : "none";
    document.getElementById("coachModal").classList.add("active");
    document.getElementById("deleteCoach").style.display = "inline-block";
  };

  document.getElementById("saveCoach").onclick = saveCoach;
  document.getElementById("inviteCoach").onclick = async () => {
    const email = document.getElementById("coachEmail").value.trim();
    if (!email) {
      alert("Veuillez renseigner l'adresse e-mail de l'entraîneur.");
      return;
    }
    await inviteCoach(email);
  };
  document.getElementById("cancelCoach").onclick = () => {
    document.getElementById("coachModal").classList.remove("active");
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
    document.getElementById("deleteCoach").style.display = "none";
    document.getElementById("inviteCoach").style.display = "none";
  };

  document.getElementById("deleteCoach").onclick = deleteCoach;

  document.getElementById("coachModal").onclick = (e) => {
    if (e.target.id === "coachModal") {
      document.getElementById("coachModal").classList.remove("active");
      clearCoachForm();
      editMode = false;
      editingCoachId = null;
      document.getElementById("inviteCoach").style.display = "none";
    }
  };

  document.getElementById("dayModal").onclick = (e) => {
    if (e.target.id === "dayModal") {
      document.getElementById("dayModal").classList.remove("active");
    }
  };

  document.getElementById("helpBtn").onclick = () => {
    document.getElementById("helpModal").classList.add("active");
  };

  document.getElementById("closeHelp").onclick = () => {
    document.getElementById("helpModal").classList.remove("active");
  };

  document.getElementById("helpModal").onclick = (e) => {
    if (e.target.id === "helpModal") {
      document.getElementById("helpModal").classList.remove("active");
    }
  };

  document.getElementById("coachSelect").onchange = (e) => {
    currentCoach = coaches.find((c) => c.id === e.target.value) || null;
    updateCalendar();
    updateSummary();
  };

  document.getElementById("monthSelect").onchange = (e) => {
    currentMonth = __normalizeMonth(e.target.value);
    updateCalendar();
    updateSummary();
    updateFreezeUI();
  };

  document.getElementById("competitionDay").onchange = (e) => {
    document.getElementById("travelGroup").style.display = e.target.checked
      ? "block"
      : "none";
  };

  document.getElementById("saveDay").onclick = saveDay;
  document.getElementById("deleteDay").onclick = deleteDay;
  document.getElementById("cancelDay").onclick = () => {
    document.getElementById("dayModal").classList.remove("active");
  };

  document.getElementById("exportBtn").onclick = exportToCSV;
  document.getElementById("backupBtn").onclick = exportBackupJSON;

  document.getElementById("importBtn").onclick = () => {
    const fileInput = document.getElementById("importFile");
    const file = fileInput.files[0];
    if (!file) {
      alert("Please choose a JSON file first.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        await importCoachData(data);
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };

  document.getElementById("mileageBtn").onclick = exportMileageHTML;
  document.getElementById("freezeBtn").onclick = toggleFreezeMonth;
}

// ===== Coach management =====
function clearCoachForm() {
  document.getElementById("coachName").value = "";
  document.getElementById("coachFirstName").value = "";
  document.getElementById("coachEmail").value = "";
  document.getElementById("coachAddress").value = "";
  document.getElementById("coachVehicle").value = "";
  document.getElementById("coachFiscalPower").value = "";
  document.getElementById("coachRate").value = "";
  document.getElementById("dailyAllowance").value = "";
  document.getElementById("kmRate").value = "0.35";
}

function loadCoaches() {
  const select = document.getElementById("coachSelect");
  select.innerHTML = '<option value="">-- Select Coach --</option>';

  coaches.forEach((coach) => {
    const option = document.createElement("option");
    option.value = coach.id;
    option.textContent = `${(coach.first_name ? coach.first_name + ' ' : '') + coach.name}`;
    select.appendChild(option);
  });

  if (!currentCoach && coaches.length === 1) {
    currentCoach = coaches[0];
    select.value = currentCoach.id;
  }

  if (currentCoach) {
    const found = coaches.find((c) => c.id === currentCoach.id);
    if (found) {
      currentCoach = found;
      select.value = currentCoach.id;
    } else {
      currentCoach = null;
    }
  }
}

async function saveCoach() {
  console.log('DEBUG saveCoach START');
  if (!currentUser) {
    alert('No logged user');
    return;
  }
  console.log('DEBUG currentUser ID:', currentUser.id);

  const isAdmin = await isCurrentUserAdminDB();
  console.log('DEBUG isAdmin:', isAdmin);
  if (!isAdmin) {
    alert('Only admin');
    return;
  }

  console.log('DEBUG ADMIN OK - FORM');
  
  const name = document.getElementById('coachName').value.trim();
  const firstName = document.getElementById('coachFirstName').value.trim();
  const email = document.getElementById('coachEmail').value.trim();
  const address = document.getElementById('coachAddress').value.trim();
  const vehicle = document.getElementById('coachVehicle').value.trim();
  const fiscalPower = document.getElementById('coachFiscalPower').value.trim();
  const rate = parseFloat(document.getElementById('coachRate').value) || 0;
  const allowance = parseFloat(document.getElementById('dailyAllowance').value) || 0;
  const kmRate = parseFloat(document.getElementById('kmRate').value) || 0.64;
  const ownerUidInput = document.getElementById('coachOwnerUid');
  const ownerUid = ownerUidInput ? ownerUidInput.value.trim() : currentUser.id;
  
  console.log('DEBUG FORM:', {name, rate, allowance, kmRate, ownerUid});
  
  if (!name || isNaN(rate) || isNaN(allowance) || isNaN(kmRate)) {
    alert('Veuillez renseigner le nom et les tarifs (taux horaire, indemnité journalière, taux km).');
    return;
  }
  
const coachData = {
  name, 
  first_name: firstName,      // first_name
  email, 
  address, 
  vehicle, 
  fiscal_power: fiscalPower,
  hourly_rate: rate,          // hourly_rate
  daily_allowance: allowance,
  km_rate: kmRate,
  owner_uid: ownerUid || null      // owner_uid (null until the coach claims their profile)
};

  console.log('DEBUG coachData:', JSON.stringify(coachData, null, 2));

  try {
    console.log('DEBUG DB start');
    let res;
    console.log('DEBUG about to call Supabase write. editMode=', editMode, 'editingCoachId=', editingCoachId);

    // Probe whether auth/session retrieval is hanging before any network request.
    try {
      const probeTimeoutMs = 3000;
      const t0 = performance.now();
      const sessionProbe = supabase.auth.getSession();
      const sessionRes = await Promise.race([
        sessionProbe,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`getSession timed out after ${probeTimeoutMs}ms`)), probeTimeoutMs))
      ]);
      console.log('DEBUG getSession probe:', `${Math.round(performance.now() - t0)}ms`, sessionRes);
    } catch (e) {
      console.warn('DEBUG getSession probe error:', e);
    }

    const timeoutMs = 8000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Supabase write timed out after ${timeoutMs}ms (no response)`)), timeoutMs)
    );

    const dbPromise = (editMode && editingCoachId)
      ? supabase.from('coaches').update([coachData]).eq('id', editingCoachId).select()
      : supabase.from('coaches').insert([coachData]).select();

    try {
      res = await Promise.race([dbPromise, timeoutPromise]);
    } catch (e) {
      const msg = String(e?.message || e);
      const isTimeout = msg.includes('timed out');
      if (!isTimeout) throw e;

      console.warn('DEBUG Supabase-js write timed out; falling back to direct REST fetch');
      res = await __coachWriteViaRest(coachData, { editingId: (editMode && editingCoachId) ? editingCoachId : null });
      console.log('DEBUG REST write response:', JSON.stringify(res, null, 2));
    }

    console.log('DEBUG DB full response:', JSON.stringify(res, null, 2));
    if (res.status) console.log('DEBUG Supabase status:', res.status, res.statusText);
    if (res.error) {
      console.error('DEBUG DB error:', res.error);
      alert('Save error: ' + res.error.message);
      // Always reset modal/UI on error
      document.getElementById('coachModal').classList.remove('active');
      clearCoachForm();
      editMode = false;
      editingCoachId = null;
      updateSummary();
      return;
    }
    if (!res.data || res.data.length === 0) {
      console.warn('DEBUG DB no data returned:', res);
      alert('Save failed: No data returned from Supabase. Possible RLS issue.');
      // Always reset modal/UI on failure
      document.getElementById('coachModal').classList.remove('active');
      clearCoachForm();
      editMode = false;
      editingCoachId = null;
      updateSummary();
      return;
    }
    console.log('DEBUG SAVE SUCCESS:', res.data);

    // Update local state/UI without depending on additional Supabase reads (which may hang).
    const savedRow = Array.isArray(res.data) ? res.data[0] : null;
    if (savedRow) {
      const saved = { id: savedRow.id, ...savedRow };
      if (editMode && editingCoachId) {
        coaches = coaches.map((c) => (c.id === editingCoachId ? saved : c));
      } else {
        coaches = [...coaches, saved];
      }
      currentCoach = saved;
      loadCoaches();
    }

    document.getElementById('coachModal').classList.remove('active');
    clearCoachForm();
    const wasNewCoach = !editMode;
    editMode = false;
    editingCoachId = null;
    updateSummary();

    // Offer to send an invitation email when a new coach was created without a UUID
    if (wasNewCoach && !ownerUid && email) {
      const sendInvite = confirm(
        `Profil créé avec succès.\n\nVoulez-vous envoyer une invitation par e-mail à ${email} ?\n\nL'entraîneur recevra un lien pour choisir son mot de passe et se connecter.`
      );
      if (sendInvite) {
        await inviteCoach(email);
      }
    }
  } catch (e) {
    console.error('DEBUG SAVE ERROR:', e);
    alert('Save error: ' + e.message);
    // Always reset modal/UI on exception
    document.getElementById('coachModal').classList.remove('active');
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
    updateSummary();
  }
}


async function deleteCoach() {
  const isAdmin = await isCurrentUserAdminDB();
  if (!currentUser || !isAdmin) {
    alert("Only admin can delete coach profiles.");
    return;
  }
  if (!editingCoachId) return;

  if (!confirm("Are you sure you want to delete this coach? This will also delete all associated time data.")) {
    return;
  }

  try {
    // Delete the coach
    const { error: error1 } = await supabase.from('coaches').delete().eq('id', editingCoachId);
    if (error1) throw error1;

    // Delete all timeData for this coach
    const { error: error2 } = await supabase.from('time_data').delete().eq('coach_id', editingCoachId);
    if (error2) throw error2;

    await loadAllDataFromSupabase();

    currentCoach = null;
    const select = document.getElementById("coachSelect");
    select.value = "";

    document.getElementById("coachModal").classList.remove("active");
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
    updateSummary();
  } catch (e) {
    alert("Error deleting coach: " + e.message);
  }
}

/**
 * inviteCoach — sends an invitation email to a coach using the `invite-coach`
 * Supabase Edge Function.  The coach receives a link to set their password and
 * log in; on first login their pre-created profile is automatically linked to
 * their auth account via `claim_coach_profile()`.
 *
 * @param {string} email - The coach's email address
 * @returns {Promise<boolean>} true on success, false on failure
 */
async function inviteCoach(email) {
  if (!currentUser) return false;

  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) {
    alert("Seul un administrateur peut envoyer des invitations.");
    return false;
  }

  // Always use a fresh access token so the Edge Function call is not rejected
  // due to a stale or expired token cached in currentAccessToken.
  // refreshSession() exchanges the in-memory refresh token for a new access
  // token, which handles the case where the access token has expired (the
  // default Supabase access token lifetime is 1 hour).
  let accessToken = currentAccessToken;
  const inviteDebugStart = __collectInviteDebug({ inviteEmail: email, stage: 'beforeRefresh' });
  window.__inviteDebugLast = inviteDebugStart;
  console.log('DEBUG inviteCoach start:', inviteDebugStart);
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.access_token) {
      accessToken = session.access_token;
      currentAccessToken = accessToken;
    } else {
      // refreshSession() returned no session; fall back to getSession() in case
      // the current token is still valid (e.g. refresh token already consumed).
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (existing?.access_token) {
        accessToken = existing.access_token;
      }
    }
  } catch (_) {
    // Fall back to currentAccessToken if the refresh unexpectedly throws
  }

  if (!accessToken) {
    const noTokenDebug = __collectInviteDebug({ inviteEmail: email, stage: 'noTokenAfterRefresh', token: accessToken });
    window.__inviteDebugLast = noTokenDebug;
    console.warn('DEBUG inviteCoach missing access token:', noTokenDebug);
    alert("Session expirée. Veuillez vous reconnecter.");
    return false;
  }

  try {
    const inviteDebugRequest = __collectInviteDebug({ inviteEmail: email, stage: 'beforeRequest', token: accessToken });
    window.__inviteDebugLast = inviteDebugRequest;
    console.log('DEBUG inviteCoach request context:', inviteDebugRequest);
    const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/invite-coach`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'apikey': supabaseKey
      },
      body: JSON.stringify({
        email,
        redirectTo: window.location.origin + window.location.pathname
      })
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Supabase gateway errors use "message"; function errors use "error"
      const msg = json.error || json.message || `Erreur HTTP ${res.status}`;
      const inviteDebugFailure = {
        ...inviteDebugRequest,
        responseStatus: res.status,
        responseStatusText: res.statusText,
        responseBody: json
      };
      window.__inviteDebugLast = inviteDebugFailure;
      console.error('DEBUG inviteCoach failed:', inviteDebugFailure);

      const requestId = json.requestId || null;
      const jwtDetail = json?.debug?.userError || null;
      const extraLines = [
        requestId ? `Référence debug : ${requestId}` : '',
        jwtDetail ? `Détail JWT : ${jwtDetail}` : '',
        'Console navigateur : window.__getInviteDebugReport()'
      ].filter(Boolean);
      const extra = extraLines.length ? `\n${extraLines.join('\n')}` : '';

      console.log('DEBUG inviteCoach share command:', 'window.__getInviteDebugReport()');
      alert(`Échec de l'invitation : ${msg}${extra}`);
      return false;
    }

    alert(`Invitation envoyée à ${email}.\nL'entraîneur recevra un e-mail pour créer son mot de passe.`);
    return true;
  } catch (e) {
    const inviteDebugError = {
      ...__collectInviteDebug({ inviteEmail: email, stage: 'requestException', token: accessToken }),
      errorMessage: e?.message || String(e)
    };
    window.__inviteDebugLast = inviteDebugError;
    console.error('DEBUG inviteCoach exception:', inviteDebugError);
    const hint = e instanceof TypeError
      ? `\n\nVérifiez que la fonction Edge "invite-coach" est bien déployée sur Supabase.`
      : '';
    alert(`Erreur lors de l'envoi de l'invitation : ${e.message}${hint}`);
    return false;
  }
}

// ===== Calendar rendering =====
async function updateCalendar() {
  const calendar = document.getElementById("calendar");
  calendar.innerHTML = "";

  if (!currentMonth) return;

  const [year, month] = currentMonth.split("-").map(Number);

  // Fetch holidays for the current year (cached after first fetch)
  // Also fetch previous year for cross-year holidays (e.g. Christmas break spanning Dec → Jan)
  const prevYear = month === 1 ? year - 1 : year;
  const [fetchedPublicHolidays, prevYearSchoolHolidays, curYearSchoolHolidays] = await Promise.all([
    fetchPublicHolidays(year),
    prevYear !== year ? fetchSchoolHolidays(prevYear) : Promise.resolve([]),
    fetchSchoolHolidays(year)
  ]);
  publicHolidays = fetchedPublicHolidays;
  schoolHolidays = [...prevYearSchoolHolidays, ...curYearSchoolHolidays];

  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  dayNames.forEach((dayName) => {
    const headerDiv = document.createElement("div");
    headerDiv.className = "calendar-header";
    headerDiv.textContent = dayName;
    calendar.appendChild(headerDiv);
  });

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  for (let i = 0; i < startDay; i++) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day disabled";
    calendar.appendChild(emptyDay);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    const dayDiv = createDayElement(day, dateStr);
    calendar.appendChild(dayDiv);
  }

  updateFreezeUI();
}

function createDayElement(day, dateStr) {
  const dayDiv = document.createElement("div");
  dayDiv.className = "calendar-day";

  const date = new Date(dateStr);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    dayDiv.classList.add("weekend");
  }

  if (publicHolidays[dateStr]) {
    dayDiv.classList.add("holiday");
  }

  const isSchoolHoliday = schoolHolidays.some(
    (holiday) => dateStr >= holiday.start && dateStr <= holiday.end
  );
  if (isSchoolHoliday && !publicHolidays[dateStr]) {
    dayDiv.classList.add("school-holiday");
  }

  const key = `${currentCoach?.id}-${dateStr}`;
  const dayData = timeData[key];

  if (dayData) {
    if (dayData.competition) {
      dayDiv.classList.add("has-competition");
    } else if (dayData.hours > 0) {
      dayDiv.classList.add("has-data");
    }
  }

  const dayNumber = document.createElement("div");
  dayNumber.className = "day-number";
  dayNumber.textContent = day;
  dayDiv.appendChild(dayNumber);

  if (publicHolidays[dateStr]) {
    const info = document.createElement("div");
    info.className = "day-info";
    info.textContent = publicHolidays[dateStr];
    dayDiv.appendChild(info);
  }

  if (dayData && dayData.hours > 0) {
    const hours = document.createElement("div");
    hours.className = "day-hours";
    hours.textContent = `${dayData.hours}h`;
    if (dayData.competition) hours.textContent += " 🏆";
    dayDiv.appendChild(hours);
  }

  dayDiv.addEventListener("click", () => openDayModal(dateStr));

  return dayDiv;
}

// ===== Day modal =====
function openDayModal(dateStr) {
  if (!currentCoach) {
    alert("Please select a coach first");
    return;
  }

  selectedDay = dateStr;
  const key = `${currentCoach.id}-${dateStr}`;
  const dayData =
    timeData[key] || {
      hours: 0,
      competition: false,
      km: 0,
      description: "",
      departurePlace: "",
      arrivalPlace: "",
      ownerUid: currentUser ? currentUser.id : null,
      ownerEmail: currentUser ? currentUser.email : null
    };

  document.getElementById("dayTitle").textContent = `Modifier ${dateStr}`;
  document.getElementById("trainingHours").value = dayData.hours || 0;
  document.getElementById("competitionDay").checked =
    dayData.competition || false;
  document.getElementById("kilometers").value = dayData.km || 0;
  document.getElementById("competitionDescription").value =
    dayData.description || "";
  document.getElementById("departurePlace").value =
    dayData.departurePlace || "";
  document.getElementById("arrivalPlace").value = dayData.arrivalPlace || "";
  document.getElementById("peage").value = dayData.peage || 0;
  document.getElementById("peageJustification").value = "";

  const existingJustification = document.getElementById("existingJustification");
  const justificationLink = document.getElementById("justificationLink");
  if (dayData.justificationUrl) {
    justificationLink.href = dayData.justificationUrl;
    existingJustification.style.display = "block";
  } else {
    existingJustification.style.display = "none";
  }

  document.getElementById("travelGroup").style.display = dayData.competition
    ? "block"
    : "none";

  document.getElementById("dayModal").classList.add("active");
}

async function saveDay() {
  if (!currentCoach || !currentUser) return;

  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin && isCurrentMonthFrozen()) {
    alert("Cette fiche est gelée. Les modifications ne sont pas autorisées.");
    document.getElementById("dayModal").classList.remove("active");
    return;
  }

  const hours =
    parseFloat(document.getElementById("trainingHours").value) || 0;
  const competition = document.getElementById("competitionDay").checked;
  const km = parseFloat(document.getElementById("kilometers").value) || 0;
  const description =
    document.getElementById("competitionDescription").value.trim();
  const departurePlace = document
    .getElementById("departurePlace")
    .value.trim();
  const arrivalPlace = document.getElementById("arrivalPlace").value.trim();
  const peage = parseFloat(document.getElementById("peage").value) || 0;
  const file = document.getElementById("peageJustification").files[0];

  const key = `${currentCoach.id}-${selectedDay}`;
  const existing = timeData[key];

  let justificationUrl = existing ? existing.justificationUrl || "" : "";

  if (file) {
    try {
      const { data, error } = await supabase.storage.from('justifications').upload(`${currentUser.id}/${selectedDay}_${file.name}`, file);
      if (error) throw error;
      justificationUrl = supabase.storage.from('justifications').getPublicUrl(data.path).data.publicUrl;
    } catch (e) {
      alert("Erreur lors de l'upload du justificatif: " + e.message);
      return; // Don't save if upload fails
    }
  }

  if (hours === 0 && !competition && km === 0 && !description && peage === 0) {
    if (existing && existing.id) {
      const { error } = await supabase.from('time_data').delete().eq('id', existing.id);
      if (error) throw error;
    }
    delete timeData[key];
  } else {
    // Attribute the row to the selected coach, even when an admin edits it.
    const ownerUidForRow = currentCoach.owner_uid || currentUser.id;
    const ownerEmailForRow = currentCoach.email || currentUser.email;
    const data = {
      coach_id: currentCoach.id,
      date: selectedDay,
      hours,
      competition,
      km,
      description,
      departure_place: departurePlace,
      arrival_place: arrivalPlace,
      peage,
      justification_url: justificationUrl,
      owner_uid: ownerUidForRow,
      owner_email: ownerEmailForRow
    };
    if (existing && existing.id) {
      const { error } = await supabase.from('time_data').update(data).eq('id', existing.id);
      if (error) throw error;
      timeData[key] = {
        hours,
        competition,
        km,
        description,
        departurePlace,
        arrivalPlace,
        peage,
        justificationUrl,
        coachId: currentCoach.id,
        ownerUid: ownerUidForRow,
        ownerEmail: ownerEmailForRow,
        id: existing.id
      };
    } else {
      const { data: inserted, error } = await supabase.from('time_data').insert(data).select();
      if (error) throw error;
      timeData[key] = {
        hours,
        competition,
        km,
        description,
        departurePlace,
        arrivalPlace,
        peage,
        justificationUrl,
        coachId: currentCoach.id,
        ownerUid: ownerUidForRow,
        ownerEmail: ownerEmailForRow,
        id: inserted[0].id
      };
    }
  }

  document.getElementById("dayModal").classList.remove("active");
  updateCalendar();
  updateSummary();
}

async function deleteDay() {
  if (!currentCoach || !currentUser) return;

  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin && isCurrentMonthFrozen()) {
    alert("Cette fiche est gelée. Les modifications ne sont pas autorisées.");
    document.getElementById("dayModal").classList.remove("active");
    return;
  }

  const key = `${currentCoach.id}-${selectedDay}`;
  const existing = timeData[key];
  if (existing && existing.id) {
    const { error } = await supabase.from('time_data').delete().eq('id', existing.id);
    if (error) throw error;
  }
  delete timeData[key];

  document.getElementById("dayModal").classList.remove("active");
  updateCalendar();
  updateSummary();
}

// ===== Summary & exports =====
function updateSummary() {
  if (!currentCoach || !currentMonth) {
    document.getElementById("totalHours").textContent = "0";
    document.getElementById("hourlyRate").textContent = "€0.00";
    document.getElementById("trainingPayment").textContent = "€0.00";
    document.getElementById("compDays").textContent = "0";
    document.getElementById("compPayment").textContent = "€0.00";
    document.getElementById("totalKm").textContent = "0";
    document.getElementById("kmPayment").textContent = "€0.00";
    document.getElementById("totalPayment").textContent = "€0.00";
    return;
  }

  const [year, month] = currentMonth.split("-");
  let totalHours = 0;
  let compDays = 0;
  let totalKm = 0;

  Object.keys(timeData).forEach((key) => {
    if (key.startsWith(`${currentCoach.id}-${year}-${month}`)) {
      const data = timeData[key];
      totalHours += data.hours || 0;
      if (data.competition) compDays++;
      totalKm += data.km || 0;
    }
  });

  const trainingPayment = totalHours * currentCoach.hourly_rate;
  const compPayment = compDays * currentCoach.daily_allowance;
  const kmPayment = totalKm * currentCoach.km_rate;
  const totalPayment = trainingPayment + compPayment + kmPayment;

  document.getElementById("totalHours").textContent = totalHours.toFixed(1);
  document.getElementById(
    "hourlyRate"
  ).textContent = `€${currentCoach.hourly_rate.toFixed(2)}`;
  document.getElementById(
    "trainingPayment"
  ).textContent = `€${trainingPayment.toFixed(2)}`;
  document.getElementById("compDays").textContent = compDays;
  document.getElementById(
    "compPayment"
  ).textContent = `€${compPayment.toFixed(2)}`;
  document.getElementById("totalKm").textContent = totalKm;
  document.getElementById(
    "kmPayment"
  ).textContent = `€${kmPayment.toFixed(2)}`;
  document.getElementById(
    "totalPayment"
  ).textContent = `€${totalPayment.toFixed(2)}`;
}

function exportToCSV() {
  if (!currentCoach || !currentMonth) {
    alert("Please select a coach and month");
    return;
  }

  const [year, month] = currentMonth.split("-");
  let csv =
    "Date,Training Hours,Competition,Competition Description,Kilometers,Payment\n";

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      const payment =
        data.hours * currentCoach.hourly_rate +
        (data.competition ? currentCoach.daily_allowance : 0) +
        data.km * currentCoach.km_rate;
      csv +=
        `${date},${data.hours},${data.competition ? "Yes" : "No"},` +
        `"${data.description || ""}",${data.km},€${payment.toFixed(2)}\n`;
    });

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentCoach.name}_${currentMonth}_coaching.csv`;
  a.click();
}

function __isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}

function __downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function __closeMileagePreviewModal() {
  const modal = document.getElementById('mileagePreviewModal');
  if (modal) modal.classList.remove('active');
}

function __showMileagePreviewModal(html, fileName) {
  let modal = document.getElementById('mileagePreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mileagePreviewModal';
    modal.className = 'modal export-preview-modal';
    modal.innerHTML = `
      <div class="modal-content export-preview-content">
        <h2>Aperçu note de frais</h2>
        <div class="export-preview-toolbar">
          <button id="previewPrintBtn" class="btn-primary">🖨️ Imprimer / PDF</button>
          <button id="previewDownloadBtn" class="btn-secondary">💾 Télécharger HTML</button>
          <button id="previewCloseBtn" class="btn-danger">Fermer</button>
        </div>
        <iframe id="mileagePreviewFrame" class="export-preview-frame" title="Aperçu note de frais"></iframe>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) __closeMileagePreviewModal();
    });

    modal.querySelector('#previewCloseBtn')?.addEventListener('click', __closeMileagePreviewModal);
  }

  const iframe = modal.querySelector('#mileagePreviewFrame');
  const printBtn = modal.querySelector('#previewPrintBtn');
  const downloadBtn = modal.querySelector('#previewDownloadBtn');

  if (iframe) {
    iframe.srcdoc = html;
  }

  if (printBtn) {
    printBtn.onclick = () => {
      try {
        iframe?.contentWindow?.focus();
        iframe?.contentWindow?.print();
      } catch (e) {
        alert('Impossible d\'imprimer cet aperçu. Utilisez Télécharger HTML.');
      }
    };
  }

  if (downloadBtn) {
    downloadBtn.onclick = () => {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
      __downloadBlob(blob, fileName);
    };
  }

  modal.classList.add('active');
}

function exportMileageHTML() {
  if (!currentCoach || !currentMonth) {
    alert("Please select a coach and month");
    return;
  }
  const [year, month] = currentMonth.split("-");
  const today = new Date().toLocaleDateString("fr-FR");

  const rows = [];
  let total = 0;

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      if (!data.km || data.km <= 0) return;
      const amount = data.km * currentCoach.km_rate;
      total += amount;
      rows.push({ date, ...data, amount });
    });

  if (total === 0) {
    alert("No mileage recorded for this month.");
    return;
  }

  const logoUrl = new URL('logo-jcc.png', window.location.href).href;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Note de frais kilométrique - ${currentCoach.name} - ${month}/${year}</title>
<style>
  * {
    box-sizing: border-box;
  }

  @media print {
    @page { margin: 1.5cm; }
    body { margin: 0; }
    .no-print { display: none; }
  }
  
  body { 
    font-family: Arial, sans-serif; 
    margin: 20px;
    color: #333;
    max-width: 100%;
    overflow-x: hidden;
  }
  
  .header { 
    display: flex; 
    align-items: center;
    border-bottom: 3px solid #004080;
    padding-bottom: 15px;
    margin-bottom: 20px;
  }
  
  .header-logo { 
    margin-right: 20px; 
  }
  
  .header-logo img { 
    height: 80px; 
  }
  
  .header-text { 
    color: #004080; 
  }
  
  .header-text h1 { 
    margin: 0 0 5px 0;
    font-size: 1.5rem;
    color: #004080;
  }
  
  .header-text p { 
    margin: 2px 0;
    font-size: 0.9rem;
  }
  
  h2 { 
    color: #0066cc;
    margin-top: 20px;
  }
  
  .info-section {
    background: #f4f8ff;
    padding: 15px;
    border-radius: 5px;
    margin: 15px 0;
  }
  
  .info-section p {
    margin: 5px 0;
  }

  .table-wrap {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
  }
  
  table { 
    border-collapse: collapse; 
    width: 100%; 
    margin-top: 20px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    table-layout: fixed;
  }
  
  th, td { 
    border: 1px solid #ddd; 
    padding: 10px; 
    font-size: 0.9rem;
    text-align: left;
    overflow-wrap: anywhere;
    word-break: break-word;
    vertical-align: top;
  }
  
  th { 
    background: #004080; 
    color: #fff;
    font-weight: bold;
  }
  
  tr:nth-child(even) { 
    background: #f9f9f9; 
  }
  
  tr:hover:not(.total-row) {
    background: #f4f8ff;
  }
  
  .total-row td { 
    font-weight: bold; 
    background: #e0ecff;
    font-size: 1rem;
  }
  
  .note {
    margin-top: 30px;
    padding: 15px;
    background: #fffbf0;
    border-left: 4px solid #ffa500;
    font-size: 0.85rem;
    line-height: 1.4;
  }
  
  .signature { 
    margin-top: 60px; 
    display: flex; 
    justify-content: space-between;
    page-break-inside: avoid;
  }
  
  .signature > div {
    width: 45%;
    border-top: 1px solid #333;
    padding-top: 10px;
    text-align: center;
  }
  
  .print-button {
    margin: 20px 0;
    padding: 10px 20px;
    background: #004080;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 1rem;
  }
  
  .print-button:hover {
    background: #0066cc;
  }
</style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>

  <div class="header">
    <div class="header-logo">
      <img src="${logoUrl}" alt="Judo Club Cattenom-Rodemack" />
    </div>
    <div class="header-text">
      <h1>Judo Club de Cattenom-Rodemack</h1>
      <p>Association RA1026</p>
      <p>Dojo communautaire – 57570 Cattenom</p>
      <p>📧 judoclubcattenom@gmail.com – 📞 06 62 62 53 13</p>
    </div>
  </div>

  <h2>Note de frais kilométrique</h2>
  
  <div class="info-section">
    <p><strong>Période :</strong> ${month}/${year}</p>
    <p><strong>Date d'édition :</strong> ${today}</p>
    <p><strong>Nom et prénom :</strong> ${currentCoach.name}</p>
    <p><strong>Adresse :</strong> ${currentCoach.address || "Non renseignée"}</p>
    <p><strong>Poste :</strong> Entraîneur</p>
    <p><strong>Véhicule :</strong> ${currentCoach.vehicle || "Non renseigné"}</p>
    <p><strong>Puissance fiscale :</strong> ${currentCoach.fiscal_power || "Non renseignée"} CV</p>
  </div>

  <div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Motif du trajet</th>
        <th>Lieu de départ</th>
        <th>Lieu d'arrivée</th>
        <th>Distance (km)</th>
        <th>Indemnité/km (€)</th>
        <th>Montant (€)</th>
      </tr>
    </thead>
    <tbody>
${rows
  .map(
    (r) => `
      <tr>
        <td>${r.date}</td>
        <td>${r.description || "Déplacement judo"}</td>
        <td>${r.departurePlace || "-"}</td>
        <td>${r.arrivalPlace || "-"}</td>
        <td style="text-align:right">${r.km}</td>
        <td style="text-align:right">${currentCoach.km_rate
          .toFixed(2)
          .replace(".", ",")}</td>
        <td style="text-align:right">${r.amount
          .toFixed(2)
          .replace(".", ",")} €</td>
      </tr>`
  )
  .join("")}
      <tr class="total-row">
        <td colspan="6" style="text-align:right">TOTAL TTC</td>
        <td style="text-align:right">${total
          .toFixed(2)
          .replace(".", ",")} €</td>
      </tr>
    </tbody>
  </table>
  </div>

  <div class="note">
    <strong>ℹ️ Barème des frais kilométriques :</strong><br>
    Le montant de l'indemnité par kilomètre est fixé selon le nombre de kilomètres parcourus
    et la puissance fiscale du véhicule. Pour le connaître, référez-vous au barème des frais 
    kilométriques établi par l'administration fiscale et l'Urssaf.
  </div>

  <div class="signature">
    <div>
      <strong>Signature du salarié</strong><br><br><br>
      ${currentCoach.name}
    </div>
    <div>
      <strong>Signature de l'employeur</strong><br><br><br>
      Président du Judo Club
    </div>
  </div>
</body>
</html>
`;

  const fileName = `note_frais_km_${currentCoach.name}_${currentMonth}.html`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });

  if (__isStandaloneApp()) {
    __showMileagePreviewModal(html, fileName);
    return;
  }

  __downloadBlob(blob, fileName);

  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
  }
}

// Expose the function
window.exportMileageHTML = exportMileageHTML;
// ===== Import JSON =====
async function importCoachData(data) {
  if (!currentCoach || !currentUser) {
    alert("Select a coach and log in before importing.");
    return;
  }

  if (data.entraineur && data.entraineur !== currentCoach.name) {
    const ok = confirm(
      `JSON coach is "${data.entraineur}", selected coach is "${currentCoach.name}". Continue?`
    );
    if (!ok) return;
  }

  const inserts = [];

  if (data.heures) {
    Object.entries(data.heures).forEach(([date, hours]) => {
      inserts.push({
        coach_id: currentCoach.id,
        date,
        hours: Number(hours) || 0,
        competition: false,
        km: 0,
        description: "",
        departure_place: "",
        arrival_place: "",
        peage: 0,
        justification_url: "",
        owner_uid: currentUser.id,
        owner_email: currentUser.email
      });
    });
  }

  if (data.manifestations) {
    Object.keys(data.manifestations).forEach((date) => {
      const desc = data.manifestations[date] || "";
      inserts.push({
        coach_id: currentCoach.id,
        date,
        hours: 0,
        competition: true,
        km: 0,
        description: desc,
        departure_place: "",
        arrival_place: "",
        peage: 0,
        justification_url: "",
        owner_uid: currentUser.id,
        owner_email: currentUser.email
      });
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('time_data').insert(inserts);
    if (error) throw error;
  }
  await loadAllDataFromSupabase();
  updateCalendar();
  updateSummary();
  alert("Import completed.");
}

// ===== Export backup JSON =====
function exportBackupJSON() {
  if (!currentCoach) {
    alert("Veuillez sélectionner un entraîneur.");
    return;
  }

  const entries = [];

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${currentCoach.id}-`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      entries.push({
        date,
        hours: data.hours || 0,
        competition: data.competition || false,
        km: data.km || 0,
        description: data.description || "",
        departure_place: data.departure_place || "",
        arrival_place: data.arrival_place || "",
        peage: data.peage || 0,
      });
    });

  const backup = {
    entraineur: currentCoach.name,
    prenom: currentCoach.first_name || "",
    coach_id: currentCoach.id,
    export_date: new Date().toISOString().split("T")[0],
    entries,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = currentCoach.name.replace(/[^a-z0-9_\-]/gi, "_");
  a.download = `backup_${safeName}_${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Optionally expose some functions globally if needed
window.exportToCSV = exportToCSV;
window.exportBackupJSON = exportBackupJSON;
window.saveCoach = saveCoach;
window.deleteCoach = deleteCoach;
window.inviteCoach = inviteCoach;
window.saveDay = saveDay;
window.deleteDay = deleteDay;
