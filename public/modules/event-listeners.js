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

// ===== Competitions section toggle =====
let _competitionsVisible = false;

function toggleCompetitionsSection(show) {
  const section = document.getElementById('competitionsSection');
  if (!section) return;
  _competitionsVisible = show !== undefined ? show : !_competitionsVisible;
  section.style.display = _competitionsVisible ? 'block' : 'none';

  // Masquer le planning quand compétitions est affiché
  const planningEls = [
    document.getElementById('coachSelectorGroup'),
    document.getElementById('monthSelect')?.closest('label'),
    document.getElementById('frozenBanner'),
    document.getElementById('calendar'),
    document.querySelector('.summary.card'),
    document.querySelector('.legend.card'),
    document.getElementById('coachGreeting'),
  ];
  planningEls.forEach((el) => {
    if (el) el.style.display = _competitionsVisible ? 'none' : '';
  });

  if (_competitionsVisible) {
    // Dynamically import to avoid circular dep at load time
    import('./competitions-ui.js').then((m) => m.showCompetitionsSection());
  }
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
    // Fermer la section compétitions si ouverte
    if (_competitionsVisible) toggleCompetitionsSection(false);
    await updateCalendar?.();
    updateSummary?.();
  });

  // Coach management
  bindClick('addCoachBtn',    () => openCoachModal?.('add'));
  bindClick('editCoachBtn',   () => openCoachModal?.('edit', currentCoach));
  bindClick('cancelCoach',    () => {
    document.getElementById('coachModal')?.classList.remove('active');
  });
  bindClick('cancelDay', () => {
    document.getElementById('dayModal')?.classList.remove('active');
  });
  bindClick('inviteAdminBtn', () => inviteAdmin?.());

  // Freeze
  bindClick('freezeBtn', () => toggleFreezeMonth?.());

  // Audit / HelloAsso / Competitions
  bindClick('auditLogsBtn', () => openAuditLogsModal?.());
  bindClick('helloAssoBtn', () => openHelloAssoModal?.());
  bindClick('competitionsBtn', () => toggleCompetitionsSection());

  // Admin profile modal
  bindClick('adminProfileBtn', async () => {
    // Load existing profile
    const { data } = await supabase.from('admin_profiles').select('*').limit(1).maybeSingle();
    const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    f('adminProfileName',        data?.name);
    f('adminProfileFirstName',   data?.first_name);
    f('adminProfileFunction',    data?.function_title);
    f('adminProfileAddress',     data?.address);
    f('adminProfileVehicle',     data?.vehicle);
    f('adminProfileFiscalPower', data?.fiscal_power);
    f('adminProfileKmRate',      data?.km_rate ?? 0.35);
    document.getElementById('adminProfileModal')?.classList.add('active');
  });
  bindClick('cancelAdminProfile', () => document.getElementById('adminProfileModal')?.classList.remove('active'));
  bindClick('saveAdminProfile', async () => {
    const g = (id) => document.getElementById(id)?.value?.trim() || null;
    const payload = {
      name:           g('adminProfileName'),
      first_name:     g('adminProfileFirstName'),
      function_title: g('adminProfileFunction'),
      address:        g('adminProfileAddress'),
      vehicle:        g('adminProfileVehicle'),
      fiscal_power:   g('adminProfileFiscalPower'),
      km_rate:        parseFloat(document.getElementById('adminProfileKmRate')?.value) || 0.35,
      updated_at:     new Date().toISOString(),
    };
    const user = (await supabase.auth.getUser()).data?.user;
    if (!user) { alert('Non connecté.'); return; }
    payload.owner_uid = user.id;
    const { error } = await supabase.from('admin_profiles').upsert([payload], { onConflict: 'owner_uid' });
    if (error) { alert('Erreur : ' + error.message); return; }
    document.getElementById('adminProfileModal')?.classList.remove('active');
  });

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

  // Toggle travelGroup when competition checkbox changes
  const competitionDayCb = document.getElementById('competitionDay');
  if (competitionDayCb) {
    competitionDayCb.addEventListener('change', () => {
      const travelGroup = document.getElementById('travelGroup');
      if (travelGroup) travelGroup.style.display = competitionDayCb.checked ? '' : 'none';
    });
  }

  // Close modal buttons (generic: any .modal-close-btn inside a .modal)
  document.querySelectorAll('.modal-close-btn').forEach((btn) => {
    btn.onclick = () => btn.closest('.modal')?.classList.remove('active');
  });

  // Fermer les modals via leurs boutons dédiés
  ['closeAuditLogs', 'closeHelloAsso', 'closeHelp'].forEach((id) => {
    bindClick(id, () => document.getElementById(id)?.closest('.modal')?.classList.remove('active'));
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

  // ===== Sidebar hamburger toggle =====
  const sidebarToggle  = document.getElementById('sidebarToggle');
  const sidebarEl      = document.getElementById('appSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function openSidebar() {
    // Compenser la disparition de la scrollbar pour éviter le décalage
    const scrollW = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--scrollbar-width', scrollW + 'px');
    sidebarEl?.classList.add('is-open');
    sidebarOverlay?.classList.add('is-open');
    document.body.classList.add('sidebar-open');
  }
  function closeSidebar() {
    sidebarEl?.classList.remove('is-open');
    sidebarOverlay?.classList.remove('is-open');
    document.body.classList.remove('sidebar-open');
    document.documentElement.style.removeProperty('--scrollbar-width');
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      if (sidebarEl?.classList.contains('is-open')) closeSidebar();
      else openSidebar();
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }
  // Close sidebar on nav button click (mobile UX)
  sidebarEl?.querySelectorAll('.sidebar-nav-btn').forEach((btn) => {
    btn.addEventListener('click', closeSidebar);
  });

  // ===== Sidebar admin section visibility (mirrors adminActionsPanel) =====
  const adminPanelEl      = document.getElementById('adminActionsPanel');
  const sidebarAdminEl    = document.getElementById('sidebarAdminSection');
  if (adminPanelEl && sidebarAdminEl) {
    const syncAdminSection = () => {
      const isVisible = adminPanelEl.style.display !== 'none' && adminPanelEl.style.display !== '';
      sidebarAdminEl.style.display = isVisible ? 'block' : 'none';
    };
    // Sync état initial (le changement a peut-être eu lieu avant la création de l'observer)
    syncAdminSection();
    const adminObserver = new MutationObserver(syncAdminSection);
    adminObserver.observe(adminPanelEl, { attributes: true, attributeFilter: ['style'] });
  }

  // ===== Dark mode toggle =====
  const darkToggle = document.getElementById('darkModeToggle');
  const THEME_KEY  = 'jct.theme';

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (darkToggle) darkToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // Restore persisted theme
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') applyTheme(saved);
  } catch {}

  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      const next    = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch {}
    });
  }
}
