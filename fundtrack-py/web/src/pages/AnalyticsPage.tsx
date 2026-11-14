import React, { useMemo, useState } from 'react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { FilterBar } from '../components/FilterBar'
import { RangeSelect } from '../components/RangeSelect'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { DistributionBars, HeatmapGrid, HorizontalList } from '../components/charts'
import { Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { useT } from '../lib/i18n'
import { faNum, fmtMoney } from '../lib/format'
import type { Filters } from '../types'

export function AnalyticsPage() {
  const { activeAccount, activeLogin, settings } = useApp()
  const t = useT(settings.lang)
  const [filters, setFilters] = useState<Filters>({ range: 'all' })
  const qFilters = useMemo<Filters>(() => ({ ...filters, login: activeLogin ?? undefined }), [filters, activeLogin])
  const deps = [qFilters.range, qFilters.login, qFilters.symbol, qFilters.side, qFilters.source, qFilters.session, qFilters.from, qFilters.to]
  const opts = useAsync(() => api.filterOptions(), [])
  const heat = useAsync(() => api.heatmap(qFilters), deps)
  const hours = useAsync(() => api.breakdown('hour', qFilters), deps)
  const weekdays = useAsync(() => api.breakdown('weekday', qFilters), deps)
  const sessions = useAsync(() => api.breakdown('session', qFilters), deps)
  const symbols = useAsync(() => api.breakdown('symbol', qFilters), deps)
  const durations = useAsync(() => api.durations(qFilters), deps)
  const sides = useAsync(() => api.breakdown('side', qFilters), deps)

  const money = (n: number) => fmtMoney(n, settings ?? { show_toman: false }, activeAccount)[0]
  const currencyLabel = settings?.show_toman && activeAccount?.usd_toman ? (settings.base_currency === 'IRT' ? 'USD' : 'تومان') : undefined

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav.analytics')}
        subtitle={t('a.sub')}
        actions={<RangeSelect value={filters.range} onChange={v => setFilters(f => ({ ...f, range: v, from: undefined, to: undefined }))} />}
      />
      <FilterBar filters={filters} onChange={setFilters} symbols={opts.data?.symbols ?? []} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t('a.sides')}</CardTitle></CardHeader>
          <CardContent>
            {sides.loading && !sides.data ? <Skeleton className="h-44" /> :
              sides.data && sides.data.length ? (() => {
                const buy = sides.data.find(s => s.label === 'buy')
                const sell = sides.data.find(s => s.label === 'sell')
                const buyN = buy?.trades ?? 0
                const sellN = sell?.trades ?? 0
                const total = buyN + sellN
                const buyPct = total ? Math.round((buyN / total) * 100) : 0
                const sellPct = 100 - buyPct
                const data = [
                  { name: t('f.buy'), value: buyN || 0, fill: 'var(--positive)' },
                  { name: t('f.sell'), value: sellN || 0, fill: 'var(--negative)' },
                ]
                return (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative h-40 w-40 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={66} paddingAngle={3} stroke="none">
                            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-foreground">{faNum(total, 0)}</span>
                        <span className="text-xs text-muted">{t('common.trades')}</span>
                      </div>
                    </div>
                    <div className="w-full space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-positive" /> {t('f.buy')}</span>
                        <span><b className="number">{faNum(buyN, 0)}</b> ({faNum(buyPct, 0)}٪)</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-negative" /> {t('f.sell')}</span>
                        <span><b className="number">{faNum(sellN, 0)}</b> ({faNum(sellPct, 0)}٪)</span>
                      </div>
                    </div>
                  </div>
                )
              })() : <EmptyState title="داده‌ای نیست" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('a.bestDay')}</CardTitle></CardHeader>
          <CardContent>
            {weekdays.loading && !weekdays.data ? <Skeleton className="h-44" /> :
              weekdays.data && weekdays.data.length ? (() => {
                const best = [...weekdays.data].sort((a, b) => b.net - a.net)[0]
                return (
                  <div className="flex h-44 flex-col items-center justify-center gap-1 text-center">
                    <div className="text-2xl font-extrabold text-positive">{best.label}</div>
                    <div className="number text-sm text-foreground">{money(best.net)}</div>
                    <div className="text-xs text-muted">{faNum(best.trades)} {t('common.trades')} · {faNum(best.win_rate, 0)}٪</div>
                  </div>
                )
              })() : <EmptyState title="داده‌ای نیست" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('a.peakHour')}</CardTitle></CardHeader>
          <CardContent>
            {hours.loading && !hours.data ? <Skeleton className="h-44" /> :
              hours.data && hours.data.length ? (() => {
                const peak = [...hours.data].sort((a, b) => b.trades - a.trades)[0]
                return (
                  <div className="flex h-44 flex-col items-center justify-center gap-1 text-center">
                    <div className="text-2xl font-extrabold text-accent">{peak.label}</div>
                    <div className="number text-sm text-foreground">{faNum(peak.trades)} {t('common.trades')}</div>
                    <div className="text-xs text-muted">{money(peak.net)}</div>
                  </div>
                )
              })() : <EmptyState title="داده‌ای نیست" />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t('a.heat')}</CardTitle></CardHeader>
        <CardContent>
          {heat.loading && !heat.data ? <Skeleton className="h-64" /> :
            heat.data && heat.data.cells.length ? <HeatmapGrid hm={heat.data} currencyLabel={currencyLabel} /> :
            <EmptyState title="—" />}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AnalCard title={t('a.hour')} loading={hours.loading} hasData={!!(hours.data && hours.data.length)}>
          {hours.data && hours.data.length > 0 && <DistributionBars items={hours.data} />}
        </AnalCard>
        <AnalCard title={t('a.weekday')} loading={weekdays.loading} hasData={!!(weekdays.data && weekdays.data.length)}>
          {weekdays.data && weekdays.data.length > 0 && <DistributionBars items={weekdays.data} />}
        </AnalCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AnalCard title={t('a.sessions')} loading={sessions.loading} hasData={!!(sessions.data && sessions.data.length)}>
          {sessions.data && sessions.data.length > 0 && <HorizontalList items={sessions.data} toneKey="net" />}
        </AnalCard>
        <AnalCard title={t('a.symbols')} loading={symbols.loading} hasData={!!(symbols.data && symbols.data.length)}>
          {symbols.data && symbols.data.length > 0 && <HorizontalList items={symbols.data} toneKey="net" />}
        </AnalCard>
        <AnalCard title={t('a.durs')} loading={durations.loading} hasData={!!(durations.data && durations.data.length)}>
          {durations.data && durations.data.length > 0 && <HorizontalList items={durations.data} toneKey="trades" />}
        </AnalCard>
      </div>

      <p className="text-xs text-muted">{t('a.note')}</p>
    </div>
  )
}

function AnalCard({ title, loading, hasData, children }: {
  title: string; loading: boolean; hasData: boolean; children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {loading && !hasData ? <Skeleton className="h-48" /> : hasData ? children : <EmptyState className="h-48" title="داده‌ای نیست" />}
      </CardContent>
    </Card>
  )
}
