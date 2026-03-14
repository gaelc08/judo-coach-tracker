export function createAuditController({
  getAuditLogs,
  setAuditLogs,
  getCurrentCoach,
  getCurrentMonth,
  restSelect,
  isAdminForUi,
  escapeHtml,
  formatAuditDateTime,
  formatAuditDetails,
  getAuditActionGroup,
  auditMatchesCurrentCoach,
  normalizeEmail,
  normalizeMonth,
  getElementById = (id) => document.getElementById(id),
  alertFn = (message) => window.alert(message),
} = {}) {
  function renderAuditLogs() {
    const body = getElementById('auditLogsTableBody');
    const status = getElementById('auditLogsStatus');
    const filter = getElementById('auditActionFilter')?.value || 'all';
    const currentCoachOnly = !!getElementById('auditCurrentCoachOnly')?.checked;

    if (!body || !status) return;

    let rows = [...(getAuditLogs?.() || [])];
    if (filter !== 'all') {
      rows = rows.filter((row) => getAuditActionGroup(row.action) === filter);
    }
    if (currentCoachOnly) {
      rows = rows.filter((row) => auditMatchesCurrentCoach(row, {
        currentCoach: getCurrentCoach?.(),
        currentMonth: getCurrentMonth?.(),
        normalizeEmail,
        normalizeMonth,
      }));
    }

    status.textContent = `${rows.length} action(s) affichée(s)`;

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="audit-empty">Aucune action trouvée.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((row) => {
      const actor = row.actor_email || row.actor_uid || '—';
      const target = row.target_email || row.target_user_id || row.entity_id || '—';
      return `
      <tr>
        <td>${escapeHtml(formatAuditDateTime(row.created_at))}</td>
        <td><span class="audit-badge">${escapeHtml(row.action || '—')}</span></td>
        <td>${escapeHtml(actor)}</td>
        <td>${escapeHtml(target)}</td>
        <td>${formatAuditDetails(row, { escapeHtml })}</td>
      </tr>
    `;
    }).join('');
  }

  async function loadAuditLogs() {
    const status = getElementById('auditLogsStatus');
    if (status) status.textContent = 'Chargement…';

    const res = await restSelect('audit_logs', {
      order: { column: 'created_at', direction: 'desc' },
      limit: 250,
    });

    if (res.error) {
      if (status) status.textContent = `Erreur : ${res.error.message}`;
      setAuditLogs?.([]);
      renderAuditLogs();
      return;
    }

    setAuditLogs?.((res.data || []).map((row) => ({
      ...row,
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    })));
    renderAuditLogs();
  }

  async function openAuditLogsModal() {
    if (!isAdminForUi()) {
      alertFn("Seul l'administrateur peut consulter l'historique.");
      return;
    }

    getElementById('auditLogsModal')?.classList.add('active');
    await loadAuditLogs();
  }

  return {
    renderAuditLogs,
    loadAuditLogs,
    openAuditLogsModal,
  };
}
