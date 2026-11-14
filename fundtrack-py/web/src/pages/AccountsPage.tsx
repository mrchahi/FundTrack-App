import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../api'
import { useApp } from '../store'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, PageHeader, Separator, Skeleton, Switch } from '../components/ui'
import { useToast } from '../components/Toast'
import { useT } from '../lib/i18n'
import { faNum, fmtUSD } from '../lib/format'
import { jalaliDate } from '../lib/jalali'
import type { Account, Stats } from '../types'

export function AccountsPage() {
  const { accounts, updateAccount, refreshAccounts, settings } = useApp()
  const t = useT(settings.lang)
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)
  const [stats, setStats] = useState<Record<number, Stats | null>>({})
  const [fetching, setFetching] = useState(false)

  const doSync = async () => {
    setSyncing(true)
    try {
      const r = await api.sync()
      await refreshAccounts()
      toast.push('success', r.events > 0 ? t.fmt('ac.newEvents', r.events) : t('ac.noEvents'))
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('common.error'))
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    let alive = true
    setFetching(true)
    void (async () => {
      const map: Record<number, Stats | null> = {}
      for (const a of accounts) {
        if (!alive) break
        try {
          const s = await api.summary({ range: 'all', login: a.login })
          map[a.login] = s.stats
        } catch {
          map[a.login] = null
        }
      }
      if (alive) { setStats(map); setFetching(false) }
    })()
    return () => { alive = false }
  }, [accounts])

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('ac.title')}
        subtitle={t('ac.sub')}
        actions={
          <Button variant="outline" size="sm" loading={syncing} onClick={doSync}>
            <RefreshCw className="h-3.5 w-3.5" /> {t('ac.sync')}
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <Card><CardContent><div className="py-10 text-center text-sm text-muted">{t('ac.empty')}</div></CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map(a => <AccountCard key={a.login} account={a} stats={stats[a.login]} loadingStats={fetching} onSave={updateAccount} t={t} />)}
        </div>
      )}
    </div>
  )
}

function AccountCard({ account, stats, loadingStats, onSave, t }: {
  account: Account
  stats?: Stats | null
  loadingStats: boolean
  onSave: (login: number, patch: Partial<Account>) => Promise<void>
  t: ReturnType<typeof useT>
}) {
  const [rate, setRate] = useState(String(account.usd_toman || ''))
  const [note, setNote] = useState(account.note)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const save = async () => {
    setSaving(true)
    try {
      await onSave(account.login, { usd_toman: Number(rate) || 0, note })
      toast.push('success', t('ac.saved'))
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={account.archived ? 'opacity-60' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="number">{account.login}</span>
            {account.archived && <Badge tone="warn">{t('ac.archived')}</Badge>}
            {account.currency && <Badge tone="outline">{account.currency}</Badge>}
          </CardTitle>
          <Switch checked={!!account.archived} onChange={v => onSave(account.login, { archived: v ? 1 : 0 })} label={t('ac.archived')} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs text-muted">
          <div className="rounded-lg bg-surface px-3 py-2"><span className="block text-[10px]">{t('ac.name')}</span><span className="text-foreground">{account.name || '—'}</span></div>
          <div className="rounded-lg bg-surface px-3 py-2"><span className="block text-[10px]">{t('ac.server')}</span><span className="text-foreground">{account.server || '—'}</span></div>
          <div className="rounded-lg bg-surface px-3 py-2"><span className="block text-[10px]">{t('ac.first')}</span><span className="text-foreground number">{account.first_seen ? jalaliDate(new Date(account.first_seen * 1000).toISOString()) : '—'}</span></div>
          <div className="rounded-lg bg-surface px-3 py-2"><span className="block text-[10px]">{t('ac.last')}</span><span className="text-foreground number">{account.last_seen ? jalaliDate(new Date(account.last_seen * 1000).toISOString()) : '—'}</span></div>
        </div>

        <Separator />

        <div className="flex items-center justify-between text-xs text-muted">
          <span>{t('ac.perf')}</span>
          {loadingStats && !stats ? <Skeleton className="h-4 w-24" /> : stats ? (
            <span className="flex gap-3">
              <span>{faNum(stats.trades)}</span>
              <span className={`number font-bold ${stats.net >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtUSD(stats.net)}</span>
            </span>
          ) : <span>—</span>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">{t('ac.rate')}</label>
            <Input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="60000" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{t('ac.note')}</label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="—" />
          </div>
        </div>

        <Button size="sm" variant="secondary" onClick={save} loading={saving}>
          {t('ac.save')}
        </Button>
      </CardContent>
    </Card>
  )
}
