// auth-listeners.js - Auth state listeners module
// Extracted from app-modular.js (lines ~750-1400)

export function createAuthListeners({
  // Services  
  supabase,
  isCurrentUserAdminDB,
  loadAllDataFromSupabase,
  loadCoaches,
  updateCoachGreeting,
  updateCalendar,
  updateSummary,
  setupEventListeners,
  
  // State setters
  setCurrentUser,
  setCurrentSession,
  setCurrentAccessToken,
  setCoaches,
  setTimeData,
  setAuditLogs,
  setCurrentCoach,
  
  // Utilities
  normalizeEmail,
}) {
  
  /**
   * TODO: Extract from app-modular.js ~L750
   * async function isCurrentUserAdminDB() { ... }
   * - Checks admin role with REST API + local claims
   * - Implements cache with TTL
   */
  
  /**
   * TODO: Extract from app-modular.js ~L850
   * function setupAuthListeners() { ... }
   * - Sets up all auth form handlers (register/login/logout/resetPassword)
   * - Implements onAuthStateChange handler with:
   *   - SIGNED_IN event → check admin → load data → setup UI
   *   - PASSWORD_RECOVERY event → show password reset modal
   *   - Invite flow detection → show password creation modal
   *   - User signed out → clear state
   */
  function setupAuthListeners() {
    console.warn('auth-listeners: setupAuthListeners() - TO BE EXTRACTED FROM app-modular.js ~L850');
  }
  
  return {
    setupAuthListeners,
  };
}

/*
EXTRACTION GUIDE:
- isCurrentUserAdminDB (L~750)
- setupAuthListeners (L~850) - contains:
  - register button click handler
  - login button click handler
  - logout button click handler
  - reset password button click handler
  - onAuthStateChange callback with all auth flows
*/
