import React, { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Flame,
  Pencil,
  Plus,
  Shield,
  Star,
  Target,
  Trash2,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  AppLanguage,
  CurrencyCode,
  CustomMission,
  FundTrackState,
  Goal,
  GoalBudgetSource,
  GoalKind,
  GrowthSubTab,
} from '../types';
import {
  computeFinanceSummary,
  computeGoalPlan,
  computeTradingKpis,
  evaluateGamification,
  formatMoney,
  getPriorityMeta,
  TRADER_RANKS,
} from '../utils/domain';
import { formatJalaliDate } from '../utils/jalali';
import { t } from '../i18n/translations';
import { PriorityAllocationBar, RadialGauge, StripedProgressBar } from './Charts';
import { GlassSelect } from './GlassControls';
import { MaterialInput } from './MaterialInputs';
import { JalaliDatePicker } from './JalaliDatePicker';

interface GrowthViewProps {
  state: FundTrackState;
  subTab: GrowthSubTab;
  setSubTab: (tab: GrowthSubTab) => void;
  onCreateGoal: (goal: Omit<Goal, 'id' | 'savedAmount' | 'status' | 'createdAt'>) => void;
  onChangeGoalStatus: (goalId: string, status: Goal['status']) => void;
  onChangeGoalPriority: (goalId: string, priority: number) => void;
  onAllocateToGoal: (goalId: string, amount: number, sourceAccountId?: string) => void;
  onDeleteGoal: (goalId: string) => void;
  onDistributeTodayProfitToGoals: () => void;
  onFundWeeklyGoalPool: (poolIrt: number, sourceAccountId?: string) => void;
  onUpdateWeeklyGoalPool: (poolIrt: number) => void;
  onOverrideMission: (key: string, target?: number, stars?: number) => void;
  onCreateCustomMission: (cm: Omit<CustomMission, 'id'>) => void;
  onDeleteCustomMission: (id: string) => void;
  onIncrementCustomMission: (id: string, delta: number) => void;
  onClaimDailyCombo: () => void;
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const GrowthView: React.FC<GrowthViewProps> = ({
  state,
  subTab,
  setSubTab,
  onCreateGoal,
  onChangeGoalStatus,
  onChangeGoalPriority,
  onAllocateToGoal,
  onDeleteGoal,
  onDistributeTodayProfitToGoals,
  onFundWeeklyGoalPool,
  onUpdateWeeklyGoalPool,
  onOverrideMission,
  onCreateCustomMission,
  onDeleteCustomMission,
  onIncrementCustomMission,
  onClaimDailyCombo,
  onShowToast,
}) => {
  const lang: AppLanguage = state.settings.language;
  const isPrivate = Boolean(state.settings.privateMode);
  const game = useMemo(() => evaluateGamification(state), [state]);
  const allKpis = useMemo(() => computeTradingKpis(state.trades), [state.trades]);
  const financeSummary = useMemo(
    () =>
      computeFinanceSummary(
        state.bankAccounts,
        state.mt5Accounts,
        state.transactions,
        state.fixedExpenses,
        state.budgetCaps,
        state.loans,
        state.goals,
        state.settings.usdToman,
        state.people ?? [],
        state.personEntries ?? [],
        state.creditLines ?? []
      ),
    [state]
  );
  const weeklyPoolIrt = state.settings.weeklyGoalPoolIrt ?? 18000000;
  const [poolInput, setPoolInput] = useState(String(weeklyPoolIrt));
  const [poolAccId, setPoolAccId] = useState(state.bankAccounts[0]?.id ?? '');

  // 2-Step Goal Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [gTitle, setGTitle] = useState('');
  const [gKind, setGKind] = useState<GoalKind>('item');
  const [gCurrency, setGCurrency] = useState<CurrencyCode>('IRT');
  const [gTargetAmount, setGTargetAmount] = useState('100000000');
  const [gTargetDate, setGTargetDate] = useState(
    new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  );
  const [gBudgetSource, setGBudgetSource] = useState<GoalBudgetSource>('trading_profit');
  const [gWeeklyBudget, setGWeeklyBudget] = useState('6000000');
  const [gPriority, setGPriority] = useState('1');
  const [gAllocationPct, setGAllocationPct] = useState('50');

  // Goal Allocation Modal
  const [allocGoal, setAllocGoal] = useState<Goal | null>(null);
  const [allocAmount, setAllocAmount] = useState('');
  const [allocAccId, setAllocAccId] = useState(state.bankAccounts[0]?.id ?? '');

  // Mission Override Modal
  const [overrideKey, setOverrideKey] = useState<string | null>(null);
  const [ovTarget, setOvTarget] = useState('');
  const [ovStars, setOvStars] = useState('');

  // Custom Mission Modal
  const [cmModalOpen, setCmModalOpen] = useState(false);
  const [cmTitle, setCmTitle] = useState('');
  const [cmSource, setCmSource] = useState<CustomMission['source']>('manual');
  const [cmMetric, setCmMetric] = useState<CustomMission['metric']>('income');
  const [cmTarget, setCmTarget] = useState('');
  const [cmStars, setCmStars] = useState('2');
  const [cmXp, setCmXp] = useState('80');
  const [cmGoalId, setCmGoalId] = useState(state.goals[0]?.id ?? '');

  const livePreview = useMemo(() => {
    return computeGoalPlan(
      {
        targetAmount: Number(gTargetAmount) || 0,
        savedAmount: 0,
        targetDate: gTargetDate,
        weeklyBudgetAmount: Number(gWeeklyBudget) || 0,
        allocationPct: Number(gAllocationPct) || 10,
        currency: gCurrency,
      },
      allKpis.profitFactor,
      allKpis.avgR
    );
  }, [gTargetAmount, gTargetDate, gWeeklyBudget, gAllocationPct, gCurrency, allKpis]);

  const handleSaveWizardGoal = () => {
    const targetAmt = Number(gTargetAmount);
    if (!gTitle.trim() || !Number.isFinite(targetAmt) || targetAmt <= 0) {
      onShowToast(t(lang, 'عنوان و مبلغ هدف معتبر وارد کنید', 'Enter valid goal title and target'), 'error');
      return;
    }
    const pNum = Math.min(5, Math.max(1, Number(gPriority) || 1));
    onCreateGoal({
      title: gTitle.trim(),
      kind: gKind,
      currency: gCurrency,
      targetAmount: targetAmt,
      targetDate: new Date(gTargetDate).toISOString(),
      budgetSource: gBudgetSource,
      weeklyBudgetAmount: Number(gWeeklyBudget) || 0,
      priority: pNum,
      allocationPct: Math.min(100, Math.max(1, Number(gAllocationPct) || 25)),
      autoPriorityBudget: true,
    });
    setWizardOpen(false);
    setWizardStep(1);
  };

  const handleSaveCustomMission = (e: React.FormEvent) => {
    e.preventDefault();
    const targetVal = Number(cmTarget);
    if (!cmTitle.trim() || !Number.isFinite(targetVal) || targetVal <= 0) {
      onShowToast(t(lang, 'مأموریت با هدف صفر یا نامعتبر مجاز نیست', 'Mission target must be greater than zero'), 'error');
      return;
    }
    onCreateCustomMission({
      title: cmTitle.trim(),
      source: cmSource,
      metric: cmMetric,
      targetValue: targetVal,
      stars: Math.max(1, Number(cmStars) || 1),
      xp: Math.max(10, Number(cmXp) || 50),
      linkedGoalId: cmSource === 'goal' ? cmGoalId : undefined,
      manualProgress: 0,
    });
    setCmModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Hero Gamification Progression Header */}
      <section className="glass-surface rounded-3xl p-6 space-y-5 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-[var(--ft-text-muted)]">
              <span className="font-num font-bold text-[var(--ft-accent)]">
                {t(lang, `سطح ${game.currentRank.level}`, `Level ${game.currentRank.level}`)}
              </span>
              <span>·</span>
              <span>{lang === 'fa' ? game.currentRank.titleFa : game.currentRank.titleEn}</span>
              <span>·</span>
              <span className="font-num">
                {game.totalXp.toLocaleString('en-US')} / {game.nextRank.minXp.toLocaleString('en-US')} XP
              </span>
            </div>
            <h2 className="text-xl font-bold text-[var(--ft-text-primary)]">
              {t(lang, 'مرکز رشد و اهداف', 'Trader Growth & Goals')}
            </h2>
            <div className="w-full max-w-lg h-3 rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${game.rankProgressPct}%`, background: 'var(--ft-accent-grad)' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
            <div className="p-3 rounded-2xl glass-tile">
              <div className="text-[11px] text-[var(--ft-text-muted)]">{t(lang, 'ستاره امروز', 'Today Stars')}</div>
              <div className="font-num text-xl font-extrabold text-[var(--ft-accent)] flex items-center gap-1 mt-0.5">
                <Star className="w-4 h-4" />
                <span>{game.starsToday}</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl glass-tile">
              <div className="text-[11px] text-[var(--ft-text-muted)]">{t(lang, 'کل ستاره‌ها', 'Total Stars')}</div>
              <div className="font-num text-xl font-extrabold text-[var(--ft-text-primary)] mt-0.5">
                {game.totalStars} ★
              </div>
            </div>
            <div className="p-3 rounded-2xl glass-tile">
              <div className="text-[11px] text-[var(--ft-text-muted)]">{t(lang, 'استریک + سپر', 'Streak + Freeze')}</div>
              <div className="font-num text-xl font-extrabold text-[var(--ft-warning)] flex items-center gap-1 mt-0.5">
                <Flame className="w-4 h-4" />
                <span>{state.gamification.streakDays}d</span>
                <span className="text-xs text-[var(--ft-text-muted)]">({state.gamification.streakFreezes})</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl glass-tile">
              <div className="text-[11px] text-[var(--ft-text-muted)]">{t(lang, 'ضریب انضباط', 'Multiplier')}</div>
              <div className="font-num text-xl font-extrabold text-[var(--ft-positive)] flex items-center gap-1 mt-0.5">
                <Shield className="w-4 h-4" />
                <span>{game.disciplineMultiplier}x</span>
              </div>
            </div>
          </div>
        </div>

        {/* Daily Golden Combo Bar */}
        <div className="pt-4 border-t border-[var(--ft-border)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="font-semibold text-[var(--ft-text-primary)] flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[var(--ft-warning)]" />
              {t(lang, 'کمبوی سه‌گانه طلایی امروز:', 'Today Golden Combo:')}
            </span>
            <span className={game.goldenCombo.pillarTradeDiscipline ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-text-muted)]'}>
              {game.goldenCombo.pillarTradeDiscipline ? '✓' : '○'} {t(lang, 'انضباط SL در ترید', 'SL Discipline')}
            </span>
            <span className={game.goldenCombo.pillarBudgetControl ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-text-muted)]'}>
              {game.goldenCombo.pillarBudgetControl ? '✓' : '○'} {t(lang, 'کنترل بودجه روزانه', 'Budget Control')}
            </span>
            <span className={game.goldenCombo.pillarGoalOrJournal ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-text-muted)]'}>
              {game.goldenCombo.pillarGoalOrJournal ? '✓' : '○'} {t(lang, 'بازبینی ژورنال یا هدف', 'Journal / Goal')}
            </span>
          </div>

          {game.goldenCombo.comboReady ? (
            <button
              type="button"
              onClick={onClaimDailyCombo}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer shrink-0"
            >
              {t(lang, 'باز کردن صندوقچه کمبو (+150 XP & +2★)', 'Claim Golden Combo (+150 XP & +2★)')}
            </button>
          ) : (
            <span className="text-xs font-num text-[var(--ft-text-muted)]">
              {game.goldenCombo.comboClaimed
                ? t(lang, 'کمبوی امروز دریافت شد ✓', 'Daily Combo Claimed ✓')
                : t(lang, `${game.goldenCombo.comboCount}/3 پایه تکمیل شده`, `${game.goldenCombo.comboCount}/3 pillars complete`)}
            </span>
          )}
        </div>
      </section>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl glass-surface">
          {(
            [
              ['goals', t(lang, 'اهداف', 'Goals')],
              ['quests', t(lang, 'مأموریت‌ها', 'Quests')],
              ['badges', t(lang, 'نشان‌ها', 'Badges')],
              ['custom', t(lang, 'سفارشی', 'Custom')],
            ] as Array<[GrowthSubTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === id
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {game.todayKpis.netProfitUsd > 0 && (
            <button
              type="button"
              onClick={onDistributeTodayProfitToGoals}
              className="px-3.5 py-2 text-xs font-medium rounded-xl glass-tile hover:border-[var(--ft-accent)] cursor-pointer"
            >
              {t(lang, 'تقسیم سود ترید امروز به اهداف', 'Allocate Today Profit')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setWizardStep(1);
              setWizardOpen(true);
            }}
            className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t(lang, 'هدف جدید', 'New Goal')}</span>
          </button>
        </div>
      </div>

      {/* 1. Goals & Milestones */}
      {subTab === 'goals' && (
        <div className="space-y-6">
          {/* Priority-Weighted Budget Pool & Allocation Control */}
          <section className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'توزیع بودجه اهداف', 'Priority Budget Engine')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                  {t(
                    lang,
                    'اولویت بالاتر سهم بیشتری از بودجه هفتگی و سود روزانه می‌گیرد.',
                    'Higher priority claims a larger share of weekly budgets & profits.'
                  )}
                </p>
                <div className="font-num text-xs mt-1.5 flex flex-wrap items-center gap-3">
                  <span className="text-[var(--ft-warning)]">
                    {t(lang, 'رزرو اجباری اقساط و بدهی (اولویت #۱):', 'Tier-1 Debt & Installment Reserve:')}{' '}
                    {formatMoney(financeSummary.debtFirstWaterfall.tier1TotalIrt, 'IRT', lang, true, isPrivate)}
                  </span>
                  <span className="text-[var(--ft-positive)] font-semibold">
                    {t(lang, 'سقف آزاد قابل تخصیص به اهداف:', 'Debt-Free Goal Ceiling:')}{' '}
                    {formatMoney(financeSummary.debtFirstWaterfall.tier3GoalAndBudgetPoolIrt, 'IRT', lang, true, isPrivate)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  containerClassName="w-40"
                  value={poolInput}
                  onChange={(e) => {
                    setPoolInput(e.target.value);
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val > 0) onUpdateWeeklyGoalPool(val);
                  }}
                  error={
                    poolInput !== '' && Number(poolInput) <= 0
                      ? t(lang, 'بودجه > ۰', 'Must be > 0')
                      : undefined
                  }
                  warning={
                    Number(poolInput) > financeSummary.debtFirstWaterfall.tier3GoalAndBudgetPoolIrt
                      ? t(lang, 'بیش از سقف آزاد', 'Exceeds ceiling')
                      : undefined
                  }
                  aria-label="Weekly goal budget pool"
                />
                <GlassSelect<string>
                  size="sm"
                  value={poolAccId}
                  onChange={setPoolAccId}
                  options={[
                    { value: '', label: t(lang, 'تخصیص مستقیم', 'Direct Credit') },
                    ...state.bankAccounts.map((a) => ({
                      value: a.id,
                      label: a.name,
                      hint: formatMoney(a.balance, a.currency, lang, true, isPrivate),
                    })),
                  ]}
                />
                <button
                  type="button"
                  onClick={() => onFundWeeklyGoalPool(Number(poolInput) || weeklyPoolIrt, poolAccId || undefined)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer whitespace-nowrap"
                >
                  {t(lang, 'تخصیص بودجه هفتگی به اهداف', 'Distribute Weekly Pool')}
                </button>
              </div>
            </div>

            {game.priorityAllocations.length > 0 && (
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
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {state.goals
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((goal) => {
                const alloc = game.priorityAllocations.find((a) => a.goalId === goal.id);
                const pMeta = getPriorityMeta(goal.priority);
                const effectiveWeekly =
                  goal.autoPriorityBudget !== false && alloc
                    ? alloc.weeklyAmountInGoalCurrency
                    : goal.weeklyBudgetAmount;
                const plan = computeGoalPlan(
                  { ...goal, weeklyBudgetAmount: effectiveWeekly },
                  allKpis.profitFactor,
                  allKpis.avgR
                );
                const milestones = [25, 50, 75, 100];

                return (
                  <section key={goal.id} className="glass-surface rounded-3xl p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs text-[var(--ft-text-muted)] flex flex-wrap items-center gap-2">
                          <span>
                            {goal.kind === 'item' ? t(lang, 'هدف کالایی', 'Item Goal') : t(lang, 'هدف پولی', 'Monetary Goal')}
                          </span>
                          <span className="font-num font-semibold text-[var(--ft-accent)]">
                            {lang === 'fa' ? pMeta.labelFa : pMeta.labelEn} · {pMeta.xpMultiplier}x XP · +{pMeta.starsReward}★
                          </span>
                          {alloc && (
                            <span className="font-num text-[var(--ft-positive)]">
                              · {alloc.sharePct}% ({formatMoney(alloc.weeklyAmountInGoalCurrency, goal.currency, lang, true, isPrivate)}/w)
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                          {goal.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <GlassSelect<string>
                          size="sm"
                          align="end"
                          value={String(goal.priority)}
                          onChange={(val) => onChangeGoalPriority(goal.id, Number(val))}
                          ariaLabel="Goal priority"
                          options={[
                            { value: '1', label: 'P1 (5x)' },
                            { value: '2', label: 'P2 (4x)' },
                            { value: '3', label: 'P3 (3x)' },
                            { value: '4', label: 'P4 (2x)' },
                            { value: '5', label: 'P5 (1x)' },
                          ]}
                        />
                      </div>
                    </div>

                {/* Visual Radial Gauge + Striped Progress */}
                <div className="flex items-center gap-5">
                  <div className="p-2 rounded-2xl glass-tile shrink-0">
                    <RadialGauge
                      pct={plan.progressPct}
                      label=""
                      size={88}
                      strokeWidth={8}
                      color={goal.status === 'completed' ? 'var(--ft-positive)' : 'var(--ft-accent)'}
                      gradientTo={goal.status === 'completed' ? 'var(--ft-accent)' : 'var(--ft-accent-secondary, var(--ft-positive))'}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between text-xs font-num">
                      <span className="text-[var(--ft-text-primary)] font-semibold">
                        {formatMoney(goal.savedAmount, goal.currency, lang, true, isPrivate)}
                      </span>
                      <span className="text-[var(--ft-text-muted)]">
                        {formatMoney(goal.targetAmount, goal.currency, lang, true, isPrivate)}
                      </span>
                    </div>
                    <StripedProgressBar
                      valuePct={plan.progressPct}
                      tone={goal.status === 'completed' ? 'positive' : 'accent'}
                      heightClass="h-3"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {milestones.map((m) => {
                      const reached = plan.progressPct >= m;
                      return (
                        <div
                          key={m}
                          className={`text-center py-1 rounded-lg text-[11px] font-num border ${
                            reached
                              ? 'border-[var(--ft-positive)] bg-[var(--ft-positive-soft)] text-[var(--ft-positive)] font-semibold'
                              : 'border-[var(--ft-border)] text-[var(--ft-text-muted)]'
                          }`}
                        >
                          {reached ? '✓ ' : ''}
                          {m}%
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Performance ETA Impact */}
                <div className="text-xs text-[var(--ft-text-secondary)] space-y-1 pt-2 border-t border-[var(--ft-border)]">
                  <div className="flex justify-between">
                    <span>{t(lang, 'پیش‌بینی اتمام با عملکرد فعلی:', 'Projected ETA:')}</span>
                    <span className="font-num">{formatJalaliDate(plan.projectedDate, lang)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t(lang, 'تارگت روزانه مأموریت:', 'Daily Quest Target:')}</span>
                    <span className="font-num text-[var(--ft-accent)]">
                      {formatMoney(plan.dailyTargetInGoalCurrency, goal.currency, lang, false, isPrivate)}
                    </span>
                  </div>
                  {plan.etaShiftDays !== 0 && (
                    <div
                      className={
                        plan.etaShiftDays < 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-warning)]'
                      }
                    >
                      {plan.etaShiftDays < 0
                        ? t(
                            lang,
                            `عملکرد منضبط ترید شما این هدف را ${Math.abs(plan.etaShiftDays)} روز جلو انداخته است.`,
                            `Disciplined trading accelerated this goal by ${Math.abs(plan.etaShiftDays)} days.`
                          )
                        : t(
                            lang,
                            `نقض حد ضرر اخیر حدود ${plan.etaShiftDays} روز تاخیر ایجاد کرده است.`,
                            `Recent SL breaches delayed this goal by ${plan.etaShiftDays} days.`
                          )}
                    </div>
                  )}
                </div>

                {/* Lifecycle Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {goal.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onChangeGoalStatus(goal.id, 'active')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
                      >
                        {t(lang, 'فعال‌سازی هدف', 'Activate')}
                      </button>
                    )}
                    {goal.status === 'active' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setAllocGoal(goal);
                            setAllocAmount('');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
                        >
                          {t(lang, 'واریز / تخصیص به هدف', 'Allocate Funds')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeGoalStatus(goal.id, 'archived')}
                          className="px-3 py-1.5 text-xs rounded-lg border border-[var(--ft-border)] cursor-pointer"
                        >
                          {t(lang, 'آرشیو', 'Archive')}
                        </button>
                      </>
                    )}
                    {goal.status === 'archived' && (
                      <button
                        type="button"
                        onClick={() => onChangeGoalStatus(goal.id, 'active')}
                        className="px-3 py-1.5 text-xs rounded-lg border border-[var(--ft-border)] cursor-pointer"
                      >
                        {t(lang, 'بازگردانی', 'Reactivate')}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteGoal(goal.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                    aria-label="Delete goal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </section>
            );
          })}
          </div>
        </div>
      )}

      {/* 2. Daily & Goal Quests */}
      {subTab === 'quests' && (
        <div className="space-y-6">
          {/* Active Goal Quests */}
          {game.goalMissions.length > 0 && (
            <section className="glass-surface rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)] flex items-center gap-2">
                <Target className="w-4 h-4 text-[var(--ft-accent)]" />
                <span>{t(lang, 'مأموریت‌های اهداف', 'Goal Quests')}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {game.goalMissions.map((gm) => (
                  <div
                    key={gm.key}
                    className="p-4 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--ft-text-primary)]">
                        {lang === 'fa' ? gm.titleFa : gm.titleEn}
                      </span>
                      <span className="font-num text-xs font-semibold text-[var(--ft-accent)] shrink-0">
                        +{gm.stars} ★ · +{gm.xpReward} XP
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-num text-[var(--ft-text-muted)]">
                      <span>
                        {t(lang, `سهم بودجه اولویت: ${gm.prioritySharePct ?? 0}%`, `Priority Share: ${gm.prioritySharePct ?? 0}%`)}
                      </span>
                      <span className="text-[var(--ft-positive)]">
                        {gm.priorityMultiplier ?? 1}x XP Boost
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          gm.completed ? 'bg-[var(--ft-positive)]' : 'bg-[var(--ft-accent)]'
                        }`}
                        style={{ width: `${gm.progressPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs font-num text-[var(--ft-text-muted)]">
                      <span>
                        {formatMoney(gm.current, gm.unit as CurrencyCode, lang, false, isPrivate)} /{' '}
                        {formatMoney(gm.target, gm.unit as CurrencyCode, lang, false, isPrivate)}
                      </span>
                      <span className={gm.completed ? 'text-[var(--ft-positive)] font-semibold' : ''}>
                        {gm.completed ? t(lang, 'تکمیل شد ✓', 'Completed ✓') : `${gm.progressPct}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Core 10 Daily Trading Quests */}
          <section className="glass-surface rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
              {t(lang, 'مأموریت‌های روزانه', 'Daily Quests')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {game.dailyMissions.map((m) => (
                <div
                  key={m.key}
                  className={`p-4 rounded-xl border space-y-2.5 ${
                    m.completed
                      ? 'bg-[var(--ft-positive-soft)] border-[var(--ft-positive)]'
                      : 'bg-[var(--ft-surface-subtle)] border-[var(--ft-border)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {m.completed && <CheckCircle2 className="w-4 h-4 text-[var(--ft-positive)] shrink-0" />}
                      <span className="text-sm font-medium text-[var(--ft-text-primary)]">
                        {lang === 'fa' ? m.titleFa : m.titleEn}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOverrideKey(m.key);
                        setOvTarget(String(m.target));
                        setOvStars(String(m.stars));
                      }}
                      className="p-1 rounded hover:bg-black/20 text-[var(--ft-text-muted)] cursor-pointer"
                      title={t(lang, 'ویرایش هدف/ستاره', 'Override Target/Stars')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/20 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        m.completed ? 'bg-[var(--ft-positive)]' : 'bg-[var(--ft-accent)]'
                      }`}
                      style={{ width: `${m.progressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-num text-[var(--ft-text-muted)]">
                    <span>
                      {m.current} / {m.target} {m.unit}
                    </span>
                    <span className="text-[var(--ft-accent)]">
                      {m.stars} ★ · {m.xpReward} XP
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* 3. Badges & Season Mastery Ranks */}
      {subTab === 'badges' && (
        <div className="space-y-6">
          <section className="glass-surface rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)] flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[var(--ft-warning)]" />
              <span>{t(lang, 'نشان‌های کلکسیون', 'Mastery Badges')}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {state.badges.map((b) => {
                const unlocked = Boolean(b.unlockedAt) || game.totalStars >= b.starThreshold;
                return (
                  <div
                    key={b.id}
                    className={`p-4 rounded-xl border space-y-2 ${
                      unlocked
                        ? 'bg-[var(--ft-accent-soft)] border-[var(--ft-accent)]'
                        : 'bg-[var(--ft-surface-subtle)] border-[var(--ft-border)] opacity-65'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Award
                        className={`w-6 h-6 ${
                          unlocked ? 'text-[var(--ft-accent)]' : 'text-[var(--ft-text-muted)]'
                        }`}
                      />
                      <span className="font-num text-xs font-semibold">
                        {b.starThreshold} ★
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-[var(--ft-text-primary)]">
                      {lang === 'fa' ? b.titleFa : b.titleEn}
                    </div>
                    <p className="text-xs text-[var(--ft-text-muted)]">
                      {lang === 'fa' ? b.descriptionFa : b.descriptionEn}
                    </p>
                    <div className="text-xs font-num pt-1">
                      {unlocked
                        ? t(lang, `کسب‌شده: ${formatJalaliDate(b.unlockedAt || new Date().toISOString(), lang)}`, 'Unlocked')
                        : t(lang, `نیازمند ${Math.max(0, b.starThreshold - game.totalStars)} ستاره دیگر`, `${Math.max(0, b.starThreshold - game.totalStars)} stars left`)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass-surface rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
              {t(lang, 'لیگ ۱۰ سطحی', '10-Level Season Track')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {TRADER_RANKS.map((rk) => {
                const reached = game.totalXp >= rk.minXp;
                const isCurrent = game.currentRank.level === rk.level;
                return (
                  <div
                    key={rk.level}
                    className={`p-3 rounded-xl border space-y-1 ${
                      isCurrent
                        ? 'border-[var(--ft-accent)] bg-[var(--ft-accent-soft)]'
                        : reached
                        ? 'border-[var(--ft-positive)] bg-[var(--ft-positive-soft)]'
                        : 'border-[var(--ft-border)] bg-[var(--ft-surface-subtle)] opacity-60'
                    }`}
                  >
                    <div className="font-num text-xs font-bold">
                      LVL {rk.level} · {rk.minXp} XP
                    </div>
                    <div className="text-xs font-medium text-[var(--ft-text-primary)]">
                      {lang === 'fa' ? rk.titleFa : rk.titleEn}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* 4. Custom Missions */}
      {subTab === 'custom' && (
        <section className="glass-surface rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--ft-border)]">
            <div>
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                {t(lang, 'مأموریت‌های سفارشی', 'Custom Missions')}
              </h3>
              <p className="text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'ساخت مأموریت از هدف، هزینه یا دستی با ارزیابی روزانه', 'Create manual, goal-linked, or expense-cap missions')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCmTitle('');
                setCmTarget('');
                setCmModalOpen(true);
              }}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
            >
              + {t(lang, 'مأموریت جدید', 'New Custom Mission')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {game.evaluatedCustom.map((cm) => (
              <div
                key={cm.id}
                className="p-4 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-[var(--ft-text-muted)]">
                      {cm.source} · {cm.metric} · {cm.stars} ★ · {cm.xp} XP
                    </div>
                    <div className="text-sm font-semibold text-[var(--ft-text-primary)]">{cm.title}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteCustomMission(cm.id)}
                    className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      cm.completed ? 'bg-[var(--ft-positive)]' : 'bg-[var(--ft-accent)]'
                    }`}
                    style={{ width: `${cm.progressPct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs font-num">
                  <span>
                    {cm.current.toLocaleString('en-US')} / {cm.targetValue.toLocaleString('en-US')}
                  </span>
                  {cm.source === 'manual' && (
                    <button
                      type="button"
                      onClick={() => onIncrementCustomMission(cm.id, Math.max(1, Math.round(cm.targetValue * 0.25)))}
                      className="px-2.5 py-1 rounded bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] cursor-pointer"
                    >
                      +25% {t(lang, 'پیشرفت', 'Progress')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* MODAL: 2-Step Goal Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-surface-high rounded-2xl p-6 w-full max-w-lg space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--ft-border)]">
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                {wizardStep === 1
                  ? t(lang, 'هدف جدید — مرحله ۱: اطلاعات', 'New Goal — Step 1: Details')
                  : t(lang, 'هدف جدید — مرحله ۲: پیش‌نمایش برنامه', 'New Goal — Step 2: Live Feasibility')}
              </h3>
              <span className="font-num text-xs text-[var(--ft-accent)]">{wizardStep} / 2</span>
            </div>

            {wizardStep === 1 ? (
              <div className="space-y-3">
                <MaterialInput
                  type="text"
                  label={t(lang, 'نام هدف', 'Goal Title')}
                  placeholder={t(lang, 'مثلاً ارتقای سیستم معاملاتی', 'e.g. Trading Desk Upgrade')}
                  value={gTitle}
                  onChange={(e) => setGTitle(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <GlassSelect<GoalKind>
                    className="w-full"
                    value={gKind}
                    onChange={setGKind}
                    options={[
                      { value: 'item', label: t(lang, 'هدف کالایی', 'Item') },
                      { value: 'monetary', label: t(lang, 'هدف پولی', 'Monetary') },
                    ]}
                  />
                  <GlassSelect<CurrencyCode>
                    className="w-full"
                    value={gCurrency}
                    onChange={setGCurrency}
                    options={[
                      { value: 'IRT', label: 'IRT (تومان)' },
                      { value: 'USD', label: 'USD ($)' },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MaterialInput
                    type="number"
                    ltrNum
                    label={t(lang, 'مبلغ هدف', 'Target Amount')}
                    value={gTargetAmount}
                    onChange={(e) => setGTargetAmount(e.target.value)}
                    error={
                      gTargetAmount !== '' && Number(gTargetAmount) <= 0
                        ? t(lang, 'باید > ۰ باشد', 'Must be > 0')
                        : undefined
                    }
                  />
                  <JalaliDatePicker
                    lang={lang}
                    fieldSize="sm"
                    label={t(lang, 'تاریخ مقصد', 'Target Date')}
                    value={gTargetDate}
                    onChange={setGTargetDate}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 items-start">
                  <MaterialInput
                    type="number"
                    fieldSize="sm"
                    ltrNum
                    label={t(lang, 'بودجه هفتگی', 'Weekly Budget')}
                    value={gWeeklyBudget}
                    onChange={(e) => setGWeeklyBudget(e.target.value)}
                  />
                  <div className="md-field">
                    <label className="md-field-label">{t(lang, 'سطح اولویت', 'Priority')}</label>
                    <GlassSelect<string>
                      className="w-full"
                      size="sm"
                      value={gPriority}
                      onChange={setGPriority}
                      options={[
                        { value: '1', label: 'P1 · 1.5x XP' },
                        { value: '2', label: 'P2 · 1.3x XP' },
                        { value: '3', label: 'P3 · 1.15x XP' },
                        { value: '4', label: 'P4 · 1.05x XP' },
                        { value: '5', label: 'P5 · 1.0x XP' },
                      ]}
                    />
                  </div>
                  <MaterialInput
                    type="number"
                    fieldSize="sm"
                    ltrNum
                    min="1"
                    max="100"
                    label={t(lang, 'تخصیص %', 'Alloc %')}
                    value={gAllocationPct}
                    onChange={(e) => setGAllocationPct(e.target.value)}
                    warning={
                      Number(gAllocationPct) < 15
                        ? t(lang, 'تخصیص پایین (<۱۵٪)', 'Low alloc (<15%)')
                        : undefined
                    }
                  />
                </div>
                <GlassSelect<GoalBudgetSource>
                  className="w-full"
                  size="sm"
                  value={gBudgetSource}
                  onChange={setGBudgetSource}
                  options={[
                    {
                      value: 'trading_profit',
                      label: t(lang, 'منبع: سود معاملات + بودجه هفتگی', 'Source: Trading Profit + Weekly Budget'),
                    },
                    {
                      value: 'weekly_budget',
                      label: t(lang, 'منبع: بودجه هفتگی حسابداری', 'Source: Weekly Budget'),
                    },
                  ]}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] text-xs">
                  <div>
                    <span className="text-[var(--ft-text-muted)] block">{t(lang, 'مانده لازم', 'Remaining Needed')}</span>
                    <span className="font-num text-sm font-bold">
                      {formatMoney(livePreview.remainingAmount, gCurrency, lang)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--ft-text-muted)] block">{t(lang, 'مبلغ ماهانه پیشنهادی', 'Suggested Monthly')}</span>
                    <span className="font-num text-sm font-bold">
                      {formatMoney(livePreview.suggestedMonthly, gCurrency, lang)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--ft-text-muted)] block">{t(lang, 'ماه‌های لازم', 'Months Needed')}</span>
                    <span className="font-num text-sm font-bold">{livePreview.monthsNeeded}</span>
                  </div>
                  <div>
                    <span className="text-[var(--ft-text-muted)] block">{t(lang, 'تاریخ تکمیل پیش‌بینی‌شده', 'Projected Completion')}</span>
                    <span className="font-num text-sm font-bold">{formatJalaliDate(livePreview.projectedDate, lang)}</span>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl text-xs font-medium ${
                    livePreview.isFeasible
                      ? 'bg-[var(--ft-positive-soft)] text-[var(--ft-positive)]'
                      : 'bg-[var(--ft-warning-soft)] text-[var(--ft-warning)]'
                  }`}
                >
                  {livePreview.isFeasible
                    ? t(lang, 'وضعیت برنامه: قابل‌اجرا — آماده تبدیل به مأموریت روزانه', 'Status: Feasible')
                    : livePreview.warnings.join(' · ')}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => (wizardStep === 1 ? setWizardOpen(false) : setWizardStep(1))}
                className="px-4 py-2 text-xs rounded-xl border border-[var(--ft-border)] cursor-pointer"
              >
                {wizardStep === 1 ? t(lang, 'انصراف', 'Cancel') : t(lang, 'مرحله قبل', 'Back')}
              </button>
              {wizardStep === 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
                >
                  {t(lang, 'پیش‌نمایش برنامه', 'Preview Plan')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveWizardGoal}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
                >
                  {t(lang, 'ذخیره و تایید (پیش‌نویس)', 'Save Draft Goal')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Allocate Funds to Goal */}
      {allocGoal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const amt = Number(allocAmount);
              if (!Number.isFinite(amt) || amt <= 0) {
                onShowToast(t(lang, 'مبلغ تخصیص باید بزرگ‌تر از صفر باشد', 'Invalid amount'), 'error');
                return;
              }
              onAllocateToGoal(allocGoal.id, amt, allocAccId || undefined);
              setAllocGoal(null);
            }}
            className="glass-surface-high rounded-2xl p-6 w-full max-w-md space-y-4"
          >
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
              {t(lang, `تخصیص به هدف «${allocGoal.title}»`, `Allocate to "${allocGoal.title}"`)}
            </h3>
            {(() => {
              const allocNum = Number(allocAmount);
              const selectedBank = state.bankAccounts.find((a) => a.id === allocAccId);
              const allocErr =
                allocAmount !== '' && (!Number.isFinite(allocNum) || allocNum <= 0)
                  ? t(lang, 'مبلغ باید بزرگ‌تر از صفر باشد', 'Must be > 0')
                  : undefined;
              const allocWarn =
                !allocErr &&
                selectedBank &&
                allocAmount !== '' &&
                selectedBank.currency === allocGoal.currency &&
                allocNum > selectedBank.balance
                  ? t(lang, 'از موجودی حساب انتخاب‌شده بیشتر است', 'Exceeds selected account balance')
                  : undefined;
              return (
                <MaterialInput
                  type="number"
                  step="any"
                  required
                  ltrNum
                  label={t(lang, `مبلغ (${allocGoal.currency})`, `Amount (${allocGoal.currency})`)}
                  value={allocAmount}
                  onChange={(e) => setAllocAmount(e.target.value)}
                  error={allocErr}
                  warning={allocWarn}
                />
              );
            })()}
            <GlassSelect<string>
              className="w-full"
              size="sm"
              value={allocAccId}
              onChange={setAllocAccId}
              options={[
                { value: '', label: t(lang, 'ثبت مستقیم بدون کسر از حساب بانکی', 'Record directly (no bank deduction)') },
                ...state.bankAccounts.map((a) => ({
                  value: a.id,
                  label: `${t(lang, 'کسر از:', 'Deduct from:')} ${a.name}`,
                  hint: formatMoney(a.balance, a.currency, lang, true, isPrivate),
                })),
              ]}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAllocGoal(null)}
                className="px-4 py-2 text-xs rounded-xl border border-[var(--ft-border)] cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
              >
                {t(lang, 'تایید واریز', 'Confirm Allocation')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Override Mission Target/Stars */}
      {overrideKey && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onOverrideMission(overrideKey, Number(ovTarget) || undefined, Number(ovStars) || undefined);
              setOverrideKey(null);
            }}
            className="glass-surface-high rounded-2xl p-6 w-full max-w-sm space-y-4"
          >
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
              {t(lang, 'شخصی‌سازی هدف و ستاره مأموریت', 'Override Mission Target & Stars')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <MaterialInput
                type="number"
                step="any"
                ltrNum
                label={t(lang, 'هدف عددی', 'Target')}
                value={ovTarget}
                onChange={(e) => setOvTarget(e.target.value)}
                error={ovTarget !== '' && Number(ovTarget) <= 0 ? t(lang, 'باید > ۰', '> 0') : undefined}
              />
              <MaterialInput
                type="number"
                min="1"
                ltrNum
                label={t(lang, 'ستاره', 'Stars')}
                value={ovStars}
                onChange={(e) => setOvStars(e.target.value)}
                error={ovStars !== '' && Number(ovStars) < 1 ? t(lang, 'حداقل ۱', 'Min 1') : undefined}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOverrideKey(null)}
                className="px-4 py-2 text-xs rounded-xl border border-[var(--ft-border)] cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
              >
                {t(lang, 'ذخیره', 'Save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Create Custom Mission */}
      {cmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveCustomMission} className="glass-surface-high rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
              {t(lang, 'ساخت مأموریت سفارشی', 'Create Custom Mission')}
            </h3>
            <MaterialInput
              type="text"
              required
              label={t(lang, 'نام مأموریت', 'Mission Title')}
              value={cmTitle}
              onChange={(e) => setCmTitle(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <GlassSelect<CustomMission['source']>
                className="w-full"
                size="sm"
                value={cmSource}
                onChange={setCmSource}
                options={[
                  { value: 'manual', label: t(lang, 'منبع: دستی', 'Source: Manual') },
                  { value: 'goal', label: t(lang, 'منبع: از هدف', 'Source: From Goal') },
                  { value: 'expense', label: t(lang, 'منبع: از هزینه', 'Source: From Expense') },
                ]}
              />
              <GlassSelect<CustomMission['metric']>
                className="w-full"
                size="sm"
                value={cmMetric}
                onChange={setCmMetric}
                options={[
                  { value: 'income', label: t(lang, 'متریک: درآمد', 'Metric: Income') },
                  { value: 'cap', label: t(lang, 'متریک: سقف هزینه', 'Metric: Expense Cap') },
                ]}
              />
            </div>
            {cmSource === 'goal' && state.goals.length > 0 && (
              <GlassSelect<string>
                className="w-full"
                size="sm"
                value={cmGoalId}
                onChange={setCmGoalId}
                options={state.goals.map((g) => ({
                  value: g.id,
                  label: `[P${g.priority}] ${g.title}`,
                }))}
              />
            )}
            <div className="grid grid-cols-3 gap-3">
              <MaterialInput
                type="number"
                fieldSize="sm"
                ltrNum
                required
                label={t(lang, 'هدف عددی', 'Target')}
                value={cmTarget}
                onChange={(e) => setCmTarget(e.target.value)}
                error={cmTarget !== '' && Number(cmTarget) <= 0 ? t(lang, '> ۰', '> 0') : undefined}
              />
              <MaterialInput
                type="number"
                fieldSize="sm"
                ltrNum
                min="1"
                label={t(lang, 'ستاره', 'Stars')}
                value={cmStars}
                onChange={(e) => setCmStars(e.target.value)}
                error={cmStars !== '' && Number(cmStars) < 1 ? t(lang, 'حداقل ۱', 'Min 1') : undefined}
              />
              <MaterialInput
                type="number"
                fieldSize="sm"
                ltrNum
                min="10"
                label="XP"
                value={cmXp}
                onChange={(e) => setCmXp(e.target.value)}
                error={cmXp !== '' && Number(cmXp) < 10 ? t(lang, 'حداقل ۱۰', 'Min 10') : undefined}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCmModalOpen(false)}
                className="px-4 py-2 text-xs rounded-xl border border-[var(--ft-border)] cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
              >
                {t(lang, 'ذخیره', 'Save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
