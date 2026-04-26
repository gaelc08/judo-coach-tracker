// calendar-ui.js - Calendar UI module
// Extracted from app-modular.js (lines ~1973-2400)

/**
 * NOTE TO DEVELOPER:
 * This file contains placeholder implementations.
 * The actual code from app-modular.js needs to be copy-pasted here.
 * See the extraction guide at the end of this file.
 */

export function createCalendarUI({
  // State getters
  getCurrentCoach,
  getCurrentMonth,
  getCurrentUser,
  getTimeData,
  getPublicHolidays,
  getSchoolHolidays,
  getFrozenMonths,
  getCoaches,
  
  // State setters
  setSelectedDay,
  setTimeData,
  updateCoach,
  
  // Services
  supabase,
  fetchPublicHolidays,
  fetchSchoolHolidays,
  isAdminForUi,
  isCurrentMonthFrozen,
  logAuditEvent,
  notifyAdminAlert,
  buildMonthlyAuditPayload,
  
  // UI updaters
  updateSummary,
  updateFreezeUI,
  
  // Utilities
  normalizeMonth,
  formatMonthLabel,
  getCoachDisplayName,
  getProfileLabel,
  escapeHtml,
}) {
  
  let selectedDay = null;
  
  /**
   * TODO: Copy from app-modular.js ~L1973
   * async function updateCalendar() { ... }
   * - Clears calendar innerHTML
   * - Fetches holidays (public + school)
   * - Renders calendar header with day names
   * - Loops through days of current month
   * - Calls createDayElement(day, dateStr) for each
   * - Calls updateFreezeUI()
   */
  async function updateCalendar() {
    console.warn('calendar-ui: updateCalendar() - TO BE EXTRACTED FROM app-modular.js ~L1973');
    // Placeholder implementation
    const calendar = document.getElementById('calendar');
    if (!calendar) return;
    calendar.innerHTML = '<p>Calendar UI: Implementation needed</p>';
  }
  
  /**
   * TODO: Copy from app-modular.js ~L2000
   * function createDayElement(day, dateStr) { ... }
   * - Creates a div with class 'calendar-day'
   * - Adds weekend/holiday/school-holiday classes
   * - Checks timeData for has-data/has-competition/has-purchase
   * - Renders day number + hours/competition indicator
   * - Attaches click listener -> handleDayClick(dateStr)
   */
  function createDayElement(day, dateStr) {
    console.warn('calendar-ui: createDayElement() - TO BE EXTRACTED FROM app-modular.js ~L2000');
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    dayDiv.textContent = day;
    return dayDiv;
  }
  
  /**
   * TODO: Copy from app-modular.js ~L2025
   * async function handleDayClick(dateStr) { ... }
   * - Checks if currentCoach is selected
   * - Checks if admin OR month not frozen
   * - Calls openDayModal(dateStr)
   */
  async function handleDayClick(dateStr) {
    console.warn('calendar-ui: handleDayClick() - TO BE EXTRACTED FROM app-modular.js ~L2025');
    const currentCoach = getCurrentCoach();
    if (!currentCoach) {
      alert('Veuillez sélectionner un profil.');
      return;
    }
    openDayModal(dateStr);
  }
  
  /**
   * TODO: Copy from app-modular.js ~L2090
   * function openDayModal(dateStr) { ... }
   * - Sets selectedDay = dateStr
   * - Builds key = `${currentCoach.id}-${dateStr}`
   * - Gets dayData from timeData[key] || defaults
   * - Populates all modal form fields
   * - Shows/hides existing justification links
   * - Shows modal: document.getElementById('dayModal').classList.add('active')
   */
  function openDayModal(dateStr) {
    console.warn('calendar-ui: openDayModal() - TO BE EXTRACTED FROM app-modular.js ~L2090');
    selectedDay = dateStr;
    setSelectedDay(dateStr);
    const modal = document.getElementById('dayModal');
    if (modal) modal.classList.add('active');
  }
  
  /**
   * TODO: Copy from app-modular.js ~L2160
   * async function saveDay() { ... }
   * - Reads all form values (hours, competition, km, etc.)
   * - Validates required justifications (peage/hotel/achat)
   * - Uploads new files via __uploadExpenseJustification()
   * - Builds upsert payload
   * - Calls supabase.from('time_data').upsert()
   * - Updates local timeData[key]
   * - Logs audit event
   * - Closes modal
   * - Calls updateCalendar() + updateSummary()
   */
  async function saveDay() {
    console.warn('calendar-ui: saveDay() - TO BE EXTRACTED FROM app-modular.js ~L2160');
    const modal = document.getElementById('dayModal');
    if (modal) modal.classList.remove('active');
    await updateCalendar();
    updateSummary();
  }
  
  /**
   * TODO: Copy from app-modular.js ~L2280
   * async function deleteDay() { ... }
   * - Gets existing timeData entry
   * - Deletes from supabase time_data table
   * - Logs audit event
   * - Deletes from local timeData
   * - Closes modal
   * - Calls updateCalendar() + updateSummary()
   */
  async function deleteDay() {
    console.warn('calendar-ui: deleteDay() - TO BE EXTRACTED FROM app-modular.js ~L2280');
    const modal = document.getElementById('dayModal');
    if (modal) modal.classList.remove('active');
    await updateCalendar();
    updateSummary();
  }
  
  /**
   * TODO: Copy from app-modular.js ~L2140
   * async function __uploadExpenseJustification(file, prefix) { ... }
   * - Sanitizes filename
   * - Builds path: `${currentUser.id}/${selectedDay}_${prefix}_${safeName}`
   * - Uploads to supabase.storage.from('justifications')
   * - Returns public URL
   */
  async function __uploadExpenseJustification(file, prefix) {
    console.warn('calendar-ui: __uploadExpenseJustification() - TO BE EXTRACTED FROM app-modular.js ~L2140');
    return '';
  }
  
  /**
   * TODO: Copy from app-modular.js ~L1850
   * function loadCoaches() { ... }
   * - Populates #coachSelect dropdown
   * - Loops through coaches array
   * - Shows name + profile label
   */
  function loadCoaches() {
    console.warn('calendar-ui: loadCoaches() - TO BE EXTRACTED FROM app-modular.js ~L1850');
  }
  
  /**
   * TODO: Copy from app-modular.js ~L1835
   * function clearCoachForm() { ... }
   * - Clears all coach form fields
   */
  function clearCoachForm() {
    console.warn('calendar-ui: clearCoachForm() - TO BE EXTRACTED FROM app-modular.js ~L1835');
  }
  
  /**
   * TODO: Copy from app-modular.js ~L1900
   * function updateCoachGreeting(user, coach, isAdmin) { ... }
   * - Updates #coachGreeting text
   * - Shows user display name
   */
  function updateCoachGreeting(user, coach, isAdmin) {
    console.warn('calendar-ui: updateCoachGreeting() - TO BE EXTRACTED FROM app-modular.js ~L1900');
  }
  
  // Return public API
  return {
    updateCalendar,
    createDayElement,
    handleDayClick,
    openDayModal,
    saveDay,
    deleteDay,
    loadCoaches,
    clearCoachForm,
    updateCoachGreeting,
  };
}

/*
EXTRACTION GUIDE:
=================
1. Open public/app-modular.js in VS Code
2. Find each function by line number (indicated in TODO comments above)
3. Copy the full function implementation
4. Paste it replacing the placeholder here
5. Update any references to global state to use the provided getters/setters
6. Test the calendar UI after each function extraction

Functions to extract (in order of dependency):
- __uploadExpenseJustification (L~2140) - used by saveDay
- createDayElement (L~2000) - used by updateCalendar
- handleDayClick (L~2025) - used by createDayElement
- openDayModal (L~2090) - used by handleDayClick
- saveDay (L~2160) - used by modal save button
- deleteDay (L~2280) - used by modal delete button
- updateCalendar (L~1973) - main calendar rendering
- loadCoaches (L~1850) - populates coach dropdown
- clearCoachForm (L~1835) - resets coach form
- updateCoachGreeting (L~1900) - updates greeting text
*/
