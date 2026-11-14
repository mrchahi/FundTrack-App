/** Minimal Jalali (Shamsi) calendar conversion, Gregorian -> Jalali. */

const div = (a: number, b: number) => Math.floor(a / b)

export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy: number
  if (gy > 1600) {
    jy = 979
    gy -= 1600
  } else {
    jy = 0
    gy -= 621
  }
  const gy2 = (gm > 2) ? gy + 1 : gy
  let days = (365 * gy) + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1]
  jy += 33 * div(days, 12053)
  days %= 12053
  jy += 4 * div(days, 1461)
  days %= 1461
  if (days > 365) {
    jy += div(days - 1, 365)
    days = (days - 1) % 365
  }
  let jm: number
  let jd: number
  if (days < 186) {
    jm = 1 + div(days, 31)
    jd = 1 + (days % 31)
  } else {
    jm = 7 + div(days - 186, 30)
    jd = 1 + ((days - 186) % 30)
  }
  return [jy, jm, jd]
}

export const MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

export function jalaliToday(): [number, number] {
  const now = new Date()
  const [jy, jm] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
  return [jy, jm]
}

/** میلادیِ ماه‌ی جلالی (سال/ماه) — ماه میلادی‌ای که روز اولِ همان ماه جلالی در آن است. */
export function gregorianYearMonthOfJalali(jy: number, jm: number): { year: number; month: number } {
  const gy0 = jy + 621
  const start = Date.UTC(gy0 - 1, 0, 1)
  const end = Date.UTC(gy0 + 1, 11, 31)
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    const day = d.getUTCDate()
    const [jy2, jm2] = toJalali(y, m, day)
    if (jy2 === jy && jm2 === jm) {
      return { year: y, month: m }
    }
  }
  return { year: gy0, month: 1 }
}

/** Jalali (jy, jm, jd) → Gregorian date (local). Brute-force scan is fine for a picker. */
export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const start = new Date(jy + 621, 0, 1)
  for (let t = start.getTime(); t < start.getTime() + 370 * 86400000; t += 86400000) {
    const d = new Date(t)
    const [y2, m2, d2] = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
    if (y2 === jy && m2 === jm && d2 === jd) return d
  }
  return start
}

export function jalaliDate(isoOrIsoLocal: string): string {
  const s = isoOrIsoLocal.slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return s
  const [jy, jm, jd] = toJalali(y, m, d)
  return `${jd} ${MONTHS_FA[jm - 1]} ${jy}`
}

/** Jalali date with separators, order day → month → year (RTL). */
export function jalaliDateSep(isoOrIsoLocal: string): string {
  const s = isoOrIsoLocal.slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return s
  const [jy, jm, jd] = toJalali(y, m, d)
  return `${jd} · ${MONTHS_FA[jm - 1]} · ${jy}`
}

export function jalaliDateTime(isoLocal: string): string {
  const date = jalaliDate(isoLocal)
  const t = isoLocal.slice(11, 16)
  return `${date} — ${t}`
}
