import React, { useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import type { CurveItem, Heatmap, PeriodItem } from '../types'
import { faNum } from '../lib/format'
import { resolveThemeColors, type ThemeColors } from '../lib/themeColors'
import { toJalali, MONTHS_FA, jalaliDate } from '../lib/jalali'
import { Card, CardContent, CardHeader, CardTitle } from './ui'

function tipStyle(C: ThemeColors) {
  return {
    background: `color-mix(in srgb, ${C.bg} 92%, transparent)`,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    fontSize: 12,
    color: C.fg,
    padding: '6px 10px',
    direction: 'rtl' as const,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  }
}

type TipPayload = { name?: string; value?: number | string; color?: string; fill?: string }

/** Round a numeric axis tick to at most 2 decimals, dropping trailing zeros. */
function fmtTick(v: number): string {
  const r = Math.round(v * 100) / 100
  return faNum(r, r % 1 === 0 ? 0 : 2)
}

/** Themed tooltip content — matches the active theme (no default black text). */
function ChartTip({ active, payload, label }: {
  active?: boolean
  payload?: TipPayload[]
  label?: string | number
}) {
  const C = resolveThemeColors()
  if (!active || !payload?.length) return null
  return (
    <div style={tipStyle(C)}>
      {label != null && <div className="mb-1 font-semibold" style={{ color: C.fg }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 whitespace-nowrap">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: p.color || p.fill || C.accent }} />
          <span style={{ color: C.fg }}>
            {p.name}: <b>{faNum(Number(p.value) || 0)}</b>
          </span>
        </div>
      ))}
    </div>
  )
}

/* ---------- Equity / cumulative PnL curve ---------- */

export function EquityChart({ curve, balance }: { curve: CurveItem[]; balance?: { t: number; value: number }[] }) {
  const C = resolveThemeColors()
  const [mode, setMode] = useState<'pnl' | 'balance'>('pnl')
  const useBalance = !!(balance && balance.length > 0)

  const pnlData = curve.map((c, i) => ({ i, cum: c.cum }))
  const balData = (balance ?? []).map((b, i) => ({ i, bal: b.value }))
  const data = mode === 'balance' ? balData : pnlData
  const dataKey = mode === 'balance' ? 'bal' : 'cum'
  const title = mode === 'balance' ? 'منحنی بالانس' : 'منحنی سود تجمعی'

  const vals = mode === 'balance' ? balData.map(d => d.bal) : pnlData.map(d => d.cum)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo) * 0.1 || 1
  const domain: [number, number] = [lo - pad, hi + pad]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-4">
        <CardTitle className="text-sm">{title}</CardTitle>
        {useBalance && (
          <div className="flex items-center gap-1 rounded-lg bg-surface p-0.5 text-xs">
            <button
              onClick={() => setMode('pnl')}
              className={`rounded-md px-2.5 py-1 transition-all ${mode === 'pnl' ? 'bg-accent/20 text-foreground border border-accent/40' : 'text-muted hover:text-foreground border border-transparent'}`}
            >
              سود
            </button>
            <button
              onClick={() => setMode('balance')}
              className={`rounded-md px-2.5 py-1 transition-all ${mode === 'balance' ? 'bg-accent/20 text-foreground border border-accent/40' : 'text-muted hover:text-foreground border border-transparent'}`}
            >
              بالانس
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted">داده‌ای در این بازه نیست</div>
        ) : (
          <div dir="ltr" className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="gCum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.accent} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={C.accent} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="i" hide axisLine={false} tickLine={false} />
                <YAxis domain={domain} axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} width={48} tickFormatter={fmtTick} />
                <Tooltip
                  cursor={false}
                  content={<ChartTip />}
                  formatter={(v: number | string) => [fmtTick(Number(v)), title]}
                />
                <Area type="natural" dataKey={dataKey} stroke={C.accent} strokeWidth={2.6} fill="url(#gCum)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- Net PnL per period (horizontal bars with labels) ---------- */

export function PeriodBars({ items }: { items: PeriodItem[] }) {
  const C = resolveThemeColors()
  const data = items.map(it => ({ label: it.label, net: Math.round(it.net * 100) / 100 }))
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 8 }}>
          <YAxis dataKey="label" type="category" hide />
          <XAxis dataKey="net" type="number" hide />
          <Tooltip
            cursor={false}
            content={<ChartTip />}
            formatter={(v: number | string) => [fmtTick(Number(v)), 'سود خالص']}
          />
          <Bar dataKey="net" radius={4} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.net >= 0 ? C.positive : C.negative} fillOpacity={0.9} />
            ))}
            <LabelList dataKey="label" position="insideLeft" offset={8} style={{ fill: C.bg, fontSize: 12, fontWeight: 600 }} />
            <LabelList dataKey="net" position="right" offset={8} style={{ fill: C.muted, fontSize: 12 }} formatter={(v: number) => faNum(v)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------- Period performance as a calendar (per-day 1×1 cards) ---------- */

const _pad2 = (n: number) => String(n).padStart(2, '0')

function fmtCellNet(net: number): string {
  if (!net) return ''
  const sign = net > 0 ? '+' : '−'
  const v = Math.abs(net)
  if (v >= 1000) return `${sign}${faNum(v / 1000, 1)}k`
  return `${sign}${faNum(v, 1)}`
}

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

// trading week: Monday..Friday (Saturday/Sunday are market holidays)
const TRADE_WEEKDAYS = ['د', 'س', 'چ', 'پ', 'ج']

// responsive square grid: as many 1×1 cards as fit the parent width, then wrap
const CAL_GRID = { gridTemplateColumns: 'repeat(auto-fill, minmax(3rem, 1fr))' }

// JS getUTCDay() (0=Sun..6=Sat) -> Monday-based index (0=Mon..6=Sun)
const monIdx = (yy: number, mm: number, dd: number) => (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7

export function PeriodCalendar({ items, range = 'all' }: { items: PeriodItem[]; range?: string }) {
  const C = resolveThemeColors()

  const daily = items.filter(i => /^\d{4}-\d{2}-\d{2}$/.test(i.period))
  const byDay = new Map<string, PeriodItem>()
  for (const it of daily) byDay.set(it.period, it)
  const latestKey = daily.map(i => i.period).sort().pop()

  const pos = C.positiveRgb
  const neg = C.negativeRgb
  const tint = (net: number) => {
    const rgb = net >= 0 ? pos : neg
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.18)`
  }
  const cellBorder = (net: number) => {
    const rgb = net >= 0 ? pos : neg
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.6)`
  }

  const renderCell = (key: string, dayLabel: string, wd?: string) => {
    const it = byDay.get(key)
    const net = it ? Math.round(it.net * 100) / 100 : 0
    const has = !!(it && it.trades > 0)
    return (
      <div
        key={key}
        title={has ? `${jalaliDate(key)} — ${faNum(net)} · ${it!.trades} معامله` : jalaliDate(key)}
        className="flex aspect-square w-full flex-col items-center justify-center rounded-xl border px-0.5 py-1"
        style={{
          background: has ? tint(net) : 'transparent',
          borderColor: has ? cellBorder(net) : C.border,
        }}
      >
        {wd && <span className="mb-0.5 text-[9px] font-medium text-muted">{wd}</span>}
        <span className="text-sm font-bold leading-none" style={{ color: C.fg }}>{dayLabel}</span>
        {has && (
          <span className="mt-0.5 text-[9px] font-bold leading-none" style={{ color: net >= 0 ? C.positive : C.negative }}>
            {fmtCellNet(net)}
          </span>
        )}
      </div>
    )
  }

  // week view: exactly the 7 days of the latest trading week, large cards
  if (range === 'week' && latestKey) {
    const [y, m, d] = latestKey.split('-').map(Number)
    const base = new Date(Date.UTC(y, m - 1, d))
    const monOff = (base.getUTCDay() + 6) % 7
    const monday = new Date(Date.UTC(y, m - 1, d - monOff))
    const days = Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(monday.getTime() + i * 86400000)
      const yy = dt.getUTCFullYear()
      const mm = dt.getUTCMonth() + 1
      const dd = dt.getUTCDate()
      const mi = monIdx(yy, mm, dd)
      if (mi >= 5) return null // skip Saturday/Sunday
      return { key: `${yy}-${_pad2(mm)}-${_pad2(dd)}`, wd: TRADE_WEEKDAYS[mi] }
    }).filter(Boolean) as { key: string; wd: string }[]
    const [jy1, jm1, jd1] = toJalali(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate())
    const [jy2, jm2, jd2] = toJalali(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate() + 6)
    return (
      <div>
        <div className="mb-3 text-xs font-semibold text-muted">
          هفته {jd1} {MONTHS_FA[jm1 - 1]} — {jd2} {MONTHS_FA[jm2 - 1]} · {jy1}
        </div>
        <div className="grid gap-2" style={CAL_GRID}>
          {days
            .filter(day => { const it = byDay.get(day.key); return it && it.trades > 0 })
            .map(day => renderCell(day.key, faNum(+day.key.slice(8), 0), day.wd))}
        </div>
      </div>
    )
  }

  // month view anchored to the latest trading month
  const [year, month] = latestKey
    ? (() => { const [yy, mm] = latestKey.split('-').map(Number); return [yy, mm] })()
    : (() => { const now = new Date(); return [now.getFullYear(), now.getMonth() + 1] })()

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const [jy, jm] = toJalali(year, month, Math.min(15, daysInMonth))
  const monthLabel = `${MONTHS_FA[jm - 1]} ${jy}`

  const tradingDays: { key: string; wd: string; col: number }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const mi = monIdx(year, month, d)
    if (mi >= 5) continue // skip Saturday/Sunday
    tradingDays.push({ key: `${year}-${_pad2(month)}-${_pad2(d)}`, wd: TRADE_WEEKDAYS[mi], col: mi })
  }

  const cells: React.ReactNode[] = []
  const lead = tradingDays.length ? tradingDays[0].col : 0
  for (let i = 0; i < lead; i++) cells.push(<div key={`b${i}`} className="aspect-square w-full" />)
  for (const td of tradingDays) {
    const it = byDay.get(td.key)
    if (!it || it.trades <= 0) continue
    cells.push(renderCell(td.key, faNum(+td.key.slice(8), 0), td.wd))
  }

  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-muted">{monthLabel}</div>
      {cells.length === 0 ? (
        <div className="text-xs text-muted">در این ماه معامله‌ای ثبت نشده</div>
      ) : (
        <div className="grid gap-2" style={CAL_GRID}>
          {cells}
        </div>
      )}
    </div>
  )
}

/* ---------- Vertical bar distribution (hour/weekday/...) ---------- */

export function DistributionBars({ items }: { items: { label: string; net: number; trades: number }[] }) {
  const C = resolveThemeColors()
  const data = items.map(it => ({ label: it.label, net: Math.round(it.net * 100) / 100, trades: it.trades }))
  const maxAbs = Math.max(1, ...data.map(d => Math.abs(d.net)))
  return (
    <div dir="ltr" className="h-64 w-full px-2 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: C.muted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={10}
          />
          <YAxis
            domain={[-maxAbs * 1.15, maxAbs * 1.15]}
            tick={{ fill: C.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={46}
            tickFormatter={fmtTick}
          />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(128,128,128,0.08)' }} />
          <Bar dataKey="net" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.net >= 0 ? C.positive : C.negative} fillOpacity={0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------- Heatmap (weekday × hour) ---------- */

export function HeatmapGrid({ hm, currencyLabel }: { hm: Heatmap; currencyLabel?: string }) {
  const C = resolveThemeColors()
  const { weekdays, cells } = hm
  const maxAbs = Math.max(1, ...cells.map(c => Math.abs(c.net)))
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const pos = C.positiveRgb
  const neg = C.negativeRgb
  const color = (net: number) => {
    const t = Math.abs(net) / maxAbs
    if (net === 0) return C.card
    if (net > 0) return `rgba(${pos[0]},${pos[1]},${pos[2]},${0.12 + t * 0.85})`
    return `rgba(${neg[0]},${neg[1]},${neg[2]},${0.12 + t * 0.85})`
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid" style={{ gridTemplateColumns: '110px repeat(24, 1fr)' }}>
          <div />
          {hours.map(h => (
            <div key={h} className="text-center text-[10px] text-muted">{h}:00</div>
          ))}
          {weekdays.map((wd, wi) => (
            <React.Fragment key={wd}>
              <div className="flex items-center text-xs text-muted">{wd}</div>
              {hours.map(h => {
                const c = cells.find(x => x.weekday === wi && x.hour === h)
                return (
                  <div
                    key={h}
                    title={c ? `${wd} ${h}:00 — ${faNum(c.net)} ${currencyLabel ?? ''} (${c.trades} ترید)` : ''}
                    className="h-7 rounded-sm"
                    style={{ background: c ? color(c.net) : C.card }}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
        <div dir="ltr" className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <span>زیان</span>
          <div className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(to right, rgba(${neg[0]},${neg[1]},${neg[2]},0.95), ${C.card}, rgba(${pos[0]},${pos[1]},${pos[2]},0.95))` }} />
          <span>سود</span>
        </div>
      </div>
    </div>
  )
}

/* ---------- Income vs expense grouped bars (accounting) ---------- */

export function CashflowBars({ items }: { items: { month: string; income: number; expense: number }[] }) {
  const C = resolveThemeColors()
  const data = items.map(it => ({ ...it, income: Math.round(it.income * 100) / 100, expense: Math.round(it.expense * 100) / 100 }))
  return (
    <div dir="ltr" className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10 }} interval="preserveStartEnd" minTickGap={10} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: C.muted, fontSize: 11 }} width={44} axisLine={false} tickLine={false} tickFormatter={fmtTick} />
          <Tooltip content={<ChartTip />} formatter={(v: number | string, name: string) =>
            name === 'income' ? [fmtTick(Number(v)), 'درآمد'] : [fmtTick(Number(v)), 'هزینه']} />
          <Bar dataKey="income" fill={C.positive} radius={[4, 4, 0, 0]} fillOpacity={0.9} />
          <Bar dataKey="expense" fill={C.negative} radius={[4, 4, 0, 0]} fillOpacity={0.9} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------- Simple progress-style horizontal list (durations etc.) ---------- */

export function HorizontalList({ items, toneKey }: {
  items: { label: string; trades: number; net: number; win_rate?: number }[]
  toneKey?: 'net' | 'trades'
}) {
  const C = resolveThemeColors()
  const max = Math.max(1, ...items.map(i => (toneKey === 'trades' ? i.trades : Math.abs(i.net))))
  return (
    <div className="space-y-3">
      {items.map(it => {
        const v = toneKey === 'trades' ? it.trades : Math.abs(it.net)
        const pct = (v / max) * 100
        const positive = it.net >= 0
        return (
          <div key={it.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{it.label}</span>
              <span className="number text-muted">{it.trades} ترید</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: positive ? C.positive : C.negative, opacity: 0.85 }}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-[11px] text-muted">
              <span className="number">{faNum(it.net)}</span>
              {it.win_rate !== undefined && <span>برد {faNum(it.win_rate, 1)}٪</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
