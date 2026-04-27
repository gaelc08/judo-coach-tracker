/**
 * Supabase Edge Function — sync-competitions
 *
 * Scrapes https://www.judo-moselle.fr/evenement and upserts competitions
 * into the `competitions` table.
 *
 * Authorization: Bearer <admin JWT> or Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *
 * Deployment
 * ----------
 * supabase functions deploy sync-competitions --project-ref <your-project-ref>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_URL = 'https://www.judo-moselle.fr'
const LIST_URL = `${BASE_URL}/evenement`
const DELAY_MS = 50
const MAX_EVENTS = 30

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---- Simple HTML parser helpers ----

function extractText(html: string, selector: string): string {
  // Extract first match of a class-based selector content
  const classMatch = selector.match(/\.([^\s.#]+)$/)
  if (!classMatch) return ''
  const className = classMatch[1]
  const re = new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, 'i')
  const m = html.match(re)
  if (!m) return ''
  return m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#[0-9]+;/g, '').trim()
}

function extractTextByTag(html: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = html.match(re)
  if (!m) return ''
  return m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim()
}

function extractAllText(html: string, className: string): string[] {
  const re = new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:div|p|span)>`, 'gi')
  const results: string[] = []
  let m
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim()
    if (text) results.push(text)
  }
  return results
}

// Extract competition links from the listing page
function extractEventLinks(html: string): Array<{ url: string; externalId: string; niveauCss: string }> {
  const events: Array<{ url: string; externalId: string; niveauCss: string }> = []
  // Match agenda list items — hrefs can be relative (/evenement/...) or absolute (https://www.judo-moselle.fr/evenement/...)
  const itemRe = /<a\s+href="((?:https:\/\/www\.judo-moselle\.fr)?\/evenement\/([^/"]+)\/(\d+))"[^>]*class="agenda__list__item"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = itemRe.exec(html)) !== null) {
    const rawUrl = m[1]
    const externalId = m[3]
    const itemHtml = m[4]
    // Normalize to relative path
    const url = rawUrl.startsWith('http') ? rawUrl.replace('https://www.judo-moselle.fr', '') : rawUrl
    // Extract niveau from class of the date div
    const dateClassRe = /class="agenda__list__item__date\s+(federal|departemental|regional|national|local)"/i
    const dc = itemHtml.match(dateClassRe)
    const niveauCss = dc ? dc[1].toLowerCase() : ''
    events.push({ url, externalId, niveauCss })
  }
  return events
}

// Map CSS class → normalized niveau string
function mapNiveau(css: string, htmlNiveau?: string): string {
  if (htmlNiveau) {
    const n = htmlNiveau.trim().toUpperCase()
    if (['LOCAL', 'DEPARTEMENTAL', 'REGIONAL', 'NATIONAL', 'FEDERAL'].includes(n)) return n
  }
  const map: Record<string, string> = {
    federal: 'FEDERAL',
    national: 'NATIONAL',
    regional: 'REGIONAL',
    departemental: 'DEPARTEMENTAL',
    local: 'LOCAL',
  }
  return map[css] ?? css.toUpperCase()
}

// Parse a detail page HTML into a competition record
function parseDetailPage(
  html: string,
  externalId: string,
  url: string,
  niveauCss: string
): Record<string, unknown> | null {
  try {
    // Date — two observed formats:
    // Format A (departemental): day=03, month=Mai, year=2026 (separate divs)
    // Format B (federal/national): day="01 Mai 2026" (full date in day div)
    const dayRaw = extractText(html, '.agenda__single__date__day') || ''
    const monthRaw = extractText(html, '.agenda__single__date__month') || ''
    const yearRaw = extractText(html, '.agenda__single__date__year') || ''

    let dateStr: string | null = null

    // Try Format B first: "01 Mai 2026" or "01.05.2026" in the day field
    const fullDateMatch = dayRaw.match(/^(\d{1,2})[\.\s](\S+)[\.\s](\d{4})$/)
    if (fullDateMatch) {
      const d = fullDateMatch[1].padStart(2, '0')
      const mNum = parseMonthFr(fullDateMatch[2])
      const y = fullDateMatch[3]
      if (mNum) dateStr = `${y}-${mNum}-${d}`
    }

    // Format A: separate day / month / year divs
    if (!dateStr && dayRaw && monthRaw && yearRaw) {
      const monthNum = parseMonthFr(monthRaw)
      const dayNum = dayRaw.replace(/\D/g, '').padStart(2, '0')
      if (monthNum && dayNum && yearRaw.match(/^\d{4}$/)) {
        dateStr = `${yearRaw}-${monthNum}-${dayNum}`
      }
    }

    // Fallback: look for a date pattern in the page <title> or meta
    if (!dateStr) {
      const metaDate = html.match(/"dateEvent":\s*"(\d{4}-\d{2}-\d{2})"/)
      if (metaDate) dateStr = metaDate[1]
    }

    if (!dateStr) return null

    // Title
    const title = extractTextByTag(html, 'h1')
    if (!title) return null

    // Lieu — parse from the adresses block using text lines
    const adresseBlockRaw = (() => {
      const re = /class="agenda__single__adresses"[^>]*>([\s\S]*?)<\/section>/i
      const mm = html.match(re)
      if (mm) return mm[1]
      // Fallback: grab up to 1000 chars after the class
      const re2 = /class="agenda__single__adresses"[^>]*>([\s\S]{0,1000})/i
      const mm2 = html.match(re2)
      return mm2 ? mm2[1] : ''
    })()
    const adresseLines = adresseBlockRaw
      .replace(/<[^>]+>/g, '\n')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/Date d'ouverture[^\n]*/gi, '')
      .replace(/Date de clôture[^\n]*/gi, '')
      .replace(/Informations/gi, '')
      .replace(/Contact[\s\S]*/i, '')  // stop at Contact section
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 2)
    const lieuNom = adresseLines[0] ?? null
    const lieuAdresse = adresseLines[1] ?? null
    // Try to find CP + ville — look for a line that's mostly digits (CP) and next = ville
    let lieuVille: string | null = null
    for (let i = 0; i < adresseLines.length; i++) {
      if (/^\d{4,5}$/.test(adresseLines[i])) {
        lieuVille = adresseLines[i + 1] ?? null
        break
      }
      // Or combined "54710 LUDRES"
      if (/^\d{4,5}\s+\w/.test(adresseLines[i])) {
        lieuVille = adresseLines[i].replace(/^\d{4,5}\s+/, '')
        break
      }
    }

    // Categories — multiple divs
    const categoriesRaw = extractAllText(html, 'agenda__single__competition__age')
    const categories = categoriesRaw.map((c) => c.toUpperCase()).filter(Boolean)

    // Niveau
    const niveauHtml = extractText(html, '.agenda__single__competition__niveau')
    const niveau = mapNiveau(niveauCss, niveauHtml)

    // Type
    const typeCompetition = extractText(html, '.agenda__single__competition__type') || null

    // Commentaire
    const commentaire = extractText(html, '.agenda__single__commentaire') ||
                        extractText(html, '.agenda__single__infos') || null

    return {
      external_id: externalId,
      title: title.trim(),
      date: dateStr,
      lieu_nom: lieuNom,
      lieu_adresse: lieuAdresse,
      lieu_ville: lieuVille,
      niveau,
      categories: categories.length > 0 ? categories : null,
      type_competition: typeCompetition ? typeCompetition.toUpperCase() : null,
      commentaire,
      url_source: `${BASE_URL}${url}`,
      updated_at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// French month names → zero-padded number string
function parseMonthFr(month: string): string | null {
  const m = month.trim().toLowerCase().replace(/\.$/, '')
  const months: Record<string, string> = {
    janvier: '01', jan: '01', '01': '01',
    février: '02', fev: '02', fevrier: '02', '02': '02',
    mars: '03', '03': '03',
    avril: '04', '04': '04',
    mai: '05', '05': '05',
    juin: '06', '06': '06',
    juillet: '07', jul: '07', '07': '07',
    août: '08', aout: '08', '08': '08',
    septembre: '09', sep: '09', '09': '09',
    octobre: '10', oct: '10', '10': '10',
    novembre: '11', nov: '11', '11': '11',
    décembre: '12', dec: '12', decembre: '12', '12': '12',
  }
  // Also handle numeric "05" etc.
  if (/^\d{1,2}$/.test(m)) return m.padStart(2, '0')
  return months[m] ?? null
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

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Server configuration error (Supabase)', requestId }, 500)
    }

    // Create an admin client (service role — never exposed to the browser)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify the caller is authenticated (admin JWT or service role key)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header', requestId }, 401)
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    // Allow direct service role key (for cron jobs)
    let isAuthorized = token === serviceRoleKey

    if (!isAuthorized) {
      // Verify JWT and check admin claim
      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
      if (userError || !user) {
        return jsonResponse({ error: 'Unauthorized', requestId }, 401)
      }
      isAuthorized = user.app_metadata?.is_admin === true
        || user.app_metadata?.is_admin === 'true'
        || user.role === 'service_role'
    }

    if (!isAuthorized) {
      return jsonResponse({ error: 'Forbidden: admin only', requestId }, 403)
    }

    console.log('DEBUG sync-competitions start:', { requestId })

    // ---- Scrape listing page ----
    const listController = new AbortController()
    const listTimeout = setTimeout(() => listController.abort(), 15000)
    let listRes: Response | undefined
    try {
      listRes = await fetch(LIST_URL, {
        headers: { 'Accept': 'text/html', 'User-Agent': 'JCC-Bot/1.0' },
        signal: listController.signal,
      })
    } finally {
      clearTimeout(listTimeout)
    }
    if (!listRes || !listRes.ok) {
      return jsonResponse({ error: `Listing fetch failed: ${listRes?.status ?? 'aborted'}`, requestId }, 502)
    }
    const listHtml = await listRes.text()
    const allLinks = extractEventLinks(listHtml)

    // Deduplicate by externalId
    const seen = new Set<string>()
    const links = allLinks.filter((l) => {
      if (seen.has(l.externalId)) return false
      seen.add(l.externalId)
      return true
    }).slice(0, MAX_EVENTS)

    console.log('DEBUG sync-competitions links found:', allLinks.length, 'processing:', links.length, { requestId })

    // Fetch already-known external_ids to skip them on re-sync
    const { data: existing } = await supabaseAdmin
      .from('competitions')
      .select('external_id')
    const knownIds = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id))
    const newLinks = links.filter((l) => !knownIds.has(l.externalId))
    console.log('DEBUG sync-competitions new links to fetch:', newLinks.length, { requestId })

    // Cutoff: only process events with date >= today - 7 days
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    let synced = 0
    let errors = 0
    let skipped = 0

    for (const link of newLinks) {
      await sleep(DELAY_MS)
      try {
        const detailController = new AbortController()
        const detailTimeout = setTimeout(() => detailController.abort(), 8000)
        let detailRes: Response | undefined
        try {
          detailRes = await fetch(`${BASE_URL}${link.url}`, {
            headers: { 'Accept': 'text/html', 'User-Agent': 'JCC-Bot/1.0' },
            signal: detailController.signal,
          })
        } finally {
          clearTimeout(detailTimeout)
        }
        if (!detailRes || !detailRes.ok) {
          console.warn(`DEBUG sync-competitions detail fetch failed: ${link.url} ${detailRes?.status ?? 'aborted'}`)
          errors++
          continue
        }
        const detailHtml = await detailRes!.text()
        const competition = parseDetailPage(detailHtml, link.externalId, link.url, link.niveauCss)

        if (!competition) {
          console.warn(`DEBUG sync-competitions parse failed: ${link.url}`)
          errors++
          continue
        }

        // Skip past events
        if ((competition.date as string) < cutoffStr) {
          skipped++
          continue
        }

        const { error: upsertError } = await supabaseAdmin
          .from('competitions')
          .upsert(competition, { onConflict: 'external_id' })

        if (upsertError) {
          console.error(`DEBUG sync-competitions upsert error: ${upsertError.message}`, { url: link.url })
          errors++
          continue
        }

        synced++
      } catch (e) {
        console.error(`DEBUG sync-competitions event error: ${String(e)}`, { url: link.url })
        errors++
      }
    }

    console.log('DEBUG sync-competitions done:', { requestId, synced, errors, skipped })
    return jsonResponse({ synced, errors, skipped, requestId }, 200)

  } catch (e) {
    console.error('DEBUG sync-competitions unexpected error:', { requestId, error: String(e) })
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
