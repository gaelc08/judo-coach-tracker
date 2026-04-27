/**
 * Supabase Edge Function — sync-competitions
 *
 * Scrapes https://www.judo-moselle.fr/evenement (listing page only — single fetch)
 * and upserts competitions into the `competitions` table.
 *
 * No per-event detail fetches — avoids timeout and outbound fetch issues.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_URL = 'https://www.judo-moselle.fr'
const LIST_URL = `${BASE_URL}/evenement`

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Map CSS class → normalized niveau
function mapNiveau(css: string): string {
  const map: Record<string, string> = {
    federal: 'FEDERAL',
    national: 'NATIONAL',
    regional: 'REGIONAL',
    departemental: 'DEPARTEMENTAL',
    local: 'LOCAL',
  }
  return map[css.toLowerCase()] ?? css.toUpperCase()
}

// Parse "01.05" with current year context
function parseDayMonth(raw: string): { day: string; month: string } | null {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{2})$/)
  if (!m) return null
  return { day: m[1].padStart(2, '0'), month: m[2] }
}

function inferYear(month: number, day: number): number {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentDay = now.getDate()
  // If the month.day is before today (by more than 7 days), it's next year
  if (month < currentMonth || (month === currentMonth && day < currentDay - 7)) {
    return currentYear + 1
  }
  return currentYear
}

function extractText(html: string, className: string): string {
  const re = new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)</(?:div|span|a)>`, 'i')
  const m = html.match(re)
  if (!m) return ''
  return m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim()
}

function parseListPage(html: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = []

  // Match all list items
  const itemRe = /<a\s+href="((?:https:\/\/www\.judo-moselle\.fr)?\/evenement\/([^/"]+)\/(\d+))"[^>]*class="agenda__list__item"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null

  while ((m = itemRe.exec(html)) !== null) {
    const rawUrl = m[1]
    const externalId = m[3]
    const itemHtml = m[4]
    const url = rawUrl.startsWith('http') ? rawUrl.replace('https://www.judo-moselle.fr', '') : rawUrl

    // Date
    const dateRaw = extractText(itemHtml, 'agenda__list__item__date__day') ||
                    extractText(itemHtml, 'agenda__list__item__date')
    const parsed = parseDayMonth(dateRaw)
    if (!parsed) continue

    const dayNum = parseInt(parsed.day, 10)
    const monthNum = parseInt(parsed.month, 10)
    const year = inferYear(monthNum, dayNum)
    const dateStr = `${year}-${parsed.month}-${parsed.day}`

    // Title
    const title = extractText(itemHtml, 'agenda__list__item__title')
    if (!title) continue

    // Lieu (often empty in list)
    const lieu = extractText(itemHtml, 'agenda__list__item__lieu') || null

    // Type (COMPETITION, STAGE, PASSAGE DE GRADE...)
    const typeRaw = extractText(itemHtml, 'agenda__list__item__categorie') || null

    // Niveau from CSS class
    const dateClassRe = /class="agenda__list__item__date\s+(federal|departemental|regional|national|local)"/i
    const dc = itemHtml.match(dateClassRe)
    const niveau = dc ? mapNiveau(dc[1]) : 'LOCAL'

    results.push({
      external_id: externalId,
      title: title.trim(),
      date: dateStr,
      lieu_nom: lieu,
      lieu_adresse: null,
      lieu_ville: null,
      niveau,
      categories: null,
      type_competition: typeRaw ? typeRaw.toUpperCase() : null,
      commentaire: null,
      url_source: `${BASE_URL}${url}`,
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

    // Auth: accept admin JWT or service_role JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header', requestId }, 401)
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    // Check JWT role claim (service_role) or user admin claim
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

    // ---- Single fetch of the listing page ----
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    let listRes: Response | undefined
    try {
      listRes = await fetch(LIST_URL, {
        headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (compatible; JCC-Bot/1.0)' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!listRes || !listRes.ok) {
      return jsonResponse({ error: `Fetch failed: ${listRes?.status ?? 'aborted'}`, requestId }, 502)
    }

    const html = await listRes.text()
    console.log('DEBUG html length:', html.length, { requestId })

    const competitions = parseListPage(html)
    console.log('DEBUG parsed competitions:', competitions.length, { requestId })

    if (competitions.length === 0) {
      return jsonResponse({ synced: 0, errors: 0, skipped: 0, note: 'No events parsed from listing page', requestId })
    }

    // Cutoff: only future events (date >= today - 7 days)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const toSync = competitions.filter((c) => (c.date as string) >= cutoffStr)
    const skipped = competitions.length - toSync.length

    if (toSync.length === 0) {
      return jsonResponse({ synced: 0, errors: 0, skipped, requestId })
    }

    // Batch upsert
    const { error: upsertError } = await supabaseAdmin
      .from('competitions')
      .upsert(toSync, { onConflict: 'external_id' })

    if (upsertError) {
      console.error('DEBUG upsert error:', upsertError.message, { requestId })
      return jsonResponse({ synced: 0, errors: toSync.length, skipped, note: upsertError.message, requestId }, 500)
    }

    console.log('DEBUG sync done:', { synced: toSync.length, skipped, requestId })
    return jsonResponse({ synced: toSync.length, errors: 0, skipped, requestId })

  } catch (e) {
    console.error('DEBUG unexpected error:', String(e), { requestId })
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
