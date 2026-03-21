/**
 * Supabase Edge Function — sync-helloasso
 *
 * Triggered by an admin to pull all members and payments from the HelloAsso API
 * and upsert them into the `helloasso_members` table.
 *
 * Authorization: Bearer <admin JWT>
 *
 * Deployment
 * ----------
 * supabase functions deploy sync-helloasso --project-ref <your-project-ref>
 *
 * Required secrets (set via `supabase secrets set`):
 *   HELLOASSO_CLIENT_ID
 *   HELLOASSO_CLIENT_SECRET
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ---- HelloAsso helpers ----

async function getHelloAssoToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://api.helloasso.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HelloAsso token error ${res.status}: ${text}`)
  }
  const json = await res.json()
  return json.access_token as string
}

type HelloAssoPage<T> = {
  data: T[]
  pagination?: {
    continuationToken?: string
    totalCount?: number
  }
}

async function fetchAllPages<T>(
  baseUrl: string,
  token: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = []
  let continuationToken: string | undefined = undefined

  do {
    const url = new URL(baseUrl)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    if (continuationToken) {
      url.searchParams.set('continuationToken', continuationToken)
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HelloAsso fetch error ${res.status} for ${url}: ${text}`)
    }

    const page: HelloAssoPage<T> = await res.json()
    results.push(...(page.data ?? []))
    continuationToken = page.pagination?.continuationToken
  } while (continuationToken)

  return results
}

// ---- Main handler ----

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', requestId }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const helloAssoClientId = Deno.env.get('HELLOASSO_CLIENT_ID')
    const helloAssoClientSecret = Deno.env.get('HELLOASSO_CLIENT_SECRET')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('DEBUG sync-helloasso missing Supabase configuration:', { requestId })
      return jsonResponse({ error: 'Server configuration error (Supabase)', requestId }, 500)
    }

    if (!helloAssoClientId || !helloAssoClientSecret) {
      console.error('DEBUG sync-helloasso missing HelloAsso credentials:', { requestId })
      return jsonResponse({ error: 'Server configuration error (HelloAsso credentials not set)', requestId }, 500)
    }

    // Create an admin client (service role — never exposed to the browser)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header', requestId }, 401)
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    // Verify JWT and extract user info via Supabase admin
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      console.warn('DEBUG sync-helloasso auth failed:', { requestId, error: userError?.message })
      return jsonResponse({ error: 'Unauthorized', requestId }, 401)
    }

    // Check admin — use app_metadata (set server-side, not forgeable by users)
    const isAdmin = user.app_metadata?.is_admin === true
      || user.app_metadata?.is_admin === 'true'
      || user.role === 'service_role'

    if (!isAdmin) {
      console.warn('DEBUG sync-helloasso forbidden:', { requestId, userId: user.id })
      return jsonResponse({ error: 'Forbidden: admin only', requestId }, 403)
    }

    const actorUid = user.id
    const actorEmail = user.email ?? null

    console.log('DEBUG sync-helloasso start:', { requestId, actorUid })

    // ---- Get HelloAsso OAuth token ----
    const haToken = await getHelloAssoToken(helloAssoClientId, helloAssoClientSecret)

    const ORG = 'judo-club-cattenom-rodemack'

    // ---- Fetch all membership items (adhérents) ----
    // The /members endpoint is not available for this API key; use /forms/.../items instead.
    type HaItem = {
      id?: number | string
      payer?: { email?: string; firstName?: string; lastName?: string }
      user?: { firstName?: string; lastName?: string }
      payments?: Array<{ amount?: number; date?: string; state?: string }>
      order?: { date?: string; id?: number }
      amount?: number
      state?: string
      [key: string]: unknown
    }
    const items = await fetchAllPages<HaItem>(
      `https://api.helloasso.com/v5/organizations/${ORG}/forms/Membership/adhesion-2025-2026-sport/items`,
      haToken,
    )
    console.log('DEBUG sync-helloasso items fetched:', items.length)

    // ---- Build upsert rows from items ----
    const rows = items.map((item) => {
      const payer = item.payer ?? {}
      const user = item.user ?? {}
      const firstPayment = (item.payments ?? [])[0]
      const amountCentimes = item.amount ?? firstPayment?.amount
      return {
        helloasso_id: String(item.id ?? ''),
        first_name: user.firstName ?? payer.firstName ?? null,
        last_name: user.lastName ?? payer.lastName ?? null,
        email: payer.email ?? null,
        date_of_birth: null,
        membership_amount: amountCentimes != null ? amountCentimes / 100 : null,
        membership_date: item.order?.date ?? firstPayment?.date ?? null,
        membership_state: item.state ?? firstPayment?.state ?? null,
        raw_data: item as Record<string, unknown>,
        synced_at: new Date().toISOString(),
      }
    })

    // ---- Upsert into helloasso_members ----
    const { error: upsertError } = await supabaseAdmin
      .from('helloasso_members')
      .upsert(rows, { onConflict: 'helloasso_id' })

    if (upsertError) {
      console.error('DEBUG sync-helloasso upsert error:', { requestId, error: upsertError.message })
      return jsonResponse({ error: `Upsert failed: ${upsertError.message}`, requestId }, 500)
    }

    const syncedAt = new Date().toISOString()

    // ---- Insert audit log ----
    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      actor_uid: actorUid,
      actor_email: actorEmail,
      action: 'helloasso_sync',
      entity_type: 'helloasso_members',
      entity_id: null,
      target_user_id: null,
      target_email: null,
      metadata: { count: rows.length, synced_at: syncedAt, requestId },
    })

    if (auditError) {
      console.warn('DEBUG sync-helloasso audit log failed:', auditError.message)
    }

    console.log('DEBUG sync-helloasso success:', { requestId, count: rows.length, syncedAt })
    return jsonResponse({ count: rows.length, synced_at: syncedAt, requestId }, 200)
  } catch (e) {
    console.error('DEBUG sync-helloasso unexpected error:', { requestId, error: String(e) })
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
