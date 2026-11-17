import { EconomicEvent } from '../types';

export interface EconomicNewsFetchOptions {
  force?: boolean;
  currencyFilter?: string;
  impactFilter?: 'all' | 'high' | 'high_medium';
}

export interface EconomicNewsFetchResult {
  ok: boolean;
  source: 'faireconomy' | 'cache' | 'gemini-search' | 'direct-browser' | 'error';
  updatedAt: string;
  events: EconomicEvent[];
  error?: string;
}

interface RawFairEconomyEvent {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  actual?: string;
  previous?: string;
}

function normalizeImpact(raw?: string): EconomicEvent['impact'] {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  return 'low';
}

export function normalizeRawEconomicItems(
  items: RawFairEconomyEvent[],
  currencyFilter?: string,
  impactFilter: 'all' | 'high' | 'high_medium' = 'all'
): EconomicEvent[] {
  const allowedCurrencies =
    currencyFilter && currencyFilter !== 'ALL'
      ? new Set(
          currencyFilter
            .split(',')
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean)
        )
      : null;

  const events: EconomicEvent[] = [];
  for (const item of items) {
    const title = String(item.title || '').trim();
    const currency = String(item.country || '').trim().toUpperCase();
    const dateStr = String(item.date || '').trim();
    if (!title || !currency || !dateStr) continue;

    const dt = new Date(dateStr);
    if (Number.isNaN(dt.getTime())) continue;

    if (allowedCurrencies && !allowedCurrencies.has(currency)) continue;

    const impact = normalizeImpact(item.impact);
    if (impactFilter === 'high' && impact !== 'high') continue;
    if (impactFilter === 'high_medium' && impact === 'low') continue;

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 36);
    const id = `ff_${currency}_${dt.getTime()}_${slug}`;

    events.push({
      id,
      title,
      currency,
      impact,
      timestamp: dt.toISOString(),
      forecast: String(item.forecast || '').trim() || '—',
      actual: String(item.actual || '').trim() || '—',
      previous: String(item.previous || '').trim() || '—',
      alarmEnabled: false,
      alarmTriggered: false,
    });
  }

  return events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export async function fetchFreeEconomicCalendar(
  opts?: EconomicNewsFetchOptions
): Promise<EconomicNewsFetchResult> {
  const params = new URLSearchParams();
  if (opts?.force) params.set('force', 'true');
  if (opts?.currencyFilter && opts.currencyFilter !== 'ALL') {
    params.set('currency', opts.currencyFilter);
  }
  if (opts?.impactFilter && opts.impactFilter !== 'all') {
    params.set('impact', opts.impactFilter);
  }

  const queryStr = params.toString();
  const isLocalFile =
    typeof window !== 'undefined' && window.location.protocol === 'file:';

  if (!isLocalFile) {
    try {
      const res = await fetch(
        `/api/economic-calendar${queryStr ? `?${queryStr}` : ''}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          source?: 'faireconomy' | 'cache' | 'gemini-search';
          updatedAt?: string;
          events?: EconomicEvent[];
          error?: string;
        };
        if (data.ok && Array.isArray(data.events)) {
          return {
            ok: true,
            source: data.source || 'faireconomy',
            updatedAt: data.updatedAt || new Date().toISOString(),
            events: data.events,
          };
        }
        if (data.error) {
          // Fall through to direct browser fallback
        }
      }
    } catch {
      // Fallback directly below
    }
  }

  // Fallback for standalone file:// mode or proxy outage
  try {
    const directRes = await fetch(
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
    );
    if (directRes.ok) {
      const raw = (await directRes.json()) as RawFairEconomyEvent[];
      const events = normalizeRawEconomicItems(
        Array.isArray(raw) ? raw : [],
        opts?.currencyFilter,
        opts?.impactFilter ?? 'all'
      );
      return {
        ok: true,
        source: 'direct-browser',
        updatedAt: new Date().toISOString(),
        events,
      };
    }
  } catch (err) {
    return {
      ok: false,
      source: 'error',
      updatedAt: new Date().toISOString(),
      events: [],
      error: (err as Error).message || 'Could not reach free economic calendar feed',
    };
  }

  return {
    ok: false,
    source: 'error',
    updatedAt: new Date().toISOString(),
    events: [],
    error: 'Free economic calendar feed returned no data',
  };
}

export function mergeEconomicEvents(
  existing: EconomicEvent[],
  incoming: EconomicEvent[]
): { merged: EconomicEvent[]; addedCount: number; updatedCount: number } {
  const byKey = new Map<string, EconomicEvent>();
  const makeKey = (ev: EconomicEvent) =>
    `${ev.currency.toUpperCase()}|${new Date(ev.timestamp).getTime()}|${ev.title.trim().toLowerCase()}`;

  for (const ev of existing) {
    byKey.set(makeKey(ev), ev);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const inc of incoming) {
    const k = makeKey(inc);
    const prev = byKey.get(k);
    if (prev) {
      byKey.set(k, {
        ...prev,
        impact: inc.impact,
        forecast: inc.forecast !== '—' ? inc.forecast : prev.forecast,
        actual: inc.actual !== '—' ? inc.actual : prev.actual,
        previous: inc.previous !== '—' ? inc.previous : prev.previous,
      });
      updatedCount += 1;
    } else {
      byKey.set(k, inc);
      addedCount += 1;
    }
  }

  const merged = Array.from(byKey.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return { merged, addedCount, updatedCount };
}
