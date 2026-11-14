import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Clock3, RefreshCw, ThumbsDown, ThumbsUp, TrendingUp } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { FilterBar } from '../components/FilterBar'
import { NewsWidget } from '../components/NewsWidget'
import { RangeSelect } from '../components/RangeSelect'
import { EquityChart, PeriodCalendar } from '../components/charts'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Money, Skeleton, StatCard, PageHeader } from '../components/ui'
import { useToast } from '../components/Toast'
import { useT } from '../lib/i18n'
import { faNum, fmtDuration, fmtMoney, pct } from '../lib/format'
import { jalaliDate } from '../lib/jalali'
import type { Account, Filters, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

export function DashboardPage() {
  const { activeAccount, activeLogin, settings } = useApp()
  const t = useT(settings.lang)
  const toast = useToast()
  const lastErr = useRef<string | null>(null)
  const userTouchedRange = useRef(false)
  const [filters, setFilters] = useState<Filters>({ range: settings?.default_range ?? 'all' })

  // apply the saved default range when settings load, unless the user picked one
  useEffect(() => {
    if (userTouchedRange.current) return
    if (settings?.default_range) setFilters(f => ({ ...f, range: settings.default_range }))
  }, [settings?.default_range])

  const qFilters = useMemo<Filters>(() => ({ ...filters, login: activeLogin ?? undefined }), [filters, activeLogin])
  const deps = [qFilters.range, qFilters.login, qFilters.symbol, qFilters.side, qFilters.source, qFilters.session, qFilters.from, qFilters.to]

  const opts = useAsync(() => api.filterOptions(), [])
  const summary = useAsync(() => api.summary(qFilters), deps)
  const periods = useAsync(() => {
    // the period card renders a monthly calendar → always need day-level data
    return api.netByPeriod('day', qFilters)
  }, deps)
  const hourB = useAsync(() => api.breakdown('hour', qFilters), deps)
  const sessionB = useAsync(() => api.breakdown('session', qFilters), deps)
  const durB = useAsync(() => api.durations(qFilters), deps)

  const news = useAsync(() => api.news(), [])
  const equity = useAsync(() => api.equity(activeLogin ?? undefined), deps)
  const balanceSeries = useMemo(() => (equity.data ?? []).map(p => ({ t: p.t, value: p.balance })), [equity.data])

  useEffect(() => {
    const id = setInterval(() => { summary.refetch(); periods.refetch(); news.refetch(); equity.refetch() }, 8000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.refetch, periods.refetch, news.refetch, equity.refetch])

  useEffect(() => {
    if (summary.error && summary.error !== lastErr.current) {
      lastErr.current = summary.error
      toast.push('error', summary.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.error])

  const doRefresh = async () => {
    await Promise.allSettled([summary.refetch(), periods.refetch()])
    toast.push('success', t('common.updated'))
  }

  const s = summary.data?.stats
  const safeSettings: Settings = settings ?? DEFAULT_SETTINGS
  const money = (n: number) => fmtMoney(n, safeSettings, activeAccount)

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav.dashboard')}
        actions={
          <div className="flex items-center gap-2">
            <RangeSelect value={filters.range} onChange={v => { userTouchedRange.current = true; setFilters(f => ({ ...f, range: v, from: undefined, to: undefined })) }} />
          </div>
        }
      />

      {summary.loading && !summary.data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : s ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <StatCard label={t('d.kpi.net')} value={money(s.net)[0]} sub={money(s.net)[1]} tone={s.net >= 0 ? 'positive' : 'negative'} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label={t('d.kpi.trades')} value={faNum(s.trades)} sub={`${faNum(s.wins)} ${t('common.wins')} / ${faNum(s.losses)} ${t('common.losses')}`} icon={<Activity className="h-4 w-4" />} />
          <StatCard label={t('d.kpi.winrate')} value={pct(s.win_rate)} sub={s.profit_factor !== null ? `${t('common.pf')}: ${faNum(s.profit_factor)}` : '—'} icon={<ThumbsUp className="h-4 w-4" />} />
          <StatCard label={t('d.kpi.avgR')} value={s.avg_r_price !== null ? faNum(s.avg_r_price, 2) : '—'} sub={`${t('common.count')}: ${faNum(s.expectancy)}`} tone="accent" />
          <StatCard label={t('d.kpi.best')} value={money(s.best)[0]} sub={money(s.best)[1]} tone="positive" icon={<ThumbsUp className="h-4 w-4" />} />
          <StatCard label={t('d.kpi.worst')} value={money(s.worst)[0]} sub={money(s.worst)[1]} tone="negative" icon={<ThumbsDown className="h-4 w-4" />} />
          <StatCard label={t('d.kpi.mdd')} value={money(s.max_drawdown)[0]} sub={`${faNum(s.max_loss_streak)} ${t('common.streak')}`} tone="negative" />
          <StatCard label={t('d.kpi.dur')} value={fmtDuration(s.avg_duration_min)} sub={`${t('common.median')}: ${fmtDuration(s.median_duration_min)}`} />
        </div>
      ) : (
        <Card><CardContent className="py-10"><EmptyState title={t('common.error')} hint={summary.error ?? ''} /></CardContent></Card>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          {summary.data && summary.data.curve.length > 0
            ? <EquityChart curve={summary.data.curve} balance={balanceSeries} />
            : <Card><CardContent><EmptyState className="h-64" title={t('d.emptyRange')} /></CardContent></Card>}
        </div>
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>{t('d.period')}</CardTitle></CardHeader>
          <CardContent>
            {periods.data && periods.data.length > 0
              ? <PeriodCalendar items={periods.data} range={qFilters.range} />
              : <EmptyState className="h-64" title={t('common.error')} />}
          </CardContent>
        </Card>
      </div>

      <NewsWidget />

      <Card>
        <CardHeader><CardTitle>{t('d.analytics')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-3">
            <MiniBlock title={t('d.mini.hours')} loading={hourB.loading} empty={!hourB.data?.length}>
              {hourB.data && [...hourB.data].sort((a, b) => b.trades - a.trades).slice(0, 5).map(h => (
                <MiniRow key={h.key} label={h.label} sub={`${faNum(h.trades)} ${t('common.trades')} · ${pct(h.win_rate)}`} value={h.net} money={money} />
              ))}
            </MiniBlock>
            <MiniBlock title={t('d.mini.sessions')} loading={sessionB.loading} empty={!sessionB.data?.length}>
              {sessionB.data && sessionB.data.slice(0, 5).map(x => (
                <MiniRow key={x.key} label={x.label} sub={`${faNum(x.trades)} ${t('common.trades')}`} value={x.net} money={money} />
              ))}
            </MiniBlock>
            <MiniBlock title={t('d.mini.durs')} loading={durB.loading} empty={!durB.data?.length}>
              {durB.data && durB.data.slice(0, 5).map(d => (
                <MiniRow key={d.label} label={d.label} sub={`${faNum(d.trades)} ${t('common.trades')} · ${pct(d.win_rate)}`} value={d.net} money={money} />
              ))}
            </MiniBlock>
          </div>
        </CardContent>
      </Card>

      <FilterBar filters={filters} onChange={setFilters} symbols={opts.data?.symbols ?? []} />

      <RecentTrades filters={qFilters} settings={safeSettings} account={activeAccount} t={t} />
    </div>
  )
}

function MiniBlock({ title, loading, empty, children }: {
  title: string; loading: boolean; empty: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Clock3 className="h-3.5 w-3.5" /> {title}
      </div>
      {loading && !children ? <Skeleton className="h-32" /> : empty ? <EmptyState title="—" /> :
        <div className="space-y-1.5">{children}</div>}
    </div>
  )
}

function MiniRow({ label, sub, value, money }: {
  label: string; sub: string; value: number
  money: (n: number) => [string, string?]
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{label}</div>
        <div className="text-[10px] text-muted">{sub}</div>
      </div>
      <div className="text-left">
        <div className={`number text-sm font-bold ${value >= 0 ? 'text-positive' : 'text-negative'}`}>{money(value)[0]}</div>
        {money(value)[1] && <div className="number text-[10px] text-muted">{money(value)[1]}</div>}
      </div>
    </div>
  )
}

function RecentTrades({ filters, settings, account, t }: {
  filters: Filters
  settings: Settings
  account?: Account
  t: (k: string) => string
}) {
  const { data, loading } = useAsync(() => api.trades(filters, 8), [filters.range, filters.login, filters.symbol, filters.side, filters.source, filters.session, filters.from, filters.to])
  const rows = useMemo(() => data?.items ?? [], [data])
  if (loading && !data) return <Skeleton className="h-40" />
  if (!rows.length) return <Card><CardContent><EmptyState title={t('d.emptyTrades')} /></CardContent></Card>
  return (
    <Card>
      <CardHeader><CardTitle>{t('d.recent')}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-xs text-muted">
                <th className="pb-2 pr-2 font-medium">{t('d.col.date')}</th>
                <th className="pb-2 font-medium">{t('d.col.symbol')}</th>
                <th className="pb-2 font-medium">{t('d.col.side')}</th>
                <th className="pb-2 font-medium">{t('d.col.source')}</th>
                <th className="pb-2 pl-2 font-medium">{t('d.col.net')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.login}-${r.position_id}`} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-2 text-xs text-muted">{jalaliDate(r.close_local)}</td>
                  <td className="py-2 font-medium">{r.symbol}</td>
                  <td className="py-2"><Badge tone={r.side === 'buy' ? 'positive' : 'negative'}>{r.side === 'buy' ? t('f.buy') : t('f.sell')}</Badge></td>
                  <td className="py-2 text-xs text-muted">{r.source === 'ea' ? t('f.ea') : t('f.manual')}</td>
                  <td className="py-2 pl-2 text-right"><Money value={r.net} settings={settings} account={account} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
