// @ts-nocheck
/**
 * Supabase Edge Function — invite-admin
 *
 * Allows an existing admin to invite a new admin by email using the Supabase
 * Admin API. Supabase sends an invitation email so the invited admin can choose
 * a password and log in for the first time.
 *
 * If the user already exists, the function upgrades their `app_metadata` with
 * `is_admin = true`. In that case Supabase may not send a fresh invite email.
 *
 * Request body (JSON):
 *   { "email": "admin@example.com", "redirectTo": "https://..." }
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

function maskEmail(email: string | null | undefined): string | null {
  if (email == null) return null
  const value = String(email).trim()
  if (!value) return null
  const atIndex = value.indexOf('@')
  if (atIndex <= 0) return '[invalid-email]'

  const local = value.slice(0, atIndex)
  const domain = value.slice(atIndex + 1)
  const maskedLocal = local.length <= 2
    ? `${local[0]}${'*'.repeat(Math.max(local.length - 1, 0))}`
    : `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}`

  return `${maskedLocal}@${domain}`
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
    console.warn('DEBUG invite-admin audit log failed:', error.message)
  }
}

async function findUserByEmail(supabaseAdmin: ReturnType<typeof createClient>, email: string) {
  let page = 1

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error

    const users = data?.users ?? []
    const found = users.find((candidate) => normalizeEmail(candidate.email) === email)
    if (found) return found
    if (users.length < 200) return null
    page += 1
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

    const { email, redirectTo } = await req.json().catch(() => ({})) as { email?: string, redirectTo?: string }
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail) {
      return jsonResponse({ error: 'Missing or invalid email', requestId }, 400)
    }

    const siteUrl = redirectTo || Deno.env.get('SITE_URL') || 'https://jccattenom.cantarero.fr/'

    let targetUser = null
    let inviteSent = false
    let alreadyExisted = false

    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { redirectTo: siteUrl }
    )

    if (inviteError) {
      const inviteMessage = String(inviteError.message || '')
      if (/already registered|already been registered|user already/i.test(inviteMessage)) {
        alreadyExisted = true
        targetUser = await findUserByEmail(supabaseAdmin, normalizedEmail)
        if (!targetUser) {
          return jsonResponse({ error: 'Existing user could not be loaded again', requestId }, 400)
        }
      } else {
        return jsonResponse({ error: inviteError.message, requestId }, 400)
      }
    } else {
      inviteSent = true
      targetUser = inviteData?.user || null
    }

    if (!targetUser?.id) {
      targetUser = await findUserByEmail(supabaseAdmin, normalizedEmail)
    }

    if (!targetUser?.id) {
      return jsonResponse({ error: 'Unable to resolve invited user', requestId }, 400)
    }

    const nextAppMetadata = {
      ...(targetUser.app_metadata || {}),
      is_admin: true,
    }

    const { data: updatedUserData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUser.id,
      { app_metadata: nextAppMetadata }
    )

    if (updateError) {
      return jsonResponse({ error: updateError.message, requestId, userId: targetUser.id }, 400)
    }

    console.log('DEBUG invite-admin success:', {
      requestId,
      email: maskEmail(normalizedEmail),
      userId: targetUser.id,
      inviteSent,
      alreadyExisted,
    })

    await insertAuditLog(supabaseAdmin, {
      actorUid: user.id,
      actorEmail: user.email ?? null,
      action: alreadyExisted ? 'invite.admin.promote_existing' : 'invite.admin',
      entityType: 'auth_invitation',
      entityId: targetUser.id,
      targetUserId: targetUser.id,
      targetEmail: normalizedEmail,
      metadata: {
        requestId,
        inviteSent,
        alreadyExisted,
        redirectTo: siteUrl,
      },
    })

    return jsonResponse({
      success: true,
      requestId,
      userId: targetUser.id,
      email: normalizedEmail,
      inviteSent,
      alreadyExisted,
      user: updatedUserData?.user || null,
    }, 200)
  } catch (e) {
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
