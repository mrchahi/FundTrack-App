import React from 'react'
import { toJalali, MONTHS_FA, jalaliToGregorian } from '../lib/jalali'
import { Select } from './ui'

const now = new Date()
const [ny, nm, nd] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())

function isoOf(jy: number, jm: number, jd: number): string {
  const g = jalaliToGregorian(jy, jm, jd)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${g.getFullYear()}-${p(g.getMonth() + 1)}-${p(g.getDate())}`
}

export function JalaliDatePicker({ value, onChange }: {
  value: string
  onChange: (iso: string) => void
}) {
  // parse current value (iso or empty) -> jalali parts
  let jy = ny, jm = nm, jd = nd
  if (value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (m) {
      const g = new Date(+m[1], +m[2] - 1, +m[3])
      ;[jy, jm, jd] = toJalali(g.getFullYear(), g.getMonth() + 1, g.getDate())
    }
  }
  const daysInMonth = jm <= 6 ? 31 : jm <= 11 ? 30 : 29
  const safeJd = Math.min(jd, daysInMonth)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={String(jy)}
        onChange={e => { const y = Number(e.target.value); onChange(isoOf(y, jm, safeJd)) }}
        className="h-9"
        style={{ width: '5rem' }}
      >
        {Array.from({ length: 21 }, (_, i) => ny - 10 + i).map(y => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </Select>
      <Select
        value={String(jm)}
        onChange={e => { const m = Number(e.target.value); onChange(isoOf(jy, m, Math.min(safeJd, m <= 6 ? 31 : m <= 11 ? 30 : 29))) }}
        className="h-9"
        style={{ width: '7rem' }}
      >
        {MONTHS_FA.map((mo, i) => (
          <option key={mo} value={String(i + 1)}>{mo}</option>
        ))}
      </Select>
      <Select
        value={String(safeJd)}
        onChange={e => onChange(isoOf(jy, jm, Number(e.target.value)))}
        className="h-9"
        style={{ width: '4rem' }}
      >
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
          <option key={d} value={String(d)}>{d}</option>
        ))}
      </Select>
    </div>
  )
}
