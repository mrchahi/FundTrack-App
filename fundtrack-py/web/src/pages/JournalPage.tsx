import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { FilterBar } from '../components/FilterBar'
import { RangeSelect } from '../components/RangeSelect'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Money, PageHeader, Skeleton } from '../components/ui'
import { useT } from '../lib/i18n'
import { faNum, fmtDuration, pct } from '../lib/format'
import { jalaliDateTime } from '../lib/jalali'
import { DEFAULT_SETTINGS } from '../types'
import type { Filters, Trade } from '../types'

type SortKey = 'close_t' | 'net' | 'duration_min' | 'r_price'
const PAGE_SIZE = 20

export function JournalPage() {
  const { activeAccount, activeLogin, settings } = useApp()
  const t = useT(settings.lang)
  const [filters, setFilters] = useState<Filters>({ range: 'all' })
  const qFilters = useMemo<Filters>(() => ({ ...filters, login: activeLogin ?? undefined }), [filters, activeLogin])
  const deps = [qFilters.range, qFilters.login, qFilters.symbol, qFilters.side, qFilters.source, qFilters.session, qFilters.from, qFilters.to]

  const opts = useAsync(() => api.filterOptions(), [])
  const query = useAsync(() => api.trades(qFilters, 2000), deps)
  const sum = useAsync(() => api.summary(qFilters), deps)
  const top = useAsync(() => api.top(qFilters, 10), deps)

  const trades = useMemo(() => query.data?.items ?? [], [query.data])
  const [sortKey, setSortKey] = useState<SortKey>('close_t')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    const arr = [...trades]
    arr.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      return sortAsc ? av - bv : bv - av
    })
    return arr
  }, [trades, sortKey, sortAsc])

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const visible = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, deps)

  const st = sum.data?.stats
  const safeSettings = settings ?? { ...DEFAULT_SETTINGS, theme: 'dark' as const }

  const headerClick = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc)
    else { setSortKey(k); setSortAsc(false) }
    setPage(1)
  }

  const th = (k: SortKey, label: string) => (
    <th className="pb-2 font-medium">
      <button onClick={() => headerClick(k)} className="hover:text-foreground transition-colors">
        {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
      </button>
    </th>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('j.title')}
        subtitle={t('j.sub')}
        actions={
          <div className="flex items-center gap-2">
            <RangeSelect value={filters.range} onChange={v => setFilters(f => ({ ...f, range: v, from: undefined, to: undefined }))} />
            <a href={api.journalUrl(qFilters)} download className="inline-flex">
              <Button variant="outline" size="md" className="whitespace-nowrap"><Download className="h-4 w-4" /> {t('common.exports')}</Button>
            </a>
          </div>
        }
      />

      <FilterBar filters={filters} onChange={setFilters} symbols={opts.data?.symbols ?? []} />

      {st && (
        <div className="flex flex-wrap gap-2">
          {[
            [t('common.count'), faNum(st.trades)],
            [t('common.net'), (st.net >= 0 ? '$' : '−$') + faNum(Math.abs(st.net))],
            [t('common.winrate'), pct(st.win_rate)],
            [t('common.pf'), st.profit_factor !== null ? faNum(st.profit_factor) : '—'],
            [t('common.avgR'), st.avg_r_price !== null ? faNum(st.avg_r_price, 2) : '—'],
            [t('common.best'), (st.best >= 0 ? '$' : '−$') + faNum(Math.abs(st.best))],
            [t('common.worst'), (st.worst >= 0 ? '$' : '−$') + faNum(Math.abs(st.worst))],
            [t('common.avgDur'), fmtDuration(st.avg_duration_min)],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl border border-border bg-card px-3 py-2 text-xs">
              <span className="text-muted">{k}: </span>
              <span className="font-bold number">{v}</span>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {query.loading && !query.data ? (
            <Skeleton className="h-64" />
          ) : sorted.length === 0 ? (
            <EmptyState title={t('j.empty')} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-right text-xs text-muted">
                      {th('close_t', t('j.col.closed'))}
                      <th className="pb-2 font-medium">{t('d.col.symbol')}</th>
                      <th className="pb-2 font-medium">{t('d.col.side')}</th>
                      <th className="pb-2 font-medium">{t('j.col.volume')}</th>
                      <th className="pb-2 font-medium">{t('j.col.px')}</th>
                      {th('duration_min', t('j.col.dur'))}
                      {th('net', t('d.col.net'))}
                      {th('r_price', 'R')}
                      <th className="pb-2 font-medium">{t('j.col.source')}</th>
                      <th className="pb-2 font-medium">{t('j.col.session')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(r => (
                      <tr key={`${r.login}-${r.position_id}`} className="border-b border-border/40 last:border-0 hover:bg-surface/40">
                        <td className="py-2 text-xs text-muted">{jalaliDateTime(r.close_local)}</td>
                        <td className="py-2 font-medium">{r.symbol}</td>
                        <td className="py-2"><Badge tone={r.side === 'buy' ? 'positive' : 'negative'}>{r.side === 'buy' ? t('f.buy') : t('f.sell')}</Badge></td>
                        <td className="py-2 text-right number">{r.volume}</td>
                        <td className="py-2 text-right number text-xs text-muted">{faNum(r.open_price, 2)} → {faNum(r.close_price, 2)}</td>
                        <td className="py-2 text-right text-xs text-muted">{fmtDuration(r.duration_min)}</td>
                        <td className="py-2 pl-2 text-right"><Money value={r.net} settings={safeSettings} account={activeAccount} /></td>
                        <td className="py-2 text-right number">{r.r_price !== null ? faNum(r.r_price, 2) : '—'}</td>
                        <td className="py-2 text-xs text-muted">{r.source === 'ea' ? t('f.ea') : t('f.manual')}</td>
                        <td className="py-2 text-xs text-muted">{r.session}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="text-xs text-muted">
                  {faNum((page - 1) * PAGE_SIZE + 1)} – {faNum(Math.min(page * PAGE_SIZE, sorted.length))} / {faNum(sorted.length)}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    <ChevronRight className="h-4 w-4" /> {t('j.prev')}
                  </Button>
                  <span className="px-2 text-xs text-muted">{t('j.page')} {faNum(page)} / {faNum(pageCount)}</span>
                  <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>
                    {t('j.next')} <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopList title={t('j.best')} rows={top.data?.best ?? []} tone="positive" />
        <TopList title={t('j.worst')} rows={top.data?.worst ?? []} tone="negative" />
      </div>
    </div>
  )
}

function TopList({ title, rows, tone }: {
  title: string
  rows: Trade[]
  tone: 'positive' | 'negative'
}) {
  if (!rows.length) return null
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={`${r.login}-${r.position_id}`} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone={tone}>{r.symbol}</Badge>
                <span className="text-xs text-muted">{jalaliDateTime(r.close_local)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="number text-xs text-muted">R {r.r_price !== null ? faNum(r.r_price, 2) : '—'}</span>
                <span className={`number font-bold ${tone === 'positive' ? 'text-positive' : 'text-negative'}`}>
                  {(r.net >= 0 ? '$' : '−$') + faNum(Math.abs(r.net))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
