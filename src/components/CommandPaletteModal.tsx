import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  CandlestickChart,
  Command,
  CreditCard,
  FileText,
  Landmark,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Target,
  Users,
  X,
} from 'lucide-react';
import { AppLanguage, FundTrackState, MainCategory, Trade } from '../types';
import { formatMoney, formatUsdInline } from '../utils/domain';
import { formatJalaliDate, formatJalaliDateTime, formatJalaliShort } from '../utils/jalali';
import { t } from '../i18n/translations';

interface CommandItem {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  keywords: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteModalProps {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  state: FundTrackState;
  onNavigate: (cat: MainCategory, sub?: string) => void;
  onInspectTrade: (trade: Trade) => void;
  onOpenQuickAction: () => void;
  onOpenAiCommand?: () => void;
  onRefreshFx: () => void;
  onToggleLanguage: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  initialQuery,
  onClose,
  state,
  onNavigate,
  onInspectTrade,
  onOpenQuickAction,
  onOpenAiCommand,
  onRefreshFx,
  onToggleLanguage,
}) => {
  const lang: AppLanguage = state.settings.language;
  const isPrivate = Boolean(state.settings.privateMode);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery ?? '');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open, initialQuery]);

  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Navigation Shortcuts
      {
        id: 'nav_overview',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'نمای کلی و داشبورد لحظه‌ای', 'Overview Pulse'),
        subtitle: t(lang, 'خلاصه کل سرمایه، نمودار سود/زیان و فعالیت‌ها', 'Net worth, P&L chart & activity feed'),
        keywords: 'overview pulse dashboard home نمای کلی داشبورد',
        icon: <LayoutDashboard className="w-4 h-4 text-[var(--ft-accent)]" />,
        run: () => onNavigate('overview', 'pulse'),
      },
      {
        id: 'nav_digest',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'کارنامه دوره‌ای و گزارش PDF', 'Periodic Digest & Print Report'),
        subtitle: t(lang, 'گزارش هفتگی/ماهانه ترید و مالی', 'Weekly/monthly scorecard'),
        keywords: 'digest report pdf print weekly monthly کارنامه گزارش چاپ',
        icon: <FileText className="w-4 h-4 text-[var(--ft-accent)]" />,
        run: () => onNavigate('overview', 'digest'),
      },
      {
        id: 'nav_analytics',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'آنالیز عملکرد سشن‌ها، زمان و رادار بازار', 'Trading Analytics, Sessions & Radar'),
        subtitle: t(lang, 'تحلیل سشن‌ها، بازه ساعتی، توزیع R و رادار تکنیکال', 'Sessions, hourly curve, R distribution & technical radar'),
        keywords: 'analytics session heatmap radar profit factor آنالیز سشن رادار عملکرد',
        icon: <CandlestickChart className="w-4 h-4 text-[var(--ft-positive)]" />,
        run: () => onNavigate('trading', 'analytics'),
      },
      {
        id: 'nav_risk',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'ماشین‌حساب لات‌سایز، ریسک و ورود CSV', 'Risk Calculator & CSV Import'),
        subtitle: t(lang, 'سپر افت سرمایه روزانه و آپلود تاریخچه بروکر', 'Daily drawdown breaker & CSV trade upload'),
        keywords: 'risk calculator lot size drawdown csv import ریسک لات ماشین حساب',
        icon: <Calculator className="w-4 h-4 text-[var(--ft-warning)]" />,
        run: () => onNavigate('trading', 'risk'),
      },
      {
        id: 'nav_planning',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'پیش‌بینی ۳۰ روزه نقدینگی و شبیه‌ساز بدهی', '30d Cashflow Runway & Debt Simulator'),
        subtitle: t(lang, 'صف اولویت بدهی، اقساط و شبیه‌ساز تسویه', 'Cashflow collision chart & what-if debt simulator'),
        keywords: 'cashflow runway debt simulator loan planning نقدینگی بدهی قسط شبیه ساز',
        icon: <CreditCard className="w-4 h-4 text-[var(--ft-danger)]" />,
        run: () => onNavigate('finance', 'planning'),
      },
      {
        id: 'nav_people',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'دفتر حساب اشخاص', 'People Ledger'),
        subtitle: t(lang, 'مانده طلب و بدهی با افراد', 'Receivables & payables ledger'),
        keywords: 'people contact ledger debt اشخاص دفتر طلب بدهی',
        icon: <Users className="w-4 h-4 text-[var(--ft-accent)]" />,
        run: () => onNavigate('finance', 'people'),
      },
      {
        id: 'nav_goals',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'اهداف و مأموریت‌های امتیاز محور', 'Priority Goals & Missions'),
        subtitle: t(lang, 'تخصیص بودجه P1..P5 و ضریب XP', 'Priority-weighted budgets & streaks'),
        keywords: 'goals missions xp badges اهداف ماموریت امتیاز',
        icon: <Target className="w-4 h-4 text-[var(--ft-positive)]" />,
        run: () => onNavigate('growth', 'goals'),
      },
      {
        id: 'nav_assistant',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'صفحه کامل دستیار و تاریخچه گفتگوها', 'Full Assistant Workspace & History'),
        subtitle: t(lang, 'گفتگوی پیوسته، حافظه بلندمدت، ویرایش و تحلیل آماری', 'Multi-thread chat, long-term memory & full panel control'),
        keywords: 'assistant chat copilot history memory دستیار چت تاریخچه حافظه',
        icon: <Sparkles className="w-4 h-4 text-[var(--ft-accent)]" />,
        run: () => onNavigate('assistant'),
      },
      {
        id: 'nav_system',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'تم‌ها، پس‌زمینه شیشه‌ای و پشتیبان‌گیری', 'Themes, Glass Backdrop & Backup'),
        subtitle: t(lang, 'تنظیم پالت رنگی، پین امنیتی و خروجی JSON', 'Theme presets, PIN & JSON backup'),
        keywords: 'system theme appearance backup json pin تم تنظیمات پشتیبان',
        icon: <Settings className="w-4 h-4 text-[var(--ft-text-secondary)]" />,
        run: () => onNavigate('system', 'appearance'),
      },
      {
        id: 'nav_system_ai',
        group: t(lang, 'ناوبری سریع', 'Navigation'),
        title: t(lang, 'تنظیمات دستیار هوشمند (مدل‌ها و API)', 'AI Assistant Models & API Settings'),
        subtitle: t(lang, 'انتخاب Gemini 4 یا Jan لوکال و تست اتصال', 'Switch Gemini 4 or local Jan GGUF & test connection'),
        keywords: 'ai jan gemma gemini gguf settings endpoint model تنظیمات دستیار هوش مصنوعی',
        icon: <Sparkles className="w-4 h-4 text-[var(--ft-accent)]" />,
        run: () => onNavigate('system', 'ai'),
      },
      // Quick Actions
      ...(onOpenAiCommand
        ? [
            {
              id: 'act_ai',
              group: t(lang, 'اقدامات فوری', 'Quick Actions'),
              title: t(lang, 'باز کردن چت‌بات دستیار حسابداری (Ctrl+J)', 'Open Accounting Assistant Chat (Ctrl+J)'),
              subtitle: t(lang, 'ثبت هزینه، خرید قسطی یا قرض از طریق گفتگو و کارت تأیید', 'Chat naturally to parse and confirm transactions'),
              keywords: 'ai chat bot jan gemma natural language command دستیار چت بات گفتگو',
              icon: <Sparkles className="w-4 h-4 text-[var(--ft-accent)]" />,
              run: () => onOpenAiCommand(),
            },
          ]
        : []),
      {
        id: 'act_quick',
        group: t(lang, 'اقدامات فوری', 'Quick Actions'),
        title: t(lang, 'ثبت سریع تراکنش مالی', 'Quick Log Transaction'),
        subtitle: t(lang, 'باز کردن پنجره ثبت واریز/برداشت', 'Open quick financial entry modal'),
        keywords: 'quick action log transaction ثبت سریع تراکنش',
        icon: <Plus className="w-4 h-4 text-[var(--ft-accent)]" />,
        run: () => onOpenQuickAction(),
      },
      {
        id: 'act_fx',
        group: t(lang, 'اقدامات فوری', 'Quick Actions'),
        title: t(lang, 'به‌روزرسانی لحظه‌ای نرخ دلار', 'Refresh Live USD/IRT Rate'),
        subtitle: `1 USD = ${state.settings.usdToman.toLocaleString('en-US')} IRT`,
        keywords: 'fx rate usd toman refresh ارز دلار نرخ',
        icon: <RefreshCw className="w-4 h-4 text-[var(--ft-accent)]" />,
        run: () => onRefreshFx(),
      },
      {
        id: 'act_lang',
        group: t(lang, 'اقدامات فوری', 'Quick Actions'),
        title: t(lang, 'تغییر زبان پنل (فارسی / English)', 'Switch Language (FA / EN)'),
        subtitle: lang === 'fa' ? 'تغییر به English' : 'Switch to فارسی',
        keywords: 'language english persian rtl ltr زبان فارسی انگلیسی',
        icon: <Command className="w-4 h-4 text-[var(--ft-accent)]" />,
        run: () => onToggleLanguage(),
      },
    ];

    // All Journal Trades (newest first, full date + session + setup + note keywords)
    const sessionKw: Record<string, string> = {
      London: 'london لندن',
      'New York': 'new york ny نیویورک',
      Asia: 'asia آسیا توکیو',
    };

    [...state.trades]
      .sort((a, b) => new Date(b.closeTime).getTime() - new Date(a.closeTime).getTime())
      .forEach((tr) => {
        const jShort = formatJalaliShort(tr.closeTime);
        const jDateFa = formatJalaliDate(tr.closeTime, 'fa');
        const jDateTime = formatJalaliDateTime(tr.closeTime, lang);
        const isoDate = tr.closeTime.slice(0, 10);
        const dirKw = tr.direction === 'BUY' ? 'buy خرید لانگ' : 'sell فروش شورت';
        items.push({
          id: `tr_${tr.id}`,
          group: t(lang, 'ژورنال ترید', 'Trade Journal'),
          title: `${tr.symbol} ${tr.direction} · #${tr.ticket} · ${jShort}`,
          subtitle: `${tr.setupTag} · ${tr.session} · ${formatUsdInline(tr.profitUsd, isPrivate)} (${tr.rMultiple}R) · ${jDateTime}`,
          keywords: `${tr.symbol} ${tr.ticket} ${dirKw} ${jShort} ${jDateFa} ${isoDate} ${tr.setupTag} ${
            sessionKw[tr.session] ?? tr.session
          } ${tr.reviewNote} ${tr.profitUsd}`,
          icon: <CandlestickChart className="w-4 h-4 text-[var(--ft-text-secondary)]" />,
          run: () => onInspectTrade(tr),
        });
      });

    // Recent Transactions (searchable by date & note too)
    state.transactions.slice(0, 40).forEach((tx) => {
      const jShort = formatJalaliShort(tx.date);
      const jDateFa = formatJalaliDate(tx.date, 'fa');
      const isoDate = tx.date.slice(0, 10);
      items.push({
        id: `tx_${tx.id}`,
        group: t(lang, 'تراکنش مالی', 'Transaction'),
        title: `${tx.note || t(lang, 'تراکنش', 'Transaction')} · ${jShort}`,
        subtitle: `${formatMoney(tx.amount, tx.currency, lang, false, isPrivate)} · ${formatJalaliDateTime(tx.date, lang)}`,
        keywords: `${tx.note} ${tx.currency} ${tx.type} ${jShort} ${jDateFa} ${isoDate} ${tx.amount}`,
        icon: <CreditCard className="w-4 h-4 text-[var(--ft-text-secondary)]" />,
        run: () => onNavigate('finance', 'transactions'),
      });
    });

    // Live Bank Accounts
    state.bankAccounts.forEach((acc) => {
      items.push({
        id: `acc_${acc.id}`,
        group: t(lang, 'حساب‌های مالی', 'Accounts'),
        title: acc.name,
        subtitle: formatMoney(acc.balance, acc.currency, lang, false, isPrivate),
        keywords: `${acc.name} ${acc.currency} ${acc.note}`,
        icon: <Landmark className="w-4 h-4 text-[var(--ft-text-secondary)]" />,
        run: () => onNavigate('finance', 'accounts'),
      });
    });

    // Live People
    state.people.forEach((p) => {
      items.push({
        id: `person_${p.id}`,
        group: t(lang, 'اشخاص', 'People'),
        title: p.name,
        subtitle: p.note || p.role,
        keywords: `${p.name} ${p.role} ${p.note} ${p.phone ?? ''}`,
        icon: <Users className="w-4 h-4 text-[var(--ft-text-secondary)]" />,
        run: () => onNavigate('finance', 'people'),
      });
    });

    // Live Goals
    state.goals.forEach((g) => {
      items.push({
        id: `goal_${g.id}`,
        group: t(lang, 'اهداف', 'Goals'),
        title: `P${g.priority} · ${g.title}`,
        subtitle: `${formatMoney(g.savedAmount, g.currency, lang, true, isPrivate)} / ${formatMoney(
          g.targetAmount,
          g.currency,
          lang,
          true,
          isPrivate
        )}`,
        keywords: `${g.title} goal priority P${g.priority}`,
        icon: <Target className="w-4 h-4 text-[var(--ft-positive)]" />,
        run: () => onNavigate('growth', 'goals'),
      });
    });

    return items;
  }, [
    state,
    lang,
    isPrivate,
    onNavigate,
    onInspectTrade,
    onOpenQuickAction,
    onOpenAiCommand,
    onRefreshFx,
    onToggleLanguage,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 14);
    const terms = q.split(/\s+/).filter(Boolean);
    return allItems
      .filter((item) => {
        const hay = `${item.title} ${item.subtitle} ${item.keywords} ${item.group}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
      })
      .slice(0, 24);
  }, [allItems, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      filtered[activeIndex].run();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-sm flex items-start justify-center pt-[12vh] p-4 no-print"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={t(lang, 'پالت دستورات و جستجوی سراسری', 'Command Palette')}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl rounded-3xl glass-dropdown overflow-hidden"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--ft-border)]">
          <Search className="w-4 h-4 text-[var(--ft-accent)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              lang,
              'جستجوی نماد، تاریخ (1405/08/25)، ستاپ، احساس، تیکت یا شخص... (Ctrl+K)',
              'Search symbol, date, setup, emotion, ticket, person... (Ctrl+K)'
            )}
            className="flex-1 bg-transparent text-sm text-[var(--ft-text-primary)] placeholder:text-[var(--ft-text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Result List */}
        <div className="max-h-[56vh] overflow-y-auto divide-y divide-[var(--ft-border)]">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--ft-text-muted)]">
              {t(lang, 'نتیجه‌ای با این عبارت پیدا نشد.', 'No matching commands or records found.')}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const selected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                  className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-start transition-colors cursor-pointer ${
                    selected ? 'bg-[var(--ft-accent-soft)]' : 'hover:bg-[var(--ft-surface-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="p-2 rounded-xl glass-tile shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                        {item.group} · {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--ft-text-muted)] shrink-0" />
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2.5 border-t border-[var(--ft-border)] bg-[var(--ft-surface-subtle)] flex items-center justify-between text-[11px] text-[var(--ft-text-muted)] font-num">
          <span>↑↓ {t(lang, 'جابه‌جایی', 'Navigate')} · Enter {t(lang, 'اجرا', 'Open')}</span>
          <span>Esc {t(lang, 'بستن', 'Close')}</span>
        </div>
      </div>
    </div>
  );
};
