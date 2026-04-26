// helloasso-ui.js - HelloAsso UI module
// Extracted from app-modular.js (lines ~540-750)

/**
 * NOTE TO DEVELOPER:
 * This file contains placeholder implementations.
 * The actual code from app-modular.js needs to be copy-pasted here.
 * See the extraction guide at the end of this file.
 */

export function createHelloAssoUI({
  // Services
  supabase,
  syncHelloAssoMembers,
  getHelloAssoMembers,
  getLastSyncTime,
  parseHelloAssoCsv,
  importHelloAssoCsvData,
  
  // Utilities
  escapeHtml,
}) {
  
  /**
   * TODO: Copy from app-modular.js ~L540
   * async function renderHelloAssoSection() { ... }
   * - Fetches HelloAsso members and last sync time
   * - Computes FFJ judo category from birth year
   * - Groups members by discipline (judo/iaido/taiso)
   * - Renders member tables with categories
   * - Attaches sync button and CSV import handlers
   */
  async function renderHelloAssoSection() {
    console.warn('helloasso-ui: renderHelloAssoSection() - TO BE EXTRACTED FROM app-modular.js ~L540');
    const contentEl = document.getElementById('helloAssoContent');
    if (!contentEl) return;
    contentEl.innerHTML = '<p>HelloAsso UI: Implementation needed</p>';
  }
  
  /**
   * TODO: Copy from app-modular.js ~L730
   * async function openHelloAssoModal() { ... }
   * - Shows #helloAssoModal
   * - Calls renderHelloAssoSection()
   */
  async function openHelloAssoModal() {
    console.warn('helloasso-ui: openHelloAssoModal() - TO BE EXTRACTED FROM app-modular.js ~L730');
    const modal = document.getElementById('helloAssoModal');
    if (modal) {
      modal.classList.add('active');
      await renderHelloAssoSection();
    }
  }
  
  // Return public API
  return {
    renderHelloAssoSection,
    openHelloAssoModal,
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
6. Test the HelloAsso UI after each function extraction

Functions to extract (in order of dependency):
- renderHelloAssoSection (L~540) - main rendering + subfunctions:
  - getFfjCategory (nested helper)
  - buildMemberTable (nested helper)
  - sync button onclick handler
  - CSV input onchange handler
- openHelloAssoModal (L~730) - shows modal and triggers render

Dependencies (already modularized):
- syncHelloAssoMembers from helloasso-service.js
- getHelloAssoMembers from helloasso-service.js
- getLastSyncTime from helloasso-service.js
- parseHelloAssoCsv from helloasso-service.js
- importHelloAssoCsvData from helloasso-service.js
*/
