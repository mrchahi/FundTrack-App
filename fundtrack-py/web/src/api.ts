import type {
  Account, AccountingSeriesItem, AccountingSummary, AppNotification, BankAccount, BreakdownItem, Budget, CustomMission,
  DailyMissionOverride, DurItem, EquityPoint, Expense, FilterOptions, Filters, FinanceSummary, Goal, GoalPlan, Heatmap, MissionsDaily,
  NewsEvent, Obligation, ObligationsSummary, PeriodItem, Position, Settings, Status,
  SummaryResponse, TopTrades, Trade, Transaction,
} from './types'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try { msg = (await res.json()).detail ?? msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function toParams(f: Partial<Filters> = {}): URLSearchParams {
  const p = new URLSearchParams()
  if (f.range && f.range !== 'all') p.set('range', f.range)
  if (f.login) p.set('login', String(f.login))
  if (f.symbol) p.set('symbol', f.symbol)
  if (f.side) p.set('side', f.side)
  if (f.source) p.set('source', f.source)
  if (f.session) p.set('session', f.session)
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  return p
}

function qs(f: Partial<Filters>): string {
  const s = toParams(f).toString()
  return s ? `?${s}` : ''
}

export const api = {
  status: () => req<Status>('/api/status'),
  sync: () => req<{ events: number; trades_rebuilt: number | null }>('/api/sync', { method: 'POST' }),
  accounts: () => req<Account[]>('/api/accounts'),
  patchAccount: (login: number, body: Partial<Account>) =>
    req<Account>(`/api/accounts/${login}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  settings: () => req<Settings>('/api/settings'),
  putSettings: (body: Partial<Settings> & { security_pin?: string }) =>
    req<Settings>('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  verifyPin: (pin: string) =>
    req<{ ok: boolean }>('/api/verify-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) }),
  filterOptions: () => req<FilterOptions>('/api/filter-options'),
  summary: (f: Partial<Filters> = {}) => req<SummaryResponse>(`/api/summary${qs(f)}`),
  trades: (f: Partial<Filters> = {}, limit = 500) => {
    const p = toParams(f)
    p.set('limit', String(limit))
    return req<{ total: number; items: Trade[] }>(`/api/trades?${p}`)
  },
  breakdown: (by: string, f: Partial<Filters> = {}) => {
    const p = new URLSearchParams({ by })
    toParams(f).forEach((v, k) => p.set(k, v))
    return req<BreakdownItem[]>(`/api/breakdown?${p}`)
  },
  heatmap: (f: Partial<Filters> = {}) => req<Heatmap>(`/api/heatmap${qs(f)}`),
  top: (f: Partial<Filters> = {}, n = 10) => {
    const p = toParams(f)
    p.set('n', String(n))
    return req<TopTrades>(`/api/top?${p}`)
  },
  netByPeriod: (period: string, f: Partial<Filters> = {}) => {
    const p = new URLSearchParams({ period })
    toParams(f).forEach((v, k) => p.set(k, v))
    return req<PeriodItem[]>(`/api/net-by-period?${p}`)
  },
  durations: (f: Partial<Filters> = {}) => req<DurItem[]>(`/api/durations${qs(f)}`),
  equity: (login?: number) => req<EquityPoint[]>(`/api/equity${login ? `?login=${login}` : ''}`),
  positions: (login?: number) => req<Position[]>(`/api/positions${login ? `?login=${login}` : ''}`),
  journalUrl: (f: Partial<Filters> = {}) => {
    const p = toParams(f)
    return `/api/journal.csv?${p}`
  },

  // goals
  goals: () => req<Goal[]>('/api/goals'),
  createGoal: (body: Partial<Goal>) =>
    req<Goal>('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patchGoal: (id: number, body: Partial<Goal>) =>
    req<Goal>(`/api/goals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteGoal: (id: number) => req<{ ok: boolean }>(`/api/goals/${id}`, { method: 'DELETE' }),
  goalPlan: (id: number) => req<GoalPlan>(`/api/goals/${id}/plan`),

  // missions / gamification
  missionsDaily: (login?: number) => req<MissionsDaily>(`/api/missions/daily${login ? `?login=${login}` : ''}`),
  dailyMissionOverrides: () => req<DailyMissionOverride[]>('/api/missions/daily/overrides'),
  putDailyMissionOverride: (key: string, body: Partial<DailyMissionOverride>) =>
    req<{ ok: boolean }>(`/api/missions/daily/overrides/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteDailyMissionOverride: (key: string) =>
    req<{ deleted: number }>(`/api/missions/daily/overrides/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  fxStatus: () => req<{ rate: string; last_update: number; auto: boolean }>('/api/fx/status'),
  fxRefresh: () => req<{ skipped: boolean; rate: number | null }>('/api/fx/refresh', { method: 'POST' }),

  // expenses / finance
  expenses: () => req<Expense[]>('/api/expenses'),
  createExpense: (body: Partial<Expense>) =>
    req<Expense>('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patchExpense: (id: number, body: Partial<Expense>) =>
    req<Expense>(`/api/expenses/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteExpense: (id: number) => req<{ ok: boolean }>(`/api/expenses/${id}`, { method: 'DELETE' }),
  financeSummary: (login?: number, month?: string) => {
    const p = new URLSearchParams()
    if (login) p.set('login', String(login))
    if (month) p.set('month', month)
    const s = p.toString()
    return req<FinanceSummary>(`/api/finance/summary${s ? `?${s}` : ''}`)
  },

  // accounting: transactions
  transactions: (type?: string, month?: string) => {
    const p = new URLSearchParams()
    if (type) p.set('type', type)
    if (month) p.set('month', month)
    const s = p.toString()
    return req<Transaction[]>(`/api/transactions${s ? `?${s}` : ''}`)
  },
  createTransaction: (body: Partial<Transaction>) =>
    req<Transaction>('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patchTransaction: (id: number, body: Partial<Transaction>) =>
    req<Transaction>(`/api/transactions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteTransaction: (id: number) => req<{ ok: boolean }>(`/api/transactions/${id}`, { method: 'DELETE' }),

  // accounting: obligations
  obligations: () => req<ObligationsSummary>('/api/obligations'),
  createObligation: (body: Partial<Obligation>) =>
    req<Obligation>('/api/obligations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patchObligation: (id: number, body: Partial<Obligation>) =>
    req<Obligation>(`/api/obligations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteObligation: (id: number) => req<{ ok: boolean }>(`/api/obligations/${id}`, { method: 'DELETE' }),
  payObligation: (id: number, bank_account_id: number) =>
    req<Obligation>(`/api/obligations/${id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bank_account_id }) }),

  // accounting: bank accounts
  bankAccounts: () => req<BankAccount[]>('/api/bank-accounts'),
  createBankAccount: (body: Partial<BankAccount>) =>
    req<BankAccount>('/api/bank-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patchBankAccount: (id: number, body: Partial<BankAccount>) =>
    req<BankAccount>(`/api/bank-accounts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteBankAccount: (id: number) => req<{ ok: boolean }>(`/api/bank-accounts/${id}`, { method: 'DELETE' }),

  // budgets
  budgets: () => req<Budget[]>('/api/budgets'),
  createBudget: (body: Partial<Budget>) =>
    req<Budget>('/api/budgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patchBudget: (id: number, body: Partial<Budget>) =>
    req<Budget>(`/api/budgets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteBudget: (id: number) => req<{ ok: boolean }>(`/api/budgets/${id}`, { method: 'DELETE' }),

  // news / calendar
  uploadNews: (text: string) =>
    req<{ imported: number; rows: number }>('/api/news/upload', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text }),
  news: () => req<NewsEvent[]>('/api/news'),
  clearNews: () => req<{ deleted: number }>('/api/news', { method: 'DELETE' }),

  // notifications
  notifications: (unreadOnly = false) => req<AppNotification[]>(`/api/notifications${unreadOnly ? '?unread_only=true' : ''}`),
  markNotificationsSeen: (ids: number[]) =>
    req<{ updated: number }>('/api/notifications/seen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }),
  clearNotifications: () => req<{ deleted: number }>('/api/notifications', { method: 'DELETE' }),

  // accounting: summary / series
  accountingSummary: (month?: string) => {
    const p = month ? `?month=${month}` : ''
    return req<AccountingSummary>(`/api/accounting/summary${p}`)
  },
  accountingSeries: (months = 12) => req<AccountingSeriesItem[]>(`/api/accounting/series?months=${months}`),

  // custom missions
  customMissions: () => req<CustomMission[]>('/api/missions/custom'),
  createCustomMission: (body: Partial<CustomMission>) =>
    req<CustomMission>('/api/missions/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  patchCustomMission: (id: number, body: Partial<CustomMission>) =>
    req<CustomMission>(`/api/missions/custom/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteCustomMission: (id: number) => req<{ ok: boolean }>(`/api/missions/custom/${id}`, { method: 'DELETE' }),
}
