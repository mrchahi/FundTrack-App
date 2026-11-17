import {
  BankAccount,
  BudgetCap,
  CreditLine,
  CurrencyCode,
  CustomMission,
  DailyMissionConfig,
  EaMarketRadarSnapshot,
  EaMetaInfo,
  EaOpenPosition,
  FixedExpense,
  FundTrackState,
  Goal,
  LoanItem,
  Mt5Account,
  PersonContact,
  PersonLedgerEntry,
  TimeRange,
  Trade,
  Transaction,
} from '../types';
import {
  addJalaliMonths,
  formatJalaliDate,
  formatJalaliDateTime,
  formatJalaliShort,
  getJalaliMonthBounds,
  getJalaliMonthLength,
  getNextJalaliDayOccurrence,
  toJalali,
  toLocalIsoDate,
} from './jalali';

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  usdToman: number
): number {
  if (from === to) return amount;
  if (!usdToman || usdToman <= 0) {
    throw new Error('نرخ تبدیل دلار به تومان تنظیم نشده است');
  }
  if (from === 'USD' && to === 'IRT') return Math.round(amount * usdToman);
  return Number((amount / usdToman).toFixed(2));
}

export const PRIVATE_MASK = '••••••';

export function maskText(value: string, privateMode = false): string {
  return privateMode ? '••••' : value;
}

export function formatUsdInline(amount: number, privateMode = false, signed = true): string {
  if (privateMode) return PRIVATE_MASK;
  const rounded = Number(amount.toFixed(2));
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? '-' : signed && rounded > 0 ? '+' : '';
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  lang: 'fa' | 'en' = 'fa',
  compact = false,
  privateMode = false
): string {
  if (privateMode) return PRIVATE_MASK;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (currency === 'USD') {
    if (compact && abs >= 1000) {
      return `${sign}$${(abs / 1000).toFixed(1)}k`;
    }
    return `${sign}$${abs.toLocaleString('en-US', {
      minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (compact && abs >= 1_000_000) {
    const millions = (abs / 1_000_000).toFixed(1);
    return lang === 'fa' ? `${sign}${millions} م.ت` : `${sign}${millions}M IRT`;
  }
  const formatted = Math.round(abs).toLocaleString('en-US');
  return lang === 'fa' ? `${sign}${formatted} ت` : `${sign}${formatted} IRT`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getTodayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function filterTradesByRange(trades: Trade[], range: TimeRange): Trade[] {
  if (range === 'all') return trades;
  const now = new Date();
  const start = new Date(now);
  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    start.setDate(now.getDate() - 7);
  } else if (range === 'month') {
    start.setDate(now.getDate() - 30);
  }
  return trades.filter((t) => new Date(t.closeTime).getTime() >= start.getTime());
}

export interface DurationBucketStat {
  label: string;
  trades: number;
  wins: number;
  winRate: number;
  net: number;
}

export interface HourlyStat {
  hour: number;
  label: string;
  trades: number;
  wins: number;
  winRate: number;
  net: number;
}

export interface SideStat {
  side: 'BUY' | 'SELL';
  trades: number;
  wins: number;
  winRate: number;
  net: number;
  avgR: number;
}

export interface HeatmapCell {
  weekday: number; // 0=Saturday .. 6=Friday
  weekdayLabel: string;
  hour: number;
  net: number;
  trades: number;
  wins: number;
  winRate: number;
}

export interface PeriodStat {
  label: string;
  net: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface TradingKpis {
  netProfitUsd: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  profitFactor: number;
  expectancyUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  avgR: number;
  maxWinStreak: number;
  maxLossStreak: number;
  bestTradeUsd: number;
  worstTradeUsd: number;
  maxDrawdownUsd: number;
  avgDurationMin: number;
  medianDurationMin: number;
  totalCommissionUsd: number;
  totalSwapUsd: number;
  slCompliancePct: number;
  buyCount: number;
  sellCount: number;
  bestDayLabel: string;
  bestDayProfitUsd: number;
  equityCurve: Array<{
    label: string;
    dateLabel?: string;
    equity: number;
    cumPnl: number;
    profit: number;
    tradesCount?: number;
  }>;
  weekdayBreakdown: Array<{ day: string; profit: number; count: number; winRate: number }>;
  durationBuckets: DurationBucketStat[];
  hourlyBreakdown: HourlyStat[];
  sideBreakdown: SideStat[];
  periodBreakdown: PeriodStat[];
  heatmapCells: HeatmapCell[];
  topBestTrades: Trade[];
  topWorstTrades: Trade[];
}

export const PERSIAN_WEEKDAYS_ORDER = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
];

export interface TradingKpiOptions {
  initialBalance?: number;
  currentEquityUsd?: number;
  groupByDay?: boolean;
  lang?: 'fa' | 'en';
}

export function computeTradingKpis(
  trades: Trade[],
  initialBalanceOrOptions: number | TradingKpiOptions = 10000
): TradingKpis {
  const opts: TradingKpiOptions =
    typeof initialBalanceOrOptions === 'number'
      ? { initialBalance: initialBalanceOrOptions }
      : initialBalanceOrOptions;

  const lang = opts.lang ?? 'fa';
  const groupByDay = opts.groupByDay ?? false;
  const sorted = [...trades].sort(
    (a, b) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()
  );

  const totalRangeNetUsd = sorted.reduce((sum, t) => sum + t.profitUsd, 0);
  const startBalance =
    opts.currentEquityUsd !== undefined && Number.isFinite(opts.currentEquityUsd)
      ? Math.max(0, Number((opts.currentEquityUsd - totalRangeNetUsd).toFixed(2)))
      : opts.initialBalance ?? 10000;

  if (sorted.length === 0) {
    return {
      netProfitUsd: 0,
      grossProfitUsd: 0,
      grossLossUsd: 0,
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      profitFactor: 0,
      expectancyUsd: 0,
      avgWinUsd: 0,
      avgLossUsd: 0,
      avgR: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      bestTradeUsd: 0,
      worstTradeUsd: 0,
      maxDrawdownUsd: 0,
      avgDurationMin: 0,
      medianDurationMin: 0,
      totalCommissionUsd: 0,
      totalSwapUsd: 0,
      slCompliancePct: 100,
      buyCount: 0,
      sellCount: 0,
      bestDayLabel: '—',
      bestDayProfitUsd: 0,
      equityCurve: [],
      weekdayBreakdown: [],
      durationBuckets: [],
      hourlyBreakdown: [],
      sideBreakdown: [],
      periodBreakdown: [],
      heatmapCells: [],
      topBestTrades: [],
      topWorstTrades: [],
    };
  }

  let netProfitUsd = 0;
  let grossProfitUsd = 0;
  let grossLossUsd = 0;
  let winCount = 0;
  let lossCount = 0;
  let totalR = 0;
  let slRespectedCount = 0;
  let buyCount = 0;
  let sellCount = 0;
  let bestTradeUsd = -Infinity;
  let worstTradeUsd = Infinity;
  let totalCommissionUsd = 0;
  let totalSwapUsd = 0;

  let curWinStreak = 0;
  let curLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  let runningEquity = startBalance;
  let peakEquity = startBalance;
  let maxDrawdownUsd = 0;

  const durationsMin: number[] = [];
  const rawTradeCurve: Array<{
    label: string;
    dateLabel: string;
    equity: number;
    cumPnl: number;
    profit: number;
    tradesCount: number;
  }> = [
    {
      label: lang === 'fa' ? 'شروع' : 'Start',
      dateLabel: sorted[0] ? formatJalaliDate(sorted[0].closeTime, lang) : '',
      equity: Number(startBalance.toFixed(2)),
      cumPnl: 0,
      profit: 0,
      tradesCount: 0,
    },
  ];
  // Map JS getDay() (0=Sun..6=Sat) -> Persian week index (0=Sat..6=Fri)
  const jsDayToSatIdx = (jsDay: number) => (jsDay + 1) % 7;

  const dayMap = new Map<number, { profit: number; count: number; wins: number }>();
  const hourMap = new Map<number, { net: number; count: number; wins: number }>();
  const heatmapMap = new Map<string, { wd: number; hr: number; net: number; count: number; wins: number }>();
  const periodMap = new Map<string, Trade[]>();

  for (const t of sorted) {
    netProfitUsd += t.profitUsd;
    if (t.profitUsd > 0) {
      winCount += 1;
      grossProfitUsd += t.profitUsd;
      curWinStreak += 1;
      curLossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, curWinStreak);
    } else if (t.profitUsd < 0) {
      lossCount += 1;
      grossLossUsd += Math.abs(t.profitUsd);
      curLossStreak += 1;
      curWinStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, curLossStreak);
    }

    totalR += t.rMultiple;
    totalCommissionUsd += t.commissionUsd ?? 0;
    totalSwapUsd += t.swapUsd ?? 0;
    if (t.slRespected) slRespectedCount += 1;
    if (t.direction === 'BUY') buyCount += 1;
    else sellCount += 1;

    bestTradeUsd = Math.max(bestTradeUsd, t.profitUsd);
    worstTradeUsd = Math.min(worstTradeUsd, t.profitUsd);

    const openMs = new Date(t.openTime).getTime();
    const closeMs = new Date(t.closeTime).getTime();
    const durMin = closeMs > openMs ? (closeMs - openMs) / 60000 : 0;
    durationsMin.push(durMin);

    runningEquity += t.profitUsd;
    if (runningEquity > peakEquity) peakEquity = runningEquity;
    const dd = peakEquity - runningEquity;
    if (dd > maxDrawdownUsd) maxDrawdownUsd = dd;

    const d = new Date(t.closeTime);
    const timeHm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    rawTradeCurve.push({
      label: `${t.symbol} · ${timeHm}`,
      dateLabel: formatJalaliDateTime(t.closeTime, lang),
      equity: Number(runningEquity.toFixed(2)),
      cumPnl: Number(netProfitUsd.toFixed(2)),
      profit: Number(t.profitUsd.toFixed(2)),
      tradesCount: 1,
    });

    const wdIdx = jsDayToSatIdx(d.getDay());
    const hr = d.getHours();

    const curDay = dayMap.get(wdIdx) ?? { profit: 0, count: 0, wins: 0 };
    dayMap.set(wdIdx, {
      profit: Number((curDay.profit + t.profitUsd).toFixed(2)),
      count: curDay.count + 1,
      wins: curDay.wins + (t.profitUsd > 0 ? 1 : 0),
    });

    const curHr = hourMap.get(hr) ?? { net: 0, count: 0, wins: 0 };
    hourMap.set(hr, {
      net: Number((curHr.net + t.profitUsd).toFixed(2)),
      count: curHr.count + 1,
      wins: curHr.wins + (t.profitUsd > 0 ? 1 : 0),
    });

    const hmKey = `${wdIdx}_${hr}`;
    const curHm = heatmapMap.get(hmKey) ?? { wd: wdIdx, hr, net: 0, count: 0, wins: 0 };
    heatmapMap.set(hmKey, {
      wd: wdIdx,
      hr,
      net: Number((curHm.net + t.profitUsd).toFixed(2)),
      count: curHm.count + 1,
      wins: curHm.wins + (t.profitUsd > 0 ? 1 : 0),
    });

    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const pArr = periodMap.get(dateKey) ?? [];
    pArr.push(t);
    periodMap.set(dateKey, pArr);
  }

  let equityCurve = rawTradeCurve;
  if (groupByDay && periodMap.size > 1) {
    let dayRunningEq = startBalance;
    let dayCumPnl = 0;
    const sortedDays = Array.from(periodMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    equityCurve = [
      {
        label: lang === 'fa' ? 'شروع' : 'Start',
        dateLabel: sortedDays[0] ? formatJalaliDate(sortedDays[0][1][0].closeTime, lang) : '',
        equity: Number(startBalance.toFixed(2)),
        cumPnl: 0,
        profit: 0,
        tradesCount: 0,
      },
      ...sortedDays.map(([, grp]) => {
        const dayProfit = Number(grp.reduce((s, tr) => s + tr.profitUsd, 0).toFixed(2));
        dayRunningEq += dayProfit;
        dayCumPnl += dayProfit;
        const sampleTime = grp[0].closeTime;
        return {
          label:
            lang === 'fa'
              ? formatJalaliShort(sampleTime).slice(5)
              : formatJalaliDate(sampleTime, 'en'),
          dateLabel: formatJalaliDate(sampleTime, lang),
          equity: Number(dayRunningEq.toFixed(2)),
          cumPnl: Number(dayCumPnl.toFixed(2)),
          profit: dayProfit,
          tradesCount: grp.length,
        };
      }),
    ];
  }

  const tradeCount = sorted.length;
  const winRateDecimal = winCount / tradeCount;
  const avgWinUsd = winCount > 0 ? Number((grossProfitUsd / winCount).toFixed(2)) : 0;
  const avgLossUsd = lossCount > 0 ? Number((grossLossUsd / lossCount).toFixed(2)) : 0;
  const expectancyUsd = Number(
    (winRateDecimal * avgWinUsd - (1 - winRateDecimal) * avgLossUsd).toFixed(2)
  );

  const sortedDurs = [...durationsMin].sort((a, b) => a - b);
  const medianDurationMin = sortedDurs.length
    ? Math.round(sortedDurs[Math.floor(sortedDurs.length / 2)])
    : 0;
  const avgDurationMin = Math.round(
    durationsMin.reduce((s, v) => s + v, 0) / Math.max(1, durationsMin.length)
  );

  // Duration Buckets (identical edges to fundtrack-py/analytics.py)
  const bucketDefs: Array<[string, number, number | null]> = [
    ['0-15m', 0, 15],
    ['15m-1h', 15, 60],
    ['1-4h', 60, 240],
    ['4-12h', 240, 720],
    ['12-24h', 720, 1440],
    ['>24h', 1440, null],
  ];
  const durationBuckets: DurationBucketStat[] = [];
  for (const [label, lo, hi] of bucketDefs) {
    const grp = sorted.filter((_, idx) => {
      const m = durationsMin[idx];
      return m >= lo && (hi === null || m < hi);
    });
    if (grp.length === 0) continue;
    const w = grp.filter((g) => g.profitUsd > 0).length;
    durationBuckets.push({
      label,
      trades: grp.length,
      wins: w,
      winRate: Number(((w / grp.length) * 100).toFixed(1)),
      net: Number(grp.reduce((s, g) => s + g.profitUsd, 0).toFixed(2)),
    });
  }

  let bestDayLabel = '—';
  let bestDayProfitUsd = -Infinity;
  const weekdayBreakdown = Array.from(dayMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([wdIdx, val]) => {
      const dayName = PERSIAN_WEEKDAYS_ORDER[wdIdx] ?? '—';
      if (val.profit > bestDayProfitUsd) {
        bestDayProfitUsd = val.profit;
        bestDayLabel = dayName;
      }
      return {
        day: dayName,
        profit: val.profit,
        count: val.count,
        winRate: Number(((val.wins / Math.max(1, val.count)) * 100).toFixed(1)),
      };
    });

  const hourlyBreakdown: HourlyStat[] = Array.from(hourMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, val]) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      trades: val.count,
      wins: val.wins,
      winRate: Number(((val.wins / Math.max(1, val.count)) * 100).toFixed(1)),
      net: val.net,
    }));

  const sideBreakdown: SideStat[] = (['BUY', 'SELL'] as const).map((side) => {
    const grp = sorted.filter((tr) => tr.direction === side);
    const w = grp.filter((tr) => tr.profitUsd > 0).length;
    const net = grp.reduce((s, tr) => s + tr.profitUsd, 0);
    const avgR = grp.length > 0 ? grp.reduce((s, tr) => s + tr.rMultiple, 0) / grp.length : 0;
    return {
      side,
      trades: grp.length,
      wins: w,
      winRate: grp.length > 0 ? Number(((w / grp.length) * 100).toFixed(1)) : 0,
      net: Number(net.toFixed(2)),
      avgR: Number(avgR.toFixed(2)),
    };
  });

  const periodBreakdown: PeriodStat[] = Array.from(periodMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, grp]) => {
      const w = grp.filter((tr) => tr.profitUsd > 0).length;
      return {
        label: key.slice(5),
        net: Number(grp.reduce((s, tr) => s + tr.profitUsd, 0).toFixed(2)),
        trades: grp.length,
        wins: w,
        losses: grp.length - w,
        winRate: Number(((w / Math.max(1, grp.length)) * 100).toFixed(1)),
      };
    });

  const heatmapCells: HeatmapCell[] = Array.from(heatmapMap.values()).map((c) => ({
    weekday: c.wd,
    weekdayLabel: PERSIAN_WEEKDAYS_ORDER[c.wd] ?? '—',
    hour: c.hr,
    net: c.net,
    trades: c.count,
    wins: c.wins,
    winRate: Number(((c.wins / Math.max(1, c.count)) * 100).toFixed(1)),
  }));

  const byProfitDesc = [...sorted].sort((a, b) => b.profitUsd - a.profitUsd);
  const topBestTrades = byProfitDesc.filter((tr) => tr.profitUsd > 0).slice(0, 4);
  const topWorstTrades = [...byProfitDesc].reverse().filter((tr) => tr.profitUsd < 0).slice(0, 4);

  const profitFactor =
    grossLossUsd === 0
      ? grossProfitUsd > 0
        ? 9.99
        : 0
      : Number((grossProfitUsd / grossLossUsd).toFixed(2));

  return {
    netProfitUsd: Number(netProfitUsd.toFixed(2)),
    grossProfitUsd: Number(grossProfitUsd.toFixed(2)),
    grossLossUsd: Number(grossLossUsd.toFixed(2)),
    tradeCount,
    winCount,
    lossCount,
    winRate: Number((winRateDecimal * 100).toFixed(1)),
    profitFactor,
    expectancyUsd,
    avgWinUsd,
    avgLossUsd,
    avgR: Number((totalR / tradeCount).toFixed(2)),
    maxWinStreak,
    maxLossStreak,
    bestTradeUsd: bestTradeUsd === -Infinity ? 0 : Number(bestTradeUsd.toFixed(2)),
    worstTradeUsd: worstTradeUsd === Infinity ? 0 : Number(worstTradeUsd.toFixed(2)),
    maxDrawdownUsd: Number(maxDrawdownUsd.toFixed(2)),
    avgDurationMin,
    medianDurationMin,
    totalCommissionUsd: Number(totalCommissionUsd.toFixed(2)),
    totalSwapUsd: Number(totalSwapUsd.toFixed(2)),
    slCompliancePct: Number(((slRespectedCount / tradeCount) * 100).toFixed(1)),
    buyCount,
    sellCount,
    bestDayLabel,
    bestDayProfitUsd: bestDayProfitUsd === -Infinity ? 0 : bestDayProfitUsd,
    equityCurve,
    weekdayBreakdown,
    durationBuckets,
    hourlyBreakdown,
    sideBreakdown,
    periodBreakdown,
    heatmapCells,
    topBestTrades,
    topWorstTrades,
  };
}

export interface BudgetStatus {
  budget: BudgetCap;
  sourceAccountName: string;
  capAmount: number;
  currency: CurrencyCode;
  spentAmount: number;
  remainingAmount: number;
  utilizationPct: number;
  pacePct: number;
  paceStatus: 'healthy' | 'warning' | 'exceeded';
}

export interface DebtFirstWaterfall {
  bankLiquidityIrt: number;
  tier1InstallmentsAndLoansIrt: number;
  tier1PersonalDebtsIrt: number;
  tier1TotalIrt: number;
  tier1CoveredPct: number;
  tier2FixedBillsIrt: number;
  tier2CoveredPct: number;
  tier3GoalAndBudgetPoolIrt: number;
  discretionaryLeftAfterGoalsIrt: number;
  priorityDebtCount: number;
  isDebtProtected: boolean;
}

export interface CreditLineStatus {
  line: CreditLine;
  usedAmount: number;
  availableAmount: number;
  utilizationPct: number;
  activePlansCount: number;
}

export interface FinanceSummary {
  totalBankIrt: number;
  totalTradingIrt: number;
  totalDebtIrt: number;
  personalDebtsPayableIrt: number;
  netWorthIrt: number;
  netWorthUsd: number;
  upcomingFixedBillsIrt: number;
  upcomingInstallmentsIrt: number;
  goalReservedIrt: number;
  safeToSpendIrt: number;
  safeToSpendUsd: number;
  monthlyInIrt: number;
  monthlyOutIrt: number;
  savingsRatePct: number;
  // Strictly separated native-currency totals (zero cross-currency mixing)
  bankIrt: number;
  bankUsd: number;
  totalTradingUsd: number;
  monthlyInIrtOnly: number;
  monthlyOutIrtOnly: number;
  monthlyInUsdOnly: number;
  monthlyOutUsdOnly: number;
  totalDebtIrtOnly: number;
  totalDebtUsdOnly: number;
  personalPayablesIrtOnly: number;
  personalPayablesUsdOnly: number;
  upcomingBillsIrtOnly: number;
  upcomingBillsUsdOnly: number;
  upcomingInstallmentsIrtOnly: number;
  upcomingInstallmentsUsdOnly: number;
  goalReservedIrtOnly: number;
  goalReservedUsdOnly: number;
  safeToSpendIrtOnly: number;
  safeToSpendUsdOnly: number;
  savingsRateIrtPct: number;
  creditTotalLimitIrt: number;
  creditUsedIrt: number;
  creditAvailableIrt: number;
  creditLinesStatus: CreditLineStatus[];
  budgetStatuses: BudgetStatus[];
  debtFirstWaterfall: DebtFirstWaterfall;
}

export function computeFinanceSummary(
  bankAccounts: BankAccount[],
  mt5Accounts: Mt5Account[],
  transactions: Transaction[],
  fixedExpenses: FixedExpense[],
  budgetCaps: BudgetCap[],
  loans: LoanItem[],
  goals: Goal[],
  usdToman: number,
  people: PersonContact[] = [],
  personEntries: PersonLedgerEntry[] = [],
  creditLines: CreditLine[] = []
): FinanceSummary {
  const bankIrt = bankAccounts
    .filter((acc) => acc.currency === 'IRT')
    .reduce((sum, acc) => sum + acc.balance, 0);
  const bankUsd = Number(
    bankAccounts
      .filter((acc) => acc.currency === 'USD')
      .reduce((sum, acc) => sum + acc.balance, 0)
      .toFixed(2)
  );

  const totalBankIrt = bankAccounts.reduce(
    (sum, acc) => sum + convertCurrency(acc.balance, acc.currency, 'IRT', usdToman),
    0
  );

  const totalTradingUsd = Number(
    mt5Accounts
      .filter((acc) => !acc.isDemo)
      .reduce((sum, acc) => sum + acc.equity, 0)
      .toFixed(2)
  );

  const totalTradingIrt = mt5Accounts
    .filter((acc) => !acc.isDemo)
    .reduce((sum, acc) => sum + convertCurrency(acc.equity, 'USD', 'IRT', usdToman), 0);

  const openDebts = loans.filter((l) => l.status === 'open' && l.kind !== 'receivable');
  const loanDebtIrtOnly = openDebts
    .filter((l) => l.currency === 'IRT')
    .reduce((sum, l) => sum + Math.max(0, l.totalInstallments - l.paidInstallments) * l.installmentAmount, 0);
  const loanDebtUsdOnly = Number(
    openDebts
      .filter((l) => l.currency === 'USD')
      .reduce((sum, l) => sum + Math.max(0, l.totalInstallments - l.paidInstallments) * l.installmentAmount, 0)
      .toFixed(2)
  );
  const loanDebtIrt = openDebts.reduce((sum, l) => {
    const remainingInstallments = Math.max(0, l.totalInstallments - l.paidInstallments);
    const remAmount = remainingInstallments * l.installmentAmount;
    return sum + convertCurrency(remAmount, l.currency, 'IRT', usdToman);
  }, 0);

  const peopleOverview = computePersonLedgers(people, personEntries, usdToman);
  const personalDebtsPayableIrt = peopleOverview.totalPayableIrt;
  const personalPayablesIrtOnly = peopleOverview.totalPayableIrtOnly;
  const personalPayablesUsdOnly = peopleOverview.totalPayableUsdOnly;
  const totalDebtIrtOnly = loanDebtIrtOnly + personalPayablesIrtOnly;
  const totalDebtUsdOnly = Number((loanDebtUsdOnly + personalPayablesUsdOnly).toFixed(2));
  const totalDebtIrt = loanDebtIrt + personalDebtsPayableIrt;

  const netWorthIrt = totalBankIrt + totalTradingIrt - totalDebtIrt;
  const netWorthUsd = convertCurrency(netWorthIrt, 'IRT', 'USD', usdToman);

  const now = new Date();
  const jalaliBounds = getJalaliMonthBounds(now);
  const currentJalali = { jy: jalaliBounds.jy, jm: jalaliBounds.jm, jd: jalaliBounds.jd };
  const dayProgressPct = Math.min(
    100,
    Math.round((currentJalali.jd / Math.max(1, jalaliBounds.monthLength)) * 100)
  );

  const activeUpcomingBills = fixedExpenses.filter(
    (fe) => fe.active && fe.dayOfMonth >= currentJalali.jd
  );
  const upcomingBillsIrtOnly = activeUpcomingBills
    .filter((fe) => fe.currency === 'IRT')
    .reduce((sum, fe) => sum + fe.amount, 0);
  const upcomingBillsUsdOnly = Number(
    activeUpcomingBills
      .filter((fe) => fe.currency === 'USD')
      .reduce((sum, fe) => sum + fe.amount, 0)
      .toFixed(2)
  );
  const upcomingFixedBillsIrt = activeUpcomingBills.reduce(
    (sum, fe) => sum + convertCurrency(fe.amount, fe.currency, 'IRT', usdToman),
    0
  );

  const upcomingInstallmentsIrtOnly = openDebts
    .filter((l) => l.currency === 'IRT')
    .reduce((sum, l) => sum + l.installmentAmount, 0);
  const upcomingInstallmentsUsdOnly = Number(
    openDebts
      .filter((l) => l.currency === 'USD')
      .reduce((sum, l) => sum + l.installmentAmount, 0)
      .toFixed(2)
  );
  const upcomingInstallmentsIrt = openDebts.reduce(
    (sum, l) => sum + convertCurrency(l.installmentAmount, l.currency, 'IRT', usdToman),
    0
  );

  // Debt-First Budget Allocation Waterfall:
  // Tier 1 (Highest Priority): Installments + Loans + Personal Payables
  // Tier 2: Upcoming Fixed Bills
  // Tier 3: Available for Budgets & Goals
  const tier1TotalIrt = upcomingInstallmentsIrt + personalDebtsPayableIrt;
  const afterTier1Irt = Math.max(0, totalBankIrt - tier1TotalIrt);
  const tier1CoveredPct =
    tier1TotalIrt <= 0 ? 100 : Math.min(100, Math.round((totalBankIrt / tier1TotalIrt) * 100));

  const tier2CoveredPct =
    upcomingFixedBillsIrt <= 0
      ? 100
      : Math.min(100, Math.round((afterTier1Irt / upcomingFixedBillsIrt) * 100));
  const afterTier2Irt = Math.max(0, afterTier1Irt - upcomingFixedBillsIrt);

  const activeGoals = goals.filter((g) => g.status === 'active');
  const goalReservedIrtOnly = activeGoals
    .filter((g) => g.currency === 'IRT')
    .reduce((sum, g) => sum + g.weeklyBudgetAmount, 0);
  const goalReservedUsdOnly = Number(
    activeGoals
      .filter((g) => g.currency === 'USD')
      .reduce((sum, g) => sum + g.weeklyBudgetAmount, 0)
      .toFixed(2)
  );
  const goalReservedIrt = activeGoals.reduce(
    (sum, g) => sum + convertCurrency(g.weeklyBudgetAmount, g.currency, 'IRT', usdToman),
    0
  );

  const safeToSpendIrt = Math.max(0, afterTier2Irt - goalReservedIrt);
  const safeToSpendUsd = convertCurrency(safeToSpendIrt, 'IRT', 'USD', usdToman);

  const safeToSpendIrtOnly = Math.max(
    0,
    bankIrt -
      upcomingInstallmentsIrtOnly -
      personalPayablesIrtOnly -
      upcomingBillsIrtOnly -
      goalReservedIrtOnly
  );
  const safeToSpendUsdOnly = Number(
    Math.max(
      0,
      bankUsd -
        upcomingInstallmentsUsdOnly -
        personalPayablesUsdOnly -
        upcomingBillsUsdOnly -
        goalReservedUsdOnly
    ).toFixed(2)
  );

  const payablePeopleCount = peopleOverview.ledgers.filter((l) => l.status === 'payable').length;

  const debtFirstWaterfall: DebtFirstWaterfall = {
    bankLiquidityIrt: totalBankIrt,
    tier1InstallmentsAndLoansIrt: upcomingInstallmentsIrt,
    tier1PersonalDebtsIrt: personalDebtsPayableIrt,
    tier1TotalIrt,
    tier1CoveredPct,
    tier2FixedBillsIrt: upcomingFixedBillsIrt,
    tier2CoveredPct,
    tier3GoalAndBudgetPoolIrt: afterTier2Irt,
    discretionaryLeftAfterGoalsIrt: safeToSpendIrt,
    priorityDebtCount: openDebts.length + payablePeopleCount,
    isDebtProtected: totalBankIrt >= tier1TotalIrt,
  };

  // Current Jalali calendar month cashflow (from 1st day of current Jalali month to now)
  const monthStartMs = jalaliBounds.start.getTime();
  let monthlyInIrt = 0;
  let monthlyOutIrt = 0;
  let monthlyInIrtOnly = 0;
  let monthlyOutIrtOnly = 0;
  let monthlyInUsdOnly = 0;
  let monthlyOutUsdOnly = 0;

  for (const tx of transactions) {
    const tMs = new Date(tx.date).getTime();
    if (tMs < monthStartMs) continue;
    if (tx.type === 'in') {
      monthlyInIrt += convertCurrency(tx.amount, tx.currency, 'IRT', usdToman);
      if (tx.currency === 'IRT') monthlyInIrtOnly += tx.amount;
      else monthlyInUsdOnly += tx.amount;
    } else if (tx.type === 'out') {
      monthlyOutIrt += convertCurrency(tx.amount, tx.currency, 'IRT', usdToman);
      if (tx.currency === 'IRT') monthlyOutIrtOnly += tx.amount;
      else monthlyOutUsdOnly += tx.amount;
    }
  }

  const savingsRatePct =
    monthlyInIrt > 0
      ? Number((((monthlyInIrt - monthlyOutIrt) / monthlyInIrt) * 100).toFixed(1))
      : 0;
  const savingsRateIrtPct =
    monthlyInIrtOnly > 0
      ? Number((((monthlyInIrtOnly - monthlyOutIrtOnly) / monthlyInIrtOnly) * 100).toFixed(1))
      : monthlyInUsdOnly > 0
      ? Number((((monthlyInUsdOnly - monthlyOutUsdOnly) / monthlyInUsdOnly) * 100).toFixed(1))
      : 0;

  const creditLinesStatus: CreditLineStatus[] = creditLines.map((line) => {
    const linkedOpenLoans = loans.filter(
      (l) => l.status === 'open' && l.creditLineId === line.id
    );
    const usedAmount = linkedOpenLoans.reduce((sum, l) => {
      const rem = Math.max(0, l.totalInstallments - l.paidInstallments) * l.installmentAmount;
      return sum + convertCurrency(rem, l.currency, line.currency, usdToman);
    }, 0);
    const availableAmount = Math.max(0, line.creditLimit - usedAmount);
    const utilizationPct =
      line.creditLimit > 0 ? Math.min(100, Math.round((usedAmount / line.creditLimit) * 100)) : 0;
    return {
      line,
      usedAmount,
      availableAmount,
      utilizationPct,
      activePlansCount: linkedOpenLoans.length,
    };
  });

  const creditTotalLimitIrt = creditLinesStatus
    .filter((c) => c.line.active)
    .reduce((sum, c) => sum + convertCurrency(c.line.creditLimit, c.line.currency, 'IRT', usdToman), 0);
  const creditUsedIrt = creditLinesStatus
    .filter((c) => c.line.active)
    .reduce((sum, c) => sum + convertCurrency(c.usedAmount, c.line.currency, 'IRT', usdToman), 0);
  const creditAvailableIrt = Math.max(0, creditTotalLimitIrt - creditUsedIrt);

  const budgetStatuses: BudgetStatus[] = budgetCaps.map((b) => {
    const src = bankAccounts.find((a) => a.id === b.sourceAccountId);
    const currency = src?.currency ?? 'IRT';
    const debtProtectionReserveInCurr =
      totalBankIrt > 0 && src
        ? convertCurrency(
            Math.min(tier1TotalIrt, totalBankIrt) *
              (convertCurrency(src.balance, src.currency, 'IRT', usdToman) / totalBankIrt),
            'IRT',
            currency,
            usdToman
          )
        : 0;
    const allocatableBalance = src ? Math.max(0, src.balance - debtProtectionReserveInCurr) : 0;
    const baseCap = (allocatableBalance * b.percentOfBalance) / 100;
    const capAmount = Math.max(0, baseCap + (b.rolloverUnused ? b.carriedOverAmount : 0));

    const spentAmount = transactions
      .filter((tx) => tx.type === 'out' && tx.budgetCategoryId === b.id && new Date(tx.date).getTime() >= monthStartMs)
      .reduce((sum, tx) => sum + convertCurrency(tx.amount, tx.currency, currency, usdToman), 0);

    const utilizationPct = capAmount > 0 ? Number(((spentAmount / capAmount) * 100).toFixed(1)) : 0;
    let paceStatus: 'healthy' | 'warning' | 'exceeded' = 'healthy';
    if (utilizationPct >= 100) paceStatus = 'exceeded';
    else if (utilizationPct > dayProgressPct + 12 || utilizationPct >= 80) paceStatus = 'warning';

    return {
      budget: b,
      sourceAccountName: src?.name ?? 'حساب نامشخص',
      capAmount,
      currency,
      spentAmount,
      remainingAmount: Math.max(0, capAmount - spentAmount),
      utilizationPct,
      pacePct: dayProgressPct,
      paceStatus,
    };
  });

  return {
    totalBankIrt,
    totalTradingIrt,
    totalDebtIrt,
    personalDebtsPayableIrt,
    netWorthIrt,
    netWorthUsd,
    upcomingFixedBillsIrt,
    upcomingInstallmentsIrt,
    goalReservedIrt,
    safeToSpendIrt,
    safeToSpendUsd,
    monthlyInIrt,
    monthlyOutIrt,
    savingsRatePct,
    bankIrt,
    bankUsd,
    totalTradingUsd,
    monthlyInIrtOnly,
    monthlyOutIrtOnly,
    monthlyInUsdOnly: Number(monthlyInUsdOnly.toFixed(2)),
    monthlyOutUsdOnly: Number(monthlyOutUsdOnly.toFixed(2)),
    totalDebtIrtOnly,
    totalDebtUsdOnly,
    personalPayablesIrtOnly,
    personalPayablesUsdOnly,
    upcomingBillsIrtOnly,
    upcomingBillsUsdOnly,
    upcomingInstallmentsIrtOnly,
    upcomingInstallmentsUsdOnly,
    goalReservedIrtOnly,
    goalReservedUsdOnly,
    safeToSpendIrtOnly,
    safeToSpendUsdOnly,
    savingsRateIrtPct,
    creditTotalLimitIrt,
    creditUsedIrt,
    creditAvailableIrt,
    creditLinesStatus,
    budgetStatuses,
    debtFirstWaterfall,
  };
}

export interface UpcomingObligationItem {
  id: string;
  kind: 'credit_installment' | 'loan_installment' | 'fixed_bill' | 'personal_debt';
  title: string;
  subtitle: string;
  amount: number;
  currency: CurrencyCode;
  amountIrt: number;
  dueDateIso: string; // YYYY-MM-DD
  jalaliDateLabel: string;
  jalaliShortLabel: string;
  jy: number;
  jm: number;
  jd: number;
  daysLeft: number;
  loanId?: string;
  creditLineId?: string;
  fixedExpenseId?: string;
  personId?: string;
}

export function computeUpcomingObligations(
  fixedExpenses: FixedExpense[],
  loans: LoanItem[],
  creditLines: CreditLine[],
  people: PersonContact[],
  personEntries: PersonLedgerEntry[],
  usdToman: number
): UpcomingObligationItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items: UpcomingObligationItem[] = [];

  for (const loan of loans) {
    if (loan.status !== 'open' || loan.kind === 'receivable') continue;
    const dueDt = new Date(loan.dueDate);
    dueDt.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((dueDt.getTime() - today.getTime()) / 86400000);
    const j = toJalali(dueDt);
    const creditLine = loan.creditLineId
      ? creditLines.find((c) => c.id === loan.creditLineId)
      : undefined;

    items.push({
      id: `up_loan_${loan.id}`,
      kind: creditLine ? 'credit_installment' : 'loan_installment',
      title: loan.title,
      subtitle: creditLine
        ? `${creditLine.title} · قسط ${loan.paidInstallments + 1} از ${loan.totalInstallments}`
        : `قسط ${loan.paidInstallments + 1} از ${loan.totalInstallments}`,
      amount: loan.installmentAmount,
      currency: loan.currency,
      amountIrt: convertCurrency(loan.installmentAmount, loan.currency, 'IRT', usdToman),
      dueDateIso: toLocalIsoDate(dueDt),
      jalaliDateLabel: formatJalaliDate(dueDt, 'fa'),
      jalaliShortLabel: formatJalaliShort(dueDt),
      jy: j.jy,
      jm: j.jm,
      jd: j.jd,
      daysLeft,
      loanId: loan.id,
      creditLineId: loan.creditLineId,
    });
  }

  for (const fe of fixedExpenses) {
    if (!fe.active) continue;
    const nextDue = getNextJalaliDayOccurrence(fe.dayOfMonth, today);
    nextDue.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((nextDue.getTime() - today.getTime()) / 86400000);
    const j = toJalali(nextDue);
    items.push({
      id: `up_fe_${fe.id}`,
      kind: 'fixed_bill',
      title: fe.title,
      subtitle: fe.recurringMonthly
        ? `هزینه ثابت · روز ${fe.dayOfMonth} ماه جلالی`
        : 'هزینه برنامه‌ریزی‌شده',
      amount: fe.amount,
      currency: fe.currency,
      amountIrt: convertCurrency(fe.amount, fe.currency, 'IRT', usdToman),
      dueDateIso: toLocalIsoDate(nextDue),
      jalaliDateLabel: formatJalaliDate(nextDue, 'fa'),
      jalaliShortLabel: formatJalaliShort(nextDue),
      jy: j.jy,
      jm: j.jm,
      jd: j.jd,
      daysLeft,
      fixedExpenseId: fe.id,
    });
  }

  const peopleOverview = computePersonLedgers(people, personEntries, usdToman);
  const todayJ = toJalali(today);
  for (const pl of peopleOverview.ledgers) {
    if (pl.status !== 'payable') continue;
    const amt = Math.abs(pl.netBalanceIrt);
    items.push({
      id: `up_per_${pl.person.id}`,
      kind: 'personal_debt',
      title: `تسویه بدهی به ${pl.person.name}`,
      subtitle: 'بدهی باز در دفتر اشخاص',
      amount: Math.round(amt),
      currency: 'IRT',
      amountIrt: Math.round(amt),
      dueDateIso: toLocalIsoDate(today),
      jalaliDateLabel: formatJalaliDate(today, 'fa'),
      jalaliShortLabel: formatJalaliShort(today),
      jy: todayJ.jy,
      jm: todayJ.jm,
      jd: todayJ.jd,
      daysLeft: 0,
      personId: pl.person.id,
    });
  }

  return items.sort((a, b) => a.daysLeft - b.daysLeft || b.amountIrt - a.amountIrt);
}

export interface PriorityObligationItem {
  id: string;
  kind: 'loan_installment' | 'personal_debt';
  title: string;
  dueAmountIrt: number;
  totalRemainingIrt: number;
  urgencyScore: number;
  dueDate?: string;
  loanId?: string;
  personId?: string;
}

export interface DebtPayoffPlan {
  strategy: 'avalanche' | 'snowball';
  orderedLoans: Array<{
    loan: LoanItem;
    remainingAmount: number;
    remainingInstallments: number;
  }>;
  priorityQueue: PriorityObligationItem[];
  totalRemainingIrt: number;
  estimatedMonthsToDebtFree: number;
}

export function computeDebtPayoffPlan(
  loans: LoanItem[],
  strategy: 'avalanche' | 'snowball',
  usdToman: number,
  people: PersonContact[] = [],
  personEntries: PersonLedgerEntry[] = []
): DebtPayoffPlan {
  const openDebts = loans.filter((l) => l.status === 'open' && l.kind !== 'receivable');
  const enriched = openDebts.map((loan) => {
    const remainingInstallments = Math.max(0, loan.totalInstallments - loan.paidInstallments);
    const remainingAmount = remainingInstallments * loan.installmentAmount;
    return { loan, remainingAmount, remainingInstallments };
  });

  enriched.sort((a, b) => {
    if (strategy === 'avalanche') {
      return b.loan.priorityRate - a.loan.priorityRate;
    }
    const aIrt = convertCurrency(a.remainingAmount, a.loan.currency, 'IRT', usdToman);
    const bIrt = convertCurrency(b.remainingAmount, b.loan.currency, 'IRT', usdToman);
    return aIrt - bIrt;
  });

  const peopleOverview = computePersonLedgers(people, personEntries, usdToman);
  const payableLedgers = peopleOverview.ledgers.filter((l) => l.status === 'payable');

  const nowMs = Date.now();
  const priorityQueue: PriorityObligationItem[] = [
    ...enriched.map((item) => {
      const dueMs = new Date(item.loan.dueDate).getTime();
      const daysUntilDue = Math.round((dueMs - nowMs) / 86400000);
      const urgencyBonus = daysUntilDue <= 0 ? 1000 : Math.max(0, 100 - daysUntilDue);
      const dueAmountIrt = convertCurrency(
        item.loan.installmentAmount,
        item.loan.currency,
        'IRT',
        usdToman
      );
      const totalRemIrt = convertCurrency(
        item.remainingAmount,
        item.loan.currency,
        'IRT',
        usdToman
      );
      return {
        id: `loan_${item.loan.id}`,
        kind: 'loan_installment' as const,
        title: item.loan.title,
        dueAmountIrt,
        totalRemainingIrt: totalRemIrt,
        urgencyScore:
          urgencyBonus +
          (strategy === 'avalanche' ? item.loan.priorityRate * 5 : 100000000 / Math.max(1, totalRemIrt)),
        dueDate: item.loan.dueDate,
        loanId: item.loan.id,
      };
    }),
    ...payableLedgers.map((pl) => {
      const amt = Math.abs(pl.netBalanceIrt);
      return {
        id: `person_${pl.person.id}`,
        kind: 'personal_debt' as const,
        title: pl.person.name,
        dueAmountIrt: amt,
        totalRemainingIrt: amt,
        urgencyScore: 180 + (strategy === 'snowball' ? 100000000 / Math.max(1, amt) : amt / 1000000),
        personId: pl.person.id,
      };
    }),
  ].sort((a, b) => b.urgencyScore - a.urgencyScore);

  const totalLoansRemainingIrt = enriched.reduce(
    (sum, item) => sum + convertCurrency(item.remainingAmount, item.loan.currency, 'IRT', usdToman),
    0
  );
  const totalRemainingIrt = totalLoansRemainingIrt + peopleOverview.totalPayableIrt;

  const maxMonths = enriched.reduce((m, item) => Math.max(m, item.remainingInstallments), 0);

  return {
    strategy,
    orderedLoans: enriched,
    priorityQueue,
    totalRemainingIrt,
    estimatedMonthsToDebtFree: maxMonths,
  };
}

export interface PersonStatementRow {
  entry: PersonLedgerEntry;
  deltaIrt: number;
  runningBalanceIrt: number;
}

export interface PersonLedgerSummary {
  person: PersonContact;
  netBalanceIrt: number; // >0 = they owe us (receivable), <0 = we owe them (payable)
  netBalanceUsd: number;
  netIrtOnly: number;
  netUsdOnly: number;
  status: 'receivable' | 'payable' | 'settled';
  totalGivenIrt: number;
  totalReceivedIrt: number;
  entryCount: number;
  lastActivityAt?: string;
  statement: PersonStatementRow[]; // newest first for UI, with accurate chronological running balance
}

export interface PeopleLedgerOverview {
  totalReceivableIrt: number;
  totalPayableIrt: number;
  netPeopleBalanceIrt: number;
  totalReceivableIrtOnly: number;
  totalPayableIrtOnly: number;
  totalReceivableUsdOnly: number;
  totalPayableUsdOnly: number;
  ledgers: PersonLedgerSummary[];
}

export function computePersonLedgers(
  people: PersonContact[],
  personEntries: PersonLedgerEntry[],
  usdToman: number
): PeopleLedgerOverview {
  let totalReceivableIrt = 0;
  let totalPayableIrt = 0;
  let totalReceivableIrtOnly = 0;
  let totalPayableIrtOnly = 0;
  let totalReceivableUsdOnly = 0;
  let totalPayableUsdOnly = 0;

  const ledgers: PersonLedgerSummary[] = people.map((person) => {
    const entries = personEntries
      .filter((e) => e.personId === person.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = 0;
    let netIrtOnly = 0;
    let netUsdOnly = 0;
    let totalGivenIrt = 0;
    let totalReceivedIrt = 0;

    const chronological: PersonStatementRow[] = entries.map((entry) => {
      const sign = entry.direction === 'give' ? 1 : -1;
      if (entry.currency === 'IRT') netIrtOnly += sign * entry.amount;
      else netUsdOnly += sign * entry.amount;

      const amtIrt = convertCurrency(entry.amount, entry.currency, 'IRT', usdToman);
      const deltaIrt = entry.direction === 'give' ? amtIrt : -amtIrt;
      if (entry.direction === 'give') totalGivenIrt += amtIrt;
      else totalReceivedIrt += amtIrt;
      running += deltaIrt;
      return {
        entry,
        deltaIrt,
        runningBalanceIrt: running,
      };
    });

    const netBalanceIrt = Math.round(running);
    const netBalanceUsd = convertCurrency(netBalanceIrt, 'IRT', 'USD', usdToman);
    const status: PersonLedgerSummary['status'] =
      netBalanceIrt > 500 ? 'receivable' : netBalanceIrt < -500 ? 'payable' : 'settled';

    if (netBalanceIrt > 0) totalReceivableIrt += netBalanceIrt;
    else if (netBalanceIrt < 0) totalPayableIrt += Math.abs(netBalanceIrt);

    if (netIrtOnly > 0) totalReceivableIrtOnly += netIrtOnly;
    else if (netIrtOnly < 0) totalPayableIrtOnly += Math.abs(netIrtOnly);

    if (netUsdOnly > 0) totalReceivableUsdOnly += netUsdOnly;
    else if (netUsdOnly < 0) totalPayableUsdOnly += Math.abs(netUsdOnly);

    return {
      person,
      netBalanceIrt,
      netBalanceUsd,
      netIrtOnly: Math.round(netIrtOnly),
      netUsdOnly: Number(netUsdOnly.toFixed(2)),
      status,
      totalGivenIrt: Math.round(totalGivenIrt),
      totalReceivedIrt: Math.round(totalReceivedIrt),
      entryCount: entries.length,
      lastActivityAt: entries[entries.length - 1]?.date,
      statement: [...chronological].reverse(),
    };
  });

  // Sort active non-settled contacts first by largest absolute balance
  ledgers.sort((a, b) => Math.abs(b.netBalanceIrt) - Math.abs(a.netBalanceIrt));

  return {
    totalReceivableIrt: Math.round(totalReceivableIrt),
    totalPayableIrt: Math.round(totalPayableIrt),
    netPeopleBalanceIrt: Math.round(totalReceivableIrt - totalPayableIrt),
    totalReceivableIrtOnly: Math.round(totalReceivableIrtOnly),
    totalPayableIrtOnly: Math.round(totalPayableIrtOnly),
    totalReceivableUsdOnly: Number(totalReceivableUsdOnly.toFixed(2)),
    totalPayableUsdOnly: Number(totalPayableUsdOnly.toFixed(2)),
    ledgers,
  };
}

export interface GoalPlanPreview {
  remainingAmount: number;
  progressPct: number;
  suggestedMonthly: number;
  monthsNeeded: number;
  projectedDate: string;
  isFeasible: boolean;
  warnings: string[];
  dailyTargetInGoalCurrency: number;
  weeklyTargetInGoalCurrency: number;
  etaShiftDays: number;
}

export function computeGoalPlan(
  goal: Pick<
    Goal,
    'targetAmount' | 'savedAmount' | 'targetDate' | 'weeklyBudgetAmount' | 'allocationPct' | 'currency'
  >,
  recentProfitFactor = 1.5,
  recentAvgR = 1
): GoalPlanPreview {
  const remainingAmount = Math.max(0, goal.targetAmount - goal.savedAmount);
  const progressPct =
    goal.targetAmount > 0 ? Math.min(100, Number(((goal.savedAmount / goal.targetAmount) * 100).toFixed(1))) : 0;

  const monthlyContribution = Math.max(1, goal.weeklyBudgetAmount * 4.33 * (goal.allocationPct / 100));
  const monthsNeeded = remainingAmount === 0 ? 0 : Math.ceil(remainingAmount / monthlyContribution);

  const now = new Date();
  const targetDt = new Date(goal.targetDate);
  const daysToTarget = Math.max(1, Math.ceil((targetDt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const nowJ = toJalali(now);
  const currentJalaliDays = getJalaliMonthLength(nowJ.jy, nowJ.jm);
  const monthsAvailable = Math.max(1, daysToTarget / currentJalaliDays);

  const suggestedMonthly = Math.ceil(remainingAmount / monthsAvailable);
  const projected = addJalaliMonths(now, monthsNeeded);

  // Performance-linked ETA shift based on real Profit Factor & R-Multiple
  let etaShiftDays = 0;
  if (recentProfitFactor > 0 && recentProfitFactor < 1) {
    etaShiftDays = Math.min(21, Math.max(2, Math.round((1 - recentProfitFactor) * 20)));
  } else if (recentAvgR >= 0.8 && recentProfitFactor >= 1.3) {
    etaShiftDays = -Math.min(14, Math.round(recentAvgR * 4));
  }

  projected.setDate(projected.getDate() + etaShiftDays);

  const warnings: string[] = [];
  const isFeasible = monthsNeeded <= Math.ceil(monthsAvailable) && monthlyContribution > 0;
  if (!isFeasible && remainingAmount > 0) {
    warnings.push('با بودجه هفتگی و درصد تخصیص فعلی، تکمیل هدف دیرتر از تاریخ مقصد خواهد بود.');
  }
  if (goal.allocationPct < 15) {
    warnings.push('درصد تخصیص کمتر از ۱۵٪ سرعت رسیدن به هدف را کاهش می‌دهد.');
  }
  if (etaShiftDays > 0) {
    warnings.push(`افت ضریب سود (PF زیر ۱.۰) حدود ${etaShiftDays} روز رسیدن به این هدف را به تعویق انداخته است.`);
  }

  const weeklyTargetInGoalCurrency = Number((remainingAmount / Math.max(1, daysToTarget / 7)).toFixed(2));
  const dailyTargetInGoalCurrency = Number((weeklyTargetInGoalCurrency / 5).toFixed(2)); // 5 trading days/week

  return {
    remainingAmount,
    progressPct,
    suggestedMonthly,
    monthsNeeded,
    projectedDate: projected.toISOString(),
    isFeasible,
    warnings,
    dailyTargetInGoalCurrency,
    weeklyTargetInGoalCurrency,
    etaShiftDays,
  };
}

export interface PriorityMeta {
  priority: number;
  weight: number;
  xpMultiplier: number;
  starsReward: number;
  labelFa: string;
  labelEn: string;
}

export function getPriorityMeta(priority: number): PriorityMeta {
  const p = Math.min(5, Math.max(1, Math.round(priority || 3)));
  const weight = 6 - p; // P1=5, P2=4, P3=3, P4=2, P5=1
  const table: Record<number, { xpMultiplier: number; starsReward: number; fa: string; en: string }> = {
    1: { xpMultiplier: 1.5, starsReward: 4, fa: 'حیاتی (P1)', en: 'Critical (P1)' },
    2: { xpMultiplier: 1.3, starsReward: 3, fa: 'بالا (P2)', en: 'High (P2)' },
    3: { xpMultiplier: 1.15, starsReward: 2, fa: 'متوسط (P3)', en: 'Medium (P3)' },
    4: { xpMultiplier: 1.05, starsReward: 2, fa: 'عادی (P4)', en: 'Normal (P4)' },
    5: { xpMultiplier: 1.0, starsReward: 1, fa: 'بلندمدت (P5)', en: 'Long-Term (P5)' },
  };
  const meta = table[p] ?? table[3];
  return {
    priority: p,
    weight,
    xpMultiplier: meta.xpMultiplier,
    starsReward: meta.starsReward,
    labelFa: meta.fa,
    labelEn: meta.en,
  };
}

export interface GoalPriorityAllocation {
  goalId: string;
  priority: number;
  weight: number;
  sharePct: number;
  weeklyAmountIrt: number;
  weeklyAmountInGoalCurrency: number;
  xpMultiplier: number;
  starsReward: number;
}

export function computePriorityGoalAllocations(
  goals: Goal[],
  weeklyPoolIrt: number,
  usdToman: number
): GoalPriorityAllocation[] {
  const active = goals
    .filter((g) => g.status === 'active')
    .sort((a, b) => a.priority - b.priority);
  if (active.length === 0) return [];

  const totalWeight = active.reduce((s, g) => s + getPriorityMeta(g.priority).weight, 0) || 1;

  return active.map((g) => {
    const meta = getPriorityMeta(g.priority);
    const sharePct = Number(((meta.weight / totalWeight) * 100).toFixed(1));
    const weeklyAmountIrt = Math.round(weeklyPoolIrt * (meta.weight / totalWeight));
    const weeklyAmountInGoalCurrency =
      g.currency === 'IRT'
        ? weeklyAmountIrt
        : convertCurrency(weeklyAmountIrt, 'IRT', 'USD', usdToman);
    return {
      goalId: g.id,
      priority: meta.priority,
      weight: meta.weight,
      sharePct,
      weeklyAmountIrt,
      weeklyAmountInGoalCurrency,
      xpMultiplier: meta.xpMultiplier,
      starsReward: meta.starsReward,
    };
  });
}

export interface EvaluatedMission {
  key: string;
  titleFa: string;
  titleEn: string;
  unit: string;
  current: number;
  target: number;
  stars: number;
  xpReward: number;
  completed: boolean;
  progressPct: number;
  isGoalMission?: boolean;
  goalId?: string;
  priority?: number;
  prioritySharePct?: number;
  priorityMultiplier?: number;
}

export const TRADER_RANKS = [
  { level: 1, minXp: 0, titleFa: 'کاشف نظم', titleEn: 'Discipline Seeker' },
  { level: 2, minXp: 300, titleFa: 'معامله‌گر پایبند', titleEn: 'Rule Keeper' },
  { level: 3, minXp: 700, titleFa: 'شکارچی ستاپ', titleEn: 'Setup Hunter' },
  { level: 4, minXp: 1200, titleFa: 'حافظ ریسک', titleEn: 'Risk Guardian' },
  { level: 5, minXp: 1900, titleFa: 'استراتژیست', titleEn: 'Strategist' },
  { level: 6, minXp: 2800, titleFa: 'معمار جریان نقدی', titleEn: 'Cashflow Architect' },
  { level: 7, minXp: 3900, titleFa: 'مدیر سرمایه', titleEn: 'Capital Manager' },
  { level: 8, minXp: 5200, titleFa: 'تک‌تیرانداز بازار', titleEn: 'Market Sniper' },
  { level: 9, minXp: 6800, titleFa: 'فرمانده ریسک', titleEn: 'Risk Commander' },
  { level: 10, minXp: 8800, titleFa: 'استاد چرخه سرمایه', titleEn: 'Capital Grandmaster' },
];

export function evaluateGamification(state: FundTrackState) {
  const now = new Date();
  const todayTrades = state.trades.filter((t) => isSameDay(new Date(t.closeTime), now));
  const todayKpis = computeTradingKpis(todayTrades);
  const usdToman = state.settings.usdToman || 69500;
  const weeklyPoolIrt = state.settings.weeklyGoalPoolIrt ?? 18000000;

  const londonTrades = todayTrades.filter((t) => t.session === 'London' && t.profitUsd > 0).length;
  const positiveTrades = todayTrades.filter((t) => t.profitUsd > 0).length;
  const rRatioOk =
    todayTrades.length > 0 ? Number((todayKpis.avgR >= 1.2 ? 1 : todayKpis.avgR / 1.2).toFixed(2)) : 0;

  const pfNum = todayTrades.length > 0 ? Math.min(9.99, todayKpis.profitFactor) : 0;
  const metricMap: Record<string, number> = {
    daily_trades: todayKpis.tradeCount,
    daily_wins: todayKpis.winCount,
    daily_profit: Math.max(0, todayKpis.netProfitUsd),
    daily_avg_r: Math.max(0, todayKpis.avgR),
    london_session: londonTrades,
    positive_trades: positiveTrades,
    win_rate: todayKpis.winRate,
    best_trade: Math.max(0, todayKpis.bestTradeUsd),
    profit_factor: pfNum,
    sl_compliance: todayTrades.length > 0 ? (pfNum >= 1.2 ? 100 : Math.round((pfNum / 1.2) * 100)) : 0,
    r_ratio: rRatioOk,
  };

  const dailyMissions: EvaluatedMission[] = state.missionConfigs.map((cfg) => {
    const target = cfg.overrideTarget ?? cfg.defaultTarget;
    const stars = cfg.overrideStars ?? cfg.defaultStars;
    const current = Number((metricMap[cfg.key] ?? 0).toFixed(2));
    const completed = current >= target && target > 0;
    const progressPct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return {
      key: cfg.key,
      titleFa: cfg.titleFa,
      titleEn: cfg.titleEn,
      unit: cfg.unit,
      current,
      target,
      stars,
      xpReward: cfg.xpReward,
      completed,
      progressPct,
    };
  });

  // Goal-derived daily missions weighted by Priority (1..5)
  const priorityAllocations = computePriorityGoalAllocations(state.goals, weeklyPoolIrt, usdToman);
  const activeGoals = state.goals
    .filter((g) => g.status === 'active')
    .sort((a, b) => a.priority - b.priority);

  const goalMissions: EvaluatedMission[] = activeGoals.map((goal) => {
    const alloc = priorityAllocations.find((a) => a.goalId === goal.id);
    const shareRatio = (alloc?.sharePct ?? goal.allocationPct) / 100;
    const effectiveWeekly =
      goal.autoPriorityBudget !== false && alloc
        ? alloc.weeklyAmountInGoalCurrency
        : goal.weeklyBudgetAmount;

    const plan = computeGoalPlan(
      { ...goal, weeklyBudgetAmount: effectiveWeekly },
      todayKpis.slCompliancePct || 100,
      todayKpis.avgR || 1
    );

    const meta = getPriorityMeta(goal.priority);
    const allocatedTodayUsd = Math.max(0, todayKpis.netProfitUsd * shareRatio);
    const todayContributionInGoalCurrency =
      goal.currency === 'IRT'
        ? convertCurrency(allocatedTodayUsd, 'USD', 'IRT', usdToman)
        : Number(allocatedTodayUsd.toFixed(2));

    const target = Math.max(1, plan.dailyTargetInGoalCurrency);
    const completed = todayContributionInGoalCurrency >= target;
    const progressPct = Math.min(100, Math.round((todayContributionInGoalCurrency / target) * 100));

    return {
      key: `goal_${goal.id}`,
      titleFa: `[P${meta.priority}] تامین سهم هدف «${goal.title}»`,
      titleEn: `[P${meta.priority}] Daily Share: ${goal.title}`,
      unit: goal.currency,
      current: todayContributionInGoalCurrency,
      target,
      stars: meta.starsReward,
      xpReward: Math.round(90 * meta.xpMultiplier),
      completed,
      progressPct,
      isGoalMission: true,
      goalId: goal.id,
      priority: meta.priority,
      prioritySharePct: alloc?.sharePct ?? goal.allocationPct,
      priorityMultiplier: meta.xpMultiplier,
    };
  });

  // Custom Missions evaluation
  const todayOutIrt = state.transactions
    .filter((tx) => tx.type === 'out' && isSameDay(new Date(tx.date), now))
    .reduce((sum, tx) => sum + convertCurrency(tx.amount, tx.currency, 'IRT', usdToman), 0);

  const evaluatedCustom = state.customMissions.map((cm) => {
    let current = cm.manualProgress ?? 0;
    if (cm.source === 'goal' && cm.linkedGoalId) {
      const linked = state.goals.find((g) => g.id === cm.linkedGoalId);
      current = linked ? linked.savedAmount : 0;
    } else if (cm.metric === 'income' && cm.source !== 'manual') {
      current = Math.max(0, todayKpis.netProfitUsd);
    } else if (cm.metric === 'cap') {
      current = todayOutIrt;
    }
    const completed =
      cm.metric === 'cap' ? current <= cm.targetValue && todayTrades.length + state.transactions.length > 0 : current >= cm.targetValue;
    const progressPct =
      cm.targetValue > 0 ? Math.min(100, Math.round((current / cm.targetValue) * 100)) : 0;
    return { ...cm, current, completed, progressPct };
  });

  const starsToday =
    dailyMissions.filter((m) => m.completed).reduce((s, m) => s + m.stars, 0) +
    goalMissions.filter((m) => m.completed).reduce((s, m) => s + m.stars, 0) +
    evaluatedCustom.filter((m) => m.completed).reduce((s, m) => s + m.stars, 0);

  const totalStars = starsToday + state.gamification.starsBonus;
  const completedTodayXp =
    dailyMissions.filter((m) => m.completed).reduce((s, m) => s + m.xpReward, 0) +
    goalMissions.filter((m) => m.completed).reduce((s, m) => s + m.xpReward, 0);

  const disciplineMultiplier =
    todayTrades.length > 0 && todayKpis.profitFactor >= 1.2
      ? Number(Math.min(2.0, 1 + state.gamification.streakDays * 0.05 + 0.2).toFixed(2))
      : 1.0;

  const totalXp = state.gamification.xpTotal + Math.round(completedTodayXp * disciplineMultiplier);

  let currentRank = TRADER_RANKS[0];
  let nextRank = TRADER_RANKS[1];
  for (let i = 0; i < TRADER_RANKS.length; i += 1) {
    if (totalXp >= TRADER_RANKS[i].minXp) {
      currentRank = TRADER_RANKS[i];
      nextRank = TRADER_RANKS[i + 1] ?? TRADER_RANKS[i];
    }
  }

  const xpSpan = Math.max(1, nextRank.minXp - currentRank.minXp);
  const rankProgressPct =
    nextRank.level === currentRank.level
      ? 100
      : Math.min(100, Math.round(((totalXp - currentRank.minXp) / xpSpan) * 100));

  // Daily Golden Combo (3 Pillars)
  const todayKey = getTodayKey(now);
  const pillarTradeDiscipline = todayTrades.length > 0 && (todayKpis.profitFactor >= 1 || todayKpis.netProfitUsd >= 0);
  const pillarBudgetControl = state.gamification.dailyBudgetUnderCapConfirmedDays.includes(todayKey) || todayOutIrt === 0;
  const pillarGoalOrJournal =
    todayTrades.some((t) => t.reviewNote.trim().length > 0) ||
    goalMissions.some((gm) => gm.completed);

  const comboCount = [pillarTradeDiscipline, pillarBudgetControl, pillarGoalOrJournal].filter(Boolean).length;
  const comboClaimed = state.gamification.claimedComboDays.includes(todayKey);

  return {
    todayKpis,
    dailyMissions,
    goalMissions,
    priorityAllocations,
    evaluatedCustom,
    starsToday,
    totalStars,
    totalXp,
    disciplineMultiplier,
    currentRank,
    nextRank,
    rankProgressPct,
    goldenCombo: {
      pillarTradeDiscipline,
      pillarBudgetControl,
      pillarGoalOrJournal,
      comboCount,
      comboReady: comboCount === 3 && !comboClaimed,
      comboClaimed,
    },
  };
}

export interface ParsedEventsJsonlResult {
  trades: Trade[];
  accountUpdate?: Partial<Mt5Account> & {
    login?: string;
    hasSnap?: boolean;
    snapTsSec?: number;
    suggestedIsDemo?: boolean;
    postSnapDealDeltaUsd?: number;
    totalNewDealsNetUsd?: number;
  };
  eaMeta?: EaMetaInfo;
  eaPositions?: EaOpenPosition[];
  eaRadar?: Record<string, EaMarketRadarSnapshot>;
  parsedCount: number;
  dedupedCount: number;
  lineCount: number;
}

interface RawEaDeal {
  t: number;
  deal: number;
  order: number;
  pos: number;
  sym: string;
  entry: number; // 0=IN, 1=OUT, 2=INOUT, 3=OUT_BY
  side: number; // 0=BUY, 1=SELL
  vol: number;
  price: number;
  profit: number;
  comm: number;
  swap: number;
  fee: number;
  magic: number;
  comment: string;
}

function classifySessionByUtcHour(isoTime: string): Trade['session'] {
  const hr = new Date(isoTime).getUTCHours();
  if (hr >= 7 && hr < 13) return 'London';
  if (hr >= 13 && hr < 21) return 'New York';
  return 'Asia';
}

function unixSecToIso(sec: unknown, fallbackMs = Date.now()): string {
  const n = Number(sec);
  if (Number.isFinite(n) && n > 1_000_000_000) {
    return new Date(n * 1000).toISOString();
  }
  return new Date(fallbackMs).toISOString();
}

export function parseEventsJsonl(
  rawText: string,
  existingAccountId: string,
  existingTickets: Set<string> = new Set()
): ParsedEventsJsonlResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const trades: Trade[] = [];
  let accountUpdate: ParsedEventsJsonlResult['accountUpdate'];
  let eaMeta: EaMetaInfo | undefined;
  let eaPositions: EaOpenPosition[] | undefined;
  const eaRadar: Record<string, EaMarketRadarSnapshot> = {};
  let latestSnapTsSec = 0;

  // Deduplicate EA deals by deal ID (GapRepair overlaps + optional Backfill repeats)
  const seenDealIds = new Set<number>();
  const dealsByPos = new Map<number, RawEaDeal[]>();
  const legacyTicketsSeen = new Set<string>(existingTickets);
  let dedupedCount = 0;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const typ = typeof obj.type === 'string' ? obj.type : '';

      if (typ === 'meta') {
        const login = String(obj.login ?? '');
        const server = String(obj.server ?? '');
        const updatedAt = unixSecToIso(obj.t);
        eaMeta = {
          login,
          name: String(obj.name ?? ''),
          server,
          symbol: String(obj.symbol ?? 'XAUUSD'),
          period: String(obj.period ?? 'PERIOD_M15'),
          cur: String(obj.cur ?? 'USD'),
          tz: Number(obj.tz ?? 0),
          updatedAt,
        };
        accountUpdate = {
          ...(accountUpdate ?? {}),
          login,
          accountNumber: login || accountUpdate?.accountNumber || '0',
          broker: String(obj.name || server || accountUpdate?.broker || 'MT5 Terminal'),
          server: server || accountUpdate?.server || 'MT5-Server',
          suggestedIsDemo: /demo|trial|contest/i.test(server) ? true : accountUpdate?.suggestedIsDemo,
          lastSyncAt: updatedAt,
          status: 'active',
        };
        continue;
      }

      if (typ === 'snap') {
        const login = String(obj.login ?? '');
        const tSec = Number(obj.t ?? 0);
        if (Number.isFinite(tSec) && tSec >= latestSnapTsSec) {
          latestSnapTsSec = tSec;
          const updatedAt = unixSecToIso(tSec);
          accountUpdate = {
            ...(accountUpdate ?? {}),
            login: login || accountUpdate?.login,
            accountNumber: login || accountUpdate?.accountNumber,
            balance: Number(obj.bal ?? 0),
            equity: Number(obj.eq ?? obj.bal ?? 0),
            floatingProfit: Number(obj.fl ?? 0),
            margin: Number(obj.margin ?? 0),
            freeMargin: Number(obj.free ?? 0),
            hasSnap: true,
            snapTsSec: tSec,
            lastSyncAt: updatedAt,
            status: 'active',
          };
        }
        continue;
      }

      if (typ === 'positions') {
        const items = Array.isArray(obj.items) ? obj.items : [];
        eaPositions = items.map((raw) => {
          const item = raw as Record<string, unknown>;
          return {
            ticket: String(item.ticket ?? ''),
            symbol: String(item.sym ?? 'XAUUSD'),
            side: Number(item.side ?? 0) === 1 ? 'SELL' : 'BUY',
            volume: Number(item.vol ?? 0),
            openPrice: Number(item.open ?? 0),
            sl: Number(item.sl ?? 0),
            tp: Number(item.tp ?? 0),
            profit: Number(item.profit ?? 0),
            magic: Number(item.magic ?? 0),
            openTime: unixSecToIso(item.time),
          };
        });
        continue;
      }

      if (typ === 'radar') {
        const tf = String(obj.tf ?? 'PERIOD_M15');
        const toNumArr = (v: unknown) =>
          Array.isArray(v) ? v.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
        eaRadar[tf] = {
          tf,
          symbol: String(obj.sym ?? 'XAUUSD'),
          bid: Number(obj.bid ?? 0),
          ask: Number(obj.ask ?? 0),
          spread: Number(obj.spread ?? 0),
          atr: Number(obj.atr ?? 0),
          atrAvg: Number(obj.atr_avg ?? 0),
          atrRatio: Number(obj.atr_ratio ?? 0),
          rsi: Number(obj.rsi ?? 50),
          rsiPrev: Number(obj.rsi_prev ?? 50),
          ema9: Number(obj.ema9 ?? 0),
          ema21: Number(obj.ema21 ?? 0),
          ema50: Number(obj.ema50 ?? 0),
          ema200: Number(obj.ema200 ?? 0),
          close: Number(obj.close ?? 0),
          close4: Number(obj.close4 ?? 0),
          adx: Number(obj.adx ?? 0),
          pdi: Number(obj.pdi ?? 0),
          mdi: Number(obj.mdi ?? 0),
          macd: Number(obj.macd ?? 0),
          macdSig: Number(obj.macd_sig ?? 0),
          macdPrev: Number(obj.macd_prev ?? 0),
          macdSigPrev: Number(obj.macd_sig_prev ?? 0),
          bbMid: Number(obj.bb_mid ?? 0),
          bbUp: Number(obj.bb_up ?? 0),
          bbLo: Number(obj.bb_lo ?? 0),
          vol: Number(obj.vol ?? 0),
          volAvg: Number(obj.vol_avg ?? 0),
          swingHi: toNumArr(obj.swing_hi),
          swingLo: toNumArr(obj.swing_lo),
          dHi: Number(obj.d_hi ?? 0),
          dLo: Number(obj.d_lo ?? 0),
          pp: Number(obj.pp ?? 0),
          r1: Number(obj.r1 ?? 0),
          s1: Number(obj.s1 ?? 0),
          updatedAt: unixSecToIso(obj.t),
        };
        continue;
      }

      if (typ === 'deal') {
        const dealId = Number(obj.deal ?? 0);
        if (dealId > 0) {
          if (seenDealIds.has(dealId)) {
            dedupedCount += 1;
            continue;
          }
          seenDealIds.add(dealId);
        }
        const sym = String(obj.sym ?? '').trim();
        const pos = Number(obj.pos ?? 0);
        if (!sym || pos <= 0) continue; // Skip balance/credit/non-position deals
        const dealObj: RawEaDeal = {
          t: Number(obj.t ?? 0),
          deal: dealId,
          order: Number(obj.order ?? 0),
          pos,
          sym,
          entry: Number(obj.entry ?? 0),
          side: Number(obj.side ?? 0),
          vol: Number(obj.vol ?? 0),
          price: Number(obj.price ?? 0),
          profit: Number(obj.profit ?? 0),
          comm: Number(obj.comm ?? 0),
          swap: Number(obj.swap ?? 0),
          fee: Number(obj.fee ?? 0),
          magic: Number(obj.magic ?? 0),
          comment: String(obj.comment ?? ''),
        };
        const arr = dealsByPos.get(pos) ?? [];
        arr.push(dealObj);
        dealsByPos.set(pos, arr);
        continue;
      }

      // Legacy / generic JSONL fallback
      if (typ === 'account' || obj.balance !== undefined) {
        accountUpdate = {
          ...(accountUpdate ?? {}),
          balance: Number(obj.balance ?? 10000),
          equity: Number(obj.equity ?? obj.balance ?? 10000),
          accountNumber: String(obj.account ?? obj.accountNumber ?? '50192831'),
          broker: String(obj.broker ?? 'MetaQuotes'),
          lastSyncAt: new Date().toISOString(),
          status: 'active',
        };
      }
      if (obj.symbol && (obj.profit !== undefined || obj.profitUsd !== undefined)) {
        const ticket = String(obj.ticket ?? Math.floor(100000 + Math.random() * 900000));
        if (legacyTicketsSeen.has(ticket)) {
          dedupedCount += 1;
          continue;
        }
        legacyTicketsSeen.add(ticket);
        const profitUsd = Number(obj.profitUsd ?? obj.profit ?? 0);
        const riskUsd = Number(obj.riskUsd ?? 50);
        const rMultiple =
          obj.rMultiple !== undefined
            ? Number(obj.rMultiple)
            : Number((profitUsd / Math.max(10, riskUsd)).toFixed(2));
        trades.push({
          id: `tr_${ticket}`,
          ticket,
          accountId: existingAccountId,
          symbol: String(obj.symbol),
          direction: String(obj.direction ?? obj.cmd ?? 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
          volume: Number(obj.volume ?? obj.lots ?? 0.1),
          openTime: String(obj.openTime ?? new Date(Date.now() - 3600000).toISOString()),
          closeTime: String(obj.closeTime ?? new Date().toISOString()),
          openPrice: Number(obj.openPrice ?? 0),
          closePrice: Number(obj.closePrice ?? 0),
          sl: Number(obj.sl ?? 0),
          tp: Number(obj.tp ?? 0),
          slRespected: obj.slRespected !== undefined ? Boolean(obj.slRespected) : profitUsd >= -riskUsd * 1.15,
          profitUsd,
          commissionUsd: Number(obj.commissionUsd ?? obj.commission ?? 0),
          swapUsd: Number(obj.swapUsd ?? obj.swap ?? 0),
          rMultiple,
          session: (obj.session as Trade['session']) ?? 'London',
          setupTag: String(obj.setupTag ?? 'MT5 Import'),
          emotionTag: 'calm',
          reviewNote: String(obj.comment ?? ''),
        });
      }
    } catch {
      // Skip malformed line gracefully
    }
  }

  // Pair IN & OUT/INOUT/OUT_BY deals by position id (`pos`)
  let postSnapDealDeltaUsd = 0;
  let totalNewDealsNetUsd = 0;

  for (const [posId, group] of dealsByPos.entries()) {
    group.sort((a, b) => a.t - b.t || a.deal - b.deal);
    const inDeals = group.filter((d) => d.entry === 0 || d.entry === 2);
    const outDeals = group.filter((d) => d.entry === 1 || d.entry === 2 || d.entry === 3);

    if (outDeals.length === 0) continue; // Still open or IN-only without exit yet

    const totalInVol = inDeals.reduce((s, d) => s + Math.max(0, d.vol), 0);
    const weightedOpenPrice =
      totalInVol > 0
        ? inDeals.reduce((s, d) => s + d.price * d.vol, 0) / totalInVol
        : outDeals[0].price;
    const totalInComm = inDeals.reduce((s, d) => s + d.comm + d.fee, 0);
    const firstIn = inDeals[0];
    const openTime = firstIn ? unixSecToIso(firstIn.t) : unixSecToIso(outDeals[0].t - 1800);

    // Original position direction comes from IN deal side (0=BUY, 1=SELL),
    // or inverse of OUT closing deal side if IN occurred before backfill window
    const direction: 'BUY' | 'SELL' = firstIn
      ? firstIn.side === 1
        ? 'SELL'
        : 'BUY'
      : outDeals[0].side === 1
      ? 'BUY'
      : 'SELL';

    outDeals.forEach((out) => {
      const canonicalTicket = out.deal > 0 ? `${posId}_${out.deal}` : String(posId);
      const legacyTicket = String(posId);
      if (
        legacyTicketsSeen.has(canonicalTicket) ||
        (outDeals.length === 1 && legacyTicketsSeen.has(legacyTicket))
      ) {
        dedupedCount += 1;
        return;
      }
      legacyTicketsSeen.add(canonicalTicket);

      const closeTime = unixSecToIso(out.t);
      const inCommShare =
        totalInVol > 0 ? totalInComm * (out.vol / totalInVol) : totalInComm / outDeals.length;
      const commissionUsd = Number((inCommShare + out.comm + out.fee).toFixed(2));
      const swapUsd = Number(out.swap.toFixed(2));
      const profitUsd = Number(out.profit.toFixed(2));
      const netBalanceImpact = profitUsd + out.comm + out.fee + out.swap;

      totalNewDealsNetUsd += netBalanceImpact;
      if (latestSnapTsSec > 0 && out.t > latestSnapTsSec) {
        postSnapDealDeltaUsd += netBalanceImpact;
      }

      // Conservative risk unit estimate when SL is absent in EA deal payload
      const approxRiskUsd = Math.max(25, out.vol * 250);
      const rMultiple = Number((profitUsd / approxRiskUsd).toFixed(2));

      trades.push({
        id: `tr_ea_${canonicalTicket}`,
        ticket: canonicalTicket,
        accountId: existingAccountId,
        symbol: out.sym,
        direction,
        volume: Number(out.vol.toFixed(2)),
        openTime,
        closeTime,
        openPrice: Number(weightedOpenPrice.toFixed(5)),
        closePrice: Number(out.price.toFixed(5)),
        sl: 0,
        tp: 0,
        slRespected: profitUsd >= -approxRiskUsd * 1.25,
        profitUsd,
        commissionUsd,
        swapUsd,
        rMultiple,
        session: classifySessionByUtcHour(closeTime),
        setupTag: out.comment.trim() ? out.comment.trim() : 'MT5 Deal',
        emotionTag: 'calm',
        reviewNote: out.comment.trim(),
      });
    });
  }

  // Reconcile latest snapshot balance/equity with any newly closed deals occurring after the snapshot
  if (accountUpdate) {
    accountUpdate.postSnapDealDeltaUsd = Number(postSnapDealDeltaUsd.toFixed(2));
    accountUpdate.totalNewDealsNetUsd = Number(totalNewDealsNetUsd.toFixed(2));
    if (
      latestSnapTsSec > 0 &&
      Math.abs(postSnapDealDeltaUsd) > 0.001 &&
      typeof accountUpdate.balance === 'number'
    ) {
      accountUpdate.balance = Number((accountUpdate.balance + postSnapDealDeltaUsd).toFixed(2));
      accountUpdate.equity = Number(
        ((accountUpdate.equity ?? accountUpdate.balance) + postSnapDealDeltaUsd).toFixed(2)
      );
    }
  } else if (trades.length > 0) {
    accountUpdate = {
      postSnapDealDeltaUsd: Number(totalNewDealsNetUsd.toFixed(2)),
      totalNewDealsNetUsd: Number(totalNewDealsNetUsd.toFixed(2)),
      lastSyncAt: trades[trades.length - 1].closeTime,
      status: 'active',
    };
  }

  return {
    trades,
    accountUpdate,
    eaMeta,
    eaPositions,
    eaRadar: Object.keys(eaRadar).length > 0 ? eaRadar : undefined,
    parsedCount: trades.length,
    dedupedCount,
    lineCount: lines.length,
  };
}
