import React from 'react'
import { useApp } from '../store'
import { useT } from '../lib/i18n'
import { Select } from './ui'
import type { RangeKey } from '../types'

export function RangeSelect({ value, onChange, className }: {
  value: RangeKey
  onChange: (v: RangeKey) => void
  className?: string
}) {
  const { settings } = useApp()
  const t = useT(settings.lang)
  const opts: { value: RangeKey; label: string }[] = [
    { value: 'day', label: t('f.day') },
    { value: 'week', label: t('f.week') },
    { value: 'month', label: t('f.month') },
    { value: 'year', label: t('f.year') },
    { value: 'all', label: t('f.all') },
  ]
  return (
    <Select value={value} onChange={e => onChange(e.target.value as RangeKey)} className={className} title={t('f.all')}>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  )
}
