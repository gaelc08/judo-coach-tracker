export function getCoachDisplayName(coach) {
  if (!coach) return '';
  const firstName = String(coach.first_name || '').trim();
  const lastName = String(coach.name || '').trim();
  return [lastName, firstName].filter(Boolean).join(' ').trim();
}

export function getCurrentUserDisplayName(user, {
  preferredCoach = null,
  coaches = [],
  normalizeEmail,
  getCoachDisplayNameFn = getCoachDisplayName,
} = {}) {
  if (!user) return '';

  const preferredName = getCoachDisplayNameFn(preferredCoach);
  if (preferredName) return preferredName;

  const ownedCoach = (coaches || []).find((coach) =>
    coach?.owner_uid === user.id
    || (normalizeEmail(coach?.email) && normalizeEmail(coach?.email) === normalizeEmail(user.email))
  );
  const ownedCoachName = getCoachDisplayNameFn(ownedCoach);
  if (ownedCoachName) return ownedCoachName;

  const metaFirstName = String(user.user_metadata?.first_name || user.user_metadata?.firstname || '').trim();
  const metaLastName = String(user.user_metadata?.last_name || user.user_metadata?.lastname || user.user_metadata?.name || '').trim();
  const metadataName = [metaFirstName, metaLastName].filter(Boolean).join(' ').trim();
  if (metadataName) return metadataName;

  return String(user.email || '').trim();
}

export function getProfileType(profileOrType) {
  const raw = typeof profileOrType === 'string'
    ? profileOrType
    : (profileOrType?.profile_type || profileOrType?.role);
  const normalized = String(raw || 'coach').trim().toLowerCase();
  return normalized === 'benevole' ? 'benevole' : 'coach';
}

export function isVolunteerProfile(profileOrType) {
  return getProfileType(profileOrType) === 'benevole';
}

export function getProfileLabel(profileOrType, { capitalized = false, plural = false } = {}) {
  const type = getProfileType(profileOrType);
  let label = plural
    ? (type === 'benevole' ? 'bénévoles' : 'entraîneurs')
    : (type === 'benevole' ? 'bénévole' : 'entraîneur');

  if (capitalized) {
    label = label.charAt(0).toUpperCase() + label.slice(1);
  }

  return label;
}

export function findExistingProfileByEmail(email, {
  excludeId = null,
  coaches = [],
  normalizeEmail,
} = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  return (coaches || []).find((coach) => {
    if (!coach) return false;
    if (excludeId && coach.id === excludeId) return false;
    return normalizeEmail(coach.email) === normalizedEmail;
  }) || null;
}
