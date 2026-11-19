import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  CandlestickChart,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  LayoutDashboard,
  Lock,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Target,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  AssistantActionPayload,
  AssistantMemoryItem,
  AssistantThread,
  BankAccount,
  CreditLine,
  CurrencyCode,
  CustomMission,
  EconomicEvent,
  FinanceSubTab,
  FundTrackState,
  Goal,
  GrowthSubTab,
  LoanItem,
  MainCategory,
  NotificationItem,
  OverviewSubTab,
  PaymentMethod,
  PersonContact,
  PersonLedgerEntry,
  SystemSubTab,
  TimeRange,
  Trade,
  TradingSubTab,
  Transaction,
} from './types';
import { createEmptyState, INITIAL_STATE } from './data/seed';
import {
  computeDebtPayoffPlan,
  computeFinanceSummary,
  computePriorityGoalAllocations,
  convertCurrency,
  evaluateGamification,
  formatMoney,
  getTodayKey,
  parseEventsJsonl,
} from './utils/domain';
import {
  addJalaliMonths,
  formatJalaliDate,
  getCurrentJalaliMonthKey,
  getJalaliWeekdayName,
  getNextJalaliDayOccurrence,
  toJalali,
  toLocalIsoDate,
} from './utils/jalali';
import { CATEGORY_LABELS, t } from './i18n/translations';
import { getBackdropStyle } from './utils/backdrops';
import { OverviewView } from './components/OverviewView';
import { TradingView } from './components/TradingView';
import { FinanceView } from './components/FinanceView';
import { GrowthView } from './components/GrowthView';
import { SystemView } from './components/SystemView';
import { AssistantView } from './components/AssistantView';
import { TradeReviewDrawer } from './components/TradeReviewDrawer';
import { PinLockScreen } from './components/PinLockScreen';
import { GlassSelect } from './components/GlassControls';
import { MaterialInput } from './components/MaterialInputs';
import { HeaderNotificationDropdown } from './components/HeaderNotificationDropdown';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { LocalAiCommandModal } from './components/LocalAiCommandModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { ResponsiveModalSheet } from './components/M3MobilePrimitives';
import { computeDailyDrawdownStatus } from './utils/intelligence';
import { fetchFreeEconomicCalendar, mergeEconomicEvents } from './utils/economicNews';
import { hashPin } from './utils/security';
import { playNewsAlarmSound, unlockAudioContext } from './utils/soundAlert';
import {
  clearMobilePairingHash,
  fetchHostPairingKey,
  fetchLanSyncInfo,
  LanSyncServerInfo,
  parseMobilePairingHash,
  pullStateFromLanDb,
  pushStateToLanDb,
} from './utils/lanSync';

const STORAGE_KEY = 'fundtrack_v2_state';

function hasPersistedLocalStorage(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return true;
    const embedded = (
      window as unknown as { __FUNDTRACK_EMBEDDED_STATE__?: unknown }
    ).__FUNDTRACK_EMBEDDED_STATE__;
    return Boolean(embedded);
  } catch {
    return false;
  }
}

const DesktopLiveClock: React.FC<{ lang: 'fa' | 'en' }> = React.memo(({ lang }) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateLabel =
    lang === 'fa'
      ? `${getJalaliWeekdayName(now)}، ${formatJalaliDate(now, 'fa')}`
      : now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div
      className="hidden lg:flex h-11 px-3.5 rounded-full glass-surface items-center gap-2 text-xs shrink-0"
      title={lang === 'fa' ? 'تاریخ و ساعت زنده (تقویم جلالی)' : 'Live Date & Time'}
    >
      <span className="text-[var(--ft-text-secondary)] font-medium whitespace-nowrap">{dateLabel}</span>
      <span className="w-1 h-1 rounded-full bg-[var(--ft-accent)] opacity-80" />
      <span className="font-num font-bold text-[var(--ft-text-primary)] tabular-nums" dir="ltr">
        {timeStr}
      </span>
    </div>
  );
});

interface ToastMessage {
  id: string;
  text: string;
  tone: 'success' | 'error' | 'info';
}

interface ConfirmDialogState {
  title: string;
  message: string;
  onConfirm: () => void;
}

function loadInitialState(): FundTrackState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const embedded = (
      window as unknown as { __FUNDTRACK_EMBEDDED_STATE__?: Partial<FundTrackState> }
    ).__FUNDTRACK_EMBEDDED_STATE__;
    if (!raw && !embedded) return INITIAL_STATE;
    const parsed = (raw ? JSON.parse(raw) : embedded) as Partial<FundTrackState>;
    const defaultProfiles = INITIAL_STATE.settings.localAi?.profiles ?? [];
    const parsedProfiles = Array.isArray(parsed.settings?.localAi?.profiles)
      ? parsed.settings.localAi.profiles
      : [];
    const mergedProfiles = [...parsedProfiles];
    for (const def of defaultProfiles) {
      if (!mergedProfiles.some((p) => p.id === def.id)) {
        mergedProfiles.push(def);
      }
    }

    return {
      ...INITIAL_STATE,
      ...parsed,
      trades: Array.isArray(parsed.trades) ? parsed.trades : INITIAL_STATE.trades,
      mt5Accounts: Array.isArray(parsed.mt5Accounts) ? parsed.mt5Accounts : INITIAL_STATE.mt5Accounts,
      bankAccounts: Array.isArray(parsed.bankAccounts) ? parsed.bankAccounts : INITIAL_STATE.bankAccounts,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : INITIAL_STATE.transactions,
      people: Array.isArray(parsed.people) ? parsed.people : INITIAL_STATE.people,
      personEntries: Array.isArray(parsed.personEntries) ? parsed.personEntries : INITIAL_STATE.personEntries,
      fixedExpenses: Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : INITIAL_STATE.fixedExpenses,
      budgetCaps: Array.isArray(parsed.budgetCaps) ? parsed.budgetCaps : INITIAL_STATE.budgetCaps,
      loans: Array.isArray(parsed.loans) ? parsed.loans : INITIAL_STATE.loans,
      creditLines: Array.isArray(parsed.creditLines) ? parsed.creditLines : INITIAL_STATE.creditLines,
      goals: Array.isArray(parsed.goals) ? parsed.goals : INITIAL_STATE.goals,
      missionConfigs: Array.isArray(parsed.missionConfigs) ? parsed.missionConfigs : INITIAL_STATE.missionConfigs,
      customMissions: Array.isArray(parsed.customMissions) ? parsed.customMissions : INITIAL_STATE.customMissions,
      badges: Array.isArray(parsed.badges) ? parsed.badges : INITIAL_STATE.badges,
      economicEvents: Array.isArray(parsed.economicEvents) ? parsed.economicEvents : INITIAL_STATE.economicEvents,
      marketHolidays: Array.isArray(parsed.marketHolidays) ? parsed.marketHolidays : INITIAL_STATE.marketHolidays,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : INITIAL_STATE.notifications,
      eaPositions: Array.isArray(parsed.eaPositions) ? parsed.eaPositions : INITIAL_STATE.eaPositions,
      assistantThreads: Array.isArray(parsed.assistantThreads) ? parsed.assistantThreads : [],
      activeAssistantThreadId:
        typeof parsed.activeAssistantThreadId === 'string' ? parsed.activeAssistantThreadId : '',
      assistantMemory: Array.isArray(parsed.assistantMemory) ? parsed.assistantMemory : [],
      lastAssistantGreetedDate:
        typeof parsed.lastAssistantGreetedDate === 'string' ? parsed.lastAssistantGreetedDate : '',
      settings: {
        ...INITIAL_STATE.settings,
        ...(parsed.settings ?? {}),
        localAi: {
          ...INITIAL_STATE.settings.localAi!,
          ...(parsed.settings?.localAi ?? {}),
          profiles: mergedProfiles,
        },
      },
      gamification: {
        ...INITIAL_STATE.gamification,
        ...(parsed.gamification ?? {}),
      },
    };
  } catch {
    return INITIAL_STATE;
  }
}

export default function App() {
  const [state, setState] = useState<FundTrackState>(loadInitialState);
  const [category, setCategory] = useState<MainCategory>('overview');
  const [overviewSub, setOverviewSub] = useState<OverviewSubTab>('pulse');
  const [tradingSub, setTradingSub] = useState<TradingSubTab>('journal');
  const [financeSub, setFinanceSub] = useState<FinanceSubTab>('summary');
  const [growthSub, setGrowthSub] = useState<GrowthSubTab>('goals');
  const [systemSub, setSystemSub] = useState<SystemSubTab>('appearance');

  const [timeRange, setTimeRange] = useState<TimeRange>(state.settings.defaultRange);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInitialQuery, setPaletteInitialQuery] = useState('');
  const [aiCommandOpen, setAiCommandOpen] = useState(false);
  const [inspectedTrade, setInspectedTrade] = useState<Trade | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [pendingMt5Prompt, setPendingMt5Prompt] = useState<{
    accountId: string;
    accountNumber: string;
    broker: string;
    server: string;
    balance: number;
    equity: number;
    suggestedIsDemo: boolean;
  } | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(() => state.settings.pinEnabled);
  const [usingDemoFallback, setUsingDemoFallback] = useState<boolean>(() => !hasPersistedLocalStorage());
  const [syncBannerDismissed, setSyncBannerDismissed] = useState(false);
  const [serverSyncInfo, setServerSyncInfo] = useState<LanSyncServerInfo | null>(null);
  const [pairingKeyInput, setPairingKeyInput] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const eaPollInFlightRef = useRef(false);
  const skipNextAutoPushRef = useRef(false);
  const lastAutoPushDigestRef = useRef('');

  // Quick Transaction state inside Global Quick Action Modal
  const [qAmount, setQAmount] = useState('');
  const [qCurrency, setQCurrency] = useState<CurrencyCode>('IRT');
  const [qType, setQType] = useState<'out' | 'in'>('out');
  const [qPaymentMethod, setQPaymentMethod] = useState<PaymentMethod>('bank');
  const [qAccountId, setQAccountId] = useState(() => state.bankAccounts[0]?.id ?? '');
  const [qCreditLineId, setQCreditLineId] = useState(() => state.creditLines?.[0]?.id ?? '');
  const [qInstallments, setQInstallments] = useState('4');
  const [qPersonId, setQPersonId] = useState(() => state.people?.[0]?.id ?? '');
  const [qCategoryLabel, setQCategoryLabel] = useState('خوراک و کافه');
  const [qNote, setQNote] = useState('');

  const lang = state.settings.language;

  const showToast = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'info') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3600);
    },
    []
  );

  // Persist state (keep clean local storage in sync; don't overwrite real sync before pairing finishes)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota issues
    }
  }, [state]);

  const applySyncedState = useCallback(
    (
      restored: FundTrackState,
      meta?: {
        lanUrl?: string;
        lanKey?: string;
        channel?: 'lan' | 'gdrive';
        revision?: number;
        updatedAt?: string;
      }
    ) => {
      const base = createEmptyState();
      const nowIso = meta?.updatedAt || new Date().toISOString();
      const merged: FundTrackState = {
        ...base,
        ...restored,
        settings: {
          ...base.settings,
          ...(restored.settings || {}),
          lanSyncEnabled: true,
          lanSyncUrl: meta?.lanUrl ?? restored.settings?.lanSyncUrl ?? stateRef.current.settings.lanSyncUrl,
          lanSyncKey: meta?.lanKey ?? restored.settings?.lanSyncKey ?? stateRef.current.settings.lanSyncKey,
          stateRevision: meta?.revision ?? restored.settings?.stateRevision ?? stateRef.current.settings.stateRevision,
          stateUpdatedAt: nowIso,
          lastLanSyncAt: nowIso,
          lastSyncMode: meta?.channel ?? 'lan',
        },
        gamification: {
          ...base.gamification,
          ...(restored.gamification || {}),
        },
      };
      skipNextAutoPushRef.current = true;
      setUsingDemoFallback(false);
      setSyncBannerDismissed(true);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Ignore quota errors
      }
      setState(merged);
    },
    []
  );

  // Boot & Focus Sync: 1) Handle #ft_pair= deep pairing link; 2) Auto-pull newer server data; 3) Detect demo state on fresh mobile
  useEffect(() => {
    let cancelled = false;
    const initialHasLocal = !usingDemoFallback;

    const bootstrapSync = async () => {
      const paired = parseMobilePairingHash();
      if (paired) {
        clearMobilePairingHash();
        setState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            lanSyncEnabled: true,
            lanSyncUrl: paired.url,
            lanSyncKey: paired.syncKey,
          },
        }));
        try {
          const pulled = await pullStateFromLanDb({
            url: paired.url,
            syncKey: paired.syncKey,
          });
          if (!cancelled) {
            applySyncedState(pulled.state, {
              lanUrl: paired.url,
              lanKey: paired.syncKey,
              channel: 'lan',
              revision: pulled.revision,
              updatedAt: pulled.updatedAt,
            });
            showToast(
              t(
                pulled.state.settings.language,
                'اتصال برقرار شد و داده‌های واقعی با موفقیت دریافت شدند',
                'Device paired & real data loaded cleanly'
              ),
              'success'
            );
          }
        } catch (err: unknown) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : '';
          if (msg === 'PASSPHRASE_REQUIRED') {
            setCategory('system');
            setSystemSub('backup');
            showToast(
              t(
                stateRef.current.settings.language,
                'لینک متصل شد — داده‌ها رمزنگاری E2E هستند؛ عبارت رمز را در بخش پشتیبان وارد کنید.',
                'Paired! Data is E2E encrypted — enter your passphrase in Backup & Install.'
              ),
              'info'
            );
          } else if (msg === 'NO_LAN_DATA_YET') {
            showToast(
              t(
                stateRef.current.settings.language,
                'لینک جفت‌سازی ثبت شد؛ هنوز داده‌ای روی سرور ذخیره نشده است.',
                'Pairing link saved; no snapshot pushed to server yet.'
              ),
              'info'
            );
          } else {
            showToast(
              t(
                stateRef.current.settings.language,
                'دریافت خودکار از لینک جفت‌سازی انجام نشد؛ از بخش پشتیبان بررسی کنید.',
                'Auto-pull from pairing link failed; check Sync settings.'
              ),
              'error'
            );
          }
        }
        const infoAfter = await fetchLanSyncInfo(paired.url);
        if (!cancelled) setServerSyncInfo(infoAfter);
        return;
      }

      const targetUrl = stateRef.current.settings.lanSyncUrl;
      const info = await fetchLanSyncInfo(targetUrl);
      if (cancelled) return;
      setServerSyncInfo(info);

      if (info.reachable && info.hasData && !info.encrypted) {
        let syncKey = stateRef.current.settings.lanSyncKey?.trim() || '';
        if (!syncKey && !initialHasLocal) {
          syncKey = (await fetchHostPairingKey(targetUrl)) || '';
        }
        const localRev = stateRef.current.settings.stateRevision ?? 0;
        const shouldAutoPull =
          Boolean(syncKey) &&
          ((stateRef.current.settings.lanSyncEnabled && info.revision > localRev) || !initialHasLocal);
        if (shouldAutoPull) {
          try {
            const pulled = await pullStateFromLanDb({ url: targetUrl, syncKey });
            if (!cancelled) {
              applySyncedState(pulled.state, {
                lanUrl: targetUrl,
                lanKey: syncKey,
                channel: 'lan',
                revision: pulled.revision,
                updatedAt: pulled.updatedAt,
              });
              showToast(
                t(
                  pulled.state.settings.language,
                  'آخرین داده‌های واقعی از سرور میزبان همگام‌سازی شدند',
                  'Real data synced from host database'
                ),
                'info'
              );
            }
          } catch {
            // Keep silent fallback; banner handles manual pairing key if invalid/missing
          }
        }
      }
    };

    void bootstrapSync();

    const checkOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      const sNow = stateRef.current.settings;
      if (!sNow.lanSyncEnabled || !sNow.lanSyncKey?.trim()) return;
      void fetchLanSyncInfo(sNow.lanSyncUrl).then(async (info) => {
        if (cancelled) return;
        setServerSyncInfo(info);
        if (
          info.reachable &&
          info.hasData &&
          !info.encrypted &&
          info.revision > (stateRef.current.settings.stateRevision ?? 0)
        ) {
          try {
            const pulled = await pullStateFromLanDb({
              url: sNow.lanSyncUrl,
              syncKey: sNow.lanSyncKey!,
            });
            if (!cancelled) {
              applySyncedState(pulled.state, {
                lanUrl: sNow.lanSyncUrl,
                lanKey: sNow.lanSyncKey,
                channel: 'lan',
                revision: pulled.revision,
                updatedAt: pulled.updatedAt,
              });
              showToast(
                t(pulled.state.settings.language, 'تغییرات جدید از دستگاه دیگر دریافت شد', 'Synced latest update'),
                'info'
              );
            }
          } catch {
            // Ignore transient network errors
          }
        }
      });
    };

    window.addEventListener('focus', checkOnFocus);
    document.addEventListener('visibilitychange', checkOnFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', checkOnFocus);
      document.removeEventListener('visibilitychange', checkOnFocus);
    };
  }, [applySyncedState, showToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced Auto-Push when Live Multi-Device Sync is enabled (and not encrypted/demo)
  useEffect(() => {
    const sNow = state.settings;
    if (!sNow.lanSyncEnabled || !sNow.lanSyncKey?.trim() || sNow.e2eEncryptionEnabled || usingDemoFallback) {
      return;
    }

    const digest = JSON.stringify({
      ...state,
      settings: {
        ...state.settings,
        stateRevision: undefined,
        stateUpdatedAt: undefined,
        lastLanSyncAt: undefined,
        lastSyncMode: undefined,
      },
    });

    if (skipNextAutoPushRef.current) {
      lastAutoPushDigestRef.current = digest;
      skipNextAutoPushRef.current = false;
      return;
    }
    if (!lastAutoPushDigestRef.current) {
      lastAutoPushDigestRef.current = digest;
    }
    if (digest === lastAutoPushDigestRef.current) return;

    const timer = setTimeout(() => {
      void pushStateToLanDb(stateRef.current, {
        url: stateRef.current.settings.lanSyncUrl,
        syncKey: stateRef.current.settings.lanSyncKey!,
      })
        .then((res) => {
          lastAutoPushDigestRef.current = digest;
          skipNextAutoPushRef.current = true;
          setState((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              stateRevision: res.revision,
              stateUpdatedAt: res.updatedAt,
              lastLanSyncAt: res.updatedAt,
              lastSyncMode: 'lan',
            },
          }));
        })
        .catch(() => {
          // Off-LAN or temporarily offline — user can push via Drive or next reconnect
        });
    }, 2200);

    return () => clearTimeout(timer);
  }, [state, usingDemoFallback]);

  // Apply theme, dark mode, RTL/LTR, and glass intensity CSS variables
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.settings.theme;
    root.dir = state.settings.language === 'fa' ? 'rtl' : 'ltr';
    root.lang = state.settings.language;
    if (
      state.settings.theme === 'light' ||
      state.settings.theme === 'coral' ||
      state.settings.theme === 'lavender'
    ) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }

    const effectiveAlpha = state.settings.highContrastCards
      ? Math.min(0.95, state.settings.glassOpacity + 0.14)
      : state.settings.glassOpacity;
    root.style.setProperty('--ft-glass-alpha', String(effectiveAlpha));
    root.style.setProperty('--ft-glass-blur', `${state.settings.glassBlur}px`);
  }, [
    state.settings.theme,
    state.settings.language,
    state.settings.glassOpacity,
    state.settings.glassBlur,
    state.settings.highContrastCards,
  ]);

  // Auto-migrate any legacy plaintext pinCode to salted SHA-256 pinHash
  useEffect(() => {
    if (state.settings.pinEnabled && state.settings.pinCode && !state.settings.pinHash) {
      let cancelled = false;
      void hashPin(state.settings.pinCode).then((hashed) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          settings: { ...prev.settings, pinHash: hashed, pinCode: '' },
        }));
      });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [state.settings.pinEnabled, state.settings.pinCode, state.settings.pinHash]);

  // Global Ctrl+K Command Palette & Ctrl+J Smart AI Quick Command Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!isLocked) setPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (!isLocked) setAiCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLocked]);

  // Configurable Auto-Lock Inactivity Timer
  useEffect(() => {
    const mins = state.settings.autoLockMinutes ?? 0;
    if (!state.settings.pinEnabled || mins <= 0 || isLocked) return;

    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsLocked(true);
      }, mins * 60 * 1000);
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
    };
  }, [state.settings.pinEnabled, state.settings.autoLockMinutes, isLocked]);

  // Auto-emit persistent notification if today's trading drawdown breaches configured Daily Max Loss %
  useEffect(() => {
    const dd = computeDailyDrawdownStatus(
      state.trades,
      state.mt5Accounts,
      state.settings.dailyMaxLossPct ?? 3
    );
    if (!dd.breached) return;
    const notifId = `notif_dd_${getTodayKey()}`;
    setState((prev) => {
      if (prev.notifications.some((n) => n.id === notifId)) return prev;
      return {
        ...prev,
        notifications: [
          {
            id: notifId,
            title: t(
              prev.settings.language,
              'تخطی از سقف افت سرمایه روزانه (Circuit Breaker)',
              'Daily Drawdown Circuit Breaker Triggered'
            ),
            detail: t(
              prev.settings.language,
              `زیان امروز ($${dd.todayLossUsd}) از سقف مجاز ${dd.dailyMaxLossPct}% ($${dd.limitUsd}) عبور کرد`,
              `Today's loss ($${dd.todayLossUsd}) exceeded your ${dd.dailyMaxLossPct}% limit ($${dd.limitUsd})`
            ),
            daysLeft: 0,
            source: 'system' as const,
            severity: 'danger' as const,
            read: false,
            createdAt: new Date().toISOString(),
          },
          ...prev.notifications,
        ].slice(0, 40),
      };
    });
  }, [state.trades, state.mt5Accounts, state.settings.dailyMaxLossPct]);

  // Unlock Web Audio API on first user gesture so scheduled news chimes work reliably
  useEffect(() => {
    const unlock = () => unlockAudioContext();
    window.addEventListener('pointerdown', unlock, { passive: true, once: true });
    window.addEventListener('keydown', unlock, { passive: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Background scheduler: check today's alarm-enabled economic news every 15s and chime + notify within configured lead minutes
  useEffect(() => {
    const checkDueNewsAlarms = () => {
      const curr = stateRef.current;
      const leadMins = Math.max(1, curr.settings.newsAlertLeadMinutes ?? 15);
      const soundOn = curr.settings.newsAlertSoundEnabled !== false;
      const now = new Date();
      const nowMs = now.getTime();
      const triggeredEvents: EconomicEvent[] = [];

      for (const ev of curr.economicEvents) {
        if (!ev.alarmEnabled || ev.alarmTriggered) continue;
        const evDate = new Date(ev.timestamp);
        const evMs = evDate.getTime();
        if (
          Number.isNaN(evMs) ||
          evDate.getFullYear() !== now.getFullYear() ||
          evDate.getMonth() !== now.getMonth() ||
          evDate.getDate() !== now.getDate()
        ) {
          continue;
        }
        const minsUntil = (evMs - nowMs) / 60000;
        if (minsUntil <= leadMins && minsUntil >= -5) {
          triggeredEvents.push(ev);
        }
      }

      if (triggeredEvents.length === 0) return;

      const triggeredIds = new Set(triggeredEvents.map((e) => e.id));
      const newNotifs: NotificationItem[] = triggeredEvents.map((ev) => {
        const minsLeft = Math.max(0, Math.round((new Date(ev.timestamp).getTime() - nowMs) / 60000));
        return {
          id: `notif_news_auto_${ev.id}_${now.getFullYear()}${now.getMonth() + 1}${now.getDate()}`,
          title: t(
            curr.settings.language,
            `هشدار خبر مهم (${minsLeft} دقیقه مانده): ${ev.title}`,
            `News Alert (${minsLeft}m left): ${ev.title}`
          ),
          detail: `${ev.currency} · ${t(curr.settings.language, 'پیش‌بینی:', 'Forecast:')} ${ev.forecast} · ${t(
            curr.settings.language,
            'تنظیم یادآور:',
            'Lead:'
          )} ${leadMins}m`,
          daysLeft: 0,
          source: 'news',
          severity: 'danger',
          targetId: ev.id,
          read: false,
          createdAt: now.toISOString(),
        };
      });

      setState((prev) => {
        const existingIds = new Set(prev.notifications.map((n) => n.id));
        const uniqueNewNotifs = newNotifs.filter((n) => !existingIds.has(n.id));
        return {
          ...prev,
          economicEvents: prev.economicEvents.map((ev) =>
            triggeredIds.has(ev.id) ? { ...ev, alarmTriggered: true } : ev
          ),
          notifications: [...uniqueNewNotifs, ...prev.notifications].slice(0, 40),
        };
      });

      if (soundOn) {
        playNewsAlarmSound();
      }
      const firstEv = triggeredEvents[0];
      showToast(
        t(
          curr.settings.language,
          `هشدار خبر تا ${leadMins} دقیقه دیگر: ${firstEv.title}`,
          `News alert within ${leadMins}m: ${firstEv.title}`
        ),
        'info'
      );
    };

    checkDueNewsAlarms();
    const interval = setInterval(checkDueNewsAlarms, 15000);
    return () => clearInterval(interval);
  }, [showToast]);

  // FX Rate Refresh handler (calls Express /api/fx-rate, falls back to direct https://api.zipodo.ir/usdt/ in single-file mode)
  const handleRefreshFxRate = useCallback(
    async (force = false) => {
      try {
        let data: {
          usdToToman: number;
          updatedAt: string;
          source: 'live' | 'cached' | 'fallback';
        } | null = null;

        try {
          const res = await fetch(`/api/fx-rate${force ? '?force=true' : ''}`);
          if (res.ok) {
            const parsed = (await res.json()) as {
              usdToToman: number;
              updatedAt: string;
              source: 'live' | 'cached' | 'fallback';
            };
            if (parsed.usdToToman && parsed.source !== 'fallback') {
              data = parsed;
            } else if (parsed.usdToToman) {
              data = parsed;
            }
          }
        } catch {
          // Local Express proxy unavailable (e.g. standalone single-file HTML) — try direct endpoint
        }

        if (!data || data.source === 'fallback') {
          try {
            const directRes = await fetch('https://api.zipodo.ir/usdt/');
            if (directRes.ok) {
              const payload = (await directRes.json()) as Record<string, unknown>;
              const rawPrice = Number(payload?.price);
              if (Number.isFinite(rawPrice) && rawPrice > 10000) {
                const usdToToman =
                  rawPrice > 1000000 ? Math.round(rawPrice / 10) : Math.round(rawPrice);
                data = {
                  usdToToman,
                  updatedAt: new Date().toISOString(),
                  source: 'live',
                };
              }
            }
          } catch {
            // Keep backend fallback if direct request also blocked by CORS/offline
          }
        }

        if (!data || !data.usdToToman) throw new Error('Invalid FX payload');

        setState((prev) => ({
          ...prev,
          mt5Accounts: prev.mt5Accounts.map((acc) => ({
            ...acc,
            usdToman: data.usdToToman,
          })),
          settings: {
            ...prev.settings,
            usdToman: data.usdToToman,
            fxUpdatedAt: data.updatedAt,
            fxSource: data.source,
          },
          notifications: force
            ? [
                {
                  id: `notif_fx_${Date.now()}`,
                  title: t(lang, 'به‌روزرسانی نرخ دلار (Zipodo USDT)', 'USD Rate Updated (Zipodo USDT)'),
                  detail: t(
                    lang,
                    `نرخ جدید ${data.usdToToman.toLocaleString('en-US')} تومان روی همه حساب‌ها اعمال شد`,
                    `Rate ${data.usdToToman.toLocaleString('en-US')} IRT applied to all accounts`
                  ),
                  daysLeft: 0,
                  source: 'system' as const,
                  severity: 'info' as const,
                  read: false,
                  createdAt: new Date().toISOString(),
                },
                ...prev.notifications,
              ].slice(0, 40)
            : prev.notifications,
        }));

        if (force) {
          showToast(
            t(
              lang,
              `نرخ دلار به ${data.usdToToman.toLocaleString('en-US')} تومان به‌روز شد`,
              `USD rate updated to ${data.usdToToman.toLocaleString('en-US')} IRT`
            ),
            'success'
          );
        }
      } catch {
        if (force) {
          showToast(t(lang, 'دریافت نرخ ناموفق بود؛ نرخ قبلی حفظ شد', 'FX rate fetch failed; kept previous rate'), 'error');
        }
      }
    },
    [lang, showToast]
  );

  // Auto 8-hour FX check on mount when enabled
  useEffect(() => {
    if (!state.settings.fxAutoUpdate) return;
    const lastMs = new Date(state.settings.fxUpdatedAt).getTime();
    if (Number.isNaN(lastMs) || Date.now() - lastMs >= 8 * 3600 * 1000) {
      handleRefreshFxRate(false);
    }
  }, [state.settings.fxAutoUpdate, state.settings.fxUpdatedAt, handleRefreshFxRate]);

  // Navigation helper across categories + sub-tabs
  const handleNavigate = (cat: MainCategory, sub?: string) => {
    setCategory(cat);
    setMobileMenuOpen(false);
    if (!sub) return;
    if (cat === 'overview') setOverviewSub(sub as OverviewSubTab);
    if (cat === 'trading') setTradingSub(sub as TradingSubTab);
    if (cat === 'finance') setFinanceSub(sub as FinanceSubTab);
    if (cat === 'growth') setGrowthSub(sub as GrowthSubTab);
    if (cat === 'system') setSystemSub(sub as SystemSubTab);
  };

  // --- Domain Handlers ---

  const handleSaveTradeReview = (
    tradeId: string,
    patch: Partial<Pick<Trade, 'setupTag' | 'emotionTag' | 'slRespected' | 'reviewNote'>>
  ) => {
    setState((prev) => ({
      ...prev,
      trades: prev.trades.map((tr) => (tr.id === tradeId ? { ...tr, ...patch } : tr)),
    }));
    showToast(t(lang, 'بازبینی معامله ذخیره شد', 'Trade review saved'), 'success');
  };

  const handleSyncMt5 = () => {
    const nowIso = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      mt5Accounts: prev.mt5Accounts.map((a) => ({
        ...a,
        lastSyncAt: nowIso,
      })),
      settings: {
        ...prev.settings,
        lastSyncAt: nowIso,
        eventFileConnected: true,
        lastSystemError: null,
      },
      notifications: [
        {
          id: `notif_sync_${Date.now()}`,
          title: t(lang, 'همگام‌سازی حساب‌های MT5 انجام شد', 'MT5 Accounts Synced'),
          detail: t(lang, `${prev.mt5Accounts.length} حساب فعال و فایل رویداد به‌روزرسانی شدند`, `${prev.mt5Accounts.length} active accounts & event file updated`),
          daysLeft: 0,
          source: 'system' as const,
          severity: 'success' as const,
          read: false,
          createdAt: nowIso,
        },
        ...prev.notifications,
      ].slice(0, 40),
    }));
    showToast(t(lang, 'همگام‌سازی MT5 با موفقیت انجام شد', 'MT5 accounts synced'), 'success');
  };

  const handleImportEventsJsonl = useCallback(
    (rawText: string, silent = false) => {
      const current = stateRef.current;
      const existingTickets = new Set(current.trades.map((tr) => tr.ticket));
      const fallbackAccId = current.mt5Accounts[0]?.id ?? `mt5_${Date.now()}`;
      const parsed = parseEventsJsonl(rawText, fallbackAccId, existingTickets);

      if (
        parsed.parsedCount === 0 &&
        !parsed.accountUpdate &&
        !parsed.eaMeta &&
        !parsed.eaPositions &&
        !parsed.eaRadar
      ) {
        if (!silent) {
          showToast(t(lang, 'هیچ معامله یا رویداد معتبری در فایل یافت نشد', 'No valid events found in file'), 'error');
        }
        return;
      }

      const nowIso = new Date().toISOString();
      const loginKey = parsed.accountUpdate?.login || parsed.eaMeta?.login;
      const existingMatch = loginKey
        ? current.mt5Accounts.find((a) => a.accountNumber === loginKey)
        : current.mt5Accounts[0];
      const willCreateNewAcc = Boolean(!existingMatch && parsed.accountUpdate);
      const predictedAccId = existingMatch?.id ?? `mt5_${loginKey || Date.now()}`;

      let addedTradesCount = 0;

      setState((prev) => {
        const matchedIdx = loginKey
          ? prev.mt5Accounts.findIndex((a) => a.accountNumber === loginKey)
          : prev.mt5Accounts.length > 0
          ? 0
          : -1;

        const resolvedAccId =
          matchedIdx >= 0 ? prev.mt5Accounts[matchedIdx].id : predictedAccId;

        const prevTicketSet = new Set(prev.trades.map((tr) => tr.ticket));
        const uniqueNewTrades = parsed.trades
          .filter((tr) => !prevTicketSet.has(tr.ticket))
          .map((tr) => ({ ...tr, accountId: resolvedAccId }));

        addedTradesCount = uniqueNewTrades.length;

        const newDealsNetUsd = Number(
          uniqueNewTrades
            .reduce((s, tr) => s + tr.profitUsd + (tr.commissionUsd ?? 0) + (tr.swapUsd ?? 0), 0)
            .toFixed(2)
        );

        let nextMt5 = prev.mt5Accounts;
        if (parsed.accountUpdate) {
          const upd = parsed.accountUpdate;
          if (matchedIdx >= 0) {
            nextMt5 = prev.mt5Accounts.map((a, idx) => {
              if (idx !== matchedIdx) return a;
              const nextBalance =
                upd.hasSnap && typeof upd.balance === 'number'
                  ? upd.balance
                  : Number((a.balance + (upd.hasSnap ? 0 : newDealsNetUsd)).toFixed(2));
              const nextEquity =
                upd.hasSnap && typeof upd.equity === 'number'
                  ? upd.equity
                  : Number((a.equity + (upd.hasSnap ? 0 : newDealsNetUsd)).toFixed(2));
              return {
                ...a,
                broker: upd.broker || a.broker,
                server: upd.server || a.server,
                balance: nextBalance,
                equity: nextEquity,
                floatingProfit: upd.floatingProfit ?? a.floatingProfit,
                margin: upd.margin ?? a.margin,
                freeMargin: upd.freeMargin ?? a.freeMargin,
                usdToman: prev.settings.usdToman,
                lastSyncAt: upd.lastSyncAt || nowIso,
                status: 'active',
                // Preserve original one-time account classification (Live vs Demo)
                isDemo: a.isDemo,
              };
            });
          } else {
            const initialBalance = upd.balance ?? newDealsNetUsd;
            const initialEquity = upd.equity ?? initialBalance;
            nextMt5 = [
              ...prev.mt5Accounts,
              {
                id: resolvedAccId,
                accountNumber: upd.accountNumber || loginKey || '0',
                broker: upd.broker || parsed.eaMeta?.name || 'MT5 Terminal',
                server: upd.server || parsed.eaMeta?.server || 'MT5',
                currency: 'USD',
                balance: initialBalance,
                equity: initialEquity,
                floatingProfit: upd.floatingProfit,
                margin: upd.margin,
                freeMargin: upd.freeMargin,
                usdToman: prev.settings.usdToman,
                lastSyncAt: upd.lastSyncAt || nowIso,
                status: 'active',
                isDemo: Boolean(upd.suggestedIsDemo),
              },
            ];
          }
        }

        const shouldPushNotification = !silent || uniqueNewTrades.length > 0 || willCreateNewAcc;

        const next: FundTrackState = {
          ...prev,
          mt5Accounts: nextMt5,
          trades: uniqueNewTrades.length > 0 ? [...uniqueNewTrades, ...prev.trades] : prev.trades,
          eaMeta: parsed.eaMeta ?? prev.eaMeta,
          eaPositions: parsed.eaPositions ?? prev.eaPositions,
          eaRadar: parsed.eaRadar ? { ...(prev.eaRadar ?? {}), ...parsed.eaRadar } : prev.eaRadar,
          settings: {
            ...prev.settings,
            eventFileConnected: true,
            lastSyncAt: nowIso,
            lastSystemError: null,
          },
          notifications: shouldPushNotification
            ? [
                {
                  id: `notif_jsonl_${Date.now()}`,
                  title: t(lang, 'همگام‌سازی فایل رویداد MT5', 'MT5 Event File Synced'),
                  detail: t(
                    lang,
                    `${uniqueNewTrades.length} معامله جدید · ${parsed.eaPositions?.length ?? 0} پوزیشن باز`,
                    `${uniqueNewTrades.length} new trades · ${parsed.eaPositions?.length ?? 0} open positions`
                  ),
                  daysLeft: 0,
                  source: 'system' as const,
                  severity: 'success' as const,
                  read: false,
                  createdAt: nowIso,
                },
                ...prev.notifications,
              ].slice(0, 40)
            : prev.notifications,
        };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore quota errors
        }
        return next;
      });

      if (willCreateNewAcc && parsed.accountUpdate) {
        setPendingMt5Prompt({
          accountId: predictedAccId,
          accountNumber: parsed.accountUpdate.accountNumber || loginKey || '0',
          broker: parsed.accountUpdate.broker || parsed.eaMeta?.name || 'MT5 Terminal',
          server: parsed.accountUpdate.server || parsed.eaMeta?.server || 'MT5',
          balance: parsed.accountUpdate.balance ?? 0,
          equity: parsed.accountUpdate.equity ?? parsed.accountUpdate.balance ?? 0,
          suggestedIsDemo: Boolean(parsed.accountUpdate.suggestedIsDemo),
        });
      }

      if (!silent || addedTradesCount > 0) {
        showToast(
          addedTradesCount > 0
            ? t(
                lang,
                `${addedTradesCount} معامله جدید ثبت شد و تراز حساب به‌روز گردید`,
                `${addedTradesCount} new trade(s) synced & account balance updated`
              )
            : t(
                lang,
                `همگام‌سازی انجام شد (${parsed.dedupedCount} معامله قبلی به‌روز بود)`,
                `Synced cleanly (${parsed.dedupedCount} existing trades up to date)`
              ),
          'success'
        );
      }
    },
    [lang, showToast]
  );

  const handleSyncLocalEaFile = useCallback(
    async (customPath?: string, silent = false) => {
      if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        if (!silent) {
          showToast(
            t(
              lang,
              'در حالت تک‌فایل آفلاین، لطفاً فایل events.jsonl را به صورت دستی انتخاب کنید.',
              'In standalone single-file mode, please upload events.jsonl manually.'
            ),
            'info'
          );
        }
        return;
      }

      if (eaPollInFlightRef.current) return;
      eaPollInFlightRef.current = true;
      try {
        const targetPath =
          customPath !== undefined ? customPath.trim() : stateRef.current.settings.eaFilePath?.trim() || '';
        const res = await fetch('/api/ea/read-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: targetPath || undefined }),
        });
        const payload = (await res.json()) as {
          ok?: boolean;
          content?: string;
          filePath?: string;
          error?: string;
        };
        if (!res.ok || !payload.content) {
          if (!silent) {
            showToast(
              t(
                lang,
                'فایل events.jsonl در مسیر پیش‌فرض یا دلخواه یافت نشد؛ فایل را به صورت دستی آپلود کنید.',
                'events.jsonl not found in local MT5 Common/Files path; please upload the file manually.'
              ),
              'error'
            );
          }
          return;
        }
        if (payload.filePath || customPath !== undefined) {
          setState((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              eaFilePath: customPath !== undefined ? customPath : prev.settings.eaFilePath || payload.filePath,
            },
          }));
        }
        handleImportEventsJsonl(payload.content, silent);
      } catch {
        if (!silent) {
          showToast(t(lang, 'خطا در ارتباط با سرویس محلی خواندن فایل اکسپرت', 'Failed to reach local EA file bridge'), 'error');
        }
      } finally {
        eaPollInFlightRef.current = false;
      }
    },
    [handleImportEventsJsonl, lang, showToast]
  );

  // Real-time 10-second background EA file watcher for instant deal & accounting updates
  useEffect(() => {
    if (state.settings.eaAutoSync === false) return;
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') return;

    const interval = setInterval(() => {
      if (stateRef.current.settings.eaAutoSync === false) return;
      if (!stateRef.current.settings.eventFileConnected && !stateRef.current.settings.eaFilePath) return;
      void handleSyncLocalEaFile(undefined, true);
    }, 10000);

    return () => clearInterval(interval);
  }, [state.settings.eaAutoSync, handleSyncLocalEaFile]);

  const handleDeleteMt5Account = (id: string) => {
    const acc = state.mt5Accounts.find((a) => a.id === id);
    setConfirmDialog({
      title: t(lang, 'حذف حساب MT5', 'Delete MT5 Account'),
      message: t(
        lang,
        `حساب ${acc?.broker ?? ''} (#${acc?.accountNumber ?? ''}) از پنل حذف شود؟ این حساب دیگر در دارایی کل و ریسک محاسبه نخواهد شد.`,
        `Remove ${acc?.broker ?? ''} (#${acc?.accountNumber ?? ''}) from FundTrack?`
      ),
      onConfirm: () => {
        setState((prev) => {
          const next: FundTrackState = {
            ...prev,
            mt5Accounts: prev.mt5Accounts.filter((a) => a.id !== id),
          };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Ignore quota errors
          }
          return next;
        });
        showToast(t(lang, 'حساب MT5 با موفقیت حذف شد', 'MT5 account removed'), 'info');
      },
    });
  };

  const handleImportCsvTrades = (newTrades: Trade[]) => {
    if (newTrades.length === 0) return;
    const nowIso = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      trades: [...newTrades, ...prev.trades],
      notifications: [
        {
          id: `notif_csv_${Date.now()}`,
          title: t(lang, 'ورود تاریخچه معاملات از فایل CSV', 'CSV Trade History Imported'),
          detail: t(
            lang,
            `${newTrades.length} معامله جدید به ژورنال معاملاتی اضافه شد`,
            `${newTrades.length} new trades merged into Trade Journal`
          ),
          daysLeft: 0,
          source: 'system' as const,
          severity: 'success' as const,
          read: false,
          createdAt: nowIso,
        },
        ...prev.notifications,
      ].slice(0, 40),
    }));
    showToast(
      t(lang, `${newTrades.length} معامله جدید با موفقیت وارد ژورنال شد`, `${newTrades.length} trades imported into journal`),
      'success'
    );
  };

  const handleToggleNewsAlarm = (eventId: string) => {
    setState((prev) => ({
      ...prev,
      economicEvents: prev.economicEvents.map((ev) =>
        ev.id === eventId ? { ...ev, alarmEnabled: !ev.alarmEnabled } : ev
      ),
    }));
  };

  const handleTriggerNewsAlarm = (eventId: string) => {
    const ev = state.economicEvents.find((e) => e.id === eventId);
    if (!ev) return;
    const leadMins = state.settings.newsAlertLeadMinutes ?? 15;
    const notif: NotificationItem = {
      id: `notif_news_${Date.now()}`,
      title: t(lang, `زنگ هشدار خبر: ${ev.title}`, `News Alarm: ${ev.title}`),
      detail: `${ev.currency} · ${t(
        lang,
        `یادآور ${leadMins} دقیقه قبل از انتشار`,
        `Alert ${leadMins}m before release`
      )}`,
      daysLeft: 0,
      source: 'news',
      severity: 'warning',
      targetId: ev.id,
      read: false,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      notifications: [notif, ...prev.notifications],
      economicEvents: prev.economicEvents.map((item) =>
        item.id === eventId ? { ...item, alarmTriggered: true, alarmEnabled: true } : item
      ),
    }));
    if (state.settings.newsAlertSoundEnabled !== false) {
      playNewsAlarmSound();
    }
    showToast(t(lang, `زنگ به صدا درآمد: ${ev.title}`, `Alarm rang: ${ev.title}`), 'info');
  };

  const handleImportEconomicEvents = (events: EconomicEvent[]) => {
    setState((prev) => {
      const { merged } = mergeEconomicEvents(prev.economicEvents, events);
      return {
        ...prev,
        economicEvents: merged,
      };
    });
    showToast(t(lang, `${events.length} رویداد وارد شد`, `${events.length} events imported`), 'success');
  };

  const applyFetchedEconomicEvents = useCallback(
    (events: EconomicEvent[], sourceLabel?: string) => {
      let totalCount = events.length;
      let upcomingHighCount = 0;

      setState((prev) => {
        const { merged } = mergeEconomicEvents(prev.economicEvents, events);
        totalCount = merged.length;
        const nowMs = Date.now();
        upcomingHighCount = events.filter(
          (ev) => ev.impact === 'high' && new Date(ev.timestamp).getTime() >= nowMs
        ).length;

        return {
          ...prev,
          economicEvents: merged,
          notifications: [
            {
              id: `notif_econ_${Date.now()}`,
              title: t(lang, 'به‌روزرسانی تقویم اقتصادی (رایگان)', 'Economic Calendar Updated (Free Feed)'),
              detail: t(
                lang,
                `${events.length} رویداد از ${sourceLabel || 'Forex Factory'} دریافت شد (${upcomingHighCount} خبر مهم پیش‌رو)`,
                `Synced ${events.length} events from ${sourceLabel || 'Forex Factory'} (${upcomingHighCount} upcoming high-impact)`
              ),
              daysLeft: 0,
              source: 'news' as const,
              severity: upcomingHighCount > 0 ? ('warning' as const) : ('info' as const),
              read: false,
              createdAt: new Date().toISOString(),
            },
            ...prev.notifications,
          ].slice(0, 40),
        };
      });

      return { totalCount, upcomingHighCount };
    },
    [lang]
  );

  const handleRefreshEconomicNews = useCallback(
    async (opts?: {
      currencyFilter?: string;
      impactFilter?: 'all' | 'high' | 'high_medium';
      force?: boolean;
    }): Promise<{ ok: boolean; count: number; summary?: string }> => {
      const res = await fetchFreeEconomicCalendar({
        force: opts?.force ?? true,
        currencyFilter: opts?.currencyFilter,
        impactFilter: opts?.impactFilter ?? 'all',
      });
      if (!res.ok || res.events.length === 0) {
        showToast(
          t(
            lang,
            res.error || 'دریافت تقویم اقتصادی ناموفق بود یا رویدادی یافت نشد',
            res.error || 'Failed to fetch economic calendar'
          ),
          'error'
        );
        return { ok: false, count: 0 };
      }

      const { upcomingHighCount } = applyFetchedEconomicEvents(res.events, res.source);
      const summaryText = t(
        lang,
        `${res.events.length} رویداد اقتصادی به‌روزرسانی شد (${upcomingHighCount} خبر پرریسک پیش‌رو)`,
        `Updated ${res.events.length} economic events (${upcomingHighCount} upcoming high-impact)`
      );
      showToast(summaryText, 'success');
      return { ok: true, count: res.events.length, summary: summaryText };
    },
    [applyFetchedEconomicEvents, lang, showToast]
  );

  const handleAddOrUpdateTransaction = (txData: Omit<Transaction, 'id'>, editId?: string) => {
    setState((prev) => {
      const usdToman = prev.settings.usdToman;
      const bankAccounts = prev.bankAccounts.map((a) => ({ ...a }));
      let loans = [...prev.loans];
      let personEntries = [...prev.personEntries];

      const isNonBankOrigin = (pm?: PaymentMethod) => pm === 'credit' || pm === 'person_debt';

      const applyDelta = (tx: Omit<Transaction, 'id'>, factor: 1 | -1) => {
        if (isNonBankOrigin(tx.paymentMethod) || !tx.accountId) return;
        const src = bankAccounts.find((a) => a.id === tx.accountId);
        if (src) {
          const amtInSrc = convertCurrency(tx.amount, tx.currency, src.currency, usdToman);
          if (tx.type === 'in') src.balance += amtInSrc * factor;
          else if (tx.type === 'out' || tx.type === 'transfer') src.balance -= amtInSrc * factor;
        }
        if (tx.type === 'transfer' && tx.toAccountId) {
          const dst = bankAccounts.find((a) => a.id === tx.toAccountId);
          if (dst) {
            const amtInDst = convertCurrency(tx.amount, tx.currency, dst.currency, usdToman);
            dst.balance += amtInDst * factor;
          }
        }
      };

      let nextTxs = [...prev.transactions];
      if (editId) {
        const old = prev.transactions.find((tItem) => tItem.id === editId);
        if (old) applyDelta(old, -1);
        applyDelta(txData, 1);

        let nextLinkedLoanId = txData.linkedLoanId ?? old?.linkedLoanId;
        if (txData.type === 'out' && txData.paymentMethod === 'credit' && old?.linkedLoanId) {
          const line = (prev.creditLines ?? []).find((c) => c.id === txData.creditLineId);
          const count = Math.max(1, Math.round(txData.installmentCount || line?.defaultInstallments || 1));
          loans = loans.map((l) =>
            l.id === old.linkedLoanId
              ? {
                  ...l,
                  creditLineId: txData.creditLineId,
                  title: txData.note || line?.title || l.title,
                  totalAmount: txData.amount,
                  currency: txData.currency,
                  totalInstallments: count,
                  installmentAmount: Number((txData.amount / count).toFixed(2)),
                  periodLabel: `${count} ${lang === 'fa' ? 'قسط ماهانه' : 'monthly installments'}`,
                }
              : l
          );
        } else if (old?.linkedLoanId && txData.paymentMethod !== 'credit') {
          loans = loans.filter((l) => l.id !== old.linkedLoanId);
          nextLinkedLoanId = undefined;
        }

        nextTxs = nextTxs.map((tItem) =>
          tItem.id === editId ? { ...txData, linkedLoanId: nextLinkedLoanId, id: editId } : tItem
        );
      } else {
        const newTxId = `tx_${Date.now()}`;
        let enrichedTx: Transaction = { ...txData, id: newTxId };

        if (txData.type === 'out' && txData.paymentMethod === 'credit' && txData.creditLineId) {
          const line = (prev.creditLines ?? []).find((c) => c.id === txData.creditLineId);
          const count = Math.max(1, Math.round(txData.installmentCount || line?.defaultInstallments || 4));
          const nextDue = getNextJalaliDayOccurrence(line?.dueDayOfMonth ?? 5, new Date(txData.date));
          const loanId = `loan_cred_${Date.now()}`;
          loans = [
            {
              id: loanId,
              kind: 'debt',
              creditLineId: txData.creditLineId,
              title: txData.note || `${line?.title ?? t(lang, 'اعتبار', 'Credit')}${txData.categoryLabel ? ` · ${txData.categoryLabel}` : ''}`,
              totalAmount: txData.amount,
              currency: txData.currency,
              totalInstallments: count,
              paidInstallments: 0,
              installmentAmount: Number((txData.amount / count).toFixed(2)),
              dueDate: nextDue.toISOString(),
              periodLabel: `${count} ${lang === 'fa' ? 'قسط ماهانه' : 'monthly'}`,
              priorityRate: 24,
              status: 'open',
            },
            ...loans,
          ];
          enrichedTx = { ...enrichedTx, linkedLoanId: loanId, installmentCount: count };
        } else if (txData.type === 'out' && txData.paymentMethod === 'person_debt' && txData.personId) {
          const entryId = `pe_tx_${Date.now()}`;
          personEntries = [
            {
              id: entryId,
              personId: txData.personId,
              direction: 'receive',
              amount: txData.amount,
              currency: txData.currency,
              date: txData.date,
              note: txData.note || txData.categoryLabel || t(lang, 'هزینه از محل قرض', 'Borrowed expense'),
              linkedTransactionId: newTxId,
            },
            ...personEntries,
          ];
          enrichedTx = { ...enrichedTx, linkedPersonEntryId: entryId };
        } else {
          applyDelta(txData, 1);
        }

        nextTxs.unshift(enrichedTx);
      }

      return { ...prev, bankAccounts, loans, personEntries, transactions: nextTxs };
    });
    showToast(t(lang, 'تراکنش با موفقیت ثبت شد', 'Transaction saved'), 'success');
  };

  const handleDeleteTransaction = (id: string) => {
    setConfirmDialog({
      title: t(lang, 'حذف تراکنش', 'Delete Transaction'),
      message: t(lang, 'آیا از حذف این تراکنش و اصلاح موجودی / اقساط مرتبط مطمئن هستید؟', 'Delete this transaction and revert linked balance/schedule?'),
      onConfirm: () => {
        setState((prev) => {
          const target = prev.transactions.find((tItem) => tItem.id === id);
          if (!target) return prev;
          const usdToman = prev.settings.usdToman;
          const skipBank = target.paymentMethod === 'credit' || target.paymentMethod === 'person_debt' || !target.accountId;
          const bankAccounts = skipBank
            ? prev.bankAccounts
            : prev.bankAccounts.map((a) => {
                if (a.id === target.accountId) {
                  const delta = convertCurrency(target.amount, target.currency, a.currency, usdToman);
                  return {
                    ...a,
                    balance: target.type === 'in' ? a.balance - delta : a.balance + delta,
                  };
                }
                if (target.type === 'transfer' && a.id === target.toAccountId) {
                  const delta = convertCurrency(target.amount, target.currency, a.currency, usdToman);
                  return { ...a, balance: a.balance - delta };
                }
                return a;
              });
          return {
            ...prev,
            bankAccounts,
            loans: target.linkedLoanId ? prev.loans.filter((l) => l.id !== target.linkedLoanId) : prev.loans,
            personEntries: target.linkedPersonEntryId
              ? prev.personEntries.filter((e) => e.id !== target.linkedPersonEntryId)
              : prev.personEntries,
            transactions: prev.transactions.filter((tItem) => tItem.id !== id),
          };
        });
        showToast(t(lang, 'تراکنش حذف شد', 'Transaction deleted'), 'info');
      },
    });
  };

  const handleAddOrUpdateCreditLine = (lineData: Omit<CreditLine, 'id'>, editId?: string) => {
    setState((prev) => ({
      ...prev,
      creditLines: editId
        ? (prev.creditLines ?? []).map((c) => (c.id === editId ? { ...lineData, id: editId } : c))
        : [...(prev.creditLines ?? []), { ...lineData, id: `cred_${Date.now()}` }],
    }));
    showToast(t(lang, 'خط اعتبار ذخیره شد', 'Credit line saved'), 'success');
  };

  const handleDeleteCreditLine = (id: string) => {
    setConfirmDialog({
      title: t(lang, 'حذف خط اعتبار', 'Delete Credit Line'),
      message: t(
        lang,
        'این خط اعتبار حذف شود؟ اقساط فعلی ثبت‌شده در دفتر وام همچنان باقی می‌مانند.',
        'Delete this credit line? Existing installment plans will remain in your schedule.'
      ),
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          creditLines: (prev.creditLines ?? []).filter((c) => c.id !== id),
        }));
        showToast(t(lang, 'خط اعتبار حذف شد', 'Credit line deleted'), 'info');
      },
    });
  };

  const handleAddOrUpdateBankAccount = (accData: Omit<BankAccount, 'id'>, editId?: string) => {
    setState((prev) => ({
      ...prev,
      bankAccounts: editId
        ? prev.bankAccounts.map((a) => (a.id === editId ? { ...accData, id: editId } : a))
        : [...prev.bankAccounts, { ...accData, id: `bank_${Date.now()}` }],
    }));
    showToast(t(lang, 'حساب بانکی ذخیره شد', 'Bank account saved'), 'success');
  };

  const handleDeleteBankAccount = (id: string) => {
    setConfirmDialog({
      title: t(lang, 'حذف حساب بانکی', 'Delete Bank Account'),
      message: t(lang, 'آیا از حذف این حساب اطمینان دارید؟', 'Are you sure you want to delete this account?'),
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          bankAccounts: prev.bankAccounts.filter((a) => a.id !== id),
        }));
        showToast(t(lang, 'حساب بانکی حذف شد', 'Bank account deleted'), 'info');
      },
    });
  };

  const handleAddOrUpdatePerson = (
    personData: Omit<PersonContact, 'id' | 'createdAt'>,
    editId?: string
  ) => {
    setState((prev) => ({
      ...prev,
      people: editId
        ? prev.people.map((p) => (p.id === editId ? { ...p, ...personData } : p))
        : [
            {
              ...personData,
              id: `per_${Date.now()}`,
              createdAt: new Date().toISOString(),
            },
            ...prev.people,
          ],
    }));
    showToast(
      editId
        ? t(lang, 'مشخصات شخص به‌روزرسانی شد', 'Person updated')
        : t(lang, 'شخص جدید به دفتر حساب اضافه شد', 'Person added to ledger'),
      'success'
    );
  };

  const handleDeletePerson = (personId: string) => {
    const person = state.people.find((p) => p.id === personId);
    setConfirmDialog({
      title: t(lang, 'حذف شخص و دفتر حساب', 'Delete Person & Ledger'),
      message: t(
        lang,
        `آیا از حذف «${person?.name ?? ''}» و تمام ردیف‌های دفتر حساب او اطمینان دارید؟`,
        `Delete "${person?.name ?? ''}" and all their ledger entries?`
      ),
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          people: prev.people.filter((p) => p.id !== personId),
          personEntries: prev.personEntries.filter((e) => e.personId !== personId),
        }));
        showToast(t(lang, 'شخص و دفتر حسابش حذف شد', 'Person deleted'), 'info');
      },
    });
  };

  const handleAddPersonEntry = (
    entryData: Omit<PersonLedgerEntry, 'id' | 'linkedTransactionId'>
  ) => {
    const person = state.people.find((p) => p.id === entryData.personId);
    const acc = entryData.accountId
      ? state.bankAccounts.find((a) => a.id === entryData.accountId)
      : undefined;

    let linkedTx: Transaction | undefined;
    let deltaInAcc = 0;

    if (acc) {
      deltaInAcc = convertCurrency(
        entryData.amount,
        entryData.currency,
        acc.currency,
        state.settings.usdToman
      );
      if (entryData.direction === 'give' && acc.balance < deltaInAcc) {
        showToast(
          t(lang, 'موجودی حساب بانکی انتخابی برای انتقال به شخص کافی نیست', 'Insufficient bank account balance'),
          'error'
        );
        return;
      }
      const txId = `tx_per_${Date.now()}`;
      linkedTx = {
        id: txId,
        type: entryData.direction === 'give' ? 'out' : 'in',
        amount: entryData.amount,
        currency: entryData.currency,
        accountId: acc.id,
        personId: entryData.personId,
        date: entryData.date,
        note: `${
          entryData.direction === 'give'
            ? t(lang, 'پرداخت / انتقال به', 'Paid to')
            : t(lang, 'دریافت / تسویه از', 'Received from')
        } ${person?.name ?? ''}${entryData.note ? ` — ${entryData.note}` : ''}`,
        source: 'person_ledger',
      };
    }

    const newEntry: PersonLedgerEntry = {
      ...entryData,
      id: `pe_${Date.now()}`,
      linkedTransactionId: linkedTx?.id,
    };

    setState((prev) => ({
      ...prev,
      personEntries: [newEntry, ...prev.personEntries],
      bankAccounts: acc
        ? prev.bankAccounts.map((a) =>
            a.id === acc.id
              ? {
                  ...a,
                  balance: Number(
                    (
                      a.balance + (entryData.direction === 'receive' ? deltaInAcc : -deltaInAcc)
                    ).toFixed(2)
                  ),
                }
              : a
          )
        : prev.bankAccounts,
      transactions: linkedTx ? [linkedTx, ...prev.transactions] : prev.transactions,
    }));

    showToast(
      acc
        ? t(lang, 'ثبت در دفتر شخص و به‌روزرسانی حساب بانکی انجام شد', 'Ledger & bank balance updated')
        : t(lang, 'ردیف دفتری در حساب شخص ثبت شد', 'Ledger entry recorded'),
      'success'
    );
  };

  const handleDeletePersonEntry = (entryId: string) => {
    setConfirmDialog({
      title: t(lang, 'حذف ردیف دفتر حساب', 'Delete Ledger Entry'),
      message: t(
        lang,
        'این ردیف از تاریخچه شخص حذف شود؟ (در صورت اتصال به حساب بانکی، موجودی حساب اصلاح می‌شود)',
        'Delete this ledger entry? Linked bank transaction will be reverted.'
      ),
      onConfirm: () => {
        setState((prev) => {
          const target = prev.personEntries.find((e) => e.id === entryId);
          if (!target) return prev;

          let nextAccounts = prev.bankAccounts;
          let nextTransactions = prev.transactions;

          if (target.linkedTransactionId && target.accountId) {
            const linkedTx = prev.transactions.find((tItem) => tItem.id === target.linkedTransactionId);
            if (linkedTx) {
              nextAccounts = prev.bankAccounts.map((a) => {
                if (a.id !== linkedTx.accountId) return a;
                const revertAmt = convertCurrency(
                  linkedTx.amount,
                  linkedTx.currency,
                  a.currency,
                  prev.settings.usdToman
                );
                return {
                  ...a,
                  balance: Number(
                    (a.balance + (linkedTx.type === 'in' ? -revertAmt : revertAmt)).toFixed(2)
                  ),
                };
              });
              nextTransactions = prev.transactions.filter(
                (tItem) => tItem.id !== target.linkedTransactionId
              );
            }
          }

          return {
            ...prev,
            bankAccounts: nextAccounts,
            transactions: nextTransactions,
            personEntries: prev.personEntries.filter((e) => e.id !== entryId),
          };
        });
        showToast(t(lang, 'ردیف دفتر حساب حذف شد', 'Ledger entry deleted'), 'info');
      },
    });
  };

  const handleAddBudgetCap = (
    categoryName: string,
    sourceAccountId: string,
    percentOfBalance: number,
    rolloverUnused: boolean
  ) => {
    const duplicate = state.budgetCaps.some(
      (b) => b.categoryName.trim().toLowerCase() === categoryName.trim().toLowerCase()
    );
    if (duplicate) {
      showToast(t(lang, 'این دسته از قبل بودجه دارد', 'This category already has a budget'), 'error');
      return;
    }
    setState((prev) => ({
      ...prev,
      budgetCaps: [
        ...prev.budgetCaps,
        {
          id: `bud_${Date.now()}`,
          categoryName,
          sourceAccountId,
          percentOfBalance,
          rolloverUnused,
          carriedOverAmount: 0,
        },
      ],
    }));
    showToast(t(lang, 'سقف بودجه اضافه شد', 'Budget cap added'), 'success');
  };

  const handleAddFixedExpense = (
    title: string,
    amount: number,
    currency: CurrencyCode,
    recurringMonthly: boolean,
    dayOfMonth: number,
    categoryId?: string
  ) => {
    const newId = `fe_${Date.now()}`;
    const todayJ = toJalali(new Date());
    const daysUntil = dayOfMonth >= todayJ.jd ? dayOfMonth - todayJ.jd : 30 - todayJ.jd + dayOfMonth;

    setState((prev) => ({
      ...prev,
      fixedExpenses: [
        ...prev.fixedExpenses,
        {
          id: newId,
          title,
          amount,
          currency,
          categoryId,
          recurringMonthly,
          dayOfMonth,
          active: true,
        },
      ],
      notifications:
        daysUntil <= 3
          ? [
              {
                id: `notif_fe_${Date.now()}`,
                title: t(lang, `سررسید هزینه ثابت: ${title}`, `Fixed Bill Due: ${title}`),
                detail: formatMoney(amount, currency, lang),
                daysLeft: daysUntil,
                source: 'fixed_expense',
                targetId: newId,
                read: false,
                createdAt: new Date().toISOString(),
              },
              ...prev.notifications,
            ]
          : prev.notifications,
    }));
    showToast(t(lang, 'هزینه ثابت ذخیره شد', 'Fixed expense added'), 'success');
  };

  const handleRunMonthlySync = () => {
    const monthKey = getCurrentJalaliMonthKey();
    const todayJ = toJalali(new Date());
    let createdCount = 0;

    setState((prev) => {
      const bankAccounts = prev.bankAccounts.map((a) => ({ ...a }));
      const newTxs: Transaction[] = [];
      const nextFixed = prev.fixedExpenses.map((fe) => {
        if (!fe.active || !fe.recurringMonthly) return fe;
        if (fe.lastGeneratedMonth === monthKey || fe.dayOfMonth > todayJ.jd) return fe;

        const targetAcc = bankAccounts.find((a) => a.currency === fe.currency) ?? bankAccounts[0];
        if (targetAcc) {
          const deduct = convertCurrency(fe.amount, fe.currency, targetAcc.currency, prev.settings.usdToman);
          targetAcc.balance -= deduct;
          newTxs.push({
            id: `tx_fe_${Date.now()}_${fe.id}`,
            type: 'out',
            amount: fe.amount,
            currency: fe.currency,
            accountId: targetAcc.id,
            budgetCategoryId: fe.categoryId,
            date: new Date().toISOString(),
            note: `${t(lang, 'هزینه ثابت ماهانه:', 'Monthly Fixed Bill:')} ${fe.title}`,
            source: 'fixed_expense',
          });
          createdCount += 1;
        }
        return { ...fe, lastGeneratedMonth: monthKey };
      });

      return {
        ...prev,
        bankAccounts,
        fixedExpenses: nextFixed,
        transactions: [...newTxs, ...prev.transactions],
        notifications:
          newTxs.length > 0
            ? [
                {
                  id: `notif_fe_sync_${Date.now()}`,
                  title: t(lang, `ثبت ${newTxs.length} هزینه ثابت ماهانه`, `${newTxs.length} Monthly Bills Logged`),
                  detail: newTxs.map((tx) => tx.note).join(' · '),
                  daysLeft: 0,
                  source: 'fixed_expense' as const,
                  severity: 'info' as const,
                  read: false,
                  createdAt: new Date().toISOString(),
                },
                ...prev.notifications,
              ].slice(0, 40)
            : prev.notifications,
      };
    });

    showToast(
      createdCount > 0
        ? t(lang, `${createdCount} تراکنش هزینه ثابت ماهانه تولید شد`, `${createdCount} monthly bills generated`)
        : t(lang, 'هزینه ثابت معوقی برای این ماه وجود نداشت', 'No pending recurring bills for this month'),
      'info'
    );
  };

  const handleAddLoan = (loanData: Omit<LoanItem, 'id' | 'paidInstallments' | 'status'>) => {
    const newId = `loan_${Date.now()}`;
    setState((prev) => ({
      ...prev,
      loans: [
        ...prev.loans,
        {
          ...loanData,
          id: newId,
          paidInstallments: 0,
          status: 'open',
        },
      ],
      notifications: [
        {
          id: `notif_loan_add_${Date.now()}`,
          title: t(lang, `ثبت تعهد / وام جدید: ${loanData.title}`, `New Debt / Loan: ${loanData.title}`),
          detail: t(
            lang,
            `مبلغ هر قسط: ${formatMoney(loanData.installmentAmount, loanData.currency, lang)} · ${loanData.totalInstallments} قسط`,
            `Installment: ${formatMoney(loanData.installmentAmount, loanData.currency, lang)} · ${loanData.totalInstallments} payments`
          ),
          daysLeft: Math.max(0, Math.ceil((new Date(loanData.dueDate).getTime() - Date.now()) / 86400000)),
          source: 'loan' as const,
          severity: 'warning' as const,
          targetId: newId,
          read: false,
          createdAt: new Date().toISOString(),
        },
        ...prev.notifications,
      ].slice(0, 40),
    }));
    showToast(t(lang, 'وام / بدهی ثبت شد', 'Loan / Debt recorded'), 'success');
  };

  const handlePayLoanInstallment = (loanId: string, accountId: string) => {
    const loan = state.loans.find((l) => l.id === loanId);
    const acc = state.bankAccounts.find((a) => a.id === accountId);
    if (!loan || !acc) return;

    let deductAmount: number;
    try {
      deductAmount = convertCurrency(
        loan.installmentAmount,
        loan.currency,
        acc.currency,
        state.settings.usdToman
      );
    } catch (err) {
      showToast((err as Error).message, 'error');
      return;
    }

    if (acc.balance < deductAmount) {
      showToast(t(lang, 'موجودی کافی نیست', 'Insufficient balance'), 'error');
      return;
    }

    const nextPaid = loan.paidInstallments + 1;
    const isFinished = nextPaid >= loan.totalInstallments;
    const nowIso = new Date().toISOString();

    setState((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((a) =>
        a.id === acc.id ? { ...a, balance: Number((a.balance - deductAmount).toFixed(2)) } : a
      ),
      transactions: [
        {
          id: `tx_loan_${Date.now()}`,
          type: 'out',
          amount: deductAmount,
          currency: acc.currency,
          accountId: acc.id,
          date: nowIso,
          note: `${t(lang, 'پرداخت قسط:', 'Installment:')} ${loan.title} (${nextPaid}/${loan.totalInstallments})`,
          source: loan.creditLineId ? 'credit_installment' : 'loan_installment',
        },
        ...prev.transactions,
      ],
      loans: prev.loans.map((l) =>
        l.id === loan.id
          ? {
              ...l,
              paidInstallments: nextPaid,
              status: isFinished ? 'closed' : 'open',
              dueDate: isFinished ? l.dueDate : addJalaliMonths(l.dueDate, 1).toISOString(),
            }
          : l
      ),
      notifications: [
        {
          id: `notif_loan_paid_${Date.now()}`,
          title: isFinished
            ? t(lang, `تسویه کامل وام «${loan.title}»`, `Loan "${loan.title}" Paid Off`)
            : t(lang, `پرداخت قسط ${nextPaid}/${loan.totalInstallments} — ${loan.title}`, `Installment ${nextPaid}/${loan.totalInstallments} Paid`),
          detail: t(
            lang,
            `برداشت ${formatMoney(deductAmount, acc.currency, lang)} از ${acc.name}`,
            `Deducted ${formatMoney(deductAmount, acc.currency, lang)} from ${acc.name}`
          ),
          daysLeft: 0,
          source: 'loan' as const,
          severity: 'success' as const,
          targetId: loan.id,
          read: false,
          createdAt: nowIso,
        },
        ...prev.notifications.map((n) =>
          n.source === 'loan' && n.targetId === loan.id ? { ...n, read: true } : n
        ),
      ].slice(0, 40),
    }));

    showToast(
      isFinished
        ? t(lang, `تبریک! وام «${loan.title}» کاملاً تسویه و بسته شد`, `Loan "${loan.title}" fully paid off!`)
        : t(lang, `قسط ${nextPaid}/${loan.totalInstallments} پرداخت شد`, `Installment ${nextPaid}/${loan.totalInstallments} paid`),
      'success'
    );
  };

  const handlePayTopPriorityDebt = (accountId: string) => {
    const plan = computeDebtPayoffPlan(
      state.loans,
      'avalanche',
      state.settings.usdToman,
      state.people ?? [],
      state.personEntries ?? []
    );
    const top = plan.priorityQueue[0];
    if (!top) {
      showToast(t(lang, 'هیچ قسط یا بدهی بازی برای پرداخت وجود ندارد', 'No open debt or installment to pay'), 'info');
      return;
    }

    if (top.kind === 'loan_installment' && top.loanId) {
      handlePayLoanInstallment(top.loanId, accountId);
      return;
    }

    if (top.kind === 'personal_debt' && top.personId) {
      const acc = state.bankAccounts.find((a) => a.id === accountId);
      if (!acc) return;
      const deductInAcc = convertCurrency(top.dueAmountIrt, 'IRT', acc.currency, state.settings.usdToman);
      if (acc.balance < deductInAcc) {
        showToast(t(lang, 'موجودی حساب بانکی برای تسویه بدهی کافی نیست', 'Insufficient balance to settle debt'), 'error');
        return;
      }
      handleAddPersonEntry({
        personId: top.personId,
        direction: 'give',
        amount: Math.round(top.dueAmountIrt),
        currency: 'IRT',
        accountId: acc.id,
        date: new Date().toISOString(),
        note: t(lang, `پرداخت اولویت اول بدهی: ${top.title}`, `Priority #1 Debt Settlement: ${top.title}`),
      });
      setState((prev) => ({
        ...prev,
        notifications: [
          {
            id: `notif_debt_paid_${Date.now()}`,
            title: t(lang, `تسویه بدهی اولویت #۱: ${top.title}`, `Priority #1 Debt Settled: ${top.title}`),
            detail: t(
              lang,
              `مبلغ ${formatMoney(top.dueAmountIrt, 'IRT', lang)} از ${acc.name} پرداخت شد`,
              `Paid ${formatMoney(top.dueAmountIrt, 'IRT', lang)} from ${acc.name}`
            ),
            daysLeft: 0,
            source: 'debt' as const,
            severity: 'success' as const,
            targetId: top.personId,
            read: false,
            createdAt: new Date().toISOString(),
          },
          ...prev.notifications,
        ].slice(0, 40),
      }));
    }
  };

  const rebalanceGoalList = (goals: Goal[], poolIrt: number, usdToman: number): Goal[] => {
    const allocs = computePriorityGoalAllocations(goals, poolIrt, usdToman);
    return goals.map((g) => {
      const alloc = allocs.find((a) => a.goalId === g.id);
      if (!alloc || g.autoPriorityBudget === false) return g;
      return {
        ...g,
        allocationPct: Math.round(alloc.sharePct),
        weeklyBudgetAmount: Math.round(alloc.weeklyAmountInGoalCurrency),
      };
    });
  };

  const handleCreateGoal = (goalData: Omit<Goal, 'id' | 'savedAmount' | 'status' | 'createdAt'>) => {
    setState((prev) => ({
      ...prev,
      goals: [
        {
          ...goalData,
          autoPriorityBudget: goalData.autoPriorityBudget ?? true,
          id: `goal_${Date.now()}`,
          savedAmount: 0,
          status: 'draft',
          createdAt: new Date().toISOString(),
        },
        ...prev.goals,
      ],
    }));
    showToast(t(lang, 'هدف جدید با وضعیت پیش‌نویس ذخیره شد', 'Goal saved as draft'), 'success');
  };

  const handleChangeGoalStatus = (goalId: string, status: Goal['status']) => {
    const nowIso = new Date().toISOString();
    setState((prev) => {
      const updated = prev.goals.map((g) => {
        if (g.id !== goalId) return g;
        if (status === 'completed') {
          return { ...g, status, completedAt: g.completedAt ?? nowIso };
        }
        if (status === 'archived') {
          return { ...g, status, archivedAt: g.archivedAt ?? nowIso };
        }
        if (status === 'active') {
          return { ...g, status, archivedAt: undefined };
        }
        return { ...g, status };
      });
      const poolIrt = prev.settings.weeklyGoalPoolIrt ?? 18000000;
      return {
        ...prev,
        goals: rebalanceGoalList(updated, poolIrt, prev.settings.usdToman),
      };
    });
    showToast(t(lang, 'وضعیت هدف به‌روزرسانی شد', 'Goal status updated'), 'info');
  };

  const handleChangeGoalPriority = (goalId: string, priority: number) => {
    const clampedPriority = Math.min(5, Math.max(1, Math.round(priority)));
    setState((prev) => {
      const updated = prev.goals.map((g) =>
        g.id === goalId ? { ...g, priority: clampedPriority, autoPriorityBudget: true } : g
      );
      const poolIrt = prev.settings.weeklyGoalPoolIrt ?? 18000000;
      return {
        ...prev,
        goals: rebalanceGoalList(updated, poolIrt, prev.settings.usdToman),
      };
    });
    showToast(
      t(lang, `اولویت به P${clampedPriority} تغییر یافت و بودجه اهداف بازتوزیع شد`, `Priority set to P${clampedPriority} & budgets rebalanced`),
      'success'
    );
  };

  const handleUpdateWeeklyGoalPool = (poolIrt: number) => {
    const cleanPool = Math.max(0, Math.round(poolIrt));
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, weeklyGoalPoolIrt: cleanPool },
      goals: rebalanceGoalList(prev.goals, cleanPool, prev.settings.usdToman),
    }));
    showToast(
      t(lang, 'استخر بودجه هفتگی ذخیره و سهم اهداف بازتخصیص شد', 'Weekly goal pool updated & rebalanced'),
      'success'
    );
  };

  const handleFundWeeklyGoalPool = (poolIrt: number, sourceAccountId?: string) => {
    const cleanPool = Math.max(0, Math.round(poolIrt));
    if (cleanPool <= 0) {
      showToast(t(lang, 'مبلغ استخر هفتگی باید بیشتر از صفر باشد', 'Weekly pool must be positive'), 'error');
      return;
    }

    const allocs = computePriorityGoalAllocations(state.goals, cleanPool, state.settings.usdToman);
    if (allocs.length === 0) {
      showToast(t(lang, 'هیچ هدف فعالی برای بودجه‌بندی وجود ندارد', 'No active goals to fund'), 'info');
      return;
    }

    let deductFromAcc = 0;
    const acc = sourceAccountId ? state.bankAccounts.find((a) => a.id === sourceAccountId) : undefined;
    if (acc) {
      deductFromAcc = convertCurrency(cleanPool, 'IRT', acc.currency, state.settings.usdToman);
      if (acc.balance < deductFromAcc) {
        showToast(t(lang, 'موجودی حساب انتخابی کافی نیست', 'Insufficient account balance'), 'error');
        return;
      }
      const finSummary = computeFinanceSummary(
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
      );
      const freeAfterTier1Debt = Math.max(
        0,
        finSummary.totalBankIrt - finSummary.debtFirstWaterfall.tier1TotalIrt
      );
      if (finSummary.debtFirstWaterfall.tier1TotalIrt > 0 && cleanPool > freeAfterTier1Debt) {
        showToast(
          t(
            lang,
            `اولویت اول با اقساط و بدهی‌هاست (${formatMoney(finSummary.debtFirstWaterfall.tier1TotalIrt, 'IRT', lang, true)} رزرو بدهی). سقف آزاد اهداف: ${formatMoney(freeAfterTier1Debt, 'IRT', lang, true)}`,
            `Debt-First protection: ${formatMoney(finSummary.debtFirstWaterfall.tier1TotalIrt, 'IRT', lang, true)} is reserved for installments & debts. Max free pool: ${formatMoney(freeAfterTier1Debt, 'IRT', lang, true)}`
          ),
          'error'
        );
        return;
      }
    }

    let newlyCompletedCount = 0;
    const completedTitles: string[] = [];
    const nowIso = new Date().toISOString();

    setState((prev) => {
      const mappedGoals = prev.goals.map((g) => {
        const alloc = allocs.find((a) => a.goalId === g.id);
        if (!alloc) return g;
        const nextSaved = Number((g.savedAmount + alloc.weeklyAmountInGoalCurrency).toFixed(2));
        const justCompleted = g.status === 'active' && nextSaved >= g.targetAmount;
        if (justCompleted) {
          newlyCompletedCount += 1;
          completedTitles.push(g.title);
        }
        return {
          ...g,
          savedAmount: nextSaved,
          allocationPct: Math.round(alloc.sharePct),
          weeklyBudgetAmount: Math.round(alloc.weeklyAmountInGoalCurrency),
          status: justCompleted ? ('completed' as const) : g.status,
          completedAt: justCompleted ? (g.completedAt ?? nowIso) : g.completedAt,
        };
      });

      const rebalancedGoals = rebalanceGoalList(mappedGoals, cleanPool, prev.settings.usdToman);

      return {
        ...prev,
        settings: { ...prev.settings, weeklyGoalPoolIrt: cleanPool },
        bankAccounts: acc
          ? prev.bankAccounts.map((a) =>
              a.id === acc.id ? { ...a, balance: Number((a.balance - deductFromAcc).toFixed(2)) } : a
            )
          : prev.bankAccounts,
        transactions: acc
          ? [
              {
                id: `tx_pool_${Date.now()}`,
                type: 'out',
                amount: deductFromAcc,
                currency: acc.currency,
                accountId: acc.id,
                date: nowIso,
                note: t(lang, 'بودجه‌ریزی هفتگی اهداف (وزن‌دار بر اساس اولویت)', 'Weekly Priority-Weighted Goal Pool'),
                source: 'goal_allocation',
              },
              ...prev.transactions,
            ]
          : prev.transactions,
        goals: rebalancedGoals,
        gamification: {
          ...prev.gamification,
          xpTotal: prev.gamification.xpTotal + 120 + newlyCompletedCount * 150,
        },
        notifications:
          newlyCompletedCount > 0
            ? [
                {
                  id: `notif_pool_done_${Date.now()}`,
                  title: t(
                    lang,
                    `تکمیل و آرشیو خودکار ${newlyCompletedCount} هدف مالی`,
                    `${newlyCompletedCount} Goal(s) Reached 100% & Archived`
                  ),
                  detail: completedTitles.join(' · '),
                  daysLeft: 0,
                  source: 'goal' as const,
                  severity: 'success' as const,
                  read: false,
                  createdAt: nowIso,
                },
                ...prev.notifications,
              ].slice(0, 40)
            : prev.notifications,
      };
    });

    showToast(
      newlyCompletedCount > 0
        ? t(
            lang,
            `بودجه تقسیم شد و ${newlyCompletedCount} هدف پاس‌شده به تاریخچه منتقل گردید (+${120 + newlyCompletedCount * 150} XP)`,
            `Pool distributed & ${newlyCompletedCount} completed goal(s) archived to history (+${120 + newlyCompletedCount * 150} XP)`
          )
        : t(
            lang,
            `بودجه هفتگی بین ${allocs.length} هدف فعال بر اساس وزن اولویت تقسیم شد (+120 XP)`,
            `Weekly pool distributed across ${allocs.length} active goals by priority weight (+120 XP)`
          ),
      'success'
    );
  };

  const handleAllocateToGoal = (goalId: string, amount: number, sourceAccountId?: string) => {
    const goal = state.goals.find((g) => g.id === goalId);
    if (!goal) return;

    let deductFromAcc = 0;
    const acc = sourceAccountId ? state.bankAccounts.find((a) => a.id === sourceAccountId) : undefined;
    if (acc) {
      deductFromAcc = convertCurrency(amount, goal.currency, acc.currency, state.settings.usdToman);
      if (acc.balance < deductFromAcc) {
        showToast(t(lang, 'موجودی حساب انتخابی کافی نیست', 'Insufficient account balance'), 'error');
        return;
      }
      const finSummary = computeFinanceSummary(
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
      );
      const amountIrt = convertCurrency(amount, goal.currency, 'IRT', state.settings.usdToman);
      const freeAfterTier1Debt = Math.max(
        0,
        finSummary.totalBankIrt - finSummary.debtFirstWaterfall.tier1TotalIrt
      );
      if (finSummary.debtFirstWaterfall.tier1TotalIrt > 0 && amountIrt > freeAfterTier1Debt) {
        showToast(
          t(
            lang,
            `محافظت اولویت بدهی: ابتدا اقساط و بدهی‌های معوق (${formatMoney(finSummary.debtFirstWaterfall.tier1TotalIrt, 'IRT', lang, true)}) را پوشش دهید. مانده آزاد: ${formatMoney(freeAfterTier1Debt, 'IRT', lang, true)}`,
            `Debt-First guard: cover priority installments/debts first. Free balance after Tier-1 debt: ${formatMoney(freeAfterTier1Debt, 'IRT', lang, true)}`
          ),
          'error'
        );
        return;
      }
    }

    const nextSaved = goal.savedAmount + amount;
    const completed = nextSaved >= goal.targetAmount;
    const nowIso = new Date().toISOString();

    setState((prev) => {
      const updatedGoals = prev.goals.map((g) =>
        g.id === goalId
          ? {
              ...g,
              savedAmount: nextSaved,
              status: completed ? ('completed' as const) : g.status,
              completedAt: completed ? (g.completedAt ?? nowIso) : g.completedAt,
            }
          : g
      );
      const poolIrt = prev.settings.weeklyGoalPoolIrt ?? 18000000;
      return {
        ...prev,
        bankAccounts: acc
          ? prev.bankAccounts.map((a) =>
              a.id === acc.id ? { ...a, balance: Number((a.balance - deductFromAcc).toFixed(2)) } : a
            )
          : prev.bankAccounts,
        transactions: acc
          ? [
              {
                id: `tx_goal_${Date.now()}`,
                type: 'out',
                amount: deductFromAcc,
                currency: acc.currency,
                accountId: acc.id,
                date: nowIso,
                note: `${t(lang, 'تخصیص به هدف:', 'Goal Allocation:')} ${goal.title}`,
                source: 'goal_allocation',
              },
              ...prev.transactions,
            ]
          : prev.transactions,
        goals: completed
          ? rebalanceGoalList(updatedGoals, poolIrt, prev.settings.usdToman)
          : updatedGoals,
        gamification: {
          ...prev.gamification,
          xpTotal: prev.gamification.xpTotal + (completed ? 250 : 60),
        },
        notifications: completed
          ? [
              {
                id: `notif_goal_done_${Date.now()}`,
                title: t(lang, `تکمیل ۱۰۰٪ هدف «${goal.title}»`, `Goal "${goal.title}" Completed!`),
                detail: t(lang, 'پاداش +250 XP اضافه شد و هدف در تاریخچه آرشیو گردید', '+250 XP added & archived to Goal History'),
                daysLeft: 0,
                source: 'goal' as const,
                severity: 'success' as const,
                targetId: goal.id,
                read: false,
                createdAt: nowIso,
              },
              ...prev.notifications,
            ].slice(0, 40)
          : prev.notifications,
      };
    });

    showToast(
      completed
        ? t(lang, `تبریک! هدف «${goal.title}» پاس شد و به تاریخچه منتقل گردید (+250 XP)`, `Goal "${goal.title}" passed & archived to history! (+250 XP)`)
        : t(lang, 'مبلغ به هدف تخصیص داده شد (+60 XP)', 'Funds allocated to goal (+60 XP)'),
      'success'
    );
  };

  const handleDistributeTodayProfitToGoals = () => {
    const game = evaluateGamification(state);
    const profitUsd = game.todayKpis.netProfitUsd;
    if (profitUsd <= 0) {
      showToast(t(lang, 'سود خالص مثبتی برای امروز ثبت نشده است', 'No positive net profit today'), 'info');
      return;
    }
    const poolIrt = state.settings.weeklyGoalPoolIrt ?? 18000000;
    const allocs = computePriorityGoalAllocations(state.goals, poolIrt, state.settings.usdToman);
    if (allocs.length === 0) return;

    const nowIso = new Date().toISOString();
    const completedNames: string[] = [];

    setState((prev) => {
      const mapped = prev.goals.map((g) => {
        if (g.status !== 'active') return g;
        const alloc = allocs.find((a) => a.goalId === g.id);
        const shareRatio = (alloc?.sharePct ?? g.allocationPct) / 100;
        const shareUsd = profitUsd * shareRatio;
        const shareInGoalCurr = convertCurrency(shareUsd, 'USD', g.currency, prev.settings.usdToman);
        const nextSaved = Number((g.savedAmount + shareInGoalCurr).toFixed(2));
        const justCompleted = nextSaved >= g.targetAmount;
        if (justCompleted) completedNames.push(g.title);
        return {
          ...g,
          savedAmount: nextSaved,
          status: justCompleted ? ('completed' as const) : ('active' as const),
          completedAt: justCompleted ? (g.completedAt ?? nowIso) : g.completedAt,
        };
      });

      const completedCount = completedNames.length;
      const rebalanced = rebalanceGoalList(mapped, poolIrt, prev.settings.usdToman);

      return {
        ...prev,
        goals: rebalanced,
        gamification: {
          ...prev.gamification,
          xpTotal: prev.gamification.xpTotal + 100 + completedCount * 150,
        },
        notifications:
          completedCount > 0
            ? [
                {
                  id: `notif_profit_goal_${Date.now()}`,
                  title: t(
                    lang,
                    `تکمیل ${completedCount} هدف با سود ترید امروز`,
                    `${completedCount} Goal(s) Passed via Today's Profit`
                  ),
                  detail: completedNames.join(' · '),
                  daysLeft: 0,
                  source: 'goal' as const,
                  severity: 'success' as const,
                  read: false,
                  createdAt: nowIso,
                },
                ...prev.notifications,
              ].slice(0, 40)
            : prev.notifications,
      };
    });

    showToast(
      completedNames.length > 0
        ? t(
            lang,
            `سود تقسیم شد و ${completedNames.length} هدف پاس‌شده به تاریخچه منتقل گردید (+${100 + completedNames.length * 150} XP)`,
            `Profit distributed & ${completedNames.length} passed goal(s) archived (+${100 + completedNames.length * 150} XP)`
          )
        : t(lang, 'سود ترید امروز بر اساس وزن اولویت بین اهداف فعال تقسیم شد (+100 XP)', "Today's profit distributed by priority weight (+100 XP)"),
      'success'
    );
  };

  const handleDeleteGoal = (goalId: string) => {
    setConfirmDialog({
      title: t(lang, 'حذف هدف', 'Delete Goal'),
      message: t(lang, 'آیا از حذف این هدف اطمینان دارید؟', 'Delete this goal?'),
      onConfirm: () => {
        setState((prev) => {
          const remaining = prev.goals.filter((g) => g.id !== goalId);
          const poolIrt = prev.settings.weeklyGoalPoolIrt ?? 18000000;
          const next: FundTrackState = {
            ...prev,
            goals: rebalanceGoalList(remaining, poolIrt, prev.settings.usdToman),
            customMissions: prev.customMissions.filter((m) => m.linkedGoalId !== goalId),
          };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Ignore storage quota issues
          }
          return next;
        });
        showToast(t(lang, 'هدف به‌صورت دائمی حذف شد', 'Goal permanently deleted'), 'info');
      },
    });
  };

  const handleOverrideMission = (key: string, target?: number, stars?: number) => {
    setState((prev) => ({
      ...prev,
      missionConfigs: prev.missionConfigs.map((m) =>
        m.key === key ? { ...m, overrideTarget: target, overrideStars: stars } : m
      ),
    }));
    showToast(t(lang, 'تنظیمات مأموریت ذخیره شد', 'Mission override saved'), 'success');
  };

  const handleCreateCustomMission = (cm: Omit<CustomMission, 'id'>) => {
    setState((prev) => ({
      ...prev,
      customMissions: [...prev.customMissions, { ...cm, id: `cm_${Date.now()}` }],
    }));
    showToast(t(lang, 'مأموریت سفارشی ایجاد شد', 'Custom mission created'), 'success');
  };

  const handleDeleteCustomMission = (id: string) => {
    setConfirmDialog({
      title: t(lang, 'حذف مأموریت سفارشی', 'Delete Custom Mission'),
      message: t(lang, 'این مأموریت حذف شود؟', 'Delete this custom mission?'),
      onConfirm: () => {
        setState((prev) => ({
          ...prev,
          customMissions: prev.customMissions.filter((m) => m.id !== id),
        }));
      },
    });
  };

  const handleIncrementCustomMission = (id: string, delta: number) => {
    setState((prev) => ({
      ...prev,
      customMissions: prev.customMissions.map((m) =>
        m.id === id ? { ...m, manualProgress: (m.manualProgress ?? 0) + delta } : m
      ),
    }));
  };

  const handleClaimDailyCombo = () => {
    const todayKey = getTodayKey();
    setState((prev) => {
      if (prev.gamification.claimedComboDays.includes(todayKey)) return prev;
      return {
        ...prev,
        gamification: {
          ...prev.gamification,
          xpTotal: prev.gamification.xpTotal + 150,
          starsBonus: prev.gamification.starsBonus + 2,
          streakDays: prev.gamification.streakDays + 1,
          claimedComboDays: [...prev.gamification.claimedComboDays, todayKey],
        },
      };
    });
    showToast(t(lang, 'پاداش کمبوی طلایی امروز دریافت شد: +150 XP و +2★', 'Golden Combo claimed: +150 XP & +2★'), 'success');
  };

  const handleConfirmBudgetDay = () => {
    const todayKey = getTodayKey();
    setState((prev) => {
      if (prev.gamification.dailyBudgetUnderCapConfirmedDays.includes(todayKey)) return prev;
      return {
        ...prev,
        gamification: {
          ...prev.gamification,
          xpTotal: prev.gamification.xpTotal + 35,
          dailyBudgetUnderCapConfirmedDays: [...prev.gamification.dailyBudgetUnderCapConfirmedDays, todayKey],
        },
      };
    });
    showToast(t(lang, 'انضباط بودجه امروز تایید شد (+35 XP)', 'Under-budget day confirmed (+35 XP)'), 'success');
  };

  const handleNotificationAction = (n: NotificationItem) => {
    if (n.source === 'loan' || n.source === 'fixed_expense') {
      handleNavigate('finance', 'planning');
    } else if (n.source === 'debt') {
      handleNavigate('finance', 'people');
    } else if (n.source === 'news') {
      handleNavigate('trading', 'calendar');
    } else if (n.source === 'system') {
      handleNavigate('system', 'health');
    } else {
      handleNavigate('growth', 'goals');
    }
  };

  const handleResetDemoData = () => {
    setConfirmDialog({
      title: t(lang, 'بازگردانی داده‌های اولیه', 'Reset Sample Data'),
      message: t(lang, 'تمام تغییرات فعلی با داده‌های نمونه اولیه جایگزین می‌شوند.', 'Replace current state with initial sample data?'),
      onConfirm: () => {
        localStorage.removeItem(STORAGE_KEY);
        setState(INITIAL_STATE);
        showToast(t(lang, 'داده‌های اولیه بازیابی شدند', 'Sample data restored'), 'info');
      },
    });
  };

  const handleWipeAllData = () => {
    setConfirmDialog({
      title: t(lang, 'پاکسازی کامل اطلاعات و شروع از صفر', 'Wipe All Panel Data'),
      message: t(
        lang,
        'تمام معاملات، حساب‌های MT5 و بانکی، تراکنش‌ها، بدهی‌ها، اهداف و تاریخچه نمونه به‌صورت دائمی پاک می‌شوند (تنظیمات ظاهری، نرخ دلار و رمز پنل حفظ می‌گردد).',
        'All sample and recorded trades, accounts, transactions, debts, and goals will be permanently cleared (theme, FX rate & PIN settings remain).'
      ),
      onConfirm: () => {
        const empty = createEmptyState({
          language: state.settings.language,
          theme: state.settings.theme,
          backdropPreset: state.settings.backdropPreset,
          backdropCustomUrl: state.settings.backdropCustomUrl,
          backdropBlur: state.settings.backdropBlur,
          backdropBrightness: state.settings.backdropBrightness,
          glassOpacity: state.settings.glassOpacity,
          glassBlur: state.settings.glassBlur,
          highContrastCards: state.settings.highContrastCards,
          baseCurrency: state.settings.baseCurrency,
          showTomanEquivalent: state.settings.showTomanEquivalent,
          pinEnabled: state.settings.pinEnabled,
          pinCode: state.settings.pinCode,
          pinHash: state.settings.pinHash,
          autoLockMinutes: state.settings.autoLockMinutes,
          privateMode: state.settings.privateMode,
          lanSyncEnabled: state.settings.lanSyncEnabled,
          lanSyncUrl: state.settings.lanSyncUrl,
          lanSyncKey: state.settings.lanSyncKey,
          lanAutoFallbackDrive: state.settings.lanAutoFallbackDrive,
          e2eEncryptionEnabled: state.settings.e2eEncryptionEnabled,
          usdToman: state.settings.usdToman,
          fxAutoUpdate: state.settings.fxAutoUpdate,
          defaultRange: state.settings.defaultRange,
          dailyMaxLossPct: state.settings.dailyMaxLossPct,
          defaultRiskPct: state.settings.defaultRiskPct,
          localAi: state.settings.localAi,
        });
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
        } catch {
          // Ignore quota errors
        }
        setUsingDemoFallback(false);
        setState(empty);
        showToast(t(lang, 'تمامی داده‌های پنل با موفقیت پاکسازی شدند', 'All panel data wiped cleanly'), 'success');
      },
    });
  };

  const handleStartEmptyFromDemo = () => {
    const empty = createEmptyState({
      language: state.settings.language,
      theme: state.settings.theme,
      usdToman: state.settings.usdToman,
      defaultRange: state.settings.defaultRange,
      localAi: state.settings.localAi,
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    } catch {
      // Ignore quota errors
    }
    setUsingDemoFallback(false);
    setSyncBannerDismissed(true);
    setState(empty);
    showToast(t(lang, 'داده‌های دمو حذف شدند — پنل آماده ثبت اطلاعات واقعی شماست', 'Demo data cleared — ready for your real records'), 'success');
  };

  const handleConnectAndPullFromBanner = async () => {
    setSyncBusy(true);
    try {
      const candidateKey = pairingKeyInput.trim() || state.settings.lanSyncKey?.trim() || '';
      const activeKey = candidateKey || (await fetchHostPairingKey(state.settings.lanSyncUrl)) || '';
      if (!activeKey) {
        showToast(
          t(
            lang,
            'کلید اتصال لازم است (آن را از تنظیمات دسکتاپ ← پشتیبان و نصب کپی کنید یا لینک جفت‌سازی را باز نمایید)',
            'Pairing key required — copy it or open the 1-click pairing link from Desktop Backup settings'
          ),
          'error'
        );
        return;
      }
      const pulled = await pullStateFromLanDb({
        url: state.settings.lanSyncUrl,
        syncKey: activeKey,
      });
      applySyncedState(pulled.state, {
        lanUrl: state.settings.lanSyncUrl,
        lanKey: activeKey,
        channel: 'lan',
        revision: pulled.revision,
        updatedAt: pulled.updatedAt,
      });
      showToast(t(lang, 'داده‌های واقعی شما با موفقیت بارگذاری شدند', 'Real data synced cleanly!'), 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'PASSPHRASE_REQUIRED') {
        setCategory('system');
        setSystemSub('backup');
        showToast(t(lang, 'داده‌ها رمزنگاری E2E هستند؛ عبارت رمز را در بخش پشتیبان وارد کنید.', 'E2E encrypted — unlock in Backup & Install.'), 'info');
      } else {
        showToast(
          t(lang, 'کلید اتصال نامعتبر است یا هنوز داده‌ای از دسکتاپ ارسال نشده است', 'Invalid pairing key or no snapshot saved on server yet'),
          'error'
        );
      }
    } finally {
      setSyncBusy(false);
    }
  };

  const handleRestoreState = (restored: FundTrackState, target: 'local' | 'gdrive' | 'lan') => {
    const base = createEmptyState();
    const nowIso = new Date().toISOString();
    const merged: FundTrackState = {
      ...base,
      ...restored,
      settings: {
        ...base.settings,
        ...(restored.settings || {}),
        // Preserve local connection preferences if restored payload omits them
        lanSyncKey: restored.settings?.lanSyncKey || state.settings.lanSyncKey,
        lanSyncUrl: restored.settings?.lanSyncUrl || state.settings.lanSyncUrl,
        lastBackupAt: nowIso,
        lastBackupTarget: target,
        ...(target === 'lan' || target === 'gdrive'
          ? {
              lastLanSyncAt: nowIso,
              lastSyncMode: target === 'lan' ? ('lan' as const) : ('gdrive' as const),
            }
          : {}),
      },
      gamification: {
        ...base.gamification,
        ...(restored.gamification || {}),
      },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore quota errors
    }
    skipNextAutoPushRef.current = true;
    setUsingDemoFallback(false);
    setSyncBannerDismissed(true);
    setState(merged);
  };

  // --- Persistent Multi-Thread Assistant & Long-Term Memory Helpers ---

  const makeAssistantThread = useCallback(
    (greetToday: boolean): AssistantThread => {
      const nowIso = new Date().toISOString();
      const todayKey = toLocalIsoDate(new Date());
      return {
        id: `thread_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: t(lang, 'گفتگوی جدید', 'New Conversation'),
        createdAt: nowIso,
        updatedAt: nowIso,
        messages: greetToday
          ? [
              {
                id: `welcome_${todayKey}`,
                role: 'assistant',
                text: t(
                  lang,
                  'سلام! دستیار و تحلیل‌گر هوشمند پنل آماده است. می‌توانم خطوط اعتبار، حساب‌ها، اشخاص، بدهی‌ها، اهداف، هزینه‌های ثابت، بودجه و تراکنش‌ها را تعریف و اجرا کنم یا درباره آمار ترید و مالی مشورت بدهم.',
                  'Hello! Your Panel Copilot & Analyst is ready. I can open credit lines, create accounts/people/loans/goals/budgets, log transactions, or run statistical analysis across your trading & finances.'
                ),
                createdAt: nowIso,
              },
            ]
          : [],
      };
    },
    [lang]
  );

  const activeAssistantThread = useMemo<AssistantThread>(() => {
    const threads = state.assistantThreads ?? [];
    if (threads.length > 0) {
      return (
        threads.find((th) => th.id === state.activeAssistantThreadId) ?? threads[0]
      );
    }
    const todayKey = toLocalIsoDate(new Date());
    const shouldGreet = state.lastAssistantGreetedDate !== todayKey;
    const nowIso = new Date().toISOString();
    return {
      id: 'thread_initial',
      title: t(lang, 'گفتگوی روزانه پنل', 'Daily Panel Copilot'),
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: shouldGreet
        ? [
            {
              id: `welcome_${todayKey}`,
              role: 'assistant',
              text: t(
                lang,
                'سلام! دستیار و تحلیل‌گر هوشمند پنل آماده است. می‌توانم خطوط اعتبار، حساب‌ها، اشخاص، بدهی‌ها، اهداف، هزینه‌های ثابت، بودجه و تراکنش‌ها را تعریف و اجرا کنم یا درباره آمار ترید و مالی مشورت بدهم.',
                'Hello! Your Panel Copilot & Analyst is ready. I can open credit lines, create accounts/people/loans/goals/budgets, log transactions, or run statistical analysis across your trading & finances.'
              ),
              createdAt: nowIso,
            },
          ]
        : [],
    };
  }, [state.assistantThreads, state.activeAssistantThreadId, state.lastAssistantGreetedDate, lang]);

  // Mark daily greeting consumed once user opens assistant drawer or workspace today
  useEffect(() => {
    if (!aiCommandOpen && category !== 'assistant') return;
    const todayKey = toLocalIsoDate(new Date());
    if (state.lastAssistantGreetedDate === todayKey) return;
    setState((prev) => {
      if (prev.lastAssistantGreetedDate === todayKey) return prev;
      const hasThreads = (prev.assistantThreads ?? []).length > 0;
      const nextThreads = hasThreads
        ? prev.assistantThreads!
        : [activeAssistantThread];
      return {
        ...prev,
        lastAssistantGreetedDate: todayKey,
        assistantThreads: nextThreads,
        activeAssistantThreadId: prev.activeAssistantThreadId || nextThreads[0].id,
      };
    });
  }, [aiCommandOpen, category, state.lastAssistantGreetedDate, activeAssistantThread]);

  const handleSelectThread = useCallback((threadId: string) => {
    setState((prev) => ({
      ...prev,
      activeAssistantThreadId: threadId,
    }));
  }, []);

  const handleCreateNewThread = useCallback(() => {
    const todayKey = toLocalIsoDate(new Date());
    const greetToday = stateRef.current.lastAssistantGreetedDate !== todayKey;
    const nextThread = makeAssistantThread(greetToday);
    setState((prev) => ({
      ...prev,
      assistantThreads: [nextThread, ...(prev.assistantThreads ?? [])].slice(0, 40),
      activeAssistantThreadId: nextThread.id,
      lastAssistantGreetedDate: greetToday ? todayKey : prev.lastAssistantGreetedDate,
    }));
  }, [makeAssistantThread]);

  const handleDeleteThread = useCallback((threadId: string) => {
    setState((prev) => {
      const remaining = (prev.assistantThreads ?? []).filter((th) => th.id !== threadId);
      if (remaining.length === 0) {
        const fresh = makeAssistantThread(false);
        return {
          ...prev,
          assistantThreads: [fresh],
          activeAssistantThreadId: fresh.id,
        };
      }
      const nextActiveId =
        prev.activeAssistantThreadId === threadId ? remaining[0].id : prev.activeAssistantThreadId;
      return {
        ...prev,
        assistantThreads: remaining,
        activeAssistantThreadId: nextActiveId,
      };
    });
  }, [makeAssistantThread]);

  const handleUpdateThread = useCallback(
    (threadId: string, updater: (prev: AssistantThread) => AssistantThread) => {
      setState((prev) => {
        const existing = prev.assistantThreads ?? [];
        const idx = existing.findIndex((th) => th.id === threadId);
        let nextThreads: AssistantThread[];
        if (idx >= 0) {
          nextThreads = existing.map((th) => (th.id === threadId ? updater(th) : th));
        } else {
          const base = updater({
            id: threadId,
            title: t(prev.settings.language, 'گفتگوی جدید', 'New Conversation'),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: [],
          });
          nextThreads = [base, ...existing].slice(0, 40);
        }
        return {
          ...prev,
          assistantThreads: nextThreads,
          activeAssistantThreadId: threadId,
        };
      });
    },
    []
  );

  const handleMarkGreetedToday = useCallback((dateKey: string) => {
    setState((prev) =>
      prev.lastAssistantGreetedDate === dateKey
        ? prev
        : { ...prev, lastAssistantGreetedDate: dateKey }
    );
  }, []);

  const handleAddMemoryFact = useCallback(
    (fact: string, memCategory: AssistantMemoryItem['category'] = 'preference') => {
      const cleaned = fact.trim();
      if (!cleaned) return;
      setState((prev) => {
        const list = prev.assistantMemory ?? [];
        if (list.some((m) => m.fact.trim().toLowerCase() === cleaned.toLowerCase())) {
          return prev;
        }
        const item: AssistantMemoryItem = {
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          fact: cleaned,
          category: memCategory,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          assistantMemory: [item, ...list].slice(0, 50),
        };
      });
    },
    []
  );

  const handleDeleteMemoryFact = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      assistantMemory: (prev.assistantMemory ?? []).filter((m) => m.id !== id),
    }));
  }, []);

  const handleClearMemory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      assistantMemory: [],
    }));
  }, []);

  // Unified execution engine for all 17 assistant actions across the panel
  const handleExecuteAssistantAction = (
    action: AssistantActionPayload
  ): { ok: boolean; summary?: string } => {
    const curState = stateRef.current;

    if (action.kind === 'add_transaction') {
      const d = action.draft;
      const effectiveMethod: PaymentMethod =
        d.type === 'out' ? d.paymentMethod : d.currency === 'USD' ? 'usd' : 'bank';

      if (d.type === 'out' && effectiveMethod === 'credit') {
        const cl = curState.creditLines?.find((c) => c.id === d.creditLineId);
        handleAddOrUpdateTransaction({
          type: 'out',
          amount: d.amount,
          currency: d.currency,
          accountId: '',
          paymentMethod: 'credit',
          creditLineId: d.creditLineId,
          installmentCount: Math.max(1, d.installmentCount || 4),
          categoryLabel: d.categoryLabel || 'خرید کالا',
          budgetCategoryId: d.budgetCategoryId || undefined,
          date: new Date(`${d.date}T12:00:00`).toISOString(),
          note: d.note.trim(),
          source: 'manual',
        });
        return {
          ok: true,
          summary: `${formatMoney(d.amount, d.currency, lang)} · ${cl?.title ?? t(lang, 'اعتباری', 'Credit')}`,
        };
      }

      if (d.type === 'out' && effectiveMethod === 'person_debt') {
        const p = curState.people?.find((x) => x.id === d.personId);
        handleAddOrUpdateTransaction({
          type: 'out',
          amount: d.amount,
          currency: d.currency,
          accountId: '',
          paymentMethod: 'person_debt',
          personId: d.personId,
          categoryLabel: d.categoryLabel || 'سایر',
          budgetCategoryId: d.budgetCategoryId || undefined,
          date: new Date(`${d.date}T12:00:00`).toISOString(),
          note: d.note.trim(),
          source: 'manual',
        });
        return {
          ok: true,
          summary: `${formatMoney(d.amount, d.currency, lang)} · ${p?.name ?? t(lang, 'قرض شخصی', 'Borrowed')}`,
        };
      }

      const srcId =
        d.accountId ||
        curState.bankAccounts.find((a) => a.currency === d.currency)?.id ||
        curState.bankAccounts[0]?.id ||
        '';
      if (!srcId) {
        showToast(t(lang, 'ابتدا یک حساب بانکی بسازید', 'Add a bank account first'), 'error');
        return { ok: false };
      }
      const acc = curState.bankAccounts.find((a) => a.id === srcId);
      handleAddOrUpdateTransaction({
        type: d.type,
        amount: d.amount,
        currency: d.currency,
        accountId: srcId,
        toAccountId: d.type === 'transfer' ? d.toAccountId : undefined,
        paymentMethod: effectiveMethod,
        categoryLabel: d.type === 'out' ? d.categoryLabel || 'سایر' : undefined,
        budgetCategoryId:
          d.type === 'out' && d.budgetCategoryId ? d.budgetCategoryId : undefined,
        date: new Date(`${d.date}T12:00:00`).toISOString(),
        note: d.note.trim(),
        source: 'manual',
      });
      return {
        ok: true,
        summary: `${formatMoney(d.amount, d.currency, lang)} · ${acc?.name ?? ''}`,
      };
    }

    if (action.kind === 'add_credit_line') {
      handleAddOrUpdateCreditLine({
        title: action.creditTitle,
        provider: action.provider,
        creditLimit: action.creditLimit,
        currency: action.currency,
        defaultInstallments: action.defaultInstallments,
        dueDayOfMonth: action.dueDayOfMonth,
        note: action.note,
        active: action.active ?? true,
      });
      return {
        ok: true,
        summary: `${action.creditTitle} · ${formatMoney(action.creditLimit, action.currency, lang)} (${action.defaultInstallments} ${t(lang, 'قسط', 'inst')})`,
      };
    }

    if (action.kind === 'add_bank_account') {
      handleAddOrUpdateBankAccount({
        name: action.name,
        type: action.accountType,
        currency: action.currency,
        balance: action.balance,
        note: action.note,
      });
      return {
        ok: true,
        summary: `${action.name} · ${formatMoney(action.balance, action.currency, lang)}`,
      };
    }

    if (action.kind === 'add_person') {
      handleAddOrUpdatePerson({
        name: action.name,
        role: action.role,
        phone: action.phone,
        note: action.note,
      });
      return {
        ok: true,
        summary: action.name,
      };
    }

    if (action.kind === 'add_person_entry') {
      handleAddPersonEntry({
        personId: action.personId,
        direction: action.direction,
        amount: action.amount,
        currency: action.currency,
        accountId: action.accountId,
        date: new Date().toISOString(),
        note: action.note,
      });
      return {
        ok: true,
        summary: `${action.personName} · ${formatMoney(action.amount, action.currency, lang)}`,
      };
    }

    if (action.kind === 'add_loan') {
      handleAddLoan({
        kind: action.loanKind,
        title: action.loanTitle,
        totalAmount: action.totalAmount,
        currency: action.currency,
        totalInstallments: action.totalInstallments,
        installmentAmount: action.installmentAmount,
        dueDate: action.dueDate,
        periodLabel: action.periodLabel,
        priorityRate: action.priorityRate,
      });
      return {
        ok: true,
        summary: `${action.loanTitle} · ${formatMoney(action.totalAmount, action.currency, lang)} (${action.totalInstallments} ${t(lang, 'قسط', 'inst')})`,
      };
    }

    if (action.kind === 'pay_loan_installment') {
      handlePayLoanInstallment(action.loanId, action.accountId);
      return {
        ok: true,
        summary: `${action.loanTitle} · ${formatMoney(action.installmentAmount, action.currency, lang)}`,
      };
    }

    if (action.kind === 'add_fixed_expense') {
      handleAddFixedExpense(
        action.expenseTitle,
        action.amount,
        action.currency,
        action.recurringMonthly,
        action.dayOfMonth
      );
      return {
        ok: true,
        summary: `${action.expenseTitle} · ${formatMoney(action.amount, action.currency, lang)}`,
      };
    }

    if (action.kind === 'add_budget_cap') {
      handleAddBudgetCap(
        action.categoryName,
        action.sourceAccountId,
        action.percentOfBalance,
        action.rolloverUnused
      );
      return {
        ok: true,
        summary: `${action.categoryName} (${action.percentOfBalance}%)`,
      };
    }

    if (action.kind === 'add_goal') {
      const initialStatus: Goal['status'] = action.activateImmediately ? 'active' : 'draft';
      const deadlineMode = action.deadlineMode ?? 'dated';
      const targetDateIso =
        deadlineMode === 'open_until_funded'
          ? new Date(Date.now() + 365 * 86400000).toISOString()
          : action.targetDate
          ? new Date(`${action.targetDate}T12:00:00`).toISOString()
          : new Date(Date.now() + 90 * 86400000).toISOString();
      const newGoal: Goal = {
        id: `goal_${Date.now()}`,
        title: action.goalTitle,
        kind: action.goalKind,
        currency: action.currency,
        targetAmount: action.targetAmount,
        savedAmount: 0,
        deadlineMode,
        targetDate: targetDateIso,
        budgetSource: action.budgetSource,
        sourceAccountId: action.sourceAccountId,
        weeklyBudgetAmount: action.weeklyBudgetAmount,
        priority: action.priority,
        allocationPct: 20,
        autoPriorityBudget: true,
        status: initialStatus,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => {
        const nextGoals = [newGoal, ...prev.goals];
        const poolIrt = prev.settings.weeklyGoalPoolIrt ?? 18000000;
        return {
          ...prev,
          goals: initialStatus === 'active'
            ? rebalanceGoalList(nextGoals, poolIrt, prev.settings.usdToman)
            : nextGoals,
        };
      });
      showToast(
        initialStatus === 'active'
          ? t(lang, `هدف «${action.goalTitle}» ساخته و فعال شد`, `Goal "${action.goalTitle}" created & activated`)
          : t(lang, `هدف «${action.goalTitle}» با وضعیت پیش‌نویس ذخیره شد`, `Goal "${action.goalTitle}" saved as draft`),
        'success'
      );
      return {
        ok: true,
        summary: `${action.goalTitle} (${formatMoney(action.targetAmount, action.currency, lang)})`,
      };
    }

    if (action.kind === 'activate_goal') {
      handleChangeGoalStatus(action.goalId, action.status);
      if (typeof action.priority === 'number') {
        handleChangeGoalPriority(action.goalId, action.priority);
      }
      return {
        ok: true,
        summary: `${action.goalTitle} → ${action.status}`,
      };
    }

    if (action.kind === 'contribute_goal') {
      handleAllocateToGoal(action.goalId, action.amount, action.sourceAccountId);
      return {
        ok: true,
        summary: `${action.goalTitle} · +${formatMoney(action.amount, action.currency, lang)}`,
      };
    }

    if (action.kind === 'add_custom_mission') {
      handleCreateCustomMission({
        title: action.missionTitle,
        source: action.source,
        metric: action.metric,
        targetValue: action.targetValue,
        stars: action.stars,
        xp: action.xp,
        linkedGoalId: action.linkedGoalId,
      });
      return {
        ok: true,
        summary: `${action.missionTitle} (+${action.xp} XP)`,
      };
    }

    if (action.kind === 'update_fx_rate') {
      if (action.mode === 'manual' && action.usdToman && action.usdToman > 1000) {
        const rate = Math.round(action.usdToman);
        setState((prev) => ({
          ...prev,
          mt5Accounts: prev.mt5Accounts.map((a) => ({ ...a, usdToman: rate })),
          settings: {
            ...prev.settings,
            usdToman: rate,
            fxUpdatedAt: new Date().toISOString(),
          },
        }));
        showToast(
          t(lang, `نرخ دلار به ${rate.toLocaleString('en-US')} تومان تنظیم شد`, `USD rate set to ${rate.toLocaleString('en-US')} IRT`),
          'success'
        );
        return {
          ok: true,
          summary: `${rate.toLocaleString('en-US')} IRT`,
        };
      }
      void handleRefreshFxRate(true);
      return {
        ok: true,
        summary: t(lang, 'استعلام نرخ لحظه‌ای دلار', 'Live FX rate refresh'),
      };
    }

    if (action.kind === 'update_panel_settings') {
      setState((prev) => {
        const nextPool = action.weeklyGoalPoolIrt ?? prev.settings.weeklyGoalPoolIrt ?? 18000000;
        const nextSettings = {
          ...prev.settings,
          ...(action.weeklyGoalPoolIrt !== undefined ? { weeklyGoalPoolIrt: Math.max(0, Math.round(action.weeklyGoalPoolIrt)) } : {}),
          ...(action.dailyMaxLossPct !== undefined ? { dailyMaxLossPct: Math.max(0.1, action.dailyMaxLossPct) } : {}),
          ...(action.defaultRiskPct !== undefined ? { defaultRiskPct: Math.max(0.1, action.defaultRiskPct) } : {}),
          ...(action.monthlyExpectedIncomeIrt !== undefined
            ? { monthlyExpectedIncomeIrt: Math.max(0, Math.round(action.monthlyExpectedIncomeIrt)) }
            : {}),
        };
        return {
          ...prev,
          settings: nextSettings,
          goals:
            action.weeklyGoalPoolIrt !== undefined
              ? rebalanceGoalList(prev.goals, nextPool, prev.settings.usdToman)
              : prev.goals,
        };
      });
      showToast(t(lang, 'تنظیمات مدیریت مالی و ریسک پنل ذخیره شد', 'Panel risk & budget settings updated'), 'success');
      return {
        ok: true,
        summary: action.title,
      };
    }

    if (action.kind === 'save_memory') {
      handleAddMemoryFact(action.fact, action.category);
      showToast(t(lang, 'در حافظه بلندمدت دستیار ذخیره شد', 'Saved to assistant memory'), 'success');
      return {
        ok: true,
        summary: action.fact,
      };
    }

    if (action.kind === 'refresh_economic_news') {
      if (action.fetchedEvents && action.fetchedEvents.length > 0) {
        const { upcomingHighCount } = applyFetchedEconomicEvents(
          action.fetchedEvents,
          action.sourceLabel
        );
        const nowMs = Date.now();
        const nextHigh = action.fetchedEvents.find(
          (ev) => ev.impact === 'high' && new Date(ev.timestamp).getTime() >= nowMs
        );
        const summary = nextHigh
          ? t(
              lang,
              `${action.fetchedEvents.length} رویداد دریافت شد (${upcomingHighCount} خبر مهم پیش‌رو · نزدیک‌ترین: ${nextHigh.currency} - ${nextHigh.title})`,
              `Synced ${action.fetchedEvents.length} events (${upcomingHighCount} upcoming high-impact · Next: ${nextHigh.currency} - ${nextHigh.title})`
            )
          : t(
              lang,
              `${action.fetchedEvents.length} رویداد اقتصادی هفته در تقویم ذخیره شد`,
              `Synced ${action.fetchedEvents.length} weekly economic events`
            );
        showToast(summary, 'success');
        return { ok: true, summary };
      }
      void handleRefreshEconomicNews({
        currencyFilter: action.currencyFilter,
        impactFilter: action.impactFilter ?? 'high_medium',
        force: true,
      });
      return {
        ok: true,
        summary: t(lang, 'درحال دریافت تقویم اقتصادی رایگان...', 'Fetching free economic calendar...'),
      };
    }

    if (action.kind === 'navigate') {
      handleNavigate(action.category, action.subTab);
      return {
        ok: true,
        summary: action.title,
      };
    }

    return { ok: false };
  };

  const navItems: Array<{ id: MainCategory; icon: React.ReactNode }> = [
    { id: 'overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'trading', icon: <CandlestickChart className="w-4 h-4" /> },
    { id: 'finance', icon: <Wallet className="w-4 h-4" /> },
    { id: 'growth', icon: <Target className="w-4 h-4" /> },
    { id: 'assistant', icon: <Bot className="w-4 h-4" /> },
    { id: 'system', icon: <Settings className="w-4 h-4" /> },
  ];

  const isLightTheme =
    state.settings.theme === 'light' ||
    state.settings.theme === 'coral' ||
    state.settings.theme === 'lavender';

  const backdropStyle = getBackdropStyle(
    state.settings.backdropPreset,
    state.settings.backdropCustomUrl,
    state.settings.backdropBlur,
    state.settings.backdropBrightness,
    isLightTheme
  );

  return (
    <div className="min-h-screen relative flex text-[var(--ft-text-primary)]">
      {/* Backdrop Layer */}
      {state.settings.backdropPreset !== 'none' && (
        <div className="fixed inset-0 pointer-events-none z-0" style={backdropStyle} />
      )}
      {state.settings.backdropPreset === 'custom' && state.settings.backdropCustomUrl && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{ backgroundColor: 'var(--ft-scrim)' }}
        />
      )}

      {/* PIN Lock Screen */}
      {isLocked && state.settings.pinEnabled && (
        <PinLockScreen
          expectedPin={state.settings.pinCode}
          expectedHash={state.settings.pinHash}
          lang={lang}
          onUnlock={() => setIsLocked(false)}
        />
      )}

      {/* Floating Pill Icon Rail (Reference Layout) */}
      <aside className="hidden lg:flex w-[76px] shrink-0 flex-col items-center justify-between py-4 ps-4 z-20 sticky top-0 h-screen no-print">
        {/* Top Capsule: Light / Dark Theme Switch */}
        <div className="flex flex-col items-center gap-1 p-1.5 rounded-full glass-surface">
          <button
            type="button"
            onClick={() =>
              setState((prev) => ({
                ...prev,
                settings: { ...prev.settings, theme: 'coral' },
              }))
            }
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isLightTheme
                ? 'bg-[var(--ft-text-primary)] text-[var(--ft-surface-solid)] shadow-sm'
                : 'text-[var(--ft-text-muted)] hover:text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)]'
            }`}
            title={t(lang, 'حالت روشن', 'Light Mode')}
            aria-label="Light Mode"
          >
            <Sun className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setState((prev) => ({
                ...prev,
                settings: { ...prev.settings, theme: 'obsidian' },
              }))
            }
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              !isLightTheme
                ? 'bg-[var(--ft-text-primary)] text-[var(--ft-surface-solid)] shadow-sm'
                : 'text-[var(--ft-text-muted)] hover:text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)]'
            }`}
            title={t(lang, 'حالت تیره', 'Dark Mode')}
            aria-label="Dark Mode"
          >
            <Moon className="w-4 h-4" />
          </button>
        </div>

        {/* Middle Capsule: 5 Category Icon Buttons */}
        <nav
          className="flex flex-col items-center gap-1.5 p-1.5 rounded-full glass-surface"
          aria-label="Icon Rail"
        >
          {navItems.map((item) => {
            const active = category === item.id;
            const label = CATEGORY_LABELS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                title={lang === 'fa' ? label.fa : label.en}
                aria-label={lang === 'fa' ? label.fa : label.en}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--ft-text-primary)] text-[var(--ft-surface-solid)] shadow-sm'
                    : 'text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] hover:text-[var(--ft-text-primary)]'
                }`}
              >
                {item.icon}
              </button>
            );
          })}
        </nav>

        {/* Bottom Capsule: Connection Health + Lock */}
        <div className="flex flex-col items-center gap-1 p-1.5 rounded-full glass-surface">
          <button
            type="button"
            onClick={() => handleNavigate('system', 'health')}
            title={
              state.settings.eventFileConnected
                ? t(lang, 'سلامت سیستم: فعال', 'System: Active')
                : t(lang, 'سلامت سیستم: غیرفعال', 'System: Offline')
            }
            aria-label={t(lang, 'سلامت سیستم', 'System Health')}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer hover:bg-[var(--ft-surface-hover)] ${
              state.settings.eventFileConnected
                ? 'text-[var(--ft-positive)]'
                : 'text-[var(--ft-danger)]'
            }`}
          >
            <Activity className="w-4 h-4" />
          </button>
          {state.settings.pinEnabled && (
            <button
              type="button"
              onClick={() => setIsLocked(true)}
              title={t(lang, 'قفل پنل', 'Lock Panel')}
              aria-label={t(lang, 'قفل پنل', 'Lock Panel')}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)] transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Material Design 3 Mobile Navigation Drawer (z-[80] covers FABs/FTB/nav under blur) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden bg-black/55 backdrop-blur-md flex">
          <div className="w-[min(84vw,320px)] glass-surface-high h-full p-4 flex flex-col justify-between overflow-y-auto gap-4 border-e border-[var(--ft-border-strong)] shadow-2xl">
            <div className="space-y-4">
              {/* Header Row */}
              <div className="flex items-center justify-between px-1">
                <span className="text-base font-bold tracking-tight">FundTrack</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label={t(lang, 'بستن منو', 'Close menu')}
                  className="w-10 h-10 rounded-full hover:bg-[var(--ft-surface-hover)] flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Full-Width Top Search Input inside Drawer (Focus Target 2) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPaletteInitialQuery(drawerSearchQuery);
                  setMobileMenuOpen(false);
                  setPaletteOpen(true);
                }}
                className="w-full"
              >
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-[var(--ft-accent)] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={drawerSearchQuery}
                    onChange={(e) => setDrawerSearchQuery(e.target.value)}
                    placeholder={t(lang, 'جستجوی سریع در پنل...', 'Quick search across panel...')}
                    aria-label={t(lang, 'جستجوی سریع', 'Quick search')}
                    className="w-full h-11 ps-10 pe-9 rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border-strong)] text-xs text-[var(--ft-text-primary)] placeholder:text-[var(--ft-text-muted)] focus:outline-none focus:border-[var(--ft-accent)] focus:ring-2 focus:ring-[var(--ft-accent)]/20 transition-all"
                  />
                  {drawerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setDrawerSearchQuery('')}
                      aria-label={t(lang, 'پاک کردن جستجو', 'Clear search')}
                      className="w-7 h-7 rounded-full hover:bg-[var(--ft-surface-hover)] flex items-center justify-center text-[var(--ft-text-muted)] absolute top-1/2 -translate-y-1/2 end-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </form>

              {/* Live Drawer Quick Jump Results when typing OR Navigation Links */}
              {drawerSearchQuery.trim() ? (
                <div className="space-y-1.5">
                  {navItems
                    .filter((item) => {
                      const label = CATEGORY_LABELS[item.id];
                      const q = drawerSearchQuery.trim().toLowerCase();
                      return (
                        label.fa.toLowerCase().includes(q) ||
                        label.en.toLowerCase().includes(q) ||
                        label.descFa.toLowerCase().includes(q) ||
                        label.descEn.toLowerCase().includes(q)
                      );
                    })
                    .map((item) => {
                      const label = CATEGORY_LABELS[item.id];
                      return (
                        <button
                          key={`search_nav_${item.id}`}
                          type="button"
                          onClick={() => {
                            setDrawerSearchQuery('');
                            handleNavigate(item.id);
                          }}
                          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] flex items-center gap-3 text-start cursor-pointer transition-colors"
                        >
                          <span className="text-[var(--ft-accent)] shrink-0">{item.icon}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                              {lang === 'fa' ? label.fa : label.en}
                            </div>
                            <div className="text-[11px] text-[var(--ft-text-muted)] truncate">
                              {lang === 'fa' ? label.descFa : label.descEn}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                  <button
                    type="button"
                    onClick={() => {
                      setPaletteInitialQuery(drawerSearchQuery);
                      setMobileMenuOpen(false);
                      setPaletteOpen(true);
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-2xl ft-accent-gradient text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{t(lang, 'جستجوی کامل معاملات و دستورات', 'Search All Trades & Commands')}</span>
                  </button>
                </div>
              ) : (
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const active = category === item.id;
                    const label = CATEGORY_LABELS[item.id];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavigate(item.id)}
                        className={`w-full min-h-[48px] px-4 py-2.5 rounded-full flex items-center gap-3 text-sm font-medium cursor-pointer transition-colors ${
                          active
                            ? 'bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] font-semibold'
                            : 'text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)]'
                        }`}
                      >
                        {item.icon}
                        <span>{lang === 'fa' ? label.fa : label.en}</span>
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>

            {/* Compact Icon-Only Quick Tools Bar (No text labels) */}
            <div className="pt-3 border-t border-[var(--ft-border)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, privateMode: !prev.settings.privateMode },
                    }))
                  }
                  title={
                    state.settings.privateMode
                      ? t(lang, 'حالت محرمانه فعال', 'Private Mode On')
                      : t(lang, 'حالت محرمانه', 'Private Mode')
                  }
                  aria-label={t(lang, 'حالت محرمانه', 'Private Mode')}
                  className={`h-11 flex-1 min-w-[44px] rounded-2xl border flex items-center justify-center cursor-pointer transition-colors ${
                    state.settings.privateMode
                      ? 'bg-[var(--ft-accent-soft)] border-[var(--ft-accent)] text-[var(--ft-accent)]'
                      : 'bg-[var(--ft-surface-subtle)] border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)]'
                  }`}
                >
                  {state.settings.privateMode ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      settings: {
                        ...prev.settings,
                        theme: isLightTheme ? 'obsidian' : 'coral',
                      },
                    }))
                  }
                  title={isLightTheme ? t(lang, 'حالت تیره', 'Dark Mode') : t(lang, 'حالت روشن', 'Light Mode')}
                  aria-label={isLightTheme ? t(lang, 'حالت تیره', 'Dark Mode') : t(lang, 'حالت روشن', 'Light Mode')}
                  className="h-11 flex-1 min-w-[44px] rounded-2xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)] flex items-center justify-center text-[var(--ft-text-secondary)] cursor-pointer transition-colors"
                >
                  {isLightTheme ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>

                {state.settings.pinEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setIsLocked(true);
                    }}
                    title={t(lang, 'قفل پنل', 'Lock Panel')}
                    aria-label={t(lang, 'قفل پنل', 'Lock Panel')}
                    className="h-11 flex-1 min-w-[44px] rounded-2xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)] flex items-center justify-center text-[var(--ft-warning)] cursor-pointer transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                )}

                <PWAInstallButton
                  lang={lang}
                  variant="icon"
                  onInstalledToast={(msg) => showToast(msg, 'success')}
                />
              </div>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Clean Uncluttered Header (Mobile: Menu + Brand | Timeframe + Bell; Desktop: Full 3-Zone) */}
        <header className="sticky top-0 z-30 px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-2 flex items-center justify-between gap-2 sm:gap-3 no-print">
          {/* Zone 1: Menu (Mobile) + Brand Capsule + Live Clock (Desktop) */}
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-10 h-10 rounded-full glass-surface flex items-center justify-center text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)] transition-colors cursor-pointer shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="h-10 lg:h-11 ps-1.5 pe-3 lg:pe-4 rounded-full glass-surface flex items-center gap-2 lg:gap-2.5 shrink-0">
              <span className="w-7 h-7 lg:w-8 lg:h-8 rounded-full ft-accent-gradient flex items-center justify-center shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="w-4 h-4"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 17L17 7" />
                  <path d="M9 7h8v8" />
                </svg>
              </span>
              <span className="text-sm lg:text-base font-bold tracking-tight text-[var(--ft-text-primary)] whitespace-nowrap">
                FundTrack
              </span>
            </div>

            {/* Live Weekday + Jalali/Gregorian Date + Clock (Desktop Only) */}
            <DesktopLiveClock lang={lang} />
          </div>

          {/* Zone 2: 6-Category Floating Pill Navigation Bar (Desktop Only) */}
          <nav
            className="hidden lg:flex items-center gap-1 h-11 p-[3px] rounded-full glass-surface"
            aria-label="Main Categories"
          >
            {navItems.map((item) => {
              const active = category === item.id;
              const label = CATEGORY_LABELS[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`h-9 px-3.5 xl:px-4 rounded-full text-xs flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[var(--ft-text-primary)] text-[var(--ft-surface-solid)] font-semibold shadow-sm'
                      : 'font-medium text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)]'
                  }`}
                >
                  {lang === 'fa' ? label.fa : label.en}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Sleek Timeframe + Utility Pill + Desktop Quick Action */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Desktop Full Utility Pill */}
            <div className="hidden lg:flex relative h-11 px-1.5 py-[3px] rounded-full items-center gap-1 shrink-0">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 rounded-full glass-surface"
              />
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                title={t(lang, 'جستجوی سراسری (Ctrl+K)', 'Command Palette (Ctrl+K)')}
                aria-label={t(lang, 'جستجوی سراسری', 'Command Palette')}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] hover:text-[var(--ft-text-primary)] transition-colors cursor-pointer shrink-0"
              >
                <Search className="w-4 h-4" />
              </button>

              <HeaderNotificationDropdown
                state={state}
                compactCircle
                onNavigate={handleNavigate}
                onMarkRead={(id) =>
                  setState((prev) => ({
                    ...prev,
                    notifications: prev.notifications.map((n) =>
                      n.id === id ? { ...n, read: true } : n
                    ),
                    settings: {
                      ...prev.settings,
                      readAlertIds: Array.from(
                        new Set([...(prev.settings.readAlertIds ?? []), id])
                      ),
                    },
                  }))
                }
                onDeleteNotification={(id) =>
                  setState((prev) => ({
                    ...prev,
                    notifications: prev.notifications.filter((n) => n.id !== id),
                    settings: {
                      ...prev.settings,
                      dismissedAlertIds: Array.from(
                        new Set([...(prev.settings.dismissedAlertIds ?? []), id])
                      ),
                    },
                  }))
                }
                onMarkAllRead={(ids) =>
                  setState((prev) => ({
                    ...prev,
                    notifications: prev.notifications.map((n) => ({ ...n, read: true })),
                    settings: {
                      ...prev.settings,
                      readAlertIds: Array.from(
                        new Set([...(prev.settings.readAlertIds ?? []), ...ids])
                      ),
                    },
                  }))
                }
                onClearRead={(readIds) =>
                  setState((prev) => ({
                    ...prev,
                    notifications: prev.notifications.filter((n) => !n.read),
                    settings: {
                      ...prev.settings,
                      dismissedAlertIds: Array.from(
                        new Set([...(prev.settings.dismissedAlertIds ?? []), ...readIds])
                      ),
                      readAlertIds: [],
                    },
                  }))
                }
                onNotificationAction={handleNotificationAction}
                onUpdateSettings={(patch) =>
                  setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
                }
              />

              <button
                type="button"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, privateMode: !prev.settings.privateMode },
                  }))
                }
                title={
                  state.settings.privateMode
                    ? t(lang, 'حالت محرمانه فعال است (کلیک برای نمایش اعداد)', 'Private Mode Active (Click to reveal)')
                    : t(lang, 'مخفی‌سازی اعداد و موجودی‌ها (حالت محرمانه)', 'Hide Balances (Private Mode)')
                }
                aria-label={t(lang, 'تغییر حالت محرمانه', 'Toggle Private Mode')}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  state.settings.privateMode
                    ? 'bg-[var(--ft-accent-soft)] text-[var(--ft-accent)]'
                    : 'text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] hover:text-[var(--ft-text-primary)]'
                }`}
              >
                {state.settings.privateMode ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Unified Compact Timeframe Selector (Mobile + Tablet + Desktop) */}
            <div className="shrink-0">
              <GlassSelect<TimeRange>
                size="sm"
                align="end"
                value={timeRange}
                onChange={setTimeRange}
                ariaLabel="Timeframe"
                triggerClassName="h-10 lg:h-11 !py-0 !px-3 lg:!px-4 !rounded-full glass-surface text-xs"
                options={[
                  { value: 'today', label: t(lang, 'امروز', 'Today') },
                  { value: 'week', label: t(lang, 'هفته', 'Week') },
                  { value: 'month', label: t(lang, 'ماه', 'Month') },
                  { value: 'all', label: t(lang, 'همه', 'All') },
                ]}
              />
            </div>

            {/* Minimal Mobile Notifications Pill */}
            <div className="lg:hidden relative h-10 w-10 rounded-full flex items-center justify-center shrink-0">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 rounded-full glass-surface"
              />
              <HeaderNotificationDropdown
                state={state}
                compactCircle
                onNavigate={handleNavigate}
                onMarkRead={(id) =>
                  setState((prev) => ({
                    ...prev,
                    notifications: prev.notifications.map((n) =>
                      n.id === id ? { ...n, read: true } : n
                    ),
                    settings: {
                      ...prev.settings,
                      readAlertIds: Array.from(
                        new Set([...(prev.settings.readAlertIds ?? []), id])
                      ),
                    },
                  }))
                }
                onDeleteNotification={(id) =>
                  setState((prev) => ({
                    ...prev,
                    notifications: prev.notifications.filter((n) => n.id !== id),
                    settings: {
                      ...prev.settings,
                      dismissedAlertIds: Array.from(
                        new Set([...(prev.settings.dismissedAlertIds ?? []), id])
                      ),
                    },
                  }))
                }
                onMarkAllRead={(ids) =>
                  setState((prev) => ({
                    ...prev,
                    notifications: prev.notifications.map((n) => ({ ...n, read: true })),
                    settings: {
                      ...prev.settings,
                      readAlertIds: Array.from(
                        new Set([...(prev.settings.readAlertIds ?? []), ...ids])
                      ),
                    },
                  }))
                }
                onClearRead={(readIds) =>
                  setState((prev) => ({
                    ...prev,
                    notifications: prev.notifications.filter((n) => !n.read),
                    settings: {
                      ...prev.settings,
                      dismissedAlertIds: Array.from(
                        new Set([...(prev.settings.dismissedAlertIds ?? []), ...readIds])
                      ),
                      readAlertIds: [],
                    },
                  }))
                }
                onNotificationAction={handleNotificationAction}
                onUpdateSettings={(patch) =>
                  setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
                }
              />
            </div>

            <div className="hidden lg:block shrink-0">
              <PWAInstallButton
                lang={lang}
                variant="header"
                onInstalledToast={(msg) => showToast(msg, 'success')}
              />
            </div>

            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              title={t(lang, 'ثبت سریع', 'Quick Action')}
              aria-label={t(lang, 'ثبت سریع', 'Quick Action')}
              className="hidden lg:flex h-11 px-4 rounded-full ft-accent-gradient text-sm font-semibold cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap shrink-0 hover:opacity-95 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span>{t(lang, 'ثبت سریع', 'Quick Action')}</span>
            </button>
          </div>
        </header>

        {/* Active View Content */}
        <main className="flex-1 px-3 sm:px-6 lg:px-8 pt-3 pb-28 lg:pb-8 max-w-[1440px] w-full mx-auto">
          {/* Fresh Device / Mobile Real-Data Sync Onboarding Banner */}
          {usingDemoFallback && !syncBannerDismissed && (
            <section className="mb-4 glass-surface-high rounded-2xl p-4 border border-[var(--ft-accent)]/40 space-y-3 no-print">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-[var(--ft-text-primary)] flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-[var(--ft-warning-soft)] text-[var(--ft-warning)] text-[11px] font-semibold">
                      {t(lang, 'حالت دمو (اولین ورود در این دستگاه)', 'Demo Preview (Fresh Device)')}
                    </span>
                    {serverSyncInfo?.hasData && (
                      <span className="text-[var(--ft-positive)] text-xs font-num">
                        {t(lang, `نسخه واقعی آماده در سرور (Rev ${serverSyncInfo.revision})`, `Real snapshot available (Rev ${serverSyncInfo.revision})`)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
                    {t(
                      lang,
                      'در این مرورگر هنوز دیتای واقعی ذخیره نشده است؛ می‌توانید با کلید همگام‌سازی دسکتاپ داده‌های واقعی خود را دریافت کنید، از گوگل درایو بازیابی نمایید، یا داده‌های دمو را پاک کنید.',
                      'No local data saved on this device yet. Pair with your host key, restore from Google Drive, or clear demo records to start fresh.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncBannerDismissed(true)}
                  className="p-1.5 rounded-lg text-[var(--ft-text-muted)] hover:bg-[var(--ft-surface-hover)] cursor-pointer shrink-0"
                  aria-label="Dismiss sync banner"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[190px] flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <KeyRound className="w-3.5 h-3.5 text-[var(--ft-text-muted)] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                    <input
                      type="password"
                      dir="ltr"
                      value={pairingKeyInput}
                      onChange={(e) => setPairingKeyInput(e.target.value)}
                      placeholder={t(lang, 'کلید اتصال دسکتاپ (اختیاری روی میزبان)...', 'Host pairing key...')}
                      className="w-full h-10 ps-8 pe-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border-strong)] text-xs font-num text-[var(--ft-text-primary)] placeholder:text-[var(--ft-text-muted)] focus:outline-none focus:border-[var(--ft-accent)]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={syncBusy}
                    onClick={() => void handleConnectAndPullFromBanner()}
                    className="h-10 px-3.5 rounded-xl ft-accent-gradient text-xs font-semibold cursor-pointer flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
                    <span>{t(lang, 'دریافت داده‌های واقعی', 'Sync Real Data')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleNavigate('system', 'backup')}
                  className="h-10 px-3 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Cloud className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
                  <span>{t(lang, 'گوگل درایو / بکاپ', 'Google Drive')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartEmptyFromDemo}
                  className="h-10 px-3 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-danger-soft)] hover:text-[var(--ft-danger)] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t(lang, 'شروع خالی (حذف دمو)', 'Clear Demo')}</span>
                </button>
              </div>
            </section>
          )}

          {category === 'overview' && (
            <OverviewView
              state={state}
              subTab={overviewSub}
              setSubTab={setOverviewSub}
              range={timeRange}
              onNavigate={handleNavigate}
              onInspectTrade={setInspectedTrade}
              onMarkNotificationRead={(id) =>
                setState((prev) => ({
                  ...prev,
                  notifications: prev.notifications.map((n) =>
                    n.id === id ? { ...n, read: true } : n
                  ),
                  settings: {
                    ...prev.settings,
                    readAlertIds: Array.from(
                      new Set([...(prev.settings.readAlertIds ?? []), id])
                    ),
                  },
                }))
              }
              onDeleteNotification={(id) =>
                setState((prev) => ({
                  ...prev,
                  notifications: prev.notifications.filter((n) => n.id !== id),
                  settings: {
                    ...prev.settings,
                    dismissedAlertIds: Array.from(
                      new Set([...(prev.settings.dismissedAlertIds ?? []), id])
                    ),
                  },
                }))
              }
              onMarkAllRead={(ids) =>
                setState((prev) => ({
                  ...prev,
                  notifications: prev.notifications.map((n) => ({ ...n, read: true })),
                  settings: {
                    ...prev.settings,
                    readAlertIds: Array.from(
                      new Set([...(prev.settings.readAlertIds ?? []), ...ids])
                    ),
                  },
                }))
              }
              onClearRead={(readIds) =>
                setState((prev) => ({
                  ...prev,
                  notifications: prev.notifications.filter((n) => !n.read),
                  settings: {
                    ...prev.settings,
                    dismissedAlertIds: Array.from(
                      new Set([...(prev.settings.dismissedAlertIds ?? []), ...readIds])
                    ),
                    readAlertIds: [],
                  },
                }))
              }
              onNotificationAction={handleNotificationAction}
              onClaimDailyCombo={handleClaimDailyCombo}
              onDistributeTodayProfitToGoals={handleDistributeTodayProfitToGoals}
              onOpenQuickAction={() => setQuickOpen(true)}
            />
          )}

          {category === 'trading' && (
            <TradingView
              state={state}
              subTab={tradingSub}
              setSubTab={setTradingSub}
              range={timeRange}
              onInspectTrade={setInspectedTrade}
              onUpdateTradeReview={handleSaveTradeReview}
              onSyncMt5={handleSyncMt5}
              onImportEventsJsonl={(txt) => handleImportEventsJsonl(txt, false)}
              onSyncLocalEaFile={(customPath) => handleSyncLocalEaFile(customPath, false)}
              onDeleteMt5Account={handleDeleteMt5Account}
              onImportCsvTrades={handleImportCsvTrades}
              onUpdateSettings={(patch) =>
                setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
              }
              onToggleNewsAlarm={handleToggleNewsAlarm}
              onTriggerNewsAlarm={handleTriggerNewsAlarm}
              onImportEconomicEvents={handleImportEconomicEvents}
              onRefreshEconomicNews={() =>
                handleRefreshEconomicNews({ force: true, impactFilter: 'all' }).then(() => undefined)
              }
              onShowToast={showToast}
            />
          )}

          {category === 'finance' && (
            <FinanceView
              state={state}
              subTab={financeSub}
              setSubTab={setFinanceSub}
              onAddOrUpdateTransaction={handleAddOrUpdateTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onAddOrUpdateBankAccount={handleAddOrUpdateBankAccount}
              onDeleteBankAccount={handleDeleteBankAccount}
              onAddOrUpdateCreditLine={handleAddOrUpdateCreditLine}
              onDeleteCreditLine={handleDeleteCreditLine}
              onAddOrUpdatePerson={handleAddOrUpdatePerson}
              onDeletePerson={handleDeletePerson}
              onAddPersonEntry={handleAddPersonEntry}
              onDeletePersonEntry={handleDeletePersonEntry}
              onAddBudgetCap={handleAddBudgetCap}
              onAddFixedExpense={handleAddFixedExpense}
              onRunMonthlySync={handleRunMonthlySync}
              onAddLoan={handleAddLoan}
              onPayLoanInstallment={handlePayLoanInstallment}
              onPayTopPriorityDebt={handlePayTopPriorityDebt}
              onRefreshFxRate={handleRefreshFxRate}
              onUpdateSettings={(patch) =>
                setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
              }
              onConfirmBudgetDay={handleConfirmBudgetDay}
              onShowToast={showToast}
            />
          )}

          {category === 'growth' && (
            <GrowthView
              state={state}
              subTab={growthSub}
              setSubTab={setGrowthSub}
              onCreateGoal={handleCreateGoal}
              onChangeGoalStatus={handleChangeGoalStatus}
              onChangeGoalPriority={handleChangeGoalPriority}
              onAllocateToGoal={handleAllocateToGoal}
              onDeleteGoal={handleDeleteGoal}
              onDistributeTodayProfitToGoals={handleDistributeTodayProfitToGoals}
              onFundWeeklyGoalPool={handleFundWeeklyGoalPool}
              onUpdateWeeklyGoalPool={handleUpdateWeeklyGoalPool}
              onOverrideMission={handleOverrideMission}
              onCreateCustomMission={handleCreateCustomMission}
              onDeleteCustomMission={handleDeleteCustomMission}
              onIncrementCustomMission={handleIncrementCustomMission}
              onClaimDailyCombo={handleClaimDailyCombo}
              onShowToast={showToast}
            />
          )}

          {category === 'assistant' && (
            <AssistantView
              state={state}
              activeThread={activeAssistantThread}
              onSelectThread={handleSelectThread}
              onCreateNewThread={handleCreateNewThread}
              onDeleteThread={handleDeleteThread}
              onUpdateThread={handleUpdateThread}
              onMarkGreetedToday={handleMarkGreetedToday}
              onAddMemoryFact={handleAddMemoryFact}
              onDeleteMemoryFact={handleDeleteMemoryFact}
              onClearMemory={handleClearMemory}
              onOpenAiSettings={() => handleNavigate('system', 'ai')}
              onUpdateSettings={(patch) =>
                setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
              }
              onExecuteAction={handleExecuteAssistantAction}
              onShowToast={showToast}
            />
          )}

          {category === 'system' && (
            <SystemView
              state={state}
              subTab={systemSub}
              setSubTab={setSystemSub}
              onUpdateSettings={(patch) =>
                setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
              }
              onLockNow={() => setIsLocked(true)}
              onRefreshSystem={() => {
                handleSyncMt5();
                void handleSyncLocalEaFile(undefined, true);
                handleRefreshFxRate(false);
              }}
              onSyncEaFile={() => handleSyncLocalEaFile(undefined, false)}
              onResetDemoData={handleResetDemoData}
              onWipeAllData={handleWipeAllData}
              onRestoreState={handleRestoreState}
              onShowToast={showToast}
            />
          )}
        </main>
        <OfflineIndicator lang={lang} />
      </div>

      {/* Material Design 3 Bottom Navigation Bar for Mobile & Tablet (<= lg) */}
      <nav
        aria-label={t(lang, 'نوار ناوبری اصلی موبایل', 'Mobile Bottom Navigation')}
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-surface-high border-t border-[var(--ft-border-strong)] px-2 sm:px-4 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around gap-1 no-print"
      >
        {navItems
          .filter((item) => item.id !== 'system')
          .map((item) => {
            const active = category === item.id;
            const label = CATEGORY_LABELS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`flex-1 min-h-[52px] py-1 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'text-[var(--ft-text-primary)] font-semibold'
                    : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                }`}
              >
                <span
                  className={`w-14 h-8 rounded-full flex items-center justify-center transition-all ${
                    active
                      ? 'bg-[var(--ft-accent-soft)] text-[var(--ft-accent)]'
                      : 'bg-transparent'
                  }`}
                >
                  {item.icon}
                </span>
                <span className="text-[11px] leading-none truncate max-w-[78px]">
                  {lang === 'fa' ? label.fa : label.en}
                </span>
              </button>
            );
          })}
      </nav>

      {/* Trade Review Slide-Over Drawer */}
      <TradeReviewDrawer
        trade={inspectedTrade}
        lang={lang}
        usdToman={state.settings.usdToman}
        privateMode={Boolean(state.settings.privateMode)}
        onClose={() => setInspectedTrade(null)}
        onSaveReview={handleSaveTradeReview}
      />

      {/* Global Quick Action Modal / M3 Bottom Sheet */}
      <ResponsiveModalSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title={t(lang, 'ثبت سریع و میانبرهای روزانه', 'Quick Action Hub')}
        subtitle={t(lang, 'ثبت فوری تراکنش مالی با منشاء پرداخت', 'Quick Log with Payment Origin')}
        maxWidthClass="md:max-w-md"
        asForm
        onSubmit={(e) => {
          e.preventDefault();
          const amt = Number(qAmount);
          if (!Number.isFinite(amt) || amt <= 0) {
            showToast(t(lang, 'مبلغ معتبر وارد کنید', 'Enter a valid amount'), 'error');
            return;
          }
          const effectiveMethod: PaymentMethod =
            qType === 'in'
              ? qCurrency === 'USD'
                ? 'usd'
                : 'bank'
              : qPaymentMethod;

          if (effectiveMethod === 'credit') {
            const credId = qCreditLineId || state.creditLines?.[0]?.id;
            if (!credId) {
              showToast(t(lang, 'ابتدا یک خط اعتبار تعریف کنید', 'Define a credit line first'), 'error');
              return;
            }
            const cred = state.creditLines.find((c) => c.id === credId);
            handleAddOrUpdateTransaction({
              type: 'out',
              amount: amt,
              currency: cred?.currency ?? qCurrency,
              accountId: '',
              paymentMethod: 'credit',
              creditLineId: credId,
              installmentCount: Math.max(1, Number(qInstallments) || cred?.defaultInstallments || 4),
              categoryLabel: qCategoryLabel.trim() || undefined,
              date: new Date().toISOString(),
              note: qNote.trim() || `${cred?.title ?? 'خرید اقساطی'}`,
              source: 'manual',
            });
          } else if (effectiveMethod === 'person_debt') {
            const pId = qPersonId || state.people?.[0]?.id;
            if (!pId) {
              showToast(t(lang, 'شخص مورد نظر را انتخاب کنید', 'Select a person'), 'error');
              return;
            }
            handleAddOrUpdateTransaction({
              type: 'out',
              amount: amt,
              currency: qCurrency,
              accountId: '',
              paymentMethod: 'person_debt',
              personId: pId,
              categoryLabel: qCategoryLabel.trim() || undefined,
              date: new Date().toISOString(),
              note: qNote.trim() || t(lang, 'هزینه از محل قرض', 'Borrowed expense'),
              source: 'manual',
            });
          } else {
            const fallbackAcc =
              state.bankAccounts.find((a) => a.id === qAccountId) ??
              state.bankAccounts.find((a) => a.currency === qCurrency) ??
              state.bankAccounts[0];
            if (!fallbackAcc) return;
            handleAddOrUpdateTransaction({
              type: qType,
              amount: amt,
              currency: qCurrency,
              accountId: fallbackAcc.id,
              paymentMethod: effectiveMethod,
              categoryLabel: qType === 'out' ? qCategoryLabel.trim() || undefined : undefined,
              date: new Date().toISOString(),
              note: qNote.trim() || t(lang, 'ثبت سریع', 'Quick Entry'),
              source: 'manual',
            });
          }
          setQAmount('');
          setQNote('');
          setQuickOpen(false);
        }}
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleRefreshFxRate(true);
                setQuickOpen(false);
              }}
              className="min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] hover:bg-[var(--ft-surface-hover)] cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t(lang, 'نرخ دلار', 'USD Rate')}</span>
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 py-2.5 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
            >
              {t(lang, 'ثبت فوری تراکنش', 'Save Transaction')}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <GlassSelect<'out' | 'in'>
            size="sm"
            className="w-full"
            value={qType}
            onChange={(v) => {
              setQType(v);
              if (v === 'in' && (qPaymentMethod === 'credit' || qPaymentMethod === 'person_debt')) {
                setQPaymentMethod('bank');
              }
            }}
            options={[
              { value: 'out', label: t(lang, 'هزینه / برداشت', 'Expense') },
              { value: 'in', label: t(lang, 'واریز', 'Income') },
            ]}
          />
          <GlassSelect<CurrencyCode>
            size="sm"
            className="w-full"
            value={qCurrency}
            onChange={(v) => {
              setQCurrency(v);
              if (v === 'USD' && qPaymentMethod === 'bank') setQPaymentMethod('usd');
            }}
            options={[
              { value: 'IRT', label: 'IRT (تومان)' },
              { value: 'USD', label: 'USD ($)' },
            ]}
          />
        </div>

        {qType === 'out' && (
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-[var(--ft-text-muted)] block">
              {t(lang, 'منشاء پرداخت هزینه', 'Payment Origin')}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {(
                [
                  ['bank', t(lang, 'بانکی', 'Bank')],
                  ['cash', t(lang, 'نقدی', 'Cash')],
                  ['usd', t(lang, 'دلاری', 'USD')],
                  ['credit', t(lang, 'اعتباری', 'Credit')],
                  ['person_debt', t(lang, 'قرض از فرد', 'Borrowed')],
                ] as Array<[PaymentMethod, string]>
              ).map(([pm, lb]) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => {
                    setQPaymentMethod(pm);
                    if (pm === 'usd') setQCurrency('USD');
                    else if (pm === 'credit') {
                      const cl = state.creditLines?.find((c) => c.id === qCreditLineId) ?? state.creditLines?.[0];
                      if (cl) {
                        setQCreditLineId(cl.id);
                        setQCurrency(cl.currency);
                        setQInstallments(String(cl.defaultInstallments));
                      }
                    }
                  }}
                  className={`min-h-[38px] py-1.5 px-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer truncate ${
                    qPaymentMethod === pm
                      ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] border-transparent font-semibold'
                      : 'border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)]'
                  }`}
                >
                  {lb}
                </button>
              ))}
            </div>
          </div>
        )}

        {(qType === 'in' || (qPaymentMethod !== 'credit' && qPaymentMethod !== 'person_debt')) && (
          <GlassSelect
            size="sm"
            className="w-full"
            value={qAccountId}
            onChange={setQAccountId}
            options={state.bankAccounts.map((a) => ({
              value: a.id,
              label: `${a.name} (${a.currency})`,
              hint: formatMoney(a.balance, a.currency, lang, false, Boolean(state.settings.privateMode)),
            }))}
          />
        )}

        {qType === 'out' && qPaymentMethod === 'credit' && (
          <div className="grid grid-cols-3 gap-2 items-start">
            <div className="col-span-2">
              <GlassSelect
                size="sm"
                className="w-full"
                value={qCreditLineId}
                onChange={(id) => {
                  setQCreditLineId(id);
                  const cl = state.creditLines?.find((c) => c.id === id);
                  if (cl) {
                    setQCurrency(cl.currency);
                    setQInstallments(String(cl.defaultInstallments));
                  }
                }}
                options={(state.creditLines ?? []).map((c) => ({
                  value: c.id,
                  label: c.title,
                  hint: `${c.defaultInstallments} ${t(lang, 'قسط', 'inst')}`,
                }))}
              />
            </div>
            <MaterialInput
              type="number"
              fieldSize="sm"
              ltrNum
              min={1}
              max={36}
              label={t(lang, 'اقساط', 'Inst.')}
              value={qInstallments}
              onChange={(e) => setQInstallments(e.target.value)}
            />
          </div>
        )}

        {qType === 'out' && qPaymentMethod === 'person_debt' && (
          <GlassSelect
            size="sm"
            className="w-full"
            value={qPersonId}
            onChange={setQPersonId}
            options={(state.people ?? []).map((p) => ({
              value: p.id,
              label: p.name,
            }))}
          />
        )}

        <MaterialInput
          label={t(lang, 'مبلغ', 'Amount')}
          required
          ltrNum
          type="number"
          step="any"
          placeholder={qCurrency === 'IRT' ? '250000' : '50'}
          value={qAmount}
          onChange={(e) => setQAmount(e.target.value)}
          error={
            qAmount !== '' && (!Number.isFinite(Number(qAmount)) || Number(qAmount) <= 0)
              ? t(lang, 'مبلغ باید بزرگ‌تر از صفر باشد', 'Amount must be greater than zero')
              : undefined
          }
          success={
            qAmount !== '' && Number(qAmount) > 0
              ? formatMoney(Number(qAmount), qCurrency, lang)
              : undefined
          }
        />

        {qType === 'out' && (
          <GlassSelect
            size="sm"
            className="w-full"
            value={qCategoryLabel}
            onChange={setQCategoryLabel}
            options={[
              { value: 'خوراک و کافه', label: t(lang, 'لیبل: خوراک و کافه', 'Label: Food & Cafe') },
              { value: 'خرید کالا', label: t(lang, 'لیبل: خرید کالا', 'Label: Shopping') },
              { value: 'مسکن و قبوض', label: t(lang, 'لیبل: مسکن و قبوض', 'Label: Housing & Bills') },
              { value: 'حمل‌ونقل', label: t(lang, 'لیبل: حمل‌ونقل', 'Label: Transport') },
              { value: 'ابزار و سرور', label: t(lang, 'لیبل: ابزار و سرور', 'Label: Tools & Server') },
              { value: 'درمان', label: t(lang, 'لیبل: درمان', 'Label: Health') },
              { value: 'سایر', label: t(lang, 'لیبل: سایر', 'Label: Other') },
            ]}
          />
        )}

        <MaterialInput
          label={t(lang, 'توضیح کوتاه', 'Short Note')}
          type="text"
          placeholder={t(lang, 'مثلاً قهوه، خرید هدفون، کرایه...', 'e.g. Coffee, Purchase...')}
          value={qNote}
          onChange={(e) => setQNote(e.target.value)}
        />
      </ResponsiveModalSheet>

      {/* Confirmation Modal / Sheet (Replaces window.confirm) */}
      <ResponsiveModalSheet
        open={Boolean(confirmDialog)}
        onClose={() => setConfirmDialog(null)}
        title={confirmDialog?.title}
        maxWidthClass="md:max-w-sm"
        footer={
          confirmDialog ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-danger)] text-white cursor-pointer"
              >
                {t(lang, 'تایید و ادامه', 'Confirm')}
              </button>
            </div>
          ) : undefined
        }
      >
        {confirmDialog && (
          <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
            {confirmDialog.message}
          </p>
        )}
      </ResponsiveModalSheet>

      {/* One-Time Live vs Demo Account Selection Modal / Sheet */}
      <ResponsiveModalSheet
        open={Boolean(pendingMt5Prompt)}
        onClose={() => setPendingMt5Prompt(null)}
        title={t(lang, 'تعیین نوع حساب جدید MT5 (فقط یک‌بار)', 'Classify New MT5 Account (One-Time)')}
        maxWidthClass="md:max-w-md"
        zIndexClass="z-[55]"
      >
        {pendingMt5Prompt && (
          <>
            <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
              {t(
                lang,
                `حساب جدید ${pendingMt5Prompt.broker} (#${pendingMt5Prompt.accountNumber}) اضافه شد. نوع این حساب را برای محاسبه در دارایی کل مشخص کنید:`,
                `New account ${pendingMt5Prompt.broker} (#${pendingMt5Prompt.accountNumber}) was added. Choose whether to include it in Net Worth:`
              )}
            </p>

            <div className="p-3.5 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] flex items-center justify-between text-xs font-num">
              <span className="text-[var(--ft-text-muted)]">{pendingMt5Prompt.server}</span>
              <span className="font-bold text-[var(--ft-text-primary)]">
                {formatMoney(pendingMt5Prompt.equity, 'USD', lang)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setState((prev) => ({
                    ...prev,
                    mt5Accounts: prev.mt5Accounts.map((a) =>
                      a.id === pendingMt5Prompt.accountId ? { ...a, isDemo: false } : a
                    ),
                  }));
                  showToast(
                    t(lang, 'حساب به عنوان واقعی ثبت و در دارایی کل لحاظ شد', 'Registered as Live Account (included in Net Worth)'),
                    'success'
                  );
                  setPendingMt5Prompt(null);
                }}
                className="min-h-[68px] p-3.5 rounded-xl text-start border border-[var(--ft-positive)]/60 bg-[var(--ft-positive)]/10 hover:bg-[var(--ft-positive)]/20 transition-colors cursor-pointer space-y-1"
              >
                <div className="text-xs font-bold text-[var(--ft-positive)]">
                  {t(lang, 'حساب واقعی (Live)', 'Live Account')}
                </div>
                <div className="text-[11px] text-[var(--ft-text-secondary)]">
                  {t(lang, 'محاسبه موجودی در دارایی کل و حسابداری', 'Included in Net Worth & Equity')}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setState((prev) => ({
                    ...prev,
                    mt5Accounts: prev.mt5Accounts.map((a) =>
                      a.id === pendingMt5Prompt.accountId ? { ...a, isDemo: true } : a
                    ),
                  }));
                  showToast(
                    t(lang, 'حساب به عنوان دمو ثبت شد (خارج از دارایی کل)', 'Registered as Demo Account (excluded from Net Worth)'),
                    'info'
                  );
                  setPendingMt5Prompt(null);
                }}
                className="min-h-[68px] p-3.5 rounded-xl text-start border border-[var(--ft-warning)]/60 bg-[var(--ft-warning)]/10 hover:bg-[var(--ft-warning)]/20 transition-colors cursor-pointer space-y-1"
              >
                <div className="text-xs font-bold text-[var(--ft-warning)]">
                  {t(lang, 'حساب دمو / چالش (Demo)', 'Demo / Practice')}
                </div>
                <div className="text-[11px] text-[var(--ft-text-secondary)]">
                  {t(lang, 'فقط نمایش در ژورنال و آنالیز ترید', 'Journal & Analytics only')}
                </div>
              </button>
            </div>
          </>
        )}
      </ResponsiveModalSheet>

      {/* Global Ctrl+K Command Palette */}
      <CommandPaletteModal
        open={paletteOpen}
        initialQuery={paletteInitialQuery}
        onClose={() => {
          setPaletteOpen(false);
          setPaletteInitialQuery('');
        }}
        state={state}
        onNavigate={handleNavigate}
        onInspectTrade={setInspectedTrade}
        onOpenQuickAction={() => setQuickOpen(true)}
        onOpenAiCommand={() => setAiCommandOpen(true)}
        onRefreshFx={() => handleRefreshFxRate(true)}
        onToggleLanguage={() =>
          setState((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              language: prev.settings.language === 'fa' ? 'en' : 'fa',
            },
          }))
        }
      />

      {/* Material Design 3 Mobile Quick Action FAB (z-[45] goes cleanly underneath Drawer blur z-[80]) */}
      {!isLocked && (
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          title={t(lang, 'ثبت سریع تراکنش / هزینه', 'Quick Action')}
          aria-label={t(lang, 'ثبت سریع', 'Quick Action')}
          className="lg:hidden fixed bottom-22 end-3.5 z-[45] w-14 h-14 rounded-2xl ft-accent-gradient shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center cursor-pointer no-print"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Support-Style Floating Chat Assistant + Desktop FTB (Ctrl+J) */}
      {!isLocked && (
        <LocalAiCommandModal
          open={aiCommandOpen}
          onToggle={() => setAiCommandOpen((v) => !v)}
          onClose={() => setAiCommandOpen(false)}
          onExpandToPage={() => {
            setAiCommandOpen(false);
            handleNavigate('assistant');
          }}
          onOpenSettings={() => {
            setAiCommandOpen(false);
            handleNavigate('system', 'ai');
          }}
          state={state}
          activeThread={activeAssistantThread}
          onCreateNewThread={handleCreateNewThread}
          onUpdateThread={handleUpdateThread}
          onMarkGreetedToday={handleMarkGreetedToday}
          onAddMemoryFact={handleAddMemoryFact}
          onUpdateSettings={(patch) =>
            setState((prev) => ({
              ...prev,
              settings: { ...prev.settings, ...patch },
            }))
          }
          onExecuteAction={handleExecuteAssistantAction}
          onShowToast={showToast}
        />
      )}

      {/* Toast Stack */}
      <div className="fixed top-20 end-5 z-[90] flex flex-col gap-2 max-w-sm no-print">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl glass-surface-high text-xs font-medium border ${
              toast.tone === 'error'
                ? 'border-[var(--ft-danger)] text-[var(--ft-danger)]'
                : toast.tone === 'success'
                ? 'border-[var(--ft-positive)] text-[var(--ft-positive)]'
                : 'border-[var(--ft-accent)] text-[var(--ft-text-primary)]'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}
