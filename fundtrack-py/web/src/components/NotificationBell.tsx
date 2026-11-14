import React, { useEffect, useRef, useState } from 'react'
import { BellRing, CheckCheck, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { useT } from '../lib/i18n'
import { Badge, Button, EmptyState } from './ui'
import { faNum } from '../lib/format'

/** Friendly due label: past items read as "روز قبل" / "N روز قبل". */
function daysLabel(days: number): string {
  if (days < 0) {
    const abs = Math.abs(days)
    if (abs === 1) return 'روز قبل'
    return `${faNum(abs, 0)} روز قبل`
  }
  if (days === 0) return 'امروز'
  if (days === 1) return 'فردا'
  return `${faNum(days, 0)} روز`
}

export function NotificationBell() {
  const { settings } = useApp()
  const t = useT(settings.lang)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data, refetch } = useAsync(() => api.notifications(true), [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const count = data?.length ?? 0

  const markSeen = async () => {
    if (!data?.length) return
    try {
      await api.markNotificationsSeen(data.map(n => n.id))
      setOpen(false)
      await refetch()
    } catch { /* ignore */ }
  }

  const clearAll = async () => {
    try {
      await api.clearNotifications()
      setOpen(false)
      await refetch()
    } catch { /* ignore */ }
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="icon"
        title={t('ntf.title')}
        onClick={() => setOpen(v => !v)}
        className="relative"
      >
        <BellRing className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-bold text-white">
            {faNum(count, 0)}
          </span>
        )}
      </Button>

      {open && (
        <div className="dropdown-anchor left-0 top-full mt-2 w-80 max-w-[85vw]" style={{ zIndex: 1200 }}>
          <div className="dropdown-surface rounded-2xl">
            <div className="p-2">
              <div className="mb-1 flex items-center justify-between gap-2 px-2 py-1">
                <span className="text-sm font-semibold">{t('ntf.title')}</span>
                <div className="flex items-center gap-1">
                  {data && data.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={markSeen} title={t('ntf.markSeen')}>
                      <CheckCheck className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {data && data.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearAll} title={t('ntf.clear')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {!data || data.length === 0 ? (
                <EmptyState title={t('ntf.empty')} />
              ) : (
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {data.map(n => (
                    <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{n.title}</div>
                        {n.body && <div className="text-[11px] text-muted">{n.body}</div>}
                      </div>
                      {n.days_left !== null && (
                        <Badge tone={n.days_left <= 1 ? 'negative' : 'warn'}>
                          {daysLabel(n.days_left)}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
