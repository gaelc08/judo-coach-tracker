// app-modular.js
// Uses Supabase JS SDK

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BUILD_ID as __BUILD_ID, effectiveEnv as __effectiveEnv, supabaseKey, supabaseUrl } from './modules/env.js';
import { auditMatchesCurrentCoach, formatAuditDateTime, formatAuditDetails, getAuditActionGroup } from './modules/audit-ui.js';
import { isAdminViaLocalClaims, isAdminViaRest } from './modules/auth-admin.js';
import { createAuditController } from './modules/audit-controller.js';
import { createAuthNoHangLock, createAuthStorage, detectInviteFlowFromUrlHash } from './modules/auth-runtime.js';
import { currencyDisplay, numberDisplay } from './modules/display-format.js';
import { blobToDataUrl, downloadBlob, isStandaloneApp, loadExcelJs } from './modules/export-runtime.js';
import { publicHolidaysFallback, schoolHolidaysFallback } from './modules/holidays-data.js';
import { createHolidayService } from './modules/holidays-service.js';
import { createInviteDebugTools } from './modules/invite-debug.js';
import { calculateAnnualMileageAmount, formatNumberFr, getLegacyKmRateFromFiscalPower, getMileageScaleBand, getMileageScaleDescription, getMileageYearBreakdown, getMonthlyMileageBreakdown, parseFiscalPower } from './modules/mileage-service.js';
import { findExistingProfileByEmail, getCoachDisplayName, getCurrentUserDisplayName, getProfileLabel, getProfileType, isVolunteerProfile } from './modules/profile-utils.js';
import { setupPWA } from './modules/pwa.js';
import { createRestGateway } from './modules/rest-gateway.js';
import {
  __decodeJwtPayload,
  __describeJwt,
  __escapeHtml,
  __hasAdminClaim,
  __maskEmail,
  __normalizeEmail,
  __normalizeMonth,
  __safeBase64UrlDecode,
  __toAuditJson,
} from './modules/shared-utils.js';

// ----- Supabase config -----
// Bump this string in modules/env.js when deploying to confirm the browser loaded the latest JS.
console.log('DEBUG BUILD:', __BUILD_ID);

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
const __authStorage = createAuthStorage();

// Custom lock implementation to avoid Web Locks API hangs.
// Signature varies by gotrue-js version; we accept (name, fn) or (name, acquireTimeout, fn).
const __authNoHangLock = createAuthNoHangLock({ logger: console });

// Detect invite flow from URL before createClient's detectSessionInUrl consumes the hash.
// Supabase appends `type=invite` to the URL fragment when the user follows an invitation link.
let __inviteFlowActive = detectInviteFlowFromUrlHash(window.location.hash);
if (__inviteFlowActive) {
  console.log('DEBUG invite flow detected from URL hash');
}

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
let auditLogs = [];

const __restGateway = createRestGateway({
  supabaseUrl,
  supabaseKey,
  getAccessToken: () => currentAccessToken,
  getCurrentUser: () => currentUser,
  normalizeEmail: __normalizeEmail,
  toAuditJson: __toAuditJson,
  fetchImpl: globalThis.fetch?.bind(globalThis),
  logger: console,
});

const __coachWriteViaRest = __restGateway.coachWriteViaRest;
const __restSelect = __restGateway.restSelect;
const __logAuditEvent = __restGateway.logAuditEvent;

const __inviteDebugTools = createInviteDebugTools({
  buildId: __BUILD_ID,
  maskEmail: __maskEmail,
  describeJwt: __describeJwt,
  getCurrentUser: () => currentUser,
  getCurrentSession: () => currentSession,
  getCurrentAccessToken: () => currentAccessToken,
  getInviteDebugLast: () => window.__inviteDebugLast || null,
});

const __collectInviteDebug = __inviteDebugTools.collectInviteDebug;
const __getInviteDebugReport = __inviteDebugTools.getInviteDebugReport;
const __copyInviteDebugReport = __inviteDebugTools.copyInviteDebugReport;
__inviteDebugTools.installGlobalDebugApis();

const __getCoachDisplayName = getCoachDisplayName;
const __getProfileType = getProfileType;
const __isVolunteerProfile = isVolunteerProfile;
const __getProfileLabel = getProfileLabel;

function __getCurrentUserDisplayName(user, preferredCoach = null) {
  return getCurrentUserDisplayName(user, {
    preferredCoach,
    coaches,
    normalizeEmail: __normalizeEmail,
    getCoachDisplayNameFn: __getCoachDisplayName,
  });
}

function __findExistingProfileByEmail(email, { excludeId = null } = {}) {
  return findExistingProfileByEmail(email, {
    excludeId,
    coaches,
    normalizeEmail: __normalizeEmail,
  });
}

const __parseFiscalPower = parseFiscalPower;
const __getMileageScaleBand = getMileageScaleBand;
const __getLegacyKmRateFromFiscalPower = getLegacyKmRateFromFiscalPower;
const __formatNumberFr = formatNumberFr;
const __getMileageScaleDescription = getMileageScaleDescription;
const __calculateAnnualMileageAmount = calculateAnnualMileageAmount;

function __getMileageYearBreakdown(coach, year) {
  return getMileageYearBreakdown(coach, year, { timeData });
}

function __getMonthlyMileageBreakdown(coach, monthValue) {
  return getMonthlyMileageBreakdown(coach, monthValue, { timeData });
}

async function notifyAdminAlert(coachName, date, data) {
  if (__isAdminForUi()) return;
  try {
    await supabase.functions.invoke('alert-admin', {
      body: { coachName, date, data }
    });
  } catch (err) {
    console.error('Failed to notify admin', err);
  }
}

const __auditController = createAuditController({
  getAuditLogs: () => auditLogs,
  setAuditLogs: (nextRows) => { auditLogs = nextRows; },
  getCurrentCoach: () => currentCoach,
  getCurrentMonth: () => currentMonth,
  restSelect: __restSelect,
  isAdminForUi: __isAdminForUi,
  escapeHtml: __escapeHtml,
  formatAuditDateTime,
  formatAuditDetails,
  getAuditActionGroup,
  auditMatchesCurrentCoach,
  normalizeEmail: __normalizeEmail,
  normalizeMonth: __normalizeMonth,
  getElementById: (id) => document.getElementById(id),
  alertFn: (message) => alert(message),
});

function renderAuditLogs() {
  return __auditController.renderAuditLogs();
}

async function loadAuditLogs() {
  return await __auditController.loadAuditLogs();
}

async function openAuditLogsModal() {
  return await __auditController.openAuditLogsModal();
}

// ===== Holiday data (dynamically fetched, with static fallback) =====
const __holidayService = createHolidayService({
  publicFallback: publicHolidaysFallback,
  schoolFallback: schoolHolidaysFallback,
  fetchImpl: globalThis.fetch?.bind(globalThis),
  logger: console,
});

const fetchPublicHolidays = __holidayService.fetchPublicHolidays;
const fetchSchoolHolidays = __holidayService.fetchSchoolHolidays;

// Current year's holiday data (populated when calendar renders)
let publicHolidays = {};
let schoolHolidays = [];

function setupEnvironmentBanner() {
  const envBanner = document.getElementById('envBanner');
  if (!envBanner) return;

  if (__effectiveEnv !== 'dev') {
    envBanner.style.display = 'none';
    return;
  }

  envBanner.textContent = `🧪 ENVIRONNEMENT DEV — ${supabaseUrl}`;
  envBanner.style.display = 'block';
}

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
  setupEnvironmentBanner();
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

async function isCurrentUserAdminDB() {
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
      alert("Veuillez saisir votre adresse e-mail et votre mot de passe.");
      return;
    }
    try {
      const { data, error } = await supabase.auth.signUp({ email, password: pass });
      console.log('DEBUG signUp result:', { data, error });
      if (error) throw error;
      statusSpan.textContent = "Compte créé et connecté.";
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
      alert("Veuillez saisir votre adresse e-mail et votre mot de passe.");
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
      alert("Veuillez saisir votre adresse e-mail.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;
      alert("E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception.");
    } catch (e) {
      alert(e.message);
    }
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('DEBUG onAuthStateChange:', event, session);
    currentSession = session || null;
    currentAccessToken = session?.access_token || null;
    __adminCache = { userId: session?.user?.id || null, value: null, atMs: 0 };
    __adminInFlight = null;
    window.__lastSession = currentSession;
    if (currentAccessToken) {
      console.log('DEBUG access token present:', String(currentAccessToken).slice(0, 12) + '...');
      console.log('DEBUG access token details:', __describeJwt(currentAccessToken));
    } else {
      console.log('DEBUG access token missing');
    }

    // Handle invite flow: prompt the coach to create their password before entering the app.
    if (event === 'SIGNED_IN' && __inviteFlowActive && session?.user) {
      document.getElementById("invitePasswordModal").classList.add("active");
      // Use onclick assignment so repeated firings replace the handler cleanly.
      const inviteSetPasswordBtn = document.getElementById("inviteSetPasswordBtn");
      if (!inviteSetPasswordBtn) {
        console.warn('WARN missing element: #inviteSetPasswordBtn');
        return;
      }
      inviteSetPasswordBtn.onclick = async () => {
        const newPass = document.getElementById("inviteNewPasswordInput").value;
        const confirmPass = document.getElementById("inviteConfirmPasswordInput").value;
        if (!newPass) { alert("Veuillez saisir un mot de passe."); return; }
        if (newPass.length < 8) { alert("Le mot de passe doit contenir au moins 8 caractères."); return; }
        if (newPass !== confirmPass) { alert("Les mots de passe ne correspondent pas."); return; }
        // Reset flag BEFORE updateUser so the USER_UPDATED event falls through to normal app flow.
        __inviteFlowActive = false;
        document.getElementById("invitePasswordModal").classList.remove("active");
        const { error } = await supabase.auth.updateUser({ password: newPass });
        if (error) {
          // Restore state so the user can retry.
          __inviteFlowActive = true;
          document.getElementById("invitePasswordModal").classList.add("active");
          document.getElementById("inviteNewPasswordInput").value = "";
          document.getElementById("inviteConfirmPasswordInput").value = "";
          alert(error.message);
        } else {
          document.getElementById("inviteNewPasswordInput").value = "";
          document.getElementById("inviteConfirmPasswordInput").value = "";
        }
      };
      return;
    }

    // Handle password recovery: show reset form instead of the main app
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById("passwordResetModal").classList.add("active");
      // Use onclick assignment (not addEventListener) so re-fires replace the handler cleanly.
      const updatePasswordBtn = document.getElementById("updatePasswordBtn");
      if (!updatePasswordBtn) {
        console.warn('WARN missing element: #updatePasswordBtn');
        return;
      }
      updatePasswordBtn.onclick = async () => {
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
        document.getElementById("inviteAdminBtn").style.display = "inline-block";
        document.getElementById("freezeBtn").style.display = "inline-block";
        document.getElementById("auditLogsBtn").style.display = "inline-block";
        document.getElementById("importGroup").style.display = "flex";
        document.getElementById("backupBtn").style.display = "inline-block";
      } else {
        document.getElementById("addCoachBtn").style.display = "none";
        document.getElementById("editCoachBtn").style.display = "none";
        document.getElementById("inviteAdminBtn").style.display = "none";
        document.getElementById("freezeBtn").style.display = "none";
        document.getElementById("auditLogsBtn").style.display = "none";
        document.getElementById("importGroup").style.display = "none";
        document.getElementById("backupBtn").style.display = "none";
      }

      // Coach selector: admins can switch between coaches; non-admin coaches only see themselves.
      if (select) {
        select.disabled = !isAdmin;
      }
      updateCoachGreeting(user, null, isAdmin);

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

      // Update greeting with actual coach profile once data has been loaded.
      updateCoachGreeting(user, !isAdmin && coaches.length > 0 ? coaches[0] : null, isAdmin);

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
      auditLogs = [];
      currentCoach = null;
      if (select) select.innerHTML = '<option value="">-- Sélectionner --</option>';
      statusSpan.textContent = "Non connecté.";
      // Show auth container, hide app
      document.getElementById("authContainer").style.display = "flex";
      document.getElementById("appContainer").style.display = "none";
      // Reset greeting and coach selector visibility.
      updateCoachGreeting(null, null, true);
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
    const res = await __restSelect('users');
    if (res.error) throw new Error(res.error.message);
    coaches = (res.data || []).map(d => ({ id: d.id, ...d }));
  } else {
    // For coach, prefer owner_uid = current user id (RLS-friendly)
    let res = await __restSelect('users', { filters: [['owner_uid', 'eq', currentUser.id]] });
    if (res.error) throw new Error(res.error.message);
    let rows = res.data || [];

    // If no profile found by owner_uid, try to claim one by email.
    // This handles the invitation flow: admin pre-created a profile (owner_uid = null)
    // and the coach has now logged in for the first time after accepting the invite.
    if (rows.length === 0 && currentUser.email) {
      const claimRes = await globalThis.fetch(`${supabaseUrl}/rest/v1/rpc/claim_user_profile`, {
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
        res = await __restSelect('users', { filters: [['owner_uid', 'eq', currentUser.id]] });
        if (res.error) throw new Error(res.error.message);
        rows = res.data || [];
      } else {
        // Log the failure but do not block the user; they simply won't have a linked profile yet.
        const text = await claimRes.text().catch(() => '');
        console.warn('DEBUG claim_user_profile failed:', claimRes.status, text);
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
      hotel: data.hotel || 0,
      hotelJustificationUrl: data.hotel_justification_url || "",
      achat: data.achat || 0,
      achatJustificationUrl: data.achat_justification_url || "",
      coachId: data.coach_id || null,
      ownerUid: data.owner_uid || null,
      ownerEmail: data.owner_email || null,
      id: data.id
    };
  });

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
    alert("Veuillez sélectionner un profil et un mois.");
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
    await __logAuditEvent('timesheet.unfreeze', 'frozen_timesheet', {
      entityId: key,
      targetUserId: currentCoach.owner_uid || null,
      targetEmail: currentCoach.email || null,
      metadata: {
        coach_id: currentCoach.id,
        coach_name: __getCoachDisplayName(currentCoach) || currentCoach.name || null,
        month: normalizedMonth,
      },
    });
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
    await __logAuditEvent('timesheet.freeze', 'frozen_timesheet', {
      entityId: key,
      targetUserId: currentCoach.owner_uid || null,
      targetEmail: currentCoach.email || null,
      metadata: {
        coach_id: currentCoach.id,
        coach_name: __getCoachDisplayName(currentCoach) || currentCoach.name || null,
        month: normalizedMonth,
      },
    });
  }
  currentMonth = normalizedMonth;
  updateFreezeUI();
}

// ===== Event listeners =====
function setupEventListeners() {
  const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`WARN missing element for click binding: #${id}`);
      return null;
    }
    el.onclick = handler;
    return el;
  };

  const bindChange = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) {
      console.warn(`WARN missing element for change binding: #${id}`);
      return null;
    }
    el.onchange = handler;
    return el;
  };

  // Set month picker to the current month
  const monthSelectEl = document.getElementById("monthSelect");
  if (monthSelectEl) monthSelectEl.value = currentMonth;

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

  bindClick("addCoachBtn", () => {
    editMode = false;
    editingCoachId = null;
    clearCoachForm();
    document.getElementById("coachProfileType").value = "coach";
    updateCoachFormProfileUI("coach");
    document.getElementById("coachOwnerUid").value = "";
    document.getElementById("inviteCoach").style.display = "none";
    document.getElementById("deleteCoach").style.display = "none";
    document.getElementById("coachModal").classList.add("active");
  });

  bindClick("editCoachBtn", () => {
    if (!currentCoach) {
      alert("Veuillez sélectionner un profil.");
      return;
    }
    editMode = true;
    editingCoachId = currentCoach.id;

    document.getElementById("coachProfileType").value = __getProfileType(currentCoach);
    document.getElementById("coachName").value = currentCoach.name;
    document.getElementById("coachFirstName").value = currentCoach.first_name || "";
    document.getElementById("coachEmail").value = currentCoach.email || "";
    document.getElementById("coachAddress").value = currentCoach.address || "";
    document.getElementById("coachVehicle").value = currentCoach.vehicle || "";
    document.getElementById("coachFiscalPower").value = currentCoach.fiscal_power || "";
    document.getElementById("coachRate").value = currentCoach.hourly_rate;
    document.getElementById("dailyAllowance").value = currentCoach.daily_allowance;
    document.getElementById("coachOwnerUid").value = currentCoach.owner_uid || "";
    // Show the invite button when the coach profile has an email (re-send invite at any time)
    const inviteBtn = document.getElementById("inviteCoach");
    inviteBtn.style.display = currentCoach.email ? "inline-block" : "none";
    updateCoachFormProfileUI(currentCoach);
    document.getElementById("coachModal").classList.add("active");
    document.getElementById("deleteCoach").style.display = "inline-block";
  });

  bindClick("saveCoach", saveCoach);
  bindClick("inviteCoach", async () => {
    const email = __normalizeEmail(document.getElementById("coachEmail").value);
    if (!email) {
      alert("Veuillez renseigner l'adresse e-mail du profil.");
      return;
    }
    await inviteCoach(email);
  });
  bindChange("coachProfileType", (e) => {
    updateCoachFormProfileUI(e.target.value);
  });
  bindClick("inviteAdminBtn", async () => {
    const rawEmail = globalThis.prompt("Adresse e-mail du nouvel administrateur :", "");
    if (rawEmail == null) return;

    const email = __normalizeEmail(rawEmail);
    if (!email) {
      alert("Veuillez renseigner une adresse e-mail valide.");
      return;
    }

    await inviteAdmin(email);
  });
  bindClick("cancelCoach", () => {
    document.getElementById("coachModal").classList.remove("active");
    clearCoachForm();
    editMode = false;
    editingCoachId = null;
    document.getElementById("deleteCoach").style.display = "none";
    document.getElementById("inviteCoach").style.display = "none";
    updateCoachFormProfileUI("coach");
  });

  bindClick("deleteCoach", deleteCoach);

  bindClick("coachModal", (e) => {
    if (e.target.id === "coachModal") {
      document.getElementById("coachModal").classList.remove("active");
      clearCoachForm();
      editMode = false;
      editingCoachId = null;
      document.getElementById("inviteCoach").style.display = "none";
      updateCoachFormProfileUI("coach");
    }
  });

  bindClick("dayModal", (e) => {
    if (e.target.id === "dayModal") {
      document.getElementById("dayModal").classList.remove("active");
    }
  });

  bindClick("helpBtn", () => {
    document.getElementById("helpModal").classList.add("active");
  });

  bindClick("auditLogsBtn", openAuditLogsModal);

  bindClick("refreshAuditLogsBtn", loadAuditLogs);

  bindChange("auditActionFilter", renderAuditLogs);
  bindChange("auditCurrentCoachOnly", renderAuditLogs);

  bindClick("closeAuditLogs", () => {
    document.getElementById("auditLogsModal").classList.remove("active");
  });

  bindClick("closeHelp", () => {
    document.getElementById("helpModal").classList.remove("active");
  });

  bindClick("helpModal", (e) => {
    if (e.target.id === "helpModal") {
      document.getElementById("helpModal").classList.remove("active");
    }
  });

  bindClick("auditLogsModal", (e) => {
    if (e.target.id === "auditLogsModal") {
      document.getElementById("auditLogsModal").classList.remove("active");
    }
  });

  bindChange("coachSelect", (e) => {
    currentCoach = coaches.find((c) => c.id === e.target.value) || null;
    updateCurrentProfileUI();
    updateCalendar();
    updateSummary();
    renderAuditLogs();
  });

  bindChange("monthSelect", (e) => {
    currentMonth = __normalizeMonth(e.target.value);
    updateCalendar();
    updateSummary();
    updateFreezeUI();
    renderAuditLogs();
  });

  bindChange("competitionDay", (e) => {
    document.getElementById("travelGroup").style.display = e.target.checked
      ? "block"
      : "none";
  });

  bindClick("saveDay", saveDay);
  bindClick("deleteDay", deleteDay);
  bindClick("cancelDay", () => {
    document.getElementById("dayModal").classList.remove("active");
  });

  bindClick("timesheetBtn", exportTimesheetHTML);
  bindClick("backupBtn", exportBackupJSON);

  bindClick("importBtn", () => {
    const fileInput = document.getElementById("importFile");
    const file = fileInput.files[0];
    if (!file) {
      alert("Veuillez choisir un fichier JSON.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        await importCoachData(data);
      } catch (err) {
        alert("Fichier JSON invalide.");
      }
    };
    reader.readAsText(file);
  });

  bindClick("mileageBtn", exportExpenseHTML);
  bindClick("freezeBtn", toggleFreezeMonth);
}

// ===== Coach management =====
function clearCoachForm() {
  document.getElementById("coachProfileType").value = "coach";
  document.getElementById("coachName").value = "";
  document.getElementById("coachFirstName").value = "";
  document.getElementById("coachEmail").value = "";
  document.getElementById("coachAddress").value = "";
  document.getElementById("coachVehicle").value = "";
  document.getElementById("coachFiscalPower").value = "";
  document.getElementById("coachRate").value = "";
  document.getElementById("dailyAllowance").value = "";
  updateCoachFormProfileUI("coach");
}

function loadCoaches() {
  const select = document.getElementById("coachSelect");
  if (!select) {
    updateCurrentProfileUI();
    return;
  }
  const hasCoaches = Array.isArray(coaches) && coaches.length > 0;
  const hasSingleCoach = hasCoaches && coaches.length === 1;
  const ownCoach =
    currentUser && hasCoaches
      ? coaches.find((coach) => coach.owner_uid === currentUser.id)
      : null;
  const fallbackCoach = ownCoach || (hasCoaches ? coaches[0] : null);
  const shouldAutoSelectDisabledCoach = select.disabled && fallbackCoach;
  const shouldAutoSelectCoach =
    !currentCoach && (hasSingleCoach || shouldAutoSelectDisabledCoach || !!fallbackCoach);
  select.innerHTML = '<option value="">-- Sélectionner --</option>';

  coaches.forEach((coach) => {
    const option = document.createElement("option");
    option.value = coach.id;
    option.textContent = `${(coach.first_name ? coach.first_name + ' ' : '') + coach.name} (${__getProfileLabel(coach)})`;
    select.appendChild(option);
  });

  if (shouldAutoSelectCoach) {
    currentCoach = fallbackCoach;
    select.value = currentCoach.id;
  }

  if (currentCoach) {
    const found = coaches.find((c) => c.id === currentCoach.id);
    if (found) {
      currentCoach = found;
      select.value = currentCoach.id;
    } else {
      currentCoach = select.disabled ? fallbackCoach : null;
      if (currentCoach) {
        select.value = currentCoach.id;
      }
    }
  }

  updateCurrentProfileUI();
}

// ===== Coach greeting =====
function updateCoachGreeting(user, coach, isAdmin) {
  const greetingEl = document.getElementById("coachGreeting");
  const selectorGroup = document.getElementById("coachSelectorGroup");

  if (!greetingEl) return;

  const displayName = __getCurrentUserDisplayName(user, coach);
  greetingEl.textContent = displayName ? `Bonjour ${displayName} !` : "Bonjour !";
  greetingEl.style.display = "block";
  if (selectorGroup) selectorGroup.style.display = isAdmin ? "" : "none";
}

async function saveCoach() {
  console.log('DEBUG saveCoach START');
  if (!currentUser) {
    alert('Aucun utilisateur connecté.');
    return;
  }
  console.log('DEBUG currentUser ID:', currentUser.id);

  const isAdmin = await isCurrentUserAdminDB();
  console.log('DEBUG isAdmin:', isAdmin);
  if (!isAdmin) {
    alert("Seul l'administrateur peut effectuer cette action.");
    return;
  }

  console.log('DEBUG ADMIN OK - FORM');
  
  const name = document.getElementById('coachName').value.trim();
  const profileType = __getProfileType(document.getElementById('coachProfileType').value);
  const isVolunteer = profileType === 'benevole';
  const firstName = document.getElementById('coachFirstName').value.trim();
  const email = __normalizeEmail(document.getElementById('coachEmail').value);
  const address = document.getElementById('coachAddress').value.trim();
  const vehicle = document.getElementById('coachVehicle').value.trim();
  const fiscalPower = __parseFiscalPower(document.getElementById('coachFiscalPower').value);
  const rate = isVolunteer ? 0 : (parseFloat(document.getElementById('coachRate').value) || 0);
  const allowance = isVolunteer ? 0 : (parseFloat(document.getElementById('dailyAllowance').value) || 0);
  const kmRate = __getLegacyKmRateFromFiscalPower(fiscalPower);
  const ownerUidInput = document.getElementById('coachOwnerUid');
  const ownerUid = ownerUidInput ? ownerUidInput.value.trim() : currentUser.id;
  const duplicateProfile = email
    ? __findExistingProfileByEmail(email, { excludeId: editMode ? editingCoachId : null })
    : null;
  
  console.log('DEBUG FORM:', {name, profileType, rate, allowance, kmRate, ownerUid});
  
  if (!name || (!isVolunteer && (isNaN(rate) || isNaN(allowance) || !fiscalPower))) {
    alert("Veuillez renseigner le nom et, pour un entraîneur, la puissance fiscale du véhicule ainsi que les tarifs (taux horaire, indemnité journalière).");
    return;
  }

  if (duplicateProfile) {
    alert(`Cette adresse e-mail est déjà utilisée par le profil ${__getCoachDisplayName(duplicateProfile) || duplicateProfile.name}.`);
    return;
  }
  
const coachData = {
  name, 
  role: isVolunteer ? 'benevole' : 'entraineur',
  profile_type: profileType,
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

  const wasEditMode = !!(editMode && editingCoachId);

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
      ? supabase.from('users').update([coachData]).eq('id', editingCoachId).select()
      : supabase.from('users').insert([coachData]).select();

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
      await __logAuditEvent(wasEditMode ? 'profile.update' : 'profile.create', 'user_profile', {
        entityId: saved.id,
        targetUserId: saved.owner_uid || null,
        targetEmail: saved.email || null,
        metadata: {
          coach_id: saved.id,
          coach_name: __getCoachDisplayName(saved) || saved.name || null,
          profile_type: saved.profile_type || profileType,
          role: saved.role || coachData.role,
        },
      });
    }

    document.getElementById('coachModal').classList.remove('active');
    clearCoachForm();
    const wasNewCoach = !editMode;
    editMode = false;
    editingCoachId = null;
    updateSummary();

    // Offer to send an invitation email when a new coach was created without a UUID
    if (wasNewCoach && !ownerUid && email) {
      const profileLabel = __getProfileLabel(profileType);
      const sendInvite = confirm(
        `Profil créé avec succès.\n\nVoulez-vous envoyer une invitation par e-mail à ${email} ?\n\nLe ${profileLabel} recevra un lien pour choisir son mot de passe et se connecter.`
      );
      if (sendInvite) {
        await inviteCoach(email);
      }
    }
  } catch (e) {
    console.error('DEBUG SAVE ERROR:', e);
    alert('Erreur lors de la sauvegarde : ' + e.message);
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
    alert("Seul l'administrateur peut supprimer des profils.");
    return;
  }
  if (!editingCoachId) return;

  if (!confirm("Êtes-vous sûr(e) de vouloir supprimer ce profil ? Toutes les données associées seront également supprimées.")) {
    return;
  }

  try {
    let accessToken = currentAccessToken;
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      if (session?.access_token) {
        accessToken = session.access_token;
        currentAccessToken = accessToken;
      }
    } catch {
      // keep current token best-effort
    }

    const targetCoach = currentCoach && currentCoach.id === editingCoachId
      ? currentCoach
      : coaches.find((c) => c.id === editingCoachId) || null;

    if (accessToken && (targetCoach?.owner_uid || targetCoach?.email)) {
      const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/delete-coach-user`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          apikey: supabaseKey
        },
        body: JSON.stringify({
          userId: targetCoach?.owner_uid || null,
          email: targetCoach?.email || null
        })
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`Suppression du compte Auth échouée : ${json.error || json.message || `HTTP ${res.status}`}`);
      }
    }

    // Delete the coach
    const { error: error1 } = await supabase.from('users').delete().eq('id', editingCoachId);
    if (error1) throw error1;

    // Delete all timeData for this coach
    const { error: error2 } = await supabase.from('time_data').delete().eq('coach_id', editingCoachId);
    if (error2) throw error2;

    await __logAuditEvent('profile.delete', 'user_profile', {
      entityId: editingCoachId,
      targetUserId: targetCoach?.owner_uid || null,
      targetEmail: targetCoach?.email || null,
      metadata: {
        coach_id: editingCoachId,
        coach_name: targetCoach ? (__getCoachDisplayName(targetCoach) || targetCoach.name || null) : null,
        deleted_auth_user: !!(targetCoach?.owner_uid || targetCoach?.email),
      },
    });

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
    alert("Erreur lors de la suppression : " + e.message);
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
  const normalizedEmail = __normalizeEmail(email);

  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) {
    alert("Seul un administrateur peut envoyer des invitations.");
    return false;
  }
  if (!normalizedEmail) {
    alert("Veuillez renseigner l'adresse e-mail du profil.");
    return false;
  }

  // Always use a fresh access token so the Edge Function call is not rejected
  // due to a stale or expired token cached in currentAccessToken.
  // refreshSession() exchanges the in-memory refresh token for a new access
  // token, which handles the case where the access token has expired (the
  // default Supabase access token lifetime is 1 hour).
  let accessToken = currentAccessToken;
  const currentTokenHasAdminClaim = __hasAdminClaim(accessToken);
  const inviteDebugStart = __collectInviteDebug({ inviteEmail: normalizedEmail, stage: 'beforeRefresh' });
  window.__inviteDebugLast = inviteDebugStart;
  console.log('DEBUG inviteCoach start:', inviteDebugStart);
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.access_token) {
      const refreshedAccessToken = session.access_token;
      if (currentTokenHasAdminClaim && !__hasAdminClaim(refreshedAccessToken)) {
        console.warn('DEBUG inviteCoach keeping current token because refreshed token lost admin claim');
      } else {
        accessToken = refreshedAccessToken;
        currentAccessToken = accessToken;
      }
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
    const noTokenDebug = __collectInviteDebug({ inviteEmail: normalizedEmail, stage: 'noTokenAfterRefresh', token: accessToken });
    window.__inviteDebugLast = noTokenDebug;
    console.warn('DEBUG inviteCoach missing access token:', noTokenDebug);
    alert("Session expirée. Veuillez vous reconnecter.");
    return false;
  }

  try {
    const inviteDebugRequest = __collectInviteDebug({ inviteEmail: normalizedEmail, stage: 'beforeRequest', token: accessToken });
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
        email: normalizedEmail,
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
        'Console navigateur : window.__getInviteDebugReport()',
        'Copie auto (dans la console) : await window.__copyInviteDebugReport()'
      ].filter(Boolean);
      const extra = extraLines.length ? `\n${extraLines.join('\n')}` : '';

      console.log('DEBUG inviteCoach share commands:', {
        print: 'window.__getInviteDebugReport()',
        copy: 'await window.__copyInviteDebugReport()'
      });
      alert(`Échec de l'invitation : ${msg}${extra}`);
      return false;
    }

  alert(`Invitation envoyée à ${normalizedEmail}.\nLa personne recevra un e-mail pour créer son mot de passe.`);
    return true;
  } catch (e) {
    const inviteDebugError = {
      ...__collectInviteDebug({ inviteEmail: normalizedEmail, stage: 'requestException', token: accessToken }),
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

async function inviteAdmin(email) {
  if (!currentUser) return false;

  const normalizedEmail = __normalizeEmail(email);
  const isAdmin = await isCurrentUserAdminDB();

  if (!isAdmin) {
    alert("Seul un administrateur peut envoyer des invitations admin.");
    return false;
  }

  if (!normalizedEmail) {
    alert("Veuillez renseigner une adresse e-mail valide.");
    return false;
  }

  let accessToken = currentAccessToken;
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.access_token) {
      accessToken = session.access_token;
      currentAccessToken = accessToken;
    }
  } catch {
    // keep current token best-effort
  }

  if (!accessToken) {
    alert("Session expirée. Veuillez vous reconnecter.");
    return false;
  }

  try {
    const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/invite-admin`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: supabaseKey,
      },
      body: JSON.stringify({
        email: normalizedEmail,
        redirectTo: window.location.origin + window.location.pathname,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.error || json.message || `Erreur HTTP ${res.status}`;
      alert(`Échec de l'invitation admin : ${msg}`);
      return false;
    }

    if (json.alreadyExisted) {
      alert(
        `Droits admin accordés à ${normalizedEmail}.\n\n` +
        `Cet utilisateur existait déjà, donc aucun nouvel e-mail d'invitation n'a été envoyé.`
      );
      return true;
    }

    alert(
      `Invitation admin envoyée à ${normalizedEmail}.\n` +
      `Le nouvel administrateur recevra un e-mail pour créer son mot de passe.`
    );
    return true;
  } catch (e) {
    const hint = e instanceof TypeError
      ? `\n\nVérifiez que la fonction Edge "invite-admin" est bien déployée sur Supabase.`
      : '';
    alert(`Erreur lors de l'envoi de l'invitation admin : ${e.message}${hint}`);
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

function __formatMonthLabel(monthValue) {
  const normalized = __normalizeMonth(monthValue);
  const [year, month] = String(normalized || '').split('-');
  if (!year || !month) return normalized;
  return `${month}/${year}`;
}

function __isAdminForUi() {
  if (__adminCache.userId === currentUser?.id && __adminCache.value === true) {
    return true;
  }
  return isAdminViaLocalClaims({
    accessToken: currentAccessToken,
    currentUser,
    currentSession,
    hasAdminClaim: __hasAdminClaim,
  });
}

async function handleDayClick(dateStr) {
  if (!currentCoach) {
    alert("Veuillez sélectionner un profil.");
    return;
  }

  const isAdmin = __isAdminForUi();
  if (!isAdmin && isCurrentMonthFrozen()) {
    alert(`Impossible de modifier ${dateStr} : le mois ${__formatMonthLabel(currentMonth)} est gelé.`);
    return;
  }

  openDayModal(dateStr);
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
    (holiday) => dateStr >= holiday.start && dateStr < holiday.end
  );
  if (isSchoolHoliday && !publicHolidays[dateStr]) {
    dayDiv.classList.add("school-holiday");
  }

  const key = `${currentCoach?.id}-${dateStr}`;
  const dayData = timeData[key];

  if (dayData) {
    if ((dayData.achat || 0) > 0) {
      dayDiv.classList.add("has-purchase");
    } else if (dayData.competition) {
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

  dayDiv.addEventListener("click", () => {
    handleDayClick(dateStr).catch((e) => {
      alert("Impossible d'ouvrir cette journée : " + e.message);
    });
  });

  return dayDiv;
}

async function __uploadExpenseJustification(file, prefix) {
  if (!file) return "";
  const safeName = String(file.name || 'justificatif').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${currentUser.id}/${selectedDay}_${prefix}_${safeName}`;
  const { data, error } = await supabase.storage.from('justifications').upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from('justifications').getPublicUrl(data.path).data.publicUrl;
}

// ===== Day modal =====
function openDayModal(dateStr) {
  if (!currentCoach) {
    alert("Veuillez sélectionner un profil.");
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
      peage: 0,
      justificationUrl: "",
      hotel: 0,
      hotelJustificationUrl: "",
      achat: 0,
      achatJustificationUrl: "",
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
  document.getElementById("hotel").value = dayData.hotel || 0;
  document.getElementById("achat").value = dayData.achat || 0;
  document.getElementById("peageJustification").value = "";
  document.getElementById("hotelJustification").value = "";
  document.getElementById("achatJustification").value = "";

  const existingPeageJustification = document.getElementById("existingPeageJustification");
  const peageJustificationLink = document.getElementById("peageJustificationLink");
  if (dayData.justificationUrl) {
    peageJustificationLink.href = dayData.justificationUrl;
    existingPeageJustification.style.display = "block";
  } else {
    existingPeageJustification.style.display = "none";
  }

  const existingHotelJustification = document.getElementById("existingHotelJustification");
  const hotelJustificationLink = document.getElementById("hotelJustificationLink");
  if (dayData.hotelJustificationUrl) {
    hotelJustificationLink.href = dayData.hotelJustificationUrl;
    existingHotelJustification.style.display = "block";
  } else {
    existingHotelJustification.style.display = "none";
  }

  const existingAchatJustification = document.getElementById("existingAchatJustification");
  const achatJustificationLink = document.getElementById("achatJustificationLink");
  if (dayData.achatJustificationUrl) {
    achatJustificationLink.href = dayData.achatJustificationUrl;
    existingAchatJustification.style.display = "block";
  } else {
    existingAchatJustification.style.display = "none";
  }

  document.getElementById("travelGroup").style.display = dayData.competition
    ? "block"
    : "none";
  document.getElementById("saveDay").disabled = false;
  document.getElementById("deleteDay").disabled = false;
  updateCurrentProfileUI();

  document.getElementById("dayModal").classList.add("active");
}

async function saveDay() {
  if (!currentCoach || !currentUser) return;
  const isVolunteer = __isVolunteerProfile(currentCoach);
  const existingId = timeData[`${currentCoach.id}-${selectedDay}`]?.id || null;

  const isAdmin = __isAdminForUi();
  if (!isAdmin && isCurrentMonthFrozen()) {
    alert(`Impossible d'enregistrer : le mois ${__formatMonthLabel(currentMonth)} est gelé.`);
    document.getElementById("dayModal").classList.remove("active");
    return;
  }

  const hours = isVolunteer
    ? 0
    : (parseFloat(document.getElementById("trainingHours").value) || 0);
  const competition = document.getElementById("competitionDay").checked;
  const km = parseFloat(document.getElementById("kilometers").value) || 0;
  const description =
    document.getElementById("competitionDescription").value.trim();
  const departurePlace = document
    .getElementById("departurePlace")
    .value.trim();
  const arrivalPlace = document.getElementById("arrivalPlace").value.trim();
  const peage = parseFloat(document.getElementById("peage").value) || 0;
  const hotel = parseFloat(document.getElementById("hotel").value) || 0;
  const achat = parseFloat(document.getElementById("achat").value) || 0;
  const peageFile = document.getElementById("peageJustification").files[0];
  const hotelFile = document.getElementById("hotelJustification").files[0];
  const achatFile = document.getElementById("achatJustification").files[0];

  const key = `${currentCoach.id}-${selectedDay}`;
  let existing = timeData[key];

  if (!existing) {
    const { data: existingRow, error: existingError } = await supabase
      .from('time_data')
      .select('*')
      .eq('coach_id', currentCoach.id)
      .eq('date', selectedDay)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingRow) {
      existing = {
        hours: existingRow.hours || 0,
        competition: !!existingRow.competition,
        km: existingRow.km || 0,
        description: existingRow.description || "",
        departurePlace: existingRow.departure_place || "",
        arrivalPlace: existingRow.arrival_place || "",
        peage: existingRow.peage || 0,
        justificationUrl: existingRow.justification_url || "",
        hotel: existingRow.hotel || 0,
        hotelJustificationUrl: existingRow.hotel_justification_url || "",
        achat: existingRow.achat || 0,
        achatJustificationUrl: existingRow.achat_justification_url || "",
        coachId: existingRow.coach_id || currentCoach.id,
        ownerUid: existingRow.owner_uid || null,
        ownerEmail: existingRow.owner_email || null,
        id: existingRow.id
      };
      timeData[key] = existing;
    }
  }

  let justificationUrl = existing ? existing.justificationUrl || "" : "";
  let hotelJustificationUrl = existing ? existing.hotelJustificationUrl || "" : "";
  let achatJustificationUrl = existing ? existing.achatJustificationUrl || "" : "";

  if (peageFile) {
    try {
      justificationUrl = await __uploadExpenseJustification(peageFile, 'peage');
    } catch (e) {
      alert("Erreur lors de l'upload du justificatif: " + e.message);
      return; // Don't save if upload fails
    }
  }

  if (hotelFile) {
    try {
      hotelJustificationUrl = await __uploadExpenseJustification(hotelFile, 'hotel');
    } catch (e) {
      alert("Erreur lors de l'upload du justificatif d'hôtel: " + e.message);
      return;
    }
  }

  if (achatFile) {
    try {
      achatJustificationUrl = await __uploadExpenseJustification(achatFile, 'achat');
    } catch (e) {
      alert("Erreur lors de l'upload du justificatif d'achat: " + e.message);
      return;
    }
  }

  if (hours === 0 && !competition && km === 0 && !description && peage === 0 && hotel === 0 && achat === 0) {
    if (existing && existing.id) {
      const { error } = await supabase.from('time_data').delete().eq('id', existing.id);
      if (error) throw error;
      await __logAuditEvent('time_data.delete', 'time_data', {
        entityId: existing.id,
        targetUserId: currentCoach.owner_uid || null,
        targetEmail: currentCoach.email || null,
        metadata: {
          coach_id: currentCoach.id,
          coach_name: __getCoachDisplayName(currentCoach) || currentCoach.name || null,
          date: selectedDay,
          month: __normalizeMonth(currentMonth),
          source: 'saveDay-empty-payload',
        },
      });
        await notifyAdminAlert(currentCoach.name, selectedDay, { deleted: true });
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
      hotel,
      achat,
      justification_url: justificationUrl,
      hotel_justification_url: hotelJustificationUrl,
      achat_justification_url: achatJustificationUrl,
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
        hotel,
        hotelJustificationUrl,
        achat,
        achatJustificationUrl,
        coachId: currentCoach.id,
        ownerUid: ownerUidForRow,
        ownerEmail: ownerEmailForRow,
        id: existing.id
      };
      await __logAuditEvent('time_data.update', 'time_data', {
        entityId: existing.id,
        targetUserId: currentCoach.owner_uid || null,
        targetEmail: currentCoach.email || null,
        metadata: {
          coach_id: currentCoach.id,
          coach_name: __getCoachDisplayName(currentCoach) || currentCoach.name || null,
          date: selectedDay,
          month: __normalizeMonth(currentMonth),
          hours,
          competition,
          km,
          peage,
          hotel,
          achat,
          had_existing_id: !!existingId,
        },
      });
        await notifyAdminAlert(currentCoach.name, selectedDay, timeData[key]);
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
        hotel,
        hotelJustificationUrl,
        achat,
        achatJustificationUrl,
        coachId: currentCoach.id,
        ownerUid: ownerUidForRow,
        ownerEmail: ownerEmailForRow,
        id: inserted[0].id
      };
      await __logAuditEvent('time_data.create', 'time_data', {
        entityId: inserted?.[0]?.id || null,
        targetUserId: currentCoach.owner_uid || null,
        targetEmail: currentCoach.email || null,
        metadata: {
          coach_id: currentCoach.id,
          coach_name: __getCoachDisplayName(currentCoach) || currentCoach.name || null,
          date: selectedDay,
          month: __normalizeMonth(currentMonth),
          hours,
          competition,
          km,
          peage,
          hotel,
          achat,
        },
      });
        await notifyAdminAlert(currentCoach.name, selectedDay, timeData[key]);
    }
  }

  document.getElementById("dayModal").classList.remove("active");
  updateCalendar();
  updateSummary();
}

async function deleteDay() {
  if (!currentCoach || !currentUser) return;

  const isAdmin = __isAdminForUi();
  if (!isAdmin && isCurrentMonthFrozen()) {
    alert(`Impossible de supprimer : le mois ${__formatMonthLabel(currentMonth)} est gelé.`);
    document.getElementById("dayModal").classList.remove("active");
    return;
  }

  const key = `${currentCoach.id}-${selectedDay}`;
  const existing = timeData[key];
  if (existing && existing.id) {
    const { error } = await supabase.from('time_data').delete().eq('id', existing.id);
    if (error) throw error;
    await __logAuditEvent('time_data.delete', 'time_data', {
      entityId: existing.id,
      targetUserId: currentCoach.owner_uid || null,
      targetEmail: currentCoach.email || null,
      metadata: {
        coach_id: currentCoach.id,
        coach_name: __getCoachDisplayName(currentCoach) || currentCoach.name || null,
        date: selectedDay,
        month: __normalizeMonth(currentMonth),
        source: 'deleteDay',
      },
    });
        await notifyAdminAlert(currentCoach.name, selectedDay, { deleted: true });
  }
  delete timeData[key];

  document.getElementById("dayModal").classList.remove("active");
  updateCalendar();
  updateSummary();
}

// ===== Summary & exports =====
function updateSummary() {
  updateCurrentProfileUI();

  if (!currentCoach || !currentMonth) {
    document.getElementById("totalHours").textContent = "0";
    document.getElementById("hourlyRate").textContent = "€0.00";
    document.getElementById("trainingPayment").textContent = "€0.00";
    document.getElementById("compDays").textContent = "0";
    document.getElementById("compPayment").textContent = "€0.00";
    document.getElementById("totalKm").textContent = "0";
    document.getElementById("kmPayment").textContent = "€0.00";
    document.getElementById("tollPayment").textContent = "€0.00";
    document.getElementById("hotelPayment").textContent = "€0.00";
    document.getElementById("purchasePayment").textContent = "€0.00";
    document.getElementById("urssafTotalPayment").textContent = "€0.00";
    document.getElementById("reimbursementTotalPayment").textContent = "€0.00";
    return;
  }

  const [year, month] = currentMonth.split("-");
  const isVolunteer = __isVolunteerProfile(currentCoach);
  let totalHours = 0;
  let compDays = 0;
  let tollPayment = 0;
  let hotelPayment = 0;
  let purchasePayment = 0;
  const mileageBreakdown = __getMonthlyMileageBreakdown(currentCoach, currentMonth);
  const totalKm = mileageBreakdown.totalKm;

  Object.keys(timeData).forEach((key) => {
    if (key.startsWith(`${currentCoach.id}-${year}-${month}`)) {
      const data = timeData[key];
      totalHours += data.hours || 0;
      if (data.competition) compDays++;
      tollPayment += data.peage || 0;
      hotelPayment += data.hotel || 0;
      purchasePayment += data.achat || 0;
    }
  });

  const trainingPayment = isVolunteer ? 0 : totalHours * currentCoach.hourly_rate;
  const compPayment = isVolunteer ? 0 : compDays * currentCoach.daily_allowance;
  const kmPayment = mileageBreakdown.totalAmount;
  const urssafTotalPayment = trainingPayment + compPayment;
  const reimbursementTotalPayment = kmPayment + tollPayment + hotelPayment + purchasePayment;

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
  document.getElementById("tollPayment").textContent = `€${tollPayment.toFixed(2)}`;
  document.getElementById("hotelPayment").textContent = `€${hotelPayment.toFixed(2)}`;
  document.getElementById("purchasePayment").textContent = `€${purchasePayment.toFixed(2)}`;
  document.getElementById(
    "urssafTotalPayment"
  ).textContent = `€${urssafTotalPayment.toFixed(2)}`;
  document.getElementById(
    "reimbursementTotalPayment"
  ).textContent = `€${reimbursementTotalPayment.toFixed(2)}`;
}

const __loadExcelJs = loadExcelJs;
const __blobToDataUrl = blobToDataUrl;
const __isStandaloneApp = isStandaloneApp;
const __downloadBlob = downloadBlob;

async function exportDeclarationXLS() {
  if (!currentCoach || !currentMonth) {
    alert("Veuillez sélectionner un profil et un mois.");
    return;
  }

  if (__isVolunteerProfile(currentCoach)) {
    alert("L'export de déclaration salaire n'est pas disponible pour un profil bénévole.");
    return;
  }

  const [year, month] = currentMonth.split("-");
  const rows = Object.keys(timeData)
    .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
    .sort()
    .map((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      const hours = Number(data.hours) || 0;
      const hourlyRate = Number(currentCoach.hourly_rate) || 0;
      const trainingAmount = hours * hourlyRate;
      const competitionAllowance = data.competition
        ? (Number(currentCoach.daily_allowance) || 0)
        : 0;
      const declaredTotal = trainingAmount + competitionAllowance;

      return {
        date,
        description: data.description || (data.competition ? "Jour de compétition" : "Entraînement"),
        hours,
        hourlyRate,
        trainingAmount,
        competition: !!data.competition,
        competitionAllowance,
        declaredTotal,
      };
    });

  if (!rows.length) {
    alert("Aucune donnée à déclarer pour ce mois.");
    return;
  }

  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const competitionDays = rows.reduce((sum, row) => sum + (row.competition ? 1 : 0), 0);
  const totalTrainingAmount = rows.reduce((sum, row) => sum + row.trainingAmount, 0);
  const totalCompetitionAllowance = rows.reduce((sum, row) => sum + row.competitionAllowance, 0);
  const grandTotal = rows.reduce((sum, row) => sum + row.declaredTotal, 0);
  const coachDisplayName = __getCoachDisplayName(currentCoach) || currentCoach.name;
  const exportDate = new Date().toLocaleDateString('fr-FR');

  const ExcelJS = await __loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Judo Club de Cattenom-Rodemack';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Déclaration salaire', {
    properties: { defaultRowHeight: 22 },
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.45,
        bottom: 0.45,
        header: 0.2,
        footer: 0.2,
      },
    },
    views: [{ showGridLines: false }],
  });

  worksheet.columns = [
    { width: 14 },
    { width: 28 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
  ];

  const navyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3460' } };
  const lightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FF' } };
  const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9F1FB' } };
  const border = {
    top: { style: 'thin', color: { argb: 'FFC7D2E0' } },
    left: { style: 'thin', color: { argb: 'FFC7D2E0' } },
    bottom: { style: 'thin', color: { argb: 'FFC7D2E0' } },
    right: { style: 'thin', color: { argb: 'FFC7D2E0' } },
  };

  try {
    const logoResponse = await fetch(new URL('logo-jcc.png', window.location.href));
    if (logoResponse.ok) {
      const logoBase64 = await __blobToDataUrl(await logoResponse.blob());
      const imageId = workbook.addImage({
        base64: logoBase64,
        extension: 'png',
      });
      worksheet.addImage(imageId, {
        tl: { col: 0.15, row: 0.15 },
        ext: { width: 58, height: 58 },
      });
    }
  } catch (e) {
    console.warn('Impossible de charger le logo pour l’export XLSX:', e);
  }

  worksheet.mergeCells('C1:H1');
  worksheet.getCell('C1').value = 'Déclaration salaire';
  worksheet.getCell('C1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF0F3460' } };

  worksheet.mergeCells('C2:H2');
  worksheet.getCell('C2').value = `Judo Club de Cattenom-Rodemack — période ${month}/${year}`;
  worksheet.getCell('C2').font = { name: 'Calibri', size: 11, color: { argb: 'FF526274' } };

  const metaRows = [
    ['Intervenant', coachDisplayName || 'Non renseigné', 'Mois déclaré', `${month}/${year}`],
    ['Adresse', currentCoach.address || 'Non renseignée', 'Taux horaire', Number(currentCoach.hourly_rate) || 0],
    ['Indemnité forfaitaire compétition', Number(currentCoach.daily_allowance) || 0, 'Date d’édition', exportDate],
  ];

  metaRows.forEach((values, index) => {
    const rowNumber = 5 + index;
    const row = worksheet.getRow(rowNumber);
    row.values = values;
    [1, 3].forEach((col) => {
      const cell = row.getCell(col);
      cell.fill = lightFill;
      cell.font = { bold: true, color: { argb: 'FF0F3460' } };
      cell.border = border;
    });
    [2, 4].forEach((col) => {
      const cell = row.getCell(col);
      cell.border = border;
      if (rowNumber === 6 && col === 4) {
        cell.numFmt = '#,##0.00 €';
      }
      if (rowNumber === 7 && col === 2) {
        cell.numFmt = '#,##0.00 €';
      }
    });
  });

  worksheet.mergeCells('A9:H9');
  const summaryTitle = worksheet.getCell('A9');
  summaryTitle.value = 'Synthèse à déclarer';
  summaryTitle.font = { bold: true, size: 12, color: { argb: 'FF0F3460' } };

  const summaryHeader = worksheet.getRow(10);
  summaryHeader.values = ['Heures prestées', 'Jours de compétition', 'Montant heures', 'Indemnités forfaitaires', 'Total déclaration'];
  summaryHeader.eachCell((cell, colNumber) => {
    if (colNumber <= 5) {
      cell.fill = navyFill;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.border = border;
      cell.alignment = { horizontal: 'center' };
    }
  });

  const summaryValues = worksheet.getRow(11);
  summaryValues.values = [totalHours, competitionDays, totalTrainingAmount, totalCompetitionAllowance, grandTotal];
  summaryValues.eachCell((cell, colNumber) => {
    if (colNumber <= 5) {
      cell.border = border;
      cell.alignment = { horizontal: colNumber <= 2 ? 'center' : 'right' };
      if (colNumber >= 3) cell.numFmt = '#,##0.00 €';
      if (colNumber === 1) cell.numFmt = '0.0';
    }
  });

  worksheet.mergeCells('A13:H13');
  const detailsTitle = worksheet.getCell('A13');
  detailsTitle.value = 'Détail de la déclaration';
  detailsTitle.font = { bold: true, size: 12, color: { argb: 'FF0F3460' } };

  const detailsHeader = worksheet.getRow(14);
  detailsHeader.values = ['Date', 'Libellé', 'Heures prestées', 'Taux horaire', 'Montant heures', 'Jour compétition', 'Indemnité forfaitaire', 'Total déclaré'];
  detailsHeader.eachCell((cell) => {
    cell.fill = navyFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.border = border;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  let detailRowNumber = 15;
  rows.forEach((rowData, index) => {
    const row = worksheet.getRow(detailRowNumber);
    row.values = [
      rowData.date,
      rowData.description,
      rowData.hours,
      rowData.hourlyRate,
      rowData.trainingAmount,
      rowData.competition ? 'Oui' : 'Non',
      rowData.competitionAllowance,
      rowData.declaredTotal,
    ];

    row.eachCell((cell, colNumber) => {
      cell.border = border;
      cell.alignment = {
        vertical: 'middle',
        horizontal: [3, 4, 5, 7, 8].includes(colNumber) ? 'right' : (colNumber === 6 ? 'center' : 'left'),
        wrapText: colNumber === 2,
      };
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
      if (colNumber === 3) cell.numFmt = '0.0';
      if ([4, 5, 7, 8].includes(colNumber)) cell.numFmt = '#,##0.00 €';
    });

    detailRowNumber += 1;
  });

  const totalRow = worksheet.getRow(detailRowNumber);
  totalRow.values = ['TOTAL', '', totalHours, '', totalTrainingAmount, competitionDays, totalCompetitionAllowance, grandTotal];
  totalRow.eachCell((cell, colNumber) => {
    cell.border = border;
    cell.fill = totalFill;
    cell.font = { bold: true };
    cell.alignment = {
      vertical: 'middle',
      horizontal: [3, 5, 6, 7, 8].includes(colNumber) ? 'right' : 'left',
    };
    if (colNumber === 3) cell.numFmt = '0.0';
    if ([5, 7, 8].includes(colNumber)) cell.numFmt = '#,##0.00 €';
  });

  worksheet.mergeCells(`A${detailRowNumber + 2}:H${detailRowNumber + 3}`);
  const noteCell = worksheet.getCell(`A${detailRowNumber + 2}`);
  noteCell.value = 'Ce fichier correspond à la déclaration salaire du mois. Il peut être ouvert dans Excel sans avertissement de format puis imprimé en PDF si nécessaire.';
  noteCell.alignment = { wrapText: true, vertical: 'top' };
  noteCell.border = border;
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };

  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = String(currentCoach.name || 'intervenant').replace(/[^a-z0-9_\-]/gi, '_');
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  __downloadBlob(blob, `declaration_salaire_${safeName}_${currentMonth}.xlsx`);
  await __logAuditEvent('export.declaration_xlsx', 'export', {
    entityId: `${currentCoach.id}-${currentMonth}`,
    targetUserId: currentCoach.owner_uid || null,
    targetEmail: currentCoach.email || null,
    metadata: {
      coach_id: currentCoach.id,
      coach_name: coachDisplayName || null,
      month: currentMonth,
      total_hours: totalHours,
      competition_days: competitionDays,
      total_amount: grandTotal,
    },
  });
}

function __closeMileagePreviewModal() {
  const modal = document.getElementById('mileagePreviewModal');
  if (modal) modal.classList.remove('active');
}

function __getMonthlyExpenseReceiptIssues(coachId, year, month) {
  const issues = [];

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${coachId}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key] || {};
      const missing = [];

      if ((data.peage || 0) > 0 && !data.justificationUrl) missing.push('péage');
      if ((data.hotel || 0) > 0 && !data.hotelJustificationUrl) missing.push('hôtel');
      if ((data.achat || 0) > 0 && !data.achatJustificationUrl) missing.push('achat');

      if (missing.length) {
        issues.push({ date, missing });
      }
    });

  return issues;
}

function updateCoachFormProfileUI(profileType = null) {
  const resolvedType = __getProfileType(profileType || document.getElementById("coachProfileType")?.value);
  const isVolunteer = resolvedType === 'benevole';
  const title = document.getElementById("coachModalTitle");
  const rateGroup = document.getElementById("coachRateGroup");
  const allowanceGroup = document.getElementById("dailyAllowanceGroup");

  if (title) title.textContent = isVolunteer ? "Bénévole" : "Entraîneur";
  if (rateGroup) rateGroup.style.display = isVolunteer ? "none" : "";
  if (allowanceGroup) allowanceGroup.style.display = isVolunteer ? "none" : "";
}

function updateCurrentProfileUI() {
  const isVolunteer = __isVolunteerProfile(currentCoach);
  [
    "summaryHoursItem",
    "summaryRateItem",
    "summaryTrainingPaymentItem",
    "summaryCompDaysItem",
    "summaryCompPaymentItem",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = isVolunteer ? "none" : "";
  });

  const urssafTotalItem = document.getElementById("summaryUrssafTotalItem");
  if (urssafTotalItem) urssafTotalItem.style.display = isVolunteer ? "none" : "";

  const reimbursementLabel = document.getElementById("reimbursementTotalLabel");
  if (reimbursementLabel) reimbursementLabel.textContent = isVolunteer ? "Total à rembourser" : "Remboursement frais";

  const trainingHoursGroup = document.getElementById("trainingHoursGroup");
  if (trainingHoursGroup) trainingHoursGroup.style.display = isVolunteer ? "none" : "";
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

function exportExpenseHTML() {
  if (!currentCoach || !currentMonth) {
    alert("Veuillez sélectionner un profil et un mois.");
    return;
  }
  const [year, month] = currentMonth.split("-");
  const today = new Date().toLocaleDateString("fr-FR");
  const mileageBreakdown = __getMonthlyMileageBreakdown(currentCoach, currentMonth);
  const receiptIssues = __getMonthlyExpenseReceiptIssues(currentCoach.id, year, month);

  if (receiptIssues.length) {
    const details = receiptIssues
      .map((issue) => `- ${issue.date} : justificatif manquant pour ${issue.missing.join(', ')}`)
      .join('\n');
    alert(`Impossible d'exporter la note de frais.\nAjoutez les justificatifs obligatoires pour :\n${details}`);
    return;
  }

  const rows = [];
  let total = 0;

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      const hasExpense = (data.km || 0) > 0 || (data.peage || 0) > 0 || (data.hotel || 0) > 0 || (data.achat || 0) > 0;
      if (!hasExpense) return;
      const mileage = mileageBreakdown.byKey[key] || { amount: 0, effectiveRate: 0 };
      const amount = mileage.amount + (data.peage || 0) + (data.hotel || 0) + (data.achat || 0);
      total += amount;
      rows.push({
        date,
        ...data,
        mileageAmount: mileage.amount,
        tollAmount: data.peage || 0,
        hotelAmount: data.hotel || 0,
        purchaseAmount: data.achat || 0,
        amount,
        effectiveRate: mileage.effectiveRate,
      });
    });

  if (total === 0) {
    alert("Aucune dépense saisie pour ce mois.");
    return;
  }

  const logoUrl = new URL('logo-jcc.png', window.location.href).href;
  const coachDisplayName = __getCoachDisplayName(currentCoach) || currentCoach.name;
  const profileLabel = __getProfileLabel(currentCoach, { capitalized: true });
  const signatureLabel = __isVolunteerProfile(currentCoach) ? 'Signature du bénévole' : 'Signature du salarié';
  const totalMileageAmount = rows.reduce((sum, row) => sum + (row.mileageAmount || 0), 0);
  const totalTollAmount = rows.reduce((sum, row) => sum + (row.tollAmount || 0), 0);
  const totalHotelAmount = rows.reduce((sum, row) => sum + (row.hotelAmount || 0), 0);
  const totalPurchaseAmount = rows.reduce((sum, row) => sum + (row.purchaseAmount || 0), 0);
  const totalMileageKm = rows.reduce((sum, row) => sum + (Number(row.km) || 0), 0);
  const mileageScaleDescription = __getMileageScaleDescription(currentCoach.fiscal_power);

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Note de frais - ${currentCoach.name} - ${month}/${year}</title>
<style>
  * {
    box-sizing: border-box;
  }

  @media print {
    @page { size: A4 portrait; margin: 15mm; }
    * {
      box-shadow: none !important;
      text-shadow: none !important;
      filter: none !important;
    }
    html, body {
      width: 194mm;
      margin: 0;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .no-print { display: none; }
    .page-shell {
      box-shadow: none;
      border: none;
      margin: 0;
      width: 194mm;
      max-width: 194mm;
      display: flex;
      border-radius: 0;
    }
    .page-inner {
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    .header,
    .header-brand {
      display: flex !important;
      flex-direction: row !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
    }
    .document-badge {
      text-align: right !important;
      min-width: 180px !important;
    }
    .info-grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
    .summary-grid {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
    .summary-card.total {
      grid-column: 1 / -1 !important;
    }
    .signature {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
    .info-row {
      grid-template-columns: 120px 1fr !important;
    }
  }
  
  body { 
    margin: 0;
    padding: 10px;
    background: #ffffff;
    color: #243447;
    font-family: Inter, Arial, sans-serif;
  }

  .page-shell {
    width: 194mm;
    max-width: 194mm;
    min-height: 245mm;
    margin: 0 auto;
    background: #ffffff;
    border: none;
    border-radius: 12px;
    box-shadow: none;
    display: flex;
    overflow: hidden;
  }

  .page-inner {
    padding: 8px 12px 12px;
    min-height: 245mm;
    display: flex;
    flex-direction: column;
  }

  .print-button {
    margin: 0 0 10px;
    padding: 8px 14px;
    background: linear-gradient(135deg, #0f3460, #145da0);
    color: white;
    border: none;
    border-radius: 999px;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 700;
    box-shadow: none;
  }

  .header { 
    display: flex; 
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 2px solid #d8e2ef;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }
  
  .header-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .header-logo {
    width: 54px;
    height: 54px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: #f5f8fc;
    border: 1px solid #d8e2ef;
  }
  
  .header-logo img { 
    max-width: 40px;
    max-height: 40px;
  }
  
  .header-text h1 {
    margin: 0 0 4px;
    font-size: 1.1rem;
    color: #0f3460;
  }
  
  .header-text p { 
    margin: 1px 0;
    color: #526274;
    font-size: 0.72rem;
  }

  .document-badge {
    text-align: right;
    min-width: 180px;
  }

  .document-badge .label {
    display: inline-block;
    padding: 5px 10px;
    border-radius: 999px;
    background: #eaf2ff;
    color: #145da0;
    font-weight: 700;
    font-size: 0.68rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .document-badge h2 {
    margin: 6px 0 2px;
    font-size: 1rem;
    color: #0f3460;
  }

  .document-badge p {
    margin: 0;
    color: #66788a;
    font-size: 0.75rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }

  .info-card,
  .summary-card,
  .note {
    border: 1px solid #d8e2ef;
    border-radius: 16px;
    background: #f9fbfe;
  }

  .info-card {
    padding: 10px 12px;
  }

  .info-card h3,
  .summary-section h3,
  .details-section h3 {
    margin: 0 0 8px;
    color: #0f3460;
    font-size: 0.86rem;
  }

  .info-list {
    display: grid;
    gap: 5px;
  }

  .info-row {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 6px;
    font-size: 0.74rem;
  }

  .info-row .label {
    color: #66788a;
    font-weight: 600;
  }

  .info-row .value {
    color: #243447;
    font-weight: 600;
  }

  .summary-section {
    margin-bottom: 10px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .summary-card {
    padding: 9px 10px;
    background: linear-gradient(180deg, #fbfdff 0%, #f1f6fc 100%);
  }

  .summary-card .label {
    display: block;
    color: #66788a;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 4px;
  }

  .summary-card .value {
    font-size: 0.94rem;
    font-weight: 800;
    color: #0f3460;
  }

  .summary-card.total {
    grid-column: 1 / -1;
  }

  .summary-card.total {
    background: linear-gradient(135deg, #0f3460, #145da0);
    border-color: transparent;
  }

  .summary-card.total .label,
  .summary-card.total .value {
    color: #ffffff;
  }

  .details-section {
    margin-top: 4px;
  }

  .table-wrap {
    width: 100%;
    border: 1px solid #d8e2ef;
    border-radius: 12px;
    overflow: hidden;
  }
  
  table { 
    border-collapse: separate;
    border-spacing: 0;
    width: 100%; 
    table-layout: fixed;
    background: #ffffff;
  }
  
  th, td { 
    border-bottom: 1px solid #e4ebf3;
    padding: 5px 6px; 
    font-size: 0.66rem;
    text-align: left;
    overflow-wrap: anywhere;
    word-break: break-word;
    vertical-align: top;
    line-height: 1.2;
  }
  
  thead th { 
    background: #0f3460; 
    color: #fff;
    font-weight: 700;
    position: sticky;
    top: 0;
  }

  tbody tr:nth-child(even) { 
    background: #f9fbfe; 
  }
  
  .amount,
  .number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .expense-cell {
    display: grid;
    gap: 3px;
  }

  .expense-cell strong {
    font-size: 0.68rem;
    color: #243447;
  }

  .route-line,
  .meta-line {
    color: #66788a;
    font-size: 0.62rem;
  }

  .justif-links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .justif-links a {
    display: inline-flex;
    align-items: center;
    padding: 2px 5px;
    border-radius: 999px;
    background: #eaf2ff;
    color: #145da0;
    text-decoration: none;
    font-weight: 700;
    font-size: 0.6rem;
  }

  .justif-empty {
    color: #8a98a8;
  }
  
  .total-row td { 
    font-weight: 800; 
    background: #edf4ff;
    color: #0f3460;
    border-bottom: none;
  }
  
  .note {
    margin-top: 8px;
    padding: 8px 10px;
    background: #fffaf0;
    border-left: 5px solid #f59e0b;
    font-size: 0.68rem;
    line-height: 1.35;
  }
  
  .signature { 
    margin-top: auto;
    padding-top: 20px;
    display: grid; 
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    page-break-inside: avoid;
  }
  
  .signature > div {
    min-height: 46px;
    border-top: 2px solid #243447;
    padding-top: 6px;
    text-align: center;
    font-weight: 600;
    font-size: 0.7rem;
  }

  th:nth-child(1), td:nth-child(1) { width: 10%; }
  th:nth-child(2), td:nth-child(2) { width: 33%; }
  th:nth-child(3), td:nth-child(3) { width: 7%; }
  th:nth-child(4), td:nth-child(4) { width: 10%; }
  th:nth-child(5), td:nth-child(5) { width: 9%; }
  th:nth-child(6), td:nth-child(6) { width: 9%; }
  th:nth-child(7), td:nth-child(7) { width: 9%; }
  th:nth-child(8), td:nth-child(8) { width: 13%; }

  @media screen and (max-width: 900px) {
    body {
      padding: 12px;
    }

    .page-inner {
      padding: 18px;
    }

    .header,
    .header-brand {
      flex-direction: column;
      align-items: flex-start;
    }

    .document-badge {
      text-align: left;
      min-width: 0;
    }

    .info-grid,
    .summary-grid,
    .signature {
      grid-template-columns: 1fr;
    }

    .summary-card.total {
      grid-column: auto;
    }

    .info-row {
      grid-template-columns: 1fr;
      gap: 4px;
    }
  }
</style>
</head>
<body>
  <div class="page-shell">
    <div class="page-inner">
      <button class="print-button no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>

      <div class="header">
        <div class="header-brand">
          <div class="header-logo">
            <img src="${logoUrl}" alt="Judo Club Cattenom-Rodemack" />
          </div>
          <div class="header-text">
            <h1>Judo Club de Cattenom-Rodemack</h1>
            <p>Dojo Communautaire</p>
            <p>3 rue St Exupery</p>
            <p>57570 Cattenom</p>
            <p>SIRET 30157248300024</p>
            <p>📧 judoclubcattenom@gmail.com – 📞 06 62 62 53 13</p>
          </div>
        </div>
        <div class="document-badge">
          <span class="label">Document de remboursement</span>
          <h2>Note de frais</h2>
          <p>Période ${month}/${year}</p>
        </div>
      </div>

      <div class="info-grid">
        <section class="info-card">
          <h3>Informations du demandeur</h3>
          <div class="info-list">
            <div class="info-row"><span class="label">Nom et prénom</span><span class="value">${coachDisplayName || "Non renseigné"}</span></div>
            <div class="info-row"><span class="label">Adresse</span><span class="value">${currentCoach.address || "Non renseignée"}</span></div>
            <div class="info-row"><span class="label">Poste</span><span class="value">${profileLabel}</span></div>
            <div class="info-row"><span class="label">Date d'édition</span><span class="value">${today}</span></div>
          </div>
        </section>

        <section class="info-card">
          <h3>Informations véhicule</h3>
          <div class="info-list">
            <div class="info-row"><span class="label">Véhicule</span><span class="value">${currentCoach.vehicle || "Non renseigné"}</span></div>
            <div class="info-row"><span class="label">Puissance fiscale</span><span class="value">${currentCoach.fiscal_power || "Non renseignée"} CV</span></div>
            <div class="info-row"><span class="label">Barème appliqué</span><span class="value">${mileageScaleDescription}</span></div>
            <div class="info-row"><span class="label">Mois concerné</span><span class="value">${month}/${year}</span></div>
          </div>
        </section>
      </div>

      <section class="summary-section">
        <h3>Synthèse des remboursements</h3>
        <div class="summary-grid">
          <div class="summary-card">
            <span class="label">Kilométrage</span>
            <span class="value">${totalMileageAmount.toFixed(2).replace('.', ',')} €</span>
          </div>
          <div class="summary-card">
            <span class="label">Péages</span>
            <span class="value">${totalTollAmount.toFixed(2).replace('.', ',')} €</span>
          </div>
          <div class="summary-card">
            <span class="label">Hôtel</span>
            <span class="value">${totalHotelAmount.toFixed(2).replace('.', ',')} €</span>
          </div>
          <div class="summary-card">
            <span class="label">Achats</span>
            <span class="value">${totalPurchaseAmount.toFixed(2).replace('.', ',')} €</span>
          </div>
          <div class="summary-card total">
            <span class="label">Total à rembourser</span>
            <span class="value">${total.toFixed(2).replace('.', ',')} €</span>
          </div>
        </div>
      </section>

      <section class="details-section">
        <h3>Détail des dépenses</h3>
        <div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Dépense / trajet</th>
        <th>Km</th>
        <th>Km €</th>
        <th>Péage</th>
        <th>Hôtel</th>
        <th>Achat</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>
${rows
  .map(
    (r) => `
      <tr>
        <td>${r.date}</td>
        <td>
          <div class="expense-cell">
            <strong>${r.description || "Déplacement judo"}</strong>
            <span class="route-line">${r.departurePlace || "-"} → ${r.arrivalPlace || "-"}</span>
            ${[
              r.justificationUrl ? `<a href="${r.justificationUrl}" target="_blank" rel="noopener noreferrer">Péage</a>` : '',
              r.hotelJustificationUrl ? `<a href="${r.hotelJustificationUrl}" target="_blank" rel="noopener noreferrer">Hôtel</a>` : '',
              r.achatJustificationUrl ? `<a href="${r.achatJustificationUrl}" target="_blank" rel="noopener noreferrer">Achat</a>` : ''
            ].filter(Boolean).length ? `<div class="justif-links">${[
              r.justificationUrl ? `<a href="${r.justificationUrl}" target="_blank" rel="noopener noreferrer">Péage</a>` : '',
              r.hotelJustificationUrl ? `<a href="${r.hotelJustificationUrl}" target="_blank" rel="noopener noreferrer">Hôtel</a>` : '',
              r.achatJustificationUrl ? `<a href="${r.achatJustificationUrl}" target="_blank" rel="noopener noreferrer">Achat</a>` : ''
            ].filter(Boolean).join('')}</div>` : '<span class="meta-line">Aucun justificatif</span>'}
          </div>
        </td>
        <td class="number">${r.km}</td>
        <td class="amount">${r.mileageAmount
          .toFixed(2)
          .replace(".", ",")} €</td>
        <td class="amount">${r.tollAmount.toFixed(2).replace(".", ",")} €</td>
        <td class="amount">${r.hotelAmount.toFixed(2).replace(".", ",")} €</td>
        <td class="amount">${r.purchaseAmount.toFixed(2).replace(".", ",")} €</td>
        <td class="amount">${r.amount
          .toFixed(2)
          .replace(".", ",")} €</td>
      </tr>`
  )
  .join("")}
      <tr class="total-row">
        <td colspan="7" class="amount">TOTAL TTC</td>
        <td class="amount">${total
          .toFixed(2)
          .replace(".", ",")} €</td>
      </tr>
    </tbody>
  </table>
        </div>
      </section>

      <div class="note">
        <strong>ℹ️ Note :</strong><br>
        Le remboursement kilométrique est calculé selon le barème légal applicable aux voitures, en fonction du kilométrage cumulé sur l'année civile et de la puissance fiscale du véhicule. Les péages, frais d'hôtel et achats pour le club sont ajoutés sur leur montant réel saisi. Un justificatif est obligatoire pour chaque péage, hôtel ou achat figurant sur cette note.
      </div>

      <div class="signature">
        <div>
          <strong>${signatureLabel}</strong><br><br><br>
          ${coachDisplayName || currentCoach.name}
        </div>
        <div>
          <strong>Signature de l'employeur</strong><br><br><br>
          Président du Judo Club
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

  const fileName = `note_frais_${currentCoach.name}_${currentMonth}.html`;

  __logAuditEvent('export.expense_html', 'export', {
    entityId: `${currentCoach.id}-${currentMonth}`,
    targetUserId: currentCoach.owner_uid || null,
    targetEmail: currentCoach.email || null,
    metadata: {
      coach_id: currentCoach.id,
      coach_name: coachDisplayName || null,
      month: currentMonth,
      total_amount: total,
      total_km: totalMileageKm,
      rows: rows.length,
    },
  });

  if (__isStandaloneApp()) {
    __showMileagePreviewModal(html, fileName);
    return;
  }

  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
  }
}



function exportTimesheetHTML() {
  if (!currentCoach || !currentMonth) {
    alert("Veuillez sélectionner un profil et un mois.");
    return;
  }
  const [year, month] = currentMonth.split("-");
  const today = new Date().toLocaleDateString("fr-FR");

  const rows = [];
  let totalHours = 0;
  let competitionDays = 0;
  let totalCompetitionAllowance = 0;
  let totalTrainingAmount = 0;
  const hourlyRate = Number(currentCoach.hourly_rate) || 0;
  const dailyAllowance = Number(currentCoach.daily_allowance) || 0;
  let totalAmount = 0;

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${currentCoach.id}-${year}-${month}`))
    .sort()
    .forEach((key) => {
      const date = key.split("-").slice(-3).join("-");
      const data = timeData[key];
      const hours = Number(data.hours) || 0;
      const competition = !!data.competition;

      if (hours > 0 || competition) {
        const trainingAmount = hours * hourlyRate;
        const competitionAllowance = competition ? dailyAllowance : 0;
        const lineTotal = trainingAmount + competitionAllowance;

        totalHours += hours;
        totalTrainingAmount += trainingAmount;
        if (competition) competitionDays += 1;
        totalCompetitionAllowance += competitionAllowance;
        totalAmount += lineTotal;

        rows.push({
          date,
          hours,
          competition,
          trainingAmount,
          competitionAllowance,
          lineTotal,
        });
      }
    });

  if (!rows.length) {
    alert("Aucune heure d'entraînement ni compétition saisie pour ce mois.");
    return;
  }

  const logoUrl = new URL('logo-jcc.png', window.location.href).href;
  const coachDisplayName = __getCoachDisplayName(currentCoach) || currentCoach.name;
  const profileLabel = __getProfileLabel(currentCoach, { capitalized: true });
  const signatureLabel = __isVolunteerProfile(currentCoach) ? 'Signature du bénévole' : 'Signature du salarié';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relevé d'heures - ${currentCoach.name} - ${month}/${year}</title>
<style>
  * { box-sizing: border-box; }
  @media print {
    @page { size: A4 portrait; margin: 8mm; }
    * { box-shadow: none !important; text-shadow: none !important; filter: none !important; }
    html, body {
      width: 194mm; margin: 0; background: white;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .no-print { display: none; }
    .page-shell { box-shadow: none; border: none; margin: 0; width: 194mm; max-width: 194mm; display: flex; border-radius: 0; }
    .page-inner { padding: 0; display: flex; flex-direction: column; }
    .header, .header-brand { display: flex !important; flex-direction: row !important; align-items: flex-start !important; justify-content: space-between !important; }
    .document-badge { text-align: right !important; min-width: 180px !important; }
    .info-grid, .summary-grid, .signature { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
    .info-row { grid-template-columns: 120px 1fr !important; }
    .summary-card.total { grid-column: 1 / -1 !important; }
  }
  body { margin: 0; padding: 10px; background: #ffffff; color: #243447; font-family: Inter, Arial, sans-serif; }
  .page-shell { width: 194mm; max-width: 194mm; min-height: 245mm; margin: 0 auto; background: #ffffff; border: none; border-radius: 12px; box-shadow: none; display: flex; overflow: hidden; }
  .page-inner { padding: 14px 16px 16px; min-height: 245mm; display: flex; flex-direction: column; }
  .print-button { margin: 0 0 10px; padding: 8px 14px; background: linear-gradient(135deg, #0f3460, #145da0); color: white; border: none; border-radius: 999px; cursor: pointer; font-size: 0.82rem; font-weight: 700; box-shadow: none; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 2px solid #d8e2ef; padding-bottom: 10px; margin-bottom: 10px; }
  .header-brand { display: flex; align-items: center; gap: 12px; }
  .header-logo { width: 54px; height: 54px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 12px; background: #f5f8fc; border: 1px solid #d8e2ef; }
  .header-logo img { max-width: 40px; max-height: 40px; }
  .header-text h1 { margin: 0 0 4px; font-size: 1.1rem; color: #0f3460; }
  .header-text p { margin: 1px 0; color: #526274; font-size: 0.72rem; }
  .document-badge { text-align: right; min-width: 180px; }
  .document-badge .label { display: inline-block; padding: 5px 10px; border-radius: 999px; background: #eaf2ff; color: #145da0; font-weight: 700; font-size: 0.68rem; letter-spacing: 0.03em; text-transform: uppercase; }
  .document-badge h2 { margin: 6px 0 2px; font-size: 1rem; color: #0f3460; }
  .document-badge p { margin: 0; color: #66788a; font-size: 0.75rem; }
  .info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }
  .info-card, .summary-card, .note { border: 1px solid #d8e2ef; border-radius: 16px; background: #f9fbfe; }
  .info-card { padding: 10px 12px; }
  .info-card h3, .summary-section h3, .details-section h3 { margin: 0 0 8px; color: #0f3460; font-size: 0.86rem; }
  .info-list { display: grid; gap: 5px; }
  .info-row { display: grid; grid-template-columns: 120px 1fr; gap: 6px; font-size: 0.74rem; }
  .info-row .label { color: #66788a; font-weight: 600; }
  .info-row .value { color: #243447; font-weight: 600; }
  .summary-section { margin-bottom: 10px; }
  .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .summary-card { padding: 9px 10px; background: linear-gradient(180deg, #fbfdff 0%, #f1f6fc 100%); }
  .summary-card .label { display: block; color: #66788a; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; }
  .summary-card .value { font-size: 0.94rem; font-weight: 800; color: #0f3460; }
  .summary-card.total { grid-column: 1 / -1; background: linear-gradient(135deg, #0f3460, #145da0); border-color: transparent; }
  .summary-card.total .label, .summary-card.total .value { color: #ffffff; }
  .details-section { margin-top: 4px; }
  .table-wrap { width: 100%; border: 1px solid #d8e2ef; border-radius: 12px; overflow: hidden; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; table-layout: fixed; background: #ffffff; }
  th, td { border-bottom: 1px solid #e4ebf3; padding: 6px 8px; font-size: 0.7rem; text-align: left; vertical-align: top; line-height: 1.3; }
  thead th { background: #0f3460; color: #fff; font-weight: 700; position: sticky; top: 0; }
  tbody tr:nth-child(even) { background: #f9fbfe; }
  .amount, .number { text-align: right; font-variant-numeric: tabular-nums; }
  .total-row td { font-weight: 800; background: #edf4ff; color: #0f3460; border-bottom: none; }
  .signature { margin-top: auto; padding-top: 20px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; page-break-inside: avoid; }
  .signature > div { min-height: 46px; border-top: 2px solid #243447; padding-top: 6px; text-align: center; font-weight: 600; font-size: 0.7rem; }
  th:nth-child(1), td:nth-child(1) { width: 16%; }
  th:nth-child(2), td:nth-child(2) { width: 14%; }
  th:nth-child(3), td:nth-child(3) { width: 14%; }
  th:nth-child(4), td:nth-child(4) { width: 18%; }
  th:nth-child(5), td:nth-child(5) { width: 18%; }
  th:nth-child(6), td:nth-child(6) { width: 20%; }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 10px; text-align: center;">
    <button class="print-button" onclick="window.print()">🖨 Imprimer / Enregistrer en PDF</button>
  </div>
  
  <div class="page-shell">
    <div class="page-inner">
      <div class="header">
        <div class="header-brand">
          <div class="header-logo">
            <img src="${logoUrl}" alt="Logo" crossorigin="anonymous">
          </div>
          <div class="header-text">
            <h1>Judo Club de Cattenom-Rodemack</h1>
            <p>Dojo Communautaire</p>
            <p>3 rue St Exupery</p>
            <p>57570 Cattenom</p>
            <p>SIRET 30157248300024</p>
            <p>📧 judoclubcattenom@gmail.com – 📞 06 62 62 53 13</p>
          </div>
        </div>
        <div class="document-badge">
          <span class="label">Relevé d'heures mensuel</span>
          <h2>${month}/${year}</h2>
          <p>Édité le ${today}</p>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <h3>Informations ${profileLabel}</h3>
          <div class="info-list">
            <div class="info-row"><span class="label">Nom complet</span><span class="value">${__escapeHtml(coachDisplayName)}</span></div>
            <div class="info-row"><span class="label">Email</span><span class="value">${__escapeHtml(currentCoach.email || "-")}</span></div>
            <div class="info-row"><span class="label">Statut</span><span class="value">${profileLabel}</span></div>
          </div>
        </div>
        <div class="info-card">
          <h3>Paramètres du mois</h3>
          <div class="info-list">
            <div class="info-row"><span class="label">Mois / Année</span><span class="value">${month}/${year}</span></div>
            <div class="info-row"><span class="label">Taux horaire</span><span class="value">${hourlyRate.toFixed(2)} €</span></div>
            <div class="info-row"><span class="label">Indemnité compétition</span><span class="value">${dailyAllowance.toFixed(2)} €</span></div>
          </div>
        </div>
      </div>

      <div class="summary-section">
        <h3>Récapitulatif</h3>
        <div class="summary-grid">
          <div class="summary-card">
            <span class="label">Total Heures</span>
            <span class="value">${totalHours}</span>
          </div>
          <div class="summary-card">
            <span class="label">Jours compétition</span>
            <span class="value">${competitionDays}</span>
          </div>
          <div class="summary-card">
            <span class="label">Indemnités compétition</span>
            <span class="value">${totalCompetitionAllowance.toFixed(2)} €</span>
          </div>
          <div class="summary-card total">
            <span class="label">Total à payer</span>
            <span class="value">${totalAmount.toFixed(2)} €</span>
          </div>
        </div>
      </div>

      <div class="details-section">
        <h3>Détail des heures et compétitions</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th class="number">Durée (heures)</th>
                <th class="amount">Taux</th>
                <th class="amount">Montant heures (€)</th>
                <th class="amount">Indemnité compétition (€)</th>
                <th class="amount">Total ligne (€)</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${r.date}</td>
                  <td class="number">${r.hours}</td>
                  <td class="amount">${hourlyRate.toFixed(2)} €</td>
                  <td class="amount">${r.trainingAmount.toFixed(2)}</td>
                  <td class="amount">${r.competitionAllowance.toFixed(2)}</td>
                  <td class="amount">${r.lineTotal.toFixed(2)}</td>
                </tr>
              `).join("")}
              <tr class="total-row">
                <td>Total</td>
                <td class="number">${totalHours}</td>
                <td class="amount">-</td>
                <td class="amount">${totalTrainingAmount.toFixed(2)}</td>
                <td class="amount">${totalCompetitionAllowance.toFixed(2)}</td>
                <td class="amount">${totalAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="signature">
        <div>${signatureLabel}</div>
        <div>Pour le club (Trésorier / Président)</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.open();
  win.document.write(html);
  win.document.close();
  
  __logAuditEvent('export.timesheet_pdf', currentCoach.id, {
    coach_name: coachDisplayName,
    month: currentMonth,
    total_hours: totalHours,
    total_amount: totalAmount,
  });
}

// Expose the function
window.exportMileageHTML = exportExpenseHTML;
window.exportExpenseHTML = exportExpenseHTML;
window.exportTimesheetHTML = exportTimesheetHTML;
// ===== Import JSON =====
async function importCoachData(data) {
  if (!currentCoach || !currentUser) {
    alert("Veuillez sélectionner un profil et vous connecter avant d'importer.");
    return;
  }

  if (data.entraineur && data.entraineur !== currentCoach.name) {
    const ok = confirm(
      `Le profil du fichier JSON est "${data.entraineur}", le profil sélectionné est "${currentCoach.name}". Continuer ?`
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
        hotel: 0,
        hotel_justification_url: "",
        achat: 0,
        achat_justification_url: "",
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
        hotel: 0,
        hotel_justification_url: "",
        achat: 0,
        achat_justification_url: "",
        owner_uid: currentUser.id,
        owner_email: currentUser.email
      });
    });
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('time_data').insert(inserts);
    if (error) throw error;
  }
  await __logAuditEvent('time_data.import_json', 'import', {
    entityId: `${currentCoach.id}-${currentMonth}`,
    targetUserId: currentCoach.owner_uid || null,
    targetEmail: currentCoach.email || null,
    metadata: {
      coach_id: currentCoach.id,
      coach_name: __getCoachDisplayName(currentCoach) || currentCoach.name || null,
      rows_inserted: inserts.length,
      source_profile_name: data.entraineur || null,
    },
  });
  await loadAllDataFromSupabase();
  updateCalendar();
  updateSummary();
  alert("Import terminé.");
}

// ===== Export backup JSON =====
function exportBackupJSON() {
  if (!currentCoach) {
    alert("Veuillez sélectionner un profil.");
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
        departure_place: data.departurePlace || data.departure_place || "",
        arrival_place: data.arrivalPlace || data.arrival_place || "",
        peage: data.peage || 0,
        justification_url: data.justificationUrl || data.justification_url || "",
        hotel: data.hotel || 0,
        hotel_justification_url: data.hotelJustificationUrl || data.hotel_justification_url || "",
        achat: data.achat || 0,
        achat_justification_url: data.achatJustificationUrl || data.achat_justification_url || "",
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
  __logAuditEvent('export.backup_json', 'export', {
    entityId: currentCoach.id,
    targetUserId: currentCoach.owner_uid || null,
    targetEmail: currentCoach.email || null,
    metadata: {
      coach_id: currentCoach.id,
      coach_name: __getCoachDisplayName(currentCoach) || currentCoach.name || null,
      entries: entries.length,
    },
  });
}

// Optionally expose some functions globally if needed
window.exportToCSV = exportDeclarationXLS;
window.exportDeclarationXLS = exportDeclarationXLS;
window.exportBackupJSON = exportBackupJSON;
window.saveCoach = saveCoach;
window.deleteCoach = deleteCoach;
window.inviteCoach = inviteCoach;
window.saveDay = saveDay;
window.deleteDay = deleteDay;





