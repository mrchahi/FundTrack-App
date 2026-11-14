/**
 * News / calendar helpers.
 *
 * The backend returns each event with a `ts` (UTC epoch seconds) computed by
 * interpreting the published time as US Eastern and converting to UTC. All the
 * filtering / sorting / countdown logic below relies on that timestamp, and
 * display times are converted to Tehran (Asia/Tehran).
 */
import { faNum } from './format'
import type { NewsEvent } from '../types'

export const TEHRAN_TZ = 'Asia/Tehran'

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TEHRAN_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TEHRAN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** UTC epoch seconds for an event, or null when unparseable. */
export function eventTsSec(e: NewsEvent): number | null {
  const ts = e.ts
  return typeof ts === 'number' && Number.isFinite(ts) ? ts : null
}

/** "HH:MM" in Tehran time (latin digits). */
export function fmtTehranClock(tsSec: number): string {
  try {
    return clockFmt.format(new Date(tsSec * 1000))
  } catch {
    return ''
  }
}

/** "YYYY-MM-DD" Tehran date key (used for grouping). */
export function tehranDateKey(tsSec: number): string {
  try {
    return dateFmt.format(new Date(tsSec * 1000))
  } catch {
    return ''
  }
}

/** Human remaining-time label (Persian digits), no live seconds. */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h >= 24) return `${faNum(Math.floor(h / 24), 0)} روز ${faNum(Math.round((h % 24) + m / 60), 0)} ساعت`
  if (h >= 1) return `${faNum(h, 0)} ساعت`
  return `${faNum(Math.max(1, m), 0)} دقیقه`
}

/** Alarm rings this long before the event time (ms). */
export const ALARM_LEAD = 60 * 1000
/** Countdown is shown only for events within the final half hour (ms). */
export const COUNTDOWN_HORIZON = 30 * 60 * 1000

/** Future (not yet passed) non-holiday events, sorted by time ascending. */
export function upcomingEvents(data: NewsEvent[] | null | undefined, now: number): NewsEvent[] {
  return (data ?? [])
    .filter(e => e.impact !== 'Holiday')
    .map(e => ({ e, ts: eventTsSec(e) }))
    .filter(x => x.ts !== null)
    .filter(x => x.ts! * 1000 > now)
    .sort((a, b) => a.ts! - b.ts!)
    .map(x => x.e)
}
