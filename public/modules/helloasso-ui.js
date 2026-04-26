// helloasso-ui.js — HelloAsso UI module
// Extracted from app-modular.js (main branch)

/**
 * createHelloAssoUI — factory that injects all dependencies
 * and returns the HelloAsso UI functions as a module API.
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

  // ─────────────────────────────────────────────────────────────────
  // FFJ category helper
  // ─────────────────────────────────────────────────────────────────

  function getFfjCategory(dateOfBirth) {
    if (!dateOfBirth) return null;
    const yearMatch = String(dateOfBirth).match(/(?:^|\D)(\d{4})(?:\D|$)/);
    if (!yearMatch) return null;
    const year = parseInt(yearMatch[1], 10);
    if (isNaN(year)) return null;
    if (year >= 2020) return 'Baby Judo';
    if (year >= 2018) return 'Mini-Poussin';
    if (year >= 2016) return 'Poussin';
    if (year >= 2014) return 'Benjamin';
    if (year >= 2012) return 'Minime';
    if (year >= 2009) return 'Cadet';
    if (year >= 2006) return 'Junior';
    if (year >= 1996) return 'Senior';
    return 'Vétéran';
  }

  // ─────────────────────────────────────────────────────────────────
  // buildMemberTable
  // ─────────────────────────────────────────────────────────────────

  function buildMemberTable(group, showCategory = false) {
    if (group.length === 0) return '<p class="audit-status">Aucun adhérent.</p>';
    const rows = group.map((m) => {
      const amount = m.membership_amount != null
        ? `${Number(m.membership_amount).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`
        : '—';
      const date = m.membership_date ? new Date(m.membership_date).toLocaleDateString('fr-FR') : '—';
      const ffjCategory = showCategory ? getFfjCategory(m.date_of_birth) : null;
      const categoryCell = showCategory ? `<td>${escapeHtml(ffjCategory ?? m.judo_category ?? '—')}</td>` : '';
      const dob = m.date_of_birth ? escapeHtml(m.date_of_birth) : '—';
      return `<tr>
        <td>${escapeHtml(m.first_name ?? '')}</td>
        <td>${escapeHtml(m.last_name ?? '')}</td>
        <td>${escapeHtml(m.email ?? '')}</td>
        ${categoryCell}
        <td>${dob}</td>
        <td>${amount}</td>
        <td>${date}</td>
      </tr>`;
    }).join('');
    const categoryHeader = showCategory ? '<th>Catégorie</th>' : '';
    return `
      <div class="audit-table-wrap">
        <table class="audit-table">
          <thead><tr>
            <th>Prénom</th><th>Nom</th><th>Email</th>
            ${categoryHeader}
            <th>Naissance</th><th>Montant (€)</th><th>Date adhésion</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────────────
  // renderHelloAssoSection
  // ─────────────────────────────────────────────────────────────────

  async function renderHelloAssoSection() {
    const contentEl = document.getElementById('helloAssoContent');
    if (!contentEl) return;
    contentEl.innerHTML = '<p>Chargement…</p>';

    try {
      const [lastSync, members] = await Promise.all([
        getLastSyncTime(supabase),
        getHelloAssoMembers(supabase),
      ]);

      const syncInfo = lastSync
        ? `Dernière synchronisation : ${new Date(lastSync).toLocaleString('fr-FR')}`
        : 'Jamais synchronisé';

      let tableHtml = '';
      if (members.length === 0) {
        tableHtml = '<p class="audit-status">Aucun membre synchronisé. Cliquez sur Synchroniser.</p>';
      } else {
        const sorted = [...members].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr'));
        const judo  = sorted.filter((m) => m.discipline === 'judo');
        const iaido = sorted.filter((m) => m.discipline === 'iaido');
        const taiso = sorted.filter((m) => m.discipline === 'taiso');

        const ffjOrder = ['Baby Judo', 'Mini-Poussin', 'Poussin', 'Benjamin', 'Minime', 'Cadet', 'Junior', 'Senior', 'Vétéran'];
        const legacyOrder = ['Baby Judo', 'Mini-Poussin/Poussin', 'Benjamin/Minime', 'Cadet/Junior/Senior'];
        judo.sort((a, b) => {
          const catA = getFfjCategory(a.date_of_birth) ?? a.judo_category ?? '';
          const catB = getFfjCategory(b.date_of_birth) ?? b.judo_category ?? '';
          const ia = ffjOrder.indexOf(catA) !== -1 ? ffjOrder.indexOf(catA) : legacyOrder.indexOf(catA) * 2;
          const ib = ffjOrder.indexOf(catB) !== -1 ? ffjOrder.indexOf(catB) : legacyOrder.indexOf(catB) * 2;
          if (ia !== ib) return ia - ib;
          return (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr');
        });

        tableHtml = `
          <h3>🥋 Judo (${judo.length})</h3>${buildMemberTable(judo, true)}
          <h3>🗡️ Iaïdo (${iaido.length})</h3>${buildMemberTable(iaido, false)}
          <h3>🤸 Taïso (${taiso.length})</h3>${buildMemberTable(taiso, false)}
        `;
      }

      contentEl.innerHTML = `
        <div class="audit-toolbar">
          <span class="audit-status">${escapeHtml(syncInfo)}</span>
          <button id="syncHelloAssoBtn" class="btn-secondary">🔄 Synchroniser</button>
          <label class="btn-secondary" style="cursor:pointer;margin-left:0.5rem" title="Importer un export CSV HelloAsso pour enrichir les dates de naissance">
            📂 Importer CSV
            <input type="file" id="helloAssoCsvInput" accept=".csv" style="display:none">
          </label>
        </div>
        ${tableHtml}`;

      // Sync button
      const syncBtn = document.getElementById('syncHelloAssoBtn');
      if (syncBtn) {
        syncBtn.onclick = async () => {
          syncBtn.disabled = true;
          syncBtn.textContent = '⏳ Synchronisation…';
          try {
            const result = await syncHelloAssoMembers(supabase);
            console.log('DEBUG sync-helloasso result:', result);
          } catch (e) {
            console.error('DEBUG sync-helloasso error:', e);
            alert(`Erreur lors de la synchronisation : ${e.message || e}`);
          } finally {
            await renderHelloAssoSection();
          }
        };
      }

      // CSV import
      const csvInput = document.getElementById('helloAssoCsvInput');
      if (csvInput) {
        csvInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const rows = parseHelloAssoCsv(text);
            if (rows.length === 0) { alert('Aucune donnée trouvée dans le CSV. Vérifiez le format du fichier.'); return; }
            const withDob = rows.filter((r) => r.date_of_birth);
            if (withDob.length === 0) { alert('Le CSV ne contient pas de colonne "date de naissance". Vérifiez les colonnes exportées depuis HelloAsso.'); return; }
            const { updated, notFound } = await importHelloAssoCsvData(supabase, withDob);
            let msg = `✅ ${updated} date(s) de naissance importée(s).`;
            if (notFound.length > 0) msg += `\n⚠️ ${notFound.length} email(s) non trouvé(s) dans la base.`;
            alert(msg);
            await renderHelloAssoSection();
          } catch (err) {
            alert(`Erreur lors de l'import CSV : ${err.message || err}`);
          }
          csvInput.value = '';
        };
      }
    } catch (e) {
      console.error('DEBUG renderHelloAssoSection error:', e);
      contentEl.innerHTML = `<p class="audit-status">Erreur : ${escapeHtml(String(e))}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // openHelloAssoModal
  // ─────────────────────────────────────────────────────────────────

  async function openHelloAssoModal() {
    const modal = document.getElementById('helloAssoModal');
    if (!modal) return;
    modal.classList.add('active');
    await renderHelloAssoSection();
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  return {
    renderHelloAssoSection,
    openHelloAssoModal,
  };
}
