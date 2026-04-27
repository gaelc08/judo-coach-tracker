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
const DELAY_MS = 200
const MAX_EVENTS = 100

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
  // Match agenda list items
  const itemRe = /<a\s+href="(\/evenement\/[^"]+\/(\d+))"[^>]*class="agenda__list__item"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = itemRe.exec(html)) !== null) {
    const url = m[1]
    const externalId = m[2]
    const itemHtml = m[3]
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
    // Date
    const day = extractText(html, '.agenda__single__date__day') || ''
    const month = extractText(html, '.agenda__single__date__month') || ''
    const year = extractText(html, '.agenda__single__date__year') || ''

    // Parse date — format varies: day=12, month=05 or "mai", year=2026
    let dateStr: string | null = null
    if (day && month && year) {
      const monthNum = parseMonthFr(month)
      const dayNum = day.replace(/\D/g, '').padStart(2, '0')
      if (monthNum && dayNum && year.match(/^\d{4}$/)) {
        dateStr = `${year}-${monthNum}-${dayNum}`
      }
    }
    if (!dateStr) return null

    // Title
    const title = extractTextByTag(html, 'h1')
    if (!title) return null

    // Lieu
    const adresseBlock = extractText(html, '.agenda__single__adresses')
    // Try to get individual fields
    const lieuNom = extractText(html, '.agenda__single__adresses__nom') ||
                    extractText(html, '.agenda__single__adresses__salle') || null
    const lieuAdresse = extractText(html, '.agenda__single__adresses__adresse') ||
                        extractText(html, '.agenda__single__adresses__rue') || null
    const lieuVille = extractText(html, '.agenda__single__adresses__ville') ||
                      extractText(html, '.agenda__single__adresses__cp') || null

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
      lieu_nom: lieuNom || (adresseBlock ? adresseBlock.split('\n')[0]?.trim() : null) || null,
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
    const listRes = await fetch(LIST_URL, {
      headers: { 'Accept': 'text/html', 'User-Agent': 'JCC-Bot/1.0' },
    })
    if (!listRes.ok) {
      return jsonResponse({ error: `Listing fetch failed: ${listRes.status}`, requestId }, 502)
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

    console.log('DEBUG sync-competitions links found:', links.length, { requestId })

    // Cutoff: only process events with date >= today - 7 days
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    let synced = 0
    let errors = 0
    let skipped = 0

    for (const link of links) {
      await sleep(DELAY_MS)
      try {
        const detailRes = await fetch(`${BASE_URL}${link.url}`, {
          headers: { 'Accept': 'text/html', 'User-Agent': 'JCC-Bot/1.0' },
        })
        if (!detailRes.ok) {
          console.warn(`DEBUG sync-competitions detail fetch failed: ${link.url} ${detailRes.status}`)
          errors++
          continue
        }
        const detailHtml = await detailRes.text()
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
