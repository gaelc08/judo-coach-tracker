// coach-manager.js
// Coach profile CRUD: saveCoach, deleteCoach, inviteCoach, inviteAdmin
// and modal UI helpers: clearCoachForm, updateCoachFormProfileUI

import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeEmail, __escapeHtml } from './shared-utils.js';
import {
  coaches, currentUser, currentAccessToken,
  setCoaches, editMode, editingCoachId, setEditMode, setEditingCoachId,
  __getProfileType, __isVolunteerProfile, __getLegacyKmRateFromFiscalPower,
  __buildAuditPayload, __findExistingProfileByEmail, __getFreshAccessToken,
} from './app-context.js';
import { isCurrentUserAdminDB } from './admin-service.js';
import { updateSummary } from './summary-ui.js';
import { loadCoaches } from './data-loader.js';

let _supabase = null;
let _coachWriteViaRest = null;
let _logAuditEvent = null;

export function initCoachManager({ supabase, coachWriteViaRest, logAuditEvent }) {
  _supabase = supabase;
  _coachWriteViaRest = coachWriteViaRest;
  _logAuditEvent = logAuditEvent;
}

// ===== Form helpers =====
export function updateCoachFormProfileUI(profileType = null) {
  const resolvedType = __getProfileType(profileType || document.getElementById('coachProfileType')?.value);
  const isVolunteer = resolvedType === 'benevole';
  const title = document.getElementById('coachModalTitle');
  const rateGroup = document.getElementById('coachRateGroup');
  const allowanceGroup = document.getElementById('dailyAllowanceGroup');
  if (title) title.textContent = isVolunteer ? 'Bénévole' : 'Entraîneur';
  if (rateGroup) rateGroup.style.display = isVolunteer ? 'none' : '';
  if (allowanceGroup) allowanceGroup.style.display = isVolunteer ? 'none' : '';
}

export function clearCoachForm() {
  document.getElementById('coachProfileType').value = 'coach';
  document.getElementById('coachName').value = '';
  document.getElementById('coachFirstName').value = '';
  document.getElementById('coachEmail').value = '';
  document.getElementById('coachAddress').value = '';
  document.getElementById('coachVehicle').value = '';
  document.getElementById('coachFiscalPower').value = '';
  document.getElementById('coachRate').value = '';
  document.getElementById('dailyAllowance').value = '';
  updateCoachFormProfileUI('coach');
}

// ===== Save coach =====
export async function saveCoach() {
  console.log('DEBUG saveCoach START');
  if (!currentUser) { alert('Aucun utilisateur connecté.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut effectuer cette action."); return; }

  const name = document.getElementById('coachName').value.trim();
  const profileType = __getProfileType(document.getElementById('coachProfileType').value);
  const isVolunteer = profileType === 'benevole';
  const firstName = document.getElementById('coachFirstName').value.trim();
  const email = __normalizeEmail(document.getElementById('coachEmail').value);
  const address = document.getElementById('coachAddress').value.trim();
  const vehicle = document.getElementById('coachVehicle').value.trim();
  const fiscalPower = document.getElementById('coachFiscalPower').value.trim();
  const rate = isVolunteer ? 0 : (parseFloat(document.getElementById('coachRate').value) || 0);
  const allowance = isVolunteer ? 0 : (parseFloat(document.getElementById('dailyAllowance').value) || 0);
  const kmRate = isVolunteer ? 0 : (__getLegacyKmRateFromFiscalPower(fiscalPower) || 0);
  const ownerUid = document.getElementById('coachOwnerUid')?.value?.trim() || null;

  if (!name) { alert('Veuillez saisir un nom.'); return; }

  // Duplicate email check
  if (email) {
    const existing = __findExistingProfileByEmail(email, { excludeId: editMode ? editingCoachId : null });
    if (existing) { alert(`Un profil avec l'e-mail ${email} existe déjà.`); return; }
  }

  const coachData = {
    name,
    role: isVolunteer ? 'benevole' : 'entraineur',
    profile_type: profileType,
    first_name: firstName,
    email: email || null,
    address: address || null,
    vehicle: vehicle || null,
    fiscal_power: fiscalPower || null,
    hourly_rate: rate,
    daily_allowance: allowance,
    km_rate: kmRate,
    owner_uid: ownerUid || null,
  };

  const wasEditMode = !!(editMode && editingCoachId);
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000));

  let res;
  const dbPromise = (editMode && editingCoachId)
    ? _supabase.from('users').update([coachData]).eq('id', editingCoachId).select()
    : _supabase.from('users').insert([coachData]).select();

  try {
    res = await Promise.race([dbPromise, timeoutPromise]);
  } catch (e) {
    console.warn('DEBUG saveCoach Supabase timeout, falling back to REST:', e.message);
    res = await _coachWriteViaRest(coachData, { editingId: editingCoachId });
  }

  if (res.error) { alert('Erreur lors de la sauvegarde : ' + res.error.message); return; }
  if (!res.data?.length) { alert('Erreur : aucune donnée retournée.'); return; }

  const saved = { id: res.data[0].id, ...res.data[0] };
  if (wasEditMode) {
    setCoaches(coaches.map((c) => (c.id === editingCoachId ? saved : c)));
  } else {
    setCoaches([...coaches, saved]);
  }

  await _logAuditEvent(
    wasEditMode ? 'profile.update' : 'profile.create',
    'user_profile',
    __buildAuditPayload({ coach: saved, entityId: saved.id }),
  );

  document.getElementById('coachModal').classList.remove('active');
  clearCoachForm();
  setEditMode(false);
  setEditingCoachId(null);
  loadCoaches();
  updateSummary();
}

// ===== Delete coach =====
export async function deleteCoach() {
  if (!currentUser) { alert('Aucun utilisateur connecté.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut supprimer un profil."); return; }
  if (!editingCoachId) { alert('Aucun profil sélectionné.'); return; }

  const coach = coaches.find((c) => c.id === editingCoachId);
  if (!confirm(`Supprimer le profil « ${coach?.name || editingCoachId} » ? Cette action est irréversible.`)) return;

  // Delete auth user via Edge Function
  if (coach?.owner_uid) {
    try {
      const accessToken = await __getFreshAccessToken(_supabase);
      await globalThis.fetch(`${supabaseUrl}/functions/v1/delete-coach-user`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', apikey: supabaseKey },
        body: JSON.stringify({ userId: coach.owner_uid }),
      });
    } catch (e) {
      console.warn('DEBUG deleteCoach: delete-coach-user failed:', e);
    }
  }

  const { error: e1 } = await _supabase.from('users').delete().eq('id', editingCoachId);
  if (e1) { alert('Erreur lors de la suppression : ' + e1.message); return; }

  await _supabase.from('time_data').delete().eq('coach_id', editingCoachId);

  await _logAuditEvent('profile.delete', 'user_profile', __buildAuditPayload({ coach, entityId: editingCoachId }));

  setCoaches(coaches.filter((c) => c.id !== editingCoachId));
  document.getElementById('coachModal').classList.remove('active');
  clearCoachForm();
  setEditMode(false);
  setEditingCoachId(null);
  loadCoaches();
  updateSummary();
}

// ===== Invite coach =====
export async function inviteCoach(email) {
  if (!currentUser) { alert('Aucun utilisateur connecté.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut inviter un entraîneur."); return; }
  const normalizedEmail = __normalizeEmail(email);
  if (!normalizedEmail) { alert("Adresse e-mail invalide."); return; }
  const accessToken = await __getFreshAccessToken(_supabase);
  if (!accessToken) { alert('Session invalide. Reconnectez-vous.'); return; }
  try {
    const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/invite-coach`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', apikey: supabaseKey },
      body: JSON.stringify({ email: normalizedEmail, redirectTo: window.location.origin + window.location.pathname }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert('Erreur lors de l\'invitation : ' + (json.error || res.statusText)); return; }
    alert(`Invitation envoyée à ${normalizedEmail}.`);
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}

// ===== Invite admin =====
export async function inviteAdmin(email) {
  if (!currentUser) { alert('Aucun utilisateur connecté.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut inviter un administrateur."); return; }
  const normalizedEmail = __normalizeEmail(email);
  if (!normalizedEmail) { alert("Adresse e-mail invalide."); return; }
  const accessToken = await __getFreshAccessToken(_supabase);
  if (!accessToken) { alert('Session invalide. Reconnectez-vous.'); return; }
  try {
    const res = await globalThis.fetch(`${supabaseUrl}/functions/v1/invite-admin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', apikey: supabaseKey },
      body: JSON.stringify({ email: normalizedEmail, redirectTo: window.location.origin + window.location.pathname }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert('Erreur lors de l\'invitation admin : ' + (json.error || res.statusText)); return; }
    alert(`Invitation admin envoyée à ${normalizedEmail}.`);
  } catch (e) {
    alert('Erreur : ' + e.message);
  }
}
