import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { AppLanguage, FundTrackState, SystemSettings, Trade } from '../types';
import {
  CsvImportPreview,
  SYMBOL_CONTRACT_PRESETS,
  SymbolPresetId,
  computeDailyDrawdownStatus,
  computePositionSizing,
  parseTradesCsv,
} from '../utils/intelligence';
import { formatMoney, formatUsdInline, maskText, PRIVATE_MASK } from '../utils/domain';
import { formatJalaliDateTime } from '../utils/jalali';
import { t } from '../i18n/translations';
import { GlassSelect } from './GlassControls';
import { MaterialInput } from './MaterialInputs';
import { RadialGauge, StripedProgressBar } from './Charts';

interface TradingRiskAndImportSectionProps {
  state: FundTrackState;
  onUpdateSettings: (patch: Partial<SystemSettings>) => void;
  onImportCsvTrades: (trades: Trade[]) => void;
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const TradingRiskAndImportSection: React.FC<TradingRiskAndImportSectionProps> = ({
  state,
  onUpdateSettings,
  onImportCsvTrades,
  onShowToast,
}) => {
  const lang: AppLanguage = state.settings.language;
  const isPrivate = Boolean(state.settings.privateMode);

  // Daily drawdown status
  const dailyMaxLossPct = state.settings.dailyMaxLossPct ?? 3;
  const defaultRiskPct = state.settings.defaultRiskPct ?? 1;
  const ddStatus = useMemo(
    () => computeDailyDrawdownStatus(state.trades, state.mt5Accounts, dailyMaxLossPct),
    [state.trades, state.mt5Accounts, dailyMaxLossPct]
  );

  // Position size calculator state
  const [selectedAccId, setSelectedAccId] = useState<string>(
    state.mt5Accounts[0]?.id ?? 'custom'
  );
  const [customBalance, setCustomBalance] = useState<string>(
    String(state.mt5Accounts[0]?.equity ?? 10000)
  );
  const [symbolPreset, setSymbolPreset] = useState<SymbolPresetId>('XAUUSD');
  const [riskPctInput, setRiskPctInput] = useState<string>(String(defaultRiskPct));
  const [entryInput, setEntryInput] = useState<string>(
    String(SYMBOL_CONTRACT_PRESETS.XAUUSD.defaultEntry)
  );
  const [slInput, setSlInput] = useState<string>(
    String(SYMBOL_CONTRACT_PRESETS.XAUUSD.defaultSl)
  );
  const [tpInput, setTpInput] = useState<string>(
    String(SYMBOL_CONTRACT_PRESETS.XAUUSD.defaultTp)
  );
  const [customContractVal, setCustomContractVal] = useState<string>('100');

  const activeAccountBalance = useMemo(() => {
    if (selectedAccId === 'custom') return Math.max(0, Number(customBalance) || 0);
    const acc = state.mt5Accounts.find((a) => a.id === selectedAccId);
    return acc ? acc.equity || acc.balance : Number(customBalance) || 10000;
  }, [selectedAccId, customBalance, state.mt5Accounts]);

  const handleSymbolChange = (next: SymbolPresetId) => {
    setSymbolPreset(next);
    const preset = SYMBOL_CONTRACT_PRESETS[next];
    setEntryInput(String(preset.defaultEntry));
    setSlInput(String(preset.defaultSl));
    setTpInput(String(preset.defaultTp));
  };

  const sizing = useMemo(
    () =>
      computePositionSizing({
        balanceUsd: activeAccountBalance,
        riskPct: Number(riskPctInput) || 1,
        symbolPreset,
        customUsdPerUnitPerLot: Number(customContractVal) || 100,
        entryPrice: Number(entryInput) || 0,
        stopLoss: Number(slInput) || 0,
        takeProfit: Number(tpInput) || 0,
      }),
    [
      activeAccountBalance,
      riskPctInput,
      symbolPreset,
      customContractVal,
      entryInput,
      slInput,
      tpInput,
    ]
  );

  // CSV importer state
  const [csvAccountId, setCsvAccountId] = useState<string>(
    state.mt5Accounts[0]?.id ?? 'mt5_1'
  );
  const [csvPreview, setCsvPreview] = useState<CsvImportPreview | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>('');

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const existingTickets = new Set(state.trades.map((tr) => tr.ticket));
      const preview = parseTradesCsv(text, csvAccountId, existingTickets);
      setCsvPreview(preview);
      if (preview.rows.length === 0) {
        onShowToast(
          t(lang, 'ردیف معتبری در فایل CSV شناسایی نشد', 'No valid trade rows found in CSV'),
          'error'
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadSampleCsv = () => {
    const sample = [
      'Ticket,Symbol,Type,Volume,OpenTime,CloseTime,OpenPrice,ClosePrice,SL,TP,Commission,Swap,Profit,SetupTag,Note',
      '9120441,XAUUSD,BUY,0.20,2026-11-12 10:15:00,2026-11-12 12:30:00,2645.0,2658.5,2640.0,2660.0,-1.40,0,270.00,London Breakout,Clean breakout retest',
      '9120442,EURUSD,SELL,0.40,2026-11-13 14:05:00,2026-11-13 15:10:00,1.0860,1.0880,1.0880,1.0815,-2.20,-0.40,-80.00,NY Reversal,Stopped cleanly at SL',
    ].join('\n');
    const blob = new Blob(['\uFEFF' + sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fundtrack-sample-trades.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCommitCsv = () => {
    if (!csvPreview) return;
    const toImport = csvPreview.rows.filter((r) => !r.isDuplicate).map((r) => r.trade);
    if (toImport.length === 0) {
      onShowToast(
        t(lang, 'همه معاملات این فایل قبلاً ثبت شده‌اند', 'All rows already exist in journal'),
        'info'
      );
      return;
    }
    onImportCsvTrades(toImport);
    setCsvPreview(null);
    setCsvFileName('');
  };

  return (
    <div className="space-y-6">
      {/* 1. Daily Drawdown Circuit Breaker Guardrail */}
      <section className="glass-surface rounded-3xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
          <div className="flex items-start gap-3">
            <span className="p-2.5 rounded-2xl glass-tile shrink-0">
              {ddStatus.breached ? (
                <ShieldAlert className="w-5 h-5 text-[var(--ft-danger)]" />
              ) : ddStatus.warning ? (
                <AlertTriangle className="w-5 h-5 text-[var(--ft-warning)]" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-[var(--ft-positive)]" />
              )}
            </span>
            <div>
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                {t(lang, 'سپر افت سرمایه روزانه', 'Daily Drawdown Guardrail')}
              </h3>
              <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                {ddStatus.breached
                  ? t(
                      lang,
                      'هشدار بحرانی: سقف ضرر روزانه امروز رد شده است — توقف ترید تا فردا توصیه می‌شود.',
                      'Limit breached: stop opening new trades today to protect capital.'
                    )
                  : ddStatus.warning
                  ? t(
                      lang,
                      'احتیاط: بیش از ۷۰٪ از بودجه ضرر مجاز امروز مصرف شده است.',
                      'Caution: over 70% of today’s maximum loss allowance is used.'
                    )
                  : t(
                      lang,
                      'وضعیت سرمایه امروز در محدوده امن قرار دارد و ریسک تحت کنترل است.',
                      'Today’s equity drawdown is safely within your configured daily cap.'
                    )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <MaterialInput
              type="number"
              fieldSize="sm"
              ltrNum
              min={0.5}
              max={20}
              step={0.5}
              containerClassName="w-40"
              label={t(lang, 'حداکثر افت روزانه (%)', 'Daily Max Loss %')}
              warning={
                dailyMaxLossPct > 5
                  ? t(lang, 'سقف افت روزانه بیش از ۵٪ پرریسک است', 'Above 5% daily cap is aggressive')
                  : undefined
              }
              value={dailyMaxLossPct}
              onChange={(e) =>
                onUpdateSettings({
                  dailyMaxLossPct: Math.max(0.5, Math.min(20, Number(e.target.value) || 3)),
                })
              }
            />
            <MaterialInput
              type="number"
              fieldSize="sm"
              ltrNum
              min={0.25}
              max={10}
              step={0.25}
              containerClassName="w-36"
              label={t(lang, 'ریسک پیش‌فرض (%)', 'Default Risk %')}
              warning={
                defaultRiskPct > 2
                  ? t(lang, 'ریسک بالای ۲٪ توصیه نمی‌شود', 'Above 2% risk is high')
                  : undefined
              }
              value={defaultRiskPct}
              onChange={(e) => {
                const next = Math.max(0.25, Math.min(10, Number(e.target.value) || 1));
                onUpdateSettings({ defaultRiskPct: next });
                setRiskPctInput(String(next));
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl glass-tile space-y-1">
            <div className="text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'سود/زیان خالص امروز', 'Today Realized P&L')}
            </div>
            <div
              className={`font-num text-lg font-bold ${
                ddStatus.todayNetUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
              }`}
            >
              {isPrivate
                ? PRIVATE_MASK
                : `${ddStatus.todayNetUsd >= 0 ? '+' : ''}${formatMoney(ddStatus.todayNetUsd, 'USD', lang)}`}
            </div>
            <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
              {ddStatus.todayTradesCount} {t(lang, 'معامله امروز', 'trades today')}
            </div>
          </div>

          <div className="p-4 rounded-2xl glass-tile space-y-1">
            <div className="text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'سقف مجاز ضرر روزانه', 'Daily Loss Cap')}
            </div>
            <div className="font-num text-lg font-bold text-[var(--ft-text-primary)]">
              {formatMoney(ddStatus.limitUsd, 'USD', lang, false, isPrivate)}
            </div>
            <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
              {ddStatus.dailyMaxLossPct}% {t(lang, 'از', 'of')}{' '}
              {formatMoney(ddStatus.totalEquityUsd, 'USD', lang, true, isPrivate)}
            </div>
          </div>

          <div className="p-4 rounded-2xl glass-tile space-y-1">
            <div className="text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'بافر باقی‌مانده امروز', 'Remaining Buffer')}
            </div>
            <div className="font-num text-lg font-bold text-[var(--ft-positive)]">
              {formatMoney(ddStatus.remainingBufferUsd, 'USD', lang, false, isPrivate)}
            </div>
            <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
              {ddStatus.usedPct}% {t(lang, 'مصرف‌شده', 'consumed')}
            </div>
          </div>

          <div className="p-4 rounded-2xl glass-tile flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--ft-text-muted)]">
                {t(lang, 'مصرف سقف روزانه', 'Cap Usage')}
              </span>
              <span className="font-num font-bold text-[var(--ft-text-primary)]">
                {ddStatus.usedPct}%
              </span>
            </div>
            <StripedProgressBar
              valuePct={Math.min(100, ddStatus.usedPct)}
              tone={ddStatus.breached ? 'danger' : ddStatus.warning ? 'warning' : 'positive'}
              heightClass="h-3"
            />
          </div>
        </div>
      </section>

      {/* 2. Pre-Trade Position Size & Risk/Reward Calculator */}
      <section className="glass-surface rounded-3xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--ft-border)]">
          <div className="flex items-center gap-2.5">
            <Calculator className="w-5 h-5 text-[var(--ft-accent)]" />
            <div>
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                {t(lang, 'ماشین‌حساب لات‌سایز', 'Position Size Calculator')}
              </h3>
              <p className="text-xs text-[var(--ft-text-muted)]">
                {t(
                  lang,
                  'محاسبه دقیق لات‌سایز پیش از ورود بر اساس اکوئیتی حساب MT5 و فاصله حد ضرر',
                  'Compute exact lot size before entry from live MT5 equity and stop-loss distance'
                )}
              </p>
            </div>
          </div>

          {sizing.isValid && (
            <span
              className={`font-num text-xs font-bold ${
                sizing.direction === 'BUY' ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
              }`}
            >
              {sizing.direction} · 1 : {sizing.rrRatio} R:R
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Inputs */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'حساب معاملاتی مبنا', 'Source MT5 Account')}
              </label>
              <GlassSelect<string>
                value={selectedAccId}
                onChange={setSelectedAccId}
                ariaLabel="Source account"
                options={[
                  ...state.mt5Accounts.map((a) => ({
                    value: a.id,
                    label: `${a.broker} (${formatMoney(a.equity, 'USD', lang, false, isPrivate)})`,
                  })),
                  { value: 'custom', label: t(lang, 'موجودی دلخواه...', 'Custom Balance...') },
                ]}
              />
            </div>

            {selectedAccId === 'custom' ? (
              <MaterialInput
                type="number"
                ltrNum
                label={t(lang, 'موجودی حساب ($)', 'Account Balance ($)')}
                error={
                  Number(customBalance) <= 0
                    ? t(lang, 'موجودی باید بزرگ‌تر از صفر باشد', 'Must be > 0')
                    : undefined
                }
                value={customBalance}
                onChange={(e) => setCustomBalance(e.target.value)}
              />
            ) : (
              <MaterialInput
                type="number"
                step="0.25"
                min="0.1"
                max="20"
                ltrNum
                label={t(lang, 'ریسک معامله (%)', 'Risk per Trade (%)')}
                error={
                  Number(riskPctInput) <= 0
                    ? t(lang, 'ریسک نامعتبر است', 'Invalid risk %')
                    : undefined
                }
                warning={
                  Number(riskPctInput) > 2
                    ? t(lang, 'هشدار: ریسک بیش از ۲٪ روی یک معامله', 'Warning: >2% risk per trade')
                    : undefined
                }
                value={riskPctInput}
                onChange={(e) => setRiskPctInput(e.target.value)}
              />
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'نماد معاملاتی', 'Instrument Preset')}
              </label>
              <GlassSelect<SymbolPresetId>
                value={symbolPreset}
                onChange={handleSymbolChange}
                ariaLabel="Symbol preset"
                options={(Object.keys(SYMBOL_CONTRACT_PRESETS) as SymbolPresetId[]).map((k) => ({
                  value: k,
                  label: SYMBOL_CONTRACT_PRESETS[k].label,
                }))}
              />
            </div>

            {selectedAccId === 'custom' ? (
              <MaterialInput
                type="number"
                step="0.25"
                min="0.1"
                max="20"
                ltrNum
                label={t(lang, 'ریسک معامله (%)', 'Risk per Trade (%)')}
                error={
                  Number(riskPctInput) <= 0
                    ? t(lang, 'ریسک نامعتبر است', 'Invalid risk %')
                    : undefined
                }
                warning={
                  Number(riskPctInput) > 2
                    ? t(lang, 'هشدار: ریسک بیش از ۲٪ روی یک معامله', 'Warning: >2% risk per trade')
                    : undefined
                }
                value={riskPctInput}
                onChange={(e) => setRiskPctInput(e.target.value)}
              />
            ) : symbolPreset === 'CUSTOM' ? (
              <MaterialInput
                type="number"
                ltrNum
                label={t(lang, 'ارزش هر واحد حرکت / لات ($)', 'USD per 1.0 Move / Lot')}
                error={
                  Number(customContractVal) <= 0
                    ? t(lang, 'مقدار معتبر وارد کنید', 'Enter a positive value')
                    : undefined
                }
                value={customContractVal}
                onChange={(e) => setCustomContractVal(e.target.value)}
              />
            ) : (
              <MaterialInput
                type="number"
                step="any"
                ltrNum
                label={t(lang, 'قیمت ورود (Entry)', 'Entry Price')}
                error={
                  Number(entryInput) <= 0
                    ? t(lang, 'قیمت ورود معتبر نیست', 'Invalid entry price')
                    : undefined
                }
                value={entryInput}
                onChange={(e) => setEntryInput(e.target.value)}
              />
            )}

            {(selectedAccId === 'custom' || symbolPreset === 'CUSTOM') && (
              <MaterialInput
                type="number"
                step="any"
                ltrNum
                label={t(lang, 'قیمت ورود (Entry)', 'Entry Price')}
                error={
                  Number(entryInput) <= 0
                    ? t(lang, 'قیمت ورود معتبر نیست', 'Invalid entry price')
                    : undefined
                }
                value={entryInput}
                onChange={(e) => setEntryInput(e.target.value)}
              />
            )}

            <MaterialInput
              type="number"
              step="any"
              ltrNum
              label={t(lang, 'حد ضرر (Stop Loss)', 'Stop Loss')}
              error={
                Number(slInput) <= 0 || Number(slInput) === Number(entryInput)
                  ? t(lang, 'حد ضرر نمی‌تواند برابر نقطه ورود باشد', 'Stop loss must differ from entry')
                  : undefined
              }
              value={slInput}
              onChange={(e) => setSlInput(e.target.value)}
            />

            <MaterialInput
              type="number"
              step="any"
              ltrNum
              label={t(lang, 'حد سود (Take Profit)', 'Take Profit')}
              warning={
                sizing.isValid && sizing.rrRatio < 1
                  ? t(lang, 'نسبت R:R کمتر از ۱ است', 'R:R is below 1.0')
                  : undefined
              }
              value={tpInput}
              onChange={(e) => setTpInput(e.target.value)}
            />
          </div>

          {/* Right Live Sizing Output */}
          <div className="lg:col-span-5 p-5 rounded-2xl glass-tile flex flex-col justify-between gap-4">
            {!sizing.isValid ? (
              <div className="flex-1 flex items-center justify-center text-center text-xs text-[var(--ft-danger)] p-4">
                {lang === 'fa' ? sizing.errorFa : sizing.errorEn}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-[var(--ft-text-muted)]">
                      {t(lang, 'حجم پیشنهادی (Recommended Lots)', 'Recommended Volume')}
                    </div>
                    <div className="font-num text-3xl font-extrabold text-[var(--ft-accent)] mt-1">
                      {sizing.recommendedLots} Lots
                    </div>
                    <div className="text-[11px] font-num text-[var(--ft-text-muted)] mt-1">
                      {t(lang, 'فاصله SL:', 'SL Dist:')} {sizing.slDistance} ·{' '}
                      {t(lang, 'فاصله TP:', 'TP Dist:')} {sizing.tpDistance}
                    </div>
                  </div>
                  <RadialGauge
                    pct={Math.min(100, Math.round((sizing.rrRatio / 4) * 100))}
                    label="R:R"
                    sublabel={`1:${sizing.rrRatio}`}
                    color={sizing.rrRatio >= 2 ? 'var(--ft-positive)' : 'var(--ft-warning)'}
                    gradientTo="var(--ft-accent)"
                    size={90}
                    strokeWidth={8}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--ft-border)]">
                  <div>
                    <div className="text-[11px] text-[var(--ft-text-muted)]">
                      {t(lang, 'ریسک دلاری مجاز', 'Risk Amount')}
                    </div>
                    <div className="font-num text-sm font-bold text-[var(--ft-danger)]">
                      {isPrivate ? PRIVATE_MASK : `-$${sizing.riskAmountUsd}`}
                    </div>
                    <div className="font-num text-[10px] text-[var(--ft-text-muted)]">
                      {formatMoney(
                        Math.round(sizing.riskAmountUsd * state.settings.usdToman),
                        'IRT',
                        lang,
                        true,
                        isPrivate
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--ft-text-muted)]">
                      {t(lang, 'سود هدف در TP', 'Projected Reward')}
                    </div>
                    <div className="font-num text-sm font-bold text-[var(--ft-positive)]">
                      {isPrivate ? PRIVATE_MASK : `+$${sizing.projectedRewardUsd}`}
                    </div>
                    <div className="font-num text-[10px] text-[var(--ft-text-muted)]">
                      {formatMoney(
                        Math.round(sizing.projectedRewardUsd * state.settings.usdToman),
                        'IRT',
                        lang,
                        true,
                        isPrivate
                      )}
                    </div>
                  </div>
                </div>

                {ddStatus.breached && (
                  <div className="text-[11px] text-[var(--ft-danger)] font-medium pt-2 border-t border-[var(--ft-border)]">
                    {t(
                      lang,
                      'توجه: سپر افت سرمایه امروز فعال شده؛ باز کردن معامله جدید با ریسک تخطی همراه است.',
                      'Warning: daily drawdown circuit breaker is active for today.'
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* 3. Real CSV / MT5 History Importer */}
      <section className="glass-surface rounded-3xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[var(--ft-accent)]" />
            <div>
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                {t(lang, 'ورود تاریخچه CSV', 'CSV Trade History Importer')}
              </h3>
              <p className="text-xs text-[var(--ft-text-muted)]">
                {t(
                  lang,
                  'پشتیبانی از خروجی CSV بروکرها، MT5 و FundTrack با تشخیص خودکار ستون‌ها و حذف تکراری‌ها',
                  'Supports broker CSV, MT5 history exports, and FundTrack CSV with duplicate-ticket protection'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="px-3.5 py-2 text-xs font-medium rounded-xl glass-surface-control hover:border-[var(--ft-accent)] cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t(lang, 'دانلود فایل نمونه CSV', 'Sample CSV')}</span>
            </button>
            <label className="px-4 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              <span>{t(lang, 'انتخاب فایل CSV', 'Choose CSV File')}</span>
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleCsvFile}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-[var(--ft-text-muted)]">
            {t(lang, 'اتصال معاملات واردشده به حساب:', 'Target MT5 Account:')}
          </span>
          <div className="w-64">
            <GlassSelect<string>
              size="sm"
              value={csvAccountId}
              onChange={setCsvAccountId}
              ariaLabel="Target account for CSV"
              options={state.mt5Accounts.map((a) => ({
                value: a.id,
                label: `${a.broker} (#${maskText(a.accountNumber, isPrivate)})`,
              }))}
            />
          </div>
        </div>

        {csvPreview && csvPreview.rows.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl glass-tile text-xs">
              <div className="font-num flex flex-wrap items-center gap-4">
                <span className="font-semibold text-[var(--ft-text-primary)]">{csvFileName}</span>
                <span className="text-[var(--ft-positive)]">
                  {csvPreview.newTradesCount} {t(lang, 'معامله جدید', 'new trades')}
                </span>
                <span className="text-[var(--ft-warning)]">
                  {csvPreview.duplicateCount} {t(lang, 'تکراری', 'duplicates')}
                </span>
                {csvPreview.skippedCount > 0 && (
                  <span className="text-[var(--ft-text-muted)]">
                    {csvPreview.skippedCount} {t(lang, 'ردیف غیرمعامله', 'skipped')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCsvPreview(null);
                    setCsvFileName('');
                  }}
                  className="px-3 py-1.5 text-xs rounded-xl border border-[var(--ft-border)] cursor-pointer"
                >
                  {t(lang, 'انصراف', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleCommitCsv}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {t(
                      lang,
                      `افزودن ${csvPreview.newTradesCount} معامله به ژورنال`,
                      `Import ${csvPreview.newTradesCount} Trades`
                    )}
                  </span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--ft-text-muted)] border-b border-[var(--ft-border)]">
                    <th className="py-2 text-start font-medium">{t(lang, 'تیکت', 'Ticket')}</th>
                    <th className="py-2 text-start font-medium">{t(lang, 'نماد / جهت', 'Symbol')}</th>
                    <th className="py-2 text-start font-medium">{t(lang, 'حجم', 'Vol')}</th>
                    <th className="py-2 text-start font-medium">{t(lang, 'زمان بسته شدن', 'Close Time')}</th>
                    <th className="py-2 text-end font-medium">{t(lang, 'سود/زیان', 'P&L')}</th>
                    <th className="py-2 text-end font-medium">{t(lang, 'وضعیت', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ft-border)]">
                  {csvPreview.rows.slice(0, 8).map(({ trade, isDuplicate }) => (
                    <tr key={trade.id} className={isDuplicate ? 'opacity-50' : ''}>
                      <td className="py-2 font-num">#{maskText(trade.ticket, isPrivate)}</td>
                      <td className="py-2 font-num font-semibold">
                        {trade.symbol} · {trade.direction}
                      </td>
                      <td className="py-2 font-num">{trade.volume}</td>
                      <td className="py-2 font-num text-[var(--ft-text-muted)]">
                        {formatJalaliDateTime(trade.closeTime, lang)}
                      </td>
                      <td
                        className={`py-2 text-end font-num font-semibold ${
                          trade.profitUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                        }`}
                      >
                        {formatUsdInline(trade.profitUsd, isPrivate)}
                      </td>
                      <td className="py-2 text-end">
                        <span
                          className={
                            isDuplicate ? 'text-[var(--ft-warning)]' : 'text-[var(--ft-positive)]'
                          }
                        >
                          {isDuplicate ? t(lang, 'تکراری', 'Duplicate') : t(lang, 'جدید', 'Ready')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-2xl glass-tile text-center text-xs text-[var(--ft-text-muted)]">
            {t(
              lang,
              'یک فایل CSV از تاریخچه بروکر خود انتخاب کنید یا فایل نمونه را دانلود و آزمایش کنید.',
              'Upload a broker CSV export or download the sample CSV template to preview rows before importing.'
            )}
          </div>
        )}
      </section>
    </div>
  );
};
