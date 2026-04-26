// event-listeners.js - UI event listeners module
// Extracted from app-modular.js (lines ~1450-1750)

export function createEventListeners({
  // UI handlers
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
  
  // State getters
  getCurrentCoach,
  getCurrentMonth,
  
  // Utilities
  normalizeMonth,
}) {
  
  let eventListenersSetup = false;
  
  /**
   * TODO: Extract from app-modular.js ~L1450
   * function setupEventListeners() { ... }
   * - Binds all UI event handlers:
   *   - monthSelect.onchange → update calendar
   *   - coachSelect.onchange → switch coach
   *   - All modal buttons (add/edit/delete/invite/freeze/export/import)
   *   - CSV import file input handler
   * - Uses bindClick and bindChange helper functions
   */
  function setupEventListeners() {
    if (eventListenersSetup) {
      console.warn('event-listeners: setupEventListeners already called');
      return;
    }
    console.warn('event-listeners: setupEventListeners() - TO BE EXTRACTED FROM app-modular.js ~L1450');
    eventListenersSetup = true;
  }
  
  return {
    setupEventListeners,
  };
}

/*
EXTRACTION GUIDE:
- setupEventListeners (L~1450) - contains:
  - bindClick(id, handler) helper
  - bindChange(id, handler) helper
  - monthSelect.value initialization
  - logoutBtnApp click handler
  - All button bindings:
    * addCoachBtn → openCoachModal
    * editCoachBtn → openCoachModal(edit mode)
    * coachSelect.onchange → switch coach
    * freezeBtn → toggleFreezeMonth
    * auditLogsBtn → openAuditLogsModal
    * helloAssoBtn → openHelloAssoModal
    * exportDeclarationBtn → exportDeclarationXLS
    * exportMonthlyExpensesBtn → exportMonthlyExpenses
    * importGroup file input → importCoachData
    * backupBtn → exportBackupJSON
    * And many more...
*/
