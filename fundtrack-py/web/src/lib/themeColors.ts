/** Resolve the active theme's colors from CSS variables so charts stay in sync. */
function cssVar(name: string, fallback: string): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val || fallback
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)
  if (!m) return [52, 211, 153]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

export interface ThemeColors {
  border: string
  muted: string
  fg: string
  card: string
  bg: string
  accent: string
  primary: string
  positive: string
  negative: string
  warn: string
  positiveRgb: [number, number, number]
  negativeRgb: [number, number, number]
  accentRgb: [number, number, number]
}

export function resolveThemeColors(): ThemeColors {
  const positive = cssVar('--positive', '#34d399')
  const negative = cssVar('--negative', '#f87171')
  const accent = cssVar('--accent', '#38bdf8')
  return {
    border: cssVar('--border', '#24303f'),
    muted: cssVar('--muted', '#8b98a9'),
    fg: cssVar('--fg', '#e8edf4'),
    card: cssVar('--card', '#141b26'),
    bg: cssVar('--bg', '#0b0f15'),
    accent,
    primary: cssVar('--primary', '#8b8ff9'),
    positive,
    negative,
    warn: cssVar('--warn', '#fbbf24'),
    positiveRgb: hexToRgb(positive),
    negativeRgb: hexToRgb(negative),
    accentRgb: hexToRgb(accent),
  }
}
