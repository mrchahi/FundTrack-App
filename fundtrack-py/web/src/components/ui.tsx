import React, { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import type { Account, Settings } from '../types'
import { faNum, fmtUSD } from '../lib/format'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ---------------- Button ---------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type ButtonSize = 'sm' | 'md' | 'icon'

const btnVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:opacity-90 shadow-sm',
  secondary: 'bg-elevated text-white hover:bg-border',
  ghost: 'hover:bg-elevated text-muted hover:text-foreground',
  outline: 'border border-border bg-transparent hover:bg-elevated',
  danger: 'bg-negative/15 text-white hover:bg-negative/25',
}

const btnSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  icon: 'h-9 w-9',
}

export function Button(props: {
  variant?: ButtonVariant; size?: ButtonSize; loading?: boolean
  className?: string; children: ReactNode; onClick?: () => void
  disabled?: boolean; title?: string; type?: 'button' | 'submit'
}) {
  const { variant = 'primary', size = 'md', loading, className, children, onClick, disabled, title, type = 'button' } = props
  return (
    <button
      type={type}
      title={title}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors select-none',
        'disabled:opacity-50 disabled:pointer-events-none',
        btnVariants[variant], btnSizes[size], className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

/* ---------------- Card ---------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn('relative rounded-2xl border border-border bg-card transition-colors', className)}
      style={{
        backdropFilter: 'blur(var(--card-blur, 12px))',
        WebkitBackdropFilter: 'blur(var(--card-blur, 12px))',
        filter: 'contrast(var(--card-contrast, 1))',
      }}
    >
      {children}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </div>
  )
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)}>{children}</div>
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cn('text-base font-bold text-foreground', className)}>{children}</h3>
}

export function CardDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('text-xs text-muted', className)}>{children}</p>
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5 pt-2', className)}>{children}</div>
}

/* ---------------- Badge ---------------- */

type BadgeTone = 'neutral' | 'positive' | 'negative' | 'accent' | 'warn' | 'outline'

export function Badge({ tone = 'neutral', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-elevated text-muted',
    positive: 'bg-positive/10 text-positive',
    negative: 'bg-negative/10 text-negative',
    accent: 'bg-accent/10 text-accent',
    warn: 'bg-warn/10 text-warn',
    outline: 'border border-border text-muted',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  )
}

/* ---------------- Input ---------------- */

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return (
    <input
      {...rest}
      className={cn(
        'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground',
        'placeholder:text-muted outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition',
        className,
      )}
    />
  )
}

interface OptionLike {
  value: string
  label: ReactNode
  disabled?: boolean
  props?: { value?: unknown; children?: ReactNode; disabled?: boolean }
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, style, children, value, onChange, disabled, title, ...rest } = props
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const options: OptionLike[] = Children.toArray(children)
    .filter(React.isValidElement)
    .filter((c: React.ReactElement) => c.type === 'option')
    .map((c: React.ReactElement) => ({
      value: String(c.props.value ?? ''),
      label: c.props.children,
      disabled: c.props.disabled,
    }))

  const current = options.find(o => o.value === String(value ?? ''))

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => { if (open) setRect(null) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const menuHeight = Math.min(320, options.length * 34 + 12)
      const spaceBelow = window.innerHeight - r.bottom
      const top = spaceBelow >= menuHeight + 8 ? r.bottom + 6 : Math.max(8, r.top - menuHeight - 6)
      setRect({ top, left: r.left, width: r.width })
    }
    setOpen(o => !o)
  }

  const choose = (v: string) => {
    setOpen(false)
    onChange?.({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>)
  }

  return (
    <div className={cn('relative inline-flex w-full', className)} style={style}>
      <button
        ref={btnRef}
        type="button"
        title={title}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-foreground',
          'outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition cursor-pointer select-none',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        <span className="truncate">{current?.label ?? ''}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          className="dropdown-surface rounded-xl p-1"
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, maxWidth: 'min(85vw, 340px)', zIndex: 9999 }}
        >
          {options.length === 0 && <div className="px-3 py-2 text-xs text-muted">—</div>}
          {options.map(o => {
            const selected = o.value === String(value ?? '')
            return (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onClick={() => choose(o.value)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-start text-sm transition-colors',
                  selected ? 'bg-elevated font-semibold text-foreground' : 'text-muted hover:bg-elevated/70 hover:text-foreground',
                  o.disabled && 'opacity-50 pointer-events-none',
                )}
              >
                <span className="truncate">{o.label}</span>
                {selected && <Check className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ---------------- Field (label + control) ---------------- */

export function Field({ label, children, className }: {
  label?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <label className="text-xs font-medium text-muted">{label}</label>}
      {children}
    </div>
  )
}

/* ---------------- Switch ---------------- */

export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-3', disabled && 'opacity-50 pointer-events-none')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-1 transition-colors',
          checked ? 'bg-primary' : 'bg-border',
        )}
      >
        <span className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-all',
          checked ? 'mr-auto' : 'ml-auto',
        )} />
      </button>
      {label && <span className="text-sm text-muted">{label}</span>}
    </div>
  )
}

/* ---------------- Tabs ---------------- */

export function Tabs({ items, value, onChange }: {
  items: { value: string; label: ReactNode }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-surface p-1 border border-border">
      {items.map(it => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
            value === it.value ? 'bg-elevated text-foreground shadow-sm' : 'text-muted hover:text-foreground',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Separator ---------------- */

export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-border', className)} />
}

/* ---------------- StatCard ---------------- */

export function StatCard(props: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'positive' | 'negative' | 'accent'
  className?: string
}) {
  const { label, value, sub, icon, tone = 'default' } = props
  const tones = {
    default: 'text-foreground',
    positive: 'text-positive',
    negative: 'text-negative',
    accent: 'text-accent',
  }
  return (
    <Card className={cn('p-4', props.className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 w-full">
          <div className="text-[11px] font-semibold text-muted">{label}</div>
          <div className={cn('mt-1.5 text-right text-xl font-extrabold leading-none number', tones[tone])}>{value}</div>
          {sub && <div className="mt-1.5 text-right text-[11px] text-muted">{sub}</div>}
        </div>
        {icon && <div className="rounded-lg bg-elevated p-2 text-muted">{icon}</div>}
      </div>
    </Card>
  )
}

/* ---------------- Skeleton / Empty ---------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-elevated', className)} />
}

export function EmptyState({ title, hint, className }: { title: string; hint?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 py-12 text-center', className)}>
      <div className="text-2xl">📭</div>
      <div className="text-sm font-semibold text-muted">{title}</div>
      {hint && <div className="text-xs text-muted/70">{hint}</div>}
    </div>
  )
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-3 w-full overflow-hidden rounded-full bg-elevated', className)}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

/** مقدار اصلی + (اختیاری) واحد دوم؛ راست‌چین و رنگی (سبز=مثبت، قرمز=منفی). */
export function Money({ value, settings, account, className, strong = true }: {
  value: number
  settings: Settings
  account?: Account
  className?: string
  strong?: boolean
}) {
  const rate = account?.usd_toman ?? 0
  const showSec = !!(settings?.show_toman && rate > 0 && account)
  const base = settings?.base_currency ?? 'USD'
  const tone = value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : 'text-foreground'

  let primary: string
  let secondary: string | undefined
  if (base === 'IRT' && rate > 0) {
    primary = `${faNum(value * rate, 0)} تومان`
    secondary = showSec ? fmtUSD(value) : undefined
  } else {
    primary = fmtUSD(value)
    secondary = showSec ? `${faNum(value * rate, 0)} ت` : undefined
  }

  return (
    <span dir="ltr" className={cn('inline-flex w-full items-center justify-end gap-1.5 text-right', className)}>
      {secondary && <span className="number text-[11px] text-muted">{secondary}</span>}
      <span className={cn('number', strong && 'font-bold', tone)}>{primary}</span>
    </span>
  )
}

/* ---------------- Page header ---------------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
