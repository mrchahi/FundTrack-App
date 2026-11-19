import { FundTrackState } from '../types';
import {
  computeDebtPayoffPlan,
  computeFinanceSummary,
  computePersonLedgers,
  computeTradingKpis,
  computeUpcomingObligations,
  convertCurrency,
  filterTradesByRange,
  formatMoney,
} from './domain';
import { computeDailyDrawdownStatus, computeEmotionSetupMatrix } from './intelligence';
import { formatJalaliDate, getCurrentJalaliMonthKey, toLocalIsoDate } from './jalali';

export interface PanelCopilotSnapshot {
  generatedAtIso: string;
  todayIso: string;
  todayJalali: string;
  currentJalaliMonth: string;
  usdToman: number;
  trading: {
    allTime: {
      trades: number;
      wins: number;
      losses: number;
      winRatePct: number;
      netUsd: number;
      grossProfitUsd: number;
      grossLossUsd: number;
      profitFactor: number;
      expectancyUsd: number;
      avgWinUsd: number;
      avgLossUsd: number;
      avgR: number;
      rStdDev: number;
      rConsistencyScore: number; // meanR / stdDevR
      maxDrawdownUsd: number;
      maxWinStreak: number;
      maxLossStreak: number;
      slCompliancePct: number;
      avgDurationMin: number;
      medianDurationMin: number;
      totalCommissionUsd: number;
      totalSwapUsd: number;
    };
    last30d: {
      trades: number;
      winRatePct: number;
      netUsd: number;
      profitFactor: number;
      expectancyUsd: number;
      avgR: number;
    };
    sessions: Array<{
      session: string;
      trades: number;
      winRatePct: number;
      netUsd: number;
      profitFactor: number;
      avgR: number;
    }>;
    sides: Array<{
      side: string;
      trades: number;
      winRatePct: number;
      netUsd: number;
      avgR: number;
    }>;
    durationBuckets: Array<{
      bucket: string;
      trades: number;
      winRatePct: number;
      netUsd: number;
    }>;
    weekdays: Array<{
      day: string;
      trades: number;
      winRatePct: number;
      netUsd: number;
    }>;
    bestHours: Array<{ hour: string; trades: number; netUsd: number; winRatePct: number }>;
    worstHours: Array<{ hour: string; trades: number; netUsd: number; winRatePct: number }>;
    symbols: Array<{ symbol: string; trades: number; winRatePct: number; netUsd: number }>;
    setups: Array<{ setup: string; trades: number; winRatePct: number; netUsd: number; avgR: number }>;
    emotions: Array<{ emotion: string; trades: number; winRatePct: number; netUsd: number; avgR: number }>;
    slImpact: {
      respectedTrades: number;
      respectedWinRatePct: number;
      respectedNetUsd: number;
      violatedTrades: number;
      violatedWinRatePct: number;
      violatedNetUsd: number;
    };
    mt5Accounts: Array<{
      id: string;
      broker: string;
      accountNumber: string;
      isDemo: boolean;
      balanceUsd: number;
      equityUsd: number;
      floatingUsd: number;
    }>;
    dailyDrawdown: {
      totalEquityUsd: number;
      todayNetUsd: number;
      usedPct: number;
      limitPct: number;
      breached: boolean;
    };
    recentTrades: Array<{
      symbol: string;
      direction: string;
      volume: number;
      profitUsd: number;
      rMultiple: number;
      session: string;
      setup: string;
      emotion: string;
      slRespected: boolean;
      closeJalali: string;
    }>;
    upcomingEvents: Array<{
      title: string;
      currency: string;
      impact: string;
      jalaliDate: string;
      timestampIso: string;
      forecast: string;
      previous: string;
      actual: string;
    }>;
  };
  finance: {
    totalLiquidIrtOnly: number;
    totalLiquidUsdOnly: number;
    totalBankEquivalentIrt: number;
    totalTradingRealUsd: number;
    totalDebtIrt: number;
    netWorthIrt: number;
    netWorthUsd: number;
    safeToSpendIrt: number;
    safeToSpendUsd: number;
    monthlyInIrtOnly: number;
    monthlyOutIrtOnly: number;
    monthlyInUsdOnly: number;
    monthlyOutUsdOnly: number;
    savingsRatePct: number;
    accounts: Array<{ id: string; name: string; type: string; currency: string; balance: number }>;
    creditLines: Array<{
      id: string;
      title: string;
      provider: string;
      currency: string;
      limit: number;
      used: number;
      available: number;
      utilizationPct: number;
      defaultInstallments: number;
    }>;
    openLoans: Array<{
      id: string;
      title: string;
      currency: string;
      installmentAmount: number;
      paidInstallments: number;
      totalInstallments: number;
      remainingTotal: number;
      dueJalali: string;
    }>;
    peopleLedgers: Array<{
      id: string;
      name: string;
      status: string;
      netBalanceIrt: number;
    }>;
    budgetCaps: Array<{
      id: string;
      categoryName: string;
      sourceAccountName: string;
      capAmount: number;
      spentAmount: number;
      utilizationPct: number;
      paceStatus: string;
    }>;
    fixedExpenses: Array<{
      id: string;
      title: string;
      amount: number;
      currency: string;
      dayOfMonth: number;
    }>;
    upcomingObligationsCount: number;
    upcomingObligationsNext30dIrt: number;
    topExpenseCategoriesIrt: Array<{ category: string; totalIrt: number }>;
    recentTransactions: Array<{
      type: string;
      amount: number;
      currency: string;
      paymentMethod?: string;
      category?: string;
      note: string;
      jalaliDate: string;
    }>;
  };
  growth: {
    goals: Array<{
      id: string;
      title: string;
      status: string;
      currency: string;
      saved: number;
      target: number;
      progressPct: number;
      priority: number;
      weeklyBudget: number;
      deadlineMode: string;
      targetDate: string;
      budgetSource: string;
      sourceAccountName?: string;
    }>;
    xpTotal: number;
    streakDays: number;
    weeklyGoalPoolIrt: number;
  };
}

export function buildAssistantPanelSnapshot(state: FundTrackState): PanelCopilotSnapshot {
  const now = new Date();
  const usdToman = state.settings.usdToman || 69500;
  const realTrades = state.trades;
  const kpiAll = computeTradingKpis(realTrades, { lang: 'fa' });
  const trades30d = filterTradesByRange(realTrades, 'month');
  const kpi30d = computeTradingKpis(trades30d, { lang: 'fa' });
  const matrix = computeEmotionSetupMatrix(realTrades);
  const drawdown = computeDailyDrawdownStatus(
    realTrades,
    state.mt5Accounts,
    state.settings.dailyMaxLossPct ?? 3
  );

  // Statistical R metrics (StdDev & Sharpe-like R ratio)
  const rValues = realTrades.map((t) => t.rMultiple);
  const meanR = rValues.length > 0 ? rValues.reduce((s, r) => s + r, 0) / rValues.length : 0;
  const varianceR =
    rValues.length > 1
      ? rValues.reduce((s, r) => s + (r - meanR) ** 2, 0) / (rValues.length - 1)
      : 0;
  const rStdDev = Number(Math.sqrt(Math.max(0, varianceR)).toFixed(2));
  const rConsistencyScore = rStdDev > 0 ? Number((meanR / rStdDev).toFixed(2)) : 0;

  // Session statistical breakdown
  const sessionMap = new Map<string, typeof realTrades>();
  const symbolMap = new Map<string, typeof realTrades>();
  for (const tr of realTrades) {
    const sKey = tr.session || 'London';
    sessionMap.set(sKey, [...(sessionMap.get(sKey) ?? []), tr]);
    const symKey = tr.symbol || 'UNKNOWN';
    symbolMap.set(symKey, [...(symbolMap.get(symKey) ?? []), tr]);
  }

  const sessions = Array.from(sessionMap.entries())
    .map(([session, list]) => {
      const k = computeTradingKpis(list, { lang: 'fa' });
      return {
        session,
        trades: list.length,
        winRatePct: k.winRate,
        netUsd: Number(k.netProfitUsd.toFixed(2)),
        profitFactor: Number(k.profitFactor.toFixed(2)),
        avgR: Number(k.avgR.toFixed(2)),
      };
    })
    .sort((a, b) => b.netUsd - a.netUsd);

  const symbols = Array.from(symbolMap.entries())
    .map(([symbol, list]) => {
      const k = computeTradingKpis(list, { lang: 'fa' });
      return {
        symbol,
        trades: list.length,
        winRatePct: k.winRate,
        netUsd: Number(k.netProfitUsd.toFixed(2)),
      };
    })
    .sort((a, b) => b.trades - a.trades);

  const respected = realTrades.filter((t) => t.slRespected);
  const violated = realTrades.filter((t) => !t.slRespected);
  const respectedKpi = computeTradingKpis(respected, { lang: 'fa' });
  const violatedKpi = computeTradingKpis(violated, { lang: 'fa' });

  const sortedHours = [...kpiAll.hourlyBreakdown].filter((h) => h.trades > 0);
  const bestHours = [...sortedHours]
    .sort((a, b) => b.net - a.net)
    .slice(0, 3)
    .map((h) => ({ hour: h.label, trades: h.trades, netUsd: h.net, winRatePct: h.winRate }));
  const worstHours = [...sortedHours]
    .sort((a, b) => a.net - b.net)
    .slice(0, 3)
    .map((h) => ({ hour: h.label, trades: h.trades, netUsd: h.net, winRatePct: h.winRate }));

  const fin = computeFinanceSummary(
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

  const peopleOverview = computePersonLedgers(
    state.people ?? [],
    state.personEntries ?? [],
    usdToman
  );
  const upcomingAll = computeUpcomingObligations(
    state.fixedExpenses,
    state.loans,
    state.creditLines ?? [],
    state.people ?? [],
    state.personEntries ?? [],
    usdToman
  );
  const upcoming = upcomingAll.filter((u) => u.daysLeft <= 30);
  const debtPlan = computeDebtPayoffPlan(
    state.loans,
    'avalanche',
    usdToman,
    state.people ?? [],
    state.personEntries ?? []
  );
  void debtPlan;

  // Expense breakdown by category
  const catTotals = new Map<string, number>();
  for (const tx of state.transactions) {
    if (tx.type !== 'out') continue;
    const label = tx.categoryLabel || 'سایر';
    const irt = convertCurrency(tx.amount, tx.currency, 'IRT', usdToman);
    catTotals.set(label, (catTotals.get(label) ?? 0) + irt);
  }
  const topExpenseCategoriesIrt = Array.from(catTotals.entries())
    .map(([category, totalIrt]) => ({ category, totalIrt: Math.round(totalIrt) }))
    .sort((a, b) => b.totalIrt - a.totalIrt)
    .slice(0, 6);

  return {
    generatedAtIso: now.toISOString(),
    todayIso: toLocalIsoDate(now),
    todayJalali: formatJalaliDate(now, 'fa'),
    currentJalaliMonth: getCurrentJalaliMonthKey(now),
    usdToman,
    trading: {
      allTime: {
        trades: kpiAll.tradeCount,
        wins: kpiAll.winCount,
        losses: kpiAll.lossCount,
        winRatePct: kpiAll.winRate,
        netUsd: Number(kpiAll.netProfitUsd.toFixed(2)),
        grossProfitUsd: Number(kpiAll.grossProfitUsd.toFixed(2)),
        grossLossUsd: Number(kpiAll.grossLossUsd.toFixed(2)),
        profitFactor: Number(kpiAll.profitFactor.toFixed(2)),
        expectancyUsd: Number(kpiAll.expectancyUsd.toFixed(2)),
        avgWinUsd: Number(kpiAll.avgWinUsd.toFixed(2)),
        avgLossUsd: Number(kpiAll.avgLossUsd.toFixed(2)),
        avgR: Number(kpiAll.avgR.toFixed(2)),
        rStdDev,
        rConsistencyScore,
        maxDrawdownUsd: Number(kpiAll.maxDrawdownUsd.toFixed(2)),
        maxWinStreak: kpiAll.maxWinStreak,
        maxLossStreak: kpiAll.maxLossStreak,
        slCompliancePct: kpiAll.slCompliancePct,
        avgDurationMin: kpiAll.avgDurationMin,
        medianDurationMin: kpiAll.medianDurationMin,
        totalCommissionUsd: Number(kpiAll.totalCommissionUsd.toFixed(2)),
        totalSwapUsd: Number(kpiAll.totalSwapUsd.toFixed(2)),
      },
      last30d: {
        trades: kpi30d.tradeCount,
        winRatePct: kpi30d.winRate,
        netUsd: Number(kpi30d.netProfitUsd.toFixed(2)),
        profitFactor: Number(kpi30d.profitFactor.toFixed(2)),
        expectancyUsd: Number(kpi30d.expectancyUsd.toFixed(2)),
        avgR: Number(kpi30d.avgR.toFixed(2)),
      },
      sessions,
      sides: kpiAll.sideBreakdown.map((s) => ({
        side: s.side,
        trades: s.trades,
        winRatePct: s.winRate,
        netUsd: Number(s.net.toFixed(2)),
        avgR: Number(s.avgR.toFixed(2)),
      })),
      durationBuckets: kpiAll.durationBuckets.map((d) => ({
        bucket: d.label,
        trades: d.trades,
        winRatePct: d.winRate,
        netUsd: Number(d.net.toFixed(2)),
      })),
      weekdays: kpiAll.weekdayBreakdown
        .filter((w) => w.count > 0)
        .map((w) => ({ day: w.day, trades: w.count, winRatePct: w.winRate, netUsd: w.profit })),
      bestHours,
      worstHours,
      symbols,
      setups: matrix.setups.slice(0, 6).map((s) => ({
        setup: s.setupTag,
        trades: s.trades,
        winRatePct: s.winRate,
        netUsd: s.netUsd,
        avgR: s.avgR,
      })),
      emotions: matrix.emotions.map((e) => ({
        emotion: e.emotion,
        trades: e.trades,
        winRatePct: e.winRate,
        netUsd: e.netUsd,
        avgR: e.avgR,
      })),
      slImpact: {
        respectedTrades: respected.length,
        respectedWinRatePct: respectedKpi.winRate,
        respectedNetUsd: Number(respectedKpi.netProfitUsd.toFixed(2)),
        violatedTrades: violated.length,
        violatedWinRatePct: violatedKpi.winRate,
        violatedNetUsd: Number(violatedKpi.netProfitUsd.toFixed(2)),
      },
      mt5Accounts: state.mt5Accounts.map((a) => ({
        id: a.id,
        broker: a.broker,
        accountNumber: a.accountNumber,
        isDemo: Boolean(a.isDemo),
        balanceUsd: a.balance,
        equityUsd: a.equity,
        floatingUsd: a.floatingProfit ?? 0,
      })),
      dailyDrawdown: {
        totalEquityUsd: drawdown.totalEquityUsd,
        todayNetUsd: drawdown.todayNetUsd,
        usedPct: drawdown.usedPct,
        limitPct: drawdown.dailyMaxLossPct,
        breached: drawdown.breached,
      },
      recentTrades: [...realTrades]
        .sort((a, b) => new Date(b.closeTime).getTime() - new Date(a.closeTime).getTime())
        .slice(0, 12)
        .map((t) => ({
          symbol: t.symbol,
          direction: t.direction,
          volume: t.volume,
          profitUsd: t.profitUsd,
          rMultiple: t.rMultiple,
          session: t.session,
          setup: t.setupTag,
          emotion: t.emotionTag,
          slRespected: t.slRespected,
          closeJalali: formatJalaliDate(t.closeTime, 'fa'),
        })),
      upcomingEvents: [...state.economicEvents]
        .filter((ev) => new Date(ev.timestamp).getTime() >= Date.now() - 12 * 3600 * 1000)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(0, 14)
        .map((ev) => ({
          title: ev.title,
          currency: ev.currency,
          impact: ev.impact,
          jalaliDate: formatJalaliDate(ev.timestamp, 'fa'),
          timestampIso: ev.timestamp,
          forecast: ev.forecast,
          previous: ev.previous,
          actual: ev.actual,
        })),
    },
    finance: {
      totalLiquidIrtOnly: fin.bankIrt,
      totalLiquidUsdOnly: fin.bankUsd,
      totalBankEquivalentIrt: Math.round(fin.totalBankIrt),
      totalTradingRealUsd: fin.totalTradingUsd,
      totalDebtIrt: Math.round(fin.totalDebtIrt),
      netWorthIrt: Math.round(fin.netWorthIrt),
      netWorthUsd: fin.netWorthUsd,
      safeToSpendIrt: Math.round(fin.safeToSpendIrt),
      safeToSpendUsd: fin.safeToSpendUsd,
      monthlyInIrtOnly: Math.round(fin.monthlyInIrtOnly),
      monthlyOutIrtOnly: Math.round(fin.monthlyOutIrtOnly),
      monthlyInUsdOnly: fin.monthlyInUsdOnly,
      monthlyOutUsdOnly: fin.monthlyOutUsdOnly,
      savingsRatePct: fin.savingsRatePct,
      accounts: state.bankAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance: a.balance,
      })),
      creditLines: fin.creditLinesStatus.map((c) => ({
        id: c.line.id,
        title: c.line.title,
        provider: c.line.provider,
        currency: c.line.currency,
        limit: c.line.creditLimit,
        used: c.usedAmount,
        available: c.availableAmount,
        utilizationPct: c.utilizationPct,
        defaultInstallments: c.line.defaultInstallments,
      })),
      openLoans: state.loans
        .filter((l) => l.status === 'open')
        .map((l) => ({
          id: l.id,
          title: l.title,
          currency: l.currency,
          installmentAmount: l.installmentAmount,
          paidInstallments: l.paidInstallments,
          totalInstallments: l.totalInstallments,
          remainingTotal: Math.max(0, l.totalInstallments - l.paidInstallments) * l.installmentAmount,
          dueJalali: formatJalaliDate(l.dueDate, 'fa'),
        })),
      peopleLedgers: peopleOverview.ledgers.map((l) => ({
        id: l.person.id,
        name: l.person.name,
        status: l.status,
        netBalanceIrt: Math.round(l.netBalanceIrt),
      })),
      budgetCaps: fin.budgetStatuses.map((b) => ({
        id: b.budget.id,
        categoryName: b.budget.categoryName,
        sourceAccountName: b.sourceAccountName,
        capAmount: Math.round(b.capAmount),
        spentAmount: Math.round(b.spentAmount),
        utilizationPct: b.utilizationPct,
        paceStatus: b.paceStatus,
      })),
      fixedExpenses: state.fixedExpenses
        .filter((f) => f.active)
        .map((f) => ({
          id: f.id,
          title: f.title,
          amount: f.amount,
          currency: f.currency,
          dayOfMonth: f.dayOfMonth,
        })),
      upcomingObligationsCount: upcoming.length,
      upcomingObligationsNext30dIrt: Math.round(upcoming.reduce((s, u) => s + u.amountIrt, 0)),
      topExpenseCategoriesIrt,
      recentTransactions: [...state.transactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15)
        .map((tx) => ({
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency,
          paymentMethod: tx.paymentMethod,
          category: tx.categoryLabel,
          note: tx.note,
          jalaliDate: formatJalaliDate(tx.date, 'fa'),
        })),
    },
    growth: {
      goals: state.goals.map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        currency: g.currency,
        saved: g.savedAmount,
        target: g.targetAmount,
        progressPct: g.targetAmount > 0 ? Math.round((g.savedAmount / g.targetAmount) * 100) : 0,
        priority: g.priority,
        weeklyBudget: g.weeklyBudgetAmount,
        deadlineMode: g.deadlineMode ?? 'dated',
        targetDate: formatJalaliDate(g.targetDate, 'fa'),
        budgetSource: g.budgetSource,
        sourceAccountName: g.sourceAccountId
          ? state.bankAccounts.find((a) => a.id === g.sourceAccountId)?.name
          : undefined,
      })),
      xpTotal: state.gamification.xpTotal,
      streakDays: state.gamification.streakDays,
      weeklyGoalPoolIrt: state.settings.weeklyGoalPoolIrt ?? 18000000,
    },
  };
}

export function buildLocalStatisticalBrief(
  snap: PanelCopilotSnapshot,
  query: string,
  lang: 'fa' | 'en'
): { reply: string; suggestions: string[]; quickReplies: string[] } {
  const lower = query.toLowerCase();
  const isFinance = /(نقدینگی|مالی|بدهی|قسط|بودجه|خرج|هزینه|حساب|بانک|تومان|finance|cashflow|debt|budget|loan)/.test(
    lower
  );
  const isGoals = /(هدف|اهداف|امتیاز|پس.?انداز|goal|mission)/.test(lower);

  if (isGoals) {
    const activeGoals = snap.growth.goals.filter((g) => g.status === 'active');
    const lines =
      activeGoals.length > 0
        ? activeGoals.map(
            (g) =>
              `• ${g.title} (P${g.priority}): ${formatMoney(g.saved, g.currency as 'IRT' | 'USD', lang)} از ${formatMoney(g.target, g.currency as 'IRT' | 'USD', lang)} (${g.progressPct}%)`
          )
        : [lang === 'fa' ? '• هدف فعالی ثبت نشده است.' : '• No active goals found.'];
    return {
      reply: [
        lang === 'fa'
          ? `خلاصه وضعیت اهداف و رشد (${activeGoals.length} هدف فعال):`
          : `Goals & Progress Summary (${activeGoals.length} active):`,
        ...lines,
        lang === 'fa'
          ? `• استخر بودجه هفتگی: ${formatMoney(snap.growth.weeklyGoalPoolIrt, 'IRT', lang)} | زنجیره فعلی: ${snap.growth.streakDays} روز`
          : `• Weekly Goal Pool: ${formatMoney(snap.growth.weeklyGoalPoolIrt, 'IRT', lang)} | Streak: ${snap.growth.streakDays}d`,
      ].join('\n'),
      suggestions:
        lang === 'fa'
          ? ['در صورت وجود مانده آزاد بعد از اقساط، واریز به هدف P1 بیشترین بازده اولویتی را دارد.']
          : ['Prioritize funding your P1 goal after Tier-1 debt obligations.'],
      quickReplies:
        lang === 'fa'
          ? ['یه هدف پس‌انداز جدید بساز', 'وضعیت نقدینگی و بدهی‌ها رو تحلیل کن']
          : ['Create a new savings goal', 'Analyze cashflow & debts'],
    };
  }

  if (isFinance) {
    const topWarnBudget = snap.finance.budgetCaps.find((b) => b.paceStatus !== 'healthy');
    return {
      reply: [
        lang === 'fa' ? 'تحلیل آماری وضعیت مالی و نقدینگی:' : 'Financial & Cashflow Statistical Summary:',
        lang === 'fa'
          ? `• نقدینگی تومانی: ${formatMoney(snap.finance.totalLiquidIrtOnly, 'IRT', 'fa')} | دلاری: ${formatMoney(snap.finance.totalLiquidUsdOnly, 'USD', 'fa')}`
          : `• Bank Liquid: ${formatMoney(snap.finance.totalLiquidIrtOnly, 'IRT', 'en')} + ${formatMoney(snap.finance.totalLiquidUsdOnly, 'USD', 'en')}`,
        lang === 'fa'
          ? `• کل بدهی و اقساط باز: ${formatMoney(snap.finance.totalDebtIrt, 'IRT', 'fa')} | تعهدات ۳۰ روز آینده: ${formatMoney(snap.finance.upcomingObligationsNext30dIrt, 'IRT', 'fa')} (${snap.finance.upcomingObligationsCount} مورد)`
          : `• Total Debt: ${formatMoney(snap.finance.totalDebtIrt, 'IRT', 'en')} | Next 30d Due: ${formatMoney(snap.finance.upcomingObligationsNext30dIrt, 'IRT', 'en')}`,
        lang === 'fa'
          ? `• نرخ پس‌انداز ماه جاری: ${snap.finance.savingsRatePct}% | نقدینگی آزاد قابل خرج: ${formatMoney(snap.finance.safeToSpendIrt, 'IRT', 'fa')}`
          : `• Monthly Savings Rate: ${snap.finance.savingsRatePct}% | Safe-to-Spend: ${formatMoney(snap.finance.safeToSpendIrt, 'IRT', 'en')}`,
      ].join('\n'),
      suggestions: [
        topWarnBudget
          ? lang === 'fa'
            ? `بودجه «${topWarnBudget.categoryName}» به ${topWarnBudget.utilizationPct}% رسیده؛ هزینه‌های این دسته را کنترل کنید.`
            : `Budget "${topWarnBudget.categoryName}" is at ${topWarnBudget.utilizationPct}%.`
          : lang === 'fa'
          ? 'جریان نقدینگی و تعهدات ۳۰ روزه در وضعیت متعادل قرار دارند.'
          : 'Cashflow & 30-day obligations look balanced.',
      ],
      quickReplies:
        lang === 'fa'
          ? ['تحلیل آماری ترید و سشن‌ها', 'قسط بعدی وام رو پرداخت کن']
          : ['Analyze trading & sessions', 'Pay next loan installment'],
    };
  }

  const t = snap.trading.allTime;
  const bestSess = snap.trading.sessions[0];
  const worstSess = snap.trading.sessions[snap.trading.sessions.length - 1];
  return {
    reply: [
      lang === 'fa'
        ? `تحلیل آماری عملکرد معاملاتی (${t.trades} معامله واقعی):`
        : `Trading Statistical Diagnostics (${t.trades} trades):`,
      lang === 'fa'
        ? `• سود خالص: $${t.netUsd} | Win Rate: ${t.winRatePct}% | Profit Factor: ${t.profitFactor} | Expectancy: $${t.expectancyUsd}/trade`
        : `• Net P&L: $${t.netUsd} | Win Rate: ${t.winRatePct}% | Profit Factor: ${t.profitFactor} | Expectancy: $${t.expectancyUsd}`,
      lang === 'fa'
        ? `• میانگین R: ${t.avgR}R (انحراف معیار ${t.rStdDev}R، ثبات آماری ${t.rConsistencyScore}) | Max DD: $${t.maxDrawdownUsd}`
        : `• Mean R: ${t.avgR}R (StdDev ${t.rStdDev}R, Consistency ${t.rConsistencyScore}) | Max DD: $${t.maxDrawdownUsd}`,
      bestSess
        ? lang === 'fa'
          ? `• بهترین سشن: ${bestSess.session} ($${bestSess.netUsd}, PF ${bestSess.profitFactor})${worstSess && worstSess.session !== bestSess.session ? ` | ضعیف‌ترین: ${worstSess.session} ($${worstSess.netUsd})` : ''}`
          : `• Best Session: ${bestSess.session} ($${bestSess.netUsd}, PF ${bestSess.profitFactor})`
        : '',
      lang === 'fa'
        ? `• انضباط SL: ${t.slCompliancePct}% (در معاملات با SL رعایت‌شده Win Rate ${snap.trading.slImpact.respectedWinRatePct}% vs نقض SL ${snap.trading.slImpact.violatedWinRatePct}%)`
        : `• SL Discipline: ${t.slCompliancePct}% (Respected WR ${snap.trading.slImpact.respectedWinRatePct}% vs Violated ${snap.trading.slImpact.violatedWinRatePct}%)`,
    ]
      .filter(Boolean)
      .join('\n'),
    suggestions: [
      snap.trading.slImpact.violatedTrades > 0
        ? lang === 'fa'
          ? `در ${snap.trading.slImpact.violatedTrades} معامله حد ضرر رعایت نشده که خالص $${snap.trading.slImpact.violatedNetUsd} اثر گذاشته است؛ پایبندی به SL بالاترین اهرم رشد است.`
          : `${snap.trading.slImpact.violatedTrades} trades violated SL ($${snap.trading.slImpact.violatedNetUsd} net impact).`
        : lang === 'fa'
        ? 'انضباط حد ضرر شما در سطح مطلوبی قرار دارد.'
        : 'Your SL discipline is solid.',
    ],
    quickReplies:
      lang === 'fa'
        ? ['تحلیل وضعیت نقدینگی و بدهی‌ها', 'سشن‌ها و ساعات طلایی معاملاتم چیه؟']
        : ['Analyze cashflow & debts', 'What are my best trading hours?'],
  };
}
