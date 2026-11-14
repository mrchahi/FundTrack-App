import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { toJalali, MONTHS_FA, jalaliToGregorian } from '../lib/jalali'
import { cn } from './ui'

const now = new Date()
const [tjy, tjm, tjd] = toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())

const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] // Sat..Fri

function isoOf(jy: number, jm: number, jd: number): string {
  const g = jalaliToGregorian(jy, jm, jd)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${g.getFullYear()}-${p(g.getMonth() + 1)}-${p(g.getDate())}`
}

function parseIso(value: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!m) return [tjy, tjm, tjd]
  const g = new Date(+m[1], +m[2] - 1, +m[3])
  return toJalali(g.getFullYear(), g.getMonth() + 1, g.getDate())
}

export function JalaliCalendarPicker({ value, onChange }: {
  value: string
  onChange: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null)
  const [jy, jm, jd] = parseIso(value)
  const [viewY, setViewY] = useState(jy)
  const [viewM, setViewM] = useState(jm)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const daysInMonth = viewM <= 6 ? 31 : viewM <= 11 ? 30 : 29
  const firstGreg = jalaliToGregorian(viewY, viewM, 1)
  const lead = (firstGreg.getDay() + 1) % 7 // align to Saturday

  const prevMonth = () => {
    if (viewM === 1) { setViewM(12); setViewY(v => v - 1) } else setViewM(m => m - 1)
  }
  const nextMonth = () => {
    if (viewM === 12) { setViewM(1); setViewY(v => v + 1) } else setViewM(m => m + 1)
  }

  const cells: React.ReactNode[] = []
  for (let i = 0; i < lead; i++) cells.push(<div key={`b${i}`} />)
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoOf(viewY, viewM, d)
    const isSel = value === iso
    const isToday = viewY === tjy && viewM === tjm && d === tjd
    cells.push(
      <button
        key={d}
        type="button"
        onClick={() => { onChange(iso); setOpen(false) }}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors',
          isSel ? 'bg-accent text-background font-bold' :
          isToday ? 'ring-1 ring-accent text-accent font-semibold' :
          'text-foreground hover:bg-elevated',
        )}
      >
        {d}
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open && ref.current) {
            const r = ref.current.getBoundingClientRect()
            const menuW = 288
            const menuH = 320
            // find the nearest modal overlay to center within it
            const overlay = ref.current.closest('.z-\\[120\\]') as HTMLElement | null
            const wrap = overlay ?? document.body
            const wr = wrap.getBoundingClientRect()
            const centerX = wr.left + wr.width / 2
            const left = Math.max(8, Math.min(window.innerWidth - menuW - 8, centerX - menuW / 2))
            const spaceBelow = window.innerHeight - r.bottom
            const top = spaceBelow >= menuH + 8 ? r.bottom + 6 : Math.max(8, r.top - menuH - 6)
            setRect({ top, left })
          }
          setOpen(o => !o)
        }}
        className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
      >
        <span className="truncate">
          {value ? `${jd} ${MONTHS_FA[jm - 1]} ${jy}` : 'انتخاب تاریخ'}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          className="dropdown-surface z-50 w-72 rounded-xl p-3"
          style={{ position: 'fixed', top: rect.top, left: rect.left, maxHeight: '60vh', overflow: 'auto', zIndex: 9999 }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-foreground">{MONTHS_FA[viewM - 1]} {viewY}</div>
            <button type="button" onClick={nextMonth} className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w, i) => (
              <div key={w + i} className="text-center text-[10px] text-muted">{w}</div>
            ))}
            {cells}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
