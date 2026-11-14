import React from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, Card, Select } from './ui'
import { useApp } from '../store'
import { useT } from '../lib/i18n'
import type { Filters } from '../types'

const SESSIONS = ['London', 'New York', 'Tokyo', 'Sydney', 'Off-hours']

export function FilterBar({ filters, onChange, symbols }: {
  filters: Filters
  onChange: (f: Filters) => void
  symbols: string[]
}) {
  const { settings } = useApp()
  const t = useT(settings.lang)
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filters.symbol ?? ''} onChange={e => set({ symbol: e.target.value || undefined })} className="w-32">
          <option value="">{t('f.symbols')}</option>
          {symbols.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={filters.side ?? ''} onChange={e => set({ side: (e.target.value || undefined) as Filters['side'] })} className="w-24">
          <option value="">{t('f.sides')}</option>
          <option value="buy">{t('f.buy')}</option>
          <option value="sell">{t('f.sell')}</option>
        </Select>
        <Select value={filters.source ?? ''} onChange={e => set({ source: (e.target.value || undefined) as Filters['source'] })} className="w-28">
          <option value="">{t('f.sources')}</option>
          <option value="ea">{t('f.ea')}</option>
          <option value="manual">{t('f.manual')}</option>
        </Select>
        <Select value={filters.session ?? ''} onChange={e => set({ session: e.target.value || undefined })} className="w-32">
          <option value="">{t('f.sessions')}</option>
          {SESSIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        {filters.range === 'all' && (
          <>
            <input type="date" value={filters.from ?? ''} onChange={e => set({ from: e.target.value || undefined })}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none" />
            <span className="text-muted text-xs">{t('f.to')}</span>
            <input type="date" value={filters.to ?? ''} onChange={e => set({ to: e.target.value || undefined })}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none" />
          </>
        )}
        <Button variant="ghost" size="icon" className="mr-auto" title={t('common.reset')} onClick={() => onChange({ range: filters.range })}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}
