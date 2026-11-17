// Accurate Gregorian <-> Jalali (Persian) calendar conversion utilities

const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

const PERSIAN_WEEKDAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
  'شنبه',
];

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - div(a, b) * b;
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;

  for (let i = 1; i < breaks.length; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ += 1;
  }
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) {
    n = n - jump + div(jump + 4, 33) * 33;
  }
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm: number;
  let jd: number;
  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

export function getJalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export function toJalali(dateInput: Date | string): { jy: number; jm: number; jd: number } {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return d2j(g2d(now.getFullYear(), now.getMonth() + 1, now.getDate()));
  }
  return d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
}

export function toGregorian(jy: number, jm: number, jd: number): Date {
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  return new Date(gy, gm - 1, gd);
}

export function getJalaliMonthName(jm: number): string {
  return PERSIAN_MONTHS[jm - 1] ?? '';
}

export function getJalaliWeekdayIndex(jy: number, jm: number, jd: number): number {
  // Saturday = 0, Sunday = 1, ..., Friday = 6
  const gDate = toGregorian(jy, jm, jd);
  return (gDate.getDay() + 1) % 7;
}

export function getJalaliWeekdayName(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return PERSIAN_WEEKDAYS[d.getDay()] ?? '';
}

export function formatJalaliDate(dateInput: Date | string, lang: 'fa' | 'en' = 'fa'): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return '—';
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  const { jy, jm, jd } = toJalali(d);
  return `${jd} ${getJalaliMonthName(jm)} ${jy}`;
}

export function formatJalaliShort(dateInput: Date | string): string {
  const { jy, jm, jd } = toJalali(dateInput);
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function formatJalaliDateTime(dateInput: Date | string, lang: 'fa' | 'en' = 'fa'): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return '—';
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (lang === 'en') {
    return `${formatJalaliDate(d, 'en')} · ${timeStr}`;
  }
  return `${formatJalaliDate(d, 'fa')} · ${timeStr}`;
}

export function getCurrentJalaliMonthKey(dateInput: Date | string = new Date()): string {
  const { jy, jm } = toJalali(dateInput);
  return `${jy}-${String(jm).padStart(2, '0')}`;
}

export function toLocalIsoDate(dateInput: Date | string = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function jalaliToIsoDate(jy: number, jm: number, jd: number): string {
  return toLocalIsoDate(toGregorian(jy, jm, jd));
}

export function getJalaliMonthBounds(dateInput: Date | string = new Date()): {
  jy: number;
  jm: number;
  jd: number;
  monthLength: number;
  start: Date;
  end: Date;
} {
  const { jy, jm, jd } = toJalali(dateInput);
  const monthLength = getJalaliMonthLength(jy, jm);
  const start = toGregorian(jy, jm, 1);
  start.setHours(0, 0, 0, 0);
  const end = toGregorian(jy, jm, monthLength);
  end.setHours(23, 59, 59, 999);
  return { jy, jm, jd, monthLength, start, end };
}

export function addJalaliMonths(
  dateInput: Date | string,
  monthsToAdd: number,
  fixedDay?: number
): Date {
  const { jy, jm, jd } = toJalali(dateInput);
  const totalMonths = jy * 12 + (jm - 1) + monthsToAdd;
  const targetJy = Math.floor(totalMonths / 12);
  const targetJm = (totalMonths % 12) + 1;
  const maxDay = getJalaliMonthLength(targetJy, targetJm);
  const targetJd = Math.min(maxDay, Math.max(1, fixedDay ?? jd));
  return toGregorian(targetJy, targetJm, targetJd);
}

export function getNextJalaliDayOccurrence(
  dayOfMonth: number,
  refDate: Date = new Date()
): Date {
  const { jy, jm, jd } = toJalali(refDate);
  const safeCurrentMax = getJalaliMonthLength(jy, jm);
  const targetCurrentDay = Math.min(safeCurrentMax, Math.max(1, dayOfMonth));
  if (targetCurrentDay >= jd) {
    return toGregorian(jy, jm, targetCurrentDay);
  }
  return addJalaliMonths(refDate, 1, dayOfMonth);
}

