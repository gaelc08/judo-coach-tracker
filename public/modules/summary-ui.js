// summary-ui.js
// Monthly summary display, freeze management, and current profile UI.
// Exports: updateSummary, updateCurrentProfileUI, updateFreezeUI, toggleFreezeMonth, isCurrentMonthFrozen
// + bouton "Copier pour CEA" pour alimenter le script Tampermonkey cea-autofill

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
import { getCoachCivilite } from './profile-utils.js';

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
      btn.textContent = '\uD83D\uDD13 Dégeler la fiche';
      btn.classList.add('frozen');
    } else {
      btn.textContent = '\uD83D\uDD12 Geler la fiche';
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
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  if (!currentCoach || !currentMonth) {
    ['totalHours','hourlyRate','trainingPayment','compDays','compPayment',
     'totalKm','kmPayment','tollPayment','hotelPayment','purchasePayment',
     'urssafTotalPayment','reimbursementTotalPayment'].forEach(id => setVal(id, '\u2014'));
    return;
  }

  const tdKeys = Object.keys(timeData);
  const matchingKeys = tdKeys.filter(k => k.startsWith(`${currentCoach.id}-${currentMonth}`));
  if (matchingKeys.length === 0) {
    ['totalHours','hourlyRate','trainingPayment','compDays','compPayment',
     'totalKm','kmPayment','tollPayment','hotelPayment','purchasePayment',
     'urssafTotalPayment','reimbursementTotalPayment'].forEach(id => setVal(id, '0'));
    updateFreezeUI();
    updateCurrentProfileUI();
    return;
  }

  const [year, month] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const isVolunteer = __isVolunteerProfile(currentCoach);

  let totalHours = 0, totalKm = 0, totalPeage = 0, totalHotel = 0, totalAchat = 0;
  let competitionDays = 0, trainingDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const data = timeData[`${currentCoach.id}-${dateStr}`];
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
  const totalReimbursement = kmAmount + totalPeage + totalHotel + totalAchat;
  const totalGross = salaryHours + salaryCompetition;

  // Affichage/masquage des lignes coach vs bénévole
  const hideIds = isVolunteer
    ? ['summaryRateItem','summaryTrainingPaymentItem','summaryCompPaymentItem','summaryUrssafTotalItem']
    : [];
  ['summaryRateItem','summaryTrainingPaymentItem','summaryCompPaymentItem','summaryUrssafTotalItem'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = hideIds.includes(id) ? 'none' : '';
  });

  setVal('totalHours',            numberDisplay(totalHours, 2) + ' h');
  setVal('hourlyRate',            currencyDisplay(hourlyRate));
  setVal('trainingPayment',       currencyDisplay(salaryHours));
  setVal('compDays',              competitionDays + ' j');
  setVal('compPayment',           currencyDisplay(salaryCompetition));
  setVal('totalKm',               numberDisplay(totalKm) + ' km');
  setVal('kmPayment',             currencyDisplay(kmAmount));
  setVal('tollPayment',           currencyDisplay(totalPeage));
  setVal('hotelPayment',          currencyDisplay(totalHotel));
  setVal('purchasePayment',       currencyDisplay(totalAchat));
  setVal('urssafTotalPayment',    currencyDisplay(totalGross));
  setVal('reimbursementTotalPayment', currencyDisplay(totalReimbursement));

  // Met à jour le payload CEA avec les valeurs calculées
  _updateCEAButton({
    nomCoach:         `${getCoachCivilite(currentCoach)} ${currentCoach.name || ''} ${currentCoach.first_name || ''}`.trim(),
    mois:             currentMonth,
    heures:           totalHours,
    tauxHoraire:      hourlyRate,
    salaireFormation: salaryHours,
    joursComp:        competitionDays,
    salaireComp:      salaryCompetition,
    salaireBrut:      totalGross,
  });

  updateFreezeUI();
  updateCurrentProfileUI();
}

// ===== Bouton "Copier pour CEA" =====
let _ceaPayload = null;

function _updateCEAButton(payload) {
  _ceaPayload = payload;
  const btn = document.getElementById('cea-copy-btn');
  if (btn) btn.disabled = false;
}

export function initCEACopyButton() {
  if (document.getElementById('cea-copy-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'cea-copy-btn';
  btn.type = 'button';
  btn.disabled = true;
  btn.innerHTML = '\uD83D\uDCCB Copier pour CEA';
  btn.title = 'Copie les données du mois dans le presse-papier pour le script Tampermonkey CEA URSSAF';
  btn.style.cssText = [
    'display:block',
    'margin: 12px auto 4px',
    'padding: 8px 20px',
    'background: #1E3A7B',
    'color: #fff',
    'border: none',
    'border-radius: 6px',
    'font-size: 0.95rem',
    'cursor: pointer',
    'opacity: 0.6',
    'transition: opacity .2s',
  ].join(';');

  btn.addEventListener('mouseenter', () => { if (!btn.disabled) btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { if (!btn.disabled) btn.style.opacity = '0.85'; });

  btn.addEventListener('click', async () => {
    if (!_ceaPayload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(_ceaPayload, null, 2));
      btn.innerHTML = '\u2705 Copié !';
      setTimeout(() => { btn.innerHTML = '\uD83D\uDCCB Copier pour CEA'; }, 2500);
    } catch {
      alert('Impossible d\'accéder au presse-papier. Vérifiez les permissions du navigateur.');
    }
  });

  const target =
    document.getElementById('summarySection') ||
    document.getElementById('summary') ||
    document.querySelector('.summary');

  if (target) {
    target.appendChild(btn);
  } else {
    setTimeout(() => {
      const t = document.querySelector('.summary');
      if (t) t.appendChild(btn);
    }, 800);
  }
}

// Expose globally for backwards compat
window.updateSummary = updateSummary;
window.updateFreezeUI = updateFreezeUI;
window.isCurrentMonthFrozen = isCurrentMonthFrozen;
window.toggleFreezeMonth = toggleFreezeMonth;
window.initCEACopyButton = initCEACopyButton;
