export function formatAuditDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('fr-FR');
}

export function getAuditActionGroup(action) {
  const value = String(action || '').toLowerCase();
  if (value.startsWith('profile.')) return 'profile';
  if (value.startsWith('time_data.')) return 'time_data';
  if (value.startsWith('timesheet.')) return 'timesheet';
  if (value.startsWith('export.')) return 'export';
  if (value.startsWith('invite.') || value.startsWith('auth_user.')) return 'invite';
  return 'other';
}

export function auditMatchesCurrentCoach(row, {
  currentCoach,
  currentMonth,
  normalizeEmail,
  normalizeMonth,
} = {}) {
  if (!currentCoach) return true;
  const metadata = row?.metadata || {};
  const currentCoachEmail = normalizeEmail(currentCoach.email);
  return (
    metadata?.coach_id === currentCoach.id
    || row?.entity_id === currentCoach.id
    || row?.entity_id === `${currentCoach.id}-${normalizeMonth(currentMonth)}`
    || (currentCoach.owner_uid && row?.target_user_id === currentCoach.owner_uid)
    || (normalizeEmail(row?.target_email) && normalizeEmail(row?.target_email) === currentCoachEmail)
  );
}

export function formatAuditDetails(row, { escapeHtml } = {}) {
  const metadata = row?.metadata || {};
  const entries = [];

  if (metadata.coach_name) entries.push(`Profil : ${metadata.coach_name}`);
  if (metadata.month) entries.push(`Mois : ${metadata.month}`);
  if (metadata.date) entries.push(`Date : ${metadata.date}`);
  if (metadata.rows_inserted != null) entries.push(`Lignes : ${metadata.rows_inserted}`);
  if (metadata.total_amount != null) entries.push(`Montant : ${Number(metadata.total_amount).toFixed(2)} €`);
  if (metadata.requestId) entries.push(`Ref : ${metadata.requestId}`);

  if (!entries.length) {
    const keys = Object.keys(metadata).slice(0, 3);
    keys.forEach((key) => entries.push(`${key} : ${metadata[key]}`));
  }

  return entries.length
    ? `<div class="audit-meta">${entries.map((entry) => `<span class="audit-meta-item">${escapeHtml(entry)}</span>`).join('')}</div>`
    : '<span class="audit-empty">—</span>';
}
