// calendar-ui.js
// Calendar rendering, day modal, saveDay/deleteDay, file upload, coach UI helpers.
// Extracted from app-modular.js (lines ~1835-2400)

import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeMonth, __escapeHtml } from './shared-utils.js';
import {
  coaches, timeData, frozenMonths, currentCoach, currentMonth, currentUser,
  currentAccessToken, selectedDay,
  setTimeData, setSelectedDay,
  __getCoachDisplayName, __getProfileLabel, __isVolunteerProfile, __buildAuditPayload,
} from './app-context.js';
import { isCurrentUserAdminDB, __isAdminForUi } from './admin-service.js';
import { createHolidayService } from './holidays-service.js';
import { publicHolidaysFallback, schoolHolidaysFallback } from './holidays-data.js';
import { updateSummary, updateFreezeUI, isCurrentMonthFrozen } from './summary-ui.js';

const __holidayService = createHolidayService({
  publicFallback: publicHolidaysFallback,
  schoolFallback: schoolHolidaysFallback,
  fetchImpl: globalThis.fetch?.bind(globalThis),
  logger: console,
});
const fetchPublicHolidays = __holidayService.fetchPublicHolidays;
const fetchSchoolHolidays = __holidayService.fetchSchoolHolidays;

let _supabase = null;
let _logAuditEvent = null;
let _notifyAdminAlert = null;

export function initCalendarUi({ supabase, logAuditEvent, notifyAdminAlert }) {
  _supabase = supabase;
  _logAuditEvent = logAuditEvent;
  _notifyAdminAlert = notifyAdminAlert;
}

// ===== Coach dropdown & form =====

export function loadCoaches() {
  const select = document.getElementById('coachSelect');
  if (!select) return;
  const prevValue = select.value;
  select.innerHTML = '<option value="">— Sélectionnez un profil —</option>';
  coaches.forEach((coach) => {
    const opt = document.createElement('option');
    opt.value = coach.id;
    const label = __getProfileLabel(coach);
    opt.textContent = `${__getCoachDisplayName(coach)}${label ? ` (${label})` : ''}`;
    select.appendChild(opt);
  });
  if (prevValue && coaches.find((c) => String(c.id) === prevValue)) {
    select.value = prevValue;
  }
}

export function clearCoachForm() {
  ['coachName', 'coachFirstName', 'coachEmail', 'coachAddress',
    'coachVehicle', 'coachFiscalPower', 'coachRate', 'dailyAllowance',
    'coachOwnerUid'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const profileType = document.getElementById('coachProfileType');
  if (profileType) profileType.value = 'coach';
}

export function updateCoachGreeting(user, coach, isAdmin) {
  const el = document.getElementById('coachGreeting');
  if (!el) return;
  if (!user) { el.textContent = ''; el.style.display = 'none'; return; }
  // Priorité : prénom du profil > prénom user_metadata > email
  const firstName = coach?.first_name?.trim()
    || user.user_metadata?.first_name?.trim()
    || user.user_metadata?.firstname?.trim()
    || null;
  const displayName = firstName || (coach ? __getCoachDisplayName(coach) : (user.email || user.id));
  el.textContent = `Bonjour ${displayName},`;
  el.style.display = '';
}

// ===== File upload =====

async function __uploadExpenseJustification(file, prefix) {
  if (!currentUser) return '';
  const safeDate = selectedDay || 'nodate';
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${currentUser.id}/${safeDate}_${prefix}_${safeName}`;
  const { error } = await _supabase.storage.from('justifications').upload(path, file, { upsert: true });
  if (error) {
    console.error('Upload justification error:', error.message);
    return '';
  }
  const { data } = _supabase.storage.from('justifications').getPublicUrl(path);
  return data?.publicUrl || '';
}

// ===== Calendar rendering =====

export async function updateCalendar() {
  const calendar = document.getElementById('calendar');
  if (!calendar) return;
  calendar.innerHTML = '';

  if (!currentCoach || !currentMonth) {
    document.querySelector('.legend.card')?.style && (document.querySelector('.legend.card').style.display = 'none');
    updateFreezeUI();
    return;
  }

  // Afficher la légende quand un planning est affiché
  document.querySelector('.legend.card')?.style && (document.querySelector('.legend.card').style.display = '');

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const startOffset = (firstDay + 6) % 7; // Mon-based

  // Header row: Mon→Sun
  ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach((d) => {
    const header = document.createElement('div');
    header.className = 'calendar-header-cell';
    header.textContent = d;
    calendar.appendChild(header);
  });

  // Fetch holidays
  let publicHolidays = [];
  let schoolHolidays = [];
  try {
    [publicHolidays, schoolHolidays] = await Promise.all([
      fetchPublicHolidays(year),
      fetchSchoolHolidays(year),
    ]);
  } catch (e) {
    console.warn('calendar-ui: holidays fetch error', e);
  }

  const publicHolidayDates = new Set(Object.keys(publicHolidays));
  const schoolHolidayDates = new Set(
    (Array.isArray(schoolHolidays) ? schoolHolidays : []).flatMap((h) => {
      const dates = [];
      if (!h.start || !h.end) return dates;
      const cur = new Date(h.start);
      const end = new Date(h.end);
      while (cur <= end) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    })
  );

  // Empty cells before first day
  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    calendar.appendChild(empty);
  }

  const frozen = isCurrentMonthFrozen();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEl = createDayElement(d, dateStr, { publicHolidayDates, schoolHolidayDates, frozen });
    calendar.appendChild(dayEl);
  }

  updateFreezeUI();
}

function createDayElement(day, dateStr, { publicHolidayDates, schoolHolidayDates, frozen }) {
  const dayDiv = document.createElement('div');
  const dow = new Date(dateStr).getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const isPublicHoliday = publicHolidayDates.has(dateStr);
  const isSchoolHoliday = schoolHolidayDates.has(dateStr);

  const key = `${currentCoach.id}-${dateStr}`;
  const data = timeData[key];

  const classes = ['calendar-day'];
  if (isWeekend) classes.push('weekend');
  if (isPublicHoliday) classes.push('public-holiday');
  if (isSchoolHoliday) classes.push('school-holiday');
  if (data) {
    if (data.competition) classes.push('has-competition');
    else if (data.hours > 0 || data.km > 0) classes.push('has-data');
    if (data.peage > 0 || data.hotel > 0 || data.achat > 0) classes.push('has-purchase');
  }
  if (frozen) classes.push('frozen');

  dayDiv.className = classes.join(' ');

  const dayNumber = document.createElement('span');
  dayNumber.className = 'day-number';
  dayNumber.textContent = day;
  dayDiv.appendChild(dayNumber);

  if (data) {
    const indicator = document.createElement('span');
    indicator.className = 'day-indicator';
    if (data.competition) {
      indicator.textContent = '🏆';
    } else if (data.hours > 0) {
      indicator.textContent = `${data.hours}h`;
    } else if (data.km > 0) {
      indicator.textContent = `${data.km}km`;
    }
    dayDiv.appendChild(indicator);
  }

  dayDiv.addEventListener('click', () => handleDayClick(dateStr));
  return dayDiv;
}

async function handleDayClick(dateStr) {
  if (!currentCoach) {
    alert('Veuillez sélectionner un profil.');
    return;
  }
  const isAdmin = await isCurrentUserAdminDB();
  const frozen = isCurrentMonthFrozen();
  if (!isAdmin && frozen) {
    alert('Cette fiche est gelée. Seul l\'administrateur peut la modifier.');
    return;
  }
  openDayModal(dateStr);
}

// ===== Day modal =====

export function openDayModal(dateStr) {
  setSelectedDay(dateStr);

  const key = `${currentCoach.id}-${dateStr}`;
  const data = timeData[key] || {};

  // Title
  const title = document.getElementById('dayTitle');
  if (title) title.textContent = `Modifier le ${dateStr}`;

  // Populate modal fields (IDs matching index.html)
  _setField('trainingHours', data.hours || '');
  _setField('kilometers', data.km || '');
  _setField('peage', data.peage || '');
  _setField('hotel', data.hotel || '');
  _setField('achat', data.achat || '');
  _setField('competitionDescription', data.description || '');
  _setField('departurePlace', data.departurePlace || '');
  _setField('arrivalPlace', data.arrivalPlace || '');

  const compCb = document.getElementById('competitionDay');
  if (compCb) compCb.checked = !!data.competition;

  // Show/hide travelGroup based on competition checkbox
  const travelGroup = document.getElementById('travelGroup');
  if (travelGroup) travelGroup.style.display = data.competition ? '' : 'none';

  // Existing justification links
  _showJustificationLink('peageJustificationLink', 'existingPeageJustification', data.justificationUrl);
  _showJustificationLink('hotelJustificationLink', 'existingHotelJustification', data.hotelJustificationUrl);
  _showJustificationLink('achatJustificationLink', 'existingAchatJustification', data.achatJustificationUrl);

  // Reset file inputs
  ['peageJustification', 'hotelJustification', 'achatJustification'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Delete button: visible only if data exists
  const deleteBtn = document.getElementById('deleteDay');
  if (deleteBtn) deleteBtn.style.display = data && Object.keys(data).length ? '' : 'none';

  // Show modal
  const modal = document.getElementById('dayModal');
  if (modal) modal.classList.add('active');
}

function _setField(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}

function _showJustificationLink(linkId, wrapperId, url) {
  const link = document.getElementById(linkId);
  const wrapper = document.getElementById(wrapperId);
  if (link) link.href = url || '#';
  if (wrapper) wrapper.style.display = url ? '' : 'none';
}

// ===== Save / Delete =====

export async function saveDay() {
  if (!currentCoach || !selectedDay) {
    alert('Aucun profil ou jour sélectionné.');
    return;
  }

  const hours = parseFloat(document.getElementById('trainingHours')?.value) || 0;
  const km = parseFloat(document.getElementById('kilometers')?.value) || 0;
  const peage = parseFloat(document.getElementById('peage')?.value) || 0;
  const hotel = parseFloat(document.getElementById('hotel')?.value) || 0;
  const achat = parseFloat(document.getElementById('achat')?.value) || 0;
  const description = document.getElementById('competitionDescription')?.value?.trim() || null;
  const departurePlace = document.getElementById('departurePlace')?.value?.trim() || null;
  const arrivalPlace = document.getElementById('arrivalPlace')?.value?.trim() || null;
  const competition = document.getElementById('competitionDay')?.checked || false;

  const peageFile = document.getElementById('peageJustification')?.files?.[0];
  const hotelFile = document.getElementById('hotelJustification')?.files?.[0];
  const achatFile = document.getElementById('achatJustification')?.files?.[0];

  const key = `${currentCoach.id}-${selectedDay}`;
  const existing = timeData[key] || {};

  if (peage > 0 && !peageFile && !existing.justificationUrl) {
    alert('Veuillez joindre un justificatif de péage.');
    return;
  }
  if (hotel > 0 && !hotelFile && !existing.hotelJustificationUrl) {
    alert('Veuillez joindre un justificatif d\'hébergement.');
    return;
  }
  if (achat > 0 && !achatFile && !existing.achatJustificationUrl) {
    alert('Veuillez joindre un justificatif d\'achat.');
    return;
  }

  let peageUrl = existing.justificationUrl || null;
  let hotelUrl = existing.hotelJustificationUrl || null;
  let achatUrl = existing.achatJustificationUrl || null;

  if (peageFile) peageUrl = await __uploadExpenseJustification(peageFile, 'peage');
  if (hotelFile) hotelUrl = await __uploadExpenseJustification(hotelFile, 'hotel');
  if (achatFile) achatUrl = await __uploadExpenseJustification(achatFile, 'achat');

  const payload = {
    coach_id: currentCoach.id,
    date: selectedDay,
    hours,
    km,
    peage,
    hotel,
    achat,
    description,
    departure_place: departurePlace,
    arrival_place: arrivalPlace,
    competition,
    justification_url: peageUrl,
    hotel_justification_url: hotelUrl,
    achat_justification_url: achatUrl,
    owner_uid: currentUser?.id || null,
    owner_email: currentUser?.email || null,
  };

  const { data: saved, error } = await _supabase
    .from('time_data')
    .upsert([payload], { onConflict: 'coach_id,date' })
    .select();

  if (error) {
    alert('Erreur lors de la sauvegarde : ' + error.message);
    return;
  }

  const newTimeData = { ...timeData };
  newTimeData[key] = saved?.[0] || payload;
  setTimeData(newTimeData);

  await _logAuditEvent(
    'timesheet.update',
    'time_data',
    __buildAuditPayload({ entityId: key, metadata: { date: selectedDay, hours, km } }),
  );

  // Notifier l'admin par email (non-bloquant)
  if (_notifyAdminAlert) {
    const coachName = __getCoachDisplayName(currentCoach) || currentCoach.name || 'Inconnu';
    _notifyAdminAlert(coachName, selectedDay, { hours, km, peage, hotel, achat, competition }).catch(() => {});
  }

  document.getElementById('dayModal')?.classList.remove('active');
  await updateCalendar();
  updateSummary();
}

export async function deleteDay() {
  if (!currentCoach || !selectedDay) return;

  const key = `${currentCoach.id}-${selectedDay}`;
  const existing = timeData[key];
  if (!existing) {
    document.getElementById('dayModal')?.classList.remove('active');
    return;
  }

  if (!confirm(`Supprimer les données du ${selectedDay} ?`)) return;

  const { error } = await _supabase
    .from('time_data')
    .delete()
    .eq('coach_id', currentCoach.id)
    .eq('date', selectedDay);

  if (error) {
    alert('Erreur lors de la suppression : ' + error.message);
    return;
  }

  await _logAuditEvent(
    'timesheet.delete',
    'time_data',
    __buildAuditPayload({ entityId: key, metadata: { date: selectedDay } }),
  );

  const newTimeData = { ...timeData };
  delete newTimeData[key];
  setTimeData(newTimeData);

  document.getElementById('dayModal')?.classList.remove('active');
  await updateCalendar();
  updateSummary();
}

// Expose globally for backwards compat
window.updateCalendar = updateCalendar;
window.openDayModal = openDayModal;
window.saveDay = saveDay;
window.deleteDay = deleteDay;
window.loadCoaches = loadCoaches;
