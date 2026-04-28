// event-listeners.js
// Binds all UI event handlers after login.
// Extracted from app-modular.js.

import {
  currentMonth, currentCoach, coaches,
  setCurrentCoach, setCurrentMonth,
} from './app-context.js';
import { __normalizeMonth } from './shared-utils.js';

let _handlers = {};

export function initEventListeners(handlers) {
  _handlers = handlers;
}

// ===== Admin panel collapsible toggle =====
function initAdminPanelToggle() {
  const toggle = document.getElementById('adminPanelToggle');
  const body   = document.getElementById('adminPanelBody');
  if (!toggle || !body) return;
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    body.classList.toggle('open', !expanded);
  });
}

// ===== Competitions section toggle =====
let _competitionsVisible = false;

function toggleCompetitionsSection(show) {
  const section = document.getElementById('competitionsSection');
  if (!section) return;
  _competitionsVisible = show !== undefined ? show : !_competitionsVisible;
  section.style.display = _competitionsVisible ? 'block' : 'none';
  if (_competitionsVisible) {
    // Dynamically import to avoid circular dep at load time
    import('./competitions-ui.js').then((m) => m.showCompetitionsSection());
  }
}

// ===== Calendar tabs =====
function initCalendarTabs() {
  const tabs      = document.getElementById('calendarTabs');
  const calendar  = document.getElementById('calendar');
  const compSect  = document.getElementById('competitionsSection');
  const frozenBanner = document.getElementById('frozenBanner');
  if (!tabs) return;

  tabs.querySelectorAll('.calendar-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      // deactivate all
      tabs.querySelectorAll('.calendar-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const tab = btn.dataset.tab;
      if (tab === 'planning') {
        if (calendar)     calendar.style.display     = '';
        // Restore frozenBanner based on actual freeze state (re-apply via updateFreezeUI if available, else unhide)
        if (frozenBanner) {
          // frozenBanner was hidden by competitions tab; restore its last known display
          const frozen = frozenBanner.dataset.frozenState;
          frozenBanner.style.display = frozen === 'block' ? 'block' : 'none';
          delete frozenBanner.dataset.frozenState;
        }
        toggleCompetitionsSection(false);
      } else if (tab === 'competitions') {
        // Save frozenBanner current display before hiding
        if (frozenBanner) {
          frozenBanner.dataset.frozenState = frozenBanner.style.display;
          frozenBanner.style.display = 'none';
        }
        if (calendar)     calendar.style.display     = 'none';
        toggleCompetitionsSection(true);
      }
    });
  });
}

export function setupEventListeners() {
  const {
    updateCalendar, updateSummary,
    openCoachModal, saveCoach, deleteCoach,
    inviteCoach, inviteAdmin,
    openDayModal, saveDay, deleteDay,
    toggleFreezeMonth,
    openAuditLogsModal, openHelloAssoModal,
    exportDeclarationXLS, exportTimesheetHTML,
    exportExpenseHTML, exportMonthlyExpenses,
    openMileagePreviewModal, openMonthlySummaryPreviewModal,
    importCoachData, exportBackupJSON,
    supabase,
  } = _handlers;

  const bindClick  = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) { console.warn(`WARN missing element for click binding: #${id}`); return null; }
    el.onclick = handler;
    return el;
  };
  const bindChange = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) { console.warn(`WARN missing element for change binding: #${id}`); return null; }
    el.onchange = handler;
    return el;
  };

  // Month picker — init to currentMonth
  const monthSelectEl = document.getElementById('monthSelect');
  if (monthSelectEl) monthSelectEl.value = currentMonth;

  // App-level logout button (header)
  const logoutBtnApp = document.getElementById('logoutBtnApp');
  if (logoutBtnApp) {
    logoutBtnApp.addEventListener('click', async () => {
      logoutBtnApp.disabled = true;
      try {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) { alert('Déconnexion échouée : ' + error.message); return; }
        document.getElementById('appContainer').style.display  = 'none';
        document.getElementById('authContainer').style.display = 'flex';
      } catch (e) {
        alert('Erreur de déconnexion : ' + e.message);
      } finally {
        logoutBtnApp.disabled = false;
      }
    });
  }

  // Month select
  bindChange('monthSelect', (e) => {
    setCurrentMonth(e.target.value);
    updateCalendar?.();
    updateSummary?.();
  });

  // Coach select
  bindChange('coachSelect', async (e) => {
    const coach = coaches.find((c) => String(c.id) === String(e.target.value));
    setCurrentCoach(coach || null);
    await updateCalendar?.();
    updateSummary?.();
  });

  // Coach management
  bindClick('addCoachBtn',    () => openCoachModal?.('add'));
  bindClick('editCoachBtn',   () => openCoachModal?.('edit', currentCoach));
  bindClick('cancelCoach',    () => {
    document.getElementById('coachModal')?.classList.remove('active');
  });
  bindClick('inviteAdminBtn', () => inviteAdmin?.());

  // Freeze
  bindClick('freezeBtn', () => toggleFreezeMonth?.());

  // Audit / HelloAsso
  bindClick('auditLogsBtn', () => openAuditLogsModal?.());
  bindClick('helloAssoBtn', () => openHelloAssoModal?.());

  // Admin panel collapsible & calendar tabs
  initAdminPanelToggle();
  initCalendarTabs();

  // Export — IDs correspondent aux boutons dans index.html
  bindClick('exportMonthlyExpensesBtn',   () => openMonthlySummaryPreviewModal?.());
  bindClick('backupBtn',                  () => exportBackupJSON?.());

  // Boutons export coach-level (visibles dans le panneau coach)
  // Ces boutons sont injectés dynamiquement dans le DOM par le module summary/export
  // => on les bind via délégation sur document pour éviter les WARN au démarrage
  document.addEventListener('click', (e) => {
    const id = e.target?.id;
    if (id === 'exportDeclarationBtn')                        exportDeclarationXLS?.();
    else if (id === 'exportTimesheetBtn' || id === 'timesheetBtn') exportTimesheetHTML?.();
    else if (id === 'exportExpenseBtn'   || id === 'mileageBtn')   exportExpenseHTML?.();
    else if (id === 'exportMileagePreviewBtn')                 openMileagePreviewModal?.();
    else if (id === 'monthlySummaryPreviewBtn')                openMonthlySummaryPreviewModal?.();
  });

  // Import / Backup
  const importInput = document.getElementById('importFile');
  if (importInput) {
    importInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) importCoachData?.(file);
      importInput.value = '';
    };
  }

  // Coach modal save/delete/invite
  // HTML ids: saveCoach, deleteCoach, inviteCoach (sans suffixe Btn)
  bindClick('saveCoach',   () => saveCoach?.());
  bindClick('deleteCoach', () => deleteCoach?.());
  bindClick('inviteCoach', () => inviteCoach?.());

  // Day modal save/delete
  // HTML ids: saveDay, deleteDay (sans suffixe Btn)
  bindClick('saveDay',   () => saveDay?.());
  bindClick('deleteDay', () => deleteDay?.());

  // Close modal buttons (generic: any .modal-close-btn inside a .modal)
  document.querySelectorAll('.modal-close-btn').forEach((btn) => {
    btn.onclick = () => btn.closest('.modal')?.classList.remove('active');
  });

  // Calendar days (delegated on calendarGrid)
  const calendarGrid = document.getElementById('calendarGrid');
  if (calendarGrid) {
    calendarGrid.onclick = (e) => {
      const dayEl = e.target.closest('[data-date]');
      if (!dayEl) return;
      const date = dayEl.dataset.date;
      if (date) openDayModal?.(date);
    };
  }
}
