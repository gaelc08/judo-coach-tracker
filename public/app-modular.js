// app-modular.js — Thin entry point
// Imports all modules and wires them together.
// Do NOT add business logic here; it belongs in the modules.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ===== Environment & Config =====
import {
  BUILD_ID as __BUILD_ID,
  VERSION_DATE as __VERSION_DATE,
  VERSION_INCREMENT as __VERSION_INCREMENT,
  effectiveEnv as __effectiveEnv,
  supabaseKey,
  supabaseUrl,
} from './modules/env.js';

// ===== Supabase client (singleton, debug-wrapped) =====
import {
  supabase,
  debugSupabaseHealthFetch,
  __inviteFlowActive as __inviteFlowActiveInit,
  setInviteFlowActive,
} from './modules/supabase-client.js';

// ===== Shared state & context =====
import {
  coaches, timeData, currentCoach, frozenMonths,
  currentUser, currentSession, currentAccessToken,
  auditLogs, currentMonth, selectedDay, editMode, editingCoachId,
  setCurrentCoach, setCurrentMonth, setSelectedDay,
  setEditMode, setEditingCoachId,
  __buildAuditPayload, __buildMonthlyAuditPayload, __getFreshAccessToken,
  __getCoachDisplayName, __getProfileType, __isVolunteerProfile, __getProfileLabel,
  __getCurrentUserDisplayName, __findExistingProfileByEmail,
  __parseFiscalPower, __getMileageScaleBand, __getLegacyKmRateFromFiscalPower,
  __formatNumberFr, __getMileageScaleDescription, __calculateAnnualMileageAmount,
  __getMileageYearBreakdown, __getMonthlyMileageBreakdown,
} from './modules/app-context.js';

// ===== Shared utilities =====
import {
  __decodeJwtPayload, __describeJwt, __escapeHtml, __hasAdminClaim,
  __maskEmail, __normalizeEmail, __normalizeMonth, __safeBase64UrlDecode, __toAuditJson,
} from './modules/shared-utils.js';

// ===== Auth modules =====
import { isAdminViaLocalClaims, isAdminViaRest } from './modules/auth-admin.js';
import { createAuthNoHangLock, createAuthStorage, detectInviteFlowFromUrlHash } from './modules/auth-runtime.js';
import {
  isCurrentUserAdminDB,
  setupAuthListeners,
  initAuthListeners,
  invalidateAdminCache,
} from './modules/auth-listeners.js';

// ===== Data modules =====
import { loadAllDataFromSupabase, loadCoaches, initDataLoader } from './modules/data-loader.js';
import { createRestGateway } from './modules/rest-gateway.js';

// ===== UI modules =====
import { auditMatchesCurrentCoach, formatAuditAction, formatAuditDateTime, formatAuditDetails, getAuditActionGroup } from './modules/audit-ui.js';
import { createAuditController } from './modules/audit-controller.js';
import { setupEventListeners, initEventListeners } from './modules/event-listeners.js';
import { setupPWA } from './modules/pwa.js';

// ===== Feature modules =====
import { currencyDisplay, numberDisplay } from './modules/display-format.js';
import { blobToDataUrl, downloadBlob, isStandaloneApp, loadExcelJs } from './modules/export-runtime.js';
import { publicHolidaysFallback, schoolHolidaysFallback } from './modules/holidays-data.js';
import { createHolidayService } from './modules/holidays-service.js';
import { createInviteDebugTools } from './modules/invite-debug.js';
import { findExistingProfileByEmail, getCoachDisplayName, getCurrentUserDisplayName, getProfileLabel, getProfileType, isVolunteerProfile } from './modules/profile-utils.js';
import { syncHelloAssoMembers, getHelloAssoMembers, getLastSyncTime, parseHelloAssoCsv, importHelloAssoCsvData } from './modules/helloasso-service.js';

console.log('DEBUG BUILD:', __BUILD_ID);

// ===== REST Gateway =====
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
const __restSelect        = __restGateway.restSelect;
const __logAuditEvent     = __restGateway.logAuditEvent;

// ===== Data loader init =====
initDataLoader({ restSelect: __restSelect });

// ===== Invite debug tools =====
const __inviteDebugTools = createInviteDebugTools({
  buildId: __BUILD_ID,
  maskEmail: __maskEmail,
  describeJwt: __describeJwt,
  getCurrentUser: () => currentUser,
  getCurrentSession: () => currentSession,
  getCurrentAccessToken: () => currentAccessToken,
  getInviteDebugLast: () => window.__inviteDebugLast || null,
});
const __collectInviteDebug    = __inviteDebugTools.collectInviteDebug;
const __getInviteDebugReport  = __inviteDebugTools.getInviteDebugReport;
const __copyInviteDebugReport = __inviteDebugTools.copyInviteDebugReport;
__inviteDebugTools.installGlobalDebugApis();

// ===== Holiday service =====
const __holidayService = createHolidayService({
  publicFallback: publicHolidaysFallback,
  schoolFallback: schoolHolidaysFallback,
  fetchImpl: globalThis.fetch?.bind(globalThis),
  logger: console,
});
const fetchPublicHolidays = __holidayService.fetchPublicHolidays;
const fetchSchoolHolidays = __holidayService.fetchSchoolHolidays;

let publicHolidays = {};
let schoolHolidays = [];

// ===== Audit controller =====
const __auditController = createAuditController({
  getAuditLogs: () => auditLogs,
  setAuditLogs: (nextRows) => { /* handled via app-context setAuditLogs */ },
  getCurrentCoach: () => currentCoach,
  getCurrentMonth: () => currentMonth,
  restSelect: __restSelect,
  isAdminForUi: __isAdminForUi,
  escapeHtml: __escapeHtml,
  formatAuditDateTime,
  formatAuditAction,
  formatAuditDetails,
  getAuditActionGroup,
  auditMatchesCurrentCoach,
  normalizeEmail: __normalizeEmail,
  normalizeMonth: __normalizeMonth,
  getElementById: (id) => document.getElementById(id),
  alertFn: (message) => alert(message),
});

function renderAuditLogs()      { return __auditController.renderAuditLogs(); }
async function loadAuditLogs()  { return await __auditController.loadAuditLogs(); }
async function openAuditLogsModal() { return await __auditController.openAuditLogsModal(); }

// ===== Freeze helpers =====
function isCurrentMonthFrozen() {
  if (!currentCoach || !currentMonth) return false;
  return frozenMonths.has(`${currentCoach.id}-${__normalizeMonth(currentMonth)}`);
}

function updateFreezeUI() {
  const frozen = isCurrentMonthFrozen();
  const banner = document.getElementById('frozenBanner');
  const btn    = document.getElementById('freezeBtn');
  if (banner) banner.style.display = frozen ? 'block' : 'none';
  if (btn) {
    btn.textContent = frozen ? '🔓 Dégeler la fiche' : '🔒 Geler la fiche';
    btn.classList.toggle('frozen', frozen);
  }
}

async function toggleFreezeMonth() {
  if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'admin peut geler ou dégeler une fiche."); return; }
  if (!currentAccessToken) { alert('Session invalide. Reconnectez-vous puis réessayez.'); return; }

  const normalizedMonth = __normalizeMonth(currentMonth);
  const frozen = isCurrentMonthFrozen();
  const key    = `${currentCoach.id}-${normalizedMonth}`;

  if (frozen) {
    const urlObj = new URL(`${supabaseUrl}/rest/v1/frozen_timesheets`);
    urlObj.searchParams.set('coach_id', `eq.${currentCoach.id}`);
    urlObj.searchParams.set('month',    `eq.${normalizedMonth}`);
    const res = await globalThis.fetch(urlObj.toString(), {
      method: 'DELETE',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` },
    });
    if (!res.ok) { alert('Erreur lors du dégel : ' + (await res.text())); return; }
    frozenMonths.delete(key);
    await __logAuditEvent('timesheet.unfreeze', 'frozen_timesheet', __buildMonthlyAuditPayload({ entityId: key, month: normalizedMonth }));
  } else {
    const res = await globalThis.fetch(`${supabaseUrl}/rest/v1/frozen_timesheets`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${currentAccessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify({ coach_id: currentCoach.id, month: normalizedMonth, frozen_by: currentUser?.email || null }),
    });
    if (!res.ok) { alert('Erreur lors du gel : ' + (await res.text())); return; }
    frozenMonths.add(key);
    await __logAuditEvent('timesheet.freeze', 'frozen_timesheet', __buildMonthlyAuditPayload({ entityId: key, month: normalizedMonth }));
  }
  setCurrentMonth(normalizedMonth);
  updateFreezeUI();
}

// ===== Admin UI helper =====
function __isAdminForUi() {
  // Synchronous heuristic — uses cached admin state or local claims.
  // For accurate async check use isCurrentUserAdminDB().
  return !!window.__cachedIsAdmin;
}

// ===== Notify admin (coach-side) =====
async function notifyAdminAlert(coachName, date, data) {
  if (__isAdminForUi()) return;
  try {
    await supabase.functions.invoke('alert-admin', { body: { coachName, date, data } });
  } catch (err) { console.error('Failed to notify admin', err); }
}

// ===== UI stubs — implemented in their own modules =====
// These forward declarations allow other modules to reference them before
// their full implementations are loaded.
function updateCalendar()   { console.warn('updateCalendar: not yet wired'); }
function updateSummary()    { console.warn('updateSummary: not yet wired'); }
function updateCoachGreeting(user, coach, isAdmin) { /* implemented in coach-manager or ui module */ }
function openCoachModal(mode) { /* implemented in coach-manager */ }
function saveCoach()   { /* implemented in coach-manager */ }
function deleteCoach() { /* implemented in coach-manager */ }
function inviteCoach() { /* implemented in admin-service */ }
function inviteAdmin() { /* implemented in admin-service */ }
function openDayModal(date) { /* implemented in calendar-ui */ }
function saveDay()   { /* implemented in calendar-ui */ }
function deleteDay() { /* implemented in calendar-ui */ }
function exportDeclarationXLS()    { /* implemented in export-ui */ }
function exportTimesheetHTML()     { /* implemented in export-ui */ }
function exportExpenseHTML()       { /* implemented in export-ui */ }
function exportMonthlyExpenses()   { /* implemented in export-ui */ }
function openMileagePreviewModal() { /* implemented in export-ui */ }
function openMonthlySummaryPreviewModal() { /* implemented in summary-ui */ }
function importCoachData(file) { /* implemented in data-loader or admin-service */ }
function exportBackupJSON()    { /* implemented in export-ui */ }
async function openHelloAssoModal() { /* implemented in helloasso-ui */ }

// ===== Wire auth-listeners =====
initAuthListeners({
  supabase,
  isCurrentUserAdminDB,
  loadAllDataFromSupabase,
  loadCoaches,
  updateCoachGreeting,
  updateCalendar,
  updateSummary,
  setupEventListeners,
  inviteFlowActive: __inviteFlowActiveInit,
  setInviteFlowActive,
});

// ===== Wire event-listeners =====
initEventListeners({
  supabase,
  updateCalendar,
  updateSummary,
  openCoachModal,
  saveCoach,
  deleteCoach,
  inviteCoach,
  inviteAdmin,
  openDayModal,
  saveDay,
  deleteDay,
  toggleFreezeMonth,
  openAuditLogsModal,
  openHelloAssoModal,
  exportDeclarationXLS,
  exportTimesheetHTML,
  exportExpenseHTML,
  exportMonthlyExpenses,
  openMileagePreviewModal,
  openMonthlySummaryPreviewModal,
  importCoachData,
  exportBackupJSON,
});

// ===== Environment banner & version badge =====
function setupEnvironmentBanner() {
  const envBanner = document.getElementById('envBanner');
  if (!envBanner) return;
  if (__effectiveEnv !== 'dev') { envBanner.style.display = 'none'; return; }
  envBanner.textContent = `🧪 ENVIRONNEMENT DEV — ${supabaseUrl}`;
  envBanner.style.display = 'block';
}

function setupVersionBadge() {
  const el = document.getElementById('appVersion');
  if (el) el.textContent = `v${__BUILD_ID}`;
}

function setupHelpVersion() {
  const el = document.getElementById('helpVersion');
  if (!el) return;
  el.innerHTML = `
    <span class="help-version-label">Version</span>
    <span class="help-version-date">${__VERSION_DATE}</span>
    <span class="help-version-build">#${__VERSION_INCREMENT}</span>
  `;
}

async function debugSession() {
  try {
    const res = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timed out after 3000ms (startup)')), 3000)),
    ]);
    console.log('DEBUG Supabase session:', res);
  } catch (e) {
    console.error('DEBUG getSession failed:', e);
  }
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('DEBUG DOMContentLoaded');
  setupEnvironmentBanner();
  setupVersionBadge();
  setupHelpVersion();
  setupPWA();
  setupAuthListeners();
  debugSession();
  debugSupabaseHealthFetch();
});
