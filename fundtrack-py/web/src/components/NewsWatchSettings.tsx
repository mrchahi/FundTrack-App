import React, { useMemo, useState } from 'react'
import { BellRing } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useT } from '../lib/i18n'
import { Button, Card, CardContent, CardHeader, CardTitle, Select } from './ui'
import { cn } from './ui'
import type { Settings } from '../types'

const NOISE_WORDS = new Set([
  'y/y', 'm/m', 'q/q', 'prelim', 'final', 'flash', 'revised',
  'speaks', 'speech', 'buba', 'president', 'gov', 'member', 'minutes',
  'index', 'preliminary', 'auction', 'meetings', 'meeting',
  'press', 'conference', 'statement', 'forecast', 'release',
  'sa', 'nsa', 'mom', 'yoy', 'qoq', 'wow',
])

const CODE_WORDS = new Set([
  'usd', 'eur', 'jpy', 'gbp', 'aud', 'nzd', 'cad', 'chf', 'cny',
  'us', 'germany', 'japan', 'uk', 'france', 'italy', 'china', 'canada',
  'australia', 'new zealand', 'switzerland',
])

function extractKeywords(title: string): string[] {
  const words = title.toLowerCase().split(/[\s/,-]+/).filter(Boolean)
  const out: string[] = []
  for (const w of words) {
    if (!NOISE_WORDS.has(w) && !CODE_WORDS.has(w) && !out.includes(w)) out.push(w)
  }
  return out
}

export function NewsWatchSettings({ watch, lead, onEdit }: {
  watch: string[]
  lead: number
  onEdit: (patch: Partial<Settings>) => void
}) {
  const t = useT('fa')
  const { data } = useAsync(() => api.news(), [])
  const [watchInput, setWatchInput] = useState('')

  const addWatch = () => {
    const v = watchInput.trim()
    if (!v || watch.some(w => w.toLowerCase() === v.toLowerCase())) return
    onEdit({ news_watch: [...watch, v] })
    setWatchInput('')
  }
  const removeWatch = (v: string) => onEdit({ news_watch: watch.filter(w => w !== v) })
  const toggleWatch = (v: string) => {
    const exists = watch.some(w => w.toLowerCase() === v.toLowerCase())
    onEdit({ news_watch: exists ? watch.filter(w => w.toLowerCase() !== v.toLowerCase()) : [...watch, v] })
  }

  const suggestions = useMemo(() => {
    const freq = new Map<string, number>()
    for (const e of data ?? []) {
      for (const k of extractKeywords(e.title)) freq.set(k, (freq.get(k) ?? 0) + 1)
    }
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([w]) => w)
  }, [data])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-4 w-4 text-accent" /> {t('news.watchTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center justify-end gap-2">
            <span className="text-right text-xs text-muted">{t('news.watchLead')}</span>
            <Select
              value={String(lead)}
              onChange={e => onEdit({ news_lead_minutes: Number(e.target.value) })}
              className="h-9"
              style={{ width: '7rem' }}
            >
              <option value="5">۵ دقیقه</option>
              <option value="10">۱۰ دقیقه</option>
              <option value="15">۱۵ دقیقه</option>
              <option value="30">۳۰ دقیقه</option>
              <option value="60">۱ ساعت</option>
              <option value="120">۲ ساعت</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {watch.map(w => (
            <span key={w} className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/30 px-2.5 py-1 text-xs font-medium text-accent">
              {w}
              <button onClick={() => removeWatch(w)} className="text-accent/70 hover:text-accent" title={t('news.watchRemove')}>✕</button>
            </span>
          ))}
          {watch.length === 0 && <span className="text-xs text-muted">—</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={watchInput}
            onChange={e => setWatchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addWatch() }}
            placeholder={t('news.watchAdd')}
            className="h-9 flex-1 min-w-40 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent/60"
          />
          <Button size="sm" onClick={addWatch}>{t('news.watchAdd')}</Button>
        </div>

        {suggestions.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs text-muted">{t('news.watchSuggest')}</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map(k => {
                const on = watch.some(w => w.toLowerCase() === k)
                return (
                  <button
                    key={k}
                    onClick={() => toggleWatch(k)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-all',
                      on ? 'bg-accent/20 border-accent/50 text-accent' : 'border-border text-muted hover:border-accent/40 hover:text-foreground',
                    )}
                  >
                    {k}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
