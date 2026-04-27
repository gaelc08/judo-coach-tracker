// competitions-service.js
// Fetches competitions from Supabase and triggers sync via Edge Function.

import { supabaseUrl, supabaseKey, effectiveEnv } from './env.js';

/**
 * Fetch competitions from Supabase with optional filters.
 * @param {Object} opts
 * @param {string|null} opts.niveau  - Filter by niveau (e.g. 'DEPARTEMENTAL')
 * @param {string[]|null} opts.categories - Filter by categories (array overlap)
 * @param {boolean} opts.upcoming   - Only return future competitions (date >= today - 7d)
 * @returns {Promise<Array>}
 */
export async function fetchCompetitions({ niveau = null, categories = null, upcoming = true } = {}) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, supabaseKey);

  let query = supabase
    .from('competitions')
    .select('*')
    .order('date', { ascending: true });

  if (upcoming) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);
    query = query.gte('date', cutoff.toISOString().slice(0, 10));
  }

  if (niveau) {
    query = query.eq('niveau', niveau.toUpperCase());
  }

  if (categories && categories.length > 0) {
    // Filter rows where the categories array overlaps with the requested categories
    query = query.overlaps('categories', categories.map((c) => c.toUpperCase()));
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchCompetitions error: ${error.message}`);
  return data ?? [];
}

/**
 * Toggle the club_selected flag on a competition (admin only).
 * @param {string} id - competition UUID
 * @param {boolean} selected
 * @param {string} accessToken - admin JWT
 * @returns {Promise<void>}
 */
export async function toggleClubSelected(id, selected, accessToken) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { error } = await supabase
    .from('competitions')
    .update({ club_selected: selected, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`toggleClubSelected error: ${error.message}`);
}

/**
 * Trigger the sync-competitions Edge Function (admin only).
 * @param {string} accessToken - admin JWT
 * @returns {Promise<{synced: number, errors: number, skipped: number}>}
 */
export async function triggerSync(accessToken) {
  // Correct Supabase Edge Function URL format: <project>.supabase.co/functions/v1/<name>
  const fnUrl = supabaseUrl.replace(/\/$/, '') + '/functions/v1/sync-competitions';

  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`sync-competitions returned non-JSON (status ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(body?.error || `sync-competitions failed (status ${res.status})`);
  }

  return { synced: body.synced ?? 0, errors: body.errors ?? 0, skipped: body.skipped ?? 0 };
}
