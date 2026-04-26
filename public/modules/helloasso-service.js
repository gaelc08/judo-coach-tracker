/**
 * HelloAsso member sync service.
 * Provides functions to trigger server-side sync and read synced member data.
 */

export async function syncHelloAssoMembers(supabase) {
  const { data, error } = await supabase.functions.invoke('sync-helloasso', {
    method: 'POST',
  });
  if (error) {
    // Try to extract the real error message from the function response body
    const context = error.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        throw new Error(body.error || error.message);
      } catch (parseErr) {
        if (parseErr !== error) throw parseErr;
      }
    }
    throw error;
  }
  return data;
}

export async function getHelloAssoMembers(supabase) {
  const { data, error } = await supabase
    .from('helloasso_members')
    .select('*')
    .order('last_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getLastSyncTime(supabase) {
  const { data, error } = await supabase
    .from('helloasso_members')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.synced_at ?? null;
}

/**
 * Parse a HelloAsso CSV export and extract date_of_birth per email.
 * HelloAsso CSV columns vary by form, so we detect columns by header name.
 * Returns array of { email, date_of_birth, first_name, last_name }
 */
export function parseHelloAssoCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Detect separator (comma or semicolon)
  const sep = lines[0].includes(';') ? ';' : ',';

  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());

  // Find relevant column indices (HelloAsso uses French headers)
  const find = (...candidates) => {
    for (const c of candidates) {
      const idx = headers.findIndex((h) => h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iEmail     = find('email', 'courriel', 'mail');
  const iBirth     = find('naissance', 'birth', 'dob', 'né', 'date de naissance');
  const iFirstName = find('prénom', 'prenom', 'firstname', 'first name');
  const iLastName  = find('nom', 'lastname', 'last name', 'surname');

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const email = iEmail >= 0 ? cols[iEmail]?.toLowerCase().trim() : null;
    const dob   = iBirth >= 0 ? cols[iBirth]?.trim() : null;
    if (!email || !dob) continue;
    results.push({
      email,
      date_of_birth: dob,
      first_name: iFirstName >= 0 ? cols[iFirstName] : null,
      last_name:  iLastName  >= 0 ? cols[iLastName]  : null,
    });
  }
  return results;
}

/**
 * Import date_of_birth (and optionally name) from parsed CSV rows into helloasso_members.
 * Matches by email. Returns { updated, notFound }.
 */
export async function importHelloAssoCsvData(supabase, rows) {
  let updated = 0;
  const notFound = [];

  for (const row of rows) {
    if (!row.email || !row.date_of_birth) continue;
    const { data, error } = await supabase
      .from('helloasso_members')
      .update({ date_of_birth: row.date_of_birth })
      .ilike('email', row.email)
      .select('id');
    if (error || !data || data.length === 0) {
      notFound.push(row.email);
    } else {
      updated += data.length;
    }
  }
  return { updated, notFound };
}
