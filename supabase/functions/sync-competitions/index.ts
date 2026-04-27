/**
 * Supabase Edge Function — sync-competitions
 *
 * Fetches multiple public ICS calendars from Google (LGEJ + Moselle)
 * and upserts competitions into the `competitions` table.
 *
 * Calendars are fetched in parallel, each tagged with age categories.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Calendar sources with associated metadata
const CALENDARS = [
  {
    id: 'hmfq0ab1euugeagk98t28n748o@group.calendar.google.com',
    label: 'SPORTIF LGEJ - BENJAMINS',
    categories: ['BENJAMIN'],
    niveau: 'REGIONAL',
  },
  {
    id: 'v55nn1fbqp288dgl5i33qppq4o@group.calendar.google.com',
    label: 'SPORTIF LGEJ - MINIMES',
    categories: ['MINIME'],
    niveau: 'REGIONAL',
  },
  {
    id: 'goj1rtuu5p27slkvbujmmt02uk@group.calendar.google.com',
    label: 'SPORTIF LGEJ - CADET(TE)S',
    categories: ['CADET'],
    niveau: 'REGIONAL',
  },
  {
    id: '9msgcmrlj1a4u607e8ulnlu4r0@group.calendar.google.com',
    label: 'SPORTIF LGEJ - JUNIORS',
    categories: ['JUNIOR'],
    niveau: 'REGIONAL',
  },
  {
    id: 'l2472i6acvvb7qbmekl66edjbo@group.calendar.google.com',
    label: 'SPORTIF LGEJ - SENIORS',
    categories: ['SENIOR'],
    niveau: 'REGIONAL',
  },
  {
    id: 'vqcuoh17u8lvufljkulsj83u5g@group.calendar.google.com',
    label: 'GRADES LGEJ',
    categories: [],
    niveau: 'REGIONAL',
  },
  {
    id: '76tp6iij9jpfgm83f0emjeigu8@group.calendar.google.com',
    label: 'KATA LGEJ',
    categories: [],
    niveau: 'REGIONAL',
  },
  {
    id: 'hpnflmcd93p28art374kpp6l20@group.calendar.google.com',
    label: 'FORMATION LGEJ',
    categories: [],
    niveau: 'REGIONAL',
  },
  {
    id: '57judo@gmail.com',
    label: 'Moselle Judo',
    categories: [],
    niveau: 'DEPARTEMENTAL',
  },
]

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function unfoldICS(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function getProp(block: string, name: string): string {
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

function parseICSDate(raw: string): string | null {
  const cleaned = raw.trim()
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,8)}`
  }
  if (/^\d{8}T\d{6}Z$/.test(cleaned)) {
    const d = new Date(
      `${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,8)}T${cleaned.slice(9,11)}:${cleaned.slice(11,13)}:${cleaned.slice(13,15)}Z`
    )
    return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  }
  if (/^\d{8}T\d{6}$/.test(cleaned)) {
    return `${cleaned.slice(0,4)}-${cleaned.slice(4,6)}-${cleaned.slice(6,8)}`
  }
  return null
}

function parseLocation(loc: string): { lieu_nom: string | null; lieu_ville: string | null } {
  if (!loc) return { lieu_nom: null, lieu_ville: null }
  const parts = loc.split(/\\n|\n|,/).map((p) => p.trim()).filter(Boolean)
  const meaningful = parts.filter((p) => !/^france$/i.test(p))
  if (meaningful.length === 0) return { lieu_nom: null, lieu_ville: null }
  if (meaningful.length === 1) return { lieu_nom: null, lieu_ville: meaningful[0] }
  const cityPart = meaningful.find((p) => /^\d{4,5}\s+\w/.test(p))
  if (cityPart) {
    const city = cityPart.replace(/^\d{4,5}\s+/, '')
    const nom = meaningful.filter((p) => p !== cityPart)[0] ?? null
    return { lieu_nom: nom, lieu_ville: city }
  }
  return { lieu_nom: meaningful[0], lieu_ville: meaningful[meaningful.length - 1] }
}

// Infer niveau from event title if not set by calendar
function inferNiveau(title: string, defaultNiveau: string): string {
  const t = title.toUpperCase()
  if (/CHAMPIONNAT DE FRANCE|GRAND SLAM|OPEN NATIONAL|NATIONAL/.test(t)) return 'NATIONAL'
  if (/CHAMPIONNAT (DU GRAND EST|LGEJ|LIGUE|REGIONAL)|LGEJ/.test(t)) return 'REGIONAL'
  if (/COUPE (DE MOSELLE|DU (BAS|HAUT)|57|55|54|67|68)|DEP(ARTEMENTAL)?/.test(t)) return 'DEPARTEMENTAL'
  return defaultNiveau
}

function parseICS(
  icalText: string,
  calMeta: typeof CALENDARS[0],
  cutoffStr: string
): Array<Record<string, unknown>> {
  const unfolded = unfoldICS(icalText)
  const results: Array<Record<string, unknown>> = []
  const blocks = unfolded.split(/(?=BEGIN:VEVENT)/)

  for (const block of blocks) {
    if (!block.includes('BEGIN:VEVENT')) continue
    const uid = getProp(block, 'UID')
    if (!uid) continue
    const summary = getProp(block, 'SUMMARY')
    if (!summary) continue
    const dtRaw = getProp(block, 'DTSTART')
    const dateStr = parseICSDate(dtRaw)
    if (!dateStr || dateStr < cutoffStr) continue

    const location = getProp(block, 'LOCATION')
    const description = getProp(block, 'DESCRIPTION')
    const { lieu_nom, lieu_ville } = parseLocation(location)
    const niveau = inferNiveau(summary, calMeta.niveau)

    results.push({
      external_id: `${calMeta.id}::${uid}`,
      title: summary,
      date: dateStr,
      lieu_nom,
      lieu_adresse: null,
      lieu_ville,
      niveau,
      categories: calMeta.categories.length > 0 ? calMeta.categories : null,
      type_competition: null,
      commentaire: description || null,
      url_source: `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calMeta.id)}`,
      updated_at: new Date().toISOString(),
    })
  }
  return results
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

    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header', requestId }, 401)
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
    if (!isAuthorized) return jsonResponse({ error: 'Forbidden: admin only', requestId }, 403)

    // Cutoff: events from last 7 days onwards
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    // Fetch all calendars in parallel
    const results = await Promise.allSettled(
      CALENDARS.map(async (cal) => {
        const icsUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(cal.id)}/public/basic.ics`
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        try {
          const res = await fetch(icsUrl, {
            headers: { 'User-Agent': 'JCC-Bot/1.0' },
            signal: controller.signal,
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const text = await res.text()
          return parseICS(text, cal, cutoffStr)
        } finally {
          clearTimeout(timeout)
        }
      })
    )

    // Merge all events, deduplicate by external_id
    const allEvents: Array<Record<string, unknown>> = []
    const seen = new Set<string>()
    let fetchErrors = 0

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const ev of result.value) {
          const eid = ev.external_id as string
          if (!seen.has(eid)) {
            seen.add(eid)
            allEvents.push(ev)
          }
        }
      } else {
        fetchErrors++
        console.error('Calendar fetch error:', result.reason, { requestId })
      }
    }

    console.log(`DEBUG sync: ${allEvents.length} events from ${CALENDARS.length - fetchErrors} calendars`, { requestId })

    if (allEvents.length === 0) {
      return jsonResponse({ synced: 0, errors: fetchErrors, skipped: 0, note: 'No future events', requestId })
    }

    // Batch upsert
    const { error: upsertError } = await supabaseAdmin
      .from('competitions')
      .upsert(allEvents, { onConflict: 'external_id' })

    if (upsertError) {
      console.error('Upsert error:', upsertError.message, { requestId })
      return jsonResponse({ synced: 0, errors: allEvents.length + fetchErrors, skipped: 0, note: upsertError.message, requestId }, 500)
    }

    return jsonResponse({ synced: allEvents.length, errors: fetchErrors, skipped: 0, calendars: CALENDARS.length, requestId })

  } catch (e) {
    console.error('Unexpected error:', String(e), { requestId })
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
