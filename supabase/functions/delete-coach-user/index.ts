// @ts-nocheck
/**
 * Supabase Edge Function — delete-coach-user
 *
 * Deletes a coach's Supabase Auth user account using the Admin API.
 * Intended to be called by an admin before removing the coach profile.
 *
 * Request body (JSON):
 *   { "userId": "<uuid|null>", "email": "coach@example.com|null" }
 *
 * Authorization: Bearer <admin JWT>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasAdminAccess } from '../invite-coach/auth-helpers.mjs'

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

function normalizeEmail(email: unknown): string | null {
  const value = String(email ?? '').trim().toLowerCase()
  return value || null
}

async function insertAuditLog(
  supabaseAdmin: ReturnType<typeof createClient>,
  {
    actorUid,
    actorEmail,
    action,
    entityType,
    entityId = null,
    targetUserId = null,
    targetEmail = null,
    metadata = {},
  }: {
    actorUid: string | null
    actorEmail: string | null
    action: string
    entityType: string
    entityId?: string | null
    targetUserId?: string | null
    targetEmail?: string | null
    metadata?: Record<string, unknown>
  }
) {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    actor_uid: actorUid,
    actor_email: actorEmail,
    action,
    entity_type: entityType,
    entity_id: entityId,
    target_user_id: targetUserId,
    target_email: targetEmail,
    metadata,
  })

  if (error) {
    console.warn('DEBUG delete-coach-user audit log failed:', error.message)
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Server configuration error', requestId }, 500)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header', requestId }, 401)
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized', requestId }, 401)
    }

    if (!hasAdminAccess(token, user)) {
      return jsonResponse({ error: 'Forbidden: admin only', requestId }, 403)
    }

    const { userId, email } = await req.json().catch(() => ({})) as { userId?: string | null, email?: string | null }
    const normalizedEmail = normalizeEmail(email)

    let targetUserId = typeof userId === 'string' && userId.trim() ? userId.trim() : null

    if (!targetUserId && normalizedEmail) {
      let page = 1
      let foundUserId: string | null = null

      while (!foundUserId) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
        if (error) {
          return jsonResponse({ error: error.message, requestId }, 400)
        }

        const users = data?.users ?? []
        const found = users.find((candidate: { email?: string | null, id?: string }) => normalizeEmail(candidate.email) === normalizedEmail)
        if (found?.id) {
          foundUserId = found.id
          break
        }

        if (users.length < 200) break
        page += 1
      }

      targetUserId = foundUserId
    }

    if (!targetUserId) {
      return jsonResponse({ success: true, deleted: false, reason: 'No auth user linked to this coach', requestId }, 200)
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId)
    if (deleteError) {
      return jsonResponse({ error: deleteError.message, requestId, userId: targetUserId }, 400)
    }

    await insertAuditLog(supabaseAdmin, {
      actorUid: user.id,
      actorEmail: user.email ?? null,
      action: 'auth_user.delete',
      entityType: 'auth_user',
      entityId: targetUserId,
      targetUserId,
      targetEmail: normalizedEmail,
      metadata: {
        requestId,
      },
    })

    return jsonResponse({ success: true, deleted: true, userId: targetUserId, requestId }, 200)
  } catch (e) {
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
