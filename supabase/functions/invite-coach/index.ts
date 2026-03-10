/**
 * Supabase Edge Function — invite-coach
 *
 * Allows an admin to invite a new coach by email using the Supabase Admin API.
 * Supabase sends an invitation email to the coach; clicking the link lets them
 * set their password and log in for the first time.
 *
 * The coach's pre-created profile (in the `coaches` table) is then
 * automatically linked to their auth account on first login via the
 * `claim_coach_profile()` database function.
 *
 * Request body (JSON):
 *   { "email": "coach@example.com", "redirectTo": "https://..." }
 *
 * Authorization: Bearer <admin JWT>
 *
 * Deployment
 * ----------
 * supabase functions deploy invite-coach --project-ref <your-project-ref>
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

function buildAuthDebug(authHeader: string | null, token: string, userError?: { message?: string } | null) {
  const authScheme = authHeader ? authHeader.split(/\s+/, 1)[0] : null
  return {
    hasAuthorizationHeader: !!authHeader,
    authScheme,
    tokenLength: token.length,
    tokenSegments: token ? token.split('.').length : 0,
    userError: userError?.message ?? null,
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('DEBUG invite-coach missing configuration:', { requestId })
      return jsonResponse({ error: 'Server configuration error', requestId }, 500)
    }

    // Create an admin client (service role — never exposed to the browser)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      const debug = buildAuthDebug(authHeader, '')
      console.warn('DEBUG invite-coach missing auth header:', { requestId, debug })
      return jsonResponse({ error: 'Missing Authorization header', requestId, debug }, 401)
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      const debug = buildAuthDebug(authHeader, token, userError)
      console.warn('DEBUG invite-coach auth failed:', { requestId, debug })
      return jsonResponse({ error: 'Unauthorized', requestId, debug }, 401)
    }

    // Only admins may send invitations
    const isAdmin = user.app_metadata?.is_admin === true
    if (!isAdmin) {
      console.warn('DEBUG invite-coach forbidden:', { requestId, userId: user.id })
      return jsonResponse({ error: 'Forbidden: admin only', requestId }, 403)
    }

    // Parse request body
    const { email, redirectTo } = await req.json()
    if (!email || typeof email !== 'string') {
      return jsonResponse({ error: 'Missing or invalid email', requestId }, 400)
    }

    // Determine the redirect URL for the invitation link
    const siteUrl =
      redirectTo ||
      Deno.env.get('SITE_URL') ||
      'https://gaelc08.github.io/judo-coach-tracker/'

    // Send the invitation email via Supabase Auth admin API
    const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: siteUrl }
    )

    if (inviteError) {
      console.error('DEBUG invite-coach invite failed:', { requestId, error: inviteError.message, email })
      return jsonResponse({ error: inviteError.message, requestId }, 400)
    }

    console.log('DEBUG invite-coach success:', { requestId, email, userId: data.user?.id })
    return jsonResponse({ success: true, userId: data.user?.id, requestId }, 200)
  } catch (e) {
    console.error('DEBUG invite-coach unexpected error:', { requestId, error: String(e) })
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
