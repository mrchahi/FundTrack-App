import React, { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCircle2, History, Landmark, Pencil, Plus, RefreshCw, RotateCcw, Settings2, Trash2, UserCircle2 } from 'lucide-react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { useApp } from '../store'
import { useToast } from '../components/Toast'
import { useT, type TFunc } from '../lib/i18n'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, PageHeader, Progress, Select, Skeleton, StatCard, Switch, Tabs } from '../components/ui'
import { Modal } from '../components/Modal'
import { CashflowBars } from '../components/charts'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { faNum, fmtMoney, fmtUSD } from '../lib/format'
import { gregorianYearMonthOfJalali, jalaliDateTime, jalaliToday, MONTHS_FA } from '../lib/jalali'
import { resolveThemeColors } from '../lib/themeColors'
import type { BankAccount, BankAccountKind, Budget, Expense, Obligation, ObligationKind, ObligationPeriod, Transaction, TxnType } from '../types'

function tsToLocalISO(ts: number): string {
  const d = new Date(ts * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function AccountingPage() {
  const { settings } = useApp()
  const t = useT(settings.lang)
  const [tab, setTab] = useState('summary')
  const [jDate, setJDate] = useState<[number, number]>(() => jalaliToday())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const gj = gregorianYearMonthOfJalali(jDate[0], jDate[1])
  const month = `${gj.year}-${String(gj.month).padStart(2, '0')}`
  const [jy, jm] = jDate

  const years = Array.from({ length: 5 }, (_, i) => jy - 2 + i)

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('acct.title')}
        subtitle={t('acct.sub')}
        actions={
          <div className="flex items-center gap-2">
            {tab === 'summary' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{t('acct.jalaliMonth')}</span>
                <Select value={String(jy)} onChange={e => setJDate([Number(e.target.value), jm])} className="w-24">
                  {years.map(y => <option key={y} value={y}>{faNum(y, 0)}</option>)}
                </Select>
                <Select value={String(jm)} onChange={e => setJDate([jy, Number(e.target.value)])} className="w-32">
                  {MONTHS_FA.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </Select>
              </div>
            )}
          </div>
        }
      />
      <AccountingSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} t={t} />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'summary', label: t('acct.summary') },
          { value: 'accounts', label: t('acct.accountsTab') },
          { value: 'transactions', label: t('acct.transactions') },
          { value: 'expenses', label: t('acct.expenses') },
        ]}
      />
      {tab === 'summary' && <SummaryTab month={month} t={t} onOpenSettings={() => setSettingsOpen(true)} />}
      {tab === 'accounts' && <AccountsTab t={t} />}
      {tab === 'transactions' && <TransactionsTab t={t} />}
      {tab === 'expenses' && <ExpensesTab t={t} />}
    </div>
  )
}

/* ---------------------------------------------------------------- accounting settings modal */

function AccountingSettingsModal({ open, onClose, t }: { open: boolean; onClose: () => void; t: TFunc }) {
  const { settings, updateSettings, accounts } = useApp()
  const toast = useToast()
  const banks = useAsync(() => api.bankAccounts(), [])
  const fx = useAsync(() => api.fxStatus(), [open])
  const [refreshing, setRefreshing] = useState(false)

  const refreshFx = async () => {
    setRefreshing(true)
    try {
      const r = await api.fxRefresh()
      if (r.rate) toast.push('success', t.fmt('acct.fxUpdated', r.rate))
      else toast.push('error', t('acct.fxFailed'))
      await fx.refetch()
    } catch { toast.push('error', t('common.error')) } finally { setRefreshing(false) }
  }

  const opts = () => {
    const list: { value: string; label: string }[] = []
    for (const a of accounts.filter(x => !x.archived)) list.push({ value: `mt5:${a.login}`, label: `${a.name || a.login} (MT5)` })
    for (const b of (banks.data ?? []).filter(x => !x.archived)) list.push({ value: `bank:${b.id}`, label: `${b.name} (${b.currency})` })
    return list
  }

  return (
    <Modal open={open} onClose={onClose} title={t('acct.settings')} size="md">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-sm font-medium">{t('acct.refAccount')}</div>
          <p className="mb-2 text-xs text-muted">{t('acct.refAccountHint')}</p>
          <Select
            value={settings.acct_ref_account}
            onChange={e => updateSettings({ acct_ref_account: e.target.value })}
            className="w-full"
          >
            <option value="">{t('acct.noAccount')}</option>
            {opts().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">{t('acct.tradeAccount')}</div>
          <p className="mb-2 text-xs text-muted">{t('acct.tradeAccountHint')}</p>
          <Select
            value={settings.acct_trade_account}
            onChange={e => updateSettings({ acct_trade_account: e.target.value })}
            className="w-full"
          >
            <option value="">{t('acct.noAccount')}</option>
            {opts().filter(o => o.value.startsWith('mt5:')).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 text-sm font-medium">{t('acct.fxTitle')}</div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{t('acct.fxAuto')}</span>
            <Switch checked={settings.fx_auto} onChange={v => updateSettings({ fx_auto: v })} />
          </div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{t('acct.fxCurrent')}</span>
            <span className="number text-sm font-bold text-foreground">
              {fx.data?.rate ? `${faNum(Number(fx.data.rate), 0)} تومان` : '—'}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted">
              {fx.data?.last_update ? `${t('acct.fxLast')} ${jalaliDateTime(tsToLocalISO(fx.data.last_update))}` : t('acct.fxNever')}
            </span>
            <Button size="sm" variant="outline" onClick={refreshFx} loading={refreshing}>
              <RefreshCw className="h-3.5 w-3.5" /> {t('acct.fxRefresh')}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted">{t('acct.settingsHint')}</p>
      </div>
    </Modal>
  )
}

/* ---------------------------------------------------------------- unified accounts (MT5 + bank) */

function AccountsTab({ t }: { t: (k: string) => string }) {
  const { accounts, activeLogin, updateAccount, refreshAccounts } = useApp()
  const toast = useToast()
  const banks = useAsync(() => api.bankAccounts(), [])

  const [bankOpen, setBankOpen] = useState(false)
  const [bankEditing, setBankEditing] = useState<BankAccount | null>(null)
  const [bankForm, setBankForm] = useState({ name: '', kind: 'bank' as BankAccountKind, currency: 'USD', balance: '', note: '' })
  const [bankSaving, setBankSaving] = useState(false)
  const [historyFor, setHistoryFor] = useState<{ key: string; label: string } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyTxns = useAsync(() => api.transactions(), [historyOpen])

  const startBankAdd = () => { setBankEditing(null); setBankForm({ name: '', kind: 'bank', currency: 'USD', balance: '', note: '' }); setBankOpen(true) }
  const startBankEdit = (b: BankAccount) => {
    setBankEditing(b)
    setBankForm({ name: b.name, kind: b.kind, currency: b.currency, balance: String(b.balance), note: b.note })
    setBankOpen(true)
  }
  const saveBank = async () => {
    if (!bankForm.name) return
    setBankSaving(true)
    const body = { name: bankForm.name, kind: bankForm.kind, currency: bankForm.currency as 'USD' | 'IRT', balance: Number(bankForm.balance || 0), note: bankForm.note }
    try {
      if (bankEditing) await api.patchBankAccount(bankEditing.id, body)
      else await api.createBankAccount(body)
      toast.push('success', t('common.edited'))
      setBankOpen(false)
      await banks.refetch()
    } catch { toast.push('error', t('common.error')) } finally { setBankSaving(false) }
  }
  const removeBank = async (b: BankAccount) => {
    if (!window.confirm(t('bank.confirmDelete'))) return
    try { await api.deleteBankAccount(b.id); await banks.refetch() } catch { toast.push('error', t('common.error')) }
  }

  const bankMoney = (b: BankAccount) => (b.currency === 'IRT' ? `${faNum(b.balance, 0)} تومان` : fmtUSD(b.balance))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm">{t('acct.accountsTab')}</CardTitle>
          <p className="text-xs text-muted">{t('ac.txt')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={startBankAdd}><Plus className="h-3.5 w-3.5" /> {t('bank.add')}</Button>
        </div>
      </div>

      <Modal open={bankOpen} onClose={() => setBankOpen(false)} title={bankEditing ? t('bank.edit') : t('bank.add')} size="md">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('bank.name')}>
            <Input value={bankForm.name} onChange={e => setBankForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label={t('bank.kind')}>
            <Select value={bankForm.kind} onChange={e => setBankForm(f => ({ ...f, kind: e.target.value as BankAccountKind }))} className="w-full">
              <option value="bank">{t('bank.kind.bank')}</option>
              <option value="cash">{t('bank.kind.cash')}</option>
              <option value="wallet">{t('bank.kind.wallet')}</option>
            </Select>
          </Field>
          <Field label={t('acct.currency')}>
            <Select value={bankForm.currency} onChange={e => setBankForm(f => ({ ...f, currency: e.target.value }))} className="w-full">
              <option value="USD">{t('s.usd')}</option>
              <option value="IRT">{t('s.irt')}</option>
            </Select>
          </Field>
          <Field label={t('bank.balance')}>
            <Input type="number" dir="ltr" value={bankForm.balance} onChange={e => setBankForm(f => ({ ...f, balance: e.target.value }))} />
          </Field>
          <Field label={t('acct.note')} className="sm:col-span-2">
            <Input value={bankForm.note} onChange={e => setBankForm(f => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={saveBank} loading={bankSaving}>{t('acct.save')}</Button>
          <Button variant="ghost" onClick={() => setBankOpen(false)}>{t('g.cancel')}</Button>
        </div>
      </Modal>

      {/* MT5 accounts */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-foreground">{t('nav.accounts')} · MT5</div>
          {accounts.map(a => (
            <div key={a.login} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-accent">
                  <UserCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{a.name || a.login}</span>
                    <Badge tone="neutral"><span className="number">{a.login}</span></Badge>
                    {a.archived && <Badge tone="warn">{t('ac.archived')}</Badge>}
                  </div>
                  <div className="text-xs text-muted">{a.server || '—'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{t('ac.perf')}</span>
                <Button variant="ghost" size="icon" title={t('acct.history')} onClick={() => { setHistoryFor({ key: `mt5:${a.login}`, label: a.name || String(a.login) }); setHistoryOpen(true) }}>
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Switch checked={!!a.archived} onChange={v => updateAccount(a.login, { archived: v ? 1 : 0 })} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* bank accounts */}
      <div className="space-y-2">
        <div className="text-sm font-semibold text-foreground">{t('acct.bankAccounts')}</div>
        {banks.loading && !banks.data ? <Skeleton className="h-24" /> : !banks.data || banks.data.length === 0 ? (
          <Card><CardContent><EmptyState title={t('bank.empty')} /></CardContent></Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {banks.data.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-accent">
                    <Landmark className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{b.name}</span>
                      <Badge tone="neutral">{t('bank.kind.' + b.kind)}</Badge>
                    </div>
                    <div className="number text-xs text-muted">{bankMoney(b)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" title={t('acct.history')} onClick={() => { setHistoryFor({ key: `bank:${b.id}`, label: b.name }); setHistoryOpen(true) }}>
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" title={t('g.edit')} onClick={() => startBankEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" title={t('bank.confirmDelete')} onClick={() => removeBank(b)}><Trash2 className="h-3.5 w-3.5 text-negative" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* account history modal */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`${t('acct.history')} — ${historyFor?.label ?? ''}`} size="lg">
        {historyTxns.loading && !historyTxns.data ? <Skeleton className="h-40" /> : (
          <div className="space-y-2">
            {(historyTxns.data ?? [])
              .filter(tx => {
                if (!historyFor) return false
                if (historyFor.key.startsWith('bank:')) return String(tx.bank_account_id) === historyFor.key.slice(5)
                return String(tx.account_login) === historyFor.key.slice(5)
              })
              .slice(0, 50)
              .map(tx => (
                <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={tx.txn_type === 'in' ? 'positive' : tx.txn_type === 'out' ? 'warn' : 'negative'}>
                      {TXN_ICONS[tx.txn_type]} {t('acct.' + tx.txn_type)}
                    </Badge>
                    <span className="text-sm font-medium">{tx.category || tx.note || '—'}</span>
                  </div>
                  <span className={`number text-sm font-bold ${tx.txn_type === 'in' ? 'text-positive' : 'text-negative'}`}>
                    {tx.currency === 'IRT' ? `${faNum(tx.amount, 0)} تومان` : fmtUSD(tx.amount)}
                  </span>
                </div>
              ))}
            {!historyTxns.data || historyTxns.data.filter(tx => {
              if (!historyFor) return false
              if (historyFor.key.startsWith('bank:')) return String(tx.bank_account_id) === historyFor.key.slice(5)
              return String(tx.account_login) === historyFor.key.slice(5)
            }).length === 0 ? <EmptyState title={t('acct.emptyTxns')} /> : null}
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ---------------------------------------------------------------- transactions */

const TXN_ICONS: Record<TxnType, React.ReactNode> = {
  in: <ArrowDownLeft className="h-3.5 w-3.5" />,
  out: <ArrowUpRight className="h-3.5 w-3.5" />,
  expense: <ArrowUpRight className="h-3.5 w-3.5" />,
}

function TransactionsTab({ t }: { t: (k: string) => string }) {
  const { accounts, activeLogin } = useApp()
  const toast = useToast()
  const banks = useAsync(() => api.bankAccounts(), [])
  const [typeFilter, setTypeFilter] = useState('')
  const { data, loading, refetch } = useAsync(() => api.transactions(typeFilter || undefined), [typeFilter])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState({
    txn_type: 'in' as TxnType, amount: '', currency: 'USD', category: '', note: '',
    account_login: '', bank_account_id: '',
  })
  const [saving, setSaving] = useState(false)

  const startAdd = () => {
    setEditing(null)
    setForm({ txn_type: 'in', amount: '', currency: 'USD', category: '', note: '', account_login: String(activeLogin ?? ''), bank_account_id: '' })
    setOpen(true)
  }
  const startEdit = (tx: Transaction) => {
    setEditing(tx)
    setForm({
      txn_type: tx.txn_type, amount: String(tx.amount), currency: tx.currency,
      category: tx.category, note: tx.note, account_login: String(tx.account_login ?? ''),
      bank_account_id: String(tx.bank_account_id ?? ''),
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) return
    setSaving(true)
    const body = {
      txn_type: form.txn_type,
      amount: Number(form.amount),
      currency: form.currency as 'USD' | 'IRT',
      category: form.category,
      note: form.note,
      account_login: form.account_login ? Number(form.account_login) : null,
      bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
    }
    try {
      if (editing) await api.patchTransaction(editing.id, body)
      else await api.createTransaction(body)
      toast.push('success', t('common.edited'))
      setOpen(false)
      await refetch()
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (tx: Transaction) => {
    if (!window.confirm(t('acct.confirmDelete'))) return
    try { await api.deleteTransaction(tx.id); await refetch() } catch { toast.push('error', t('common.error')) }
  }

  const money = (tx: Transaction) => (tx.currency === 'IRT' ? `${faNum(tx.amount, 0)} تومان` : fmtUSD(tx.amount))
  const accName = (tx: Transaction) => {
    if (tx.bank_account_id) {
      const b = (banks.data ?? []).find(x => x.id === tx.bank_account_id)
      return b ? b.name : null
    }
    if (tx.account_login) {
      const a = accounts.find(x => x.login === tx.account_login)
      return a ? (a.name || String(a.login)) : null
    }
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-40" title={t('acct.type')}>
          <option value="">{t('f.all')}</option>
          <option value="in">{t('acct.in')}</option>
          <option value="out">{t('acct.out')}</option>
          <option value="expense">{t('acct.expense')}</option>
        </Select>
        <Button size="sm" onClick={startAdd}><Plus className="h-3.5 w-3.5" /> {t('acct.add')}</Button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('acct.edit') : t('acct.add')} size="lg">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('acct.type')}>
            <Select value={form.txn_type} onChange={e => setForm(f => ({ ...f, txn_type: e.target.value as TxnType }))} className="w-full">
              <option value="in">{t('acct.in')}</option>
              <option value="out">{t('acct.out')}</option>
              <option value="expense">{t('acct.expense')}</option>
            </Select>
          </Field>
          <Field label={t('acct.amount')}>
            <Input type="number" dir="ltr" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </Field>
          <Field label={t('acct.currency')}>
            <Select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full">
              <option value="USD">{t('s.usd')}</option>
              <option value="IRT">{t('s.irt')}</option>
            </Select>
          </Field>
          <Field label={t('acct.category')}>
            <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          </Field>
          <Field label={t('acct.account')} className="sm:col-span-2 lg:col-span-2">
            <Select
              value={form.account_login || form.bank_account_id}
              onChange={e => {
                const v = e.target.value
                if (v.startsWith('bank:')) setForm(f => ({ ...f, bank_account_id: v.slice(5), account_login: '' }))
                else setForm(f => ({ ...f, account_login: v, bank_account_id: '' }))
              }}
              className="w-full"
            >
              <option value="">{t('acct.noAccount')}</option>
              {accounts.filter(a => !a.archived).map(a => (
                <option key={a.login} value={a.login}>{a.name || a.login} · MT5</option>
              ))}
              {(banks.data ?? []).filter(b => !b.archived).map(b => (
                <option key={b.id} value={`bank:${b.id}`}>{b.name} ({b.currency})</option>
              ))}
            </Select>
          </Field>
          <Field label={t('acct.note')} className="sm:col-span-2 lg:col-span-3">
            <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={save} loading={saving}>{t('acct.save')}</Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t('g.cancel')}</Button>
        </div>
      </Modal>

      {loading && !data ? <Skeleton className="h-40" /> : !data || data.length === 0 ? (
        <Card><CardContent><EmptyState title={t('acct.emptyTxns')} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map(tx => (
            <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Badge tone={tx.txn_type === 'in' ? 'positive' : tx.txn_type === 'out' ? 'warn' : 'negative'}>
                  {TXN_ICONS[tx.txn_type]} {t('acct.' + tx.txn_type)}
                </Badge>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {tx.category || tx.note || '—'}
                    {accName(tx) && <span className="text-xs text-muted"> · {accName(tx)}</span>}
                  </div>
                  <div className="text-[11px] text-muted">{jalaliDateTime(tsToLocalISO(tx.created_at))}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`number text-sm font-bold ${tx.txn_type === 'in' ? 'text-positive' : 'text-negative'}`}>{money(tx)}</span>
                <Button variant="ghost" size="icon" title={t('g.edit')} onClick={() => startEdit(tx)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" title={t('acct.delete')} onClick={() => remove(tx)}><Trash2 className="h-3.5 w-3.5 text-negative" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- expenses (fixed + obligations) */

const OBL_TONES: Record<ObligationKind, 'accent' | 'warn' | 'positive'> = {
  loan: 'accent',
  debt: 'warn',
  claim: 'positive',
}

function ExpensesTab({ t }: { t: (k: string) => string }) {
  return (
    <div className="space-y-6">
      <FixedExpensesSection t={t} />
      <ObligationsSection t={t} />
    </div>
  )
}

function FixedExpensesSection({ t }: { t: (k: string) => string }) {
  const toast = useToast()
  const { data, loading, refetch } = useAsync(() => api.expenses(), [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [form, setForm] = useState({ name: '', amount: '', currency: 'USD', note: '', recurring: false, day_of_month: '' })
  const [saving, setSaving] = useState(false)

  const startAdd = () => { setEditing(null); setForm({ name: '', amount: '', currency: 'USD', note: '', recurring: false, day_of_month: '' }); setOpen(true) }
  const startEdit = (e: Expense) => {
    setEditing(e)
    setForm({ name: e.name, amount: String(e.amount), currency: e.currency, note: e.note, recurring: !!e.recurring, day_of_month: e.day_of_month ? String(e.day_of_month) : '' })
    setOpen(true)
  }
  const save = async () => {
    if (!form.name || !form.amount) return
    setSaving(true)
    const body = {
      name: form.name, amount: Number(form.amount), currency: form.currency as 'USD' | 'IRT', note: form.note,
      recurring: form.recurring ? 1 : 0,
      day_of_month: form.recurring ? (form.day_of_month ? Number(form.day_of_month) : null) : null,
    }
    try {
      if (editing) await api.patchExpense(editing.id, body)
      else await api.createExpense(body)
      toast.push('success', t('common.edited'))
      setOpen(false)
      await refetch()
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setSaving(false)
    }
  }
  const remove = async (e: Expense) => {
    if (!window.confirm(t('g.confirmDelete'))) return
    try { await api.deleteExpense(e.id); await refetch() } catch { toast.push('error', t('common.error')) }
  }
  const money = (e: Expense) => (e.currency === 'IRT' ? `${faNum(e.amount, 0)} تومان` : fmtUSD(e.amount))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm">{t('acct.fixedExpenses')}</CardTitle>
        <Button size="sm" variant="outline" onClick={startAdd}><Plus className="h-3.5 w-3.5" /> {t('acct.addExpense')}</Button>
      </div>

      {open && (
        <Card>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('acct.expenseName')}>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label={t('acct.amount')}>
                <Input type="number" dir="ltr" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </Field>
              <Field label={t('acct.currency')}>
                <Select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full">
                  <option value="USD">{t('s.usd')}</option>
                  <option value="IRT">{t('s.irt')}</option>
                </Select>
              </Field>
              <Field label={t('acct.note')}>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </Field>
              <Field label={t('acct.recurring')}>
                <Switch checked={form.recurring} onChange={v => setForm(f => ({ ...f, recurring: v }))} />
              </Field>
              {form.recurring && (
                <Field label={t('acct.dayOfMonth')}>
                  <Input type="number" min={1} max={31} dir="ltr" value={form.day_of_month} onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value }))} />
                </Field>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={save} loading={saving}>{t('acct.save')}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t('g.cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !data ? <Skeleton className="h-28" /> : !data || data.length === 0 ? (
        <Card><CardContent><EmptyState title={t('acct.emptyFixedExpenses')} /></CardContent></Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          {data.map(e => (
            <div key={e.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <div>
                <div className="text-sm font-medium">{e.name}</div>
                <div className="number text-xs text-muted">{money(e)}</div>
              </div>
              <Button variant="ghost" size="icon" title={t('g.edit')} onClick={() => startEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" title={t('acct.delete')} onClick={() => remove(e)}><Trash2 className="h-3.5 w-3.5 text-negative" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ObligationsSection({ t }: { t: (k: string) => string }) {
  const toast = useToast()
  const { data, loading, refetch } = useAsync(() => api.obligations(), [])
  const banks = useAsync(() => api.bankAccounts(), [])
  const [payBank, setPayBank] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Obligation | null>(null)
  const [form, setForm] = useState({
    kind: 'debt' as ObligationKind, title: '', amount: '', currency: 'USD',
    period: 'monthly' as ObligationPeriod, due_date: '', note: '',
    total_installments: '', installment_amount: '',
  })
  const [saving, setSaving] = useState(false)

  const startAdd = () => {
    setEditing(null)
    setForm({ kind: 'debt', title: '', amount: '', currency: 'USD', period: 'monthly', due_date: '', note: '', total_installments: '', installment_amount: '' })
    setOpen(true)
  }
  const startEdit = (o: Obligation) => {
    setEditing(o)
    setForm({
      kind: o.kind, title: o.title, amount: String(o.amount), currency: o.currency,
      period: o.period, due_date: o.due_date ?? '', note: o.note,
      total_installments: o.total_installments ? String(o.total_installments) : '',
      installment_amount: o.installment_amount ? String(o.installment_amount) : '',
    })
    setOpen(true)
  }
  const save = async () => {
    if (!form.title || !form.amount || Number(form.amount) <= 0) return
    setSaving(true)
    const body = {
      kind: form.kind, title: form.title, amount: Number(form.amount), currency: form.currency as 'USD' | 'IRT',
      period: form.period, due_date: form.due_date || null, note: form.note,
      total_installments: form.total_installments ? Number(form.total_installments) : null,
      installment_amount: form.installment_amount ? Number(form.installment_amount) : null,
    }
    try {
      if (editing) await api.patchObligation(editing.id, body)
      else await api.createObligation(body)
      toast.push('success', t('common.edited'))
      setOpen(false)
      await refetch()
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setSaving(false)
    }
  }
  const remove = async (o: Obligation) => {
    if (!window.confirm(t('obl.confirmDelete'))) return
    try { await api.deleteObligation(o.id); await refetch() } catch { toast.push('error', t('common.error')) }
  }
  const toggleStatus = async (o: Obligation) => {
    try {
      await api.patchObligation(o.id, { status: o.status === 'open' ? 'closed' : 'open' })
      await refetch()
    } catch { toast.push('error', t('common.error')) }
  }

  const payInstallment = async (o: Obligation) => {
    if (!payBank) { toast.push('error', t('bank.empty')); return }
    try {
      await api.payObligation(o.id, Number(payBank))
      toast.push('success', t('common.edited'))
      setPayBank('')
      await refetch()
    } catch (e: unknown) {
      toast.push('error', e instanceof Error ? e.message : t('common.error'))
    }
  }
  const money = (o: Obligation) => (o.currency === 'IRT' ? `${faNum(o.amount, 0)} تومان` : fmtUSD(o.amount))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm">{t('acct.obligationsTitle')}</CardTitle>
        <Button size="sm" variant="outline" onClick={startAdd}><Plus className="h-3.5 w-3.5" /> {t('obl.add')}</Button>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t('obl.totalOpen')} value={fmtUSD(data.total_open)} tone={data.total_open > 0 ? 'negative' : 'positive'} icon={<CalendarClock className="h-4 w-4" />} />
          <StatCard label={t('obl.kind.loan')} value={faNum(data.by_kind.loan, 0)} tone="accent" />
          <StatCard label={t('obl.kind.debt')} value={faNum(data.by_kind.debt, 0)} />
          <StatCard label={t('obl.kind.claim')} value={faNum(data.by_kind.claim, 0)} tone="positive" />
        </div>
      )}

      {open && (
        <Card>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('obl.kind')}>
                <Select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as ObligationKind }))} className="w-full">
                  <option value="loan">{t('obl.kind.loan')}</option>
                  <option value="debt">{t('obl.kind.debt')}</option>
                  <option value="claim">{t('obl.kind.claim')}</option>
                </Select>
              </Field>
              <Field label={t('obl.title')}>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </Field>
              <Field label={t('obl.amount')}>
                <Input type="number" dir="ltr" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </Field>
              <Field label={t('acct.currency')}>
                <Select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full">
                  <option value="USD">{t('s.usd')}</option>
                  <option value="IRT">{t('s.irt')}</option>
                </Select>
              </Field>
              <Field label={t('obl.period')}>
                <Select value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value as ObligationPeriod }))} className="w-full">
                  <option value="daily">{t('obl.period.daily')}</option>
                  <option value="monthly">{t('obl.period.monthly')}</option>
                  <option value="yearly">{t('obl.period.yearly')}</option>
                </Select>
              </Field>
              <Field label={t('obl.dueDate')}>
                <Input type="date" dir="ltr" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </Field>
              <Field label={t('obl.installments')}>
                <Input type="number" min={1} dir="ltr" placeholder={t('obl.noInstallments')} value={form.total_installments} onChange={e => setForm(f => ({ ...f, total_installments: e.target.value }))} />
              </Field>
              <Field label={t('obl.installmentAmount')}>
                <Input type="number" dir="ltr" value={form.installment_amount} onChange={e => setForm(f => ({ ...f, installment_amount: e.target.value }))} />
              </Field>
              <Field label={t('acct.note')}>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={save} loading={saving}>{t('acct.save')}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t('g.cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && !data ? <Skeleton className="h-40" /> : data && data.items.length === 0 ? (
        <Card><CardContent><EmptyState title={t('obl.empty')} /></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data?.items.map(o => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Badge tone={OBL_TONES[o.kind]}>{t('obl.kind.' + o.kind)}</Badge>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{o.title}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    <span>{t('obl.period.' + o.period)}</span>
                    {o.due_date && <span>· {t('obl.dueDate')}: {o.due_date}</span>}
                    {o.note && <span>· {o.note}</span>}
                  </div>
                </div>
              </div>

              {o.total_installments ? (
                <div className="w-full lg:w-64">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                    <span>{t('obl.installments')}: {faNum(o.paid_installments)}/{faNum(o.total_installments)}</span>
                    <span>{faNum(Math.min(100, (o.paid_installments / o.total_installments) * 100), 0)}٪</span>
                  </div>
                  <Progress value={(o.paid_installments / o.total_installments) * 100} />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <span className="number text-sm font-bold">{money(o)}</span>
                <Badge tone={o.status === 'open' ? 'warn' : 'neutral'}>{t('obl.status.' + o.status)}</Badge>
                {o.status === 'open' && o.installment_amount && banks.data && banks.data.length > 0 && (
                  <>
                    <Select value={payBank} onChange={e => setPayBank(e.target.value)} className="w-40" title={t('acct.bankAccounts')}>
                      <option value="">{t('acct.bankAccounts')}…</option>
                      {banks.data.filter(b => !b.archived).map(b => (
                        <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>
                      ))}
                    </Select>
                    <Button size="sm" onClick={() => payInstallment(o)} disabled={!payBank}>{t('obl.pay')}</Button>
                  </>
                )}
                <Button variant="ghost" size="icon" title={o.status === 'open' ? t('obl.close') : t('obl.reopen')} onClick={() => toggleStatus(o)}>
                  {o.status === 'open' ? <CheckCircle2 className="h-3.5 w-3.5 text-positive" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" title={t('g.edit')} onClick={() => startEdit(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" title={t('obl.confirmDelete')} onClick={() => remove(o)}><Trash2 className="h-3.5 w-3.5 text-negative" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.upcoming.length > 0 && (
        <Card>
          <CardHeader><CardTitle>{t('obl.upcoming')}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.upcoming.map(o => (
                <Badge key={o.id} tone="warn">{o.title} — {o.due_date}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- bank accounts */

function BankAccountsTab({ t }: { t: (k: string) => string }) {
  const toast = useToast()
  const { data, loading, refetch } = useAsync(() => api.bankAccounts(), [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [form, setForm] = useState({ name: '', kind: 'bank' as BankAccountKind, currency: 'USD', balance: '', note: '' })
  const [saving, setSaving] = useState(false)

  const startAdd = () => {
    setEditing(null)
    setForm({ name: '', kind: 'bank', currency: 'USD', balance: '', note: '' })
    setOpen(true)
  }
  const startEdit = (b: BankAccount) => {
    setEditing(b)
    setForm({ name: b.name, kind: b.kind, currency: b.currency, balance: String(b.balance), note: b.note })
    setOpen(true)
  }
  const save = async () => {
    if (!form.name) return
    setSaving(true)
    const body = { name: form.name, kind: form.kind, currency: form.currency as 'USD' | 'IRT', balance: Number(form.balance || 0), note: form.note }
    try {
      if (editing) await api.patchBankAccount(editing.id, body)
      else await api.createBankAccount(body)
      toast.push('success', t('common.edited'))
      setOpen(false)
      await refetch()
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setSaving(false)
    }
  }
  const remove = async (b: BankAccount) => {
    if (!window.confirm(t('bank.confirmDelete'))) return
    try { await api.deleteBankAccount(b.id); await refetch() } catch { toast.push('error', t('common.error')) }
  }
  const money = (b: BankAccount) => (b.currency === 'IRT' ? `${faNum(b.balance, 0)} تومان` : fmtUSD(b.balance))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={startAdd}><Plus className="h-3.5 w-3.5" /> {t('bank.add')}</Button>
      </div>

      {open && (
        <Card>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('bank.name')}>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label={t('bank.kind')}>
                <Select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as BankAccountKind }))} className="w-full">
                  <option value="bank">{t('bank.kind.bank')}</option>
                  <option value="cash">{t('bank.kind.cash')}</option>
                  <option value="wallet">{t('bank.kind.wallet')}</option>
                </Select>
              </Field>
              <Field label={t('acct.currency')}>
                <Select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full">
                  <option value="USD">{t('s.usd')}</option>
                  <option value="IRT">{t('s.irt')}</option>
                </Select>
              </Field>
              <Field label={t('bank.balance')}>
                <Input type="number" dir="ltr" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} />
              </Field>
              <Field label={t('acct.note')}>
                <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
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
        <Card><CardContent><EmptyState title={t('bank.empty')} /></CardContent></Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map(b => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-accent">
                  <Landmark className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{b.name}</span>
                    <Badge tone="neutral">{t('bank.kind.' + b.kind)}</Badge>
                  </div>
                  <div className="number text-xs text-muted">{money(b)}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" title={t('g.edit')} onClick={() => startEdit(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" title={t('bank.confirmDelete')} onClick={() => remove(b)}><Trash2 className="h-3.5 w-3.5 text-negative" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- summary */

function SummaryTab({ month, t, onOpenSettings }: { month: string; t: (k: string) => string; onOpenSettings: () => void }) {
  const { settings, activeAccount, accounts, activeLogin } = useApp()
  const toast = useToast()
  const C = resolveThemeColors()
  const sm = useAsync(() => api.accountingSummary(month), [month])
  const series = useAsync(() => api.accountingSeries(12), [])
  const budgets = useAsync(() => api.budgets(), [])
  const banks = useAsync(() => api.bankAccounts(), [])
  const money = (n: number) => fmtMoney(n, settings, activeAccount)
  const moneyMain = (n: number) => money(n)[0]

  // resolve the reference account metadata for the banner
  const refKey = settings.acct_ref_account
  const refMeta = (() => {
    if (!refKey) return null
    if (refKey.startsWith('mt5:')) {
      const login = Number(refKey.slice(5))
      const a = accounts.find(x => x.login === login)
      return a ? { label: a.name || String(a.login), type: 'MT5' as const } : null
    }
    const id = Number(refKey.slice(5))
    const b = (banks.data ?? []).find(x => x.id === id)
    return b ? { label: b.name, type: 'bank' as const } : null
  })()

  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budgetForm, setBudgetForm] = useState({
    category: '', source_type: 'fixed' as 'fixed' | 'percent', limit: '', currency: 'USD',
    account_login: '', bank_account_id: '', pct: '',
  })
  const [budgetSaving, setBudgetSaving] = useState(false)
  const [budgetEditing, setBudgetEditing] = useState<Budget | null>(null)

  const saveBudget = async () => {
    if (!budgetForm.category) return
    setBudgetSaving(true)
    const body: Partial<Budget> & { limit?: number; pct?: number } = {
      category: budgetForm.category,
      source_type: budgetForm.source_type,
      currency: budgetForm.currency as 'USD' | 'IRT',
    }
    if (budgetForm.source_type === 'percent') {
      body.pct = Number(budgetForm.pct) || 0
      body.account_login = budgetForm.account_login ? Number(budgetForm.account_login) : null
      body.bank_account_id = budgetForm.bank_account_id ? Number(budgetForm.bank_account_id) : null
    } else {
      body.limit = Number(budgetForm.limit) || 0
    }
    try {
      if (budgetEditing) await api.patchBudget(budgetEditing.id, body)
      else await api.createBudget(body)
      toast.push('success', t('common.edited'))
      setBudgetOpen(false); setBudgetEditing(null)
      setBudgetForm({ category: '', source_type: 'fixed', limit: '', currency: 'USD', account_login: '', bank_account_id: '', pct: '' })
      await budgets.refetch()
    } catch { toast.push('error', t('common.error')) } finally { setBudgetSaving(false) }
  }
  const removeBudget = async (b: Budget) => {
    if (!window.confirm(t('acct.budgetConfirmDelete'))) return
    try { await api.deleteBudget(b.id); await budgets.refetch() } catch { toast.push('error', t('common.error')) }
  }

  const donutData = sm.data ? [
    { name: t('acct.income'), value: Math.max(0, sm.data.income), color: C.positive },
    { name: t('acct.expenseTotal'), value: Math.max(0, sm.data.expense), color: C.negative },
  ].filter(d => d.value > 0) : []

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-accent">
            <Landmark className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">{t('acct.refAccount')}</div>
            <div className="text-xs text-muted">
              {refMeta
                ? `${refMeta.label} (${refMeta.type})`
                : t('acct.noRefConfigured')}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenSettings}>
            <Settings2 className="h-3.5 w-3.5" /> {t('acct.settings')}
          </Button>
        </CardContent>
      </Card>

      {sm.loading && !sm.data ? <Skeleton className="h-32" /> : sm.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t('acct.income')} value={money(sm.data.income)[0]} sub={money(sm.data.income)[1]} tone="positive" icon={<ArrowDownLeft className="h-4 w-4" />} />
          <StatCard label={t('acct.expenseTotal')} value={money(sm.data.expense)[0]} sub={money(sm.data.expense)[1]} tone="negative" icon={<ArrowUpRight className="h-4 w-4" />} />
          <StatCard label={t('acct.net')} value={money(sm.data.net)[0]} sub={money(sm.data.net)[1]} tone={sm.data.net >= 0 ? 'positive' : 'negative'} />
          <StatCard label={t('acct.withdrawals')} value={money(sm.data.withdrawals)[0]} sub={`${t('acct.expenseItems')}: ${money(sm.data.expense_items)[0]}`} />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>{t('acct.chart')}</CardTitle></CardHeader>
        <CardContent>
          {series.loading && !series.data ? <Skeleton className="h-56" /> : series.data && series.data.length ? (
            <CashflowBars items={series.data} />
          ) : <EmptyState title={t('common.error')} />}
        </CardContent>
      </Card>

      {sm.data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('acct.finHealth')}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => { setBudgetEditing(null); setBudgetForm({ category: '', source_type: 'fixed', limit: '', currency: 'USD', account_login: String(activeLogin ?? ''), bank_account_id: '', pct: '' }); setBudgetOpen(true) }}>
                <Plus className="h-3.5 w-3.5" /> {t('acct.addBudget')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex flex-col items-center justify-center gap-3">
                {donutData.length ? (
                  <>
                    <div dir="ltr" className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={72} paddingAngle={2}>
                            {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: '#1a2330', border: '1px solid #24303f', borderRadius: 10, fontSize: 12 }} formatter={(v: number, name: string) => [faNum(v), name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> {t('acct.income')}: {moneyMain(sm.data.income)}</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> {t('acct.expenseTotal')}: {moneyMain(sm.data.expense)}</span>
                    </div>
                  </>
                ) : <EmptyState title={t('gami.noObligations')} />}
                <div className="rounded-lg bg-surface px-3 py-2 text-center">
                  <div className="text-[10px] text-muted">{t('acct.budgetRemaining')}</div>
                  <div className="number text-base font-bold text-positive">{moneyMain(sm.data.budget_remaining)}</div>
                </div>
              </div>

              <div className="space-y-2 lg:col-span-2">
                <Modal open={budgetOpen} onClose={() => setBudgetOpen(false)} title={budgetEditing ? t('acct.editBudget') : t('acct.addBudget')} size="md">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('acct.budgetCategory')} className="sm:col-span-2">
                      <Input value={budgetForm.category} onChange={e => setBudgetForm(f => ({ ...f, category: e.target.value }))} />
                    </Field>
                    <Field label={t('acct.budgetSourceType')} className="sm:col-span-2">
                      <Select value={budgetForm.source_type} onChange={e => setBudgetForm(f => ({ ...f, source_type: e.target.value as 'fixed' | 'percent' }))} className="w-full">
                        <option value="fixed">{t('acct.budgetFixed')}</option>
                        <option value="percent">{t('acct.budgetPercent')}</option>
                      </Select>
                    </Field>

                    {budgetForm.source_type === 'percent' ? (
                      <>
                        <Field label={t('acct.budgetAccount')} className="sm:col-span-2">
                          <Select
                            value={budgetForm.account_login || budgetForm.bank_account_id}
                            onChange={e => {
                              const v = e.target.value
                              if (v.startsWith('bank:')) setBudgetForm(f => ({ ...f, bank_account_id: v.slice(5), account_login: '' }))
                              else setBudgetForm(f => ({ ...f, account_login: v, bank_account_id: '' }))
                            }}
                            className="w-full"
                          >
                            <option value="">{t('acct.noAccount')}</option>
                            {accounts.filter(a => !a.archived).map(a => (
                              <option key={a.login} value={a.login}>{a.name || a.login} · MT5</option>
                            ))}
                            {(banks.data ?? []).filter(b => !b.archived).map(b => (
                              <option key={b.id} value={`bank:${b.id}`}>{b.name} ({b.currency})</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t('acct.budgetPercent')}>
                          <Input dir="ltr" inputMode="numeric" value={budgetForm.pct} onChange={e => setBudgetForm(f => ({ ...f, pct: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="10" />
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field label={t('acct.budgetLimit')}>
                          <Input type="number" dir="ltr" value={budgetForm.limit} onChange={e => setBudgetForm(f => ({ ...f, limit: e.target.value }))} />
                        </Field>
                        <Field label={t('acct.currency')}>
                          <Select value={budgetForm.currency} onChange={e => setBudgetForm(f => ({ ...f, currency: e.target.value }))} className="w-full">
                            <option value="USD">{t('s.usd')}</option>
                            <option value="IRT">{t('s.irt')}</option>
                          </Select>
                        </Field>
                      </>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={saveBudget} loading={budgetSaving}>{t('acct.save')}</Button>
                    <Button variant="ghost" onClick={() => setBudgetOpen(false)}>{t('g.cancel')}</Button>
                  </div>
                </Modal>

                {budgets.loading && !budgets.data ? <Skeleton className="h-24" /> : !budgets.data || budgets.data.length === 0 ? (
                  <EmptyState title={t('acct.budgetEmpty')} />
                ) : (
                  budgets.data.map(b => {
                    const u = sm.data ? sm.data.budgets.find(x => x.id === b.id) : undefined
                    const percent = u ? u.percent : 0
                    const spent = u ? u.spent : 0
                    const warn = u ? u.warn : false
                    const barTone = percent >= 100 ? 'bg-negative' : warn ? 'bg-warn' : 'bg-accent'
                    return (
                      <div key={b.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{b.category}</span>
                            {warn && <Badge tone="warn">{t('acct.budgetWarn')}</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="number text-xs text-muted">{moneyMain(spent)} / {moneyMain(b.limit)}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={t('g.edit')} onClick={() => { setBudgetEditing(b); setBudgetForm({ category: b.category, source_type: b.source_type ?? 'fixed', limit: String(b.limit), currency: b.currency, account_login: b.account_login ? String(b.account_login) : '', bank_account_id: b.bank_account_id ? String(b.bank_account_id) : '', pct: b.pct != null ? String(b.pct) : '' }); setBudgetOpen(true) }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={t('acct.budgetConfirmDelete')} onClick={() => removeBudget(b)}>
                              <Trash2 className="h-3.5 w-3.5 text-negative" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-elevated">
                          <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, percent)}%` }} />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
