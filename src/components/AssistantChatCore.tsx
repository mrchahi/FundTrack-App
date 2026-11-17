import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BookmarkCheck,
  Bot,
  Check,
  CreditCard,
  Globe,
  Landmark,
  Lightbulb,
  Mic,
  MicOff,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  UserPlus,
  X,
} from 'lucide-react';
import {
  AiModelProfile,
  AssistantActionPayload,
  AssistantChatMode,
  AssistantMessage,
  AssistantThread,
  BankAccountType,
  CreditProvider,
  CurrencyCode,
  FundTrackState,
  GoalKind,
  LoanKind,
  LocalAiConfig,
  PaymentMethod,
  PersonRole,
  TransactionType,
} from '../types';
import { formatMoney } from '../utils/domain';
import { formatJalaliDate, toLocalIsoDate } from '../utils/jalali';
import { t } from '../i18n/translations';
import { EXPENSE_CATEGORIES } from '../utils/localAiParser';
import {
  CopilotChatTurnMessage,
  deriveCleanThreadTitle,
  resolveActiveModelProfile,
  runAssistantCopilotTurn,
} from '../utils/assistantCopilot';
import { GlassSelect } from './GlassControls';
import { MaterialInput } from './MaterialInputs';
import { JalaliDatePicker } from './JalaliDatePicker';
import { fetchFreeEconomicCalendar } from '../utils/economicNews';

interface SpeechRecLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface AssistantChatCoreProps {
  state: FundTrackState;
  thread: AssistantThread;
  compact?: boolean;
  autoFocus?: boolean;
  onUpdateThread: (threadId: string, updater: (prev: AssistantThread) => AssistantThread) => void;
  onMarkGreetedToday: (dateKey: string) => void;
  onAddMemoryFact: (fact: string, category?: 'preference' | 'rule' | 'context') => void;
  onUpdateSettings: (patch: Partial<FundTrackState['settings']>) => void;
  onExecuteAction: (action: AssistantActionPayload) => { ok: boolean; summary?: string };
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const AssistantChatCore: React.FC<AssistantChatCoreProps> = ({
  state,
  thread,
  compact = false,
  autoFocus = false,
  onUpdateThread,
  onMarkGreetedToday,
  onAddMemoryFact,
  onUpdateSettings,
  onExecuteAction,
  onShowToast,
}) => {
  const lang = state.settings.language;
  const isPrivate = Boolean(state.settings.privateMode);
  const messages = thread.messages;

  const defaultProfiles: AiModelProfile[] = useMemo(
    () => [
      {
        id: 'prof_gemini_4',
        name: 'Gemini 4 Hydrogen (تحلیل تخصصی و اجرا)',
        provider: 'gemini',
        endpoint: '',
        model: 'gemini-4-hydrogen',
        envKeyName: 'GEMINI_API_KEY',
        purpose: 'analytics',
      },
      {
        id: 'prof_jan_local',
        name: 'Jan Desktop — Gemma 4 (لوکال آفلاین)',
        provider: 'jan',
        endpoint: 'http://127.0.0.1:1337/v1',
        model: 'gemma-4-E2B-it-Q4_K_M',
        envKeyName: 'LOCAL_AI_API_KEY',
        purpose: 'fast',
      },
    ],
    []
  );

  const localAi: LocalAiConfig = useMemo(() => {
    const raw = state.settings.localAi;
    const rawProfs = raw?.profiles && raw.profiles.length > 0 ? raw.profiles : defaultProfiles;
    const profiles = [...rawProfs];
    for (const def of defaultProfiles) {
      if (!profiles.some((p) => p.id === def.id)) {
        profiles.push(def);
      }
    }
    const active =
      profiles.find((p) => p.id === raw?.activeProfileId) ??
      profiles[0] ??
      resolveActiveModelProfile(raw);
    return {
      enabled: raw?.enabled ?? true,
      provider: active.provider,
      endpoint: active.endpoint,
      model: active.model,
      activeProfileId: active.id,
      thinkingDepth: raw?.thinkingDepth ?? 'deep',
      assistantMode: raw?.assistantMode ?? 'auto',
      profiles,
      apiKey: raw?.apiKey,
    };
  }, [state.settings.localAi, defaultProfiles]);

  const activeProfile = resolveActiveModelProfile(localAi);

  const [composer, setComposer] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [listening, setListening] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingDraftText, setEditingDraftText] = useState('');
  const [fetchingActionId, setFetchingActionId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecLike | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [autoFocus, thread.id]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = compact ? 116 : 152;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [composer, compact]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, analyzing, thread.id]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleSwitchProfile = (profileId: string) => {
    const prof = localAi.profiles?.find((p) => p.id === profileId);
    if (!prof) return;
    onUpdateSettings({
      localAi: {
        ...localAi,
        activeProfileId: prof.id,
        provider: prof.provider,
        endpoint: prof.endpoint,
        model: prof.model,
      },
    });
    onShowToast(t(lang, `مدل فعال: ${prof.name}`, `Switched model: ${prof.name}`), 'info');
  };

  const handleSwitchMode = (mode: AssistantChatMode) => {
    onUpdateSettings({
      localAi: {
        ...localAi,
        assistantMode: mode,
        thinkingDepth: mode === 'fast' ? 'fast' : mode === 'analysis' ? 'deep' : localAi.thinkingDepth,
      },
    });
  };

  const executeCopilotOnHistory = async (threadSnapshotMsgs: AssistantMessage[]) => {
    setAnalyzing(true);
    const todayKey = toLocalIsoDate(new Date());
    const alreadyGreetedToday =
      state.lastAssistantGreetedDate === todayKey ||
      threadSnapshotMsgs.some((m) => m.role === 'assistant');

    const turnHistory: CopilotChatTurnMessage[] = threadSnapshotMsgs
      .filter((m) => !m.id.startsWith('welcome_'))
      .slice(-14)
      .map((m) => ({
        role: m.role,
        content:
          m.role === 'assistant' && m.action
            ? `${m.text}${m.status === 'saved' ? ` [Executed: ${m.savedSummary ?? m.action.title}]` : ''}`
            : m.text,
      }));

    const result = await runAssistantCopilotTurn(turnHistory, state, localAi, {
      memory: state.assistantMemory ?? [],
      recentThreads: (state.assistantThreads ?? []).filter((th) => th.id !== thread.id).slice(0, 6),
      alreadyGreetedToday,
      assistantMode: localAi.assistantMode ?? 'auto',
    });
    setAnalyzing(false);

    if (state.lastAssistantGreetedDate !== todayKey) {
      onMarkGreetedToday(todayKey);
    }
    if (result.memoryFact) {
      onAddMemoryFact(result.memoryFact, 'preference');
    }

    const assistantMsg: AssistantMessage = {
      id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      text: result.reply,
      createdAt: new Date().toISOString(),
      suggestions: result.suggestions,
      quickReplies: result.quickReplies,
      action: result.action,
      status: result.action ? 'pending' : undefined,
      editingAction:
        (result.action?.kind === 'add_transaction' && result.action.draft.amount <= 0) ||
        (result.action?.kind === 'add_goal' && result.action.targetAmount <= 0),
      modelUsed: result.modelUsed,
      latencyMs: result.latencyMs,
      isOfflineFallback: result.isOfflineFallback,
      memorySavedFact: result.memoryFact,
    };

    const userTurns = threadSnapshotMsgs.filter((m) => m.role === 'user');
    const firstUserText = userTurns[0]?.text ?? '';
    const refinedTitle =
      userTurns.length === 1 && result.action?.title
        ? deriveCleanThreadTitle(firstUserText, result.action.title)
        : undefined;

    onUpdateThread(thread.id, (prev) => ({
      ...prev,
      title: refinedTitle ?? prev.title,
      updatedAt: new Date().toISOString(),
      messages: [...threadSnapshotMsgs, assistantMsg],
    }));
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? composer).trim();
    if (!text || analyzing) return;

    if (overrideText === undefined) {
      setComposer('');
    }
    setEditingMsgId(null);

    const userMsg: AssistantMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };

    const nextMsgs = [...messages, userMsg];
    const shouldRetitle =
      thread.messages.filter((m) => m.role === 'user').length === 0;
    const derivedTitle = deriveCleanThreadTitle(text);

    onUpdateThread(thread.id, (prev) => ({
      ...prev,
      title: shouldRetitle ? derivedTitle : prev.title,
      updatedAt: new Date().toISOString(),
      messages: nextMsgs,
    }));

    await executeCopilotOnHistory(nextMsgs);
  };

  const handleSaveEditedUserMessage = async (msgId: string) => {
    const trimmed = editingDraftText.trim();
    if (!trimmed || analyzing) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;

    const updatedUser: AssistantMessage = {
      ...messages[idx],
      text: trimmed,
      editedAt: new Date().toISOString(),
    };
    const truncated = [...messages.slice(0, idx), updatedUser];
    const isFirstUser = truncated.filter((m) => m.role === 'user').length === 1;

    setEditingMsgId(null);
    setEditingDraftText('');

    onUpdateThread(thread.id, (prev) => ({
      ...prev,
      title: isFirstUser ? deriveCleanThreadTitle(trimmed) : prev.title,
      updatedAt: new Date().toISOString(),
      messages: truncated,
    }));

    await executeCopilotOnHistory(truncated);
  };

  const handleRetryMessage = async (msgId: string) => {
    if (analyzing) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;

    // If clicked on assistant message, truncate from that message (keep user message right before it)
    // If clicked on user message, truncate everything after that user message
    const msg = messages[idx];
    const cutIdx = msg.role === 'assistant' ? idx : idx + 1;
    const historyUpToUser = messages.slice(0, cutIdx);
    const hasUser = historyUpToUser.some((m) => m.role === 'user');
    if (!hasUser) return;

    onUpdateThread(thread.id, (prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      messages: historyUpToUser,
    }));

    await executeCopilotOnHistory(historyUpToUser);
  };

  const updateMessage = (msgId: string, updater: (m: AssistantMessage) => AssistantMessage) => {
    onUpdateThread(thread.id, (prev) => ({
      ...prev,
      updatedAt: new Date().toISOString(),
      messages: prev.messages.map((m) => (m.id === msgId ? updater(m) : m)),
    }));
  };

  const handleConfirmAction = async (msg: AssistantMessage) => {
    if (!msg.action) return;

    if (msg.action.kind === 'refresh_economic_news') {
      if (fetchingActionId) return;
      setFetchingActionId(msg.id);
      try {
        const fetched = await fetchFreeEconomicCalendar({
          force: true,
          currencyFilter: msg.action.currencyFilter,
          impactFilter: msg.action.impactFilter ?? 'high_medium',
        });
        if (!fetched.ok || fetched.events.length === 0) {
          onShowToast(
            t(
              lang,
              fetched.error || 'رویدادی مطابق فیلتر انتخابی در تقویم هفته یافت نشد',
              fetched.error || 'No economic events matched this filter'
            ),
            'error'
          );
          return;
        }
        const res = onExecuteAction({
          ...msg.action,
          fetchedEvents: fetched.events,
          sourceLabel: fetched.source,
        });
        if (!res.ok) return;
        updateMessage(msg.id, (m) => ({
          ...m,
          status: 'saved',
          editingAction: false,
          savedSummary: res.summary ?? m.action?.title ?? t(lang, 'اخبار به‌روزرسانی شد', 'News updated'),
        }));
      } finally {
        setFetchingActionId(null);
      }
      return;
    }

    if (msg.action.kind === 'add_transaction') {
      const d = msg.action.draft;
      if (!Number.isFinite(d.amount) || d.amount <= 0) {
        onShowToast(t(lang, 'مبلغ باید بزرگ‌تر از صفر باشد', 'Amount must be positive'), 'error');
        updateMessage(msg.id, (m) => ({ ...m, editingAction: true }));
        return;
      }
      if (d.type === 'out' && d.paymentMethod === 'credit' && !d.creditLineId) {
        onShowToast(t(lang, 'خط اعتبار را انتخاب کنید', 'Select a credit line'), 'error');
        updateMessage(msg.id, (m) => ({ ...m, editingAction: true }));
        return;
      }
      if (d.type === 'out' && d.paymentMethod === 'person_debt' && !d.personId) {
        onShowToast(t(lang, 'شخص قرض‌دهنده را انتخاب کنید', 'Select creditor person'), 'error');
        updateMessage(msg.id, (m) => ({ ...m, editingAction: true }));
        return;
      }
    }

    if (msg.action.kind === 'add_credit_line' && (!msg.action.creditTitle.trim() || msg.action.creditLimit <= 0)) {
      onShowToast(t(lang, 'عنوان و سقف اعتبار معتبر وارد کنید', 'Enter valid credit title & limit'), 'error');
      updateMessage(msg.id, (m) => ({ ...m, editingAction: true }));
      return;
    }

    if (msg.action.kind === 'add_bank_account' && !msg.action.name.trim()) {
      onShowToast(t(lang, 'نام حساب الزامی است', 'Account name is required'), 'error');
      updateMessage(msg.id, (m) => ({ ...m, editingAction: true }));
      return;
    }

    if (msg.action.kind === 'add_person' && !msg.action.name.trim()) {
      onShowToast(t(lang, 'نام شخص الزامی است', 'Person name is required'), 'error');
      updateMessage(msg.id, (m) => ({ ...m, editingAction: true }));
      return;
    }

    if (msg.action.kind === 'add_goal') {
      if (!msg.action.goalTitle.trim()) {
        onShowToast(t(lang, 'عنوان هدف الزامی است', 'Goal title is required'), 'error');
        updateMessage(msg.id, (m) => ({ ...m, editingAction: true }));
        return;
      }
      if (!Number.isFinite(msg.action.targetAmount) || msg.action.targetAmount <= 0) {
        onShowToast(t(lang, 'مبلغ هدف باید بزرگ‌تر از صفر باشد', 'Enter target amount > 0'), 'error');
        updateMessage(msg.id, (m) => ({ ...m, editingAction: true }));
        return;
      }
    }

    const res = onExecuteAction(msg.action);
    if (!res.ok) return;

    updateMessage(msg.id, (m) => ({
      ...m,
      status: 'saved',
      editingAction: false,
      savedSummary: res.summary ?? m.action?.title ?? t(lang, 'انجام شد', 'Executed'),
    }));
  };

  const toggleVoice = () => {
    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setListening(false);
      return;
    }

    const Win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecLike;
      webkitSpeechRecognition?: new () => SpeechRecLike;
    };
    const Ctor = Win.SpeechRecognition ?? Win.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang === 'fa' ? 'fa-IR' : 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) {
        void handleSend(transcript);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const resolveTxOriginLabel = (
    action: Extract<AssistantActionPayload, { kind: 'add_transaction' }>
  ): string => {
    const draft = action.draft;
    if (draft.type === 'out' && draft.paymentMethod === 'credit') {
      const cl = state.creditLines?.find((c) => c.id === draft.creditLineId);
      return cl
        ? `${cl.title} (${draft.installmentCount} ${t(lang, 'قسط', 'inst')})`
        : t(lang, 'اعتباری', 'Credit');
    }
    if (draft.type === 'out' && draft.paymentMethod === 'person_debt') {
      const p = state.people?.find((x) => x.id === draft.personId);
      return p ? `${t(lang, 'قرض از', 'From')} ${p.name}` : t(lang, 'قرض شخصی', 'Borrowed');
    }
    const acc = state.bankAccounts.find((a) => a.id === draft.accountId);
    if (draft.type === 'transfer') {
      const toAcc = state.bankAccounts.find((a) => a.id === draft.toAccountId);
      return `${acc?.name ?? '—'} ← ${toAcc?.name ?? '—'}`;
    }
    return acc?.name ?? t(lang, 'حساب پیش‌فرض', 'Default Account');
  };

  const txTypeLabel = (tp: TransactionType) =>
    tp === 'out'
      ? t(lang, 'هزینه', 'Expense')
      : tp === 'in'
      ? t(lang, 'درآمد', 'Income')
      : t(lang, 'انتقال', 'Transfer');

  const starterPrompts = useMemo(
    () =>
      lang === 'fa'
        ? [
            'تحلیل آماری ترید، سشن‌ها و انضباط SL',
            'بررسی وضعیت نقدینگی، بودجه و بدهی‌ها',
            'توی اعتبارات دیجی‌پی اعتبار ۱۵ میلیون تومانی ۴ قسطه باز کن',
            'یه هدف پس‌انداز ۵۰ میلیونی بساز',
          ]
        : [
            'Statistical trading & session review',
            'Analyze cashflow, budgets & debts',
            'Open Digipay 15M IRT 4-installment credit line',
            'Create a new 50M IRT savings goal',
          ],
    [lang]
  );

  const renderActionCard = (msg: AssistantMessage) => {
    const act = msg.action;
    if (!act || msg.status !== 'pending') return null;

    if (act.kind === 'navigate') {
      return (
        <div className="rounded-xl bg-[var(--ft-surface-solid)]/80 border border-[var(--ft-border-strong)] p-3 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
            {act.title}
          </div>
          <button
            type="button"
            onClick={() => handleConfirmAction(msg)}
            className="px-3 py-1.5 rounded-lg ft-accent-gradient text-[11px] font-bold cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>{t(lang, 'باز کردن بخش', 'Open View')}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    if (act.kind === 'add_credit_line') {
      const patchCredit = (patch: Partial<typeof act>) =>
        updateMessage(msg.id, (m) =>
          m.action && m.action.kind === 'add_credit_line'
            ? { ...m, action: { ...m.action, ...patch } }
            : m
        );

      return (
        <div className="rounded-xl bg-[var(--ft-surface-solid)]/80 border border-[var(--ft-border-strong)] p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ft-text-primary)]">
            <CreditCard className="w-4 h-4 text-[var(--ft-accent)] shrink-0" />
            <span>{act.title}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-num">
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'سقف خط اعتبار', 'Credit Limit')}</span>
              <span className="font-bold">
                {formatMoney(act.creditLimit, act.currency, lang, false, isPrivate)}
              </span>
            </div>
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'اقساط و سررسید', 'Installments & Due')}</span>
              <span className="font-semibold">
                {act.defaultInstallments} {t(lang, 'قسط', 'inst')} · {t(lang, 'روز', 'Day')} {act.dueDayOfMonth}
              </span>
            </div>
          </div>

          {msg.editingAction && (
            <div className="pt-2 border-t border-[var(--ft-border)] space-y-2">
              <MaterialInput
                type="text"
                fieldSize="sm"
                label={t(lang, 'عنوان خط اعتبار', 'Credit Title')}
                value={act.creditTitle}
                onChange={(e) => patchCredit({ creditTitle: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'سرویس‌دهنده', 'Provider')}</label>
                  <GlassSelect<CreditProvider>
                    size="sm"
                    className="w-full"
                    value={act.provider}
                    onChange={(p) => patchCredit({ provider: p })}
                    options={[
                      { value: 'digipay', label: t(lang, 'دیجی‌پی', 'Digipay') },
                      { value: 'snapppay', label: t(lang, 'اسنپ‌پی', 'SnappPay') },
                      { value: 'tara', label: t(lang, 'تارا', 'Tara') },
                      { value: 'card', label: t(lang, 'کارت اعتباری', 'Credit Card') },
                      { value: 'other', label: t(lang, 'سایر', 'Other') },
                    ]}
                  />
                </div>
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  label={t(lang, 'سقف اعتبار', 'Limit')}
                  value={String(act.creditLimit)}
                  onChange={(e) => patchCredit({ creditLimit: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  min={1}
                  max={36}
                  label={t(lang, 'تعداد اقساط پیش‌فرض', 'Default Installments')}
                  value={String(act.defaultInstallments)}
                  onChange={(e) => patchCredit({ defaultInstallments: Math.max(1, Number(e.target.value) || 1) })}
                />
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  min={1}
                  max={30}
                  label={t(lang, 'روز سررسید شمسی', 'Due Day (1..30)')}
                  value={String(act.dueDayOfMonth)}
                  onChange={(e) =>
                    patchCredit({ dueDayOfMonth: Math.min(30, Math.max(1, Number(e.target.value) || 5)) })
                  }
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)]">
            <button
              type="button"
              onClick={() => updateMessage(msg.id, (m) => ({ ...m, editingAction: !m.editingAction }))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <Pencil className="w-3 h-3" />
              <span>{msg.editingAction ? t(lang, 'بستن ویرایش', 'Hide Edit') : t(lang, 'ویرایش مقادیر', 'Edit Fields')}</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateMessage(msg.id, (m) => ({ ...m, status: 'cancelled', editingAction: false }))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] border border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
              >
                {t(lang, 'لغو', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmAction(msg)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold ft-accent-gradient cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t(lang, 'باز کردن خط اعتبار', 'Create Credit Line')}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (act.kind === 'add_bank_account') {
      const patchAcc = (patch: Partial<typeof act>) =>
        updateMessage(msg.id, (m) =>
          m.action && m.action.kind === 'add_bank_account'
            ? { ...m, action: { ...m.action, ...patch } }
            : m
        );

      return (
        <div className="rounded-xl bg-[var(--ft-surface-solid)]/80 border border-[var(--ft-border-strong)] p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ft-text-primary)]">
            <Landmark className="w-4 h-4 text-[var(--ft-accent)] shrink-0" />
            <span>{act.title}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-num">
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'نوع و ارز', 'Type & Currency')}</span>
              <span className="font-semibold">
                {act.accountType} · {act.currency}
              </span>
            </div>
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'موجودی اولیه', 'Opening Balance')}</span>
              <span className="font-bold">
                {formatMoney(act.balance, act.currency, lang, false, isPrivate)}
              </span>
            </div>
          </div>

          {msg.editingAction && (
            <div className="pt-2 border-t border-[var(--ft-border)] space-y-2">
              <MaterialInput
                type="text"
                fieldSize="sm"
                label={t(lang, 'نام حساب', 'Account Name')}
                value={act.name}
                onChange={(e) => patchAcc({ name: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'نوع', 'Type')}</label>
                  <GlassSelect<BankAccountType>
                    size="sm"
                    className="w-full"
                    value={act.accountType}
                    onChange={(tp) => patchAcc({ accountType: tp })}
                    options={[
                      { value: 'bank', label: t(lang, 'بانکی', 'Bank') },
                      { value: 'cash', label: t(lang, 'نقدی', 'Cash') },
                      { value: 'wallet', label: t(lang, 'کیف پول', 'Wallet') },
                    ]}
                  />
                </div>
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'ارز', 'Currency')}</label>
                  <GlassSelect<CurrencyCode>
                    size="sm"
                    className="w-full"
                    value={act.currency}
                    onChange={(c) => patchAcc({ currency: c })}
                    options={[
                      { value: 'IRT', label: 'IRT' },
                      { value: 'USD', label: 'USD' },
                    ]}
                  />
                </div>
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  label={t(lang, 'موجودی', 'Balance')}
                  value={String(act.balance)}
                  onChange={(e) => patchAcc({ balance: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)]">
            <button
              type="button"
              onClick={() => updateMessage(msg.id, (m) => ({ ...m, editingAction: !m.editingAction }))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <Pencil className="w-3 h-3" />
              <span>{msg.editingAction ? t(lang, 'بستن', 'Close') : t(lang, 'ویرایش', 'Edit')}</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateMessage(msg.id, (m) => ({ ...m, status: 'cancelled' }))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] border border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
              >
                {t(lang, 'لغو', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmAction(msg)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold ft-accent-gradient cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t(lang, 'تأیید و ایجاد حساب', 'Create Account')}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (act.kind === 'add_person') {
      const patchPerson = (patch: Partial<typeof act>) =>
        updateMessage(msg.id, (m) =>
          m.action && m.action.kind === 'add_person' ? { ...m, action: { ...m.action, ...patch } } : m
        );
      return (
        <div className="rounded-xl bg-[var(--ft-surface-solid)]/80 border border-[var(--ft-border-strong)] p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ft-text-primary)]">
            <UserPlus className="w-4 h-4 text-[var(--ft-accent)] shrink-0" />
            <span>{act.title}</span>
          </div>
          {msg.editingAction ? (
            <div className="grid grid-cols-2 gap-2">
              <MaterialInput
                type="text"
                fieldSize="sm"
                label={t(lang, 'نام کامل', 'Name')}
                value={act.name}
                onChange={(e) => patchPerson({ name: e.target.value })}
              />
              <div className="md-field">
                <label className="md-field-label">{t(lang, 'نسبت', 'Role')}</label>
                <GlassSelect<PersonRole>
                  size="sm"
                  className="w-full"
                  value={act.role}
                  onChange={(r) => patchPerson({ role: r })}
                  options={[
                    { value: 'friend', label: t(lang, 'دوست', 'Friend') },
                    { value: 'partner', label: t(lang, 'شریک', 'Partner') },
                    { value: 'client', label: t(lang, 'مشتری', 'Client') },
                    { value: 'family', label: t(lang, 'خانواده', 'Family') },
                    { value: 'other', label: t(lang, 'سایر', 'Other') },
                  ]}
                />
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-[var(--ft-text-secondary)]">
              {t(lang, 'نام:', 'Name:')}{' '}
              <span className="font-semibold text-[var(--ft-text-primary)]">{act.name}</span> ·{' '}
              {act.role === 'friend'
                ? t(lang, 'دوست', 'Friend')
                : act.role === 'partner'
                ? t(lang, 'شریک', 'Partner')
                : act.role === 'client'
                ? t(lang, 'مشتری', 'Client')
                : act.role === 'family'
                ? t(lang, 'خانواده', 'Family')
                : t(lang, 'سایر', 'Other')}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)]">
            <button
              type="button"
              onClick={() => updateMessage(msg.id, (m) => ({ ...m, editingAction: !m.editingAction }))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <Pencil className="w-3 h-3" />
              <span>{msg.editingAction ? t(lang, 'بستن', 'Close') : t(lang, 'ویرایش', 'Edit')}</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateMessage(msg.id, (m) => ({ ...m, status: 'cancelled' }))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] border border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
              >
                {t(lang, 'لغو', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmAction(msg)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold ft-accent-gradient cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t(lang, 'تأیید و افزودن', 'Add Person')}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (act.kind === 'add_loan') {
      const patchLoan = (patch: Partial<typeof act>) =>
        updateMessage(msg.id, (m) =>
          m.action && m.action.kind === 'add_loan' ? { ...m, action: { ...m.action, ...patch } } : m
        );
      return (
        <div className="rounded-xl bg-[var(--ft-surface-solid)]/80 border border-[var(--ft-border-strong)] p-3 space-y-2.5">
          <div className="text-xs font-bold text-[var(--ft-text-primary)]">{act.title}</div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-num">
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'مبلغ کل', 'Total Amount')}</span>
              <span className="font-bold">
                {formatMoney(act.totalAmount, act.currency, lang, false, isPrivate)}
              </span>
            </div>
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'اقساط', 'Installments')}</span>
              <span className="font-semibold">
                {act.totalInstallments} × {formatMoney(act.installmentAmount, act.currency, lang, false, isPrivate)}
              </span>
            </div>
          </div>

          {msg.editingAction && (
            <div className="pt-2 border-t border-[var(--ft-border)] space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <MaterialInput
                  type="text"
                  fieldSize="sm"
                  label={t(lang, 'عنوان وام/بدهی', 'Loan Title')}
                  value={act.loanTitle}
                  onChange={(e) => patchLoan({ loanTitle: e.target.value })}
                />
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'نوع', 'Kind')}</label>
                  <GlassSelect<LoanKind>
                    size="sm"
                    className="w-full"
                    value={act.loanKind}
                    onChange={(k) => patchLoan({ loanKind: k })}
                    options={[
                      { value: 'loan', label: t(lang, 'وام بانکی', 'Loan') },
                      { value: 'debt', label: t(lang, 'بدهی قسطی', 'Installment Debt') },
                      { value: 'receivable', label: t(lang, 'طلب قسطی', 'Receivable') },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  label={t(lang, 'مبلغ کل', 'Total')}
                  value={String(act.totalAmount)}
                  onChange={(e) => {
                    const tot = Number(e.target.value) || 0;
                    patchLoan({
                      totalAmount: tot,
                      installmentAmount: Math.round(tot / Math.max(1, act.totalInstallments)),
                    });
                  }}
                />
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  min={1}
                  label={t(lang, 'تعداد قسط', 'Count')}
                  value={String(act.totalInstallments)}
                  onChange={(e) => {
                    const cnt = Math.max(1, Number(e.target.value) || 1);
                    patchLoan({
                      totalInstallments: cnt,
                      installmentAmount: Math.round(act.totalAmount / cnt),
                    });
                  }}
                />
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  label={t(lang, 'مبلغ هر قسط', 'Per Inst')}
                  value={String(act.installmentAmount)}
                  onChange={(e) => patchLoan({ installmentAmount: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)]">
            <button
              type="button"
              onClick={() => updateMessage(msg.id, (m) => ({ ...m, editingAction: !m.editingAction }))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <Pencil className="w-3 h-3" />
              <span>{msg.editingAction ? t(lang, 'بستن', 'Close') : t(lang, 'ویرایش', 'Edit')}</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateMessage(msg.id, (m) => ({ ...m, status: 'cancelled' }))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] border border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
              >
                {t(lang, 'لغو', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmAction(msg)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold ft-accent-gradient cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t(lang, 'ثبت وام', 'Save Loan')}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (act.kind === 'add_goal') {
      const patchGoal = (patch: Partial<typeof act>) =>
        updateMessage(msg.id, (m) =>
          m.action && m.action.kind === 'add_goal'
            ? { ...m, action: { ...m.action, ...patch } }
            : m
        );

      return (
        <div className="rounded-xl bg-[var(--ft-surface-solid)]/80 border border-[var(--ft-border-strong)] p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--ft-text-primary)]">
            <Target className="w-4 h-4 text-[var(--ft-accent)] shrink-0" />
            <span className="truncate">{act.title}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-num">
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'عنوان هدف', 'Goal')}</span>
              <span className="font-semibold text-[var(--ft-text-primary)] truncate block">
                {act.goalTitle}
              </span>
            </div>
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'مبلغ هدف', 'Target Amount')}</span>
              <span className="font-bold text-[var(--ft-text-primary)]">
                {act.targetAmount > 0
                  ? formatMoney(act.targetAmount, act.currency, lang, false, isPrivate)
                  : t(lang, 'نیازمند تعیین مبلغ', 'Set target price')}
              </span>
            </div>
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'نوع', 'Kind')}</span>
              <span className="font-medium text-[var(--ft-text-secondary)]">
                {act.goalKind === 'item'
                  ? t(lang, 'خرید کالا / هدف عینی', 'Purchase Item')
                  : t(lang, 'هدف مالی / نقدی', 'Monetary Goal')}
              </span>
            </div>
            <div>
              <span className="text-[var(--ft-text-muted)] block">{t(lang, 'اولویت و وضعیت', 'Priority & Status')}</span>
              <span className="font-medium text-[var(--ft-text-secondary)]">
                P{act.priority}
                {act.weeklyBudgetAmount > 0
                  ? ` · ${formatMoney(act.weeklyBudgetAmount, act.currency, lang, true, isPrivate)}`
                  : ''}
                {act.activateImmediately !== false ? ` (${t(lang, 'فعال', 'Active')})` : ''}
              </span>
            </div>
          </div>

          {msg.editingAction && (
            <div className="pt-2 border-t border-[var(--ft-border)] space-y-2">
              <MaterialInput
                type="text"
                fieldSize="sm"
                label={t(lang, 'عنوان هدف', 'Goal Title')}
                value={act.goalTitle}
                onChange={(e) => {
                  const nextTitle = e.target.value;
                  patchGoal({
                    goalTitle: nextTitle,
                    title:
                      lang === 'fa'
                        ? `${act.goalKind === 'item' ? 'هدف خرید' : 'هدف مالی'}: ${nextTitle}`
                        : `Goal: ${nextTitle}`,
                  });
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  step="any"
                  ltrNum
                  label={t(lang, 'مبلغ هدف', 'Target Amount')}
                  value={act.targetAmount > 0 ? String(act.targetAmount) : ''}
                  placeholder={t(lang, 'مثلاً ۶۵۰۰۰۰۰۰', 'e.g. 65000000')}
                  onChange={(e) => patchGoal({ targetAmount: Math.max(0, Number(e.target.value) || 0) })}
                />
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'ارز', 'Currency')}</label>
                  <GlassSelect<CurrencyCode>
                    size="sm"
                    className="w-full"
                    value={act.currency}
                    onChange={(c) => patchGoal({ currency: c })}
                    options={[
                      { value: 'IRT', label: 'IRT' },
                      { value: 'USD', label: 'USD' },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'نوع هدف', 'Goal Kind')}</label>
                  <GlassSelect<GoalKind>
                    size="sm"
                    className="w-full"
                    value={act.goalKind}
                    onChange={(k) => patchGoal({ goalKind: k })}
                    options={[
                      { value: 'item', label: t(lang, 'خرید کالا', 'Purchase Item') },
                      { value: 'monetary', label: t(lang, 'هدف مالی', 'Monetary') },
                    ]}
                  />
                </div>
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'اولویت', 'Priority')}</label>
                  <GlassSelect<string>
                    size="sm"
                    className="w-full"
                    value={String(act.priority)}
                    onChange={(p) => patchGoal({ priority: Math.min(5, Math.max(1, Number(p) || 2)) })}
                    options={[
                      { value: '1', label: t(lang, 'P1 — فوری و حیاتی', 'P1 — Critical') },
                      { value: '2', label: t(lang, 'P2 — اولویت بالا', 'P2 — High') },
                      { value: '3', label: t(lang, 'P3 — متوسط', 'P3 — Medium') },
                      { value: '4', label: t(lang, 'P4 — کم', 'P4 — Low') },
                      { value: '5', label: t(lang, 'P5 — آتی', 'P5 — Backlog') },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)]">
            <button
              type="button"
              onClick={() => updateMessage(msg.id, (m) => ({ ...m, editingAction: !m.editingAction }))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <Pencil className="w-3 h-3" />
              <span>{msg.editingAction ? t(lang, 'بستن ویرایش', 'Hide Edit') : t(lang, 'ویرایش هدف', 'Edit Goal')}</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => updateMessage(msg.id, (m) => ({ ...m, status: 'cancelled', editingAction: false }))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] border border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
              >
                {t(lang, 'لغو', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmAction(msg)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold ft-accent-gradient cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t(lang, 'تأیید و ثبت هدف', 'Create Goal')}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (act.kind !== 'add_transaction') {
      return (
        <div className="rounded-xl bg-[var(--ft-surface-solid)]/80 border border-[var(--ft-border-strong)] p-3 space-y-2.5">
          <div className="text-xs font-bold text-[var(--ft-text-primary)]">{act.title}</div>

          {act.kind === 'activate_goal' && (
            <div className="text-[11px] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-[var(--ft-accent)] shrink-0" />
              <span>
                {act.goalTitle} ← {act.status}
                {act.priority ? ` (P${act.priority})` : ''}
              </span>
            </div>
          )}

          {act.kind === 'contribute_goal' && (
            <div className="text-[11px] font-num">
              {t(lang, 'مبلغ واریز:', 'Contribution:')}{' '}
              <span className="font-bold">
                {formatMoney(act.amount, act.currency, lang, false, isPrivate)}
              </span>
            </div>
          )}

          {act.kind === 'add_fixed_expense' && (
            <div className="grid grid-cols-2 gap-2 text-[11px] font-num">
              <div>
                <span className="text-[var(--ft-text-muted)] block">{t(lang, 'مبلغ ماهانه', 'Monthly Amount')}</span>
                <span className="font-semibold">
                  {formatMoney(act.amount, act.currency, lang, false, isPrivate)}
                </span>
              </div>
              <div>
                <span className="text-[var(--ft-text-muted)] block">{t(lang, 'روز سررسید (شمسی)', 'Due Day')}</span>
                <span className="font-semibold">{act.dayOfMonth} {t(lang, 'هر ماه', 'monthly')}</span>
              </div>
            </div>
          )}

          {act.kind === 'add_budget_cap' && (
            <div className="text-[11px] font-num">
              {t(lang, 'سقف تخصیص:', 'Allocation:')} {act.percentOfBalance}%{' '}
              {t(lang, 'از مانده حساب', 'of account balance')}
            </div>
          )}

          {act.kind === 'add_person_entry' && (
            <div className="grid grid-cols-2 gap-2 text-[11px] font-num">
              <div>
                <span className="text-[var(--ft-text-muted)] block">{t(lang, 'نوع ثبت', 'Type')}</span>
                <span className="font-semibold">
                  {act.direction === 'give'
                    ? t(lang, 'پرداخت / قرض دادم', 'Paid / Lent')
                    : t(lang, 'دریافت / قرض گرفتم', 'Received / Borrowed')}
                </span>
              </div>
              <div>
                <span className="text-[var(--ft-text-muted)] block">{t(lang, 'مبلغ', 'Amount')}</span>
                <span className="font-semibold">
                  {formatMoney(act.amount, act.currency, lang, false, isPrivate)}
                </span>
              </div>
            </div>
          )}

          {act.kind === 'pay_loan_installment' && (
            <div className="grid grid-cols-2 gap-2 text-[11px] font-num">
              <div>
                <span className="text-[var(--ft-text-muted)] block">{t(lang, 'مبلغ قسط', 'Installment')}</span>
                <span className="font-semibold">
                  {formatMoney(act.installmentAmount, act.currency, lang, false, isPrivate)}
                </span>
              </div>
              <div>
                <span className="text-[var(--ft-text-muted)] block">{t(lang, 'حساب پرداخت', 'Account')}</span>
                <span className="font-semibold truncate block">
                  {state.bankAccounts.find((a) => a.id === act.accountId)?.name ?? '—'}
                </span>
              </div>
            </div>
          )}

          {act.kind === 'add_custom_mission' && (
            <div className="text-[11px] font-num">
              {act.missionTitle} · {t(lang, 'هدف:', 'Target:')} {act.targetValue.toLocaleString('en-US')} · +{act.xp} XP · {act.stars}★
            </div>
          )}

          {act.kind === 'update_fx_rate' && (
            <div className="text-[11px] font-num">
              {act.mode === 'manual' && act.usdToman
                ? `${t(lang, 'نرخ جدید:', 'New Rate:')} ${act.usdToman.toLocaleString('en-US')} IRT`
                : t(lang, 'استعلام نرخ زنده از سرور و به‌روزرسانی پنل', 'Fetch live market rate and apply across accounts')}
            </div>
          )}

          {act.kind === 'update_panel_settings' && (
            <div className="text-[11px] font-num space-y-0.5">
              {act.weeklyGoalPoolIrt !== undefined && (
                <div>{t(lang, 'استخر هفتگی:', 'Weekly Pool:')} {formatMoney(act.weeklyGoalPoolIrt, 'IRT', lang)}</div>
              )}
              {act.dailyMaxLossPct !== undefined && (
                <div>{t(lang, 'سقف ضرر روزانه:', 'Daily Max Loss:')} {act.dailyMaxLossPct}%</div>
              )}
              {act.defaultRiskPct !== undefined && (
                <div>{t(lang, 'ریسک هر معامله:', 'Default Risk:')} {act.defaultRiskPct}%</div>
              )}
            </div>
          )}

          {act.kind === 'save_memory' && (
            <div className="text-[11px] text-[var(--ft-text-secondary)]">
              «{act.fact}»
            </div>
          )}

          {act.kind === 'refresh_economic_news' && (
            <div className="space-y-2.5 text-[11px]">
              <div className="flex items-center justify-between gap-2 text-[var(--ft-positive)] bg-[var(--ft-positive-soft)] px-2.5 py-1.5 rounded-lg">
                <span className="flex items-center gap-1.5 font-medium">
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>{t(lang, 'فید رایگان تقویم اقتصادی (بدون نیاز به API پولی)', 'Free Economic Calendar Feed (No API Key Needed)')}</span>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[var(--ft-text-muted)] block mb-1">
                    {t(lang, 'فیلتر ارز / نماد', 'Currency Filter')}
                  </span>
                  <GlassSelect<string>
                    size="sm"
                    value={act.currencyFilter ?? 'ALL'}
                    onChange={(val) =>
                      updateMessage(msg.id, (m) =>
                        m.action && m.action.kind === 'refresh_economic_news'
                          ? { ...m, action: { ...m.action, currencyFilter: val } }
                          : m
                      )
                    }
                    options={[
                      { value: 'ALL', label: t(lang, 'همه ارزهای اصلی', 'All Major Currencies') },
                      { value: 'USD', label: t(lang, 'فقط USD (دلار و طلا)', 'USD Only (Gold & Dollar)') },
                      { value: 'USD,EUR,GBP', label: 'USD, EUR, GBP' },
                      { value: 'USD,EUR,GBP,JPY', label: 'USD, EUR, GBP, JPY' },
                    ]}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-[var(--ft-text-muted)] block mb-1">
                    {t(lang, 'سطح اهمیت اخبار', 'Impact Filter')}
                  </span>
                  <GlassSelect<'high_medium' | 'high' | 'all'>
                    size="sm"
                    value={act.impactFilter ?? 'high_medium'}
                    onChange={(val) =>
                      updateMessage(msg.id, (m) =>
                        m.action && m.action.kind === 'refresh_economic_news'
                          ? { ...m, action: { ...m.action, impactFilter: val } }
                          : m
                      )
                    }
                    options={[
                      { value: 'high_medium', label: t(lang, 'بااهمیت بالا و متوسط', 'High & Medium Impact') },
                      { value: 'high', label: t(lang, 'فقط اخبار مهم (High)', 'High Impact Only') },
                      { value: 'all', label: t(lang, 'همه اخبار هفته', 'All Events This Week') },
                    ]}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-[var(--ft-border)]">
            <button
              type="button"
              disabled={fetchingActionId === msg.id}
              onClick={() => updateMessage(msg.id, (m) => ({ ...m, status: 'cancelled' }))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] border border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {t(lang, 'لغو', 'Cancel')}
            </button>
            <button
              type="button"
              disabled={fetchingActionId === msg.id}
              onClick={() => void handleConfirmAction(msg)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold ft-accent-gradient cursor-pointer flex items-center gap-1 whitespace-nowrap disabled:opacity-70"
            >
              {fetchingActionId === msg.id ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>
                {fetchingActionId === msg.id
                  ? t(lang, 'در حال دریافت...', 'Fetching...')
                  : t(lang, 'تأیید و اجرا', 'Confirm & Execute')}
              </span>
            </button>
          </div>
        </div>
      );
    }

    // Editable Transaction Confirmation Card
    const draft = act.draft;
    const patchDraft = (patch: Partial<typeof draft>) => {
      updateMessage(msg.id, (m) =>
        m.action && m.action.kind === 'add_transaction'
          ? { ...m, action: { ...m.action, draft: { ...m.action.draft, ...patch } } }
          : m
      );
    };

    return (
      <div className="rounded-xl bg-[var(--ft-surface-solid)]/80 border border-[var(--ft-border-strong)] p-3 space-y-3">
        {msg.isOfflineFallback && (
          <div className="flex items-start gap-1.5 text-[11px] text-[var(--ft-warning)] bg-[var(--ft-warning-soft)] px-2.5 py-1.5 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {t(
                lang,
                'تحلیل آفلاین انجام شد؛ لطفاً مقادیر را بررسی و تأیید کنید.',
                'Parsed offline; verify values before saving.'
              )}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <div>
            <span className="text-[var(--ft-text-muted)] block">{t(lang, 'نوع و مبلغ', 'Type & Amount')}</span>
            <span className="font-bold font-num text-[var(--ft-text-primary)]">
              {txTypeLabel(draft.type)} ·{' '}
              {draft.amount > 0
                ? formatMoney(draft.amount, draft.currency, lang, false, isPrivate)
                : t(lang, 'نامشخص', 'Missing')}
            </span>
          </div>
          <div>
            <span className="text-[var(--ft-text-muted)] block">{t(lang, 'منشاء / حساب', 'Origin / Account')}</span>
            <span className="font-semibold text-[var(--ft-text-primary)] truncate block">
              {resolveTxOriginLabel(act)}
            </span>
          </div>
          <div>
            <span className="text-[var(--ft-text-muted)] block">{t(lang, 'تاریخ', 'Date')}</span>
            <span className="font-num text-[var(--ft-text-secondary)]">
              {lang === 'fa' ? formatJalaliDate(`${draft.date}T12:00:00`) : draft.date}
            </span>
          </div>
          <div>
            <span className="text-[var(--ft-text-muted)] block">{t(lang, 'شرح / دسته', 'Note & Category')}</span>
            <span className="text-[var(--ft-text-secondary)] truncate block">
              {draft.note || draft.categoryLabel || '—'}
            </span>
          </div>
        </div>

        {msg.editingAction && (
          <div className="pt-2.5 border-t border-[var(--ft-border)] space-y-2.5">
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
              {(
                [
                  ['out', t(lang, 'هزینه', 'Expense')],
                  ['in', t(lang, 'درآمد', 'Income')],
                  ['transfer', t(lang, 'انتقال', 'Transfer')],
                ] as Array<[TransactionType, string]>
              ).map(([tp, lb]) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => patchDraft({ type: tp })}
                  className={`py-1 text-[11px] font-medium rounded-md cursor-pointer ${
                    draft.type === tp
                      ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] font-semibold'
                      : 'text-[var(--ft-text-secondary)]'
                  }`}
                >
                  {lb}
                </button>
              ))}
            </div>

            {draft.type === 'out' && (
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    ['bank', t(lang, 'بانکی', 'Bank')],
                    ['cash', t(lang, 'نقدی', 'Cash')],
                    ['usd', t(lang, 'دلاری', 'USD')],
                    ['credit', t(lang, 'اعتباری', 'Credit')],
                    ['person_debt', t(lang, 'قرض', 'Debt')],
                  ] as Array<[PaymentMethod, string]>
                ).map(([pm, lb]) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => {
                      let nextAcc = draft.accountId;
                      let nextCur = draft.currency;
                      if (pm === 'usd') {
                        nextCur = 'USD';
                        nextAcc = state.bankAccounts.find((a) => a.currency === 'USD')?.id ?? nextAcc;
                      } else if (pm === 'cash') {
                        nextAcc = state.bankAccounts.find((a) => a.type === 'cash')?.id ?? nextAcc;
                      } else if (pm === 'bank') {
                        nextCur = 'IRT';
                        nextAcc =
                          state.bankAccounts.find((a) => a.type === 'bank' && a.currency === 'IRT')?.id ??
                          nextAcc;
                      }
                      patchDraft({
                        paymentMethod: pm,
                        currency: nextCur,
                        accountId: nextAcc,
                        creditLineId:
                          pm === 'credit'
                            ? draft.creditLineId || state.creditLines?.[0]?.id || ''
                            : draft.creditLineId,
                        personId:
                          pm === 'person_debt'
                            ? draft.personId || state.people?.[0]?.id || ''
                            : draft.personId,
                      });
                    }}
                    className={`py-1 px-1.5 text-[11px] rounded-lg border cursor-pointer truncate ${
                      draft.paymentMethod === pm
                        ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] border-transparent font-semibold'
                        : 'border-[var(--ft-border)] text-[var(--ft-text-secondary)]'
                    }`}
                  >
                    {lb}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <MaterialInput
                type="number"
                fieldSize="sm"
                step="any"
                ltrNum
                label={t(lang, 'مبلغ', 'Amount')}
                value={draft.amount ? String(draft.amount) : ''}
                onChange={(e) => patchDraft({ amount: Number(e.target.value) || 0 })}
              />
              <div className="md-field">
                <label className="md-field-label">{t(lang, 'ارز', 'Currency')}</label>
                <GlassSelect<CurrencyCode>
                  size="sm"
                  className="w-full"
                  value={draft.currency}
                  onChange={(val) => patchDraft({ currency: val })}
                  options={[
                    { value: 'IRT', label: 'IRT' },
                    { value: 'USD', label: 'USD' },
                  ]}
                />
              </div>
            </div>

            {draft.type === 'out' && draft.paymentMethod === 'credit' ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 md-field">
                  <label className="md-field-label">{t(lang, 'خط اعتبار', 'Credit Line')}</label>
                  <GlassSelect
                    size="sm"
                    className="w-full"
                    value={draft.creditLineId}
                    onChange={(id) => {
                      const cl = state.creditLines?.find((c) => c.id === id);
                      patchDraft({
                        creditLineId: id,
                        currency: cl?.currency ?? draft.currency,
                        installmentCount: cl?.defaultInstallments ?? draft.installmentCount,
                      });
                    }}
                    options={(state.creditLines ?? []).map((c) => ({ value: c.id, label: c.title }))}
                  />
                </div>
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  min={1}
                  max={36}
                  label={t(lang, 'اقساط', 'Inst')}
                  value={String(draft.installmentCount)}
                  onChange={(e) =>
                    patchDraft({ installmentCount: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
            ) : draft.type === 'out' && draft.paymentMethod === 'person_debt' ? (
              <div className="md-field">
                <label className="md-field-label">{t(lang, 'شخص', 'Person')}</label>
                <GlassSelect
                  size="sm"
                  className="w-full"
                  value={draft.personId}
                  onChange={(id) => patchDraft({ personId: id })}
                  options={(state.people ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'حساب', 'Account')}</label>
                  <GlassSelect
                    size="sm"
                    className="w-full"
                    value={draft.accountId}
                    onChange={(id) => patchDraft({ accountId: id })}
                    options={state.bankAccounts.map((a) => ({
                      value: a.id,
                      label: `${a.name} (${a.currency})`,
                    }))}
                  />
                </div>
                {draft.type === 'transfer' && (
                  <div className="md-field">
                    <label className="md-field-label">{t(lang, 'حساب مقصد', 'To Account')}</label>
                    <GlassSelect
                      size="sm"
                      className="w-full"
                      value={draft.toAccountId}
                      onChange={(id) => patchDraft({ toAccountId: id })}
                      options={state.bankAccounts.map((a) => ({
                        value: a.id,
                        label: `${a.name} (${a.currency})`,
                      }))}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {draft.type === 'out' && (
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'لیبل', 'Category')}</label>
                  <GlassSelect
                    size="sm"
                    className="w-full"
                    value={draft.categoryLabel}
                    onChange={(val) => patchDraft({ categoryLabel: val })}
                    options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                  />
                </div>
              )}
              <JalaliDatePicker
                lang={lang}
                fieldSize="sm"
                label={t(lang, 'تاریخ', 'Date')}
                value={draft.date}
                onChange={(d) => patchDraft({ date: d })}
              />
            </div>

            <MaterialInput
              type="text"
              fieldSize="sm"
              label={t(lang, 'توضیح', 'Note')}
              value={draft.note}
              onChange={(e) => patchDraft({ note: e.target.value })}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)]">
          <button
            type="button"
            onClick={() => updateMessage(msg.id, (m) => ({ ...m, editingAction: !m.editingAction }))}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1 whitespace-nowrap"
          >
            <Pencil className="w-3 h-3" />
            <span>{msg.editingAction ? t(lang, 'بستن ویرایش', 'Hide Edit') : t(lang, 'ویرایش', 'Edit')}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateMessage(msg.id, (m) => ({ ...m, status: 'cancelled', editingAction: false }))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] border border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
            >
              {t(lang, 'لغو', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={() => handleConfirmAction(msg)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold ft-accent-gradient cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t(lang, 'تأیید و ثبت', 'Confirm & Save')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Scrollable Message Thread */}
      <div className={`flex-1 overflow-y-auto space-y-3 ${compact ? 'px-3.5 py-3.5' : 'px-5 py-5'}`}>
        {messages.length === 0 && (
          <div className="py-6 space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-bold text-[var(--ft-text-primary)]">
                {t(lang, 'آماده انجام کار یا تحلیل جدید', 'Ready for your next task or analysis')}
              </div>
              <p className="text-xs text-[var(--ft-text-muted)] leading-relaxed">
                {t(
                  lang,
                  'پیام خود را بنویسید یا یکی از دستورات سریع زیر را انتخاب کنید؛ تمام داده‌های پنل و حافظه دستیار در دسترس است.',
                  'Type a task or question below; full live panel data and saved memory are active.'
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => void handleSend(qr)}
                  className="px-3 py-2 rounded-xl border border-[var(--ft-border-strong)] bg-[var(--ft-surface-subtle)] hover:border-[var(--ft-accent)] text-xs text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)] transition-colors cursor-pointer text-start"
                >
                  {qr}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isLatestAssistant = msg.role === 'assistant' && idx === messages.length - 1;
          const isWelcome = msg.id.startsWith('welcome_');

          if (msg.role === 'user') {
            const isEditing = editingMsgId === msg.id;
            return (
              <div key={msg.id} className="group flex flex-col items-end gap-1">
                {isEditing ? (
                  <div className="w-full max-w-[90%] rounded-2xl border border-[var(--ft-accent)] bg-[var(--ft-surface-subtle)] p-2.5 space-y-2">
                    <textarea
                      rows={2}
                      value={editingDraftText}
                      onChange={(e) => setEditingDraftText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSaveEditedUserMessage(msg.id);
                        } else if (e.key === 'Escape') {
                          setEditingMsgId(null);
                        }
                      }}
                      autoFocus
                      className="w-full bg-transparent text-xs sm:text-[13px] text-[var(--ft-text-primary)] focus:outline-none resize-none leading-relaxed"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingMsgId(null)}
                        className="px-2.5 py-1 rounded-lg text-[11px] border border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1 whitespace-nowrap"
                      >
                        <X className="w-3 h-3" />
                        <span>{t(lang, 'انصراف', 'Cancel')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={!editingDraftText.trim() || analyzing}
                        onClick={() => void handleSaveEditedUserMessage(msg.id)}
                        className="px-3 py-1 rounded-lg text-[11px] font-bold ft-accent-gradient cursor-pointer flex items-center gap-1 whitespace-nowrap disabled:opacity-40"
                      >
                        <Check className="w-3 h-3" />
                        <span>{t(lang, 'ارسال مجدد', 'Save & Resend')}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="max-w-[85%] rounded-2xl rounded-ee-sm px-3.5 py-2.5 text-xs sm:text-[13px] leading-relaxed bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] shadow-sm whitespace-pre-line">
                      {msg.text}
                    </div>
                    <div className="flex items-center gap-2 px-1 opacity-75 group-hover:opacity-100 transition-opacity">
                      {msg.editedAt && (
                        <span className="text-[10px] text-[var(--ft-text-muted)]">
                          {t(lang, 'ویرایش‌شده', 'Edited')}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={analyzing}
                        onClick={() => {
                          setEditingMsgId(msg.id);
                          setEditingDraftText(msg.text);
                        }}
                        className="text-[10px] text-[var(--ft-text-muted)] hover:text-[var(--ft-text-primary)] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>{t(lang, 'ویرایش', 'Edit')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={analyzing}
                        onClick={() => void handleRetryMessage(msg.id)}
                        className="text-[10px] text-[var(--ft-text-muted)] hover:text-[var(--ft-text-primary)] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{t(lang, 'تلاش مجدد', 'Retry')}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex flex-col items-start gap-2">
              <div className="max-w-[94%] rounded-2xl rounded-es-sm px-3.5 py-2.5 bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] space-y-2.5">
                <p className="text-xs sm:text-[13px] leading-relaxed text-[var(--ft-text-primary)] whitespace-pre-line">
                  {msg.text}
                </p>

                {msg.memorySavedFact && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--ft-accent)]">
                    <BookmarkCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t(lang, 'در حافظه دستیار ذخیره شد:', 'Saved to memory:')} {msg.memorySavedFact}
                    </span>
                  </div>
                )}

                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="rounded-xl bg-[var(--ft-accent-soft)]/55 border border-[var(--ft-accent)]/30 p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--ft-accent)]">
                      <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                      <span>{t(lang, 'پیشنهاد دستیار:', 'Proactive Recommendation:')}</span>
                    </div>
                    {msg.suggestions.map((sug, sIdx) => (
                      <div key={sIdx} className="text-[11px] leading-relaxed text-[var(--ft-text-primary)]">
                        • {sug}
                      </div>
                    ))}
                  </div>
                )}

                {renderActionCard(msg)}

                {msg.status === 'saved' && (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ft-positive)] bg-[var(--ft-positive-soft)] px-2.5 py-1.5 rounded-lg font-num">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {t(lang, 'انجام شد:', 'Completed:')} {msg.savedSummary}
                    </span>
                  </div>
                )}

                {msg.status === 'cancelled' && (
                  <div className="text-[11px] text-[var(--ft-text-muted)]">
                    {t(lang, 'لغو شد — می‌توانید دستور خود را ویرایش کنید یا پیام جدید بنویسید.', 'Cancelled — edit your message or send a new one.')}
                  </div>
                )}

                {!isWelcome && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[10px] text-[var(--ft-text-muted)] font-num">
                    <span>
                      {msg.modelUsed || (msg.isOfflineFallback ? t(lang, 'تحلیلگر آفلاین', 'Offline Parser') : '')}
                      {msg.latencyMs ? ` · ${(msg.latencyMs / 1000).toFixed(1)}s` : ''}
                    </span>
                    <button
                      type="button"
                      disabled={analyzing}
                      onClick={() => void handleRetryMessage(msg.id)}
                      className="flex items-center gap-1 text-[10px] text-[var(--ft-text-secondary)] hover:text-[var(--ft-accent)] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>{t(lang, 'تلاش مجدد', 'Retry')}</span>
                    </button>
                  </div>
                )}
              </div>

              {isLatestAssistant && !analyzing && msg.quickReplies && msg.quickReplies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-w-[95%]">
                  {msg.quickReplies.map((qr) => (
                    <button
                      key={qr}
                      type="button"
                      onClick={() => void handleSend(qr)}
                      className="px-2.5 py-1.5 rounded-xl border border-[var(--ft-border-strong)] bg-[var(--ft-surface-solid)]/70 hover:border-[var(--ft-accent)] text-[11px] text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)] transition-colors cursor-pointer text-start"
                    >
                      {qr}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {analyzing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-es-sm px-3.5 py-2.5 bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] text-xs text-[var(--ft-text-muted)] flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--ft-accent)]" />
              <span>{t(lang, 'در حال بررسی داده‌های پنل و تحلیل...', 'Analyzing panel context...')}</span>
            </div>
          </div>
        )}

        <div ref={scrollEndRef} />
      </div>

      {/* Pinned Bottom Chat Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className={`${compact ? 'p-3' : 'p-4'} border-t border-[var(--ft-border)] bg-[var(--ft-surface-solid)]/60 shrink-0`}
      >
        <div
          className={`rounded-2xl border border-[var(--ft-border-strong)] bg-[var(--ft-surface-subtle)] px-3.5 pt-3 pb-2.5 flex flex-col gap-2 focus-within:border-[var(--ft-accent)] transition-colors ${
            compact ? 'min-h-[96px]' : 'min-h-[112px]'
          }`}
        >
          <textarea
            ref={inputRef}
            rows={compact ? 2 : 3}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={t(
              lang,
              'سوال تحلیلی بپرسید یا هر تغییری در پنل بخواهید (هدف، خط اعتبار، حساب، تراکنش)...',
              'Ask for analysis or define/log anything (goal, credit line, account, transaction)...'
            )}
            className={`w-full bg-transparent text-xs sm:text-[13px] leading-relaxed text-[var(--ft-text-primary)] placeholder:text-[var(--ft-text-muted)] focus:outline-none resize-none overflow-y-auto ${
              compact ? 'min-h-[44px] max-h-[116px]' : 'min-h-[58px] max-h-[152px]'
            }`}
          />

          <div className="pt-2 border-t border-[var(--ft-border)]/70 flex flex-wrap items-center justify-between gap-2">
            {/* Inline Model & Mode Controls (Pro Chatbot Bar) */}
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {(localAi.profiles?.length ?? 0) > 0 && (
                <label className="h-8 rounded-xl bg-[var(--ft-surface-solid)]/85 border border-[var(--ft-border)] hover:border-[var(--ft-border-strong)] px-2.5 flex items-center gap-1.5 max-w-[190px] sm:max-w-[230px] cursor-pointer transition-colors">
                  <Bot className="w-3.5 h-3.5 text-[var(--ft-accent)] shrink-0" />
                  <select
                    value={activeProfile.id}
                    onChange={(e) => handleSwitchProfile(e.target.value)}
                    aria-label={t(lang, 'انتخاب مدل هوش مصنوعی', 'Select AI Model')}
                    className="bg-transparent text-[11px] font-medium text-[var(--ft-text-primary)] focus:outline-none cursor-pointer truncate min-w-0 w-full"
                  >
                    {(localAi.profiles ?? []).map((p) => (
                      <option key={p.id} value={p.id} className="bg-[var(--ft-surface-solid)] text-[var(--ft-text-primary)]">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="h-8 rounded-xl bg-[var(--ft-surface-solid)]/85 border border-[var(--ft-border)] hover:border-[var(--ft-border-strong)] px-2.5 flex items-center gap-1.5 cursor-pointer transition-colors">
                <Sparkles className="w-3.5 h-3.5 text-[var(--ft-accent)] shrink-0" />
                <select
                  value={localAi.assistantMode ?? 'auto'}
                  onChange={(e) => handleSwitchMode(e.target.value as AssistantChatMode)}
                  aria-label={t(lang, 'انتخاب حالت دستیار', 'Select Assistant Mode')}
                  className="bg-transparent text-[11px] font-medium text-[var(--ft-text-primary)] focus:outline-none cursor-pointer"
                >
                  <option value="auto" className="bg-[var(--ft-surface-solid)] text-[var(--ft-text-primary)]">
                    {t(lang, 'حالت: خودکار', 'Mode: Auto')}
                  </option>
                  <option value="analysis" className="bg-[var(--ft-surface-solid)] text-[var(--ft-text-primary)]">
                    {t(lang, 'تحلیلی عمیق', 'Deep Analysis')}
                  </option>
                  <option value="action" className="bg-[var(--ft-surface-solid)] text-[var(--ft-text-primary)]">
                    {t(lang, 'ثبت و اجرا', 'Action & Execute')}
                  </option>
                  <option value="fast" className="bg-[var(--ft-surface-solid)] text-[var(--ft-text-primary)]">
                    {t(lang, 'پاسخ سریع', 'Fast Reply')}
                  </option>
                </select>
              </label>

              {(state.assistantMemory?.length ?? 0) > 0 && (
                <span className="text-[11px] text-[var(--ft-text-muted)] whitespace-nowrap px-1.5 font-num hidden sm:inline">
                  {state.assistantMemory!.length} {t(lang, 'حافظه', 'mem')}
                </span>
              )}
            </div>

            {/* Mic & Send Actions */}
            <div className="flex items-center gap-1.5 ms-auto">
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleVoice}
                  title={t(lang, 'ورود صوتی', 'Voice Input')}
                  aria-label={t(lang, 'ورود صوتی', 'Voice Input')}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    listening
                      ? 'bg-[var(--ft-danger-soft)] text-[var(--ft-danger)]'
                      : 'text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)]'
                  }`}
                >
                  {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}

              <button
                type="submit"
                disabled={analyzing || !composer.trim()}
                title={t(lang, 'ارسال پیام', 'Send')}
                aria-label={t(lang, 'ارسال پیام', 'Send')}
                className="h-8 px-3 rounded-xl ft-accent-gradient flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-40 cursor-pointer text-[11px] font-bold"
              >
                <Send className="w-3.5 h-3.5" />
                {!compact && <span>{t(lang, 'ارسال', 'Send')}</span>}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
