export type Side = 'buy' | 'sell'
export type Source = 'ea' | 'manual'
export type RangeKey = 'day' | 'week' | 'month' | 'year' | 'all'
export type PageKey = 'dashboard' | 'journal' | 'analytics' | 'accounts' | 'goals' | 'accounting' | 'missions' | 'news' | 'settings' | 'status'

export interface DailyMissionOverride {
  key: string
  enabled: boolean
  target: number | null
  stars: number | null
  updated_at: number
}

export interface DailyMission {
  key: string
  metric: string
  target: number
  xp: number
  stars: number
  current: number | null
  done: boolean
  progress: number
  state: 'todo' | 'active' | 'done'
  title?: string
  desc?: string
}

export interface MissionsDaily {
  date: string
  login: number | null
  missions: DailyMission[]
  totals: {
    today_xp: number
    today_stars: number
    today_done: number
    today_total: number
    week_stars: number
    week_goal: number
    month_stars: number
    month_goal: number
    total_stars: number
    week_xp: number
    total_xp: number
    level: number
    level_name: string
    badges: { key: string; threshold: number; earned_at: number }[]
    days_active: number
    missions_done_total: number
    stars: number
  }
}

export interface Expense {
  id: number
  name: string
  amount: number
  currency: 'USD' | 'IRT'
  note: string
  recurring: number
  day_of_month: number | null
  last_generated: string | null
  created_at: number
}

export interface FinanceAllocation {
  id: number
  name: string
  status: string
  remaining: number
  allocated: number
  reason: string | null
  progress_pct: number
}

export interface FinanceSummary {
  month: string
  login: number | null
  stats: { trades: number; wins: number; net: number; gross_profit: number; gross_loss: number }
  expenses: { total: number; covered: boolean; items: Expense[]; surplus: number }
  allocation: FinanceAllocation[]
}

export type GoalKind = 'money' | 'item'
export type GoalStatus = 'draft' | 'archived' | 'active'

export interface Goal {
  id: number
  name: string
  kind: GoalKind
  item_name: string
  currency: 'USD' | 'IRT'
  target_amount: number
  saved_amount: number
  monthly_income: number
  start_date: string | null
  target_date: string | null
  account_login: number | null
  note: string
  budget_category: string | null
  priority: number
  allocation_pct: number
  status: GoalStatus
  created_at: number
  archived_at: number | null
  activated_at: number | null
}

export interface GoalPlan {
  params: {
    kind: GoalKind
    item_name: string
    currency: 'USD' | 'IRT'
    target_amount: number
    saved_amount: number
    monthly_income: number
    start_date: string | null
    target_date: string | null
  }
  suggested: {
    remaining: number
    months_by_income: number | null
    required_monthly_to_target: number | null
    required_weekly: number | null
    estimated_completion: string | null
    feasible: boolean
    warnings: string[]
  }
  roadmap: { month: number; start_saved: number; end_saved: number; added: number; total_pct: number }[]
  status: {
    current_saved: number
    remaining: number
    progress_pct: number
    elapsed_months: number
    remaining_months: number | null
    estimated_completion: string | null
  }
}

export interface Trade {
  login: number
  position_id: number
  symbol: string
  side: Side
  volume: number
  open_t: number
  close_t: number
  open_price: number
  close_price: number
  sl: number
  tp: number
  gross: number
  commission: number
  swap: number
  fee: number
  net: number
  r_price: number | null
  magic: number
  source: Source
  is_open: number
  open_local: string
  close_local: string
  duration_min: number
  session: string
}

export interface Stats {
  trades: number
  wins: number
  losses: number
  win_rate: number
  net: number
  gross_profit: number
  gross_loss: number
  profit_factor: number | null
  avg_win: number
  avg_loss: number
  expectancy: number
  avg_r_price: number | null
  max_win_streak: number
  max_loss_streak: number
  max_drawdown: number
  avg_duration_min: number
  median_duration_min: number
  best: number
  worst: number
  commission: number
  swap: number
}

export interface CurveItem { t: number; local: string; net: number; cum: number }
export interface PeriodItem {
  period: string; label: string; net: number; trades: number
  wins: number; losses: number; win_rate: number
}
export interface DurItem { label: string; trades: number; wins: number; win_rate: number; net: number }
export interface BreakdownItem extends Stats { key: string | number; label: string }
export interface HeatmapCell { weekday: number; hour: number; net: number; trades: number; win_rate: number }
export interface Heatmap { weekdays: string[]; cells: HeatmapCell[] }
export interface TopTrades { best: Trade[]; worst: Trade[] }

export interface Account {
  login: number
  name: string
  server: string
  currency: string
  symbol: string
  first_seen: number
  last_seen: number
  tz_seconds: number
  usd_toman: number
  note: string
  archived: number
}

export type Lang = 'fa' | 'en'
export type AccentKey =
  | 'indigo' | 'violet' | 'sky' | 'cyan' | 'teal'
  | 'emerald' | 'lime' | 'amber' | 'orange' | 'rose' | 'pink'
export type ThemeKey = 'obsidian' | 'aurora' | 'midnight' | 'frosted-light' | 'cyberpunk' | 'cyberpunk'

export interface Settings {
  currency: string
  base_currency: 'USD' | 'IRT'
  show_toman: boolean
  default_range: RangeKey
  theme: ThemeKey
  accent: AccentKey
  glass_intensity: number
  matte_intensity: number
  lang: 'fa' | 'en'
  pin_set: boolean
  /** watched news-title patterns that trigger notifications (optional). */
  news_watch: string[]
  /** how many minutes before a watched event to notify. */
  news_lead_minutes: number
  /** optional background wallpaper: 'none' | preset key | URL. */
  bg_image: string
  /** blur strength of the background wallpaper (0..1). */
  bg_blur: number
  /** manual brightness of the wallpaper (-100..+100, 0 = neutral). */
  bg_brightness: number
  /** card glass blur (0..1). */
  card_blur: number
  /** card contrast (0..1). */
  card_contrast: number
  /** shared weekly budget allocated to goals. */
  goal_budget_weekly: number
  /** accounting reference account (mt5:LOGIN or bank:ID). */
  acct_ref_account: string
  /** trading account (mt5:LOGIN). */
  acct_trade_account: string
  /** auto-refresh USD→Toman rate (3×/day). */
  fx_auto: boolean
  /** last known USD→Toman rate. */
  fx_rate: string
  /** unix seconds of last successful fetch. */
  fx_last_update: number
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'USD',
  base_currency: 'USD',
  show_toman: false,
  default_range: 'all',
  theme: 'obsidian',
  accent: 'indigo',
  glass_intensity: 0.66,
  matte_intensity: 0.5,
  lang: 'fa',
  pin_set: false,
  news_watch: [],
  news_lead_minutes: 15,
  bg_image: 'none',
  bg_blur: 0.5,
  bg_brightness: 0,
  card_blur: 0.6,
  card_contrast: 0.5,
  goal_budget_weekly: 0,
  acct_ref_account: '',
  acct_trade_account: '',
  fx_auto: true,
  fx_rate: '',
  fx_last_update: 0,
}

export interface FilterOptions {
  symbols: string[]
  sides: Side[]
  sources: Source[]
  magics: number[]
  first_trade: number | null
  last_trade: number | null
}

export interface Position {
  login: number; ticket: number; t: number; symbol: string; side: number
  volume: number; open_price: number; sl: number; tp: number
  profit: number; magic: number; open_time: number
}

export interface EquityPoint { login: number; t: number; balance: number; equity: number; floating: number }

export interface Status {
  events_file: string
  events_file_exists: boolean
  db_file: string
  counts: Record<string, number>
  last_error: string
  server_time: number
}

export interface Filters {
  range: RangeKey
  login?: number
  symbol?: string
  side?: Side
  source?: Source
  session?: string
  from?: string
  to?: string
}

export interface SummaryResponse { stats: Stats; curve: CurveItem[] }

// ---- personal accounting ----

export type TxnType = 'in' | 'out' | 'expense'

export interface Transaction {
  id: number
  txn_type: TxnType
  amount: number
  currency: 'USD' | 'IRT'
  category: string
  note: string
  account_login: number | null
  bank_account_id: number | null
  created_at: number
}

export type BankAccountKind = 'bank' | 'cash' | 'wallet'

export interface BankAccount {
  id: number
  name: string
  kind: BankAccountKind
  currency: 'USD' | 'IRT'
  balance: number
  note: string
  archived: number
  created_at: number
}

export interface AppNotification {
  id: number
  kind: string
  title: string
  body: string
  ref_type: string | null
  ref_id: number | null
  due_date: string | null
  seen: number
  days_left: number | null
  created_at: number
}

export type ObligationKind = 'loan' | 'debt' | 'claim'
export type ObligationPeriod = 'daily' | 'monthly' | 'yearly'

export interface Obligation {
  id: number
  kind: ObligationKind
  title: string
  amount: number
  currency: 'USD' | 'IRT'
  period: ObligationPeriod
  due_date: string | null
  note: string
  status: 'open' | 'closed'
  total_installments: number | null
  paid_installments: number
  installment_amount: number | null
  created_at: number
}

export interface ObligationsSummary {
  total_open: number
  count: number
  by_kind: Record<ObligationKind, number>
  upcoming: Obligation[]
  items: Obligation[]
}

export interface AccountingSummary {
  month: string
  income: number
  expense: number
  expense_items: number
  withdrawals: number
  net: number
  transactions: Transaction[]
  budgets: BudgetUsage[]
  budget_total_limit: number
  budget_remaining: number
}

export interface AccountingSeriesItem {
  month: string
  income: number
  expense: number
  net: number
}

export interface Budget {
  id: number
  category: string
  limit: number
  currency: 'USD' | 'IRT'
  source_type: 'fixed' | 'percent'
  account_login: number | null
  bank_account_id: number | null
  pct: number | null
  created_at: number
}

export interface BudgetUsage {
  id: number
  category: string
  limit: number
  spent: number
  percent: number
  warn: boolean
}

export interface NewsEvent {
  id: number
  title: string
  country: string
  event_date: string
  event_time: string
  impact: string
  forecast: string
  previous: string
  actual: string
  url: string
  created_at: number
  /** UTC epoch seconds for the event time (US Eastern -> UTC). Null if unparseable. */
  ts?: number | null
}

// ---- custom missions ----

export type MissionSource = 'manual' | 'goal' | 'expense'
export type MissionMetric = 'earn' | 'limit'

export interface CustomMission {
  id: number
  title: string
  source: MissionSource
  ref_id: number | null
  metric: MissionMetric
  target: number
  xp: number
  stars: number
  active: number
  created_at: number
}
