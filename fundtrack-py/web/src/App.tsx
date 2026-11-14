import React, { useEffect, useRef, useState } from 'react'
import { Activity, BarChart3, BookOpenText, Database, LayoutDashboard, LockOpen, Newspaper, PanelLeftClose, PanelLeftOpen, Settings, Trophy, UserCircle2, Wallet } from 'lucide-react'
import { DashboardPage } from './pages/DashboardPage'
import { TopBar } from './components/TopBar'
import { SidebarAccount } from './components/SidebarExtras'
import { JournalPage } from './pages/JournalPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AccountsPage } from './pages/AccountsPage'
import { AccountingPage } from './pages/AccountingPage'
import { MissionsPage } from './pages/MissionsPage'
import { NewsPage } from './pages/NewsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatusPage } from './pages/StatusPage'
import { Button, Card, CardContent, Input, cn } from './components/ui'
import { useToast } from './components/Toast'
import { useApp } from './store'
import { useT } from './lib/i18n'
import { faNum } from './lib/format'
import { checkNav } from './lib/navGuard'
import type { PageKey } from './types'

const NAV: { key: PageKey; labelKey: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'journal', labelKey: 'nav.journal', icon: <BookOpenText className="h-4 w-4" /> },
  { key: 'analytics', labelKey: 'nav.analytics', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'accounting', labelKey: 'nav.accounting', icon: <Wallet className="h-4 w-4" /> },
  { key: 'missions', labelKey: 'nav.missions', icon: <Trophy className="h-4 w-4" /> },
  { key: 'news', labelKey: 'nav.news', icon: <Newspaper className="h-4 w-4" /> },
  { key: 'settings', labelKey: 'nav.settings', icon: <Settings className="h-4 w-4" /> },
  { key: 'status', labelKey: 'nav.status', icon: <Database className="h-4 w-4" /> },
]

export function App() {
  const [page, setPage] = useState<PageKey>('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const { locked, settings, lock, accounts } = useApp()
  const t = useT(settings.lang)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.page && checkNav(detail.page as string)) setPage(detail.page as PageKey)
    }
    window.addEventListener('fundtrack:navigate', handler)
    return () => window.removeEventListener('fundtrack:navigate', handler)
  }, [])

  // هنگام تغییر صفحه، اسکرول را به بالا برگردان
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [page])

  const themeBG: Record<string, string> = {
    obsidian: 'bg-gradient-to-br from-[#070b12] via-[#0b1320] to-[#040810]',
    aurora: 'bg-gradient-to-br from-[#031412] via-[#081a20] to-[#020b10]',
    midnight: 'bg-gradient-to-br from-[#080b1e] via-[#0c1228] to-[#050614]',
    'frosted-light': 'bg-gradient-to-br from-slate-100 via-slate-200 to-emerald-50/50 text-slate-900',
    cyberpunk: 'bg-gradient-to-br from-[#0a0514] via-[#150b2e] to-[#04020a]',
  }
  const orb1Map: Record<string, string> = {
    obsidian: 'from-emerald-500/15 via-teal-500/10 to-transparent',
    aurora: 'from-emerald-400/25 via-cyan-500/15 to-transparent',
    midnight: 'from-indigo-500/20 via-violet-500/15 to-transparent',
    'frosted-light': 'from-emerald-400/30 via-teal-300/20 to-transparent',
    cyberpunk: 'from-fuchsia-500/25 via-pink-500/15 to-transparent',
  }
  const orb2Map: Record<string, string> = {
    obsidian: 'from-cyan-500/15 via-blue-500/10 to-transparent',
    aurora: 'from-cyan-400/20 via-emerald-500/15 to-transparent',
    midnight: 'from-violet-500/20 via-fuchsia-500/15 to-transparent',
    'frosted-light': 'from-cyan-400/25 via-sky-300/20 to-transparent',
    cyberpunk: 'from-cyan-400/20 via-blue-500/10 to-transparent',
  }
  const themeBackground = themeBG[settings.theme] || 'bg-slate-950'
  const orb1 = orb1Map[settings.theme]
  const orb2 = orb2Map[settings.theme]

  return (
    <div className={`relative flex h-screen overflow-hidden ${themeBackground}`}>
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'var(--bg-image, none)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(var(--bg-blur, 0px)) brightness(var(--bg-brightness, 1))',
          }}
        />
        <div className={`absolute -left-32 -top-32 h-[600px] w-[600px] rounded-full bg-gradient-to-br ${orb1} blur-[120px] animate-float-slow`} />
        <div className={`absolute -right-32 top-1/3 h-[650px] w-[650px] rounded-full bg-gradient-to-tl ${orb2} blur-[140px] animate-float-reverse`} />
      </div>

      <div className="relative z-10 flex h-full w-full">
      <aside className={cn('glass-surface flex shrink-0 flex-col border-e border-border transition-all', collapsed ? 'w-[68px]' : 'w-56')}>
        <div className="flex items-center gap-2 px-3 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Activity className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold">FundTrack</div>
              <div className="text-[10px] text-muted">{t('app.tagline')}</div>
            </div>
          )}
        </div>

        {!collapsed && <SidebarAccount />}

        <nav className="flex-1 space-y-1 px-3 pt-4">
          {NAV.map(item => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              title={collapsed ? t(item.labelKey) : undefined}
              className={cn(
                'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                collapsed && 'justify-center px-0',
                page === item.key
                  ? 'bg-gradient-to-r from-accent/25 to-accent/10 text-foreground border border-accent/40 shadow-[0_4px_16px] shadow-accent/20 font-semibold'
                  : 'text-muted hover:bg-accent/10 hover:text-accent border border-transparent',
              )}
            >
              <span className={cn('icon-glow', page === item.key && 'is-active')}>{item.icon}</span>
              {!collapsed && t(item.labelKey)}
              {!collapsed && item.key === 'accounts' && accounts.filter(a => !a.archived).length > 1 && (
                <span className="ml-auto rounded-md bg-accent/10 border border-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  {faNum(accounts.filter(a => !a.archived).length, 0)}
                </span>
              )}
              {page === item.key && !collapsed && (
                <div className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-accent shadow-[0_0_8px] shadow-accent/80" />
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-1 px-3 py-4">
          {!collapsed && <div className="w-full px-2 pb-1 text-[10px] text-muted">نسخه ۰٫۳٫۰ — بک‌اند پایتون</div>}
          <Button
            variant="ghost"
            size="icon"
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            onClick={() => setCollapsed(v => !v)}
            className={cn('h-9 w-9', !collapsed && 'ms-auto')}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-surface relative z-40 flex items-center border-x-0 border-t-0 px-4 py-2.5 lg:px-8">
          <TopBar tab={page} />
        </header>
        <main ref={mainRef} className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto p-4 lg:p-8">
          {page === 'dashboard' && <DashboardPage />}
          {page === 'journal' && <JournalPage />}
          {page === 'analytics' && <AnalyticsPage />}
          {page === 'accounts' && <AccountsPage />}
          {page === 'accounting' && <AccountingPage />}
          {page === 'missions' && <MissionsPage />}
          {page === 'news' && <NewsPage />}
          {page === 'settings' && <SettingsPage />}
          {page === 'status' && <StatusPage />}
        </main>
      </div>
      </div>

      {locked && <LockScreen />}
    </div>
  )
}

function LockScreen() {
  const { unlock, settings } = useApp()
  const toast = useToast()
  const t = useT(settings.lang)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!pin) return
    setBusy(true)
    const ok = await unlock(pin)
    setBusy(false)
    if (!ok) {
      setPin('')
      toast.push('error', t('lock.wrong'))
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <Card className="w-80">
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <LockOpen className="h-6 w-6" />
            </div>
            <div className="text-base font-bold">{t('lock.title')}</div>
            <div className="text-xs text-muted">{t('lock.sub')}</div>
          </div>
          <Input
            type="password"
            dir="ltr"
            autoFocus
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder={t('s.pin')}
            className="mb-3 text-center"
          />
          <Button className="w-full" onClick={submit} loading={busy}>
            {t('lock.enter')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
