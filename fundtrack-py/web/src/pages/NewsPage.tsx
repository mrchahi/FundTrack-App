import React, { useEffect, useRef, useState } from 'react'
import { BellRing, CalendarDays, Clock, Upload } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { useToast } from '../components/Toast'
import { useT } from '../lib/i18n'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { cn } from '../components/ui'
import { faNum } from '../lib/format'
import { jalaliDate } from '../lib/jalali'
import {
  ALARM_LEAD,
  COUNTDOWN_HORIZON,
  eventTsSec,
  fmtCountdown,
  fmtTehranClock,
  tehranDateKey,
  upcomingEvents,
} from '../lib/news'
import type { NewsEvent } from '../types'

const IMPACT_TONE: Record<string, 'negative' | 'warn' | 'neutral' | 'accent'> = {
  High: 'negative',
  Medium: 'warn',
  Low: 'neutral',
  Holiday: 'accent',
}

/** Short Web Audio beep — no external file needed. */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.value = 880
    const t0 = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8)
    o.start(t0)
    o.stop(t0 + 0.9)
    o.onended = () => ctx.close().catch(() => {})
  } catch {
    /* audio unavailable */
  }
}

type Tab = 'events' | 'holidays'

export function NewsPage() {
  const { settings } = useApp()
  const t = useT(settings.lang)
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState<Tab>('events')
  const alarmedRef = useRef<Set<number>>(new Set())
  const { data, loading, refetch } = useAsync(() => api.news(), [])

  // ticking clock drives countdown + alarm
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // periodically re-fetch so scheduler-updated Actual values appear
  useEffect(() => {
    const id = setInterval(() => refetch(), 60 * 1000)
    return () => clearInterval(id)
  }, [refetch])

  const events = upcomingEvents(data, now)
  const holidays = (data ?? []).filter(e => e.impact === 'Holiday')

  // alarm: when the closest upcoming event enters the "near" window, fire once
  useEffect(() => {
    const closest = events
      .map(e => ({ e, ts: eventTsSec(e) }))
      .filter(x => x.ts !== null)
      .map(x => ({ id: x.e.id, remain: x.ts! * 1000 - now }))
      .filter(x => x.remain >= 0 && x.remain <= ALARM_LEAD)
      .sort((a, b) => a.remain - b.remain)[0]
    if (!closest || alarmedRef.current.has(closest.id)) return
    alarmedRef.current.add(closest.id)
    const ev = events.find(e => e.id === closest.id)
    beep()
    if (ev) toast.push('info', `${t('news.alarm')}: ${ev.title}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, data, t, toast])

  const onFile = async (file: File) => {
    setUploading(true)
    try {
      const text = await file.text()
      const res = await api.uploadNews(text)
      toast.push('success', t.fmt('news.imported', res.imported))
      await refetch()
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const groupByDay = (list: NewsEvent[]) => {
    const acc: Record<string, NewsEvent[]> = {}
    for (const e of list) {
      const ts = eventTsSec(e)
      const key = ts !== null ? tehranDateKey(ts) : e.event_date
      ;(acc[key] ||= []).push(e)
    }
    return acc
  }

  const groupedEvents = groupByDay(events)

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('news.title')}
        subtitle={t('news.sub')}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-surface p-1 w-fit">
          <button
            onClick={() => setTab('events')}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
              tab === 'events' ? 'bg-accent/15 text-foreground border border-accent/40' : 'text-muted hover:text-foreground border border-transparent',
            )}
          >
            {t('news.tabEvents')}
          </button>
          <button
            onClick={() => setTab('holidays')}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
              tab === 'holidays' ? 'bg-accent/15 text-foreground border border-accent/40' : 'text-muted hover:text-foreground border border-transparent',
            )}
          >
            {t('news.tabHolidays')}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
          />
          <Button onClick={() => fileRef.current?.click()} loading={uploading} size="sm" variant="outline">
            <Upload className="h-3.5 w-3.5" /> {t('news.upload')}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <Skeleton className="h-64" />
      ) : tab === 'events' ? (
        Object.keys(groupedEvents).length === 0 ? (
          <Card><CardContent><EmptyState title={t('news.empty')} /></CardContent></Card>
        ) : (
          Object.keys(groupedEvents).sort().map(date => (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-accent" /> {jalaliDate(date)}
                  <Badge tone="neutral">{faNum(groupedEvents[date].length, 0)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {groupedEvents[date].map(e => {
                    const ts = eventTsSec(e)
                    const remain = ts !== null ? ts * 1000 - now : null
                    const isUpcoming = remain != null && remain > 0
                    const isNear = isUpcoming && remain <= ALARM_LEAD
                    const showCountdown = isUpcoming && remain <= COUNTDOWN_HORIZON
                    const hasValues = !!(e.actual || e.forecast || e.previous)
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface px-3 py-2.5 transition-all',
                          isNear && 'ring-1 ring-accent/60 shadow-[0_0_0_1px_var(--accent)]',
                        )}
                      >
                        <Badge tone={IMPACT_TONE[e.impact] ?? 'neutral'}>{t('news.impact.' + e.impact) || e.impact}</Badge>
                        <span className="h-4 w-px self-center bg-border/70" aria-hidden="true" />
                        {ts !== null && <span className="number text-xs text-muted">{fmtTehranClock(ts)}</span>}
                        <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', isUpcoming && 'text-foreground')}>
                          {e.title}
                        </span>
                        {showCountdown && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                            <Clock className="h-3 w-3" />
                            {t('news.in')} {fmtCountdown(remain)}
                          </span>
                        )}
                        {isNear && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-negative/10 px-2 py-0.5 text-[11px] font-semibold text-negative">
                            <BellRing className="h-3 w-3 animate-pulse" /> {t('news.alarm')}
                          </span>
                        )}
                        {e.country && <Badge tone="accent">{e.country}</Badge>}
                        {e.url && (
                          <a href={e.url} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">↗</a>
                        )}
                        {hasValues && (
                          <>
                            <span className="h-4 w-px self-center bg-border/70" aria-hidden="true" />
                            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                              {e.actual && (
                                <span className="font-semibold text-positive">
                                  {t('news.actual')}: {e.actual}
                                </span>
                              )}
                              {e.forecast && (
                                <span className="text-muted">
                                  {t('news.forecast')}: {e.forecast}
                                </span>
                              )}
                              {e.previous && (
                                <span className="text-muted">
                                  {t('news.previous')}: {e.previous}
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )
      ) : (
        holidays.length === 0 ? (
          <Card><CardContent><EmptyState title={t('news.holidaysEmpty')} /></CardContent></Card>
        ) : (
          Object.keys(groupByDay(holidays)).sort().map(date => (
            <Card key={date}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-accent" /> {jalaliDate(date)}
                  <Badge tone="neutral">{faNum(groupByDay(holidays)[date].length, 0)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {groupByDay(holidays)[date].map(e => (
                    <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-3 py-2">
                      <Badge tone="accent">{t('news.impact.Holiday') || e.impact}</Badge>
                      {e.country && <Badge tone="accent">{e.country}</Badge>}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                      {e.url && (
                        <a href={e.url} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">↗</a>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )
      )}
    </div>
  )
}
