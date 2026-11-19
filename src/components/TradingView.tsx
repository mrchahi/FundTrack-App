import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  BellRing,
  Calendar,
  Clock,
  Download,
  FileUp,
  FolderSync,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { playNewsAlarmSound } from '../utils/soundAlert';
import {
  AppLanguage,
  EconomicEvent,
  EmotionTag,
  FundTrackState,
  PersianCalendarHoliday,
  SystemSettings,
  TimeRange,
  Trade,
  TradeJournalFilter,
  TradingSubTab,
} from '../types';
import {
  computeTradingKpis,
  filterTradesByRange,
  formatMoney,
  formatUsdInline,
  maskText,
  PERSIAN_WEEKDAYS_ORDER,
  PRIVATE_MASK,
} from '../utils/domain';
import {
  getTradeDurationBucketLabel,
  getTradePersianWeekdayAndHour,
} from '../utils/intelligence';
import { formatJalaliDate, formatJalaliDateTime, toJalali } from '../utils/jalali';
import { t } from '../i18n/translations';
import {
  BipolarVerticalBarChart,
  DurationBucketsChart,
  EquityAreaChart,
  HourlyPerformanceChart,
  ProfitLossStackedBarChart,
  RadialGauge,
  TradeWinRateDensityHeatmap,
} from './Charts';
import { GlassSelect, GlassSwitch } from './GlassControls';
import { MaterialInput } from './MaterialInputs';
import { M3AccordionCard, M3SnapCarousel } from './M3MobilePrimitives';
import { TradingRiskAndImportSection } from './TradingRiskAndImportSection';

const QUICK_EMOTION_PILLS: Array<{ id: EmotionTag; fa: string; en: string }> = [
  { id: 'calm', fa: 'آرام', en: 'Calm' },
  { id: 'focused', fa: 'مطمئن', en: 'Focused' },
  { id: 'hesitant', fa: 'تردید', en: 'Hesitant' },
  { id: 'fomo', fa: 'FOMO', en: 'FOMO' },
  { id: 'revenge', fa: 'انتقامی', en: 'Revenge' },
];

interface TradingViewProps {
  state: FundTrackState;
  subTab: TradingSubTab;
  setSubTab: (tab: TradingSubTab) => void;
  range: TimeRange;
  onInspectTrade: (trade: Trade) => void;
  onUpdateTradeReview?: (
    tradeId: string,
    patch: Partial<Pick<Trade, 'setupTag' | 'emotionTag' | 'slRespected' | 'reviewNote'>>
  ) => void;
  onSyncMt5: () => void;
  onImportEventsJsonl: (text: string) => void;
  onSyncLocalEaFile: (customPath?: string) => Promise<void>;
  onDeleteMt5Account: (id: string) => void;
  onImportCsvTrades: (trades: Trade[]) => void;
  onUpdateSettings: (patch: Partial<SystemSettings>) => void;
  onToggleNewsAlarm: (eventId: string) => void;
  onTriggerNewsAlarm: (eventId: string) => void;
  onImportEconomicEvents: (events: EconomicEvent[]) => void;
  onRefreshEconomicNews?: () => Promise<void> | void;
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const TradingView: React.FC<TradingViewProps> = ({
  state,
  subTab,
  setSubTab,
  range,
  onInspectTrade,
  onUpdateTradeReview,
  onSyncMt5,
  onImportEventsJsonl,
  onSyncLocalEaFile,
  onDeleteMt5Account,
  onImportCsvTrades,
  onUpdateSettings,
  onToggleNewsAlarm,
  onTriggerNewsAlarm,
  onImportEconomicEvents,
  onRefreshEconomicNews,
  onShowToast,
}) => {
  const lang: AppLanguage = state.settings.language;
  const isPrivate = Boolean(state.settings.privateMode);
  const [eaPathInput, setEaPathInput] = useState(state.settings.eaFilePath ?? '');
  const [eaSyncingLocal, setEaSyncingLocal] = useState(false);
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [equityMode, setEquityMode] = useState<'equity' | 'pnl'>('equity');
  const [sessionTab, setSessionTab] = useState<'sessions' | 'weekdays'>('sessions');
  const [distributionMode, setDistributionMode] = useState<'payoff' | 'side' | 'symbol'>('payoff');

  // Journal filters + Analytics click-to-drill-down filter
  const [searchQuery, setSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [sessionFilter, setSessionFilter] = useState<'ALL' | 'London' | 'New York' | 'Asia'>('ALL');
  const [drillFilter, setDrillFilter] = useState<TradeJournalFilter>({});
  const [sortBy, setSortBy] = useState<'date' | 'profit' | 'r'>('date');
  const [sortAsc, setSortAsc] = useState(false);

  const applyDrillFilter = (next: TradeJournalFilter) => {
    setDrillFilter(next);
    setSubTab('journal');
  };

  const hasDrillFilter =
    drillFilter.emotion !== undefined ||
    drillFilter.setupTag !== undefined ||
    drillFilter.weekday !== undefined ||
    drillFilter.hour !== undefined ||
    drillFilter.durationBucket !== undefined;

  // News & Persian Calendar Holidays
  const [newsSubView, setNewsSubView] = useState<'events' | 'holidays'>('events');
  const [iranHolidays, setIranHolidays] = useState<PersianCalendarHoliday[]>([]);
  const [holidaySource, setHolidaySource] = useState<string>('loading');

  const currentJalaliYear = toJalali(new Date()).jy;

  useEffect(() => {
    let active = true;
    fetch(`/api/persian-calendar/holidays/${currentJalaliYear}`)
      .then((res) => res.json())
      .then((payload) => {
        if (!active) return;
        const list = Array.isArray(payload.holidays) ? payload.holidays : [];
        setIranHolidays(list.slice(0, 14));
        setHolidaySource(payload.source || 'persian-calendar.ir');
      })
      .catch(() => {
        if (active) setHolidaySource('offline');
      });
    return () => {
      active = false;
    };
  }, [currentJalaliYear]);

  const rangedTrades = useMemo(() => filterTradesByRange(state.trades, range), [state.trades, range]);

  const rangeLabel =
    range === 'today'
      ? t(lang, 'امروز', 'Today')
      : range === 'week'
      ? t(lang, '۷ روز اخیر', 'Last 7 Days')
      : range === 'month'
      ? t(lang, '۳۰ روز اخیر', 'Last 30 Days')
      : t(lang, 'کل دوره', 'All Time');

  const filteredTrades = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = rangedTrades.filter((tr) => {
      if (directionFilter !== 'ALL' && tr.direction !== directionFilter) return false;
      if (sessionFilter !== 'ALL' && tr.session !== sessionFilter) return false;
      if (drillFilter.emotion && tr.emotionTag !== drillFilter.emotion) return false;
      if (drillFilter.setupTag && tr.setupTag !== drillFilter.setupTag) return false;
      if (drillFilter.durationBucket && getTradeDurationBucketLabel(tr) !== drillFilter.durationBucket) {
        return false;
      }
      if (drillFilter.weekday !== undefined || drillFilter.hour !== undefined) {
        const { weekday, hour } = getTradePersianWeekdayAndHour(tr);
        if (drillFilter.weekday !== undefined && weekday !== drillFilter.weekday) return false;
        if (drillFilter.hour !== undefined && hour !== drillFilter.hour) return false;
      }
      if (q) {
        const hay = `${tr.symbol} ${tr.ticket} ${tr.setupTag} ${tr.reviewNote}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'date') {
        diff = new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime();
      } else if (sortBy === 'profit') {
        diff = a.profitUsd - b.profitUsd;
      } else {
        diff = a.rMultiple - b.rMultiple;
      }
      return sortAsc ? diff : -diff;
    });

    return list;
  }, [rangedTrades, searchQuery, directionFilter, sessionFilter, drillFilter, sortBy, sortAsc]);

  const liveMt5Accounts = useMemo(
    () => state.mt5Accounts.filter((a) => !a.isDemo),
    [state.mt5Accounts]
  );
  const equitySourceAccounts = liveMt5Accounts.length > 0 ? liveMt5Accounts : state.mt5Accounts;
  const currentAccountEquity = useMemo(
    () => equitySourceAccounts.reduce((s, a) => s + (a.equity || a.balance), 0),
    [equitySourceAccounts]
  );

  const kpis = useMemo(
    () =>
      computeTradingKpis(rangedTrades, {
        currentEquityUsd: equitySourceAccounts.length > 0 ? currentAccountEquity : 10000,
        groupByDay: range !== 'today',
        lang,
      }),
    [rangedTrades, equitySourceAccounts.length, currentAccountEquity, range, lang]
  );

  const sessionStats = useMemo(() => {
    return (['London', 'New York', 'Asia'] as const).map((sess) => {
      const list = rangedTrades.filter((tr) => tr.session === sess);
      const count = list.length;
      const wins = list.filter((tr) => tr.profitUsd > 0).length;
      const net = Number(list.reduce((s, tr) => s + tr.profitUsd, 0).toFixed(2));
      const avgR = count > 0 ? Number((list.reduce((s, tr) => s + tr.rMultiple, 0) / count).toFixed(2)) : 0;
      const winRate = count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0;
      return { session: sess, count, wins, winRate, net, avgR };
    });
  }, [rangedTrades]);

  const rDistributionBuckets = useMemo(() => {
    const defs = [
      { key: '-r3', label: '< -1.5R', check: (r: number) => r < -1.5 },
      { key: '-r2', label: '-1.5..-0.5R', check: (r: number) => r >= -1.5 && r < -0.5 },
      { key: '-r1', label: '-0.5..0R', check: (r: number) => r >= -0.5 && r < 0 },
      { key: '+r1', label: '0..+1R', check: (r: number) => r >= 0 && r < 1 },
      { key: '+r2', label: '+1..+2R', check: (r: number) => r >= 1 && r < 2 },
      { key: '+r3', label: '> +2R', check: (r: number) => r >= 2 },
    ];
    return defs.map((d) => {
      const grp = rangedTrades.filter((tr) => d.check(tr.rMultiple));
      const net = Number(grp.reduce((s, tr) => s + tr.profitUsd, 0).toFixed(2));
      const pct = rangedTrades.length > 0 ? Math.round((grp.length / rangedTrades.length) * 100) : 0;
      return {
        key: d.key,
        label: d.label,
        value: grp.length,
        count: grp.length,
        formattedValue: `${grp.length}`,
        subText: `${pct}% · ${isPrivate ? '••••' : `${net >= 0 ? '+' : '-'}$${Math.abs(Math.round(net))}`}`,
      };
    });
  }, [rangedTrades, isPrivate]);

  const uniqueSymbols = useMemo(() => {
    return Array.from(new Set(rangedTrades.map((tr) => tr.symbol)));
  }, [rangedTrades]);

  const handleExportCsv = () => {
    const headers = [
      'Ticket',
      'Symbol',
      'Direction',
      'Volume',
      'OpenTime',
      'CloseTime',
      'OpenPrice',
      'ClosePrice',
      'ProfitUSD',
      'CommissionUSD',
      'SwapUSD',
      'RMultiple',
      'Session',
      'SetupTag',
      'ReviewNote',
    ];
    const rows = filteredTrades.map((tr) => [
      tr.ticket,
      tr.symbol,
      tr.direction,
      tr.volume,
      tr.openTime,
      tr.closeTime,
      tr.openPrice,
      tr.closePrice,
      tr.profitUsd,
      tr.commissionUsd ?? 0,
      tr.swapUsd ?? 0,
      tr.rMultiple,
      tr.session,
      `"${tr.setupTag.replace(/"/g, '""')}"`,
      `"${tr.reviewNote.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fundtrack-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onShowToast(t(lang, 'فایل CSV ژورنال صادر شد', 'Journal CSV exported'), 'success');
  };

  const handleJsonlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportEventsJsonl(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleNewsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = String(reader.result || '');
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : [];
        const normalized: EconomicEvent[] = arr
          .filter((item) => item && item.title)
          .map((item, idx) => ({
            id: `ev_imp_${Date.now()}_${idx}`,
            title: String(item.title),
            currency: String(item.currency || 'USD'),
            impact: (['low', 'medium', 'high', 'normal'].includes(item.impact)
              ? item.impact
              : 'medium') as EconomicEvent['impact'],
            timestamp: String(item.timestamp || new Date(Date.now() + 3600000).toISOString()),
            forecast: String(item.forecast || '—'),
            actual: String(item.actual || '—'),
            previous: String(item.previous || '—'),
            alarmEnabled: Boolean(item.alarmEnabled),
            alarmTriggered: false,
          }));
        if (normalized.length === 0) {
          onShowToast(t(lang, 'رویداد معتبری در فایل یافت نشد', 'No valid events found in file'), 'error');
          return;
        }
        onImportEconomicEvents(normalized);
      } catch {
        onShowToast(t(lang, 'فرمت JSON فایل رویدادها نامعتبر است', 'Invalid JSON format'), 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const formatCountdown = (iso: string) => {
    const diffMs = new Date(iso).getTime() - Date.now();
    if (diffMs <= 0) return t(lang, 'منتشر شده', 'Released');
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Material Design 3 Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-2xl glass-surface overflow-x-auto no-scrollbar max-w-full flex-nowrap">
          {(
            [
              ['journal', t(lang, 'ژورنال', 'Journal')],
              ['analytics', t(lang, 'آنالیز', 'Analytics')],
              ['risk', t(lang, 'ریسک', 'Risk')],
              ['accounts', t(lang, 'حساب‌ها', 'MT5')],
              ['calendar', t(lang, 'اخبار', 'News')],
            ] as Array<[TradingSubTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === id
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--ft-text-muted)] font-num px-3 py-1.5 rounded-xl glass-surface">
          <span>{t(lang, 'بازه:', 'Period:')}</span>
          <strong className="text-[var(--ft-accent)]">{rangeLabel}</strong>
          <span>· {rangedTrades.length} {t(lang, 'معامله', 'trades')}</span>
        </div>
      </div>

      {/* 1. Journal Sub-tab */}
      {subTab === 'journal' && (
        <div className="space-y-5">
          {state.eaPositions && state.eaPositions.length > 0 && (
            <section className="glass-surface rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-[var(--ft-border)]">
                <h3 className="text-sm font-semibold text-[var(--ft-text-primary)] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[var(--ft-accent)]" />
                  <span>{t(lang, 'پوزیشن‌های باز لحظه‌ای (MT5)', 'Live Open Positions (MT5)')}</span>
                </h3>
                <span className="font-num text-xs font-semibold text-[var(--ft-accent)]">
                  {state.eaPositions.length} {t(lang, 'پوزیشن باز', 'open')}
                </span>
              </div>
              {/* Mobile Cards (< sm) */}
              <div className="sm:hidden space-y-2">
                {state.eaPositions.map((pos) => (
                  <div key={`mob_pos_${pos.ticket}`} className="p-3 rounded-2xl glass-tile space-y-1.5 font-num text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-[var(--ft-text-primary)]">{pos.symbol}</span>{' '}
                        <span className={pos.side === 'BUY' ? 'text-[var(--ft-positive)] font-bold' : 'text-[var(--ft-danger)] font-bold'}>
                          {pos.side}
                        </span>{' '}
                        <span className="text-[var(--ft-text-muted)]">· {pos.volume}</span>
                      </div>
                      <span className={`font-bold ${pos.profit >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'}`}>
                        {formatUsdInline(pos.profit, isPrivate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--ft-text-muted)]">
                      <span>#{maskText(pos.ticket, isPrivate)} · @ {pos.openPrice}</span>
                      <span>SL/TP: {pos.sl || '—'} / {pos.tp || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--ft-text-muted)] border-b border-[var(--ft-border)]">
                      <th className="py-2 text-start">{t(lang, 'تیکت / نماد', 'Ticket / Symbol')}</th>
                      <th className="py-2 text-start">{t(lang, 'جهت / لات', 'Side / Vol')}</th>
                      <th className="py-2 text-start">{t(lang, 'قیمت ورود', 'Entry')}</th>
                      <th className="py-2 text-start">SL / TP</th>
                      <th className="py-2 text-end">{t(lang, 'سود/زیان لحظه‌ای', 'Floating P&L')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ft-border)] font-num">
                    {state.eaPositions.map((pos) => (
                      <tr key={pos.ticket}>
                        <td className="py-2">
                          <span className="font-semibold text-[var(--ft-text-primary)]">{pos.symbol}</span>{' '}
                          <span className="text-[var(--ft-text-muted)]">#{maskText(pos.ticket, isPrivate)}</span>
                        </td>
                        <td className="py-2">
                          <span className={pos.side === 'BUY' ? 'text-[var(--ft-positive)] font-bold' : 'text-[var(--ft-danger)] font-bold'}>
                            {pos.side}
                          </span>{' '}
                          · {pos.volume}
                        </td>
                        <td className="py-2 text-[var(--ft-text-primary)]">{pos.openPrice}</td>
                        <td className="py-2 text-[var(--ft-text-muted)]">
                          {pos.sl || '—'} / {pos.tp || '—'}
                        </td>
                        <td
                          className={`py-2 text-end font-bold ${
                            pos.profit >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                          }`}
                        >
                          {formatUsdInline(pos.profit, isPrivate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        <section className="glass-surface rounded-3xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
            <div className="flex-1 max-w-md">
              <MaterialInput
                type="text"
                fieldSize="sm"
                startIcon={<Search className="w-4 h-4" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(lang, 'جستجوی نماد، تیکت، ستاپ یا یادداشت...', 'Search symbol, ticket, setup...')}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <GlassSelect<'ALL' | 'BUY' | 'SELL'>
                size="sm"
                value={directionFilter}
                onChange={setDirectionFilter}
                ariaLabel="Side filter"
                options={[
                  { value: 'ALL', label: t(lang, 'همه جهت‌ها', 'All Sides') },
                  { value: 'BUY', label: 'BUY' },
                  { value: 'SELL', label: 'SELL' },
                ]}
              />

              <GlassSelect<'ALL' | 'London' | 'New York' | 'Asia'>
                size="sm"
                value={sessionFilter}
                onChange={setSessionFilter}
                ariaLabel="Session filter"
                options={[
                  { value: 'ALL', label: t(lang, 'همه سشن‌ها', 'All Sessions') },
                  { value: 'London', label: 'London' },
                  { value: 'New York', label: 'New York' },
                  { value: 'Asia', label: 'Asia' },
                ]}
              />

              <GlassSelect<'date' | 'profit' | 'r'>
                size="sm"
                value={sortBy}
                onChange={setSortBy}
                ariaLabel="Sort trades"
                options={[
                  { value: 'date', label: t(lang, 'مرتب‌سازی: زمان', 'Sort: Date') },
                  { value: 'profit', label: t(lang, 'مرتب‌سازی: سود', 'Sort: Profit') },
                  { value: 'r', label: t(lang, 'مرتب‌سازی: ضریب R', 'Sort: R') },
                ]}
              />

              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="px-3 py-1.5 text-xs rounded-xl glass-surface-control hover:bg-[var(--ft-surface-hover)] cursor-pointer"
              >
                {sortAsc ? '↑' : '↓'}
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3.5 py-2 text-xs font-medium rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t(lang, 'خروجی CSV', 'Export CSV')}</span>
              </button>
            </div>
          </div>

          {hasDrillFilter && (
            <div className="p-3 rounded-2xl glass-tile flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-[var(--ft-text-primary)]">
                <span className="font-semibold text-[var(--ft-accent)]">
                  {t(lang, 'فیلتر تحلیلی فعال:', 'Active Analytics Filter:')}
                </span>
                {drillFilter.emotion && (
                  <span className="font-num">
                    {t(lang, 'احساس:', 'Emotion:')} <strong>{drillFilter.emotion}</strong>
                  </span>
                )}
                {drillFilter.setupTag && (
                  <span className="font-num">
                    {t(lang, 'ستاپ:', 'Setup:')} <strong>{drillFilter.setupTag}</strong>
                  </span>
                )}
                {drillFilter.durationBucket && (
                  <span className="font-num">
                    {t(lang, 'مدت:', 'Hold:')} <strong>{drillFilter.durationBucket}</strong>
                  </span>
                )}
                {drillFilter.weekday !== undefined && (
                  <span className="font-num">
                    <strong>{PERSIAN_WEEKDAYS_ORDER[drillFilter.weekday]}</strong>
                    {drillFilter.hour !== undefined
                      ? ` · ${String(drillFilter.hour).padStart(2, '0')}:00`
                      : ''}
                  </span>
                )}
                <span className="font-num text-[var(--ft-text-muted)]">
                  ({filteredTrades.length} {t(lang, 'معامله', 'trades')})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrillFilter({})}
                className="px-2.5 py-1 rounded-lg border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t(lang, 'پاک کردن فیلتر', 'Clear Filter')}</span>
              </button>
            </div>
          )}

          {/* Mobile Trade Cards (< sm) with Quick 1-Tap Emotion & SL Review Controls */}
          <div className="sm:hidden space-y-2.5">
            {filteredTrades.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'معامله‌ای مطابق با فیلترها یافت نشد.', 'No trades match the active filters.')}
              </div>
            ) : (
              filteredTrades.map((tr) => {
                const holdMins = Math.max(
                  1,
                  Math.round((new Date(tr.closeTime).getTime() - new Date(tr.openTime).getTime()) / 60000)
                );
                const holdStr =
                  holdMins >= 60 ? `${Math.floor(holdMins / 60)}h ${holdMins % 60}m` : `${holdMins}m`;
                const fees = Number(((tr.commissionUsd ?? 0) + (tr.swapUsd ?? 0)).toFixed(2));
                return (
                  <div
                    key={`mob_tr_${tr.id}`}
                    onClick={() => onInspectTrade(tr)}
                    className="p-3.5 rounded-2xl glass-tile hover:bg-[var(--ft-surface-hover)] transition-colors cursor-pointer space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-num">
                          <span className="text-sm font-bold text-[var(--ft-text-primary)]">{tr.symbol}</span>
                          <span
                            className={`text-xs font-semibold ${
                              tr.direction === 'BUY' ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                            }`}
                          >
                            {tr.direction} · {tr.volume}
                          </span>
                        </div>
                        <div className="text-[11px] font-num text-[var(--ft-text-muted)] truncate">
                          #{maskText(tr.ticket, isPrivate)} · {tr.session} · {formatJalaliDateTime(tr.closeTime, lang)}
                        </div>
                      </div>
                      <div className="text-end font-num shrink-0">
                        <div
                          className={`text-sm font-bold ${
                            tr.profitUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                          }`}
                        >
                          {formatUsdInline(tr.profitUsd, isPrivate)}
                        </div>
                        <div className="text-[11px] text-[var(--ft-text-muted)]">
                          {tr.rMultiple >= 0 ? '+' : ''}
                          {tr.rMultiple}R
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)] text-[11px]">
                      <div className="min-w-0 truncate text-[var(--ft-text-secondary)]">
                        <strong className="text-[var(--ft-text-primary)]">{tr.setupTag}</strong>
                        {tr.reviewNote ? ` · ${tr.reviewNote}` : ''}
                      </div>
                      <div className="font-num text-[var(--ft-text-muted)] shrink-0">
                        {holdStr} {fees !== 0 ? `· ${formatUsdInline(fees, isPrivate)}` : ''}
                      </div>
                    </div>

                    {/* Quick 1-Tap Emotion & SL Strip */}
                    {onUpdateTradeReview && (
                      <div
                        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onUpdateTradeReview(tr.id, { slRespected: !tr.slRespected })}
                          className={`min-h-[30px] px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 shrink-0 border cursor-pointer transition-colors ${
                            tr.slRespected
                              ? 'bg-[var(--ft-positive-soft)] border-[var(--ft-positive)]/35 text-[var(--ft-positive)]'
                              : 'bg-[var(--ft-danger-soft)] border-[var(--ft-danger)]/35 text-[var(--ft-danger)]'
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>{tr.slRespected ? 'SL ✓' : 'SL ✕'}</span>
                        </button>
                        {QUICK_EMOTION_PILLS.map((em) => {
                          const isSelected = tr.emotionTag === em.id;
                          const isRisky = em.id === 'fomo' || em.id === 'revenge';
                          return (
                            <button
                              key={em.id}
                              type="button"
                              onClick={() => {
                                onUpdateTradeReview(tr.id, { emotionTag: em.id });
                                onShowToast(
                                  t(lang, `احساس «${em.fa}» ثبت شد`, `Emotion tagged: ${em.en}`),
                                  'info'
                                );
                              }}
                              className={`min-h-[30px] px-2.5 rounded-lg text-[10px] font-medium shrink-0 border transition-colors cursor-pointer ${
                                isSelected
                                  ? isRisky
                                    ? 'bg-[var(--ft-danger-soft)] border-[var(--ft-danger)] text-[var(--ft-danger)] font-bold'
                                    : 'ft-accent-gradient border-transparent font-bold'
                                  : 'border-[var(--ft-border)] text-[var(--ft-text-muted)] hover:text-[var(--ft-text-primary)]'
                              }`}
                            >
                              {lang === 'fa' ? em.fa : em.en}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Trade Table (>= sm) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--ft-text-muted)] border-b border-[var(--ft-border)]">
                  <th className="py-2.5 text-start font-medium">{t(lang, 'نماد / تیکت', 'Symbol / Ticket')}</th>
                  <th className="py-2.5 text-start font-medium">{t(lang, 'جهت / حجم', 'Side / Lot')}</th>
                  <th className="py-2.5 text-start font-medium">{t(lang, 'ستاپ و یادداشت', 'Setup & Review')}</th>
                  <th className="py-2.5 text-start font-medium">{t(lang, 'مدت و هزینه', 'Duration & Fee')}</th>
                  <th className="py-2.5 text-end font-medium">{t(lang, 'R / سود ($)', 'R / P&L')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ft-border)]">
                {filteredTrades.map((tr) => {
                  const holdMins = Math.max(
                    1,
                    Math.round((new Date(tr.closeTime).getTime() - new Date(tr.openTime).getTime()) / 60000)
                  );
                  const holdStr =
                    holdMins >= 60 ? `${Math.floor(holdMins / 60)}h ${holdMins % 60}m` : `${holdMins}m`;
                  const fees = Number(((tr.commissionUsd ?? 0) + (tr.swapUsd ?? 0)).toFixed(2));
                  return (
                  <tr
                    key={tr.id}
                    onClick={() => onInspectTrade(tr)}
                    className="hover:bg-[var(--ft-surface-hover)] transition-colors cursor-pointer"
                  >
                    <td className="py-3">
                      <div className="font-num font-semibold text-[var(--ft-text-primary)]">{tr.symbol}</div>
                      <div className="font-num text-xs text-[var(--ft-text-muted)]">
                        #{maskText(tr.ticket, isPrivate)} · {formatJalaliDateTime(tr.closeTime, lang)}
                      </div>
                    </td>
                    <td className="py-3">
                      <div
                        className={`font-num text-xs font-semibold ${
                          tr.direction === 'BUY' ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                        }`}
                      >
                        {tr.direction} · {tr.volume}
                      </div>
                      <div className="text-xs text-[var(--ft-text-muted)]">{tr.session}</div>
                    </td>
                    <td className="py-3 max-w-xs">
                      <div className="text-xs font-medium text-[var(--ft-text-primary)] truncate">
                        {tr.setupTag}
                      </div>
                      <div className="text-xs text-[var(--ft-text-muted)] truncate">
                        {tr.reviewNote || t(lang, 'کلیک برای ثبت بازبینی...', 'Click to add review...')}
                      </div>
                    </td>
                    <td className="py-3 font-num">
                      <div className="text-xs font-medium text-[var(--ft-text-primary)]">{holdStr}</div>
                      <div className="text-[11px] text-[var(--ft-text-muted)]">
                        {fees === 0 ? '—' : formatUsdInline(fees, isPrivate)}
                      </div>
                    </td>
                    <td className="py-3 text-end">
                      <div
                        className={`font-num font-semibold ${
                          tr.profitUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                        }`}
                      >
                        {formatUsdInline(tr.profitUsd, isPrivate)}
                      </div>
                      <div className="font-num text-xs text-[var(--ft-text-muted)]">
                        {tr.rMultiple >= 0 ? '+' : ''}
                        {tr.rMultiple}R
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        </div>
      )}

      {/* 2. Analytics Sub-tab (M3 Mobile Chart Carousel + Collapsible Deep-Dive Accordions) */}
      {subTab === 'analytics' && (() => {
        const equityCurveCard = (
          <section className="glass-surface rounded-3xl p-4 sm:p-6 flex flex-col justify-between gap-4 h-full">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'منحنی رشد سرمایه', 'Equity Curve')}
                </h3>
                <div className="font-num text-xs text-[var(--ft-text-muted)] mt-0.5 flex flex-wrap items-center gap-2">
                  <strong className="text-[var(--ft-accent)]">{rangeLabel}</strong>
                  <span>· {kpis.tradeCount} {t(lang, 'معامله', 'trades')}</span>
                  {kpis.equityCurve.length >= 2 && (
                    <span>
                      · {equityMode === 'equity'
                        ? `${t(lang, 'اکوئیتی', 'Eq')}: ${formatMoney(
                            kpis.equityCurve[0].equity,
                            'USD',
                            lang,
                            false,
                            isPrivate
                          )} ← ${formatMoney(
                            kpis.equityCurve[kpis.equityCurve.length - 1].equity,
                            'USD',
                            lang,
                            false,
                            isPrivate
                          )} · Max DD: ${isPrivate ? PRIVATE_MASK : `-$${kpis.maxDrawdownUsd}`}`
                        : `${t(lang, 'خالص دوره', 'Net')}: ${formatUsdInline(kpis.netProfitUsd, isPrivate)} · ${kpis.winCount}W / ${kpis.lossCount}L`}
                    </span>
                  )}
                </div>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
                <button
                  type="button"
                  onClick={() => setEquityMode('equity')}
                  className={`px-3 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                    equityMode === 'equity'
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                  }`}
                >
                  {t(lang, 'اکوئیتی حساب ($)', 'Account Equity ($)')}
                </button>
                <button
                  type="button"
                  onClick={() => setEquityMode('pnl')}
                  className={`px-3 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                    equityMode === 'pnl'
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                  }`}
                >
                  {t(lang, 'سود و زیان دوره‌ای ($)', 'Period P&L ($)')}
                </button>
              </div>
            </div>
            <EquityAreaChart points={kpis.equityCurve} mode={equityMode} privateMode={isPrivate} />
          </section>
        );

        const performanceGaugesCard = (
          <section className="glass-surface rounded-3xl p-4 sm:p-6 flex flex-col justify-between gap-5 h-full">
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
              {t(lang, 'شاخص‌های کلیدی عملکرد', 'Performance Gauges')}
            </h3>
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <div className="p-2 rounded-2xl glass-tile flex items-center justify-center">
                <RadialGauge
                  pct={kpis.winRate}
                  label={t(lang, 'نرخ برد', 'Win Rate')}
                  sublabel={`${kpis.winCount}W/${kpis.lossCount}L`}
                  color="var(--ft-positive)"
                  gradientTo="var(--ft-accent)"
                  size={84}
                  strokeWidth={8}
                />
              </div>
              <div className="p-2 rounded-2xl glass-tile flex items-center justify-center">
                <RadialGauge
                  pct={Math.min(100, (kpis.profitFactor / 3) * 100)}
                  centerText={
                    kpis.profitFactor >= 9.99 && kpis.grossLossUsd === 0
                      ? '∞'
                      : kpis.profitFactor.toFixed(2)
                  }
                  label={t(lang, 'ضریب سود (PF)', 'Profit Factor')}
                  sublabel={
                    isPrivate
                      ? '•• / ••'
                      : `+$${Math.round(kpis.grossProfitUsd)} / -$${Math.round(kpis.grossLossUsd)}`
                  }
                  color={
                    kpis.profitFactor >= 1.5
                      ? 'var(--ft-positive)'
                      : kpis.profitFactor >= 1
                      ? 'var(--ft-accent)'
                      : 'var(--ft-danger)'
                  }
                  gradientTo="var(--ft-accent)"
                  size={84}
                  strokeWidth={8}
                />
              </div>
              <div className="p-2 rounded-2xl glass-tile flex items-center justify-center">
                <RadialGauge
                  pct={kpis.tradeCount ? (kpis.buyCount / kpis.tradeCount) * 100 : 50}
                  label={t(lang, 'سهم خرید', 'Long %')}
                  sublabel={`${kpis.buyCount}B/${kpis.sellCount}S`}
                  color="var(--ft-warning)"
                  gradientTo="var(--ft-accent)"
                  size={84}
                  strokeWidth={8}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {kpis.sideBreakdown.map((sb) => (
                <div key={sb.side} className="p-3 rounded-2xl glass-tile">
                  <div className="flex items-center justify-between font-num">
                    <span className={sb.side === 'BUY' ? 'text-[var(--ft-positive)] font-bold' : 'text-[var(--ft-danger)] font-bold'}>
                      {sb.side} ({sb.trades})
                    </span>
                    <span>{sb.winRate}%</span>
                  </div>
                  <div className="font-num text-sm font-bold mt-1 text-[var(--ft-text-primary)]">
                    {formatUsdInline(sb.net, isPrivate)} · {sb.avgR}R
                  </div>
                </div>
              ))}
            </div>
          </section>
        );

        const sessionPerformanceCard = (
          <section className="glass-surface rounded-3xl p-4 sm:p-6 flex flex-col justify-between gap-4 h-full">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {sessionTab === 'sessions'
                    ? t(lang, 'عملکرد سشن‌های معاملاتی', 'Session Performance')
                    : t(lang, 'عملکرد روزهای هفته', 'Weekday Performance')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                  {sessionTab === 'sessions'
                    ? t(lang, 'مقایسه مجزای سشن لندن، نیویورک و آسیا', 'Dedicated London, New York & Asia session breakdown')
                    : t(lang, 'توزیع سود و نرخ برد در روزهای هفته', 'Net P&L and win rate by day of week')}
                </p>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
                <button
                  type="button"
                  onClick={() => setSessionTab('sessions')}
                  className={`px-3 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                    sessionTab === 'sessions'
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                  }`}
                >
                  {t(lang, 'سشن‌ها', 'Sessions')}
                </button>
                <button
                  type="button"
                  onClick={() => setSessionTab('weekdays')}
                  className={`px-3 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                    sessionTab === 'weekdays'
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                  }`}
                >
                  {t(lang, 'روزهای هفته', 'Weekdays')}
                </button>
              </div>
            </div>

            {sessionTab === 'sessions' ? (
              <div className="space-y-3">
                {(() => {
                  const maxSessAbs = Math.max(1, ...sessionStats.map((s) => Math.abs(s.net)));
                  return sessionStats.map((st) => {
                    const pct = Math.max(6, Math.round((Math.abs(st.net) / maxSessAbs) * 100));
                    const pos = st.net >= 0;
                    const sessFa =
                      st.session === 'London'
                        ? 'سشن لندن (London)'
                        : st.session === 'New York'
                        ? 'سشن نیویورک (New York)'
                        : 'سشن آسیا (Asia)';
                    return (
                      <div key={st.session} className="p-3.5 rounded-2xl glass-tile space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--ft-text-primary)]">
                              {lang === 'fa' ? sessFa : `${st.session} Session`}
                            </span>
                            <span className="font-num text-[11px] text-[var(--ft-text-muted)]">
                              {st.count} {t(lang, 'معامله', 'tr')} · {st.winRate}% WR · {st.avgR >= 0 ? '+' : ''}
                              {st.avgR}R
                            </span>
                          </div>
                          <span
                            className={`font-num text-sm font-bold ${
                              pos ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                            }`}
                          >
                            {formatUsdInline(st.net, isPrivate)}
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${st.count === 0 ? 0 : pct}%`,
                              background: pos
                                ? 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))'
                                : 'linear-gradient(90deg, var(--ft-danger), var(--ft-warning))',
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <BipolarVerticalBarChart
                items={kpis.weekdayBreakdown.map((wb) => ({
                  key: wb.day,
                  label: wb.day,
                  value: wb.profit,
                  count: wb.count,
                  winRate: wb.winRate,
                  formattedValue: isPrivate
                    ? '••••'
                    : `${wb.profit >= 0 ? '+' : '-'}$${Math.abs(Math.round(wb.profit))}`,
                }))}
                height={195}
                emptyText={t(lang, 'دیتایی برای روزهای هفته ثبت نشده است', 'No weekday data')}
              />
            )}
          </section>
        );

        const payoffDistributionCard = (
          <section className="glass-surface rounded-3xl p-4 sm:p-6 flex flex-col justify-between gap-4 h-full">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {distributionMode === 'payoff'
                    ? t(lang, 'توزیع بازده معاملات (R-Multiple)', 'Payoff Distribution (R)')
                    : distributionMode === 'side'
                    ? t(lang, 'سود و زیان به تفکیک جهت معامله', 'Profit vs Loss by Side')
                    : t(lang, 'مقایسه سود و زیان به تفکیک نماد', 'Profit vs Loss by Symbol')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                  {distributionMode === 'payoff'
                    ? t(lang, 'تعداد معاملات در هر بازه ریسک به ریوارد', 'Trade frequency across R-multiple brackets')
                    : distributionMode === 'side'
                    ? t(lang, 'مقایسه سود ناخالص و زیان ناخالص در خرید و فروش', 'Gross profit vs gross loss across BUY & SELL')
                    : t(lang, 'عملکرد تجمیعی به تفکیک نمادها', 'Gross profit vs gross loss across symbols')}
                </p>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
                <button
                  type="button"
                  onClick={() => setDistributionMode('payoff')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                    distributionMode === 'payoff'
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                  }`}
                >
                  {t(lang, 'توزیع R', 'R-Dist')}
                </button>
                <button
                  type="button"
                  onClick={() => setDistributionMode('side')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                    distributionMode === 'side'
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                  }`}
                >
                  BUY / SELL
                </button>
                {uniqueSymbols.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDistributionMode('symbol')}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                      distributionMode === 'symbol'
                        ? 'ft-accent-gradient font-semibold'
                        : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                    }`}
                  >
                    {t(lang, 'نمادها', 'Symbols')}
                  </button>
                )}
              </div>
            </div>

            {distributionMode === 'payoff' ? (
              <BipolarVerticalBarChart
                items={rDistributionBuckets}
                mode="positive-count"
                height={195}
                emptyText={t(lang, 'معامله‌ای برای توزیع بازده موجود نیست', 'No trades for payoff distribution')}
              />
            ) : distributionMode === 'side' ? (
              <ProfitLossStackedBarChart
                data={(['BUY', 'SELL'] as const).map((side) => {
                  const grp = rangedTrades.filter((tr) => tr.direction === side);
                  const p = grp.filter((tr) => tr.profitUsd > 0).reduce((s, tr) => s + tr.profitUsd, 0);
                  const l = grp.filter((tr) => tr.profitUsd < 0).reduce((s, tr) => s + Math.abs(tr.profitUsd), 0);
                  return {
                    label: `${side} (${grp.length})`,
                    primaryValue: Number(p.toFixed(2)),
                    secondaryValue: Number(l.toFixed(2)),
                    primaryFormatted: formatMoney(p, 'USD', lang, false, isPrivate),
                    secondaryFormatted: formatMoney(l, 'USD', lang, false, isPrivate),
                  };
                })}
                primaryLabel={t(lang, 'سود ناخالص', 'Gross Profit')}
                secondaryLabel={t(lang, 'زیان ناخالص', 'Gross Loss')}
                height={200}
              />
            ) : (
              <ProfitLossStackedBarChart
                data={Array.from(
                  rangedTrades.reduce((map, tr) => {
                    const cur = map.get(tr.symbol) ?? { p: 0, l: 0 };
                    if (tr.profitUsd >= 0) cur.p += tr.profitUsd;
                    else cur.l += Math.abs(tr.profitUsd);
                    map.set(tr.symbol, cur);
                    return map;
                  }, new Map<string, { p: number; l: number }>())
                ).map(([label, val]) => ({
                  label,
                  primaryValue: Number(val.p.toFixed(2)),
                  secondaryValue: Number(val.l.toFixed(2)),
                  primaryFormatted: formatMoney(val.p, 'USD', lang, false, isPrivate),
                  secondaryFormatted: formatMoney(val.l, 'USD', lang, false, isPrivate),
                }))}
                primaryLabel={t(lang, 'سود ناخالص', 'Gross Profit')}
                secondaryLabel={t(lang, 'زیان ناخالص', 'Gross Loss')}
                height={200}
              />
            )}
          </section>
        );

        return (
        <div className="space-y-5 sm:space-y-6">
          {/* Quantitative Raw-Trade Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-[var(--ft-text-muted)]">
                {t(lang, 'امید ریاضی معامله', 'Expectancy / Trade')}
              </div>
              <div
                className={`font-num text-lg sm:text-xl font-extrabold ${
                  kpis.expectancyUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                }`}
              >
                {formatUsdInline(kpis.expectancyUsd, isPrivate)}
              </div>
              <div className="font-num text-[11px] text-[var(--ft-text-muted)]">
                PF {kpis.profitFactor} · {kpis.avgR}R
              </div>
              <div
                className="h-1 rounded-full"
                style={{
                  background:
                    kpis.expectancyUsd >= 0
                      ? 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))'
                      : 'linear-gradient(90deg, var(--ft-danger), var(--ft-warning))',
                }}
              />
            </div>

            <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-[var(--ft-text-muted)]">
                {t(lang, 'میانگین سود / زیان', 'Avg Win / Avg Loss')}
              </div>
              <div className="font-num text-base font-bold text-[var(--ft-positive)]">
                {formatUsdInline(kpis.avgWinUsd, isPrivate)}
              </div>
              <div className="font-num text-xs font-semibold text-[var(--ft-danger)]">
                {formatUsdInline(-kpis.avgLossUsd, isPrivate)}
              </div>
              <div
                className="h-1 rounded-full"
                style={{ background: 'linear-gradient(90deg, var(--ft-positive), var(--ft-danger))' }}
              />
            </div>

            <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-[var(--ft-text-muted)]">
                {t(lang, 'نوار برد و باخت', 'Win / Loss Streaks')}
              </div>
              <div className="font-num text-lg sm:text-xl font-extrabold text-[var(--ft-text-primary)]">
                <span className="text-[var(--ft-positive)]">{kpis.maxWinStreak}W</span>
                {' · '}
                <span className="text-[var(--ft-danger)]">{kpis.maxLossStreak}L</span>
              </div>
              <div className="font-num text-[11px] text-[var(--ft-text-muted)]">
                Max DD: {isPrivate ? PRIVATE_MASK : `$${kpis.maxDrawdownUsd}`}
              </div>
              <div className="h-1 rounded-full" style={{ background: 'var(--ft-accent-grad)' }} />
            </div>

            <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-[var(--ft-text-muted)]">
                {t(lang, 'مدت نگهداری معامله', 'Hold Duration')}
              </div>
              <div className="font-num text-lg sm:text-xl font-extrabold text-[var(--ft-accent)]">
                {kpis.medianDurationMin}m
              </div>
              <div className="font-num text-[11px] text-[var(--ft-text-muted)]">
                Avg: {kpis.avgDurationMin}m
              </div>
              <div className="h-1 rounded-full" style={{ background: 'var(--ft-accent-grad)' }} />
            </div>

            <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-[var(--ft-text-muted)]">
                {t(lang, 'کمیسیون و سواپ', 'Commission & Swap')}
              </div>
              <div className="font-num text-base font-bold text-[var(--ft-warning)]">
                Comm: {isPrivate ? PRIVATE_MASK : `$${kpis.totalCommissionUsd}`}
              </div>
              <div className="font-num text-xs text-[var(--ft-text-muted)]">
                Swap: {isPrivate ? PRIVATE_MASK : `$${kpis.totalSwapUsd}`}
              </div>
              <div
                className="h-1 rounded-full"
                style={{ background: 'linear-gradient(90deg, var(--ft-warning), var(--ft-danger))' }}
              />
            </div>

            <div className="glass-surface rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-[var(--ft-text-muted)]">
                {t(lang, 'بهترین و بدترین', 'Best / Worst Trade')}
              </div>
              <div className="font-num text-base font-bold text-[var(--ft-positive)]">
                {formatUsdInline(kpis.bestTradeUsd, isPrivate)}
              </div>
              <div className="font-num text-xs font-semibold text-[var(--ft-danger)]">
                {formatUsdInline(kpis.worstTradeUsd, isPrivate)}
              </div>
              <div
                className="h-1 rounded-full"
                style={{ background: 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))' }}
              />
            </div>
          </div>

          {/* Mobile Primary Charts Snap Carousel (< md) */}
          <div className="md:hidden">
            <M3SnapCarousel
              showTabs
              showDots
              ariaLabel={t(lang, 'کاروسل نمودارهای ترید', 'Trading Charts Carousel')}
              items={[
                { id: 'equity', label: t(lang, 'منحنی سرمایه', 'Equity'), content: equityCurveCard },
                { id: 'gauges', label: t(lang, 'شاخص عملکرد', 'Gauges'), content: performanceGaugesCard },
                { id: 'sessions', label: t(lang, 'سشن‌ها', 'Sessions'), content: sessionPerformanceCard },
                { id: 'payoff', label: t(lang, 'توزیع R', 'R-Dist'), content: payoffDistributionCard },
              ]}
            />
          </div>

          {/* Desktop Primary Charts Bento Grid (>= md) */}
          <div className="hidden md:block space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7">{equityCurveCard}</div>
              <div className="lg:col-span-5">{performanceGaugesCard}</div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-6">{sessionPerformanceCard}</div>
              <div className="lg:col-span-6">{payoffDistributionCard}</div>
            </div>
          </div>

          {/* Accordion 1: Hour x Weekday Density Heatmap */}
          <M3AccordionCard
            title={t(lang, 'نقشه چگالی ساعت و روز هفته', 'Hour × Weekday Performance')}
            summaryText={`${t(lang, 'بهترین روز:', 'Best Day:')} ${kpis.bestDayLabel} (${formatUsdInline(kpis.bestDayProfitUsd, isPrivate)}) · ${kpis.heatmapCells.length} ${t(lang, 'پنجره فعال', 'windows')}`}
            icon={<BarChart3 className="w-4 h-4" />}
            defaultOpenMobile={false}
            defaultOpenDesktop={true}
          >
            <div className="space-y-4 pt-2">
              <p className="text-xs text-[var(--ft-text-muted)]">
                {t(
                  lang,
                  'بین حالت نرخ برد و سود/زیان دلاری سوئیچ کنید؛ کلیک روی هر خانه معاملات همان ساعت را در ژورنال باز می‌کند',
                  'Switch between Win Rate and Net P&L modes; click any cell to filter matching trades in Journal'
                )}
              </p>
              <TradeWinRateDensityHeatmap
                cells={kpis.heatmapCells}
                weekdays={PERSIAN_WEEKDAYS_ORDER}
                privateMode={isPrivate}
                emptyText={t(lang, 'معامله‌ای برای رسم نقشه چگالی موجود نیست', 'No trades available for density heatmap')}
                onSelectCell={(cell) =>
                  applyDrillFilter({ weekday: cell.weekday, hour: cell.hour })
                }
                labels={{
                  allHours: t(lang, 'ماتریس ۲۴ ساعته', '24h Full Grid'),
                  activeHours: t(lang, 'ساعات فعال', 'Active Hours'),
                  modeWinRate: t(lang, 'حالت: نرخ برد', 'Mode: Win Rate'),
                  modePnl: t(lang, 'حالت: سود و زیان ($)', 'Mode: Net P&L ($)'),
                  winRate: t(lang, 'نرخ برد', 'Win Rate'),
                  trades: t(lang, 'تعداد', 'Trades'),
                  netPnl: t(lang, 'سود/زیان خالص', 'Net P&L'),
                  peakWindow: t(lang, 'بهترین پنجره', 'Peak Window'),
                  hoverHint: t(
                    lang,
                    'روی هر خانه بروید یا کلیک کنید تا معاملات همان ساعت در ژورنال باز شوند',
                    'Hover to inspect or click any cell to filter matching trades in Journal'
                  ),
                  lowDensity: t(lang, '۰٪ باخت', '0% Loss'),
                  highDensity: t(lang, '۱۰۰٪ برد', '100% Win'),
                }}
              />
            </div>
          </M3AccordionCard>

          {/* Accordion 2: Duration Buckets + Hourly Edge */}
          <M3AccordionCard
            title={t(lang, 'تحلیل مدت نگهداری و بازده ساعتی', 'Holding Duration & Hourly Edge')}
            summaryText={`${t(lang, 'میانه نگهداری:', 'Median Hold:')} ${kpis.medianDurationMin}m · ${t(lang, 'میانگین:', 'Avg:')} ${kpis.avgDurationMin}m`}
            icon={<Clock className="w-4 h-4" />}
            defaultOpenMobile={false}
            defaultOpenDesktop={true}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch pt-2">
              <div className="lg:col-span-6 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'بازه مدت نگهداری معامله', 'Holding Duration')}
                  </h4>
                  <p className="text-xs text-[var(--ft-text-muted)]">
                    {t(lang, 'برای مشاهده معاملات هر بازه در ژورنال، روی ردیف کلیک کنید', 'Click any duration bucket to inspect matching trades')}
                  </p>
                </div>
                <DurationBucketsChart
                  buckets={kpis.durationBuckets}
                  privateMode={isPrivate}
                  emptyText={t(lang, 'دیتایی برای تحلیل مدت نگهداری یافت نشد', 'No duration data')}
                  onSelectBucket={(bucket) => applyDrillFilter({ durationBucket: bucket })}
                />
              </div>

              <div className="lg:col-span-6 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'بازده ساعتی معاملات', 'Hourly Edge')}
                  </h4>
                  <p className="text-xs text-[var(--ft-text-muted)]">
                    {t(lang, 'نمای بازه‌ای یا ساعتی به شکل میله‌ای و مساحت', '4h interval or active-hour breakdown in Bar or Area view')}
                  </p>
                </div>
                <HourlyPerformanceChart
                  hourly={kpis.hourlyBreakdown}
                  privateMode={isPrivate}
                  emptyText={t(lang, 'دیتایی برای بازده ساعتی یافت نشد', 'No hourly data')}
                  labels={{
                    intervals: t(lang, 'بازه‌های ۴ ساعته', '4h Intervals'),
                    activeHours: t(lang, 'ساعات فعال', 'Active Hours'),
                    bar: t(lang, 'میله‌ای', 'Bar'),
                    area: t(lang, 'مساحت (Area)', 'Area'),
                    trades: t(lang, 'ترید', 'trades'),
                    winRate: t(lang, 'نرخ برد', 'WR'),
                    hoverHint: t(lang, 'برای جزئیات هر بازه روی نمودار بروید', 'Hover over bars/points to inspect window edge'),
                  }}
                />
              </div>
            </div>
          </M3AccordionCard>

          {/* Accordion 3: Top Best & Worst Trades Leaderboard */}
          <M3AccordionCard
            title={t(lang, 'برترین و پرضررترین معاملات', 'Top Best & Worst Trades')}
            summaryText={`${t(lang, 'بهترین:', 'Best:')} ${formatUsdInline(kpis.bestTradeUsd, isPrivate)} · ${t(lang, 'بدترین:', 'Worst:')} ${formatUsdInline(kpis.worstTradeUsd, isPrivate)}`}
            icon={<Award className="w-4 h-4" />}
            defaultOpenMobile={false}
            defaultOpenDesktop={true}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2.5">
                <h4 className="text-sm font-semibold text-[var(--ft-positive)]">
                  {t(lang, 'برترین معاملات سودده', 'Top Best Trades')}
                </h4>
                <div className="divide-y divide-[var(--ft-border)]">
                  {kpis.topBestTrades.map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => onInspectTrade(tr)}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-start hover:bg-[var(--ft-surface-hover)] px-2 rounded-lg cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-semibold text-[var(--ft-text-primary)] font-num">
                          {tr.symbol} · {tr.direction} · #{maskText(tr.ticket, isPrivate)}
                        </div>
                        <div className="text-[11px] text-[var(--ft-text-muted)]">{tr.setupTag}</div>
                      </div>
                      <div className="text-end font-num">
                        <div className="text-sm font-bold text-[var(--ft-positive)]">
                          {formatUsdInline(tr.profitUsd, isPrivate)}
                        </div>
                        <div className="text-[11px] text-[var(--ft-text-muted)]">+{tr.rMultiple}R</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-sm font-semibold text-[var(--ft-danger)]">
                  {t(lang, 'پرضررترین معاملات', 'Top Worst Trades')}
                </h4>
                <div className="divide-y divide-[var(--ft-border)]">
                  {kpis.topWorstTrades.map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      onClick={() => onInspectTrade(tr)}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-start hover:bg-[var(--ft-surface-hover)] px-2 rounded-lg cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-semibold text-[var(--ft-text-primary)] font-num">
                          {tr.symbol} · {tr.direction} · #{maskText(tr.ticket, isPrivate)}
                        </div>
                        <div className="text-[11px] text-[var(--ft-text-muted)]">{tr.setupTag}</div>
                      </div>
                      <div className="text-end font-num">
                        <div className="text-sm font-bold text-[var(--ft-danger)]">
                          {formatUsdInline(tr.profitUsd, isPrivate)}
                        </div>
                        <div className="text-[11px] text-[var(--ft-text-muted)]">{tr.rMultiple}R</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </M3AccordionCard>

          {/* Accordion 4: Market Technical Radar */}
          {state.eaRadar && Object.keys(state.eaRadar).length > 0 && (
            <M3AccordionCard
              title={t(lang, 'رادار تکنیکال بازار', 'Market Technical Radar')}
              summaryText={`${Object.keys(state.eaRadar).length} ${t(lang, 'تایم‌فریم فعال', 'active timeframes')}`}
              icon={<Activity className="w-4 h-4" />}
              defaultOpenMobile={false}
              defaultOpenDesktop={true}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {['PERIOD_M1', 'PERIOD_M15', 'PERIOD_H1', 'PERIOD_H4']
                  .filter((tf) => Boolean(state.eaRadar?.[tf]))
                  .concat(
                    Object.keys(state.eaRadar).filter(
                      (tf) => !['PERIOD_M1', 'PERIOD_M15', 'PERIOD_H1', 'PERIOD_H4'].includes(tf)
                    )
                  )
                  .map((tfKey) => {
                    const snap = state.eaRadar![tfKey];
                    const bullishEma = snap.ema9 > snap.ema21 && snap.ema21 > snap.ema50;
                    const bearishEma = snap.ema9 < snap.ema21 && snap.ema21 < snap.ema50;
                    return (
                      <div key={tfKey} className="p-4 rounded-2xl glass-tile space-y-3 font-num text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[var(--ft-text-primary)]">
                              {snap.symbol} · {tfKey.replace('PERIOD_', '')}
                            </span>
                            <span
                              className={`text-[11px] font-semibold ${
                                bullishEma
                                  ? 'text-[var(--ft-positive)]'
                                  : bearishEma
                                  ? 'text-[var(--ft-danger)]'
                                  : 'text-[var(--ft-warning)]'
                              }`}
                            >
                              {bullishEma ? 'EMA Bullish' : bearishEma ? 'EMA Bearish' : 'EMA Mixed'}
                            </span>
                          </div>
                          <span className="text-[var(--ft-text-muted)]">
                            Spread: {snap.spread}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <span className="text-[10px] text-[var(--ft-text-muted)] block">Bid / Ask</span>
                            <span className="text-[var(--ft-text-primary)] font-semibold">
                              {snap.bid} / {snap.ask}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--ft-text-muted)] block">RSI (14)</span>
                            <span
                              className={`font-semibold ${
                                snap.rsi >= 70
                                  ? 'text-[var(--ft-danger)]'
                                  : snap.rsi <= 30
                                  ? 'text-[var(--ft-positive)]'
                                  : 'text-[var(--ft-text-primary)]'
                              }`}
                            >
                              {snap.rsi.toFixed(1)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--ft-text-muted)] block">ADX / ATR×</span>
                            <span className="text-[var(--ft-accent)] font-semibold">
                              {snap.adx.toFixed(1)} · {snap.atrRatio.toFixed(2)}x
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--ft-border)] text-[11px] text-[var(--ft-text-muted)]">
                          <span>PP: {snap.pp}</span>
                          <span className="text-[var(--ft-positive)]">R1: {snap.r1}</span>
                          <span className="text-[var(--ft-danger)]">S1: {snap.s1}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </M3AccordionCard>
          )}
        </div>
        );
      })()}

      {/* 2b. Risk, Position Size & CSV Importer Sub-tab */}
      {subTab === 'risk' && (
        <TradingRiskAndImportSection
          state={state}
          onUpdateSettings={onUpdateSettings}
          onImportCsvTrades={onImportCsvTrades}
          onShowToast={onShowToast}
        />
      )}

      {/* 3. MT5 Accounts & Live Event Bridge Sub-tab */}
      {subTab === 'accounts' && (
        <div className="space-y-6">
          <section className="glass-surface rounded-3xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'حساب‌های MT5 و همگام‌سازی فایل رویداد', 'MT5 Accounts & Event File Sync')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                  {t(
                    lang,
                    'اتصال مستقیم و لحظه‌ای به فایل events.jsonl برای ثبت خودکار معاملات و به‌روزرسانی تراز حساب‌ها',
                    'Live events.jsonl bridge for automatic trade ingestion and real-time account accounting'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3.5 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>{t(lang, 'انتخاب فایل events.jsonl', 'Upload events.jsonl')}</span>
                  <input type="file" accept=".jsonl,.txt,.json" onChange={handleJsonlUpload} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={onSyncMt5}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t(lang, 'به‌روزرسانی وضعیت', 'Sync Status')}</span>
                </button>
              </div>
            </div>

            {/* Direct local EA file sync bar (aligned uniform height h-10 input & button) */}
            <div className="p-4 rounded-2xl glass-tile space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label
                  htmlFor="ea-events-path-input"
                  className="md-field-label !text-[var(--ft-text-secondary)]"
                >
                  {t(lang, 'مسیر فایل events.jsonl روی سیستم', 'Local path to events.jsonl')}
                </label>
                <div className="flex items-center gap-2 text-xs text-[var(--ft-text-secondary)]">
                  <span>{t(lang, 'همگام‌سازی لحظه‌ای (۱۰ ثانیه)', 'Live Auto-Sync (10s)')}</span>
                  <GlassSwitch
                    checked={state.settings.eaAutoSync !== false}
                    onChange={(checked) => onUpdateSettings({ eaAutoSync: checked })}
                    ariaLabel={t(lang, 'همگام‌سازی خودکار فایل رویداد', 'Live EA Auto-Sync')}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div
                  className={`md-field-box h-10 flex-1 min-w-0 ${
                    eaPathInput.trim() ? 'md-field-box--filled' : ''
                  }`}
                >
                  <input
                    id="ea-events-path-input"
                    type="text"
                    dir="ltr"
                    value={eaPathInput}
                    onChange={(e) => setEaPathInput(e.target.value)}
                    placeholder="C:\Users\...\MetaQuotes\Terminal\Common\Files\FundTrack\events.jsonl"
                    className="md-input md-input--sm font-num h-full py-0 px-3"
                  />
                </div>
                <button
                  type="button"
                  disabled={eaSyncingLocal}
                  onClick={async () => {
                    setEaSyncingLocal(true);
                    try {
                      await onSyncLocalEaFile(eaPathInput.trim() || undefined);
                    } finally {
                      setEaSyncingLocal(false);
                    }
                  }}
                  className="h-10 px-4 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  <FolderSync className={`w-4 h-4 ${eaSyncingLocal ? 'animate-spin' : ''}`} />
                  <span>
                    {eaSyncingLocal
                      ? t(lang, 'در حال خواندن...', 'Reading...')
                      : t(lang, 'خواندن خودکار فایل', 'Auto-Read File')}
                  </span>
                </button>
              </div>

              <div className="md-helper">
                <span>
                  {t(
                    lang,
                    'اختیاری — پیش‌فرض: پوشه Common/Files/FundTrack متاتریدر',
                    'Optional — defaults to MetaQuotes Common/Files/FundTrack'
                  )}
                </span>
              </div>
            </div>

            {state.eaMeta && (
              <div className="p-3.5 rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <Activity className="w-4 h-4 text-[var(--ft-positive)]" />
                  <span className="font-semibold text-[var(--ft-text-primary)]">
                    {state.eaMeta.name || state.eaMeta.server}
                  </span>
                  <span className="font-num text-[var(--ft-text-muted)]">
                    Login #{maskText(state.eaMeta.login, isPrivate)} · {state.eaMeta.symbol} ({state.eaMeta.period.replace('PERIOD_', '')})
                  </span>
                </div>
                <span className="font-num text-[var(--ft-text-muted)]">
                  {t(lang, 'به‌روزرسانی اکسپرت:', 'EA Meta:')} {formatJalaliDateTime(state.eaMeta.updatedAt, lang)}
                </span>
              </div>
            )}

            {state.mt5Accounts.length === 0 ? (
              <div className="py-10 text-center space-y-2 rounded-2xl glass-tile">
                <p className="text-sm font-medium text-[var(--ft-text-primary)]">
                  {t(lang, 'هنوز حساب MT5 متصل نشده است', 'No MT5 accounts connected yet')}
                </p>
                <p className="text-xs text-[var(--ft-text-muted)]">
                  {t(
                    lang,
                    'فایل events.jsonl خروجی اکسپرت متاتریدر را متصل یا بارگذاری کنید؛ هنگام افزودن حساب نوع واقعی یا دمو یک‌بار تعیین می‌شود.',
                    'Connect or upload your MT5 events.jsonl file; Live vs Demo classification is chosen once when the account is added.'
                  )}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {state.mt5Accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className={`p-5 rounded-2xl bg-[var(--ft-surface-subtle)] border space-y-3.5 ${
                      acc.isDemo ? 'border-[var(--ft-warning)]/50' : 'border-[var(--ft-border)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-[var(--ft-text-primary)] truncate">
                            {acc.broker}
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              acc.isDemo ? 'text-[var(--ft-warning)]' : 'text-[var(--ft-positive)]'
                            }`}
                          >
                            {acc.isDemo
                              ? t(lang, 'حساب دمو (خارج از دارایی کل)', 'Demo (Excluded)')
                              : t(lang, 'حساب واقعی', 'Live Account')}
                          </span>
                        </div>
                        <div className="font-num text-xs text-[var(--ft-text-muted)] mt-0.5">
                          #{maskText(acc.accountNumber, isPrivate)} · {acc.server}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onDeleteMt5Account(acc.id)}
                          title={t(lang, 'حذف حساب MT5', 'Delete MT5 Account')}
                          aria-label={t(lang, 'حذف حساب MT5', 'Delete MT5 Account')}
                          className="p-1.5 rounded-lg border border-[var(--ft-border)] text-[var(--ft-danger)] hover:bg-[var(--ft-danger)]/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[var(--ft-border)]">
                      <div>
                        <div className="text-xs text-[var(--ft-text-muted)]">{t(lang, 'موجودی (Balance)', 'Balance')}</div>
                        <div className="font-num text-lg font-bold text-[var(--ft-text-primary)]">
                          {formatMoney(acc.balance, 'USD', lang, false, isPrivate)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[var(--ft-text-muted)]">{t(lang, 'اکوئیتی (Equity)', 'Equity')}</div>
                        <div className="font-num text-lg font-bold text-[var(--ft-accent)]">
                          {formatMoney(acc.equity, 'USD', lang, false, isPrivate)}
                        </div>
                      </div>
                    </div>

                    {(acc.floatingProfit !== undefined || acc.margin !== undefined || acc.freeMargin !== undefined) && (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--ft-border)] text-xs font-num">
                        <div>
                          <span className="text-[10px] text-[var(--ft-text-muted)] block">
                            {t(lang, 'شناور (Floating)', 'Floating')}
                          </span>
                          <span
                            className={`font-semibold ${
                              (acc.floatingProfit ?? 0) >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                            }`}
                          >
                            {formatUsdInline(acc.floatingProfit ?? 0, isPrivate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--ft-text-muted)] block">Margin</span>
                          <span className="text-[var(--ft-text-primary)]">
                            {formatMoney(acc.margin ?? 0, 'USD', lang, false, isPrivate)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[var(--ft-text-muted)] block">Free Margin</span>
                          <span className="text-[var(--ft-text-primary)]">
                            {formatMoney(acc.freeMargin ?? 0, 'USD', lang, false, isPrivate)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-[var(--ft-text-muted)] pt-2">
                      <span>
                        {t(lang, 'آخرین همگام‌سازی:', 'Last sync:')} {formatJalaliDateTime(acc.lastSyncAt, lang)}
                      </span>
                      <span className="font-num">1 USD = {state.settings.usdToman.toLocaleString('en-US')} T</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 4. News & Persian Calendar Holidays Sub-tab */}
      {subTab === 'calendar' && (
        <section className="glass-surface rounded-3xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--ft-border)]">
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-x-auto no-scrollbar max-w-full flex-nowrap">
              <button
                type="button"
                onClick={() => setNewsSubView('events')}
                className={`min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-xl cursor-pointer whitespace-nowrap shrink-0 ${
                  newsSubView === 'events'
                    ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] font-semibold'
                    : 'text-[var(--ft-text-secondary)]'
                }`}
              >
                {t(lang, 'اخبار', 'Events')}
              </button>
              <button
                type="button"
                onClick={() => setNewsSubView('holidays')}
                className={`min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-xl cursor-pointer whitespace-nowrap shrink-0 ${
                  newsSubView === 'holidays'
                    ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] font-semibold'
                    : 'text-[var(--ft-text-secondary)]'
                }`}
              >
                {t(lang, 'تعطیلات', 'Holidays')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onRefreshEconomicNews && (
                <button
                  type="button"
                  disabled={refreshingNews}
                  onClick={async () => {
                    setRefreshingNews(true);
                    try {
                      await onRefreshEconomicNews();
                    } finally {
                      setRefreshingNews(false);
                    }
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingNews ? 'animate-spin' : ''}`} />
                  <span>
                    {refreshingNews
                      ? t(lang, 'در حال دریافت...', 'Updating...')
                      : t(lang, 'به‌روزرسانی اخبار', 'Refresh News')}
                  </span>
                </button>
              )}

              <label className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                <Upload className="w-3.5 h-3.5" />
                <span>{t(lang, 'ورود JSON', 'Import JSON')}</span>
                <input type="file" accept=".json" onChange={handleNewsFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {newsSubView === 'events' ? (
            <div className="space-y-4">
              {/* Configurable News Notification Lead Time (15m / 30m etc.) & Web Audio Sound Controls */}
              <div className="p-3.5 rounded-2xl glass-tile flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'اعلان اخبار روز قبل از خبر:', 'Notify before today news:')}
                  </span>
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
                    {[5, 10, 15, 30, 60].map((mins) => {
                      const active = (state.settings.newsAlertLeadMinutes ?? 15) === mins;
                      return (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => onUpdateSettings({ newsAlertLeadMinutes: mins })}
                          className={`px-2.5 py-1 rounded-lg font-num text-xs font-medium cursor-pointer transition-colors ${
                            active
                              ? 'ft-accent-gradient font-semibold'
                              : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                          }`}
                        >
                          {mins}m
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        newsAlertSoundEnabled: state.settings.newsAlertSoundEnabled === false,
                      })
                    }
                    className={`min-h-[34px] px-3 py-1 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                      state.settings.newsAlertSoundEnabled !== false
                        ? 'border-[var(--ft-accent)] bg-[var(--ft-accent-soft)] text-[var(--ft-accent)]'
                        : 'border-[var(--ft-border)] text-[var(--ft-text-muted)]'
                    }`}
                  >
                    {state.settings.newsAlertSoundEnabled !== false ? (
                      <Volume2 className="w-3.5 h-3.5" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {state.settings.newsAlertSoundEnabled !== false
                        ? t(lang, 'صدا روشن', 'Sound On')
                        : t(lang, 'صدا خاموش', 'Muted')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const ok = playNewsAlarmSound();
                      onShowToast(
                        ok
                          ? t(lang, 'صدای هشدار خبر پخش شد', 'News alert chime played')
                          : t(lang, 'مرورگر دسترسی صدا را مسدود کرد', 'Audio blocked by browser'),
                        ok ? 'info' : 'error'
                      );
                    }}
                    className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer"
                  >
                    {t(lang, 'تست صدا', 'Test Sound')}
                  </button>
                </div>
              </div>

              <div className="divide-y divide-[var(--ft-border)]">
              {state.economicEvents.map((ev) => {
                const evDate = new Date(ev.timestamp);
                const nowDate = new Date();
                const isTodayEv =
                  !Number.isNaN(evDate.getTime()) &&
                  evDate.getFullYear() === nowDate.getFullYear() &&
                  evDate.getMonth() === nowDate.getMonth() &&
                  evDate.getDate() === nowDate.getDate();
                return (
                <div key={ev.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isTodayEv && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] text-[10px] font-semibold">
                          {t(lang, 'امروز (در اعلان)', 'Today (Alerted)')}
                        </span>
                      )}
                      <span className="font-num text-xs font-semibold text-[var(--ft-accent)]">
                        {ev.currency}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          ev.impact === 'high'
                            ? 'text-[var(--ft-danger)]'
                            : ev.impact === 'medium'
                            ? 'text-[var(--ft-warning)]'
                            : 'text-[var(--ft-text-muted)]'
                        }`}
                      >
                        · {ev.impact === 'high' ? t(lang, 'تأثیر زیاد', 'High Impact') : ev.impact === 'medium' ? t(lang, 'تأثیر متوسط', 'Medium') : t(lang, 'تأثیر کم', 'Low')}
                      </span>
                      <span className="font-num text-xs text-[var(--ft-text-muted)]">
                        · {formatCountdown(ev.timestamp)}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-[var(--ft-text-primary)]">{ev.title}</div>
                    <div className="font-num text-xs text-[var(--ft-text-muted)]">
                      {formatJalaliDateTime(ev.timestamp, lang)} · Forecast: {ev.forecast} · Actual: {ev.actual} · Prev: {ev.previous}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleNewsAlarm(ev.id)}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border cursor-pointer flex items-center gap-1.5 ${
                        ev.alarmEnabled
                          ? 'border-[var(--ft-accent)] bg-[var(--ft-accent-soft)] text-[var(--ft-accent)]'
                          : 'border-[var(--ft-border)] text-[var(--ft-text-secondary)]'
                      }`}
                    >
                      {ev.alarmEnabled ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                      <span>{ev.alarmEnabled ? t(lang, 'زنگ فعال', 'Alarm On') : t(lang, 'تنظیم زنگ', 'Set Alarm')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onTriggerNewsAlarm(ev.id)}
                      className="px-3 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] hover:bg-[var(--ft-surface-hover)] cursor-pointer"
                    >
                      {t(lang, 'تست آلارم', 'Test Ring')}
                    </button>
                  </div>
                </div>
                );
              })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'تعطیلات بازارهای جهانی', 'Global Market Holidays')}
                </h4>
                <div className="divide-y divide-[var(--ft-border)]">
                  {state.marketHolidays.map((h) => (
                    <div key={h.id} className="py-3 space-y-0.5">
                      <div className="text-sm font-medium text-[var(--ft-text-primary)]">{h.title}</div>
                      <div className="text-xs text-[var(--ft-text-muted)] font-num">
                        {h.market} · {formatJalaliDate(h.date, lang)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[var(--ft-text-primary)] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[var(--ft-accent)]" />
                    <span>{t(lang, `تعطیلات رسمی ایران (${currentJalaliYear})`, `Iran Official Holidays (${currentJalaliYear})`)}</span>
                  </h4>
                  <span className="text-xs text-[var(--ft-text-muted)] font-num">{holidaySource}</span>
                </div>
                <div className="divide-y divide-[var(--ft-border)] max-h-80 overflow-y-auto pe-1">
                  {iranHolidays.map((ih, idx) => (
                    <div key={`${ih.month}-${ih.day}-${idx}`} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="text-xs text-[var(--ft-text-primary)]">{ih.title}</span>
                      <span className="font-num text-xs text-[var(--ft-danger)] shrink-0">
                        {ih.year}/{String(ih.month).padStart(2, '0')}/{String(ih.day).padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
