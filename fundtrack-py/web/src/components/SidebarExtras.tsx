import React from 'react'
import { Star } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { useT } from '../lib/i18n'
import { Select } from './ui'
import { faNum, fmtMoney } from '../lib/format'

export function SidebarAccount() {
  const { accounts, activeLogin, setActiveLogin, activeAccount, settings } = useApp()
  const t = useT(settings.lang)
  const eq = useAsync(() => api.equity(activeLogin ?? undefined), [activeLogin])
  const last = eq.data && eq.data.length ? eq.data[eq.data.length - 1] : null
  const balance = last ? fmtMoney(last.balance, settings, activeAccount)[0] : null

  return (
    <div className="px-4 py-3">
      <div className="glass-surface-subtle rounded-xl p-3">
        <label className="mb-1.5 block text-[11px] font-medium text-muted">{t('nav.accounts')}</label>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Select
              value={activeLogin?.toString() ?? ''}
              onChange={e => setActiveLogin(e.target.value ? Number(e.target.value) : null)}
              className="w-full"
              title={t('nav.accounts')}
            >
              <option value="">{t('d.allAccounts')}</option>
              {accounts.filter(a => !a.archived).map(a => (
                <option key={a.login} value={a.login}>{a.name || a.login}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
          <span className="text-[11px] font-medium text-muted">{t('bank.balance')}</span>
          <span className="number text-[11px] font-semibold text-accent">
            {balance ?? '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

const THRESHOLDS = [100, 300, 600, 1000]

export function SidebarLevel() {
  const { settings, activeLogin } = useApp()
  const t = useT(settings.lang)
  const mis = useAsync(() => api.missionsDaily(activeLogin ?? undefined), [activeLogin])
  const tl = mis.data?.totals
  if (!tl) return null

  const next = THRESHOLDS.find(x => tl.total_stars < x) ?? THRESHOLDS[THRESHOLDS.length - 1]
  const prev = THRESHOLDS.filter(x => x <= tl.total_stars).pop() ?? 0
  const pct = next > prev ? Math.min(100, ((tl.total_stars - prev) / (next - prev)) * 100) : 100

  return (
    <div className="border-t border-border p-4">
      <div className="rounded-xl border border-border bg-gradient-to-br from-white/10 to-white/5 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
              <Star className="h-3.5 w-3.5 fill-amber-400" />
            </div>
            <span className="text-xs font-bold text-foreground">{tl.level_name}</span>
          </div>
          <span className="text-[11px] font-medium text-amber-400">{faNum(tl.today_stars)}★ {t('m.today')}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/30 border border-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{t('m.totalStars')}: {faNum(tl.total_stars)}</p>
      </div>
    </div>
  )
}
