import type { Account, Settings } from '../types'

export const faNum = (n: number, digits = 2): string =>
  n.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export const enNum = (n: number, digits = 2): string =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits })

export function fmtUSD(n: number, digits = 2): string {
  const sign = n < 0 ? '−' : ''
  return `${sign}$${enNum(Math.abs(n), digits)}`
}

/** Returns [primaryLabel, secondaryLabel?] based on base currency and show_toman. */
export function fmtMoney(
  n: number,
  settings: { show_toman?: boolean; base_currency?: string },
  account?: Account,
): [string, string?] {
  const rate = account?.usd_toman ?? 0
  const usd = fmtUSD(n)
  const tom = `${faNum(n * rate, 0)} تومان`
  const base = settings.base_currency ?? 'USD'
  const sec = !!(settings.show_toman && rate > 0 && account)
  if (base === 'IRT' && rate > 0) {
    return sec ? [tom, usd] : [tom, undefined]
  }
  return sec ? [usd, tom] : [usd, undefined]
}

/** Number of seconds -> compact human duration (fa). */
export function fmtDuration(min: number): string {
  if (min < 60) return `${faNum(min, 0)} دقیقه`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h < 24) return m ? `${faNum(h)} ساعت و ${faNum(m)} دقیقه` : `${faNum(h)} ساعت`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh ? `${faNum(d)} روز و ${faNum(rh)} ساعت` : `${faNum(d)} روز`
}

export function pct(n: number): string {
  return `${faNum(n, 1)}٪`
}
