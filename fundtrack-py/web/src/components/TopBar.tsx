import React, { useState } from 'react'
import { Crown, Globe, Lock, Moon, RefreshCw, Star, Sun } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { useToast } from './Toast'
import { useT } from '../lib/i18n'
import { NotificationBell } from './NotificationBell'
import { Button } from './ui'
import { faNum } from '../lib/format'
import type { PageKey } from '../types'

const TITLE_KEYS: Record<PageKey, string> = {
  dashboard: 'nav.dashboard',
  journal: 'nav.journal',
  analytics: 'nav.analytics',
  accounts: 'nav.accounts',
  goals: 'nav.goals',
  accounting: 'nav.accounting',
  missions: 'nav.missions',
  news: 'nav.news',
  settings: 'nav.settings',
  status: 'nav.status',
}

export function TopBar({ tab }: { tab: PageKey }) {
  const { settings, updateSettings, lock } = useApp()
  const t = useT(settings.lang)
  const toast = useToast()
  const status = useAsync(() => api.status(), [])
  const [syncing, setSyncing] = useState(false)
  const connected = status.data?.events_file_exists

  const sync = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const r = await api.sync()
      if (r.events && r.events > 0) toast.push('success', t.fmt('gami.syncedAdded', r.events))
      else toast.push('success', t('gami.syncedNone'))
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex w-full items-center justify-between gap-4">
      {/* Zone 1: breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-xs md:text-sm">
        <span className="font-semibold text-muted">FundTrack</span>
        <span className="text-muted">/</span>
        <h1 className="truncate font-bold text-foreground">{t(TITLE_KEYS[tab])}</h1>
      </div>

      {/* Zone 2: MT5 live sync indicator */}
      <div className="hidden md:flex items-center gap-3 rounded-full px-3.5 py-1.5 glass-surface-subtle">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${connected ? 'bg-emerald-400' : 'bg-negative'}`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-negative'}`} />
        </span>
        <span className="text-xs font-medium text-muted">
          {connected ? t('gami.connected') : t('gami.disconnected')}
        </span>
        <Button variant="ghost" size="sm" onClick={sync} disabled={syncing} className="gap-1.5 text-xs" title={t('gami.syncHint')}>
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-[spin_1s_linear_infinite]' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Zone 3: actions */}
      <div className="flex items-center gap-2">
        <HeaderLevel />
        <Button variant="outline" size="icon" className="group" title={t('s.lang')} onClick={() => updateSettings({ lang: settings.lang === 'fa' ? 'en' : 'fa' })}>
          <span className="icon-glow"><Globe className="h-4 w-4" /></span>
        </Button>
        <Button variant="outline" size="icon" className="group" title={t('s.theme')} onClick={() => updateSettings({ theme: settings.theme === 'frosted-light' ? 'obsidian' : 'frosted-light' })}>
          <span className="icon-glow">{settings.theme === 'frosted-light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</span>
        </Button>
        <Button variant="outline" size="icon" className="group" title={t('nav.lock')} onClick={lock}>
          <span className="icon-glow"><Lock className="h-4 w-4" /></span>
        </Button>
        <NotificationBell />
      </div>
    </div>
  )
}

function HeaderLevel() {
  const { settings, activeLogin } = useApp()
  const t = useT(settings.lang)
  const mis = useAsync(() => api.missionsDaily(activeLogin ?? undefined), [activeLogin])
  const tl = mis.data?.totals
  if (!tl) return null
  return (
    <div className="hidden sm:flex h-9 items-center gap-2 rounded-full px-3 glass-surface-subtle" title={t('m.totalStars')}>
      <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
        <Crown className="h-3.5 w-3.5 text-warn" /> {tl.level_name}
      </span>
      <span className="h-3 w-px bg-border" />
      <span className="flex items-center gap-1 text-[11px] text-amber-400">
        <Star className="h-3 w-3 fill-amber-400" /> {faNum(tl.total_stars)}
      </span>
    </div>
  )
}
