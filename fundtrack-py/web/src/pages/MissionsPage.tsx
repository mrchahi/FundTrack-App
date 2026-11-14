import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Crown, Flag, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { useToast } from '../components/Toast'
import { useT } from '../lib/i18n'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, PageHeader, Progress, Select, Skeleton, Switch, Tabs } from '../components/ui'
import { faNum } from '../lib/format'
import { jalaliDate } from '../lib/jalali'

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 880
    g.gain.setValueAtTime(0.06, ctx.currentTime)
    o.start(); o.stop(ctx.currentTime + 0.3)
  } catch { /* ignore */ }
}
import type { CustomMission, DailyMission, MissionMetric, MissionSource, MissionsDaily } from '../types'
import { GoalsPage } from './GoalsPage'

export function MissionsPage() {
  const { settings, activeLogin } = useApp()
  const t = useT(settings.lang)
  const [tab, setTab] = useState('daily')
  const daily = useAsync(() => api.missionsDaily(activeLogin ?? undefined), [activeLogin])
  const prevBadges = useRef<string[] | null>(null)
  const initBadges = useRef(false)
  const [celebrate, setCelebrate] = useState<{ key: string; title: string } | null>(null)

  useEffect(() => {
    if (!daily.data) return
    const badges = daily.data.totals?.badges ?? []
    const keys = badges.map(b => b.key)
    // فقط بعد از اولین بارگذاری واقعی، مقایسه کنیم (تا مودال در ورود هر بار ظاهر نشود)
    if (!initBadges.current) {
      initBadges.current = true
      prevBadges.current = keys
      return
    }
    if (prevBadges.current && keys.length > prevBadges.current.length) {
      const fresh = keys.filter(k => !prevBadges.current!.includes(k))
      if (fresh.length) {
        const b = badges.find(x => x.key === fresh[0])
        if (b) {
          setCelebrate({ key: b.key, title: t('badge.' + b.key) })
          beep()
        }
      }
    }
    prevBadges.current = keys
  }, [daily.data])

  return (
    <div className="space-y-5">
      <PageHeader title={t('nav.missions')} subtitle={t('m.sub')} />
      <Hero data={daily.data} t={t} />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'daily', label: t('m.title') },
          { value: 'goals', label: t('nav.goals') },
          { value: 'badges', label: t('m.badges') },
        ]}
      />
      {tab === 'daily' && <DailyTab data={daily.data} t={t} onChanged={() => daily.refetch()} />}
      {tab === 'goals' && <GoalsPage />}
      {tab === 'badges' && <BadgesTab totals={daily.data?.totals ?? null} t={t} />}

      {celebrate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="w-80">
            <CardContent className="pt-6 text-center">
              <div className="text-4xl">🎉</div>
              <div className="mt-2 text-lg font-extrabold">{t('m.badges')}</div>
              <Badge tone="accent" className="mt-2">{celebrate.title}</Badge>
              <p className="mt-2 text-xs text-muted">+{faNum(celebrate.key === 'tier1' ? 100 : celebrate.key === 'tier2' ? 300 : celebrate.key === 'tier3' ? 600 : 1000)} {t('m.stars')}</p>
              <Button className="mt-4 w-full" onClick={() => setCelebrate(null)}>
                <X className="h-4 w-4" /> {t('g.cancel')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- hero */

function Hero({ data, t }: { data: MissionsDaily | null; t: (k: string) => string }) {
  if (!data) return <Skeleton className="h-40" />
  const tl = data.totals
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-xs text-muted">{t('m.level')}</div>
            <div className="flex items-center gap-2 text-2xl font-extrabold">
              <Crown className="h-6 w-6 text-warn" /> {tl.level_name}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tl.badges.length > 0 ? tl.badges.map(b => (
                <Badge key={b.key} tone="accent">{t('badge.' + b.key)}</Badge>
              )) : <span className="text-[11px] text-muted">{t('m.noBadges')}</span>}
            </div>
          </div>
          <div className="space-y-4 md:col-span-2">
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-warn text-warn" /> {t('m.day')}</span>
                <span className="number">{faNum(tl.today_done)} / {faNum(tl.today_total)}</span>
              </div>
              <Progress value={tl.today_total ? (tl.today_done / tl.today_total) * 100 : 0} className="h-9" />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-warn text-warn" /> {t('m.week')}</span>
                <span className="number">{faNum(tl.week_stars)} / {faNum(tl.week_goal)}</span>
              </div>
              <Progress value={tl.week_goal ? (tl.week_stars / tl.week_goal) * 100 : 0} className="h-9" />
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-muted">
                <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-warn text-warn" /> {t('m.month')}</span>
                <span className="number">{faNum(tl.month_stars)} / {faNum(tl.month_goal)}</span>
              </div>
              <Progress value={tl.month_goal ? (tl.month_stars / tl.month_goal) * 100 : 0} className="h-9" />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>{t('m.todayStars')}: <b className="number">{faNum(tl.today_stars)}</b></span>
              <span>{t('m.totalStars')}: <b className="number">{faNum(tl.total_stars)}</b></span>
              <span>{t('m.dailyXp')}: <b className="number">{faNum(tl.today_done)}/{faNum(tl.today_total)}</b></span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------- daily missions */

function DailyTab({ data, t, onChanged }: { data: MissionsDaily | null; t: (k: string) => string; onChanged?: () => void }) {
  const toast = useToast()
  const [editing, setEditing] = useState<string | null>(null)
  const [overrideForm, setOverrideForm] = useState<{ enabled: boolean; target: string; stars: string } | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) return <Skeleton className="h-72" />

  const startEdit = (m: DailyMission) => {
    setEditing(m.key)
    setOverrideForm({ enabled: true, target: String(m.target), stars: String(m.stars) })
  }
  const saveOverride = async () => {
    if (!editing || !overrideForm) return
    setBusy(true)
    try {
      await api.putDailyMissionOverride(editing, {
        enabled: overrideForm.enabled,
        target: Number(overrideForm.target) || 1,
        stars: Number(overrideForm.stars) || 1,
      })
      toast.push('success', t('cm.saved'))
      setEditing(null); setOverrideForm(null)
      onChanged?.()
    } catch {
      toast.push('error', t('common.error'))
    } finally { setBusy(false) }
  }
  const deleteOverride = async (key: string) => {
    try {
      await api.putDailyMissionOverride(key, { enabled: false })
      toast.push('success', t('cm.deleted'))
      onChanged?.()
    } catch { toast.push('error', t('common.error')) }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {data.missions.map(m => (
          <MissionCard key={m.key} m={m} t={t} onEdit={() => startEdit(m)} onDelete={() => deleteOverride(m.key)} />
        ))}
      </div>

      {editing && overrideForm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm">
            <CardHeader><CardTitle className="text-sm">{t('cm.editTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{t('cm.active')}</span>
                <Switch checked={overrideForm.enabled} onChange={v => setOverrideForm(f => ({ ...f!, enabled: v }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{t('cm.target')}</label>
                <Input dir="ltr" type="number" value={overrideForm.target} onChange={e => setOverrideForm(f => ({ ...f!, target: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">{t('cm.stars')}</label>
                <Input dir="ltr" type="number" value={overrideForm.stars} onChange={e => setOverrideForm(f => ({ ...f!, stars: e.target.value }))} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveOverride} loading={busy}>{t('cm.save')}</Button>
                <Button variant="ghost" onClick={() => { setEditing(null); setOverrideForm(null) }}>{t('g.cancel')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function MissionCard({ m, t, onEdit, onDelete }: {
  m: DailyMission; t: (k: string) => string; onEdit?: () => void; onDelete?: () => void
}) {
  const tone: Record<string, 'positive' | 'warn' | 'neutral'> = {
    done: 'positive', active: 'warn', todo: 'neutral',
  }
  const title = m.title || t('m.key.' + m.key)
  const isCustom = m.key.startsWith('custom_') || m.key.startsWith('goal_')
  const desc = m.desc || (isCustom ? '' : t('m.desc.' + m.key))
  return (
    <Card className={`relative overflow-hidden ${m.done ? 'mission-flash' : ''}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {m.done && <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />}
              <span className="truncate">{title}</span>
            </div>
            {desc && <div className="mt-0.5 text-xs text-muted">{desc}</div>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" title={t('g.edit')} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" title={t('g.delete')} onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-negative" /></Button>
            <Badge tone={tone[m.state]}>{t('m.state.' + m.state)}</Badge>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Progress value={m.progress} className="flex-1" />
          <span className="number text-xs text-muted">{m.current != null ? faNum(m.current, 1) : '—'} / {faNum(m.target)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] text-warn">
            <Star className="h-3.5 w-3.5 fill-warn text-warn" /> {faNum(m.stars)} {t('m.stars')}
          </span>
          {m.done && <span className="text-xs font-semibold text-positive">{t('m.state.done')}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------- badges */

function BadgesTab({ totals, t }: { totals: MissionsDaily['totals'] | null; t: (k: string) => string }) {
  const tiers = [
    { key: 'tier1', threshold: 100 },
    { key: 'tier2', threshold: 300 },
    { key: 'tier3', threshold: 600 },
    { key: 'tier4', threshold: 1000 },
  ]
  if (!totals) return <Skeleton className="h-40" />
  const earnedMap = new Map(totals.badges.map(b => [b.key, b]))
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiers.map(ti => {
        const e = earnedMap.get(ti.key)
        return (
          <Card key={ti.key}>
            <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
              <span className={`text-3xl ${e ? '' : 'opacity-30 grayscale'}`}>🏅</span>
              <Badge tone={e ? 'accent' : 'neutral'}>{t('badge.' + ti.key)}</Badge>
              {e ? (
                <span className="text-[11px] font-semibold text-positive">
                  ✓ {jalaliDate(new Date(e.earned_at * 1000).toISOString())}
                </span>
              ) : (
                <span className="text-[11px] text-muted">{faNum(ti.threshold - totals.total_stars)} {t('m.stars')} مانده</span>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- custom missions */

function CustomTab({ t }: { t: (k: string) => string }) {
  const toast = useToast()
  const { data, loading, refetch } = useAsync(() => api.customMissions(), [])
  const goals = useAsync(() => api.goals(), [])
  const expenses = useAsync(() => api.expenses(), [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CustomMission | null>(null)
  const [form, setForm] = useState({
    title: '', source: 'manual' as MissionSource, ref_id: '', metric: 'earn' as MissionMetric,
    target: '', xp: '10', stars: '10',
  })
  const [saving, setSaving] = useState(false)

  const startAdd = () => {
    setEditing(null)
    setForm({ title: '', source: 'manual', ref_id: '', metric: 'earn', target: '', xp: '10', stars: '10' })
    setOpen(true)
  }
  const startEdit = (m: CustomMission) => {
    setEditing(m)
    setForm({
      title: m.title, source: m.source, ref_id: m.ref_id ? String(m.ref_id) : '',
      metric: m.metric, target: String(m.target), xp: String(m.xp), stars: String(m.stars),
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.target || Number(form.target) <= 0) return
    if (!form.title && form.source === 'manual') return
    setSaving(true)
    const body: Partial<CustomMission> = {
      title: form.title || '',
      source: form.source,
      ref_id: form.source === 'manual' ? null : (form.ref_id ? Number(form.ref_id) : null),
      metric: form.metric,
      target: Number(form.target),
      xp: Number(form.xp || 10),
      stars: Number(form.stars || 10),
    }
    try {
      if (editing) await api.patchCustomMission(editing.id, body)
      else await api.createCustomMission(body)
      toast.push('success', t('common.edited'))
      setOpen(false)
      await refetch()
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (m: CustomMission) => {
    if (!window.confirm(t('cm.confirmDelete'))) return
    try { await api.deleteCustomMission(m.id); await refetch() } catch { toast.push('error', t('common.error')) }
  }

  const toggleActive = async (m: CustomMission) => {
    try {
      await api.patchCustomMission(m.id, { active: m.active ? 0 : 1 })
      await refetch()
    } catch { toast.push('error', t('common.error')) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={startAdd}><Plus className="h-3.5 w-3.5" /> {t('cm.add')}</Button>
      </div>

      {open && (
        <Card>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('cm.source')}>
                <Select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as MissionSource }))} className="w-full">
                  <option value="manual">{t('cm.source.manual')}</option>
                  <option value="goal">{t('cm.source.goal')}</option>
                  <option value="expense">{t('cm.source.expense')}</option>
                </Select>
              </Field>
              {form.source !== 'manual' && (
                <Field label={form.source === 'goal' ? t('cm.goal') : t('cm.expense')}>
                  <Select value={form.ref_id} onChange={e => setForm(f => ({ ...f, ref_id: e.target.value }))} className="w-full">
                    <option value="">—</option>
                    {(form.source === 'goal' ? goals.data ?? [] : expenses.data ?? []).map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={t('cm.metric')}>
                <Select value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value as MissionMetric }))} className="w-full">
                  <option value="earn">{t('cm.metric.earn')}</option>
                  <option value="limit">{t('cm.metric.limit')}</option>
                </Select>
              </Field>
              <Field label={t('cm.target')}>
                <Input type="number" dir="ltr" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} />
              </Field>
              <Field label={t('cm.stars')}>
                <Input type="number" dir="ltr" value={form.stars} onChange={e => setForm(f => ({ ...f, stars: e.target.value }))} />
              </Field>
              <Field label={t('cm.xp')}>
                <Input type="number" dir="ltr" value={form.xp} onChange={e => setForm(f => ({ ...f, xp: e.target.value }))} />
              </Field>
              <Field label={t('cm.name')}>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={form.source !== 'manual' ? t('cm.title') : ''} />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={save} loading={saving}>{t('acct.save')}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t('g.cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !data ? <Skeleton className="h-40" /> : !data || data.length === 0 ? (
        <Card><CardContent><EmptyState title={t('cm.empty')} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map(m => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Badge tone="accent">{t('cm.source.' + m.source)}</Badge>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{m.title}</div>
                  <div className="text-[11px] text-muted">{t('cm.metric.' + m.metric)} — {t('cm.target')}: {faNum(m.target)} · +{faNum(m.stars)} ⭐</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={!!m.active} onChange={() => toggleActive(m)} label={m.active ? t('cm.active') : ''} />
                <Button variant="ghost" size="icon" title={t('g.edit')} onClick={() => startEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" title={t('cm.confirmDelete')} onClick={() => remove(m)}><Trash2 className="h-3.5 w-3.5 text-negative" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
