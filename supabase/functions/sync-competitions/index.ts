/**
 * Supabase Edge Function — sync-competitions
 *
 * Fetches the public ICS calendar from Google (57judo@gmail.com)
 * and upserts competitions into the `competitions` table.
 *
 * Single ICS fetch — no per-event requests, no scraping issues.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ICS_URL = 'https://calendar.google.com/calendar/ical/57judo%40gmail.com/public/basic.ics'

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Unfold ICS lines (continuation lines start with space/tab)
function unfoldICS(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

// Get a property value from a VEVENT block
function getProp(block: string, name: string): string {
  // Handles NAME:value and NAME;PARAM=...:value
  const re = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'm')
  const m = block.match(re)
  if (!m) return ''
  return m[1]
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

// Parse ICS DATE or DATETIME to a YYYY-MM-DD string (Paris timezone aware)
function parseICSDate(raw: string): string | null {
  const cleaned = raw.trim()
  // DATE-only: 20260501
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,8)}`
  }
  // DATETIME UTC: 20260501T090000Z
  if (/^\d{8}T\d{6}Z$/.test(cleaned)) {
    const d = new Date(
      `${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,8)}T${cleaned.slice(9,11)}:${cleaned.slice(11,13)}:${cleaned.slice(13,15)}Z`
    )
    // Convert to Paris date
    const paris = d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
    return paris  // returns YYYY-MM-DD
  }
  // DATETIME local (no Z): 20260501T090000
  if (/^\d{8}T\d{6}$/.test(cleaned)) {
    return `${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,8)}`
  }
  return null
}

// Parse location into nom + ville
function parseLocation(loc: string): { lieu_nom: string | null; lieu_ville: string | null } {
  if (!loc) return { lieu_nom: null, lieu_ville: null }
  const parts = loc.split(/\\n|\n|,/).map((p) => p.trim()).filter(Boolean)
  // Last part often "France" — ignore it
  const meaningful = parts.filter((p) => !/^france$/i.test(p))
  if (meaningful.length === 0) return { lieu_nom: null, lieu_ville: null }
  if (meaningful.length === 1) return { lieu_nom: null, lieu_ville: meaningful[0] }
  // Try to find a part that looks like "XXXXX CityName" (postal code + city)
  const cityPart = meaningful.find((p) => /^\d{4,5}\s+\w/.test(p))
  if (cityPart) {
    const city = cityPart.replace(/^\d{4,5}\s+/, '')
    const nom = meaningful.filter((p) => p !== cityPart)[0] ?? null
    return { lieu_nom: nom, lieu_ville: city }
  }
  return { lieu_nom: meaningful[0], lieu_ville: meaningful[meaningful.length - 1] }
}

function parseICS(icalText: string): Array<Record<string, unknown>> {
  const unfolded = unfoldICS(icalText)
  const events: Array<Record<string, unknown>> = []

  const eventBlocks = unfolded.split(/(?=BEGIN:VEVENT)/)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  for (const block of eventBlocks) {
    if (!block.includes('BEGIN:VEVENT')) continue

    const uid = getProp(block, 'UID')
    if (!uid) continue

    const summary = getProp(block, 'SUMMARY')
    if (!summary) continue

    // Get DTSTART value (may have params: DTSTART;TZID=...:value)
    const dtRaw = getProp(block, 'DTSTART')
    const dateStr = parseICSDate(dtRaw)
    if (!dateStr || dateStr < cutoffStr) continue

    const location = getProp(block, 'LOCATION')
    const description = getProp(block, 'DESCRIPTION')
    const { lieu_nom, lieu_ville } = parseLocation(location)

    // Use UID as external_id (stable across syncs)
    events.push({
      external_id: uid,
      title: summary,
      date: dateStr,
      lieu_nom,
      lieu_adresse: null,
      lieu_ville,
      niveau: null,
      categories: null,
      type_competition: null,
      commentaire: description || null,
      url_source: 'https://calendar.google.com/calendar/embed?src=57judo@gmail.com',
      updated_at: new Date().toISOString(),
    })
  }

  return events
}

// ---- Main handler ----

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', requestId }, 405)
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

    // Auth: accept admin JWT or service_role JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header', requestId }, 401)
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    let isAuthorized = false
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload?.role === 'service_role') isAuthorized = true
    } catch { /* ignore */ }

    if (!isAuthorized) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      isAuthorized = !!(user?.app_metadata?.is_admin === true || user?.app_metadata?.is_admin === 'true')
    }

    if (!isAuthorized) {
      return jsonResponse({ error: 'Forbidden: admin only', requestId }, 403)
    }

    // ---- Fetch ICS ----
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    let icsRes: Response | undefined
    try {
      icsRes = await fetch(ICS_URL, {
        headers: { 'User-Agent': 'JCC-Bot/1.0' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!icsRes || !icsRes.ok) {
      return jsonResponse({ error: `ICS fetch failed: ${icsRes?.status ?? 'aborted'}`, requestId }, 502)
    }

    const icsText = await icsRes.text()
    console.log('DEBUG ics length:', icsText.length, { requestId })

    const competitions = parseICS(icsText)
    console.log('DEBUG parsed competitions:', competitions.length, { requestId })

    if (competitions.length === 0) {
      return jsonResponse({ synced: 0, errors: 0, skipped: 0, note: 'No future events in ICS', requestId })
    }

    // Batch upsert
    const { error: upsertError } = await supabaseAdmin
      .from('competitions')
      .upsert(competitions, { onConflict: 'external_id' })

    if (upsertError) {
      console.error('DEBUG upsert error:', upsertError.message, { requestId })
      return jsonResponse({ synced: 0, errors: competitions.length, skipped: 0, note: upsertError.message, requestId }, 500)
    }

    // Clear old entries from the judo-moselle.fr scraping (different external_id format)
    // (optional — just leave them, they'll be filtered by date anyway)

    console.log('DEBUG sync done:', { synced: competitions.length, requestId })
    return jsonResponse({ synced: competitions.length, errors: 0, skipped: 0, requestId })

  } catch (e) {
    console.error('DEBUG unexpected error:', String(e), { requestId })
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
