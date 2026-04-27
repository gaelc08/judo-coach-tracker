// competitions-ui.js
// Competitions calendar UI module for JCC app.
// Displays upcoming competitions from judo-moselle.fr (via Supabase).

import { fetchCompetitions, toggleClubSelected, triggerSync } from './competitions-service.js';

// ─── Niveau color mapping (same palette as judo-moselle.fr) ───
const NIVEAU_CONFIG = {
  FEDERAL:       { label: 'Fédéral',       color: '#c0392b', bg: '#fdecea' },
  NATIONAL:      { label: 'National',      color: '#1565c0', bg: '#e3f0ff' },
  REGIONAL:      { label: 'Régional',      color: '#2e7d32', bg: '#e6f5e7' },
  DEPARTEMENTAL: { label: 'Départ.',       color: '#e65100', bg: '#fff3e0' },
  LOCAL:         { label: 'Local',         color: '#555',    bg: '#f0f0f0' },
};

function getNiveauConfig(niveau) {
  if (!niveau) return { label: niveau || '—', color: '#555', bg: '#f0f0f0' };
  return NIVEAU_CONFIG[niveau.toUpperCase()] ?? { label: niveau, color: '#555', bg: '#f0f0f0' };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

let _deps = null;

/**
 * initCompetitionsUi — inject dependencies and wire up the competitions section.
 * @param {{ getCurrentAccessToken: () => string|null, isAdminForUi: () => boolean }} deps
 */
export function initCompetitionsUi(deps) {
  _deps = deps;
}

// ─── State ───────────────────────────────────────────────────────
let _competitions = [];
let _filteredNiveau = '';
let _filteredCategory = '';
let _loading = false;

// ─── Render helpers ──────────────────────────────────────────────

function renderNiveauBadge(niveau) {
  const cfg = getNiveauConfig(niveau);
  return `<span class="comp-badge" style="background:${cfg.bg};color:${cfg.color}">${escapeHtml(cfg.label)}</span>`;
}

function renderCompetitionCard(comp, isAdmin) {
  const selected = comp.club_selected ? ' comp-card--selected' : '';
  const categories = Array.isArray(comp.categories) && comp.categories.length > 0
    ? comp.categories.join(', ')
    : null;
  const lieu = [comp.lieu_nom, comp.lieu_ville].filter(Boolean).join(' — ');

  const selectBtn = isAdmin
    ? `<button class="comp-select-btn btn-secondary ${comp.club_selected ? 'comp-select-btn--on' : ''}"
         data-id="${escapeHtml(comp.id)}"
         data-selected="${comp.club_selected ? 'true' : 'false'}"
         title="${comp.club_selected ? 'Retirer la sélection club' : 'Retenir pour le club'}"
       >🏆</button>`
    : (comp.club_selected ? '<span class="comp-club-badge">🏆 Retenu club</span>' : '');

  return `
    <div class="comp-card card${selected}">
      <div class="comp-card-header">
        <div class="comp-card-date">${escapeHtml(formatDate(comp.date))}</div>
        <div class="comp-card-badges">
          ${renderNiveauBadge(comp.niveau)}
          ${comp.club_selected && !isAdmin ? '' : ''}
        </div>
        ${selectBtn}
      </div>
      <div class="comp-card-title">${escapeHtml(comp.title)}</div>
      ${lieu ? `<div class="comp-card-lieu">📍 ${escapeHtml(lieu)}</div>` : ''}
      ${categories ? `<div class="comp-card-categories">🥋 ${escapeHtml(categories)}</div>` : ''}
      ${comp.type_competition ? `<div class="comp-card-type">📋 ${escapeHtml(comp.type_competition)}</div>` : ''}
      ${comp.commentaire ? `<div class="comp-card-commentaire">${escapeHtml(comp.commentaire)}</div>` : ''}
      ${comp.url_source ? `<div class="comp-card-link"><a href="${escapeHtml(comp.url_source)}" target="_blank" rel="noopener">Voir sur judo-moselle.fr ↗</a></div>` : ''}
    </div>`;
}

function getAllCategories(competitions) {
  const cats = new Set();
  for (const c of competitions) {
    if (Array.isArray(c.categories)) c.categories.forEach((cat) => cats.add(cat));
  }
  return [...cats].sort();
}

function renderFilters(competitions, isAdmin) {
  const categories = getAllCategories(competitions);
  const niveaux = Object.keys(NIVEAU_CONFIG);

  const niveauOptions = niveaux.map((n) =>
    `<option value="${n}"${_filteredNiveau === n ? ' selected' : ''}>${NIVEAU_CONFIG[n].label}</option>`
  ).join('');

  const categoryOptions = categories.map((c) =>
    `<option value="${c}"${_filteredCategory === c ? ' selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');

  const syncBtn = isAdmin
    ? `<button id="compSyncBtn" class="btn-secondary">🔄 Synchroniser</button>`
    : '';

  return `
    <div class="comp-toolbar">
      <label class="toolbar-label">
        <span>Niveau</span>
        <select id="compNiveauFilter">
          <option value="">Tous</option>
          ${niveauOptions}
        </select>
      </label>
      ${categories.length > 0 ? `
      <label class="toolbar-label">
        <span>Catégorie</span>
        <select id="compCategoryFilter">
          <option value="">Toutes</option>
          ${categoryOptions}
        </select>
      </label>` : ''}
      <div class="comp-toolbar-actions">
        ${syncBtn}
      </div>
    </div>`;
}

function applyFilters(competitions) {
  return competitions.filter((c) => {
    if (_filteredNiveau && (c.niveau ?? '').toUpperCase() !== _filteredNiveau) return false;
    if (_filteredCategory && !(Array.isArray(c.categories) && c.categories.includes(_filteredCategory))) return false;
    return true;
  });
}

async function renderSection() {
  const container = document.getElementById('competitionsSection');
  if (!container) return;

  const isAdmin = _deps?.isAdminForUi?.() ?? false;

  if (_loading) {
    container.innerHTML = `
      <div class="comp-header">
        <h2>🏟️ Compétitions à venir</h2>
      </div>
      <div class="comp-status">Chargement…</div>`;
    return;
  }

  const filtered = applyFilters(_competitions);
  const filtersHtml = renderFilters(_competitions, isAdmin);
  const cardsHtml = filtered.length > 0
    ? filtered.map((c) => renderCompetitionCard(c, isAdmin)).join('')
    : `<div class="comp-status comp-empty">Aucune compétition trouvée.</div>`;

  container.innerHTML = `
    <div class="comp-header">
      <h2>🏟️ Compétitions à venir</h2>
      <p class="comp-subtitle">Source : <a href="https://www.judo-moselle.fr/evenement" target="_blank" rel="noopener">judo-moselle.fr</a></p>
    </div>
    ${filtersHtml}
    <div class="comp-list">
      ${cardsHtml}
    </div>`;

  // Wire up filters
  const niveauFilter = document.getElementById('compNiveauFilter');
  if (niveauFilter) {
    niveauFilter.addEventListener('change', (e) => {
      _filteredNiveau = e.target.value;
      renderSection();
    });
  }

  const categoryFilter = document.getElementById('compCategoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      _filteredCategory = e.target.value;
      renderSection();
    });
  }

  // Wire up sync button
  const syncBtn = document.getElementById('compSyncBtn');
  if (syncBtn && isAdmin) {
    syncBtn.addEventListener('click', () => handleSync());
  }

  // Wire up club-selected toggle buttons
  const selectBtns = container.querySelectorAll('.comp-select-btn');
  selectBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const currentSelected = btn.dataset.selected === 'true';
      const newSelected = !currentSelected;
      btn.disabled = true;
      try {
        const token = _deps?.getCurrentAccessToken?.();
        await toggleClubSelected(id, newSelected, token);
        // Update local state
        const comp = _competitions.find((c) => c.id === id);
        if (comp) comp.club_selected = newSelected;
        await renderSection();
      } catch (e) {
        alert(`Erreur : ${e.message}`);
        btn.disabled = false;
      }
    });
  });
}

async function handleSync() {
  const syncBtn = document.getElementById('compSyncBtn');
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.textContent = '⏳ Synchronisation…';
  }
  try {
    const token = _deps?.getCurrentAccessToken?.();
    const result = await triggerSync(token);
    alert(`Synchronisation terminée : ${result.synced} ajoutées/mises à jour, ${result.errors} erreurs, ${result.skipped} ignorées.`);
    // Reload competitions
    await loadCompetitions();
  } catch (e) {
    alert(`Erreur de synchronisation : ${e.message}`);
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.textContent = '🔄 Synchroniser';
    }
  }
}

async function loadCompetitions() {
  _loading = true;
  await renderSection();
  try {
    _competitions = await fetchCompetitions({ upcoming: true });
  } catch (e) {
    console.error('competitions-ui: loadCompetitions error', e);
    _competitions = [];
  } finally {
    _loading = false;
    await renderSection();
  }
}

/**
 * Show the competitions section and load data.
 */
export async function showCompetitionsSection() {
  await loadCompetitions();
}

/**
 * Hide the competitions section.
 */
export function hideCompetitionsSection() {
  const container = document.getElementById('competitionsSection');
  if (container) container.style.display = 'none';
}
