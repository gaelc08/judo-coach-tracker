// auth-listeners.js
// Handles auth form handlers + onAuthStateChange logic.
// All UI logic extracted from app-modular.js.

import { supabaseUrl, supabaseKey } from './env.js';
import {
  currentUser, currentSession, currentAccessToken, coaches, __eventListenersSetup,
  setCurrentUser, setCurrentSession, setCurrentAccessToken,
  setCoaches, setTimeData, setAuditLogs, setCurrentCoach, setEventListenersSetup,
} from './app-context.js';
import { __describeJwt, __hasAdminClaim } from './shared-utils.js';

let _supabase = null;
let _isCurrentUserAdminDB = null;
let _loadAllDataFromSupabase = null;
let _loadCoaches = null;
let _updateCoachGreeting = null;
let _updateCalendar = null;
let _updateSummary = null;
let _setupEventListeners = null;
let _inviteFlowActive = false;
let __adminCache = { userId: null, value: null, atMs: 0 };
let __adminInFlight = null;

export function initAuthListeners({
  supabase,
  isCurrentUserAdminDB,
  loadAllDataFromSupabase,
  loadCoaches,
  updateCoachGreeting,
  updateCalendar,
  updateSummary,
  setupEventListeners,
  inviteFlowActive,
  setInviteFlowActive,
}) {
  _supabase = supabase;
  _isCurrentUserAdminDB = isCurrentUserAdminDB;
  _loadAllDataFromSupabase = loadAllDataFromSupabase;
  _loadCoaches = loadCoaches;
  _updateCoachGreeting = updateCoachGreeting;
  _updateCalendar = updateCalendar;
  _updateSummary = updateSummary;
  _setupEventListeners = setupEventListeners;
  _inviteFlowActive = inviteFlowActive;
  _setInviteFlowActive = setInviteFlowActive;
}

let _setInviteFlowActive = null;

// ===== Admin check (with TTL cache) =====
export async function isCurrentUserAdminDB() {
  if (!currentUser) { console.log('DEBUG no currentUser'); return false; }

  const { isAdminViaLocalClaims } = await import('./auth-admin.js');
  const { isAdminViaRest } = await import('./auth-admin.js');

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
      __adminCache = { userId: currentUser.id, value: true, atMs: Date.now() };
      return true;
    }
    if (__adminCache.userId === currentUser.id && typeof __adminCache.value === 'boolean') {
      return __adminCache.value;
    }
    return false;
  } finally {
    __adminInFlight = null;
  }
}

export function invalidateAdminCache() {
  __adminCache = { userId: null, value: null, atMs: 0 };
  __adminInFlight = null;
}

// ===== Auth form listeners =====
export function setupAuthListeners() {
  console.log('DEBUG setupAuthListeners called');

  const emailInput     = document.getElementById('authEmail');
  const passwordInput  = document.getElementById('authPassword');
  const registerBtn    = document.getElementById('registerBtn');
  const loginBtn       = document.getElementById('loginBtn');
  const resetPasswordBtn = document.getElementById('resetPasswordBtn');
  const logoutBtn      = document.getElementById('logoutBtn');
  const statusSpan     = document.getElementById('authStatus');

  if (!loginBtn || !logoutBtn) {
    console.error('DEBUG loginBtn or logoutBtn not found in DOM');
  }

  registerBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass  = passwordInput.value.trim();
    if (!email || !pass) { alert('Veuillez saisir votre adresse e-mail et votre mot de passe.'); return; }
    try {
      const { data, error } = await _supabase.auth.signUp({ email, password: pass });
      if (error) throw error;
      statusSpan.textContent = 'Compte créé et connecté.';
    } catch (e) { alert(e.message); }
  });

  loginBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass  = passwordInput.value.trim();
    if (!email || !pass) { alert('Veuillez saisir votre adresse e-mail et votre mot de passe.'); return; }
    try {
      const { error } = await _supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    } catch (e) { alert(e.message); }
  });

  logoutBtn?.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    try {
      const { error } = await _supabase.auth.signOut({ scope: 'global' });
      if (error) { alert('Logout failed: ' + error.message); return; }
      setCurrentUser(null);
      document.getElementById('appContainer').style.display  = 'none';
      document.getElementById('authContainer').style.display = 'flex';
    } catch (e) {
      alert('Logout exception: ' + e.message);
    } finally {
      logoutBtn.disabled = false;
    }
  });

  resetPasswordBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) { alert('Veuillez saisir votre adresse e-mail.'); return; }
    try {
      const { error } = await _supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw error;
      alert('E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception.');
    } catch (e) { alert(e.message); }
  });

  // ===== onAuthStateChange =====
  _supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('DEBUG onAuthStateChange:', event, session);
    setCurrentSession(session || null);
    setCurrentAccessToken(session?.access_token || null);
    invalidateAdminCache();
    window.__lastSession = session;

    if (currentAccessToken) {
      console.log('DEBUG access token present:', String(currentAccessToken).slice(0, 12) + '...');
      console.log('DEBUG access token details:', __describeJwt(currentAccessToken));
    }

    // --- Invite flow ---
    if (event === 'SIGNED_IN' && _inviteFlowActive && session?.user) {
      document.getElementById('invitePasswordModal')?.classList.add('active');
      const inviteSetPasswordBtn = document.getElementById('inviteSetPasswordBtn');
      if (!inviteSetPasswordBtn) { console.warn('WARN missing element: #inviteSetPasswordBtn'); return; }
      inviteSetPasswordBtn.onclick = async () => {
        const newPass     = document.getElementById('inviteNewPasswordInput').value;
        const confirmPass = document.getElementById('inviteConfirmPasswordInput').value;
        if (!newPass)            { alert('Veuillez saisir un mot de passe.'); return; }
        if (newPass.length < 8)  { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
        if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas.'); return; }
        _setInviteFlowActive?.(false);
        _inviteFlowActive = false;
        document.getElementById('invitePasswordModal')?.classList.remove('active');
        const { error } = await _supabase.auth.updateUser({ password: newPass });
        if (error) {
          _inviteFlowActive = true;
          _setInviteFlowActive?.(true);
          document.getElementById('invitePasswordModal')?.classList.add('active');
          document.getElementById('inviteNewPasswordInput').value    = '';
          document.getElementById('inviteConfirmPasswordInput').value = '';
          alert(error.message);
        } else {
          document.getElementById('inviteNewPasswordInput').value    = '';
          document.getElementById('inviteConfirmPasswordInput').value = '';
        }
      };
      return;
    }

    // --- Password recovery ---
    if (event === 'PASSWORD_RECOVERY') {
      document.getElementById('passwordResetModal')?.classList.add('active');
      const updatePasswordBtn = document.getElementById('updatePasswordBtn');
      if (!updatePasswordBtn) { console.warn('WARN missing element: #updatePasswordBtn'); return; }
      updatePasswordBtn.onclick = async () => {
        const newPass     = document.getElementById('newPasswordInput').value;
        const confirmPass = document.getElementById('confirmPasswordInput').value;
        if (!newPass)            { alert('Veuillez saisir un nouveau mot de passe.'); return; }
        if (newPass.length < 8)  { alert('Le mot de passe doit contenir au moins 8 caractères.'); return; }
        if (newPass !== confirmPass) { alert('Les mots de passe ne correspondent pas.'); return; }
        const { error } = await _supabase.auth.updateUser({ password: newPass });
        if (error) {
          alert(error.message);
        } else {
          document.getElementById('newPasswordInput').value    = '';
          document.getElementById('confirmPasswordInput').value = '';
          document.getElementById('passwordResetModal')?.classList.remove('active');
          alert('Mot de passe mis à jour avec succès. Veuillez vous reconnecter.');
          await _supabase.auth.signOut();
        }
      };
      return;
    }

    const statusSpanInner = document.getElementById('authStatus');
    const select          = document.getElementById('coachSelect');
    const user            = session?.user;

    if (user) {
      setCurrentUser(user);
      if (statusSpanInner) statusSpanInner.textContent = `Connecté : ${user.email}`;
      document.getElementById('authContainer').style.display = 'none';
      document.getElementById('appContainer').style.display  = 'block';

      const isAdmin = await isCurrentUserAdminDB();
      const adminEls = [
        'adminActionsPanel', 'addCoachBtn', 'editCoachBtn', 'inviteAdminBtn',
        'freezeBtn', 'auditLogsBtn', 'helloAssoBtn', 'exportMonthlyExpensesBtn',
        'importGroup', 'backupBtn',
      ];
      adminEls.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'adminActionsPanel' || id === 'importGroup') {
          el.style.display = isAdmin ? (id === 'importGroup' ? 'flex' : 'block') : 'none';
        } else {
          el.style.display = isAdmin ? 'inline-block' : 'none';
        }
      });

      // Calendar tabs visible for all logged-in users
      const calendarTabs = document.getElementById('calendarTabs');
      if (calendarTabs) calendarTabs.style.display = 'flex';

      if (select) select.disabled = !isAdmin;
      _updateCoachGreeting?.(user, null, isAdmin);

      const prevCoaches    = coaches.slice();
      const prevCurrentCoach = currentUser;

      try {
        await _loadAllDataFromSupabase({ isAdminOverride: isAdmin });
        if (select) _loadCoaches?.();
        if (!isAdmin && coaches.length > 0) {
          setCurrentCoach(coaches[0]);
          if (select) select.value = String(coaches[0].id);
        }
      } catch (e) {
        console.error('Failed to load data:', e);
        if (select) _loadCoaches?.();
      }

      _updateCoachGreeting?.(user, !isAdmin && coaches.length > 0 ? coaches[0] : null, isAdmin);

      if (!__eventListenersSetup) {
        _setupEventListeners?.();
        setEventListenersSetup(true);
      }
      try { _updateCalendar?.(); _updateSummary?.(); } catch (e) { console.error('Failed to update UI:', e); }

    } else {
      setCurrentUser(null);
      setCurrentSession(null);
      setCurrentAccessToken(null);
      setCoaches([]);
      setTimeData({});
      setAuditLogs([]);
      setCurrentCoach(null);
      if (select) select.innerHTML = '<option value="">-- Sélectionner --</option>';
      if (statusSpanInner) statusSpanInner.textContent = 'Non connecté.';
      document.getElementById('authContainer').style.display = 'flex';
      document.getElementById('appContainer').style.display  = 'none';
      const calendarTabsOut = document.getElementById('calendarTabs');
      if (calendarTabsOut) calendarTabsOut.style.display = 'none';
      _updateCoachGreeting?.(null, null, true);
    }
  });
}
