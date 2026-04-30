// coach-manager.js
// Coach profile CRUD: saveCoach, deleteCoach, inviteCoach, inviteAdmin
// and modal UI helpers: clearCoachForm, updateCoachFormProfileUI, openCoachModal

import { supabaseUrl, supabaseKey } from './env.js';
import { __normalizeEmail, __escapeHtml } from './shared-utils.js';
import {
  coaches, currentUser, currentAccessToken, currentCoach,
  setCoaches, setCurrentCoach, editMode, editingCoachId, setEditMode, setEditingCoachId,
  __getProfileType, __isVolunteerProfile, __getLegacyKmRateFromFiscalPower,
  __buildAuditPayload, __findExistingProfileByEmail, __getFreshAccessToken,
} from './app-context.js';
import { isCurrentUserAdminDB } from './admin-service.js';
import { updateSummary } from './summary-ui.js';
import { updateCalendar } from './calendar-ui.js';
import { loadCoaches } from './data-loader.js';

let _supabase = null;
let _coachWriteViaRest = null;
let _logAuditEvent = null;

export function initCoachManager({ supabase, coachWriteViaRest, logAuditEvent }) {
  _supabase = supabase;
  _coachWriteViaRest = coachWriteViaRest;
  _logAuditEvent = logAuditEvent;
}

// ===== Modal open helper =====
export function fillCoachForm(coach) {
  if (!coach) return;
  const profileType = coach.profile_type || coach.role || 'coach';
  const profileTypeEl = document.getElementById('coachProfileType');
  if (profileTypeEl) profileTypeEl.value = profileType;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  set('coachName',        coach.name);
  set('coachFirstName',   coach.first_name);
  set('coachEmail',       coach.email);
  set('coachAddress',     coach.address);
  set('coachVehicle',     coach.vehicle);
  set('coachFiscalPower', coach.fiscal_power);
  set('coachRate',        coach.hourly_rate);
  set('dailyAllowance',   coach.daily_allowance);
  set('coachOwnerUid',    coach.owner_uid);
  updateCoachFormProfileUI(profileType);
}

export function openCoachModal(mode, coach = null) {
  const modal = document.getElementById('coachModal');
  if (!modal) return;
  if (mode === 'edit') {
    document.getElementById('coachModalTitle').textContent = 'Modifier le profil';
    setEditMode(true);
    if (coach) {
      setEditingCoachId(coach.id);
      fillCoachForm(coach);
    }
  } else {
    document.getElementById('coachModalTitle').textContent = 'Ajouter un profil';
    clearCoachForm();
    setEditMode(false);
    setEditingCoachId(null);
  }
  modal.classList.add('active');
}

// ===== Form helpers =====
export function updateCoachFormProfileUI(profileType = null) {
  const resolvedType = __getProfileType(profileType || document.getElementById('coachProfileType')?.value);
  const isVolunteer = resolvedType === 'benevole';
  const isAdmin = resolvedType === 'admin';
  const title = document.getElementById('coachModalTitle');
  const rateGroup = document.getElementById('coachRateGroup');
  const allowanceGroup = document.getElementById('dailyAllowanceGroup');
  // Titre du modal : Bénévole / Administrateur / Entraîneur
  if (title) title.textContent = isVolunteer ? 'B\u00e9n\u00e9vole' : (isAdmin ? 'Administrateur' : 'Entra\u00eeneur');
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
  if (!currentUser) { alert('Aucun utilisateur connect\u00e9.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut effectuer cette action."); return; }

  const name = document.getElementById('coachName').value.trim();
  const profileType = __getProfileType(document.getElementById('coachProfileType').value);
  const isVolunteer = profileType === 'benevole';
  const isAdminProfile = profileType === 'admin';
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

  if (email) {
    const existing = __findExistingProfileByEmail(email, { excludeId: editMode ? editingCoachId : null });
    if (existing) { alert(`Un profil avec l'e-mail ${email} existe d\u00e9j\u00e0.`); return; }
  }

  const coachData = {
    name,
    // Le champ `role` doit refléter fidèlement le type de profil pour que
    // getProfileType() fonctionne même si profile_type est null en base.
    role: isVolunteer ? 'benevole' : (isAdminProfile ? 'admin' : 'entraineur'),
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
  const editedId = editingCoachId;
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000));

  let res;
  const dbPromise = wasEditMode
    ? _supabase.from('profiles').update([coachData]).eq('id', editedId).select()
    : _supabase.from('profiles').insert([coachData]).select();

  try {
    res = await Promise.race([dbPromise, timeoutPromise]);
  } catch (e) {
    console.warn('DEBUG saveCoach Supabase timeout, falling back to REST:', e.message);
    res = await _coachWriteViaRest(coachData, { editingId: editedId });
  }

  if (res.error) { alert('Erreur lors de la sauvegarde\u00a0: ' + res.error.message); return; }
  if (!res.data?.length) { alert('Erreur\u00a0: aucune donn\u00e9e retourn\u00e9e.'); return; }

  const saved = { id: res.data[0].id, ...res.data[0] };

  if (wasEditMode) {
    setCoaches(coaches.map((c) => (c.id === editedId ? saved : c)));
    // Si le profil édité est le profil actuellement sélectionné, mettre à jour currentCoach
    // pour que l'affichage (puissance fiscale, label, barème km, etc.) soit immédiatement correct.
    if (currentCoach?.id === editedId) {
      setCurrentCoach(saved);
    }
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
  updateCalendar();
}

// ===== Delete coach =====
export async function deleteCoach() {
  if (!currentUser) { alert('Aucun utilisateur connect\u00e9.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut supprimer un profil."); return; }
  if (!editingCoachId) { alert('Aucun profil s\u00e9lectionn\u00e9.'); return; }

  const coach = coaches.find((c) => c.id === editingCoachId);
  if (!confirm(`Supprimer le profil \u00ab ${coach?.name || editingCoachId} \u00bb ? Cette action est irr\u00e9versible.`)) return;

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

  const { error: e1 } = await _supabase.from('profiles').delete().eq('id', editingCoachId);
  if (e1) { alert('Erreur lors de la suppression\u00a0: ' + e1.message); return; }

  await _supabase.from('time_data').delete().eq('coach_id', editingCoachId);

  await _logAuditEvent('profile.delete', 'user_profile', __buildAuditPayload({ coach, entityId: editingCoachId }));

  setCoaches(coaches.filter((c) => c.id !== editingCoachId));
  document.getElementById('coachModal').classList.remove('active');
  clearCoachForm();
  setEditMode(false);
  setEditingCoachId(null);
  loadCoaches();
  updateSummary();
  updateCalendar();
}

// ===== Invite coach =====
export async function inviteCoach(email) {
  if (!currentUser) { alert('Aucun utilisateur connect\u00e9.'); return; }
  const isAdmin = await isCurrentUserAdminDB();
  if (!isAdmin) { alert("Seul l'administrateur peut inviter un entra\u00eeneur."); return; }
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
    if (!res.ok) { alert('Erreur lors de l\'invitation\u00a0: ' + (json.error || res.statusText)); return; }
    alert(`Invitation envoy\u00e9e \u00e0 ${normalizedEmail}.`);
  } catch (e) {
    alert('Erreur\u00a0: ' + e.message);
  }
}

// ===== Invite admin =====
export async function inviteAdmin(email) {
  if (!currentUser) { alert('Aucun utilisateur connect\u00e9.'); return; }
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
    if (!res.ok) { alert('Erreur lors de l\'invitation admin\u00a0: ' + (json.error || res.statusText)); return; }
    alert(`Invitation admin envoy\u00e9e \u00e0 ${normalizedEmail}.`);
  } catch (e) {
    alert('Erreur\u00a0: ' + e.message);
  }
}
