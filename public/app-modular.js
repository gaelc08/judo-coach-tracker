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

// ===== Calendar UI (fully implemented) =====
import {
  initCalendarUi,
  updateCalendar,
  openDayModal,
  saveDay,
  deleteDay,
  loadCoaches as loadCoachesDropdown,
  clearCoachForm,
  updateCoachGreeting,
} from './modules/calendar-ui.js';

// ===== Coach manager (fully implemented) =====
import {
  initCoachManager,
  openCoachModal,
  saveCoach,
  deleteCoach,
  inviteCoach,
  inviteAdmin,
  updateCoachFormProfileUI,
  clearCoachForm as clearCoachFormManager,
} from './modules/coach-manager.js';

// ===== Summary UI (fully implemented) =====
import {
  initSummaryUi,
  updateSummary,
  updateFreezeUI,
  isCurrentMonthFrozen,
  toggleFreezeMonth,
  updateCurrentProfileUI,
} from './modules/summary-ui.js';

// ===== Feature modules =====
import { currencyDisplay, numberDisplay } from './modules/display-format.js';
import { blobToDataUrl, downloadBlob, isStandaloneApp, loadExcelJs } from './modules/export-runtime.js';
import { publicHolidaysFallback, schoolHolidaysFallback } from './modules/holidays-data.js';
import { createHolidayService } from './modules/holidays-service.js';
import { createInviteDebugTools } from './modules/invite-debug.js';
import { findExistingProfileByEmail, getCoachDisplayName, getCurrentUserDisplayName, getProfileLabel, getProfileType, isVolunteerProfile } from './modules/profile-utils.js';
import { syncHelloAssoMembers, getHelloAssoMembers, getLastSyncTime, parseHelloAssoCsv, importHelloAssoCsvData } from './modules/helloasso-service.js';

// ===== Admin service (fully implemented) =====
import { notifyAdminAlert, __isAdminForUi, initAdminService } from './modules/admin-service.js';

// ===== Export UI (fully extracted) =====
import { createExportUI } from './modules/export-ui.js';

// ===== HelloAsso UI (fully extracted) =====
import { createHelloAssoUI } from './modules/helloasso-ui.js';

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

// ===== Admin service init =====
initAdminService({
  supabase,
  getCurrentUser:        () => currentUser,
  getCurrentSession:     () => currentSession,
  getCurrentAccessToken: () => currentAccessToken,
});

// ===== Init calendar UI (inject supabase + audit logger) =====
initCalendarUi({ supabase, logAuditEvent: __logAuditEvent });

// ===== Init coach manager =====
initCoachManager({ supabase, coachWriteViaRest: __coachWriteViaRest, logAuditEvent: __logAuditEvent });

// ===== Init summary UI =====
initSummaryUi({ logAuditEvent: __logAuditEvent });

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
  setAuditLogs: (nextRows) => { /* handled via app-context */ },
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

function renderAuditLogs()         { return __auditController.renderAuditLogs(); }
async function loadAuditLogs()     { return await __auditController.loadAuditLogs(); }
async function openAuditLogsModal(){ return await __auditController.openAuditLogsModal(); }

// ===== Export UI =====
const __exportUI = createExportUI({
  getCurrentCoach:      () => currentCoach,
  getCurrentMonth:      () => currentMonth,
  getTimeData:          () => timeData,
  getSelectedDay:       () => selectedDay,
  getCurrentUser:       () => currentUser,
  getCurrentAccessToken: () => currentAccessToken,
  supabase,
  supabaseUrl,
  supabaseKey,
  logAuditEvent:            __logAuditEvent,
  buildMonthlyAuditPayload: __buildMonthlyAuditPayload,
  downloadBlob,
  loadExcelJs,
  blobToDataUrl,
  isStandaloneApp,
  escapeHtml:                   __escapeHtml,
  normalizeMonth:               __normalizeMonth,
  getCoachDisplayName:          __getCoachDisplayName,
  getProfileLabel:              __getProfileLabel,
  getProfileType:               __getProfileType,
  isVolunteerProfile:           __isVolunteerProfile,
  getMileageScaleDescription:   __getMileageScaleDescription,
  getMonthlyMileageBreakdown:   __getMonthlyMileageBreakdown,
  getMileageYearBreakdown:      __getMileageYearBreakdown,
  parseFiscalPower:             __parseFiscalPower,
  getMileageScaleBand:          __getMileageScaleBand,
  calculateAnnualMileageAmount: __calculateAnnualMileageAmount,
  getMileageYearBreakdownFn:    __getMileageYearBreakdown,
});

const exportDeclarationXLS           = __exportUI.exportDeclarationXLS;
const exportExpenseHTML              = __exportUI.exportExpenseHTML;
const exportTimesheetHTML            = __exportUI.exportTimesheetHTML;
const exportMonthlyExpenses          = __exportUI.exportMonthlyExpenses;
const exportBackupJSON               = __exportUI.exportBackupJSON;
const importCoachData                = __exportUI.importCoachData;
const openMileagePreviewModal        = __exportUI.openMileagePreviewModal;
const openMonthlySummaryPreviewModal = __exportUI.openMonthlySummaryPreviewModal;

// ===== HelloAsso UI =====
const __helloAssoUI = createHelloAssoUI({
  supabase,
  syncHelloAssoMembers,
  getHelloAssoMembers,
  getLastSyncTime,
  parseHelloAssoCsv,
  importHelloAssoCsvData,
  escapeHtml: __escapeHtml,
});

const openHelloAssoModal = __helloAssoUI.openHelloAssoModal;

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
