// summary-ui.js
// Monthly summary display, freeze management, and current profile UI.
// Exports: updateSummary, updateCurrentProfileUI, updateFreezeUI, toggleFreezeMonth, isCurrentMonthFrozen

import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeMonth, __escapeHtml } from './shared-utils.js';
import {
  coaches, timeData, frozenMonths, currentCoach, currentMonth, currentUser, currentAccessToken,
  setFrozenMonths, setCurrentMonth,
  __getProfileType, __isVolunteerProfile,
  __buildMonthlyAuditPayload,
  __calculateAnnualMileageAmount, __getMileageYearBreakdown, __formatNumberFr,
} from './app-context.js';
import { isCurrentUserAdminDB } from './admin-service.js';
import { __isAdminForUi } from './admin-service.js';
import { currencyDisplay, numberDisplay } from './display-format.js';

let _logAuditEvent = null;
export function initSummaryUi({ logAuditEvent }) {
  _logAuditEvent = logAuditEvent;
}

// ===== Freeze helpers =====
export function isCurrentMonthFrozen() {
  if (!currentCoach || !currentMonth) return false;
  return frozenMonths.has(`${currentCoach.id}-${__normalizeMonth(currentMonth)}`);
}

export function updateFreezeUI() {
  const frozen = isCurrentMonthFrozen();
  const banner = document.getElementById('frozenBanner');
  const btn = document.getElementById('freezeBtn');
  if (banner) banner.style.display = frozen ? 'block' : 'none';
  if (btn) {
    if (frozen) {
      btn.textContent = '🔓 Dégeler la fiche';
      btn.classList.add('frozen');
    } else {
      btn.textContent = '🔒 Geler la fiche';
      btn.classList.remove('frozen');
    }
  }
}

export async function toggleFreezeMonth() {
  if (!currentCoach || !currentMonth) { alert('Veuillez sélectionner un profil et un mois.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'admin peut geler ou dégeler une fiche."); return; }
  if (!currentAccessToken) { alert('Session invalide. Reconnectez-vous puis réessayez.'); return; }

  const normalizedMonth = __normalizeMonth(currentMonth);
  const frozen = isCurrentMonthFrozen();
  const key = `${currentCoach.id}-${normalizedMonth}`;

  if (frozen) {
    const urlObj = new URL(`${supabaseUrl}/rest/v1/frozen_timesheets`);
    urlObj.searchParams.set('coach_id', `eq.${currentCoach.id}`);
    urlObj.searchParams.set('month', `eq.${normalizedMonth}`);
    const res = await globalThis.fetch(urlObj.toString(), {
      method: 'DELETE',
      headers: { apikey: supabaseKey, Authorization: `Bearer ${currentAccessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      alert('Erreur lors du dégel : ' + (text || `${res.status} ${res.statusText}`));
      return;
    }
    const newFrozen = new Set(frozenMonths);
    newFrozen.delete(key);
    setFrozenMonths(newFrozen);
    await _logAuditEvent('timesheet.unfreeze', 'frozen_timesheet', __buildMonthlyAuditPayload({
      coach: currentCoach, entityId: key, month: normalizedMonth,
    }));
  } else {
    const res = await globalThis.fetch(`${supabaseUrl}/rest/v1/frozen_timesheets`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${currentAccessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify({ coach_id: currentCoach.id, month: normalizedMonth, frozen_by: currentUser?.email || null }),
    });
    if (!res.ok) {
      const text = await res.text();
      const lower = String(text || '').toLowerCase();
      if (lower.includes('check constraint') || lower.includes('23514')) {
        alert('Erreur lors du gel : la colonne month de frozen_timesheets refuse la valeur. Appliquez la correction SQL du format YYYY-MM dans la migration frozen_timesheets.');
      } else {
        alert('Erreur lors du gel : ' + (text || `${res.status} ${res.statusText}`));
      }
      return;
    }
    const newFrozen = new Set(frozenMonths);
    newFrozen.add(key);
    setFrozenMonths(newFrozen);
    await _logAuditEvent('timesheet.freeze', 'frozen_timesheet', __buildMonthlyAuditPayload({
      coach: currentCoach, entityId: key, month: normalizedMonth,
    }));
  }
  setCurrentMonth(normalizedMonth);
  updateFreezeUI();
}

// ===== Current profile UI =====
export function updateCurrentProfileUI() {
  if (!currentCoach) return;
  const isVolunteer = __isVolunteerProfile(currentCoach);
  const mileageSection = document.getElementById('mileageSection');
  const salarySection = document.getElementById('salarySection');
  const mileageBtn = document.getElementById('mileageBtn');
  const timesheetBtn = document.getElementById('timesheetBtn');
  const declarationBtn = document.getElementById('declarationBtn');
  if (mileageSection) mileageSection.style.display = isVolunteer ? 'none' : '';
  if (salarySection) salarySection.style.display = isVolunteer ? 'none' : '';
  if (mileageBtn) mileageBtn.style.display = isVolunteer ? 'none' : '';
  if (declarationBtn) declarationBtn.style.display = isVolunteer ? 'none' : '';
}

// ===== Monthly summary =====
export function updateSummary() {
  if (!currentCoach || !currentMonth) {
    const summaryEl = document.getElementById('summary');
    if (summaryEl) summaryEl.innerHTML = '';
    return;
  }

  const tdKeys = Object.keys(timeData);
  const matchingKeys = tdKeys.filter(k => k.startsWith(`${currentCoach.id}-${currentMonth}`));
  if (matchingKeys.length === 0) {
    const summaryEl = document.getElementById('summary');
    if (summaryEl) summaryEl.innerHTML = '<div class="summary-empty">Aucune donnée saisie pour ce mois.</div>';
    return;
  }

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const isVolunteer = __isVolunteerProfile(currentCoach);

  let totalHours = 0;
  let totalKm = 0;
  let totalPeage = 0;
  let totalHotel = 0;
  let totalAchat = 0;
  let competitionDays = 0;
  let trainingDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const key = `${currentCoach.id}-${dateStr}`;
    const data = timeData[key];
    if (!data) continue;
    totalHours += data.hours || 0;
    totalKm += data.km || 0;
    totalPeage += data.peage || 0;
    totalHotel += data.hotel || 0;
    totalAchat += data.achat || 0;
    if (data.competition) competitionDays++;
    else if (data.hours > 0 || data.km > 0) trainingDays++;
  }

  const hourlyRate = currentCoach.hourly_rate || 0;
  const dailyAllowance = currentCoach.daily_allowance || 0;
  const kmRate = currentCoach.km_rate || 0;

  const salaryHours = totalHours * hourlyRate;
  const salaryCompetition = competitionDays * dailyAllowance;
  const kmAmount = totalKm * kmRate;
  const totalGross = salaryHours + salaryCompetition + kmAmount + totalPeage + totalHotel + totalAchat;

  const summaryEl = document.getElementById('summary');
  if (!summaryEl) return;

  if (isVolunteer) {
    summaryEl.innerHTML = `
      <div class="summary-row"><span>Jours de séance :</span><span>${trainingDays}</span></div>
      <div class="summary-row"><span>Jours de compétition :</span><span>${competitionDays}</span></div>
      <div class="summary-row"><span>Km parcourus :</span><span>${numberDisplay(totalKm)} km</span></div>
    `;
  } else {
    summaryEl.innerHTML = `
      <div class="summary-row"><span>Heures :</span><span>${numberDisplay(totalHours)} h × ${currencyDisplay(hourlyRate)} = ${currencyDisplay(salaryHours)}</span></div>
      <div class="summary-row"><span>Compétitions :</span><span>${competitionDays} j × ${currencyDisplay(dailyAllowance)} = ${currencyDisplay(salaryCompetition)}</span></div>
      <div class="summary-row"><span>Km :</span><span>${numberDisplay(totalKm)} km × ${currencyDisplay(kmRate)} = ${currencyDisplay(kmAmount)}</span></div>
      ${totalPeage > 0 ? `<div class="summary-row"><span>Péages :</span><span>${currencyDisplay(totalPeage)}</span></div>` : ''}
      ${totalHotel > 0 ? `<div class="summary-row"><span>Hébergement :</span><span>${currencyDisplay(totalHotel)}</span></div>` : ''}
      ${totalAchat > 0 ? `<div class="summary-row"><span>Achats :</span><span>${currencyDisplay(totalAchat)}</span></div>` : ''}
      <div class="summary-row summary-total"><span>Total brut :</span><span>${currencyDisplay(totalGross)}</span></div>
    `;
  }

  updateFreezeUI();
  updateCurrentProfileUI();
}

// Expose globally for backwards compat (called from calendar-ui etc.)
window.updateSummary = updateSummary;
window.updateFreezeUI = updateFreezeUI;
window.isCurrentMonthFrozen = isCurrentMonthFrozen;
window.toggleFreezeMonth = toggleFreezeMonth;
