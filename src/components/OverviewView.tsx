import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Award,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Landmark,
  Shield,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  AppLanguage,
  FundTrackState,
  MainCategory,
  NotificationItem,
  OverviewSubTab,
  TimeRange,
  Trade,
} from '../types';
import {
  computeFinanceSummary,
  computeGoalPlan,
  computeTradingKpis,
  computeUpcomingObligations,
  convertCurrency,
  evaluateGamification,
  filterTradesByRange,
  formatMoney,
  maskText,
  PRIVATE_MASK,
} from '../utils/domain';
import {
  formatJalaliDate,
  formatJalaliDateTime,
  formatJalaliShort,
  getJalaliMonthLength,
  getJalaliMonthName,
  getJalaliWeekdayIndex,
  toJalali,
} from '../utils/jalali';
import { buildUnifiedNotificationFeed } from '../utils/notifications';
import { t } from '../i18n/translations';
import {
  PriorityAllocationBar,
  SingleSymbolPerformanceChart,
  SingleSymbolTradePoint,
  StripedProgressBar,
} from './Charts';
import { computeDailyDrawdownStatus } from '../utils/intelligence';
import { ExecutiveDigestSection } from './ExecutiveDigestSection';

interface OverviewViewProps {
  state: FundTrackState;
  subTab: OverviewSubTab;
  setSubTab: (tab: OverviewSubTab) => void;
  range: TimeRange;
  onNavigate: (cat: MainCategory, sub?: string) => void;
  onInspectTrade: (trade: Trade) => void;
  onMarkNotificationRead: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  onMarkAllRead: (ids: string[]) => void;
  onClearRead: (readIds: string[]) => void;
  onNotificationAction: (notif: NotificationItem) => void;
  onClaimDailyCombo: () => void;
  onDistributeTodayProfitToGoals: () => void;
  onOpenQuickAction: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  state,
  subTab,
  setSubTab,
  range,
  onNavigate,
  onInspectTrade,
  onMarkNotificationRead,
  onDeleteNotification,
  onMarkAllRead,
  onClearRead,
  onNotificationAction,
  onClaimDailyCombo,
  onDistributeTodayProfitToGoals,
  onOpenQuickAction,
}) => {
  const lang: AppLanguage = state.settings.language;
  const usdToman = state.settings.usdToman;
  const baseCurrency = state.settings.baseCurrency;
  const isPrivate = Boolean(state.settings.privateMode);

  const [activityFilter, setActivityFilter] = useState<'all' | 'trades' | 'finance'>('all');
  const [obligationsMode, setObligationsMode] = useState<'table' | 'calendar'>('table');
  const [showMobileAccounts, setShowMobileAccounts] = useState(false);
  const [showMobileChart, setShowMobileChart] = useState(false);
  const [showAllMobileActivities, setShowAllMobileActivities] = useState(false);
  const [showAllMobileObligations, setShowAllMobileObligations] = useState(false);
  const todayJalali = useMemo(() => toJalali(new Date()), []);
  const [selectedCalDay, setSelectedCalDay] = useState<number>(() => toJalali(new Date()).jd);

  const rangedTrades = filterTradesByRange(state.trades, range);
  const liveMt5Accounts = state.mt5Accounts.filter((a) => !a.isDemo);
  const eqSource = liveMt5Accounts.length > 0 ? liveMt5Accounts : state.mt5Accounts;
  const currentAccountEquity = eqSource.reduce((s, a) => s + (a.equity || a.balance), 0);
  const kpis = computeTradingKpis(rangedTrades, {
    currentEquityUsd: currentAccountEquity,
    groupByDay: range !== 'today',
    lang,
  });
  const finance = computeFinanceSummary(
    state.bankAccounts,
    state.mt5Accounts,
    state.transactions,
    state.fixedExpenses,
    state.budgetCaps,
    state.loans,
    state.goals,
    usdToman,
    state.people ?? [],
    state.personEntries ?? [],
    state.creditLines ?? []
  );
  const upcomingObligations = useMemo(
    () =>
      computeUpcomingObligations(
        state.fixedExpenses,
        state.loans,
        state.creditLines ?? [],
        state.people ?? [],
        state.personEntries ?? [],
        usdToman
      ),
    [state.fixedExpenses, state.loans, state.creditLines, state.people, state.personEntries, usdToman]
  );
  const game = evaluateGamification(state);
  const ddStatus = computeDailyDrawdownStatus(
    state.trades,
    state.mt5Accounts,
    state.settings.dailyMaxLossPct ?? 3
  );

  const actionFeed = useMemo(() => buildUnifiedNotificationFeed(state), [state]);
  const unreadAlertsCount = actionFeed.filter((f) => f.unread).length;
  const readAlertIdsList = actionFeed.filter((f) => !f.unread).map((f) => f.id);
  const activeGoals = state.goals.filter((g) => g.status === 'active').sort((a, b) => a.priority - b.priority);

  const rangeLabel =
    range === 'today'
      ? t(lang, 'امروز', 'Today')
      : range === 'week'
      ? t(lang, '۷ روز اخیر', 'Last 7d')
      : range === 'month'
      ? t(lang, '۳۰ روز اخیر', 'Last 30d')
      : t(lang, 'کل دوره', 'All Time');

  // Build period profitability chart: per-trade intraday for 'today', daily grouped for week/month/all
  const periodPerformancePoints: SingleSymbolTradePoint[] = useMemo(() => {
    const ordered = [...rangedTrades].sort(
      (a, b) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()
    );

    if (range === 'today') {
      let cum = 0;
      return ordered.map((tr) => {
        cum = Number((cum + tr.profitUsd).toFixed(2));
        const d = new Date(tr.closeTime);
        return {
          id: tr.id,
          symbol: tr.symbol,
          direction: tr.direction,
          ticket: tr.ticket,
          profitUsd: tr.profitUsd,
          rMultiple: tr.rMultiple,
          cumNetUsd: cum,
          timeLabel: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
          dateLabel: formatJalaliDateTime(tr.closeTime, lang),
        };
      });
    }

    const dayGroups = new Map<string, Trade[]>();
    for (const tr of ordered) {
      const d = new Date(tr.closeTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const arr = dayGroups.get(key) ?? [];
      arr.push(tr);
      dayGroups.set(key, arr);
    }

    let cum = 0;
    return Array.from(dayGroups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dayKey, grp]) => {
        const dayNet = Number(grp.reduce((s, tr) => s + tr.profitUsd, 0).toFixed(2));
        cum = Number((cum + dayNet).toFixed(2));
        const sampleTime = grp[0].closeTime;
        return {
          id: `day_${dayKey}`,
          symbol: grp[0].symbol,
          profitUsd: dayNet,
          cumNetUsd: cum,
          timeLabel:
            lang === 'fa'
              ? formatJalaliShort(sampleTime).slice(5)
              : formatJalaliDate(sampleTime, 'en'),
          dateLabel: formatJalaliDate(sampleTime, lang),
          tradesCount: grp.length,
        };
      });
  }, [rangedTrades, range, lang]);

  const primarySymbolInfo = useMemo(() => {
    if (rangedTrades.length === 0) return { label: state.eaMeta?.symbol || 'XAUUSD', multiCount: 0 };
    const counts = new Map<string, number>();
    rangedTrades.forEach((tr) => counts.set(tr.symbol, (counts.get(tr.symbol) ?? 0) + 1));
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return { label: top?.[0] || 'XAUUSD', multiCount: counts.size };
  }, [rangedTrades, state.eaMeta?.symbol]);

  // Unified Recent Activities feed (Trades + Finance Transactions)
  const unifiedActivities = useMemo(() => {
    const tradeItems = state.trades.map((tr) => ({
      id: tr.id,
      kind: 'trade' as const,
      code: isPrivate ? '#••••' : `#${tr.ticket}`,
      title: `${tr.symbol} · ${tr.direction}`,
      subtitle: tr.setupTag,
      amountStr: isPrivate
        ? PRIVATE_MASK
        : `${tr.profitUsd >= 0 ? '+' : ''}${formatMoney(tr.profitUsd, 'USD', lang)}`,
      positive: tr.profitUsd >= 0,
      statusText: `${tr.profitUsd >= 0 ? t(lang, 'سود', 'Win') : t(lang, 'زیان', 'Loss')} (${tr.rMultiple >= 0 ? '+' : ''}${tr.rMultiple}R)`,
      statusTone: tr.profitUsd >= 0 ? 'positive' : ('danger' as const),
      dateIso: tr.closeTime,
      rawTrade: tr,
    }));

    const txItems = state.transactions.map((tx) => ({
      id: tx.id,
      kind: 'finance' as const,
      code: tx.type.toUpperCase(),
      title: tx.note || t(lang, 'تراکنش مالی', 'Transaction'),
      subtitle: state.bankAccounts.find((a) => a.id === tx.accountId)?.name ?? '—',
      amountStr: isPrivate
        ? PRIVATE_MASK
        : `${tx.type === 'in' ? '+' : tx.type === 'out' ? '-' : ''}${formatMoney(
            tx.amount,
            tx.currency,
            lang
          )}`,
      positive: tx.type === 'in',
      statusText:
        tx.type === 'in'
          ? t(lang, 'واریز', 'Completed')
          : tx.type === 'transfer'
          ? t(lang, 'انتقال', 'Transferred')
          : t(lang, 'برداشت', 'Paid'),
      statusTone: tx.type === 'in' ? 'positive' : tx.type === 'transfer' ? 'accent' : ('warning' as const),
      dateIso: tx.date,
      rawTrade: undefined,
    }));

    const merged = [...tradeItems, ...txItems].filter((item) => {
      if (activityFilter === 'trades' && item.kind !== 'trade') return false;
      if (activityFilter === 'finance' && item.kind !== 'finance') return false;
      return true;
    });

    merged.sort((a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime());
    return merged.slice(0, 7);
  }, [state.trades, state.transactions, state.bankAccounts, activityFilter, lang, isPrivate]);

  const spendingLimitPct =
    finance.bankIrt > 0
      ? Math.min(100, Math.round((finance.monthlyOutIrtOnly / finance.bankIrt) * 100))
      : 0;

  return (
    <div className="space-y-3.5 sm:space-y-5">
      {/* Greeting + Sub-tab & Player HUD Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold text-[var(--ft-text-primary)]">
            {t(lang, 'نمای کلی', 'Overview')}
          </h2>
          <p className="text-[11px] sm:text-xs text-[var(--ft-text-muted)] mt-0.5 truncate">
            {t(
              lang,
              `سطح ${game.currentRank.level} (${game.currentRank.titleFa}) · زنجیره ${state.gamification.streakDays} روزه · ضریب ${game.disciplineMultiplier}x XP`,
              `Level ${game.currentRank.level} (${game.currentRank.titleEn}) · ${state.gamification.streakDays}d Streak · ${game.disciplineMultiplier}x XP`
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 max-w-full">
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl glass-surface overflow-x-auto no-scrollbar max-w-full flex-nowrap">
            <button
              type="button"
              onClick={() => setSubTab('pulse')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'pulse'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {t(lang, 'لحظه‌ای', 'Live')}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('actions')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                subTab === 'actions'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              <span>{t(lang, 'اقدام‌ها', 'Actions')}</span>
              {unreadAlertsCount > 0 && (
                <span className="font-num text-[11px] px-1.5 py-0.5 rounded-full bg-black/20">
                  {unreadAlertsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSubTab('digest')}
              className={`min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'digest'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {t(lang, 'کارنامه', 'Digest')}
            </button>
          </div>

          {game.goldenCombo.comboReady && (
            <button
              type="button"
              onClick={onClaimDailyCombo}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer whitespace-nowrap"
            >
              {t(lang, 'دریافت پاداش کمبو +150 XP', 'Claim Combo +150 XP')}
            </button>
          )}
        </div>
      </div>

      {subTab === 'digest' ? (
        <ExecutiveDigestSection state={state} />
      ) : subTab === 'pulse' ? (
        <>
          {/* TOP BENTO ROW (3-Column Balanced Executive Grid) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 sm:gap-5 items-stretch">
            {/* Column 1: Consolidated Net Worth + Strictly Separated Liquidity */}
            {(() => {
              const grossAssetsIrt = Math.max(0, finance.totalBankIrt + finance.totalTradingIrt);
              const footprintIrt = Math.max(1, grossAssetsIrt + finance.totalDebtIrt);
              const bankSharePct = Math.round((finance.totalBankIrt / footprintIrt) * 100);
              const tradingSharePct = Math.round((finance.totalTradingIrt / footprintIrt) * 100);
              const debtSharePct = Math.max(0, 100 - bankSharePct - tradingSharePct);

              const reservedIrtOnly =
                finance.upcomingBillsIrtOnly +
                finance.upcomingInstallmentsIrtOnly +
                finance.goalReservedIrtOnly;
              const bankLiquidityPct =
                finance.bankIrt > 0
                  ? Math.min(
                      100,
                      Math.max(0, Math.round((finance.safeToSpendIrtOnly / finance.bankIrt) * 100))
                    )
                  : 0;
              const secondaryNetWorth =
                baseCurrency === 'USD'
                  ? formatMoney(finance.netWorthIrt, 'IRT', lang, true, isPrivate)
                  : formatMoney(finance.netWorthUsd, 'USD', lang, false, isPrivate);

              return (
                <section className="xl:col-span-4 glass-surface rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 relative overflow-hidden">
                  {/* Subtle Ambient Theme Orbs */}
                  <div
                    className="pointer-events-none absolute -top-20 -start-16 w-48 h-48 rounded-full blur-3xl opacity-20"
                    style={{ background: 'var(--ft-accent)' }}
                  />
                  <div
                    className="pointer-events-none absolute -bottom-20 -end-16 w-48 h-48 rounded-full blur-3xl opacity-15"
                    style={{ background: 'var(--ft-accent-secondary, var(--ft-positive))' }}
                  />

                  {/* 1. Gradient Hero Net Worth Card (Clearly Consolidated + Separate Native Currencies) */}
                  <div className="relative z-10 p-4 rounded-2xl ft-accent-gradient overflow-hidden flex flex-col gap-2.5 shadow-sm">
                    <div className="pointer-events-none absolute inset-0 h-full w-full bg-gradient-to-br from-white/20 via-transparent to-black/15" />

                    <div className="relative z-10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                          <Wallet className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-xs font-semibold opacity-95 truncate">
                          {t(lang, 'ارزش خالص ترکیبی', 'Consolidated Net Worth')}
                        </span>
                      </div>
                      <span className="font-num text-[11px] font-semibold opacity-90 whitespace-nowrap shrink-0">
                        ≈ {secondaryNetWorth}
                      </span>
                    </div>

                    <div className="relative z-10 flex items-baseline justify-between gap-2 flex-wrap">
                      <div className="font-num text-2xl font-extrabold tracking-tight">
                        {formatMoney(
                          baseCurrency === 'USD' ? finance.netWorthUsd : finance.netWorthIrt,
                          baseCurrency,
                          lang,
                          false,
                          isPrivate
                        )}
                      </div>
                      <span className="font-num text-[10px] opacity-80 whitespace-nowrap">
                        1$ = {usdToman.toLocaleString('en-US')} ت
                      </span>
                    </div>

                    {/* Multi-Segment Asset vs Debt Composition Bar */}
                    <div className="relative z-10 space-y-1 pt-1.5 border-t border-white/20">
                      <div className="flex items-center justify-between text-[10px] font-num opacity-90 gap-2">
                        <span>
                          {t(lang, 'تومانی', 'IRT')}:{' '}
                          {formatMoney(finance.bankIrt, 'IRT', lang, true, isPrivate)}
                        </span>
                        <span>
                          {t(lang, 'دلاری', 'USD')}:{' '}
                          {formatMoney(
                            finance.bankUsd + finance.totalTradingUsd,
                            'USD',
                            lang,
                            true,
                            isPrivate
                          )}
                        </span>
                        <span>
                          {t(lang, 'بدهی', 'Debt')} {debtSharePct}%
                        </span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-black/20 overflow-hidden flex gap-0.5 p-0.5">
                        {bankSharePct > 0 && (
                          <div
                            className="h-full rounded-s-full bg-white/95 transition-all duration-300"
                            style={{ width: `${Math.max(4, bankSharePct)}%` }}
                          />
                        )}
                        {tradingSharePct > 0 && (
                          <div
                            className="h-full bg-white/60 transition-all duration-300"
                            style={{ width: `${Math.max(4, tradingSharePct)}%` }}
                          />
                        )}
                        {debtSharePct > 0 && (
                          <div
                            className="h-full rounded-e-full bg-black/45 transition-all duration-300"
                            style={{ width: `${Math.max(4, debtSharePct)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. Strictly Separated Liquidity Metrics & Quick Action Buttons */}
                  <div className="relative z-10 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--ft-text-muted)]">
                          <Shield
                            className={`w-3.5 h-3.5 shrink-0 ${
                              finance.debtFirstWaterfall.isDebtProtected
                                ? 'text-[var(--ft-positive)]'
                                : 'text-[var(--ft-warning)]'
                            }`}
                          />
                          <span className="truncate">
                            {t(lang, 'قابل خرج آزاد (ریالی/دلاری)', 'Safe-to-Spend (IRT / USD)')}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                          <span className="font-num text-sm font-bold text-[var(--ft-positive)]">
                            {formatMoney(finance.safeToSpendIrtOnly, 'IRT', lang, true, isPrivate)}
                          </span>
                          {(finance.bankUsd > 0 || finance.safeToSpendUsdOnly > 0) && (
                            <span className="font-num text-xs font-semibold text-[var(--ft-accent)]">
                              + {formatMoney(finance.safeToSpendUsdOnly, 'USD', lang, false, isPrivate)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-end shrink-0">
                        <div className="text-[11px] text-[var(--ft-text-muted)]">
                          {t(lang, 'پس‌انداز ۳۰ روز', '30d Savings')}
                        </div>
                        <div className="font-num text-sm font-bold text-[var(--ft-text-primary)] mt-0.5">
                          {finance.savingsRateIrtPct}%
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="h-3 w-full rounded-full bg-[var(--ft-surface-subtle)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(4, bankLiquidityPct)}%`,
                            background: 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))',
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-num text-[var(--ft-text-muted)]">
                        <span>
                          {bankLiquidityPct}% {t(lang, 'تومانی آزاد', 'IRT free')}
                        </span>
                        <span>
                          {t(lang, 'رزرو تومانی:', 'IRT Reserved:')}{' '}
                          {formatMoney(reservedIrtOnly, 'IRT', lang, true, isPrivate)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={onOpenQuickAction}
                        className="py-2 px-3 text-xs font-semibold rounded-xl ft-accent-gradient hover:opacity-95 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span>{t(lang, 'ثبت / انتقال', 'Transfer / Log')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onDistributeTodayProfitToGoals}
                        className="py-2 px-3 text-xs font-semibold rounded-xl bg-[var(--ft-surface-subtle)] hover:border-[var(--ft-accent)] border border-[var(--ft-border)] text-[var(--ft-text-primary)] cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Target className="w-3.5 h-3.5" />
                        <span>{t(lang, 'تخصیص به هدف', 'Fund Goals')}</span>
                      </button>
                    </div>
                  </div>

                  {/* 3. Compact Interactive Accounts Strip (Collapsible on mobile to minimize scrolling) */}
                  <div className="relative z-10 space-y-1.5 pt-2.5 sm:pt-3 border-t border-[var(--ft-border)]">
                    <div className="flex items-center justify-between text-xs px-0.5">
                      <button
                        type="button"
                        onClick={() => setShowMobileAccounts((v) => !v)}
                        className="sm:hidden flex items-center gap-1 font-semibold text-[var(--ft-text-secondary)] cursor-pointer"
                      >
                        <span>
                          {t(lang, 'حساب‌ها', 'Accounts')} (
                          {state.bankAccounts.length + state.mt5Accounts.filter((a) => !a.isDemo).length})
                        </span>
                        {showMobileAccounts ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span className="hidden sm:inline font-semibold text-[var(--ft-text-secondary)]">
                        {t(lang, 'حساب‌ها', 'Accounts')}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate('finance', 'accounts')}
                        className="text-[var(--ft-accent)] hover:underline cursor-pointer flex items-center gap-0.5 font-num whitespace-nowrap shrink-0"
                      >
                        <span>
                          {state.bankAccounts.length + state.mt5Accounts.filter((a) => !a.isDemo).length}{' '}
                          {t(lang, 'حساب', 'accounts')}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className={`${showMobileAccounts ? 'space-y-1.5 pt-1' : 'hidden sm:block sm:space-y-1.5 sm:pt-1'}`}>

                    {state.bankAccounts.slice(0, 2).map((acc) => {
                      const accIrt = convertCurrency(acc.balance, acc.currency, 'IRT', usdToman);
                      const sharePct =
                        grossAssetsIrt > 0 ? Math.min(100, Math.round((accIrt / grossAssetsIrt) * 100)) : 0;

                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => onNavigate('finance', 'accounts')}
                          className="w-full text-start py-1.5 px-2.5 rounded-xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Landmark className="w-3.5 h-3.5 text-[var(--ft-accent)] shrink-0" />
                              <span className="text-xs font-medium text-[var(--ft-text-primary)] truncate">
                                {acc.name}
                              </span>
                              <span className="font-num text-[10px] text-[var(--ft-text-muted)] shrink-0">
                                {sharePct}%
                              </span>
                            </div>
                            <span className="font-num text-xs font-bold text-[var(--ft-text-primary)] whitespace-nowrap shrink-0">
                              {formatMoney(acc.balance, acc.currency, lang, true, isPrivate)}
                            </span>
                          </div>
                        </button>
                      );
                    })}

                    {(state.mt5Accounts.find((a) => !a.isDemo) ?? state.mt5Accounts[0]) && (() => {
                      const mt5 = state.mt5Accounts.find((a) => !a.isDemo) ?? state.mt5Accounts[0];
                      const mt5Irt = mt5.isDemo ? 0 : convertCurrency(mt5.equity, 'USD', 'IRT', usdToman);
                      const sharePct =
                        !mt5.isDemo && grossAssetsIrt > 0
                          ? Math.min(100, Math.round((mt5Irt / grossAssetsIrt) * 100))
                          : 0;

                      return (
                        <button
                          type="button"
                          onClick={() => onNavigate('trading', 'accounts')}
                          className="w-full text-start py-1.5 px-2.5 rounded-xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)] transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <TrendingUp className="w-3.5 h-3.5 text-[var(--ft-positive)] shrink-0" />
                              <span className="text-xs font-medium text-[var(--ft-text-primary)] truncate">
                                {mt5.broker} · #{maskText(mt5.accountNumber, isPrivate)}
                              </span>
                              <span className="font-num text-[10px] text-[var(--ft-text-muted)] shrink-0">
                                {mt5.isDemo ? t(lang, 'دمو', 'Demo') : `${sharePct}%`}
                              </span>
                            </div>
                            <span className="font-num text-xs font-bold text-[var(--ft-positive)] whitespace-nowrap shrink-0">
                              {formatMoney(mt5.equity, 'USD', lang, true, isPrivate)}
                            </span>
                          </div>
                        </button>
                      );
                    })()}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Column 2: Redesigned Executive Trading & Liquidity Matrix (Focus Target 1) */}
            <section className="xl:col-span-4 glass-surface rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 relative overflow-hidden">
              {/* Top Hero: Period Trading Net P&L + Mini Trade Impulse Sparkbars */}
              {(() => {
                const isDanger =
                  ddStatus.breached || (kpis.netProfitUsd < 0 && !ddStatus.warning);
                const isWarning =
                  !isDanger &&
                  (ddStatus.warning || (kpis.tradeCount > 0 && kpis.netProfitUsd === 0));
                const isProfit = !isDanger && !isWarning && kpis.netProfitUsd > 0;

                const heroBgStyle: React.CSSProperties | undefined = isDanger
                  ? {
                      background:
                        'linear-gradient(135deg, color-mix(in srgb, var(--ft-danger) 70%, #7f1d1d 30%) 0%, color-mix(in srgb, var(--ft-danger) 56%, #881337 44%) 100%)',
                    }
                  : isWarning
                  ? {
                      background:
                        'linear-gradient(135deg, color-mix(in srgb, var(--ft-warning) 62%, #92400e 38%) 0%, color-mix(in srgb, var(--ft-warning) 50%, #78350f 50%) 100%)',
                    }
                  : isProfit
                  ? {
                      background:
                        'linear-gradient(135deg, color-mix(in srgb, var(--ft-positive) 68%, #065f46 32%) 0%, color-mix(in srgb, var(--ft-positive) 56%, #0f766e 44%) 100%)',
                    }
                  : undefined;

                const hasSemanticBg = isDanger || isWarning || isProfit;

                return (
                  <div
                    className={`p-4 rounded-2xl relative overflow-hidden flex flex-col gap-3 shadow-sm transition-colors ${
                      hasSemanticBg ? 'text-white' : 'ft-accent-gradient'
                    }`}
                    style={heroBgStyle}
                  >
                    <div className="pointer-events-none absolute inset-0 h-full w-full bg-gradient-to-br from-white/15 via-transparent to-black/20" />

                    <div className="relative z-10 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm shrink-0">
                          <TrendingUp className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-xs font-semibold opacity-95 truncate">
                          {t(lang, 'بازده ترید', 'Trading P&L')}
                        </span>
                      </div>
                      <span className="font-num text-[11px] font-semibold opacity-95 whitespace-nowrap shrink-0">
                        {ddStatus.breached
                          ? t(lang, 'سقف ضرر!', 'DD Limit!')
                          : ddStatus.warning
                          ? t(lang, `هشدار افت ${ddStatus.usedPct}%`, `Warn ${ddStatus.usedPct}% DD`)
                          : `${ddStatus.usedPct}% DD`}
                      </span>
                    </div>

                    <div className="relative z-10 flex items-end justify-between gap-3">
                      <div>
                        <div className="font-num text-2xl font-extrabold tracking-tight">
                          {!isPrivate && kpis.netProfitUsd > 0 ? '+' : ''}
                          {formatMoney(kpis.netProfitUsd, 'USD', lang, false, isPrivate)}
                        </div>
                        <div className="font-num text-[11px] opacity-90 mt-0.5">
                          {kpis.tradeCount} {t(lang, 'معامله', 'trades')} · {kpis.avgR >= 0 ? '+' : ''}
                          {kpis.avgR}R · {rangeLabel}
                        </div>
                      </div>

                      {/* Mini Trade Impulse Sparkbars */}
                      <div className="flex items-end gap-1 h-9 px-2 py-1 rounded-xl bg-black/20 shrink-0">
                        {rangedTrades.length === 0 ? (
                          <span className="text-[10px] opacity-75 px-1">—</span>
                        ) : (
                          [...rangedTrades]
                            .sort((a, b) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime())
                            .slice(-9)
                            .map((tr) => {
                              const maxAbs = Math.max(
                                1,
                                ...rangedTrades.map((item) => Math.abs(item.profitUsd))
                              );
                              const hPct = Math.max(22, Math.round((Math.abs(tr.profitUsd) / maxAbs) * 100));
                              return (
                                <span
                                  key={tr.id}
                                  className="w-1.5 rounded-full transition-all"
                                  style={{
                                    height: `${hPct}%`,
                                    backgroundColor:
                                      tr.profitUsd >= 0 ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.55)',
                                  }}
                                />
                              );
                            })
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Middle Split: Win Rate & PF Progress (2x Height) + Clean Avg Win/Loss Telemetry */}
              <div className="space-y-3.5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="text-[var(--ft-text-secondary)] font-medium">
                      {t(lang, 'نرخ برد · PF', 'Win Rate · PF')}
                    </span>
                    <span className="font-num font-bold text-[var(--ft-text-primary)] whitespace-nowrap">
                      {kpis.winRate}% · <span className="text-[var(--ft-positive)]">PF {kpis.profitFactor}</span>
                    </span>
                  </div>
                  <div className="h-4 w-full rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-hidden flex">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(4, kpis.winRate)}%`,
                        background: 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between font-num text-[11px] text-[var(--ft-text-muted)]">
                    <span>
                      {kpis.winCount}W / {kpis.lossCount}L
                    </span>
                    <span>
                      {t(lang, 'سود ناخالص:', 'Gross:')}{' '}
                      {formatMoney(kpis.grossProfitUsd, 'USD', lang, true, isPrivate)}
                    </span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[var(--ft-border)] grid grid-cols-2 gap-3 font-num">
                  <div className="min-w-0">
                    <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                      {t(lang, 'میانگین هر برد', 'Avg Win')}
                    </div>
                    <div className="text-sm font-bold text-[var(--ft-positive)] mt-0.5 truncate">
                      {isPrivate ? PRIVATE_MASK : `+$${Math.round(kpis.avgWinUsd).toLocaleString('en-US')}`}
                    </div>
                  </div>
                  <div className="min-w-0 text-end">
                    <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                      {t(lang, 'میانگین هر باخت', 'Avg Loss')}
                    </div>
                    <div className="text-sm font-bold text-[var(--ft-danger)] mt-0.5 truncate">
                      {isPrivate ? PRIVATE_MASK : `-$${Math.round(kpis.avgLossUsd).toLocaleString('en-US')}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Divider Strip: Strictly Separated 30d Spending & Debt */}
              <div className="pt-3 border-t border-[var(--ft-border)] grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('finance', 'transactions')}
                  className="text-start py-2 px-3 rounded-xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)] transition-colors cursor-pointer min-w-0"
                >
                  <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                    {t(lang, 'مخارج این ماه', 'Monthly Spend')}
                  </div>
                  <div className="font-num text-sm font-bold text-[var(--ft-text-primary)] mt-0.5 truncate">
                    {formatMoney(finance.monthlyOutIrtOnly, 'IRT', lang, true, isPrivate)}
                  </div>
                  {finance.monthlyOutUsdOnly > 0 && (
                    <div className="font-num text-[10px] text-[var(--ft-accent)] truncate">
                      + {formatMoney(finance.monthlyOutUsdOnly, 'USD', lang, false, isPrivate)}
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('finance', 'planning')}
                  className="text-start py-2 px-3 rounded-xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)] transition-colors cursor-pointer min-w-0"
                >
                  <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                    {t(lang, 'بدهی / اقساط کل', 'Total Debt')}
                  </div>
                  <div className="font-num text-sm font-bold text-[var(--ft-danger)] mt-0.5 truncate">
                    {formatMoney(finance.totalDebtIrtOnly, 'IRT', lang, true, isPrivate)}
                  </div>
                  {finance.creditAvailableIrt > 0 ? (
                    <div className="font-num text-[10px] text-[var(--ft-positive)] truncate">
                      {t(lang, 'اعتبار آزاد:', 'Avail. Credit:')}{' '}
                      {formatMoney(finance.creditAvailableIrt, 'IRT', lang, true, isPrivate)}
                    </div>
                  ) : finance.totalDebtUsdOnly > 0 ? (
                    <div className="font-num text-[10px] text-[var(--ft-danger)] opacity-85 truncate">
                      + {formatMoney(finance.totalDebtUsdOnly, 'USD', lang, false, isPrivate)}
                    </div>
                  ) : null}
                </button>
              </div>
            </section>

            {/* Column 3: Clear Single-Glance Profitability Chart driven by Header timeRange */}
            {(() => {
              const bestPoint =
                periodPerformancePoints.length > 0
                  ? [...periodPerformancePoints].sort((a, b) => b.profitUsd - a.profitUsd)[0]
                  : null;
              const worstPoint =
                periodPerformancePoints.length > 0
                  ? [...periodPerformancePoints].sort((a, b) => a.profitUsd - b.profitUsd)[0]
                  : null;
              const payoffRatio =
                kpis.avgLossUsd > 0
                  ? (kpis.avgWinUsd / kpis.avgLossUsd).toFixed(1)
                  : kpis.avgWinUsd > 0
                  ? '∞'
                  : '0';

              return (
                <section className="xl:col-span-4 glass-surface rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-[var(--ft-text-primary)] truncate">
                          {t(lang, 'روند سودآوری', 'Profitability')}
                        </h3>
                        <span className="font-num text-[11px] font-semibold text-[var(--ft-accent)] shrink-0">
                          {primarySymbolInfo.label}
                          {primarySymbolInfo.multiCount > 1 ? ` +${primarySymbolInfo.multiCount - 1}` : ''}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--ft-text-muted)] truncate">
                        {range === 'today'
                          ? t(lang, `جمع تجمعی و نتیجه هر معامله (${rangeLabel})`, `Cumulative & per-trade (${rangeLabel})`)
                          : t(lang, `سود و زیان روزانه نسبت به خط سر‌به‌سر (${rangeLabel})`, `Daily P&L vs break-even (${rangeLabel})`)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowMobileChart((v) => !v)}
                        className="sm:hidden px-2.5 py-1 rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] text-[11px] font-medium text-[var(--ft-text-secondary)] flex items-center gap-1 cursor-pointer"
                      >
                        <span>{showMobileChart ? t(lang, 'بستن نمودار', 'Hide') : t(lang, 'نمودار', 'Chart')}</span>
                        {showMobileChart ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('trading', 'analytics')}
                        className="text-xs font-medium text-[var(--ft-accent)] hover:underline cursor-pointer whitespace-nowrap"
                      >
                        {t(lang, 'آنالیز', 'Analytics')}
                      </button>
                    </div>
                  </div>

                  <div className={showMobileChart ? 'block' : 'hidden sm:block'}>
                    <SingleSymbolPerformanceChart
                      points={periodPerformancePoints}
                      height={176}
                      privateMode={isPrivate}
                      emptyText={t(
                        lang,
                        'معامله‌ای در بازه انتخابی برای رسم روند ثبت نشده است',
                        'No trades recorded in the selected header period'
                      )}
                      legendCurveLabel={t(lang, 'روند کل', 'Cumulative')}
                      legendBarsLabel={
                        range === 'today' ? t(lang, 'هر معامله', 'Trades') : t(lang, 'روزانه', 'Daily')
                      }
                      labels={{
                        periodNet: t(lang, 'خالص بازه', 'Period Net'),
                        positiveLabel: t(lang, 'مثبت', 'win'),
                        negativeLabel: t(lang, 'منفی', 'loss'),
                        cumulativeLabel: t(lang, 'تجمعی', 'Total'),
                        tradesWord: t(lang, 'معامله', 'trades'),
                      }}
                    />
                  </div>

                  {/* Plain-Language Bottom Stats (Best / Worst / Payoff Ratio) */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--ft-border)] font-num">
                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                        {range === 'today'
                          ? t(lang, 'بهترین معامله', 'Best Trade')
                          : t(lang, 'بهترین روز', 'Best Day')}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-[var(--ft-positive)] mt-0.5 truncate">
                        {isPrivate
                          ? PRIVATE_MASK
                          : bestPoint && bestPoint.profitUsd > 0
                          ? `+$${Math.round(bestPoint.profitUsd).toLocaleString('en-US')}`
                          : '$0'}
                      </div>
                      {bestPoint && bestPoint.profitUsd > 0 && (
                        <div className="text-[10px] text-[var(--ft-text-muted)] truncate">
                          {bestPoint.timeLabel}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                        {range === 'today'
                          ? t(lang, 'بدترین معامله', 'Worst Trade')
                          : t(lang, 'بدترین روز', 'Worst Day')}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-[var(--ft-danger)] mt-0.5 truncate">
                        {isPrivate
                          ? PRIVATE_MASK
                          : worstPoint && worstPoint.profitUsd < 0
                          ? `-$${Math.abs(Math.round(worstPoint.profitUsd)).toLocaleString('en-US')}`
                          : '$0'}
                      </div>
                      {worstPoint && worstPoint.profitUsd < 0 && (
                        <div className="text-[10px] text-[var(--ft-text-muted)] truncate">
                          {worstPoint.timeLabel}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 text-end">
                      <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                        {t(lang, 'سود به ضرر', 'Payoff')}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-[var(--ft-accent)] mt-0.5 truncate">
                        1:{payoffRatio}
                      </div>
                      <div className="text-[10px] text-[var(--ft-text-muted)] truncate">
                        {kpis.maxWinStreak}W · {kpis.maxLossStreak}L
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}
          </div>

          {/* BOTTOM BENTO ROW: Left (Spending Limit + Goal & Streak Cards) & Right (Activities Table) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 sm:gap-5 items-stretch">
            {/* Left Column (4 cols) */}
            <div className="xl:col-span-4 flex flex-col gap-3.5 sm:gap-5">
              {/* Monthly Spending Limit Bar (Pure IRT liquidity vs IRT spend) */}
              <section className="glass-surface rounded-3xl p-4 sm:p-5 space-y-2.5 sm:space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'مخارج ماه', 'Monthly Spend')}
                  </h3>
                  <span className="font-num text-xs font-semibold text-[var(--ft-accent)] whitespace-nowrap">
                    {spendingLimitPct}%
                  </span>
                </div>
                <StripedProgressBar
                  valuePct={spendingLimitPct}
                  tone={spendingLimitPct > 85 ? 'danger' : spendingLimitPct > 65 ? 'warning' : 'accent'}
                  heightClass="h-5 sm:h-6"
                />
                <div className="flex items-center justify-between text-xs font-num text-[var(--ft-text-muted)]">
                  <span>
                    {formatMoney(finance.monthlyOutIrtOnly, 'IRT', lang, true, isPrivate)}{' '}
                    {t(lang, 'خرج‌شده از', 'spent of')}
                  </span>
                  <span>{formatMoney(finance.bankIrt, 'IRT', lang, true, isPrivate)}</span>
                </div>
                {finance.monthlyOutUsdOnly > 0 && (
                  <div className="text-[11px] font-num text-[var(--ft-accent)] pt-1 border-t border-[var(--ft-border)] flex items-center justify-between">
                    <span>{t(lang, 'مخارج دلاری:', 'USD Spend:')}</span>
                    <span>{formatMoney(finance.monthlyOutUsdOnly, 'USD', lang, false, isPrivate)}</span>
                  </div>
                )}
              </section>

              {/* Visual Goal & Streak Cards */}
              <section className="glass-surface rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3 sm:gap-4 flex-1">
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[var(--ft-text-primary)]">
                      {t(lang, 'اهداف و استریک', 'Goals & Streaks')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('growth', 'goals')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {activeGoals.length > 1
                        ? `${t(lang, 'همه', 'All')} (${activeGoals.length})`
                        : `+ ${t(lang, 'اهداف', 'Goals')}`}
                    </button>
                  </div>

                  {activeGoals.length === 0 ? (
                    <div className="p-4 rounded-2xl glass-tile text-center space-y-2.5">
                      <Target className="w-6 h-6 mx-auto text-[var(--ft-accent)]" />
                      <p className="text-xs text-[var(--ft-text-muted)]">
                        {t(
                          lang,
                          'هنوز هدف فعالی ثبت نشده است. اولین هدف مالی خود را اضافه کنید.',
                          'No active goals yet. Add your first financial goal.'
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => onNavigate('growth', 'goals')}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer"
                      >
                        {t(lang, 'تعریف اولین هدف', 'Create First Goal')}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                      {activeGoals.slice(0, 2).map((goal, idx) => {
                        const alloc = game.priorityAllocations.find((a) => a.goalId === goal.id);
                        const effectiveWeekly =
                          goal.autoPriorityBudget !== false && alloc
                            ? alloc.weeklyAmountInGoalCurrency
                            : goal.weeklyBudgetAmount;
                        const plan = computeGoalPlan(
                          { ...goal, weeklyBudgetAmount: effectiveWeekly },
                          kpis.profitFactor,
                          kpis.avgR
                        );
                        const isPrimary = idx === 0;
                        return (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() => onNavigate('growth', 'goals')}
                            className={`p-3.5 sm:p-4 rounded-2xl text-start transition-transform hover:-translate-y-0.5 cursor-pointer space-y-2 ${
                              isPrimary ? 'ft-accent-gradient shadow-sm' : 'glass-tile hidden sm:block'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs opacity-90">
                              <span className="font-num font-semibold">
                                P{goal.priority} · {alloc ? `${alloc.sharePct}%` : `${goal.allocationPct}%`}
                              </span>
                              <span className="font-num font-bold">{plan.progressPct}%</span>
                            </div>
                            <div className="text-sm font-bold truncate">{goal.title}</div>
                            <div
                              className={`h-2.5 sm:h-3 rounded-full overflow-hidden ${
                                isPrimary ? 'bg-white/25' : 'bg-[var(--ft-surface-subtle)]'
                              }`}
                            >
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${plan.progressPct}%`,
                                  background: isPrimary ? '#ffffff' : 'var(--ft-accent-grad)',
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-num opacity-85">
                              <span>{formatMoney(goal.savedAmount, goal.currency, lang, true, isPrivate)}</span>
                              <span>
                                {goal.deadlineMode === 'open_until_funded'
                                  ? t(lang, 'باز تا تأمین بودجه', 'Open Until Funded')
                                  : formatJalaliDate(goal.targetDate, lang)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {game.priorityAllocations.length > 0 && (
                    <div className="pt-2 border-t border-[var(--ft-border)]">
                      <PriorityAllocationBar
                        segments={game.priorityAllocations.map((alloc) => {
                          const g = state.goals.find((item) => item.id === alloc.goalId);
                          return {
                            goalId: alloc.goalId,
                            title: g?.title ?? '',
                            priority: alloc.priority,
                            sharePct: alloc.sharePct,
                            formattedBudget: formatMoney(alloc.weeklyAmountIrt, 'IRT', lang, true, isPrivate),
                          };
                        })}
                      />
                    </div>
                  )}
                </div>

                {/* Goal & Discipline Streak Summary Footer */}
                <div className="pt-3 border-t border-[var(--ft-border)] flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-[var(--ft-text-secondary)] truncate">
                    <Flame className="w-3.5 h-3.5 text-[var(--ft-warning)] shrink-0" />
                    <span className="font-num truncate">
                      {t(
                        lang,
                        `استریک ${state.gamification.streakDays} روزه · ضریب ${game.disciplineMultiplier}x`,
                        `${state.gamification.streakDays}d Streak · ${game.disciplineMultiplier}x Multiplier`
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigate('growth', 'quests')}
                    className="text-[var(--ft-accent)] font-semibold shrink-0 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    {t(lang, 'مأموریت‌ها', 'Quests')}
                  </button>
                </div>
              </section>
            </div>

            {/* Right Column (8 cols): Recent Activities Visual Table */}
            <section className="xl:col-span-8 glass-surface rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 sm:gap-4">
              <div className="flex flex-row items-center justify-between gap-3">
                <h3 className="text-sm sm:text-base font-semibold text-[var(--ft-text-primary)] truncate">
                  {t(lang, 'فعالیت‌های اخیر', 'Recent Activity')}
                </h3>

                <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] shrink-0">
                  {(
                    [
                      ['all', t(lang, 'همه', 'All')],
                      ['trades', t(lang, 'ترید', 'Trades')],
                      ['finance', t(lang, 'مالی', 'Finance')],
                    ] as Array<['all' | 'trades' | 'finance', string]>
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActivityFilter(id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer whitespace-nowrap shrink-0 ${
                        activityFilter === id
                          ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)]'
                          : 'text-[var(--ft-text-secondary)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Card View (< sm, capped to 3 by default to prevent excessive mobile scroll) */}
              <div className="sm:hidden space-y-2 flex-1">
                {unifiedActivities.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--ft-text-muted)]">
                    {t(lang, 'هنوز فعالیتی در این دسته‌بندی ثبت نشده است.', 'No activities recorded in this category.')}
                  </div>
                ) : (
                  <>
                    {(showAllMobileActivities ? unifiedActivities : unifiedActivities.slice(0, 3)).map((item) => (
                      <div
                        key={`mob_${item.kind}_${item.id}`}
                        onClick={() => {
                          if (item.rawTrade) onInspectTrade(item.rawTrade);
                          else onNavigate('finance', 'transactions');
                        }}
                        className="p-2.5 rounded-2xl glass-tile hover:bg-[var(--ft-surface-hover)] transition-colors cursor-pointer space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="p-1.5 rounded-lg bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] shrink-0">
                              {item.positive ? (
                                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--ft-positive)]" />
                              ) : (
                                <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--ft-danger)]" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                                {item.subtitle}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`text-xs font-num font-bold whitespace-nowrap shrink-0 ${
                              item.positive ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-text-primary)]'
                            }`}
                          >
                            {item.amountStr}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-[var(--ft-border)]">
                          <div className="flex items-center gap-2 font-num">
                            <span className="text-[var(--ft-text-muted)]">{item.code}</span>
                            <span
                              className={`font-medium ${
                                item.statusTone === 'positive'
                                  ? 'text-[var(--ft-positive)]'
                                  : item.statusTone === 'danger'
                                  ? 'text-[var(--ft-danger)]'
                                  : item.statusTone === 'warning'
                                  ? 'text-[var(--ft-warning)]'
                                  : 'text-[var(--ft-accent)]'
                              }`}
                            >
                              {item.statusText}
                            </span>
                          </div>
                          <span className="font-num text-[var(--ft-text-muted)]">
                            {formatJalaliDateTime(item.dateIso, lang)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {unifiedActivities.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllMobileActivities((v) => !v)}
                        className="w-full py-2 rounded-xl border border-[var(--ft-border)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium text-[var(--ft-accent)] cursor-pointer"
                      >
                        {showAllMobileActivities
                          ? t(lang, 'نمایش کمتر', 'Show Less')
                          : t(lang, `مشاهده همه (${unifiedActivities.length})`, `Show All (${unifiedActivities.length})`)}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Desktop / Tablet Table View (>= sm) */}
              <div className="hidden sm:block overflow-x-auto flex-1">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-xs text-[var(--ft-text-muted)] bg-[var(--ft-surface-subtle)]">
                      <th className="py-2.5 px-3 text-start font-medium rounded-s-xl whitespace-nowrap">
                        {t(lang, 'شناسه', 'Ref ID')}
                      </th>
                      <th className="py-2.5 px-3 text-start font-medium whitespace-nowrap">
                        {t(lang, 'شرح فعالیت', 'Activity')}
                      </th>
                      <th className="py-2.5 px-3 text-start font-medium whitespace-nowrap">
                        {t(lang, 'مبلغ', 'Amount')}
                      </th>
                      <th className="py-2.5 px-3 text-start font-medium whitespace-nowrap">
                        {t(lang, 'وضعیت', 'Status')}
                      </th>
                      <th className="py-2.5 px-3 text-end font-medium rounded-e-xl whitespace-nowrap">
                        {t(lang, 'تاریخ', 'Date')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ft-border)]">
                    {unifiedActivities.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-xs text-[var(--ft-text-muted)]">
                          {t(lang, 'هنوز فعالیتی در این دسته‌بندی ثبت نشده است.', 'No activities recorded in this category.')}
                        </td>
                      </tr>
                    ) : (
                      unifiedActivities.map((item) => (
                        <tr
                          key={`${item.kind}_${item.id}`}
                          onClick={() => {
                            if (item.rawTrade) onInspectTrade(item.rawTrade);
                            else onNavigate('finance', 'transactions');
                          }}
                          className="hover:bg-[var(--ft-surface-hover)] transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-3 font-num text-xs text-[var(--ft-text-muted)] whitespace-nowrap">
                            {item.code}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="p-1.5 rounded-lg bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] shrink-0">
                                {item.positive ? (
                                  <ArrowUpRight className="w-3.5 h-3.5 text-[var(--ft-positive)]" />
                                ) : (
                                  <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--ft-danger)]" />
                                )}
                              </span>
                              <div className="min-w-0">
                                <div className="font-medium text-[var(--ft-text-primary)] truncate max-w-[200px]">
                                  {item.title}
                                </div>
                                <div className="text-[11px] text-[var(--ft-text-muted)] truncate max-w-[200px]">
                                  {item.subtitle}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td
                            className={`py-2.5 px-3 font-num font-semibold whitespace-nowrap ${
                              item.positive ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-text-primary)]'
                            }`}
                          >
                            {item.amountStr}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`text-xs font-medium ${
                                item.statusTone === 'positive'
                                  ? 'text-[var(--ft-positive)]'
                                  : item.statusTone === 'danger'
                                  ? 'text-[var(--ft-danger)]'
                                  : item.statusTone === 'warning'
                                  ? 'text-[var(--ft-warning)]'
                                  : 'text-[var(--ft-accent)]'
                              }`}
                            >
                              {item.statusText}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-end font-num text-xs text-[var(--ft-text-muted)] whitespace-nowrap">
                            {formatJalaliDateTime(item.dateIso, lang)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* UPCOMING FINANCIAL OBLIGATIONS AT A GLANCE (Table + Jalali Financial Calendar) */}
          <section className="glass-surface rounded-3xl p-4 sm:p-5 space-y-3.5 sm:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--ft-border)]">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-[var(--ft-text-primary)] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--ft-accent)] shrink-0" />
                  <span>{t(lang, 'سررسیدهای پیش‌رو', 'Upcoming Bills')}</span>
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)] font-num mt-0.5">
                  {upcomingObligations.length} {t(lang, 'مورد', 'items')} ·{' '}
                  {formatMoney(
                    upcomingObligations.reduce(
                      (s, item) => s + convertCurrency(item.amount, item.currency, 'IRT', usdToman),
                      0
                    ),
                    'IRT',
                    lang,
                    true,
                    isPrivate
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-x-auto no-scrollbar max-w-full flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setObligationsMode('table')}
                    className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-xl cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      obligationsMode === 'table'
                        ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)]'
                        : 'text-[var(--ft-text-secondary)]'
                    }`}
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>{t(lang, 'جدول', 'Table')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setObligationsMode('calendar')}
                    className={`min-h-[34px] px-3 py-1.5 text-xs font-medium rounded-xl cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      obligationsMode === 'calendar'
                        ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)]'
                        : 'text-[var(--ft-text-secondary)]'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{t(lang, 'تقویم', 'Calendar')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('finance', 'planning')}
                  className="text-xs font-medium text-[var(--ft-accent)] hover:underline cursor-pointer whitespace-nowrap px-2"
                >
                  {t(lang, 'مدیریت اقساط', 'Manage')}
                </button>
              </div>
            </div>

            {obligationsMode === 'table' ? (
              <>
                {/* Mobile Cards (< sm, capped to 3 by default to prevent excessive scrolling) */}
                <div className="sm:hidden space-y-2">
                  {upcomingObligations.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[var(--ft-text-muted)]">
                      {t(
                        lang,
                        'تبریک! هیچ قسط یا هزینه سررسیدشده‌ای در پیش نیست.',
                        'All clear — no upcoming financial obligations.'
                      )}
                    </div>
                  ) : (
                    <>
                      {(showAllMobileObligations
                        ? upcomingObligations.slice(0, 8)
                        : upcomingObligations.slice(0, 3)
                      ).map((item) => {
                        const kindLabel =
                          item.kind === 'credit_installment'
                            ? t(lang, 'قسط اعتبار', 'BNPL Credit')
                            : item.kind === 'loan_installment'
                            ? t(lang, 'قسط وام', 'Loan')
                            : item.kind === 'fixed_bill'
                            ? t(lang, 'هزینه ثابت', 'Fixed Bill')
                            : t(lang, 'بدهی شخص', 'Personal Debt');
                        const dueText =
                          item.daysLeft < 0
                            ? t(lang, `${Math.abs(item.daysLeft)} روز عقب‌افتاده`, `${Math.abs(item.daysLeft)}d overdue`)
                            : item.daysLeft === 0
                            ? t(lang, 'سررسید امروز', 'Due today')
                            : t(lang, `${item.daysLeft} روز دیگر`, `In ${item.daysLeft}d`);

                        return (
                          <div key={`mob_ob_${item.id}`} className="p-3 rounded-2xl glass-tile space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                                  {item.title}
                                </div>
                                <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                                  {kindLabel} · {item.subtitle}
                                </div>
                              </div>
                              <span className="font-num text-xs font-bold text-[var(--ft-text-primary)] whitespace-nowrap shrink-0">
                                {formatMoney(item.amount, item.currency, lang, false, isPrivate)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--ft-border)]">
                              <div className="font-num text-[11px]">
                                <span className="text-[var(--ft-text-primary)]">
                                  {formatJalaliDate(item.dueDateIso, lang)}
                                </span>{' '}
                                <span
                                  className={`font-semibold ${
                                    item.daysLeft <= 0
                                      ? 'text-[var(--ft-danger)]'
                                      : item.daysLeft <= 5
                                      ? 'text-[var(--ft-warning)]'
                                      : 'text-[var(--ft-text-muted)]'
                                  }`}
                                >
                                  ({dueText})
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onNavigate(
                                    'finance',
                                    item.kind === 'personal_debt' ? 'people' : 'planning'
                                  )
                                }
                                className="px-3 py-1 text-xs font-semibold rounded-lg border border-[var(--ft-border-strong)] hover:bg-[var(--ft-accent)] hover:text-[var(--ft-accent-fg)] cursor-pointer transition-colors"
                              >
                                {item.kind === 'fixed_bill'
                                  ? t(lang, 'مشاهده', 'View')
                                  : t(lang, 'پرداخت', 'Pay')}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {upcomingObligations.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setShowAllMobileObligations((v) => !v)}
                          className="w-full py-2 rounded-xl border border-[var(--ft-border)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium text-[var(--ft-accent)] cursor-pointer"
                        >
                          {showAllMobileObligations
                            ? t(lang, 'نمایش کمتر', 'Show Less')
                            : t(
                                lang,
                                `مشاهده همه (${Math.min(8, upcomingObligations.length)})`,
                                `Show All (${Math.min(8, upcomingObligations.length)})`
                              )}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Desktop Table (>= sm) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="text-xs text-[var(--ft-text-muted)] bg-[var(--ft-surface-subtle)]">
                        <th className="py-2.5 px-3 text-start font-medium rounded-s-xl whitespace-nowrap">
                          {t(lang, 'عنوان تعهد / هزینه', 'Obligation')}
                        </th>
                        <th className="py-2.5 px-3 text-start font-medium whitespace-nowrap">
                          {t(lang, 'نوع / منشاء', 'Origin')}
                        </th>
                        <th className="py-2.5 px-3 text-start font-medium whitespace-nowrap">
                          {t(lang, 'سررسید جلالی', 'Due Date')}
                        </th>
                        <th className="py-2.5 px-3 text-start font-medium whitespace-nowrap">
                          {t(lang, 'مبلغ قسط / هزینه', 'Amount')}
                        </th>
                        <th className="py-2.5 px-3 text-end font-medium rounded-e-xl whitespace-nowrap">
                          {t(lang, 'اقدام', 'Action')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ft-border)]">
                      {upcomingObligations.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-xs text-[var(--ft-text-muted)]">
                            {t(
                              lang,
                              'تبریک! هیچ قسط یا هزینه سررسیدشده‌ای در پیش نیست.',
                              'All clear — no upcoming financial obligations.'
                            )}
                          </td>
                        </tr>
                      ) : (
                        upcomingObligations.slice(0, 8).map((item) => {
                          const kindLabel =
                            item.kind === 'credit_installment'
                              ? t(lang, 'قسط اعتبار', 'BNPL Credit')
                              : item.kind === 'loan_installment'
                              ? t(lang, 'قسط وام', 'Loan')
                              : item.kind === 'fixed_bill'
                              ? t(lang, 'هزینه ثابت', 'Fixed Bill')
                              : t(lang, 'بدهی شخص', 'Personal Debt');
                          const dueText =
                            item.daysLeft < 0
                              ? t(lang, `${Math.abs(item.daysLeft)} روز عقب‌افتاده`, `${Math.abs(item.daysLeft)}d overdue`)
                              : item.daysLeft === 0
                              ? t(lang, 'سررسید امروز', 'Due today')
                              : t(lang, `${item.daysLeft} روز دیگر`, `In ${item.daysLeft}d`);

                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-[var(--ft-surface-hover)] transition-colors"
                            >
                              <td className="py-2.5 px-3">
                                <div className="font-medium text-[var(--ft-text-primary)] truncate max-w-[220px]">
                                  {item.title}
                                </div>
                                <div className="text-[11px] text-[var(--ft-text-muted)] truncate max-w-[220px]">
                                  {item.subtitle}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-xs text-[var(--ft-text-secondary)] whitespace-nowrap">
                                {kindLabel}
                              </td>
                              <td className="py-2.5 px-3 font-num whitespace-nowrap">
                                <div className="text-xs text-[var(--ft-text-primary)]">
                                  {formatJalaliDate(item.dueDateIso, lang)}
                                </div>
                                <div
                                  className={`text-[11px] font-semibold ${
                                    item.daysLeft <= 0
                                      ? 'text-[var(--ft-danger)]'
                                      : item.daysLeft <= 5
                                      ? 'text-[var(--ft-warning)]'
                                      : 'text-[var(--ft-text-muted)]'
                                  }`}
                                >
                                  {dueText}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-num font-bold text-[var(--ft-text-primary)] whitespace-nowrap">
                                {formatMoney(item.amount, item.currency, lang, false, isPrivate)}
                              </td>
                              <td className="py-2.5 px-3 text-end whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onNavigate(
                                      'finance',
                                      item.kind === 'personal_debt' ? 'people' : 'planning'
                                    )
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--ft-border-strong)] hover:bg-[var(--ft-accent)] hover:text-[var(--ft-accent-fg)] hover:border-transparent cursor-pointer transition-colors"
                                >
                                  {item.kind === 'fixed_bill'
                                    ? t(lang, 'مشاهده', 'View')
                                    : t(lang, 'پرداخت / تسویه', 'Pay')}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              (() => {
                const monthLen = getJalaliMonthLength(todayJalali.jy, todayJalali.jm);
                const startOffset = getJalaliWeekdayIndex(todayJalali.jy, todayJalali.jm, 1);
                const obligationsByDay = new Map<number, typeof upcomingObligations>();
                upcomingObligations.forEach((ob) => {
                  const j = toJalali(ob.dueDateIso);
                  if (j.jy === todayJalali.jy && j.jm === todayJalali.jm) {
                    const list = obligationsByDay.get(j.jd) ?? [];
                    list.push(ob);
                    obligationsByDay.set(j.jd, list);
                  }
                });
                const selectedDayItems = obligationsByDay.get(selectedCalDay) ?? [];

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <div className="lg:col-span-7 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-[var(--ft-text-secondary)]">
                        <span>
                          {getJalaliMonthName(todayJalali.jm)} {todayJalali.jy}
                        </span>
                        <span className="font-num text-[var(--ft-text-muted)]">
                          {t(lang, 'روی هر روز کلیک کنید', 'Click any day to inspect')}
                        </span>
                      </div>
                      <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
                        {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((wd) => (
                          <div key={wd} className="py-1 font-medium text-[var(--ft-text-muted)]">
                            {wd}
                          </div>
                        ))}
                        {Array.from({ length: startOffset }).map((_, i) => (
                          <div key={`ov-empty-${i}`} />
                        ))}
                        {Array.from({ length: monthLen }).map((_, idx) => {
                          const day = idx + 1;
                          const dayItems = obligationsByDay.get(day) ?? [];
                          const isToday = day === todayJalali.jd;
                          const isSelected = day === selectedCalDay;
                          const hasCreditOrLoan = dayItems.some(
                            (i) => i.kind === 'credit_installment' || i.kind === 'loan_installment'
                          );
                          const hasBill = dayItems.some((i) => i.kind === 'fixed_bill');

                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => setSelectedCalDay(day)}
                              className={`p-1.5 rounded-xl border text-xs font-num flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
                                isSelected
                                  ? 'ft-accent-gradient font-bold border-transparent shadow-sm'
                                  : isToday
                                  ? 'border-[var(--ft-accent)] bg-[var(--ft-accent-soft)] text-[var(--ft-text-primary)] font-bold'
                                  : dayItems.length > 0
                                  ? 'border-[var(--ft-warning)]/60 bg-[var(--ft-surface-subtle)] text-[var(--ft-text-primary)]'
                                  : 'border-[var(--ft-border)] bg-[var(--ft-surface-subtle)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)]'
                              }`}
                            >
                              <span>{day}</span>
                              {dayItems.length > 0 && (
                                <span
                                  className={`text-[10px] leading-none mt-0.5 ${
                                    isSelected
                                      ? 'opacity-95'
                                      : hasCreditOrLoan
                                      ? 'text-[var(--ft-danger)]'
                                      : hasBill
                                      ? 'text-[var(--ft-warning)]'
                                      : 'text-[var(--ft-accent)]'
                                  }`}
                                >
                                  {dayItems.length} {t(lang, 'مورد', 'due')}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="lg:col-span-5 p-4 rounded-2xl glass-tile space-y-3">
                      <div className="flex items-center justify-between border-b border-[var(--ft-border)] pb-2.5">
                        <span className="text-xs font-bold text-[var(--ft-text-primary)] font-num">
                          {selectedCalDay} {getJalaliMonthName(todayJalali.jm)} {todayJalali.jy}
                        </span>
                        <span className="text-[11px] font-num text-[var(--ft-text-muted)]">
                          {selectedDayItems.length} {t(lang, 'سررسید', 'due')}
                        </span>
                      </div>
                      {selectedDayItems.length === 0 ? (
                        <p className="text-xs text-[var(--ft-text-muted)] py-6 text-center">
                          {t(lang, 'در این روز سررسید مالی ثبت نشده است.', 'No obligations scheduled on this day.')}
                        </p>
                      ) : (
                        <div className="divide-y divide-[var(--ft-border)]">
                          {selectedDayItems.map((ob) => (
                            <div key={ob.id} className="py-2.5 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                                  {ob.title}
                                </div>
                                <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                                  {ob.subtitle}
                                </div>
                              </div>
                              <div className="text-end shrink-0">
                                <div className="font-num text-xs font-bold text-[var(--ft-warning)]">
                                  {formatMoney(ob.amount, ob.currency, lang, false, isPrivate)}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onNavigate('finance', 'planning')}
                                  className="text-[11px] text-[var(--ft-accent)] hover:underline cursor-pointer"
                                >
                                  {t(lang, 'پرداخت', 'Pay')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            )}
          </section>
        </>
      ) : (
        /* Unified Action Center Tab (Synced with HeaderNotificationDropdown) */
        <section className="glass-surface rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--ft-border)]">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ft-text-primary)]">
                {t(lang, 'مرکز اقدام و اعلان‌ها', 'Action Center')}
              </h2>
              <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                {t(
                  lang,
                  'پیگیری اقساط وام، هزینه‌های ثابت، هشدارهای سیستم و اخبار اقتصادی',
                  'Track loans, fixed bills, system health and news alerts'
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadAlertsCount > 0 && (
                <button
                  type="button"
                  onClick={() => onMarkAllRead(actionFeed.map((a) => a.id))}
                  className="px-3.5 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
                  <span>{t(lang, 'خواندن همه', 'Mark All Read')}</span>
                </button>
              )}
              {readAlertIdsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => onClearRead(readAlertIdsList)}
                  className="px-3.5 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-danger-soft)] hover:text-[var(--ft-danger)] cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t(lang, 'پاکسازی خوانده‌شده‌ها', 'Clear Read')}</span>
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-[var(--ft-border)]">
            {actionFeed.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--ft-text-muted)] flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--ft-positive)]" />
                <span>{t(lang, 'هیچ اعلانی وجود ندارد.', 'No active notifications.')}</span>
              </div>
            ) : (
              actionFeed.map((item) => (
                <div
                  key={item.id}
                  className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    item.unread ? '' : 'opacity-65'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          item.tone === 'danger' && item.unread
                            ? 'text-[var(--ft-danger)]'
                            : 'text-[var(--ft-text-primary)]'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-xs text-[var(--ft-text-muted)] font-num">
                        · {item.metaLeft} · {item.metaRight}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ft-text-secondary)]">{item.detail}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onMarkNotificationRead(item.id);
                        if (item.persistedItem) {
                          onNotificationAction(item.persistedItem);
                        } else {
                          onNavigate(item.navigateTo.cat, item.navigateTo.sub);
                        }
                      }}
                      className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer whitespace-nowrap"
                    >
                      {item.actionLabel}
                    </button>
                    {item.unread && (
                      <button
                        type="button"
                        onClick={() => onMarkNotificationRead(item.id)}
                        className="px-3 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-secondary)] cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t(lang, 'خوانده شد', 'Read')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteNotification(item.id)}
                      title={t(lang, 'حذف اعلان', 'Delete')}
                      aria-label={t(lang, 'حذف اعلان', 'Delete')}
                      className="p-2 rounded-xl border border-[var(--ft-border)] hover:bg-[var(--ft-danger-soft)] hover:text-[var(--ft-danger)] text-[var(--ft-text-muted)] cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-4 border-t border-[var(--ft-border)] flex items-center justify-between text-xs text-[var(--ft-text-muted)]">
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-[var(--ft-warning)]" />
              <Shield className="w-4 h-4 text-[var(--ft-positive)]" />
              {t(lang, `استریک فعال: ${state.gamification.streakDays} روز`, `Active streak: ${state.gamification.streakDays}d`)}
            </span>
            <span className="flex items-center gap-1.5 font-num">
              <Award className="w-4 h-4 text-[var(--ft-accent)]" />
              {game.totalStars} ★
            </span>
          </div>
        </section>
      )}
    </div>
  );
};
