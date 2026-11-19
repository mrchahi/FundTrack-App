import React, { useMemo, useState } from 'react';
import { Printer, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { AppLanguage, FundTrackState } from '../types';
import { computePeriodDigest } from '../utils/intelligence';
import { formatMoney, formatUsdInline, PRIVATE_MASK } from '../utils/domain';
import { formatJalaliDate } from '../utils/jalali';
import { t } from '../i18n/translations';
import { RadialGauge, StripedProgressBar } from './Charts';

interface ExecutiveDigestSectionProps {
  state: FundTrackState;
}

export const ExecutiveDigestSection: React.FC<ExecutiveDigestSectionProps> = ({ state }) => {
  const lang: AppLanguage = state.settings.language;
  const isPrivate = Boolean(state.settings.privateMode);
  const [period, setPeriod] = useState<'week' | 'month'>('month');

  const digest = useMemo(() => computePeriodDigest(state, period), [state, period]);
  const pnlDelta = Number((digest.netTradingUsd - digest.prevNetTradingUsd).toFixed(2));

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h3 className="text-lg font-bold text-[var(--ft-text-primary)]">
            {t(lang, 'کارنامه عملکرد و گزارش دوره‌ای', 'Periodic Performance Digest')}
          </h3>
          <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
            {t(
              lang,
              'خلاصه تلفیقی ترید واقعی MT5، جریان نقدی، پرداخت بدهی و پیشرفت اهداف با قابلیت چاپ PDF',
              'Unified MT5 trading, cashflow, debt payoff, and goal scorecard ready for print/PDF export'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl glass-surface overflow-x-auto no-scrollbar max-w-full flex-nowrap">
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`min-h-[34px] px-3.5 py-1 text-xs font-medium rounded-xl cursor-pointer whitespace-nowrap shrink-0 ${
                period === 'week'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)]'
              }`}
            >
              {t(lang, 'هفتگی', 'Weekly')}
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`min-h-[34px] px-3.5 py-1 text-xs font-medium rounded-xl cursor-pointer whitespace-nowrap shrink-0 ${
                period === 'month'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)]'
              }`}
            >
              {t(lang, 'ماهانه', 'Monthly')}
            </button>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t(lang, 'چاپ / خروجی PDF', 'Print / Save PDF')}</span>
          </button>
        </div>
      </div>

      {/* Printable Digest Container */}
      <section className="glass-surface print-digest-card rounded-3xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--ft-border)]">
          <div>
            <div className="text-xs text-[var(--ft-text-muted)]">
              FundTrack Executive Scorecard · {formatJalaliDate(new Date(), lang)}
            </div>
            <h4 className="text-xl font-bold text-[var(--ft-text-primary)] mt-0.5">
              {period === 'week'
                ? t(lang, 'گزارش تراز هفتگی ترید و مالی', 'Weekly Trading & Finance Digest')
                : t(lang, 'گزارش تراز ماهانه ترید و مالی', 'Monthly Trading & Finance Digest')}
            </h4>
          </div>
          <div className="font-num text-xs text-[var(--ft-text-muted)]">
            {digest.tradeCount} {t(lang, 'معامله', 'trades')} · {digest.activeGoalsCount}{' '}
            {t(lang, 'هدف فعال', 'active goals')}
          </div>
        </div>

        {/* 4 Core KPI Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl glass-tile space-y-1.5">
            <div className="text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'سود خالص ترید دوره', 'Period Trading Net')}
            </div>
            <div
              className={`font-num text-2xl font-extrabold ${
                digest.netTradingUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
              }`}
            >
              {isPrivate
                ? PRIVATE_MASK
                : `${digest.netTradingUsd >= 0 ? '+' : ''}${formatMoney(digest.netTradingUsd, 'USD', lang)}`}
            </div>
            <div className="text-[11px] font-num flex items-center gap-1 text-[var(--ft-text-muted)]">
              {pnlDelta >= 0 ? (
                <TrendingUp className="w-3 h-3 text-[var(--ft-positive)]" />
              ) : (
                <TrendingDown className="w-3 h-3 text-[var(--ft-danger)]" />
              )}
              <span>
                {formatUsdInline(pnlDelta, isPrivate)} {t(lang, 'نسبت به دوره قبل', 'vs prev period')}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl glass-tile space-y-1.5">
            <div className="text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'درآمد / مخارج ثبت‌شده', 'Cashflow In / Out')}
            </div>
            <div className="font-num text-base font-bold text-[var(--ft-positive)]">
              {isPrivate ? PRIVATE_MASK : `+${formatMoney(digest.totalIncomeIrt, 'IRT', lang, true)}`}
            </div>
            <div className="font-num text-sm font-semibold text-[var(--ft-danger)]">
              {isPrivate ? PRIVATE_MASK : `-${formatMoney(digest.totalExpenseIrt, 'IRT', lang, true)}`}
            </div>
          </div>

          <div className="p-4 rounded-2xl glass-tile space-y-1.5">
            <div className="text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'اقساط و بدهی تسویه‌شده', 'Debt & Loans Paid')}
            </div>
            <div className="font-num text-xl font-extrabold text-[var(--ft-accent)]">
              {formatMoney(digest.debtPaidIrt, 'IRT', lang, true, isPrivate)}
            </div>
            <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
              {t(lang, 'اولویت #۱ تخصیص سرمایه', 'Debt-First Priority #1')}
            </div>
          </div>

          <div className="p-4 rounded-2xl glass-tile flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'نرخ پس‌انداز دوره', 'Savings Rate')}
              </div>
              <div className="font-num text-2xl font-extrabold text-[var(--ft-text-primary)] mt-1">
                {digest.savingsRatePct}%
              </div>
              <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
                {t(lang, 'پیشرفت اهداف:', 'Goals avg:')} {digest.avgGoalProgressPct}%
              </div>
            </div>
            <RadialGauge
              pct={Math.max(0, digest.savingsRatePct)}
              label=""
              size={66}
              strokeWidth={7}
              color="var(--ft-positive)"
              gradientTo="var(--ft-accent)"
            />
          </div>
        </div>

        {/* Real EA Trading Edge Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl glass-tile space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--ft-text-muted)]">
                {t(lang, 'نرخ برد و ضریب سود', 'Win Rate & Profit Factor')}
              </span>
              <span className="font-num font-bold text-[var(--ft-text-primary)]">
                PF {digest.profitFactor} · {digest.avgR}R
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-num">
                <span>{t(lang, 'نرخ برد', 'Win Rate')}</span>
                <span>{digest.winRatePct}%</span>
              </div>
              <StripedProgressBar valuePct={digest.winRatePct} tone="positive" heightClass="h-2.5" />
              <div className="flex justify-between text-xs font-num pt-1">
                <span>{t(lang, 'امید ریاضی هر معامله', 'Expectancy / Trade')}</span>
                <span className={digest.expectancyUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'}>
                  {formatUsdInline(digest.expectancyUsd, isPrivate)}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl glass-tile space-y-2">
            <div className="text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'عملکرد سشن‌ها (برترین / ضعیف‌ترین)', 'Session Edge (Best / Weakest)')}
            </div>
            {digest.bestSession ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm font-bold text-[var(--ft-positive)]">
                  <span>{digest.bestSession.session}</span>
                  <span className="font-num">{formatUsdInline(digest.bestSession.netUsd, isPrivate)}</span>
                </div>
                <div className="font-num text-xs text-[var(--ft-text-secondary)]">
                  {digest.bestSession.trades} {t(lang, 'معامله', 'trades')} · {digest.bestSession.winRatePct}% WR · {digest.bestSession.avgR}R
                </div>
                {digest.worstSession && (
                  <div className="pt-1.5 border-t border-[var(--ft-border)] flex items-center justify-between text-xs font-num text-[var(--ft-danger)]">
                    <span>{digest.worstSession.session}</span>
                    <span>{formatUsdInline(digest.worstSession.netUsd, isPrivate)}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-[var(--ft-text-muted)]">—</div>
            )}
          </div>

          <div className="p-4 rounded-2xl glass-tile space-y-2">
            <div className="text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'نسبت بازده (Payoff) و افت سرمایه', 'Payoff Ratio & Max Drawdown')}
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-num text-xl font-extrabold text-[var(--ft-accent)]">
                {digest.payoffRatio}x
              </div>
              <div className="font-num text-xs text-[var(--ft-danger)]">
                Max DD: {isPrivate ? PRIVATE_MASK : `$${digest.maxDrawdownUsd.toFixed(2)}`}
              </div>
            </div>
            <div className="font-num text-xs text-[var(--ft-text-secondary)] pt-1">
              {t(lang, 'میانگین سود:', 'Avg Win:')} {isPrivate ? PRIVATE_MASK : `$${digest.avgWinUsd.toFixed(1)}`} ·{' '}
              {t(lang, 'میانگین ضرر:', 'Avg Loss:')} {isPrivate ? PRIVATE_MASK : `$${digest.avgLossUsd.toFixed(1)}`}
            </div>
          </div>
        </div>

        {/* Actionable Summary Banner */}
        <div className="p-4 rounded-2xl glass-tile flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-[var(--ft-accent)] shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-[var(--ft-text-primary)]">
            {lang === 'fa' ? digest.insightFa : digest.insightEn}
          </div>
        </div>
      </section>
    </div>
  );
};
