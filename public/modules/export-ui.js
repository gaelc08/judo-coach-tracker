// export-ui.js - Export/Import UI module
// Extracted from app-modular.js (lines ~3400-3900)

export function createExportUI({
  // State getters
  getCurrentCoach,
  getCurrentMonth,
  getTimeData,
  getCoaches,
  
  // Services
  supabase,
  restSelect,
  downloadBlob,
  loadExcelJs,
  blobToDataUrl,
  
  // Utilities
  escapeHtml,
  normalizeMonth,
  formatMonthLabel,
  getCoachDisplayName,
  currencyDisplay,
  numberDisplay,
}) {
  
  /**
   * TODO: Extract from app-modular.js ~L3400
   * async function exportMonthlyExpenses(format, month) { ... }
   * - Calls Supabase Edge Function /export-monthly-expenses
   * - Downloads generated file (CSV or Excel)
   */
  async function exportMonthlyExpenses(format = 'csv', month = null) {
    console.warn('export-ui: exportMonthlyExpenses() - TO BE EXTRACTED');
  }
  
  /**
   * TODO: Extract from app-modular.js ~L3500
   * async function exportDeclarationXLS() { ... }
   * - Generates Excel declaration with ExcelJS
   * - Downloads as .xlsx
   */
  async function exportDeclarationXLS() {
    console.warn('export-ui: exportDeclarationXLS() - TO BE EXTRACTED');
  }
  
  /**
   * TODO: Extract from app-modular.js ~L3600
   * async function exportTimesheetHTML() { ... }
   * - Generates HTML timesheet
   * - Downloads as .html
   */
  async function exportTimesheetHTML() {
    console.warn('export-ui: exportTimesheetHTML() - TO BE EXTRACTED');
  }
  
  /**
   * TODO: Extract from app-modular.js ~L3700
   * async function exportExpenseHTML() { ... }
   * - Generates HTML expense report
   * - Downloads as .html
   */
  async function exportExpenseHTML() {
    console.warn('export-ui: exportExpenseHTML() - TO BE EXTRACTED');
  }
  
  /**
   * TODO: Extract from app-modular.js ~L3750
   * async function importCoachData() { ... }
   * - Imports coach data from JSON file
   */
  async function importCoachData() {
    console.warn('export-ui: importCoachData() - TO BE EXTRACTED');
  }
  
  /**
   * TODO: Extract from app-modular.js ~L3800
   * async function exportBackupJSON() { ... }
   * - Exports all data as JSON backup
   */
  async function exportBackupJSON() {
    console.warn('export-ui: exportBackupJSON() - TO BE EXTRACTED');
  }
  
  /**
   * TODO: Extract from app-modular.js ~L3850
   * function setupExportMonthlyExpensesButton() { ... }
   * - Sets up export button handler
   */
  function setupExportMonthlyExpensesButton() {
    console.warn('export-ui: setupExportMonthlyExpensesButton() - TO BE EXTRACTED');
  }
  
  return {
    exportMonthlyExpenses,
    exportDeclarationXLS,
    exportTimesheetHTML,
    exportExpenseHTML,
    importCoachData,
    exportBackupJSON,
    setupExportMonthlyExpensesButton,
  };
}

/*
EXTRACTION GUIDE:
- exportMonthlyExpenses (L~3400)
- exportDeclarationXLS (L~3500)
- exportTimesheetHTML (L~3600)
- exportExpenseHTML (L~3700)
- importCoachData (L~3750)
- exportBackupJSON (L~3800)
- setupExportMonthlyExpensesButton (L~3850)
*/
