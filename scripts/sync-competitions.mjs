/**
 * sync-competitions.mjs
 * Script Node.js — importe les calendriers ICS LGEJ + Moselle dans Supabase.
 * Lancé depuis le VPS (pas bloqué par Google).
 *
 * Usage: node scripts/sync-competitions.mjs [dev|prod]
 */

const SUPABASE_URL = 'https://ajbpzueanpeukozjhkiv.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

const CALENDARS = [
  { id: 'hmfq0ab1euugeagk98t28n748o@group.calendar.google.com', label: 'BENJAMINS', categories: ['BENJAMIN'], niveau: 'REGIONAL' },
  { id: 'v55nn1fbqp288dgl5i33qppq4o@group.calendar.google.com', label: 'MINIMES', categories: ['MINIME'], niveau: 'REGIONAL' },
  { id: 'goj1rtuu5p27slkvbujmmt02uk@group.calendar.google.com', label: 'CADETS', categories: ['CADET'], niveau: 'REGIONAL' },
  { id: '9msgcmrlj1a4u607e8ulnlu4r0@group.calendar.google.com', label: 'JUNIORS', categories: ['JUNIOR'], niveau: 'REGIONAL' },
  { id: 'l2472i6acvvb7qbmekl66edjbo@group.calendar.google.com', label: 'SENIORS', categories: ['SENIOR'], niveau: 'REGIONAL' },
  { id: 'vqcuoh17u8lvufljkulsj83u5g@group.calendar.google.com', label: 'GRADES', categories: [], niveau: 'REGIONAL' },
  { id: '76tp6iij9jpfgm83f0emjeigu8@group.calendar.google.com', label: 'KATA', categories: [], niveau: 'REGIONAL' },
  { id: 'hpnflmcd93p28art374kpp6l20@group.calendar.google.com', label: 'FORMATION', categories: [], niveau: 'REGIONAL' },
  { id: '57judo@gmail.com', label: 'Moselle', categories: [], niveau: 'DEPARTEMENTAL' },
]

function unfold(raw) {
  return raw.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
}

function getProp(block, name) {
  const re = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'm')
  const m = block.match(re)
  if (!m) return ''
  return m[1].replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

function parseDate(raw) {
  const c = raw.trim()
  if (/^\d{8}$/.test(c)) return `${c.slice(0,4)}-${c.slice(4,6)}-${c.slice(6,8)}`
  if (/^\d{8}T\d{6}Z$/.test(c)) {
    const d = new Date(`${c.slice(0,4)}-${c.slice(4,6)}-${c.slice(6,8)}T${c.slice(9,11)}:${c.slice(11,13)}:${c.slice(13,15)}Z`)
    return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  }
  if (/^\d{8}T\d{6}$/.test(c)) return `${c.slice(0,4)}-${c.slice(4,6)}-${c.slice(6,8)}`
  return null
}

function parseLocation(loc) {
  if (!loc) return { lieu_nom: null, lieu_ville: null }
  const parts = loc.split(/\\n|\n|,/).map(p => p.trim()).filter(Boolean)
  const meaningful = parts.filter(p => !/^france$/i.test(p))
  if (meaningful.length === 0) return { lieu_nom: null, lieu_ville: null }
  if (meaningful.length === 1) return { lieu_nom: null, lieu_ville: meaningful[0] }
  const cityPart = meaningful.find(p => /^\d{4,5}\s+\w/.test(p))
  if (cityPart) {
    return { lieu_nom: meaningful.filter(p => p !== cityPart)[0] ?? null, lieu_ville: cityPart.replace(/^\d{4,5}\s+/, '') }
  }
  return { lieu_nom: meaningful[0], lieu_ville: meaningful[meaningful.length - 1] }
}

function inferTypeCompetition(label) {
  const l = label.toUpperCase()
  if (l.includes('GRADES')) return 'PASSAGE DE GRADE'
  if (l.includes('KATA')) return 'KATA'
  if (l.includes('FORMATION')) return 'FORMATION'
  if (l.includes('BENJAMINS') || l.includes('MINIMES') || l.includes('CADETS') || l.includes('JUNIORS') || l.includes('SENIORS')) return 'COMPETITION'
  return null
}

function inferNiveau(title, defaultNiveau) {
  const t = title.toUpperCase()
  if (/CHAMPIONNAT DE FRANCE|GRAND SLAM|OPEN NATIONAL/.test(t)) return 'NATIONAL'
  if (/LGEJ|LIGUE|GRAND EST|REGIONAL/.test(t)) return 'REGIONAL'
  if (/COUPE (DE MOSELLE|57|55|54|67|68)|DEPARTEMENTAL|DEP\./.test(t)) return 'DEPARTEMENTAL'
  return defaultNiveau
}

function parseICS(text, cal, cutoffStr) {
  const unfolded = unfold(text)
  const results = []
  const blocks = unfolded.split(/(?=BEGIN:VEVENT)/)
  for (const block of blocks) {
    if (!block.includes('BEGIN:VEVENT')) continue
    const uid = getProp(block, 'UID')
    if (!uid) continue
    const summary = getProp(block, 'SUMMARY')
    if (!summary) continue
    const dtRaw = getProp(block, 'DTSTART')
    const dateStr = parseDate(dtRaw)
    if (!dateStr || dateStr < cutoffStr) continue
    const location = getProp(block, 'LOCATION')
    const description = getProp(block, 'DESCRIPTION')
    const { lieu_nom, lieu_ville } = parseLocation(location)
    const niveau = inferNiveau(summary, cal.niveau)
    results.push({
      external_id: `${cal.id}::${uid}`,
      title: summary,
      date: dateStr,
      lieu_nom,
      lieu_adresse: null,
      lieu_ville,
      niveau,
      categories: cal.categories.length > 0 ? cal.categories : null,
      type_competition: inferTypeCompetition(cal.label),
      commentaire: description || null,
      url_source: `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(cal.id)}`,
      updated_at: new Date().toISOString(),
    })
  }
  return results
}

async function main() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_SERVICE_KEY env var')
    process.exit(1)
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const allEvents = []
  const seen = new Set()
  let fetchErrors = 0

  for (const cal of CALENDARS) {
    const icsUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(cal.id)}/public/basic.ics`
    try {
      const res = await fetch(icsUrl, { headers: { 'User-Agent': 'JCC-Bot/1.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const events = parseICS(text, cal, cutoffStr)
      console.log(`  ${cal.label}: ${events.length} events`)
      for (const ev of events) {
        if (!seen.has(ev.external_id)) {
          seen.add(ev.external_id)
          allEvents.push(ev)
        }
      }
    } catch (e) {
      console.error(`  ERROR [${cal.label}]: ${e.message}`)
      fetchErrors++
    }
  }

  console.log(`\nTotal: ${allEvents.length} events (${fetchErrors} calendar errors)`)
  if (allEvents.length === 0) {
    console.log('Nothing to upsert.')
    return
  }

  // Upsert via Supabase REST API (upsert endpoint)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/competitions?on_conflict=external_id`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(allEvents),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Upsert error:', res.status, err)
    process.exit(1)
  }

  console.log(`Synced ${allEvents.length} competitions. Done.`)
}

main().catch(e => { console.error(e); process.exit(1) })
