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
