export function formatAuditDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('fr-FR');
}

const ACTION_LABELS = {
  'profile.create': 'Creation de profil',
  'profile.update': 'Mise a jour de profil',
  'profile.delete': 'Suppression de profil',
  'time_data.create': 'Ajout de saisie',
  'time_data.update': 'Modification de saisie',
  'time_data.delete': 'Suppression de saisie',
  'time_data.import_json': 'Import JSON',
  'timesheet.freeze': 'Gel de fiche',
  'timesheet.unfreeze': 'Degel de fiche',
  'export.declaration_xlsx': 'Export declaration salaire',
  'export.expense_html': 'Export note de frais',
  'export.timesheet_pdf': 'Export releve mensuel',
  'export.backup_json': 'Export sauvegarde JSON',
  'export.monthly_expenses': 'Export synthese mensuelle',
  'invite.admin': 'Invitation administrateur',
  'invite.coach': 'Invitation profil',
  'auth_user.delete': 'Suppression compte Auth',
};

const METADATA_LABELS = {
  coach_name: 'Profil',
  month: 'Mois',
  date: 'Date',
  profile_type: 'Type',
  role: 'Role',
  scope: 'Portee',
  source_profile_name: 'Profil source',
  source: 'Source',
  format: 'Format',
  total_hours: 'Heures',
  hours: 'Heures',
  competition_days: 'Jours competition',
  competition: 'Competition',
  total_amount: 'Montant',
  total_km: 'Km total',
  km: 'Km',
  peage: 'Peage',
  hotel: 'Hotel',
  achat: 'Achat',
  entries: 'Entrees',
  rows: 'Lignes',
  rows_inserted: 'Lignes importees',
  had_existing_id: 'Ecrasement',
  deleted_auth_user: 'Compte Auth supprime',
  requestId: 'Reference',
};

const METADATA_PRIORITY = [
  'coach_name',
  'month',
  'date',
  'profile_type',
  'role',
  'format',
  'hours',
  'competition',
  'km',
  'peage',
  'hotel',
  'achat',
  'total_hours',
  'competition_days',
  'total_km',
  'total_amount',
  'entries',
  'rows',
  'rows_inserted',
  'source_profile_name',
  'source',
  'had_existing_id',
  'deleted_auth_user',
  'requestId',
];

const AMOUNT_KEYS = new Set(['total_amount', 'peage', 'hotel', 'achat']);
const DISTANCE_KEYS = new Set(['total_km', 'km']);

function humanizeActionCode(action) {
  return String(action || '')
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .join(' / ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMetadataValue(key, value) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'number' && AMOUNT_KEYS.has(key)) return `${value.toFixed(2)} EUR`;
  if (typeof value === 'number' && DISTANCE_KEYS.has(key)) return `${value} km`;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getOrderedMetadataKeys(metadata) {
  const keys = Object.keys(metadata || {}).filter((key) => metadata[key] != null && metadata[key] !== '');
  const priorityKeys = METADATA_PRIORITY.filter((key) => keys.includes(key));
  const remainingKeys = keys.filter((key) => !priorityKeys.includes(key)).sort();
  return [...priorityKeys, ...remainingKeys];
}

export function getAuditActionLabel(action) {
  const normalizedAction = String(action || '').trim();
  return ACTION_LABELS[normalizedAction] || humanizeActionCode(normalizedAction) || 'Action';
}

export function getAuditActionSummary(row) {
  const metadata = row?.metadata || {};
  const label = getAuditActionLabel(row?.action);
  const coachName = metadata.coach_name || row?.target_email || row?.entity_id || null;
  const month = metadata.month || null;
  const date = metadata.date || null;
  const format = metadata.format ? String(metadata.format).toUpperCase() : null;
  const action = String(row?.action || '');

  if (action.startsWith('time_data.')) return [date, coachName].filter(Boolean).join(' • ') || label;
  if (action.startsWith('timesheet.')) return [coachName, month].filter(Boolean).join(' • ') || label;
  if (action.startsWith('export.')) return [coachName, month, format].filter(Boolean).join(' • ') || label;
  if (action.startsWith('profile.')) return [coachName, metadata.profile_type, metadata.role].filter(Boolean).join(' • ') || label;
  if (action.includes('import')) return [coachName, metadata.rows_inserted != null ? `${metadata.rows_inserted} ligne(s)` : null].filter(Boolean).join(' • ') || label;

  return coachName || label;
}

export function formatAuditAction(row, { escapeHtml } = {}) {
  const label = getAuditActionLabel(row?.action);
  const summary = getAuditActionSummary(row);
  const code = row?.action ? String(row.action) : '';

  return `
    <div class="audit-action-cell">
      <span class="audit-badge">${escapeHtml(label)}</span>
      ${summary ? `<div class="audit-action-summary">${escapeHtml(summary)}</div>` : ''}
      ${code ? `<div class="audit-action-code">${escapeHtml(code)}</div>` : ''}
    </div>
  `;
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
  const entries = getOrderedMetadataKeys(metadata)
    .map((key) => {
      if (key === 'coach_id' && metadata.coach_name) return null;
      const formattedValue = formatMetadataValue(key, metadata[key]);
      if (formattedValue == null) return null;
      return {
        label: METADATA_LABELS[key] || key.replace(/_/g, ' '),
        value: formattedValue,
      };
    })
    .filter(Boolean);

  return entries.length
    ? `<div class="audit-meta">${entries.map((entry) => `<div class="audit-meta-row"><span class="audit-meta-label">${escapeHtml(entry.label)}</span><span class="audit-meta-item">${escapeHtml(entry.value)}</span></div>`).join('')}</div>`
    : '<span class="audit-empty">—</span>';
}
