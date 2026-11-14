import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, CheckCircle2, Flag, Pencil, Play, Plus, Trash2, TrendingUp } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { useToast } from '../components/Toast'
import { useT } from '../lib/i18n'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, PageHeader, Progress, Select, Skeleton } from '../components/ui'
import { JalaliCalendarPicker } from '../components/JalaliCalendarPicker'
import { faNum, fmtUSD, pct } from '../lib/format'

/** Format digits with thousands separators for display (en-grouping). */
function groupThousands(digits: string): string {
  const clean = digits.replace(/[^\d]/g, '')
  if (!clean) return ''
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
import { jalaliDate, jalaliDateSep } from '../lib/jalali'
import type { Goal, GoalKind, GoalPlan } from '../types'

const EMPTY = {
  name: '',
  kind: 'item' as GoalKind,
  item_name: '',
  currency: 'IRT' as 'USD' | 'IRT',
  target_amount: '',
  saved_amount: '',
  monthly_income: '',
  start_date: '',
  target_date: '',
  note: '',
  budget_category: '',
  priority: '1',
  allocation_pct: '',
}

// Draft fields required purely for live plan display; defaults drive suggestions.
const DRAFT_DEFAULTS = { saved_amount: 0, monthly_income: 0 }

const MONTH = 30.44
function monthsBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0
  return Math.max(0, (b.getTime() - a.getTime()) / (86400000 * MONTH))
}
function addMonths(d: Date, n: number): Date {
  const y = d.getFullYear() + Math.floor((d.getMonth() + n) / 12)
  const m = (((d.getMonth() + n) % 12) + 12) % 12
  return new Date(y, m, Math.min(d.getDate(), new Date(y, m + 1, 0).getDate()))
}

function livePlan(p: { target_amount: number; saved_amount: number; monthly_income: number; start_date?: string; target_date?: string }) {
  const today = new Date()
  const target = p.target_amount
  const saved = p.saved_amount
  const monthly = p.monthly_income
  const remaining = Math.max(0, target - saved)
  const targetDate = p.target_date ? new Date(p.target_date + 'T00:00:00') : null
  const monthsToTarget = monthsBetween(today, targetDate)

  // auto-suggest a monthly saving: based on remaining time to target,
  // else a 12-month horizon, else 10% of target per month.
  const suggestedMonthly =
    monthsToTarget > 0 && remaining > 0 ? remaining / monthsToTarget
    : remaining > 0 ? remaining / 12
    : 0
  const effectiveMonthly = monthly > 0 ? monthly : suggestedMonthly
  const monthsByIncome = effectiveMonthly > 0 && remaining > 0 ? Math.ceil(remaining / effectiveMonthly) : null
  const estCompletion = monthsByIncome ? addMonths(today, monthsByIncome) : null

  // encouraging notes (no demoralizing "not feasible")
  const notes: string[] = []
  if (remaining <= 0) notes.push('already_reached')
  if (targetDate && targetDate <= today) notes.push('target_date_past')
  if (target > 0 && monthsToTarget > 0 && monthsToTarget <= 1) notes.push('close_to_target')
  if (target > 0 && monthsToTarget > 12) notes.push('long_horizon')

  const roadmap: { month: number; start_saved: number; end_saved: number; added: number; total_pct: number }[] = []
  if (effectiveMonthly > 0 && remaining > 0) {
    let eq = saved
    for (let i = 1; i <= (monthsByIncome || 1); i++) {
      const end = Math.min(target, eq + effectiveMonthly)
      roadmap.push({ month: i, start_saved: Math.round(eq * 100) / 100, end_saved: Math.round(end * 100) / 100, added: Math.round((end - eq) * 100) / 100, total_pct: target ? Math.round(end / target * 1000) / 10 : 0 })
      eq = end
      if (eq >= target) break
      if (roadmap.length >= 24) break
    }
  }

  return {
    remaining,
    suggestedMonthly,
    effectiveMonthly,
    monthsByIncome,
    estCompletion,
    notes,
    roadmap,
    progressPct: target > 0 ? Math.min(100, Math.max(0, saved / target * 100)) : 0,
  }
}

export function GoalsPage() {
  const { settings, accounts, activeLogin, activeAccount } = useApp()
  const t = useT(settings.lang)
  const toast = useToast()

  const [goals, setGoals] = useState<Goal[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [formStep, setFormStep] = useState<'info' | 'plan'>('info')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try { setGoals(await api.goals()) } catch { /* ignore */ }
  }, [])
  useEffect(() => { void load() }, [load])

  const eq = useAsync(() => api.equity(activeLogin ?? undefined), [activeLogin])
  const budgets = useAsync(() => api.budgets(), [])
  const accountBalance = eq.data && eq.data.length ? eq.data[eq.data.length - 1].balance : 0

  const live = useMemo(() => livePlan({
    target_amount: Number(form.target_amount) || 0,
    saved_amount: Number(form.saved_amount) || accountBalance,
    monthly_income: Number(form.monthly_income) || 0,
    target_date: form.target_date || undefined,
  }), [form.target_amount, form.saved_amount, form.monthly_income, form.target_date, accountBalance])

  const startEdit = (g?: Goal) => {
    if (g) {
      setEditingId(g.id)
      setForm({
        name: g.name,
        kind: g.kind,
        item_name: g.item_name,
        currency: g.currency,
        target_amount: String(g.target_amount),
        saved_amount: String(g.saved_amount),
        monthly_income: String(g.monthly_income),
        start_date: g.start_date ?? '',
        target_date: g.target_date ?? '',
        note: g.note,
        budget_category: g.budget_category ?? '',
        priority: String(g.priority ?? 999),
        allocation_pct: g.allocation_pct != null ? String(g.allocation_pct) : '',
      })
    } else {
      setEditingId(null)
      setForm({ ...EMPTY })
    }
    setFormStep('info')
    setFormOpen(true)
  }

  const formValid = () => {
    const targetAmount = Number(form.target_amount)
    return !!form.name && Number.isFinite(targetAmount) && targetAmount > 0
  }

  const save = async () => {
    const targetAmount = Number(form.target_amount)
    if (!form.name || !Number.isFinite(targetAmount) || targetAmount <= 0) {
      toast.push('error', 'name / target_amount')
      return
    }
    setSaving(true)
    const body = {
      name: form.name,
      kind: form.kind,
      item_name: form.kind === 'item' ? form.item_name : '',
      currency: form.currency,
      target_amount: targetAmount,
      saved_amount: Number(form.saved_amount) || accountBalance,
      monthly_income: Number(form.monthly_income) || 0,
      start_date: form.start_date || null,
      target_date: form.target_date || null,
      note: form.note,
      budget_category: form.budget_category || null,
      priority: Number(form.priority) || 999,
      allocation_pct: Number(form.allocation_pct) || 0,
    }
    try {
      const saved = editingId != null ? await api.patchGoal(editingId, body) : await api.createGoal(body)
      toast.push('success', t('g.saved'))
      setFormOpen(false)
      await load()
      setDetailId(saved.id)
    } catch (e) {
      toast.push('error', e instanceof Error ? e.message : t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (g: Goal) => {
    if (!window.confirm(t('g.confirmDelete'))) return
    try {
      await api.deleteGoal(g.id)
      toast.push('success', t('g.deleted'))
      if (detailId === g.id) setDetailId(null)
      await load()
    } catch {
      toast.push('error', t('common.error'))
    }
  }

  const setStatus = async (g: Goal, status: 'active' | 'archived') => {
    try {
      await api.patchGoal(g.id, { status })
      toast.push('success', status === 'active' ? t('g.activated') : t('g.archivedNow'))
      await load()
    } catch {
      toast.push('error', t('common.error'))
    }
  }

  if (detailId != null) {
    const goal = goals.find(g => g.id === detailId)
    if (goal) {
      return (
        <GoalDetail
          goal={goal}
          t={t}
          onBack={() => setDetailId(null)}
          onEdit={() => startEdit(goal)}
          onDelete={() => remove(goal)}
          onActivate={() => setStatus(goal, 'active')}
          onArchive={() => setStatus(goal, 'archived')}
        />
      )
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('g.title')}
        subtitle={t('g.sub')}
        actions={<Button size="sm" onClick={() => startEdit()}><Plus className="h-3.5 w-3.5" /> {t('g.new')}</Button>}
      />

      {formOpen && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm">
          <Card className="my-auto flex max-h-[90vh] w-full max-w-[34rem] flex-col">
            <CardHeader className="shrink-0">
              <CardTitle className="flex items-center justify-between">
                <span>{editingId != null ? t('g.formEditTitle') : t('g.formTitle')}</span>
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span className={`rounded-full px-2.5 py-1 ${formStep === 'info' ? 'bg-accent/20 text-accent' : 'text-muted'}`}>{t('g.stepInfo')}</span>
                  <span className="text-muted">←</span>
                  <span className={`rounded-full px-2.5 py-1 ${formStep === 'plan' ? 'bg-accent/20 text-accent' : 'text-muted'}`}>{t('g.stepPlan')}</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              {formStep === 'info' ? (
                <>
                  <div className="grid gap-3">
                    <div><label className="mb-1 block text-xs text-muted">{t('g.name')}</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('g.kind')}</label>
                      <Select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as GoalKind }))}>
                        <option value="item">{t('g.kindItem')}</option>
                        <option value="money">{t('g.kindMoney')}</option>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('g.currency')}</label>
                      <Select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as 'USD' | 'IRT' }))}>
                        <option value="USD">{t('s.usd')}</option>
                        <option value="IRT">{t('s.irt')}</option>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('g.targetAmount')} ({form.currency})</label>
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        value={groupThousands(form.target_amount)}
                        onChange={e => setForm(f => ({ ...f, target_amount: e.target.value.replace(/[^\d]/g, '') }))}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('g.targetDate')}</label>
                      <JalaliCalendarPicker value={form.target_date} onChange={iso => setForm(f => ({ ...f, target_date: iso }))} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('g.budgetSource')}</label>
                      <Select value={form.budget_category} onChange={e => setForm(f => ({ ...f, budget_category: e.target.value }))}>
                        <option value="">{t('g.budgetNone')}</option>
                        {(budgets.data ?? []).map(b => (
                          <option key={b.id} value={b.category}>{b.category}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('g.priority')}</label>
                      <Select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                        <option value="1">{t('g.priority1')}</option>
                        <option value="2">{t('g.priority2')}</option>
                        <option value="3">{t('g.priority3')}</option>
                        <option value="4">{t('g.priority4')}</option>
                        <option value="5">{t('g.priority5')}</option>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('g.allocationPct')}</label>
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        value={form.allocation_pct}
                        onChange={e => setForm(f => ({ ...f, allocation_pct: e.target.value.replace(/[^\d]/g, '') }))}
                        placeholder="0-100"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => { if (formValid()) setFormStep('plan') }} disabled={!formValid()}>{t('g.nextPreview')}</Button>
                    <Button variant="ghost" onClick={() => setFormOpen(false)}>{t('g.cancel')}</Button>
                  </div>
                </>
              ) : (
                <>
                  <LivePlan t={t} plan={live} currency={form.currency} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <Button variant="ghost" onClick={() => setFormOpen(false)}>{t('g.cancel')}</Button>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => setFormStep('info')}>{t('g.backToEdit')}</Button>
                      <Button onClick={save} loading={saving}>{t('g.confirmSave')}</Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>,
        document.body
      )}

      {goals.length === 0 && !formOpen ? (
        <Card><CardContent><EmptyState title={t('g.empty')} /></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {goals.map(g => {
            const pctVal = g.target_amount > 0 ? Math.min(100, Math.max(0, (g.saved_amount / g.target_amount) * 100)) : 0
            return (
              <Card key={g.id} className="w-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2"><Flag className="h-4 w-4 text-accent" /> {g.name} <StatusBadge g={g} t={t} /></CardTitle>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title={t('g.edit')} onClick={() => startEdit(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" title={t('g.delete')} onClick={() => remove(g)}><Trash2 className="h-3.5 w-3.5 text-negative" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>{t('g.savedAmount')}: <b className="number text-foreground">{g.currency === 'IRT' ? faNum(g.saved_amount, 0) : fmtUSD(g.saved_amount)}</b> / {g.currency === 'IRT' ? faNum(g.target_amount, 0) : fmtUSD(g.target_amount)} {g.currency === 'IRT' ? 'تومان' : ''}</span>
                    <span className="number">{faNum(pctVal, 1)}٪</span>
                  </div>
                  <Progress value={pctVal} className="h-2.5" />
                  <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setDetailId(g.id)}>
                    <TrendingUp className="h-3.5 w-3.5" /> {t('g.open')}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ g, t }: { g: Goal; t: (k: string) => string }) {
  if (g.status === 'active') return <Badge tone="positive">{t('g.activeBadge')}</Badge>
  if (g.status === 'archived') return <Badge tone="neutral">{t('g.archivedBadge')}</Badge>
  return <Badge tone="warn">{t('g.draftBadge')}</Badge>
}

function LivePlan({ t, plan, currency }: { t: (k: string) => string; plan: ReturnType<typeof livePlan>; currency: 'USD' | 'IRT' }) {
  const fmt = (n: number) => (currency === 'IRT' ? faNum(n, 0) : fmtUSD(n))
  const notes = plan.notes
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="text-sm">{t('g.liveTitle')}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <LiveChip label={t('g.remaining')} value={fmt(plan.remaining)} />
          <LiveChip label={t('g.suggestedMonthly')} value={fmt(plan.suggestedMonthly)} />
          <LiveChip label={t('g.monthsNeeded')} value={plan.monthsByIncome != null ? faNum(plan.monthsByIncome) : '—'} />
          <LiveChip label={t('g.estCompletion')} value={plan.estCompletion ? jalaliDateSep(plan.estCompletion.toISOString()) : '—'} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="positive">{t('g.feasible')}</Badge>
          {plan.roadmap.length > 0 && <Badge tone="accent">{faNum(plan.progressPct, 1)}٪</Badge>}
          {notes.map(x => <Badge key={x} tone="positive">{t('g.n.' + x)}</Badge>)}
        </div>
        {plan.roadmap.length > 0 && (
          <div className="mt-3 overflow-x-auto" dir="ltr">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-right text-muted">
                  <th className="pb-1.5 font-medium">{t('g.col.month')}</th>
                  <th className="pb-1.5 font-medium">{t('g.col.startSaved')}</th>
                  <th className="pb-1.5 font-medium">{t('g.col.endSaved')}</th>
                  <th className="pb-1.5 font-medium">{t('g.col.added')}</th>
                  <th className="pb-1.5 font-medium">{t('g.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.roadmap.slice(0, 12).map(r => (
                  <tr key={r.month} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 text-right font-medium">{faNum(r.month)}</td>
                    <td className="py-1.5 text-right text-muted">{fmt(r.start_saved)}</td>
                    <td className="py-1.5 text-right">{fmt(r.end_saved)}</td>
                    <td className="py-1.5 text-right text-positive">{fmt(r.added)}</td>
                    <td className="py-1.5 text-right text-muted">{pct(r.total_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function LiveChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="number text-sm font-bold text-foreground">{value}</span>
    </div>
  )
}

function CadenceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="mt-1 number text-base font-bold text-foreground">{value}</div>
    </div>
  )
}

function GoalDetail({ goal, t, onBack, onEdit, onDelete, onActivate, onArchive }: {
  goal: Goal
  t: (k: string) => string
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onActivate: () => void
  onArchive: () => void
}) {
  const plan = useAsync(() => api.goalPlan(goal.id), [goal.id])

  return (
    <div className="space-y-5">
      <PageHeader
        title={goal.name}
        subtitle={`${goal.kind === 'item' ? (goal.item_name || t('g.kindItem')) : t('g.kindMoney')} · ${goal.currency} · ${t('g.targetAmount')}: ${goal.currency === 'IRT' ? faNum(goal.target_amount, 0) : fmtUSD(goal.target_amount)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}><ArrowRight className="h-3.5 w-3.5" /> {t('g.back')}</Button>
            {goal.status === 'active' ? (
              <Button variant="outline" size="sm" onClick={onArchive}>{t('g.archivedNow')}</Button>
            ) : (
              <Button size="sm" onClick={onActivate}><Play className="h-3.5 w-3.5" /> {t('g.activate')}</Button>
            )}
            <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> {t('g.edit')}</Button>
            <Button variant="danger" size="sm" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /> {t('g.delete')}</Button>
          </div>
        }
      />

      {goal.status === 'active' && <p className="text-xs text-muted">{t('g.activateHint')}</p>}

      {plan.loading && !plan.data ? <Skeleton className="h-72" /> : plan.data ? (
        <GoalPlanView plan={plan.data} t={t} />
      ) : plan.error ? (
        <Card><CardContent><EmptyState title={t('common.error')} hint={plan.error} /></CardContent></Card>
      ) : null}
    </div>
  )
}

function GoalPlanView({ plan, t }: { plan: GoalPlan; t: (k: string) => string }) {
  const s = plan.suggested
  const st = plan.status
  const fmt = (n: number) => (plan.params.currency === 'IRT' ? faNum(n, 0) : fmtUSD(n))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> {t('g.suggestedTitle')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LiveChip label={t('g.remaining')} value={fmt(s.remaining)} />
            <LiveChip label={t('g.monthsNeeded')} value={s.months_by_income != null ? faNum(s.months_by_income) : '—'} />
            <LiveChip label={t('g.requiredMonthly')} value={s.required_monthly_to_target != null ? fmt(s.required_monthly_to_target) : '—'} />
            <LiveChip label={t('g.requiredWeekly')} value={s.required_weekly != null ? fmt(s.required_weekly) : '—'} />
            <LiveChip label={t('g.estCompletion')} value={s.estimated_completion ? jalaliDateSep(s.estimated_completion) : '—'} />
          </div>

          {/* cadence KPIs: yearly only for long-term goals, else sized to the horizon */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 text-sm font-semibold text-foreground">{t('g.cadenceTitle')}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CadenceCard label={t('g.cadenceDaily')} value={s.required_weekly != null ? fmt(s.required_weekly / 7) : '—'} />
              <CadenceCard label={t('g.cadenceWeekly')} value={s.required_weekly != null ? fmt(s.required_weekly) : '—'} />
              <CadenceCard label={t('g.cadenceMonthly')} value={s.required_monthly_to_target != null ? fmt(s.required_monthly_to_target) : '—'} />
              {s.months_by_income != null && s.months_by_income >= 12 && (
                <CadenceCard label={t('g.cadenceYearly')} value={s.required_monthly_to_target != null ? fmt(s.required_monthly_to_target * 12) : '—'} />
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={s.feasible ? 'positive' : 'negative'}>{s.feasible ? t('g.feasible') : t('g.notFeasible')}</Badge>
            {s.warnings.map(x => <Badge key={x} tone="warn">{t('g.w.' + x)}</Badge>)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('g.roadmapTitle')}</CardTitle></CardHeader>
        <CardContent>
          {plan.roadmap.length === 0 ? <EmptyState title="—" /> : (
            <div className="overflow-x-auto" dir="ltr">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-right text-xs text-muted">
                    <th className="pb-2 font-medium">{t('g.col.month')}</th>
                    <th className="pb-2 font-medium">{t('g.col.startSaved')}</th>
                    <th className="pb-2 font-medium">{t('g.col.endSaved')}</th>
                    <th className="pb-2 font-medium">{t('g.col.added')}</th>
                    <th className="pb-2 font-medium">{t('g.col.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.roadmap.map(r => (
                    <tr key={r.month} className="border-b border-border/40 last:border-0">
                      <td className="py-2 text-right font-medium">{faNum(r.month)}</td>
                      <td className="py-2 text-right text-muted">{fmt(r.start_saved)}</td>
                      <td className="py-2 text-right">{fmt(r.end_saved)}</td>
                      <td className="py-2 text-right text-positive">{fmt(r.added)}</td>
                      <td className="py-2 text-right text-muted">{pct(r.total_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('g.statusTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t('g.currentSaved')}:</span>
            <span className="number font-bold">{fmt(st.current_saved)}</span>
            <Badge tone="accent">{faNum(st.progress_pct, 1)}٪</Badge>
          </div>
          <Progress value={st.progress_pct} />
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <LiveChip label={t('g.remaining')} value={fmt(st.remaining)} />
            <LiveChip label={t('g.elapsed')} value={`${faNum(st.elapsed_months, 1)}`} />
            <LiveChip label={t('g.remainingMonths')} value={st.remaining_months != null ? faNum(st.remaining_months, 1) : '—'} />
            <LiveChip label={t('g.estCompletion')} value={st.estimated_completion ? jalaliDateSep(st.estimated_completion) : '—'} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
