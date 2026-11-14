import React, { useEffect, useState } from 'react'
import { CalendarDays, Clock } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { useT } from '../lib/i18n'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from './ui'
import { faNum } from '../lib/format'
import { jalaliDate } from '../lib/jalali'
import { COUNTDOWN_HORIZON, fmtCountdown, fmtTehranClock, tehranDateKey, upcomingEvents } from '../lib/news'
import type { NewsEvent } from '../types'

const IMPACT_TONE: Record<string, 'negative' | 'warn' | 'neutral' | 'accent'> = {
  High: 'negative',
  Medium: 'warn',
  Low: 'neutral',
  Holiday: 'accent',
}

export function NewsWidget({ limit = 5 }: { limit?: number }) {
  const { settings } = useApp()
  const t = useT(settings.lang)
  const { data, loading } = useAsync(() => api.news(), [])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading && !data) return <Skeleton className="h-40" />
  if (!data || data.length === 0) return null

  const upcoming = upcomingEvents(data, now).slice(0, limit)

  if (upcoming.length === 0) return null

  const groupByDay = (list: NewsEvent[]) => {
    const acc: Record<string, NewsEvent[]> = {}
    for (const e of list) {
      const key = e.ts != null ? tehranDateKey(e.ts) : e.event_date
      ;(acc[key] ||= []).push(e)
    }
    return acc
  }
  const grouped = groupByDay(upcoming)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 text-accent" /> {t('news.near')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.keys(grouped).sort().map(date => (
          <div key={date}>
            <div className="mb-1 text-[11px] font-medium text-muted">{jalaliDate(date)}</div>
            <div className="space-y-1">
              {grouped[date].map(e => {
                const remain = e.ts != null ? e.ts * 1000 - now : null
                const showCountdown = remain != null && remain > 0 && remain <= COUNTDOWN_HORIZON
                return (
                  <div key={e.id} className="flex items-center gap-2 rounded-lg bg-surface/60 px-2.5 py-1.5">
                    <Badge tone={IMPACT_TONE[e.impact] ?? 'neutral'}>{t('news.impact.' + e.impact) || e.impact}</Badge>
                    {e.ts != null && <span className="number text-[10px] text-muted">{fmtTehranClock(e.ts)}</span>}
                    <span className="min-w-0 flex-1 truncate text-xs">{e.title}</span>
                    {showCountdown && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                        <Clock className="h-3 w-3" />
                        <span className="number">{fmtCountdown(remain)}</span>
                      </span>
                    )}
                    {e.country && <Badge tone="accent">{e.country}</Badge>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
