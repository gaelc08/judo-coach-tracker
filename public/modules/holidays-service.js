export function createHolidayService({
  publicFallback,
  schoolFallback,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  logger = console,
} = {}) {
  const fetchFn = fetchImpl || globalThis.fetch?.bind(globalThis);
  if (!fetchFn) {
    throw new Error('fetch is not available in this browser environment');
  }

  const publicHolidaysCache = {};
  const schoolHolidaysCache = {};

  async function fetchPublicHolidays(year) {
    if (publicHolidaysCache[year]) return publicHolidaysCache[year];
    try {
      const res = await fetchFn(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/FR`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const map = {};
      for (const h of data) {
        map[h.date] = h.localName || h.name;
      }
      publicHolidaysCache[year] = map;
      return map;
    } catch (e) {
      logger?.warn?.(`fetchPublicHolidays(${year}) failed, using fallback:`, e?.message || e);
      const fallback = publicFallback[year] || {};
      publicHolidaysCache[year] = fallback;
      return fallback;
    }
  }

  async function fetchSchoolHolidays(year) {
    if (schoolHolidaysCache[year]) return schoolHolidaysCache[year];
    try {
      const startDate = `${year - 1}-09-01`;
      const endDate = `${year + 1}-08-31`;
      const params = new URLSearchParams({
        where: `zones="Zone B" AND start_date<="${endDate}" AND end_date>="${startDate}"`,
        limit: '50',
        timezone: 'Europe/Paris'
      });
      const url = `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?${params}`;
      const res = await fetchFn(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const seen = new Set();
      const holidays = (json.results || []).map((r) => ({
        start: r.start_date ? r.start_date.slice(0, 10) : '',
        end: r.end_date ? r.end_date.slice(0, 10) : '',
        name: r.description || r.population || 'Vacances scolaires'
      })).filter((h) => {
        if (!h.start || !h.end) return false;
        const key = `${h.start}|${h.end}|${h.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => a.start.localeCompare(b.start));
      if (holidays.length === 0) throw new Error('API returned empty holidays, using fallback data');
      schoolHolidaysCache[year] = holidays;
      return holidays;
    } catch (e) {
      logger?.warn?.(`fetchSchoolHolidays(${year}) failed, using fallback:`, e?.message || e);
      const fallback = schoolFallback[year] || schoolFallback[2026] || [];
      schoolHolidaysCache[year] = fallback;
      return fallback;
    }
  }

  return {
    fetchPublicHolidays,
    fetchSchoolHolidays,
  };
}
