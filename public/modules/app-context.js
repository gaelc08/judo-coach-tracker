// app-context.js
// Shared mutable state and helper builders used across all modules.

import { __normalizeEmail, __normalizeMonth, __hasAdminClaim } from './shared-utils.js';
import { getCoachDisplayName, getCurrentUserDisplayName, getProfileType, isVolunteerProfile, isAdminProfile, getProfileLabel, findExistingProfileByEmail } from './profile-utils.js';
import { parseFiscalPower, getMileageScaleBand, getLegacyKmRateFromFiscalPower, formatNumberFr, getMileageScaleDescription, calculateAnnualMileageAmount, getMileageYearBreakdown, getMonthlyMileageBreakdown } from './mileage-service.js';

// ===== In-memory state =====
export let coaches = [];
export let timeData = {};
export let currentCoach = null;
export let frozenMonths = new Set();
export let currentUser = null;
export let currentSession = null;
export let currentAccessToken = null;
export let auditLogs = [];
export let __eventListenersSetup = false;
export let __monthlySummaryPreviewState = { month: null, report: null };

const __now = new Date();
export let currentMonth = `${__now.getFullYear()}-${String(__now.getMonth() + 1).padStart(2, '0')}`;
export let selectedDay = null;
export let editMode = false;
export let editingCoachId = null;

// ===== State setters =====
export function setCoaches(v) { coaches = v; }
export function setTimeData(v) { timeData = v; }
export function setCurrentCoach(v) { currentCoach = v; }
export function setFrozenMonths(v) { frozenMonths = v; }
export function setCurrentUser(v) { currentUser = v; }
export function setCurrentSession(v) { currentSession = v; }
export function setCurrentAccessToken(v) { currentAccessToken = v; }
export function setAuditLogs(v) { auditLogs = v; }
export function setEventListenersSetup(v) { __eventListenersSetup = v; }
export function setMonthlySummaryPreviewState(v) { __monthlySummaryPreviewState = v; }
export function setCurrentMonth(v) { currentMonth = v; }
export function setSelectedDay(v) { selectedDay = v; }
export function setEditMode(v) { editMode = v; }
export function setEditingCoachId(v) { editingCoachId = v; }

// ===== Profile helpers (re-exported with context) =====
export const __getCoachDisplayName = getCoachDisplayName;
export const __getProfileType = getProfileType;
export const __isVolunteerProfile = isVolunteerProfile;
export const __isAdminProfile = isAdminProfile;
export const __getProfileLabel = getProfileLabel;

export function __getCurrentUserDisplayName(user, preferredCoach = null) {
  return getCurrentUserDisplayName(user, {
    preferredCoach,
    coaches,
    normalizeEmail: __normalizeEmail,
    getCoachDisplayNameFn: __getCoachDisplayName,
  });
}

export function __findExistingProfileByEmail(email, { excludeId = null } = {}) {
  return findExistingProfileByEmail(email, {
    excludeId,
    coaches,
    normalizeEmail: __normalizeEmail,
  });
}

// ===== Mileage helpers =====
export const __parseFiscalPower = parseFiscalPower;
export const __getMileageScaleBand = getMileageScaleBand;
export const __getLegacyKmRateFromFiscalPower = getLegacyKmRateFromFiscalPower;
export const __formatNumberFr = formatNumberFr;
export const __getMileageScaleDescription = getMileageScaleDescription;
export const __calculateAnnualMileageAmount = calculateAnnualMileageAmount;

export function __getMileageYearBreakdown(coach, year) {
  return getMileageYearBreakdown(coach, year, { timeData });
}

export function __getMonthlyMileageBreakdown(coach, monthValue) {
  return getMonthlyMileageBreakdown(coach, monthValue, { timeData });
}

// ===== Audit payload builders =====
export function __buildAuditPayload({
  coach = null,
  entityId = null,
  targetUserId,
  targetEmail,
  metadata = {},
} = {}) {
  const resolvedCoach = coach || currentCoach || null;
  const nextMetadata = { ...metadata };
  if (resolvedCoach?.id != null && nextMetadata.coach_id == null) {
    nextMetadata.coach_id = resolvedCoach.id;
  }
  if (resolvedCoach && nextMetadata.coach_name == null) {
    nextMetadata.coach_name = __getCoachDisplayName(resolvedCoach) || resolvedCoach.name || null;
  }
  return {
    entityId,
    targetUserId: targetUserId ?? resolvedCoach?.owner_uid ?? null,
    targetEmail: targetEmail ?? resolvedCoach?.email ?? null,
    metadata: nextMetadata,
  };
}

export function __buildMonthlyAuditPayload({
  coach = null,
  entityId = null,
  month = null,
  metadata = {},
  targetUserId,
  targetEmail,
} = {}) {
  const resolvedMonth = month || currentMonth;
  const normalizedMonth = resolvedMonth ? __normalizeMonth(resolvedMonth) : null;
  return __buildAuditPayload({
    coach,
    entityId,
    targetUserId,
    targetEmail,
    metadata: {
      ...(normalizedMonth ? { month: normalizedMonth } : {}),
      ...metadata,
    },
  });
}

export async function __getFreshAccessToken(supabase) {
  let accessToken = currentAccessToken;
  const currentTokenHasAdminClaim = __hasAdminClaim(accessToken);
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.access_token) {
      const refreshedAccessToken = session.access_token;
      if (currentTokenHasAdminClaim && !__hasAdminClaim(refreshedAccessToken)) {
        return accessToken;
      }
      accessToken = refreshedAccessToken;
      currentAccessToken = accessToken;
      return accessToken;
    }
    const { data: { session: existing } } = await supabase.auth.getSession();
    if (existing?.access_token) {
      accessToken = existing.access_token;
      currentAccessToken = accessToken;
    }
  } catch {}
  return accessToken;
}
