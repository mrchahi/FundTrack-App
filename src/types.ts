export type MainCategory = 'overview' | 'trading' | 'finance' | 'growth' | 'assistant' | 'system';

export type OverviewSubTab = 'pulse' | 'actions' | 'digest';
export type TradingSubTab = 'journal' | 'analytics' | 'risk' | 'accounts' | 'calendar';
export type FinanceSubTab = 'summary' | 'transactions' | 'accounts' | 'people' | 'planning' | 'fx';
export type GrowthSubTab = 'goals' | 'quests' | 'badges' | 'custom';
export type SystemSubTab = 'appearance' | 'ai' | 'security' | 'backup' | 'health';

export interface TradeJournalFilter {
  emotion?: EmotionTag;
  setupTag?: string;
  weekday?: number;
  hour?: number;
  durationBucket?: string;
}

export type ThemeId =
  | 'obsidian'
  | 'aurora'
  | 'midnight'
  | 'emerald'
  | 'crimson'
  | 'cyberpunk'
  | 'royal'
  | 'light'
  | 'coral'
  | 'lavender';
export type AppLanguage = 'fa' | 'en';
export type CurrencyCode = 'USD' | 'IRT';
export type TimeRange = 'today' | 'week' | 'month' | 'all';

export interface Mt5Account {
  id: string;
  accountNumber: string;
  broker: string;
  server: string;
  currency: 'USD';
  balance: number;
  equity: number;
  floatingProfit?: number;
  margin?: number;
  freeMargin?: number;
  usdToman: number;
  lastSyncAt: string;
  status: 'active' | 'inactive';
  isDemo?: boolean;
}

export interface EaMetaInfo {
  login: string;
  name: string;
  server: string;
  symbol: string;
  period: string;
  cur: string;
  tz: number;
  updatedAt: string;
}

export interface EaOpenPosition {
  ticket: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  sl: number;
  tp: number;
  profit: number;
  magic: number;
  openTime: string;
}

export interface EaMarketRadarSnapshot {
  tf: string;
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  atr: number;
  atrAvg: number;
  atrRatio: number;
  rsi: number;
  rsiPrev: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  close: number;
  close4: number;
  adx: number;
  pdi: number;
  mdi: number;
  macd: number;
  macdSig: number;
  macdPrev: number;
  macdSigPrev: number;
  bbMid: number;
  bbUp: number;
  bbLo: number;
  vol: number;
  volAvg: number;
  swingHi: number[];
  swingLo: number[];
  dHi: number;
  dLo: number;
  pp: number;
  r1: number;
  s1: number;
  updatedAt: string;
}

export type TradingSession = 'London' | 'New York' | 'Asia';
export type EmotionTag = 'calm' | 'focused' | 'fomo' | 'revenge' | 'hesitant';

export interface Trade {
  id: string;
  ticket: string;
  accountId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  volume: number;
  openTime: string;
  closeTime: string;
  openPrice: number;
  closePrice: number;
  sl: number;
  tp: number;
  slRespected: boolean;
  profitUsd: number;
  commissionUsd?: number;
  swapUsd?: number;
  rMultiple: number;
  session: TradingSession;
  setupTag: string;
  emotionTag: EmotionTag;
  reviewNote: string;
}

export type BankAccountType = 'bank' | 'cash' | 'wallet';

export interface BankAccount {
  id: string;
  name: string;
  type: BankAccountType;
  currency: CurrencyCode;
  balance: number;
  note: string;
}

export type TransactionType = 'in' | 'out' | 'transfer';
export type TransactionSource =
  | 'manual'
  | 'fixed_expense'
  | 'loan_installment'
  | 'credit_installment'
  | 'goal_allocation'
  | 'person_ledger';

export type PaymentMethod = 'bank' | 'cash' | 'usd' | 'credit' | 'person_debt';
export type CreditProvider = 'digipay' | 'snapppay' | 'tara' | 'card' | 'other';

export interface CreditLine {
  id: string;
  title: string;
  provider: CreditProvider;
  creditLimit: number;
  currency: CurrencyCode;
  defaultInstallments: number; // e.g. 4 monthly installments
  dueDayOfMonth: number; // 1..30 (Jalali day of month)
  note: string;
  active: boolean;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  accountId: string;
  toAccountId?: string;
  convertedAmount?: number;
  exchangeRateUsed?: number;
  budgetCategoryId?: string;
  categoryLabel?: string;
  paymentMethod?: PaymentMethod;
  creditLineId?: string;
  installmentCount?: number;
  linkedLoanId?: string;
  linkedPersonEntryId?: string;
  personId?: string;
  date: string;
  note: string;
  source: TransactionSource;
}

export type PersonRole = 'partner' | 'friend' | 'client' | 'family' | 'other';

export interface PersonContact {
  id: string;
  name: string;
  phone?: string;
  role: PersonRole;
  note: string;
  createdAt: string;
}

export type PersonLedgerDirection = 'give' | 'receive';

export interface PersonLedgerEntry {
  id: string;
  personId: string;
  direction: PersonLedgerDirection; // 'give' = we paid/lent them (+receivable), 'receive' = they paid/lent us (-receivable / +payable)
  amount: number;
  currency: CurrencyCode;
  accountId?: string; // Optional linked bank account for real transfer
  linkedTransactionId?: string;
  date: string;
  note: string;
}

export interface FixedExpense {
  id: string;
  title: string;
  amount: number;
  currency: CurrencyCode;
  categoryId?: string;
  recurringMonthly: boolean;
  dayOfMonth: number; // 1..30 (Jalali day)
  lastGeneratedMonth?: string; // e.g. '1405-08'
  active: boolean;
}

export interface BudgetCap {
  id: string;
  categoryName: string;
  sourceAccountId: string;
  percentOfBalance: number;
  rolloverUnused: boolean;
  carriedOverAmount: number;
}

export type LoanKind = 'loan' | 'debt' | 'receivable';

export interface LoanItem {
  id: string;
  kind: LoanKind;
  title: string;
  totalAmount: number;
  currency: CurrencyCode;
  periodLabel: string;
  dueDate: string; // ISO date
  totalInstallments: number;
  paidInstallments: number;
  installmentAmount: number;
  priorityRate: number; // Interest or pressure score (used for Avalanche vs Snowball)
  creditLineId?: string;
  status: 'open' | 'closed';
}

export type GoalStatus = 'draft' | 'active' | 'completed' | 'archived';
export type GoalKind = 'item' | 'monetary';
export type GoalDeadlineMode = 'dated' | 'open_until_funded';
export type GoalBudgetSource = 'weekly_budget' | 'trading_profit' | 'bank_savings';

export interface Goal {
  id: string;
  title: string;
  kind: GoalKind;
  currency: CurrencyCode;
  targetAmount: number;
  savedAmount: number;
  deadlineMode?: GoalDeadlineMode; // 'dated' | 'open_until_funded'
  targetDate: string; // ISO date
  budgetSource: GoalBudgetSource;
  sourceAccountId?: string;
  weeklyBudgetAmount: number;
  priority: number; // 1..5 (1 = Highest)
  allocationPct: number; // 1..100
  autoPriorityBudget?: boolean;
  status: GoalStatus;
  createdAt: string;
  completedAt?: string;
  archivedAt?: string;
}

export interface DailyMissionConfig {
  key: string;
  titleFa: string;
  titleEn: string;
  unit: string;
  defaultTarget: number;
  overrideTarget?: number;
  defaultStars: number;
  overrideStars?: number;
  xpReward: number;
}

export interface CustomMission {
  id: string;
  title: string;
  source: 'manual' | 'goal' | 'expense';
  metric: 'income' | 'cap';
  targetValue: number;
  stars: number;
  xp: number;
  linkedGoalId?: string;
  manualProgress?: number;
}

export interface BadgeItem {
  id: string;
  tier: 1 | 2 | 3 | 4;
  titleFa: string;
  titleEn: string;
  descriptionFa: string;
  descriptionEn: string;
  starThreshold: number;
  unlockedAt?: string;
}

export interface EconomicEvent {
  id: string;
  title: string;
  currency: string;
  impact: 'low' | 'medium' | 'high' | 'normal';
  timestamp: string;
  forecast: string;
  actual: string;
  previous: string;
  alarmEnabled: boolean;
  alarmTriggered: boolean;
}

export interface PersianCalendarHoliday {
  year: number;
  month: number;
  day: number;
  isHoliday: boolean;
  title: string;
}

export interface MarketHoliday {
  id: string;
  title: string;
  market: string;
  date: string;
  isIranOfficial?: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  daysLeft: number;
  source: 'fixed_expense' | 'loan' | 'debt' | 'news' | 'goal' | 'system';
  severity?: 'info' | 'warning' | 'danger' | 'success';
  targetId?: string;
  read: boolean;
  createdAt: string;
}

export type LocalAiProvider =
  | 'gemini'
  | 'jan'
  | 'llama_server'
  | 'ollama'
  | 'lmstudio'
  | 'openrouter'
  | 'openai'
  | 'deepseek'
  | 'custom';

export interface AiModelProfile {
  id: string;
  name: string;
  provider: LocalAiProvider;
  endpoint: string;
  model: string;
  envKeyName?: string;
  purpose: 'general' | 'analytics' | 'fast';
}

export type AssistantChatMode = 'auto' | 'analysis' | 'action' | 'fast';

export interface LocalAiConfig {
  enabled: boolean;
  provider: LocalAiProvider;
  endpoint: string;
  model: string;
  apiKey?: string;
  activeProfileId?: string;
  profiles?: AiModelProfile[];
  thinkingDepth?: 'fast' | 'deep';
  assistantMode?: AssistantChatMode;
}

export interface SystemSettings {
  theme: ThemeId;
  language: AppLanguage;
  glassOpacity: number; // 0.55 - 0.92
  glassBlur: number; // 8 - 24
  highContrastCards: boolean;
  backdropPreset:
    | 'none'
    | 'aurora-mesh'
    | 'obsidian-grid'
    | 'hex-honeycomb'
    | 'diagonal-hatch'
    | 'dot-matrix'
    | 'isometric-cubes'
    | 'circuit-nodes'
    | 'concentric-waves'
    | 'amber-horizon'
    | 'custom';
  backdropCustomUrl: string;
  backdropBlur: number; // 0 - 24
  backdropBrightness: number; // 0.35 - 1.15
  baseCurrency: CurrencyCode;
  showTomanEquivalent: boolean;
  defaultRange: TimeRange;
  fxAutoUpdate: boolean;
  usdToman: number;
  fxUpdatedAt: string;
  fxSource: 'live' | 'cached' | 'fallback';
  weeklyGoalPoolIrt?: number;
  dailyMaxLossPct?: number;
  defaultRiskPct?: number;
  monthlyExpectedIncomeIrt?: number;
  pinEnabled: boolean;
  pinCode: string;
  pinHash?: string;
  autoLockMinutes?: number; // 0 = manual only, >0 = idle minutes before locking
  privateMode?: boolean;
  lanSyncEnabled?: boolean;
  lanSyncUrl?: string;
  lanSyncKey?: string;
  lanAutoFallbackDrive?: boolean;
  e2eEncryptionEnabled?: boolean;
  stateUpdatedAt?: string;
  stateRevision?: number;
  lastLanSyncAt?: string;
  lastSyncMode?: 'lan' | 'gdrive' | 'offline';
  eventFileConnected: boolean;
  eaFilePath?: string;
  eaAutoSync?: boolean;
  lastSyncAt: string;
  lastSystemError: string | null;
  lastBackupAt?: string;
  lastBackupTarget?: 'local' | 'gdrive' | 'lan';
  readAlertIds?: string[];
  dismissedAlertIds?: string[];
  newsAlertLeadMinutes?: number;
  newsAlertSoundEnabled?: boolean;
  localAi?: LocalAiConfig;
}

export interface GamificationState {
  xpTotal: number;
  starsBonus: number;
  streakDays: number;
  streakFreezes: number;
  lastCheckedDay: string;
  claimedComboDays: string[];
  dailyBudgetUnderCapConfirmedDays: string[];
}

export interface ParsedTransactionDraft {
  type: TransactionType;
  amount: number;
  currency: CurrencyCode;
  paymentMethod: PaymentMethod;
  accountId: string;
  toAccountId: string;
  creditLineId: string;
  installmentCount: number;
  personId: string;
  budgetCategoryId: string;
  categoryLabel: string;
  date: string; // YYYY-MM-DD
  note: string;
  confidenceNote?: string;
}

export type AssistantActionPayload =
  | {
      kind: 'add_transaction';
      title: string;
      draft: ParsedTransactionDraft;
    }
  | {
      kind: 'add_credit_line';
      title: string;
      creditTitle: string;
      provider: CreditProvider;
      creditLimit: number;
      currency: CurrencyCode;
      defaultInstallments: number;
      dueDayOfMonth: number;
      note: string;
      active: boolean;
    }
  | {
      kind: 'add_bank_account';
      title: string;
      name: string;
      accountType: BankAccountType;
      currency: CurrencyCode;
      balance: number;
      note: string;
    }
  | {
      kind: 'add_person';
      title: string;
      name: string;
      role: PersonRole;
      phone?: string;
      note: string;
    }
  | {
      kind: 'add_person_entry';
      title: string;
      personId: string;
      personName: string;
      direction: 'give' | 'receive';
      amount: number;
      currency: CurrencyCode;
      accountId?: string;
      note: string;
    }
  | {
      kind: 'add_loan';
      title: string;
      loanTitle: string;
      loanKind: LoanKind;
      totalAmount: number;
      currency: CurrencyCode;
      totalInstallments: number;
      installmentAmount: number;
      dueDate: string;
      periodLabel: string;
      priorityRate: number;
    }
  | {
      kind: 'pay_loan_installment';
      title: string;
      loanId: string;
      loanTitle: string;
      accountId: string;
      installmentAmount: number;
      currency: CurrencyCode;
    }
  | {
      kind: 'add_fixed_expense';
      title: string;
      expenseTitle: string;
      amount: number;
      currency: CurrencyCode;
      dayOfMonth: number;
      recurringMonthly: boolean;
    }
  | {
      kind: 'add_budget_cap';
      title: string;
      categoryName: string;
      sourceAccountId: string;
      percentOfBalance: number;
      rolloverUnused: boolean;
    }
  | {
      kind: 'add_goal';
      title: string;
      goalTitle: string;
      targetAmount: number;
      currency: CurrencyCode;
      goalKind: GoalKind;
      deadlineMode: GoalDeadlineMode;
      targetDate?: string;
      budgetSource: GoalBudgetSource;
      sourceAccountId?: string;
      weeklyBudgetAmount: number;
      priority: number;
      activateImmediately?: boolean;
    }
  | {
      kind: 'activate_goal';
      title: string;
      goalId: string;
      goalTitle: string;
      status: GoalStatus;
      priority?: number;
    }
  | {
      kind: 'contribute_goal';
      title: string;
      goalId: string;
      goalTitle: string;
      amount: number;
      currency: CurrencyCode;
      sourceAccountId?: string;
    }
  | {
      kind: 'add_custom_mission';
      title: string;
      missionTitle: string;
      source: 'manual' | 'goal' | 'expense';
      metric: 'income' | 'cap';
      targetValue: number;
      stars: number;
      xp: number;
      linkedGoalId?: string;
    }
  | {
      kind: 'update_fx_rate';
      title: string;
      mode: 'live' | 'manual';
      usdToman?: number;
    }
  | {
      kind: 'update_panel_settings';
      title: string;
      weeklyGoalPoolIrt?: number;
      dailyMaxLossPct?: number;
      defaultRiskPct?: number;
      monthlyExpectedIncomeIrt?: number;
    }
  | {
      kind: 'save_memory';
      title: string;
      fact: string;
      category: 'preference' | 'rule' | 'context';
    }
  | {
      kind: 'refresh_economic_news';
      title: string;
      currencyFilter?: string;
      impactFilter?: 'all' | 'high' | 'high_medium';
      fetchedEvents?: EconomicEvent[];
      sourceLabel?: string;
    }
  | {
      kind: 'navigate';
      title: string;
      category: MainCategory;
      subTab?: string;
    };

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  editedAt?: string;
  suggestions?: string[];
  quickReplies?: string[];
  action?: AssistantActionPayload;
  status?: 'pending' | 'saved' | 'cancelled';
  editingAction?: boolean;
  savedSummary?: string;
  modelUsed?: string;
  latencyMs?: number;
  isOfflineFallback?: boolean;
  memorySavedFact?: string;
}

export interface AssistantThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessage[];
}

export interface AssistantMemoryItem {
  id: string;
  fact: string;
  category: 'preference' | 'rule' | 'context';
  createdAt: string;
}

export interface FundTrackState {
  mt5Accounts: Mt5Account[];
  trades: Trade[];
  bankAccounts: BankAccount[];
  transactions: Transaction[];
  people: PersonContact[];
  personEntries: PersonLedgerEntry[];
  fixedExpenses: FixedExpense[];
  budgetCaps: BudgetCap[];
  creditLines: CreditLine[];
  loans: LoanItem[];
  goals: Goal[];
  missionConfigs: DailyMissionConfig[];
  customMissions: CustomMission[];
  badges: BadgeItem[];
  economicEvents: EconomicEvent[];
  marketHolidays: MarketHoliday[];
  notifications: NotificationItem[];
  eaMeta?: EaMetaInfo;
  eaPositions?: EaOpenPosition[];
  eaRadar?: Record<string, EaMarketRadarSnapshot>;
  assistantThreads?: AssistantThread[];
  activeAssistantThreadId?: string;
  assistantMemory?: AssistantMemoryItem[];
  lastAssistantGreetedDate?: string;
  settings: SystemSettings;
  gamification: GamificationState;
}
