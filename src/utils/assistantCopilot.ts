import {
  AiModelProfile,
  AssistantActionPayload,
  AssistantChatMode,
  AssistantMemoryItem,
  AssistantThread,
  BankAccount,
  BankAccountType,
  CreditProvider,
  CurrencyCode,
  FundTrackState,
  GoalBudgetSource,
  GoalDeadlineMode,
  GoalKind,
  GoalStatus,
  LoanKind,
  LocalAiConfig,
  LocalAiProvider,
  MainCategory,
  PersonRole,
} from '../types';
import { buildAssistantPanelSnapshot, buildLocalStatisticalBrief, PanelCopilotSnapshot } from './assistantAnalytics';
import { addJalaliMonths, formatJalaliDate, toLocalIsoDate } from './jalali';
import {
  extractAmountAndCurrency,
  extractJsonFromLlmText,
  normalizeDigitsAndSeparators,
  parseCommandLocally,
  stripBoundaryWords,
} from './localAiParser';

export type { AssistantActionPayload };

export interface CopilotTurnResponse {
  mode: 'chat' | 'clarify' | 'propose_action' | 'analysis';
  reply: string;
  suggestions: string[];
  quickReplies: string[];
  action?: AssistantActionPayload;
  memoryFact?: string;
  modelUsed?: string;
  latencyMs?: number;
  isOfflineFallback?: boolean;
  error?: string;
}

export interface CopilotChatTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CopilotContextOptions {
  memory?: AssistantMemoryItem[];
  recentThreads?: AssistantThread[];
  alreadyGreetedToday?: boolean;
  assistantMode?: AssistantChatMode;
}

export const PROVIDER_META: Record<
  LocalAiProvider,
  {
    labelFa: string;
    labelEn: string;
    isCloud: boolean;
    needsEndpoint: boolean;
    defaultEndpoint: string;
    defaultModel: string;
    defaultEnvKey: string;
  }
> = {
  gemini: {
    labelFa: 'Gemini Cloud (سرور داخلی پنل)',
    labelEn: 'Gemini Cloud (Built-in Server)',
    isCloud: true,
    needsEndpoint: false,
    defaultEndpoint: '',
    defaultModel: 'gemini-4-hydrogen',
    defaultEnvKey: 'GEMINI_API_KEY',
  },
  jan: {
    labelFa: 'Jan Desktop (لوکال GGUF — پورت 1337)',
    labelEn: 'Jan Desktop (Local Port 1337)',
    isCloud: false,
    needsEndpoint: true,
    defaultEndpoint: 'http://127.0.0.1:1337/v1',
    defaultModel: 'gemma-4-E2B-it-Q4_K_M',
    defaultEnvKey: 'LOCAL_AI_API_KEY',
  },
  llama_server: {
    labelFa: 'llama-server / llama.cpp (پورت 8080)',
    labelEn: 'llama-server (Port 8080)',
    isCloud: false,
    needsEndpoint: true,
    defaultEndpoint: 'http://127.0.0.1:8080/v1',
    defaultModel: 'gemma-4-E2B-it-Q4_K_M',
    defaultEnvKey: 'LOCAL_AI_API_KEY',
  },
  ollama: {
    labelFa: 'Ollama (پورت 11434)',
    labelEn: 'Ollama (Port 11434)',
    isCloud: false,
    needsEndpoint: true,
    defaultEndpoint: 'http://127.0.0.1:11434/v1',
    defaultModel: 'gemma4:e2b',
    defaultEnvKey: 'LOCAL_AI_API_KEY',
  },
  lmstudio: {
    labelFa: 'LM Studio (پورت 1234)',
    labelEn: 'LM Studio (Port 1234)',
    isCloud: false,
    needsEndpoint: true,
    defaultEndpoint: 'http://127.0.0.1:1234/v1',
    defaultModel: 'gemma-4-E2B-it-Q4_K_M',
    defaultEnvKey: 'LOCAL_AI_API_KEY',
  },
  openrouter: {
    labelFa: 'OpenRouter API (Claude / GPT / DeepSeek / Qwen)',
    labelEn: 'OpenRouter API (Multi-Model)',
    isCloud: true,
    needsEndpoint: true,
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4',
    defaultEnvKey: 'OPENROUTER_API_KEY',
  },
  openai: {
    labelFa: 'OpenAI API (GPT-4o / GPT-4.1)',
    labelEn: 'OpenAI API',
    isCloud: true,
    needsEndpoint: true,
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
    defaultEnvKey: 'OPENAI_API_KEY',
  },
  deepseek: {
    labelFa: 'DeepSeek API (Reasoner / Chat)',
    labelEn: 'DeepSeek API',
    isCloud: true,
    needsEndpoint: true,
    defaultEndpoint: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-reasoner',
    defaultEnvKey: 'DEEPSEEK_API_KEY',
  },
  custom: {
    labelFa: 'سرور دلخواه (OpenAI Compatible API)',
    labelEn: 'Custom OpenAI-Compatible API',
    isCloud: true,
    needsEndpoint: true,
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultEnvKey: 'CUSTOM_AI_API_KEY',
  },
};

export function resolveActiveModelProfile(config?: LocalAiConfig): AiModelProfile {
  const profiles = config?.profiles ?? [];
  const active = profiles.find((p) => p.id === config?.activeProfileId);
  if (active) return active;

  const prov: LocalAiProvider = config?.provider ?? 'gemini';
  const meta = PROVIDER_META[prov] ?? PROVIDER_META.gemini;
  return {
    id: 'active_default',
    name: config?.model || meta.defaultModel,
    provider: prov,
    endpoint: config?.endpoint || meta.defaultEndpoint,
    model: config?.model || meta.defaultModel,
    envKeyName: meta.defaultEnvKey,
    purpose: 'general',
  };
}

function buildCopilotSystemInstruction(
  snap: PanelCopilotSnapshot,
  lang: 'fa' | 'en',
  opts?: CopilotContextOptions
): string {
  const responseLanguage = lang === 'fa' ? 'Persian (فارسی)' : 'English';
  const memFacts = (opts?.memory ?? []).slice(-18).map((m) => ({
    category: m.category,
    fact: m.fact,
  }));
  const recentTopics = (opts?.recentThreads ?? [])
    .slice(0, 6)
    .map((th) => ({
      title: th.title,
      lastUser: [...th.messages].reverse().find((m) => m.role === 'user')?.text?.slice(0, 100) ?? '',
    }))
    .filter((tItem) => tItem.title || tItem.lastUser);

  const greetingRule = opts?.alreadyGreetedToday
    ? 'GREETING RULE (STRICT): You ALREADY greeted the user earlier today. DO NOT start your reply with سلام, درود, Hi, Hello, or any greeting. Start directly with the substance.'
    : 'GREETING RULE: This is the first message of the day; a brief warm greeting is optional, then get straight to the point.';

  const activeMode: AssistantChatMode = opts?.assistantMode ?? 'auto';
  const modeRule =
    activeMode === 'analysis'
      ? 'ACTIVE MODE = DEEP ANALYTICAL ("analysis"): Prioritize deep quantitative trading, drawdown, expectancy, cashflow, and debt-priority analysis citing exact snapshot metrics (set mode="analysis"). Only propose an action if the user explicitly asks to record/create something.'
      : activeMode === 'action'
      ? 'ACTIVE MODE = STRUCTURED EXECUTION ("action"): Focus on extracting precise panel actions (mode="propose_action") with clean titles and notes, or asking one concise clarifying question (mode="clarify") if required fields are ambiguous.'
      : activeMode === 'fast'
      ? 'ACTIVE MODE = FAST & CONCISE ("fast"): Reply cleanly in 1-3 direct sentences or concise action draft without verbosity.'
      : 'ACTIVE MODE = AUTO ("auto"): Intelligently balance statistical analysis, structured panel execution, clarification, and concise chat based on user intent.';

  return [
    `You are FundTrack's Elite Financial & Quantitative Trading Copilot. Reply naturally in ${responseLanguage}.`,
    greetingRule,
    modeRule,
    'You have COMPLETE visibility over the user’s real live dashboard data in LIVE_PANEL_SNAPSHOT and persistent memory in PERSISTENT_USER_MEMORY.',
    'NEVER invent numbers, accounts, trades, or metrics. Always cite real numbers from the snapshot.',
    '',
    'YOU MUST RETURN A SINGLE VALID JSON OBJECT ONLY (no markdown fences outside JSON) WITH THIS EXACT SCHEMA:',
    '{',
    '  "mode": "chat" | "clarify" | "propose_action" | "analysis",',
    '  "reply": "string — clear, structured, helpful message. For analysis, use crisp bullet lines.",',
    '  "suggestions": ["optional array of 1-3 short proactive financial/trading recommendations based on live data"],',
    '  "quickReplies": ["optional array of 2-4 clickable reply options — REQUIRED when mode=clarify, helpful when mode=analysis"],',
    '  "memoryNote": "optional concise lasting user preference/rule discovered in this turn to save in persistent memory, else null",',
    '  "action": null OR {',
    '    // Choose EXACTLY ONE action object when mode="propose_action":',
    '    // 1) add_transaction (ONLY for logging money spent, received, or transferred — NEVER for opening a credit line or bank account!):',
    '    "kind": "add_transaction", "type": "out"|"in"|"transfer", "amount": number, "currency": "IRT"|"USD", "paymentMethod": "bank"|"cash"|"usd"|"credit"|"person_debt", "accountId": "exact id or empty", "toAccountId": "exact id or empty", "creditLineId": "exact id or empty", "installmentCount": number, "personId": "exact id or empty", "categoryLabel": "خوراک و کافه|خرید کالا|مسکن و قبوض|حمل‌ونقل|ابزار و سرور|درمان|سایر", "dateOffsetDays": 0|-1|-2, "note": "concise 2-5 word description (e.g. خرید قهوه), NEVER copy raw request filler"',
    '    // 2) add_credit_line (Opening/defining a BNPL or credit facility such as دیجی‌پی، اسنپ‌پی، تارا، کارت اعتباری):',
    '    "kind": "add_credit_line", "creditTitle": "clean concise title e.g. اعتبار دیجی‌پی", "provider": "digipay"|"snapppay"|"tara"|"card"|"other", "creditLimit": number, "currency": "IRT"|"USD", "defaultInstallments": 1..36, "dueDayOfMonth": 1..30, "note": "concise note", "active": true',
    '    // 3) add_bank_account (Creating a bank card, cash fund, or USD wallet):',
    '    "kind": "add_bank_account", "name": "clean account name e.g. بلوبانک", "accountType": "bank"|"cash"|"wallet", "currency": "IRT"|"USD", "balance": number, "note": "concise note"',
    '    // 4) add_person (Adding a real person/contact to People Ledger — NEVER trigger on phrases like دوست دارم):',
    '    "kind": "add_person", "name": "clean full name only", "role": "partner"|"friend"|"client"|"family"|"other", "phone": "optional string", "note": "concise note"',
    '    // 5) add_person_entry (Recording lending/borrowing/settlement with an existing person):',
    '    "kind": "add_person_entry", "personId": "exact person id", "direction": "give"|"receive", "amount": number, "currency": "IRT"|"USD", "accountId": "optional exact bank account id", "note": "concise note"',
    '    // 6) add_loan (Defining a loan, installment debt, or receivable):',
    '    "kind": "add_loan", "loanTitle": "clean loan title e.g. وام خودرو", "loanKind": "loan"|"debt"|"receivable", "totalAmount": number, "currency": "IRT"|"USD", "totalInstallments": 1..120, "installmentAmount": number, "dueDayOfMonth": 1..30, "periodLabel": "string", "priorityRate": number',
    '    // 7) pay_loan_installment (Paying an installment on an open loan or credit debt):',
    '    "kind": "pay_loan_installment", "loanId": "exact loan id", "accountId": "exact bank account id"',
    '    // 8) add_fixed_expense (Defining a recurring monthly fixed expense / bill):',
    '    "kind": "add_fixed_expense", "expenseTitle": "clean title e.g. اینترنت فیبر نوری", "amount": number, "currency": "IRT"|"USD", "dayOfMonth": 1..30, "recurringMonthly": true',
    '    // 9) add_budget_cap (Defining a percentage budget cap linked to a bank account):',
    '    "kind": "add_budget_cap", "categoryName": "string", "sourceAccountId": "exact bank account id", "percentOfBalance": 1..100, "rolloverUnused": true',
    '    // 10) add_goal (Defining a savings or purchase goal — use targetAmount=0 if user omitted price so they can enter it in the preview card):',
    '    "kind": "add_goal", "goalTitle": "clean 2-5 word noun phrase e.g. خرید گوشی S26", "targetAmount": number, "currency": "IRT"|"USD", "goalKind": "monetary"|"item", "budgetSource": "weekly_budget"|"trading_profit", "weeklyBudgetAmount": number, "priority": 1..5, "activateImmediately": boolean',
    '    // 11) activate_goal (Activating/archiving/re-prioritizing an existing goal):',
    '    "kind": "activate_goal", "goalId": "exact goal id", "status": "active"|"draft"|"archived"|"completed", "priority": 1..5',
    '    // 12) contribute_goal (Allocating funds to an active goal):',
    '    "kind": "contribute_goal", "goalId": "exact id", "amount": number, "sourceAccountId": "optional exact bank account id"',
    '    // 13) add_custom_mission (Creating a custom gamification mission/challenge):',
    '    "kind": "add_custom_mission", "missionTitle": "clean mission title", "source": "manual"|"goal"|"expense", "metric": "income"|"cap", "targetValue": number, "stars": 1..10, "xp": 10..500, "linkedGoalId": "optional goal id"',
    '    // 14) update_fx_rate (Refreshing live USD/IRT rate or setting manual rate):',
    '    "kind": "update_fx_rate", "mode": "live"|"manual", "usdToman": number',
    '    // 15) update_panel_settings (Updating risk & planning parameters):',
    '    "kind": "update_panel_settings", "weeklyGoalPoolIrt": number, "dailyMaxLossPct": number, "defaultRiskPct": number, "monthlyExpectedIncomeIrt": number',
    '    // 16) save_memory (Explicitly saving a fact/rule into assistant long-term memory):',
    '    "kind": "save_memory", "fact": "string", "category": "preference"|"rule"|"context"',
    '    // 17) refresh_economic_news (Fetching/updating this week’s FREE economic calendar from Forex Factory / FairEconomy — NO paid News API key needed!):',
    '    "kind": "refresh_economic_news", "currencyFilter": "ALL"|"USD"|"USD,EUR,GBP", "impactFilter": "all"|"high"|"high_medium"',
    '    // 18) navigate:',
    '    "kind": "navigate", "category": "overview"|"trading"|"finance"|"growth"|"assistant"|"system", "subTab": "optional subtab"',
    '  }',
    '}',
    '',
    'CRITICAL DISTINCTION & TITLE/DESCRIPTION ACCURACY RULES:',
    '1. NEVER confuse defining/opening an entity with logging a transaction, and NEVER confuse "دوست دارم ..." ("I want / would like...") with adding a friend ("add_person")!',
    '   - "دوست دارم یه گوشی بخرم S26 میتونی توی اهداف ثبت کنی" -> ALWAYS "add_goal" with goalKind="item", goalTitle="خرید گوشی S26", targetAmount=0 (unless price given)!',
    '   - "هدف : دوست دارم به درآمد 1000 دلار برسم تا 3 ماهه دیگه خیلی برام مهمه" -> ALWAYS "add_goal" with goalKind="monetary", goalTitle="درآمد $1,000", targetAmount=1000, currency="USD", priority=1, deadlineMode="dated", targetDate=(3 months ahead YYYY-MM-DD)!',
    '   - "از دیجی‌پی اعتبار ۱۵ میلیونی ۴ قسطه دارم، خط اعتبار باز کن" -> ALWAYS "add_credit_line" (NOT add_transaction)!',
    '   - "حساب بلوبانک با موجودی ۱۰ میلیون اضافه کن" -> ALWAYS "add_bank_account"!',
    '   - "وام ۴۰ میلیونی ۱۰ قسطه ثبت کن" -> ALWAYS "add_loan"!',
    '   - "شخص رضا را اضافه کن" -> ALWAYS "add_person"!',
    '2. TITLE & DESCRIPTION PRECISION (MANDATORY):',
    '   - Extract clean, crisp 2-4 word Persian/English titles (e.g. "خرید گوشی S26", "درآمد $1,000", "خرید قهوه", "اعتبار دیجی‌پی", "وام خودرو").',
    '   - NEVER copy filler, deadline phrases ("تا ۳ ماهه دیگه"), importance ("خیلی برام مهمه"), or verbs ("دوست دارم", "برسم", "میتونی ثبت کنی") into goalTitle, name, loanTitle, expenseTitle, or note!',
    '3. CLARIFICATION FIRST ("mode": "clarify"):',
    '   If essential fields for a transaction/loan are missing or ambiguous, set "mode": "clarify", ask 1-2 short targeted questions, and populate "quickReplies" with concrete choices. For goals without an amount, you may propose "add_goal" with targetAmount=0 so the user can fill the price directly in the preview card.',
    '4. QUANTITATIVE & STATISTICAL ANALYSIS ("mode": "analysis"):',
    '   Cite exact Win Rate, Profit Factor, Expectancy, R Mean/StdDev, Session edge, Hourly anomalies, SL Respected vs Violated impact, Max Drawdown, Cashflow savings rate, and Debt burden.',
    '5. CURRENCY & MULTIPLIER RULES:',
    '   "میلیارد" = *1,000,000,000, "میلیون" = *1,000,000, "هزار" = *1,000 for IRT. Never mix USD and IRT.',
    '   Match IDs strictly from LIVE_PANEL_SNAPSHOT.',
    '',
    `PERSISTENT_USER_MEMORY: ${JSON.stringify(memFacts)}`,
    `RECENT_CONVERSATION_TOPICS: ${JSON.stringify(recentTopics)}`,
    `LIVE_PANEL_SNAPSHOT: ${JSON.stringify(snap)}`,
  ].join('\n');
}

function detectCreditProvider(lower: string): { provider: CreditProvider; defaultTitleFa: string; defaultTitleEn: string } {
  if (/(دیجی.?پی|دیجیپی|digipay)/.test(lower)) {
    return { provider: 'digipay', defaultTitleFa: 'اعتبار دیجی‌پی (BNPL)', defaultTitleEn: 'Digipay Credit (BNPL)' };
  }
  if (/(اسنپ.?پی|اسنپپی|snapppay|snapp)/.test(lower)) {
    return { provider: 'snapppay', defaultTitleFa: 'اعتبار اسنپ‌پی', defaultTitleEn: 'SnappPay Credit' };
  }
  if (/(تارا|tara)/.test(lower)) {
    return { provider: 'tara', defaultTitleFa: 'اعتبار تارا', defaultTitleEn: 'Tara Credit' };
  }
  if (/(کارت اعتباری|بانک|وام کارت|bank card|credit card)/.test(lower)) {
    return { provider: 'card', defaultTitleFa: 'کارت اعتباری بانکی', defaultTitleEn: 'Bank Credit Card' };
  }
  return { provider: 'other', defaultTitleFa: 'خط اعتبار جدید', defaultTitleEn: 'New Credit Line' };
}

function normalizeActionFromJson(
  rawAction: Record<string, unknown> | null | undefined,
  userMessage: string,
  state: FundTrackState
): AssistantActionPayload | undefined {
  if (!rawAction || typeof rawAction !== 'object') return undefined;
  const kind = String(rawAction.kind || '').trim();
  const lang = state.settings.language;

  if (kind === 'add_transaction') {
    const fallback = parseCommandLocally(userMessage, {
      accounts: state.bankAccounts,
      creditLines: state.creditLines ?? [],
      people: state.people ?? [],
      budgetCaps: state.budgetCaps ?? [],
    });

    const validType =
      rawAction.type === 'in' || rawAction.type === 'out' || rawAction.type === 'transfer'
        ? rawAction.type
        : fallback.type;
    const validCurrency: CurrencyCode =
      rawAction.currency === 'USD' || rawAction.currency === 'IRT'
        ? rawAction.currency
        : fallback.currency;
    const rawAmt = Number(rawAction.amount);
    const amount = Number.isFinite(rawAmt) && rawAmt > 0 ? rawAmt : fallback.amount;
    const pmAllowed = ['bank', 'cash', 'usd', 'credit', 'person_debt'] as const;
    const paymentMethod =
      validType !== 'out'
        ? validCurrency === 'USD'
          ? 'usd'
          : 'bank'
        : pmAllowed.includes(rawAction.paymentMethod as (typeof pmAllowed)[number])
        ? (rawAction.paymentMethod as (typeof pmAllowed)[number])
        : fallback.paymentMethod;

    const accOk = (id: unknown) =>
      typeof id === 'string' && state.bankAccounts.some((a) => a.id === id);
    const clOk = (id: unknown) =>
      typeof id === 'string' && (state.creditLines ?? []).some((c) => c.id === id);
    const pOk = (id: unknown) =>
      typeof id === 'string' && (state.people ?? []).some((p) => p.id === id);

    const accountId =
      paymentMethod === 'credit' || paymentMethod === 'person_debt'
        ? ''
        : accOk(rawAction.accountId)
        ? (rawAction.accountId as string)
        : fallback.accountId ||
          state.bankAccounts.find((a) => a.currency === validCurrency)?.id ||
          state.bankAccounts[0]?.id ||
          '';
    const toAccountId =
      validType === 'transfer'
        ? accOk(rawAction.toAccountId) && rawAction.toAccountId !== accountId
          ? (rawAction.toAccountId as string)
          : fallback.toAccountId
        : '';
    const creditLineId =
      paymentMethod === 'credit'
        ? clOk(rawAction.creditLineId)
          ? (rawAction.creditLineId as string)
          : fallback.creditLineId || state.creditLines?.[0]?.id || ''
        : '';
    const personId =
      paymentMethod === 'person_debt'
        ? pOk(rawAction.personId)
          ? (rawAction.personId as string)
          : fallback.personId || state.people?.[0]?.id || ''
        : '';
    const offset = Number(rawAction.dateOffsetDays);
    const date =
      Number.isFinite(offset) && offset <= 0 && offset >= -30
        ? toLocalIsoDate(new Date(Date.now() + Math.round(offset) * 86400000))
        : fallback.date;

    const cleanNote =
      typeof rawAction.note === 'string' && rawAction.note.trim()
        ? rawAction.note.trim()
        : fallback.note;
    const txActionTitle =
      validType === 'in'
        ? lang === 'fa'
          ? `ثبت درآمد: ${cleanNote}`
          : `Income: ${cleanNote}`
        : validType === 'transfer'
        ? lang === 'fa'
          ? `انتقال وجه: ${cleanNote}`
          : `Transfer: ${cleanNote}`
        : lang === 'fa'
        ? `ثبت هزینه: ${cleanNote}`
        : `Expense: ${cleanNote}`;

    return {
      kind: 'add_transaction',
      title: txActionTitle,
      draft: {
        type: validType,
        amount: validCurrency === 'USD' ? Number(amount.toFixed(2)) : Math.round(amount),
        currency: validCurrency,
        paymentMethod,
        accountId,
        toAccountId,
        creditLineId,
        installmentCount: Math.min(
          36,
          Math.max(1, Number(rawAction.installmentCount) || fallback.installmentCount || 4)
        ),
        personId,
        budgetCategoryId: fallback.budgetCategoryId,
        categoryLabel:
          typeof rawAction.categoryLabel === 'string' && rawAction.categoryLabel.trim()
            ? rawAction.categoryLabel.trim()
            : fallback.categoryLabel,
        date,
        note: cleanNote,
      },
    };
  }

  if (kind === 'add_credit_line') {
    const det = detectCreditProvider(`${rawAction.provider || ''} ${rawAction.creditTitle || ''} ${userMessage}`.toLowerCase());
    const allowedProviders: CreditProvider[] = ['digipay', 'snapppay', 'tara', 'card', 'other'];
    const provider: CreditProvider = allowedProviders.includes(rawAction.provider as CreditProvider)
      ? (rawAction.provider as CreditProvider)
      : det.provider;
    const creditLimit = Number(rawAction.creditLimit);
    if (!Number.isFinite(creditLimit) || creditLimit <= 0) return undefined;
    const creditTitle =
      typeof rawAction.creditTitle === 'string' && rawAction.creditTitle.trim()
        ? rawAction.creditTitle.trim()
        : lang === 'fa'
        ? det.defaultTitleFa
        : det.defaultTitleEn;
    const currency: CurrencyCode = rawAction.currency === 'USD' ? 'USD' : 'IRT';
    const defaultInstallments = Math.min(36, Math.max(1, Math.round(Number(rawAction.defaultInstallments) || 4)));
    const dueDayOfMonth = Math.min(30, Math.max(1, Math.round(Number(rawAction.dueDayOfMonth) || 5)));

    return {
      kind: 'add_credit_line',
      title: lang === 'fa' ? `باز کردن خط اعتبار: ${creditTitle}` : `Open Credit Line: ${creditTitle}`,
      creditTitle,
      provider,
      creditLimit,
      currency,
      defaultInstallments,
      dueDayOfMonth,
      note: typeof rawAction.note === 'string' ? rawAction.note.trim() : '',
      active: rawAction.active !== false,
    };
  }

  if (kind === 'add_bank_account') {
    const name = String(rawAction.name || '').trim();
    if (!name) return undefined;
    const allowedTypes: BankAccountType[] = ['bank', 'cash', 'wallet'];
    const accountType: BankAccountType = allowedTypes.includes(rawAction.accountType as BankAccountType)
      ? (rawAction.accountType as BankAccountType)
      : 'bank';
    const currency: CurrencyCode = rawAction.currency === 'USD' ? 'USD' : 'IRT';
    const balance = Math.max(0, Number(rawAction.balance) || 0);
    return {
      kind: 'add_bank_account',
      title: lang === 'fa' ? `تعریف حساب جدید: ${name}` : `New Account: ${name}`,
      name,
      accountType,
      currency,
      balance,
      note: typeof rawAction.note === 'string' ? rawAction.note.trim() : '',
    };
  }

  if (kind === 'add_person') {
    const name = String(rawAction.name || '').trim();
    if (!name) return undefined;
    const allowedRoles: PersonRole[] = ['partner', 'friend', 'client', 'family', 'other'];
    const role: PersonRole = allowedRoles.includes(rawAction.role as PersonRole)
      ? (rawAction.role as PersonRole)
      : 'friend';
    return {
      kind: 'add_person',
      title: lang === 'fa' ? `افزودن شخص جدید: ${name}` : `Add Contact: ${name}`,
      name,
      role,
      phone: typeof rawAction.phone === 'string' && rawAction.phone.trim() ? rawAction.phone.trim() : undefined,
      note: typeof rawAction.note === 'string' ? rawAction.note.trim() : '',
    };
  }

  if (kind === 'add_loan') {
    const loanTitle = String(rawAction.loanTitle || '').trim();
    const totalAmount = Number(rawAction.totalAmount);
    if (!loanTitle || !Number.isFinite(totalAmount) || totalAmount <= 0) return undefined;
    const allowedKinds: LoanKind[] = ['loan', 'debt', 'receivable'];
    const loanKind: LoanKind = allowedKinds.includes(rawAction.loanKind as LoanKind)
      ? (rawAction.loanKind as LoanKind)
      : 'loan';
    const currency: CurrencyCode = rawAction.currency === 'USD' ? 'USD' : 'IRT';
    const totalInstallments = Math.min(120, Math.max(1, Math.round(Number(rawAction.totalInstallments) || 12)));
    const installmentAmountRaw = Number(rawAction.installmentAmount);
    const installmentAmount =
      Number.isFinite(installmentAmountRaw) && installmentAmountRaw > 0
        ? installmentAmountRaw
        : Math.round(totalAmount / totalInstallments);
    const dueDay = Math.min(30, Math.max(1, Math.round(Number(rawAction.dueDayOfMonth) || 10)));
    const dueDate = new Date(Date.now() + Math.max(1, dueDay) * 86400000).toISOString();
    return {
      kind: 'add_loan',
      title: lang === 'fa' ? `ثبت وام / بدهی: ${loanTitle}` : `Create Loan: ${loanTitle}`,
      loanTitle,
      loanKind,
      totalAmount,
      currency,
      totalInstallments,
      installmentAmount,
      dueDate,
      periodLabel:
        typeof rawAction.periodLabel === 'string' && rawAction.periodLabel.trim()
          ? rawAction.periodLabel.trim()
          : lang === 'fa'
          ? `${totalInstallments} قسط ماهانه`
          : `${totalInstallments} monthly`,
      priorityRate: Math.max(0, Number(rawAction.priorityRate) || 18),
    };
  }

  if (kind === 'add_goal') {
    const cleanFallback = extractCleanGoalDraft(userMessage, lang);
    const rawGoalTitle = typeof rawAction.goalTitle === 'string' ? rawAction.goalTitle.trim() : '';
    const goalTitle =
      rawGoalTitle && !/(تا\s*\d+\s*ماه|خیلی برام مهمه|دوست دارم|برسم)/.test(rawGoalTitle)
        ? rawGoalTitle
        : cleanFallback.goalTitle;
    const rawTarget = Number(rawAction.targetAmount);
    const { amount: msgAmt } = extractAmountAndCurrency(normalizeDigitsAndSeparators(userMessage));
    const targetAmount =
      Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : msgAmt > 0 ? msgAmt : 0;
    if (!goalTitle) return undefined;

    const currency: CurrencyCode = rawAction.currency === 'USD' ? 'USD' : 'IRT';
    const inferredPrio = extractGoalPriority(userMessage);
    const rawPrio = Number(rawAction.priority);
    const priority =
      Number.isFinite(rawPrio) && rawPrio >= 1 && rawPrio <= 5
        ? Math.min(Math.round(rawPrio), inferredPrio)
        : inferredPrio;

    const inferredDeadline = extractGoalDeadline(userMessage);
    const deadlineMode: GoalDeadlineMode =
      rawAction.deadlineMode === 'open_until_funded'
        ? 'open_until_funded'
        : rawAction.deadlineMode === 'dated'
        ? 'dated'
        : inferredDeadline.deadlineMode;

    const rawTargetDate =
      typeof rawAction.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawAction.targetDate.trim())
        ? rawAction.targetDate.trim().slice(0, 10)
        : undefined;
    const targetDate =
      deadlineMode === 'dated'
        ? rawTargetDate || inferredDeadline.targetDate || toLocalIsoDate(addJalaliMonths(new Date(), 3))
        : undefined;

    const weeksToDeadline =
      deadlineMode === 'dated' && targetDate
        ? Math.max(1, Math.round((new Date(`${targetDate}T12:00:00`).getTime() - Date.now()) / (7 * 86400000)))
        : 12;

    const inferredBudget = extractGoalBudgetSource(userMessage, state.bankAccounts);
    const allowedSources: GoalBudgetSource[] = ['weekly_budget', 'trading_profit', 'bank_savings'];
    const budgetSource: GoalBudgetSource = allowedSources.includes(rawAction.budgetSource as GoalBudgetSource)
      ? (rawAction.budgetSource as GoalBudgetSource)
      : inferredBudget.budgetSource;
    const sourceAccountId =
      budgetSource === 'bank_savings'
        ? state.bankAccounts.find((a) => a.id === rawAction.sourceAccountId)?.id ||
          inferredBudget.sourceAccountId ||
          state.bankAccounts.find((a) => a.currency === currency)?.id ||
          state.bankAccounts[0]?.id
        : undefined;

    const rawWeekly = Number(rawAction.weeklyBudgetAmount);
    const weeklyBudgetAmount =
      targetAmount > 0
        ? Number.isFinite(rawWeekly) && rawWeekly > 0
          ? Math.round(rawWeekly)
          : Math.max(1, Math.round(targetAmount / weeksToDeadline))
        : 0;
    const goalKind: GoalKind =
      rawAction.goalKind === 'item'
        ? 'item'
        : rawAction.goalKind === 'monetary'
        ? 'monetary'
        : cleanFallback.goalKind;

    return {
      kind: 'add_goal',
      title:
        lang === 'fa'
          ? `${goalKind === 'item' ? 'هدف خرید' : 'هدف مالی'}: ${goalTitle}`
          : `${goalKind === 'item' ? 'Purchase Goal' : 'Goal'}: ${goalTitle}`,
      goalTitle,
      targetAmount,
      currency,
      goalKind,
      deadlineMode,
      targetDate,
      budgetSource,
      sourceAccountId,
      weeklyBudgetAmount,
      priority,
      activateImmediately: rawAction.activateImmediately !== false,
    };
  }

  if (kind === 'activate_goal') {
    const goal =
      state.goals.find((g) => g.id === rawAction.goalId) ??
      state.goals.find((g) => g.status === 'draft');
    if (!goal) return undefined;
    const allowedStatuses: GoalStatus[] = ['active', 'draft', 'completed', 'archived'];
    const status: GoalStatus = allowedStatuses.includes(rawAction.status as GoalStatus)
      ? (rawAction.status as GoalStatus)
      : 'active';
    const pr = Number(rawAction.priority);
    return {
      kind: 'activate_goal',
      title: lang === 'fa' ? `تغییر وضعیت هدف «${goal.title}»` : `Update Goal "${goal.title}"`,
      goalId: goal.id,
      goalTitle: goal.title,
      status,
      priority: Number.isFinite(pr) && pr >= 1 && pr <= 5 ? Math.round(pr) : undefined,
    };
  }

  if (kind === 'contribute_goal') {
    const goal =
      state.goals.find((g) => g.id === rawAction.goalId) ??
      state.goals.find((g) => g.status === 'active');
    const amount = Number(rawAction.amount);
    if (!goal || !Number.isFinite(amount) || amount <= 0) return undefined;
    const accOk = state.bankAccounts.some((a) => a.id === rawAction.sourceAccountId);
    return {
      kind: 'contribute_goal',
      title: lang === 'fa' ? `واریز به هدف «${goal.title}»` : `Fund Goal "${goal.title}"`,
      goalId: goal.id,
      goalTitle: goal.title,
      amount,
      currency: goal.currency,
      sourceAccountId: accOk ? (rawAction.sourceAccountId as string) : undefined,
    };
  }

  if (kind === 'add_fixed_expense') {
    const expenseTitle = String(rawAction.expenseTitle || '').trim();
    const amount = Number(rawAction.amount);
    if (!expenseTitle || !Number.isFinite(amount) || amount <= 0) return undefined;
    const currency: CurrencyCode = rawAction.currency === 'USD' ? 'USD' : 'IRT';
    const dayOfMonth = Math.min(30, Math.max(1, Math.round(Number(rawAction.dayOfMonth) || 1)));
    return {
      kind: 'add_fixed_expense',
      title: lang === 'fa' ? `ثبت هزینه ثابت: ${expenseTitle}` : `Fixed Expense: ${expenseTitle}`,
      expenseTitle,
      amount,
      currency,
      dayOfMonth,
      recurringMonthly: rawAction.recurringMonthly !== false,
    };
  }

  if (kind === 'add_budget_cap') {
    const categoryName = String(rawAction.categoryName || '').trim();
    const src =
      state.bankAccounts.find((a) => a.id === rawAction.sourceAccountId) ?? state.bankAccounts[0];
    const pct = Math.min(100, Math.max(1, Math.round(Number(rawAction.percentOfBalance) || 15)));
    if (!categoryName || !src) return undefined;
    return {
      kind: 'add_budget_cap',
      title: lang === 'fa' ? `سقف بودجه «${categoryName}»` : `Budget Cap "${categoryName}"`,
      categoryName,
      sourceAccountId: src.id,
      percentOfBalance: pct,
      rolloverUnused: rawAction.rolloverUnused !== false,
    };
  }

  if (kind === 'add_person_entry') {
    const person = (state.people ?? []).find((p) => p.id === rawAction.personId);
    const amount = Number(rawAction.amount);
    if (!person || !Number.isFinite(amount) || amount <= 0) return undefined;
    const direction = rawAction.direction === 'receive' ? 'receive' : 'give';
    const accOk = state.bankAccounts.some((a) => a.id === rawAction.accountId);
    return {
      kind: 'add_person_entry',
      title:
        lang === 'fa'
          ? `دفتر حساب «${person.name}»`
          : `Ledger Entry "${person.name}"`,
      personId: person.id,
      personName: person.name,
      direction,
      amount,
      currency: rawAction.currency === 'USD' ? 'USD' : 'IRT',
      accountId: accOk ? (rawAction.accountId as string) : undefined,
      note: String(rawAction.note || '').trim(),
    };
  }

  if (kind === 'pay_loan_installment') {
    const loan =
      state.loans.find((l) => l.id === rawAction.loanId && l.status === 'open') ??
      state.loans.find((l) => l.status === 'open');
    const acc =
      state.bankAccounts.find((a) => a.id === rawAction.accountId) ??
      state.bankAccounts.find((a) => a.currency === (loan?.currency ?? 'IRT')) ??
      state.bankAccounts[0];
    if (!loan || !acc) return undefined;
    return {
      kind: 'pay_loan_installment',
      title: lang === 'fa' ? `پرداخت قسط «${loan.title}»` : `Pay Installment "${loan.title}"`,
      loanId: loan.id,
      loanTitle: loan.title,
      accountId: acc.id,
      installmentAmount: loan.installmentAmount,
      currency: loan.currency,
    };
  }

  if (kind === 'add_custom_mission') {
    const missionTitle = String(rawAction.missionTitle || '').trim();
    const targetValue = Number(rawAction.targetValue);
    if (!missionTitle || !Number.isFinite(targetValue) || targetValue <= 0) return undefined;
    return {
      kind: 'add_custom_mission',
      title: lang === 'fa' ? `تعریف مأموریت سفارشی: ${missionTitle}` : `Custom Mission: ${missionTitle}`,
      missionTitle,
      source: rawAction.source === 'goal' || rawAction.source === 'expense' ? rawAction.source : 'manual',
      metric: rawAction.metric === 'cap' ? 'cap' : 'income',
      targetValue,
      stars: Math.min(10, Math.max(1, Math.round(Number(rawAction.stars) || 2))),
      xp: Math.min(500, Math.max(10, Math.round(Number(rawAction.xp) || 80))),
      linkedGoalId: typeof rawAction.linkedGoalId === 'string' ? rawAction.linkedGoalId : undefined,
    };
  }

  if (kind === 'update_fx_rate') {
    const rate = Number(rawAction.usdToman);
    const mode = rawAction.mode === 'manual' && Number.isFinite(rate) && rate > 10000 ? 'manual' : 'live';
    return {
      kind: 'update_fx_rate',
      title:
        mode === 'manual'
          ? lang === 'fa'
            ? `ثبت دستی نرخ دلار: ${Math.round(rate).toLocaleString('en-US')} تومان`
            : `Set USD Rate: ${Math.round(rate).toLocaleString('en-US')} IRT`
          : lang === 'fa'
          ? 'به‌روزرسانی آنلاین نرخ دلار'
          : 'Refresh Live USD Rate',
      mode,
      usdToman: mode === 'manual' ? Math.round(rate) : undefined,
    };
  }

  if (kind === 'update_panel_settings') {
    const weeklyGoalPoolIrt = Number(rawAction.weeklyGoalPoolIrt);
    const dailyMaxLossPct = Number(rawAction.dailyMaxLossPct);
    const defaultRiskPct = Number(rawAction.defaultRiskPct);
    const monthlyExpectedIncomeIrt = Number(rawAction.monthlyExpectedIncomeIrt);
    if (
      !Number.isFinite(weeklyGoalPoolIrt) &&
      !Number.isFinite(dailyMaxLossPct) &&
      !Number.isFinite(defaultRiskPct) &&
      !Number.isFinite(monthlyExpectedIncomeIrt)
    ) {
      return undefined;
    }
    return {
      kind: 'update_panel_settings',
      title: lang === 'fa' ? 'به‌روزرسانی تنظیمات ریسک و بودجه پنل' : 'Update Risk & Planning Settings',
      weeklyGoalPoolIrt: Number.isFinite(weeklyGoalPoolIrt) && weeklyGoalPoolIrt >= 0 ? Math.round(weeklyGoalPoolIrt) : undefined,
      dailyMaxLossPct: Number.isFinite(dailyMaxLossPct) && dailyMaxLossPct > 0 ? dailyMaxLossPct : undefined,
      defaultRiskPct: Number.isFinite(defaultRiskPct) && defaultRiskPct > 0 ? defaultRiskPct : undefined,
      monthlyExpectedIncomeIrt:
        Number.isFinite(monthlyExpectedIncomeIrt) && monthlyExpectedIncomeIrt >= 0
          ? Math.round(monthlyExpectedIncomeIrt)
          : undefined,
    };
  }

  if (kind === 'save_memory') {
    const fact = String(rawAction.fact || '').trim();
    if (!fact) return undefined;
    const cat =
      rawAction.category === 'rule' || rawAction.category === 'context' ? rawAction.category : 'preference';
    return {
      kind: 'save_memory',
      title: lang === 'fa' ? 'ذخیره در حافظه بلندمدت دستیار' : 'Save to Assistant Memory',
      fact,
      category: cat,
    };
  }

  if (kind === 'refresh_economic_news') {
    const cf =
      typeof rawAction.currencyFilter === 'string' && rawAction.currencyFilter.trim()
        ? rawAction.currencyFilter.trim().toUpperCase()
        : 'ALL';
    const imp =
      rawAction.impactFilter === 'high' || rawAction.impactFilter === 'high_medium'
        ? rawAction.impactFilter
        : 'high_medium';
    return {
      kind: 'refresh_economic_news',
      title:
        lang === 'fa'
          ? 'دریافت رایگان رویدادهای اقتصادی این هفته (Forex Factory)'
          : 'Fetch Free Weekly Economic Calendar',
      currencyFilter: cf,
      impactFilter: imp,
    };
  }

  if (kind === 'navigate') {
    const cats: MainCategory[] = ['overview', 'trading', 'finance', 'growth', 'assistant', 'system'];
    const cat = cats.includes(rawAction.category as MainCategory)
      ? (rawAction.category as MainCategory)
      : 'overview';
    return {
      kind: 'navigate',
      title: lang === 'fa' ? 'انتقال سریع در پنل' : 'Open Section',
      category: cat,
      subTab: typeof rawAction.subTab === 'string' ? rawAction.subTab : undefined,
    };
  }

  return undefined;
}

function stripAmountPhrases(rawText: string): string {
  return normalizeDigitsAndSeparators(rawText)
    .replace(/\$\s*\d+(?:\.\d+)?/gi, ' ')
    .replace(
      /(?<![a-zA-Z])\d+(?:\.\d+)?\s*(?:میلیارد|میلیون|ملیون|هزار|تومانی|تومنی|تومان|تومن|ریال|دلاری|دلار|تتر|usd|usdt|irt|m|k)(?![a-zA-Z])/gi,
      ' '
    )
    .replace(/(?<![a-zA-Z])\d{5,}(?:\.\d+)?(?![a-zA-Z])/g, ' ');
}

function extractGoalPriority(rawText: string): number {
  const norm = normalizeDigitsAndSeparators(rawText);
  const lower = norm.toLowerCase();
  const explicitMatch = norm.match(/(?:با\s+)?اولویت\s*(\d+)/);
  if (explicitMatch) {
    return Math.min(5, Math.max(1, Number(explicitMatch[1])));
  }
  if (/(خیلی\s+(?:برام\s+)?مهم|بسیار\s+مهم|حیاتی|فوری|اضطراری|critical|urgent|top priority|very important)/i.test(lower)) {
    return 1;
  }
  if (/(مهمه|مهم\s+است|برام\s+مهم|اولویت\s+بالا|important|high priority)/i.test(lower)) {
    return 2;
  }
  if (/(عجله\s+ندارم|آتی|اولویت\s+کم|بلندمدت|low priority|someday)/i.test(lower)) {
    return 4;
  }
  return 2;
}

function extractGoalDeadline(rawText: string): {
  deadlineMode: GoalDeadlineMode;
  targetDate?: string;
  weeksEstimate: number;
} {
  const norm = normalizeDigitsAndSeparators(rawText);
  const lower = norm.toLowerCase();

  if (/(باز\s*تا\s*(?:تامین|تأمین)|تا\s*(?:تامین|تأمین)\s*(?:کامل\s*)?بودجه|بدون\s*سررسید|بدون\s*تاریخ|باز\s*باشه|open\s*until\s*funded|no\s*deadline)/i.test(lower)) {
    return { deadlineMode: 'open_until_funded', targetDate: undefined, weeksEstimate: 12 };
  }

  const now = new Date();
  const monthMatch = norm.match(/(?:تا|ظرف|حداکثر|در\s*مدت|برای)?\s*(\d+)\s*(?:ماهه|ماه)\s*(?:دیگه|دیگر|آینده|بعد)?/i);
  if (monthMatch) {
    const months = Math.min(120, Math.max(1, Number(monthMatch[1])));
    const target = addJalaliMonths(now, months);
    return {
      deadlineMode: 'dated',
      targetDate: toLocalIsoDate(target),
      weeksEstimate: Math.max(4, Math.round(months * 4.33)),
    };
  }

  const weekMatch = norm.match(/(?:تا|ظرف|حداکثر|برای)?\s*(\d+)\s*هفته\s*(?:دیگه|دیگر|آینده|بعد)?/i);
  if (weekMatch) {
    const weeks = Math.min(260, Math.max(1, Number(weekMatch[1])));
    const target = new Date(now.getTime() + weeks * 7 * 86400000);
    return {
      deadlineMode: 'dated',
      targetDate: toLocalIsoDate(target),
      weeksEstimate: weeks,
    };
  }

  const dayMatch = norm.match(/(?:تا|ظرف|حداکثر|برای)?\s*(\d+)\s*روز\s*(?:دیگه|دیگر|آینده|بعد)?/i);
  if (dayMatch) {
    const days = Math.min(1800, Math.max(1, Number(dayMatch[1])));
    const target = new Date(now.getTime() + days * 86400000);
    return {
      deadlineMode: 'dated',
      targetDate: toLocalIsoDate(target),
      weeksEstimate: Math.max(1, Math.ceil(days / 7)),
    };
  }

  const yearMatch = norm.match(/(?:تا|ظرف|حداکثر|برای)?\s*(\d+)\s*(?:ساله|سال)\s*(?:دیگه|دیگر|آینده|بعد)?/i);
  if (yearMatch) {
    const years = Math.min(15, Math.max(1, Number(yearMatch[1])));
    const target = addJalaliMonths(now, years * 12);
    return {
      deadlineMode: 'dated',
      targetDate: toLocalIsoDate(target),
      weeksEstimate: years * 52,
    };
  }

  return {
    deadlineMode: 'dated',
    targetDate: toLocalIsoDate(addJalaliMonths(now, 3)),
    weeksEstimate: 13,
  };
}

function extractGoalBudgetSource(
  rawText: string,
  accounts: BankAccount[]
): { budgetSource: GoalBudgetSource; sourceAccountId?: string } {
  const lower = normalizeDigitsAndSeparators(rawText).toLowerCase();

  for (const acc of accounts) {
    const cleanName = acc.name.toLowerCase().trim();
    if (cleanName && lower.includes(cleanName)) {
      return { budgetSource: 'bank_savings', sourceAccountId: acc.id };
    }
  }

  if (/(سود\s*ترید|سود\s*معاملات|ترید|اکسپرت|trading\s*profit|mt5)/i.test(lower)) {
    return { budgetSource: 'trading_profit' };
  }
  if (/(از\s*حساب|پس.?انداز\s*بانکی|حساب\s*بانکی|بانک|کارت|bank\s*savings)/i.test(lower)) {
    return {
      budgetSource: 'bank_savings',
      sourceAccountId: accounts[0]?.id,
    };
  }
  return { budgetSource: 'weekly_budget' };
}

function stripGoalMetadataPhrases(rawText: string): string {
  return normalizeDigitsAndSeparators(rawText)
    .replace(/^(?:هدف\s*[:：]\s*)/i, ' ')
    .replace(/(?:با\s+)?اولویت\s*\d+/gi, ' ')
    .replace(/(?:باز\s*تا\s*(?:تامین|تأمین)\s*(?:کامل\s*)?بودجه|بدون\s*سررسید|بدون\s*تاریخ)/gi, ' ')
    .replace(/(?:تا|ظرف|حداکثر|در\s*مدت)?\s*\d+\s*(?:ماهه|ماه|هفته|روز|ساله|سال)\s*(?:دیگه|دیگر|آینده|بعد)?/gi, ' ')
    .replace(/(?:خیلی|بسیار)?\s*(?:برام\s+)?مهم(?:ه|\s*است)?/gi, ' ')
    .replace(/(?:از\s+محل|از\s+منبع|منبع(?:\s+تامین)?(?:\s+بودجه)?)\s+[^\n،.]+/gi, ' ')
    .replace(/(?:با\s+)?(?:استخر\s+)?بودجه\s*(?:هفتگی|هدف)|(?:از\s+)?سود\s*(?:ترید|معاملات)|(?:از\s+)?پس.?انداز\s+بانکی/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCleanGoalDraft(
  userText: string,
  lang: 'fa' | 'en'
): { goalTitle: string; goalKind: GoalKind } {
  const lower = normalizeDigitsAndSeparators(userText).toLowerCase();
  const isPurchaseIntent =
    /(بخرم|خریدن|خرید|تهیه|بگیرم|گوشی|موبایل|لپ.?تاپ|مک.?بوک|ماشین|خودرو|موتور|خانه|آپارتمان|مانیتور|دوربین|ساعت|کنسول|سیستم|تجهیزات|buy|purchase|phone|laptop|car)/i.test(
      lower
    );
  const goalKind: GoalKind = isPurchaseIntent ? 'item' : 'monetary';
  const { amount: parsedAmt, currency: parsedCurrency } = extractAmountAndCurrency(
    normalizeDigitsAndSeparators(userText)
  );

  let cleaned = stripGoalMetadataPhrases(stripAmountPhrases(userText));

  const stopWords = [
    'سلام', 'درود', 'لطفاً', 'لطفا', 'میتونی', 'می‌تونی', 'می‌تونم', 'میتونم', 'میشه', 'می‌شه',
    'دوست دارم', 'میخوام', 'می‌خوام', 'میخواهم', 'می‌خواهم', 'قصد دارم', 'میخواستم',
    'برام', 'برای من', 'برای خودم', 'توی اهداف', 'در اهداف', 'به اهداف', 'جزو اهداف',
    'توی هدف', 'به عنوان هدف', 'به لیست اهداف', 'هدف جدید', 'هدف مالی', 'هدف', 'اهداف',
    'ثبت کنی', 'ثبت کن', 'ثبتش کن', 'ثبت کنم', 'اضافه کنی', 'اضافه کن', 'اضافه‌اش کن',
    'تعریف کنی', 'تعریف کن', 'بساز', 'بسازی', 'ایجاد کن', 'بگذار', 'بذار', 'جدید',
    'برسم', 'در بیارم', 'دربیارم', 'داشته باشم', 'جمع کنم', 'پس‌انداز کنم', 'پس انداز کنم',
    'بخرم', 'بگیرم', 'تهیه کنم', 'دیگه', 'دیگر', 'آینده', 'خیلی', 'بسیار', 'حیاتی', 'فوری',
    'میلیارد', 'میلیونی', 'میلیون', 'ملیون', 'هزار', 'تومانی', 'تومنی', 'تومان', 'تومن', 'دلاری', 'دلار', 'تتر',
    'مبلغ', 'قیمت', 'حدود', 'تقریبی', 'تخمینی', 'به مبلغ', 'با مبلغ', 'با قیمت',
    'یه', 'یک', 'این', 'اون', 'را', 'رو', 'به', 'در', 'توی', 'تو', 'با', 'برای', 'که', 'و', 'تا',
    'goal', 'goals', 'create', 'add', 'save', 'new', 'want', 'to', 'buy', 'a', 'an', 'in', 'my',
  ];

  cleaned = stripBoundaryWords(cleaned, stopWords);
  if (!cleaned || cleaned.length < 2) {
    if (parsedAmt > 0 && !isPurchaseIntent) {
      const formattedAmt =
        parsedCurrency === 'USD'
          ? `$${parsedAmt.toLocaleString('en-US')}`
          : `${parsedAmt.toLocaleString('en-US')} تومان`;
      return {
        goalTitle: lang === 'fa' ? `هدف مالی ${formattedAmt}` : `Financial Goal ${formattedAmt}`,
        goalKind,
      };
    }
    return {
      goalTitle: lang === 'fa' ? 'هدف مالی جدید' : 'New Financial Goal',
      goalKind,
    };
  }

  if (goalKind === 'item' && lang === 'fa' && !/^(خرید|تهیه)\s+/.test(cleaned)) {
    cleaned = `خرید ${cleaned}`;
  } else if (
    goalKind === 'monetary' &&
    lang === 'fa' &&
    parsedAmt > 0 &&
    /^(درآمد|سود|پس.?انداز|سرمایه|تارگت)$/.test(cleaned)
  ) {
    const formattedAmt =
      parsedCurrency === 'USD'
        ? `$${parsedAmt.toLocaleString('en-US')}`
        : `${parsedAmt.toLocaleString('en-US')} تومان`;
    cleaned = `${cleaned} ${formattedAmt}`;
  }

  const finalTitle = cleaned.length > 44 ? `${cleaned.slice(0, 44).trim()}…` : cleaned;
  return { goalTitle: finalTitle, goalKind };
}

export function deriveCleanThreadTitle(rawText: string, actionTitle?: string): string {
  if (actionTitle && actionTitle.trim()) {
    return actionTitle.length > 42 ? `${actionTitle.slice(0, 42).trim()}…` : actionTitle.trim();
  }
  const stripped = stripBoundaryWords(rawText, [
    'سلام', 'درود', 'لطفاً', 'لطفا', 'میتونی', 'می‌تونی', 'میشه', 'برام', 'دوست دارم',
    'میخوام', 'می‌خوام', 'ثبت کنی', 'ثبت کن', 'بگو', 'بده', 'یه', 'یک',
  ]);
  const base = stripped.length >= 4 ? stripped : rawText.trim();
  return base.length > 40 ? `${base.slice(0, 40).trim()}…` : base;
}

function runLocalOfflineCopilotFallback(
  userText: string,
  state: FundTrackState,
  snap: PanelCopilotSnapshot,
  assistantMode: AssistantChatMode = 'auto'
): CopilotTurnResponse {
  const lang = state.settings.language;
  const norm = normalizeDigitsAndSeparators(userText.trim());
  const lower = norm.toLowerCase();
  const { amount: parsedAmt, currency: parsedCurrency } = extractAmountAndCurrency(norm);

  // 0) Long-term memory capture command ("به خاطر بسپار..." / "به یاد بسپار..." / "یادت باشه...")
  if (/(به خاطر بسپار|به یاد بسپار|یادت باشه|حفظ کن|remember that|save in memory)/.test(lower)) {
    const cleanedFact = userText
      .replace(/^(لطفاً\s+|لطفا\s+)?(از این به بعد\s+)?(به خاطر بسپار|به یاد بسپار|یادت باشه|اینو یادت باشه|remember that)\s*(که|:)?\s*/i, '')
      .trim();
    if (cleanedFact.length >= 4) {
      return {
        mode: 'propose_action',
        reply:
          lang === 'fa'
            ? 'این مورد را به حافظه دائمی دستیار اضافه می‌کنم تا در تمام گفتگوهای بعدی هم در نظر بگیرم:'
            : 'I will save this rule to my long-term memory across future sessions:',
        suggestions: [],
        quickReplies: [],
        action: {
          kind: 'save_memory',
          title: lang === 'fa' ? 'ذخیره در حافظه دستیار' : 'Save Assistant Memory',
          fact: cleanedFact,
          category: 'preference',
        },
        isOfflineFallback: true,
      };
    }
  }

  // 1) Open/Define Credit Line (BNPL: دیجی‌پی / اسنپ‌پی / تارا / کارت اعتباری)
  // MUST run BEFORE transaction parsing so "تراکنش نه خط اعتبار باز کن" is NEVER coerced into an expense!
  const explicitCreditLineIntent =
    /(خط اعتبار|توی اعتبارات|در اعتبارات|اعتبار.*باز کن|تعریف اعتبار|ایجاد اعتبار|اضافه کردن اعتبار|credit line|open credit|bnpl)/.test(lower) ||
    (/(دیجی.?پی|دیجیپی|اسنپ.?پی|اسنپپی|تارا|کارت اعتباری)/.test(lower) &&
      /(دارم|باز کن|بساز|تعریف|اضافه|ایجاد|تراکنش نه)/.test(lower) &&
      !/(خریدم|پرداخت کردم|سفارش دادم)/.test(lower));

  if (explicitCreditLineIntent) {
    const det = detectCreditProvider(lower);
    const instMatch = norm.match(/(\d+)\s*(قسطه|قسط|ماهه|installment)/i);
    const defaultInstallments = instMatch ? Math.min(36, Math.max(1, Number(instMatch[1]))) : 4;

    if (parsedAmt <= 0) {
      return {
        mode: 'clarify',
        reply:
          lang === 'fa'
            ? `برای باز کردن «${det.defaultTitleFa}»، سقف اعتبار کل چقدر است؟ (مثلاً: ۱۵ میلیون تومان، ۴ قسطه)`
            : `What is the credit limit for "${det.defaultTitleEn}" and how many installments?`,
        suggestions: [],
        quickReplies:
          lang === 'fa'
            ? ['اعتبار دیجی‌پی ۱۵ میلیون تومانی ۴ قسطه', 'اعتبار اسنپ‌پی ۱۰ میلیون تومانی ۴ قسطه']
            : ['Digipay 15M IRT 4 installments', 'SnappPay 10M IRT 4 installments'],
        isOfflineFallback: true,
      };
    }

    return {
      mode: 'propose_action',
      reply:
        lang === 'fa'
          ? `پیش‌نویس تعریف خط اعتبار «${det.defaultTitleFa}» آماده شد (هیچ تراکنش هزینه‌ای ثبت نمی‌شود):`
          : `Credit line draft ready for "${det.defaultTitleEn}" (no expense transaction will be logged):`,
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'add_credit_line',
        title: lang === 'fa' ? `باز کردن خط اعتبار: ${det.defaultTitleFa}` : `Open Credit Line: ${det.defaultTitleEn}`,
        creditTitle: det.defaultTitleFa,
        provider: det.provider,
        creditLimit: parsedAmt,
        currency: parsedCurrency,
        defaultInstallments,
        dueDayOfMonth: 5,
        note: lang === 'fa' ? `${defaultInstallments} قسط ماهانه` : `${defaultInstallments} monthly installments`,
        active: true,
      },
      isOfflineFallback: true,
    };
  }

  // 2) Open/Define Bank Account / Wallet / Cash Fund
  if (
    /(حساب بانکی|حساب جدید|کیف پول|کارت بانکی|صندوق نقد|bank account|wallet)/.test(lower) &&
    /(باز کن|بساز|اضافه|تعریف|ایجاد|دارم|ثبت|create|add|open)/.test(lower) &&
    !/(انتقال|کارت به کارت|پرداخت کردم|خریدم)/.test(lower)
  ) {
    const accountType: BankAccountType = /(کیف پول|تتر|دلار|wallet|tether|usdt)/.test(lower)
      ? 'wallet'
      : /(نقد|صندوق|cash)/.test(lower)
      ? 'cash'
      : 'bank';
    const currency: CurrencyCode = accountType === 'wallet' || parsedCurrency === 'USD' ? 'USD' : 'IRT';
    const namedMatch = norm.match(/(?:به نام|به اسم|بنام)\s+([^\d,،.]+?)(?:\s+(?:با|موجودی|تومان|تومن|دلار)|$)/);
    const cleanedAccName = stripBoundaryWords(stripAmountPhrases(userText), [
      'سلام', 'لطفاً', 'لطفا', 'برام', 'میتونی', 'می‌تونی', 'حساب بانکی', 'حساب جدید', 'حساب',
      'کیف پول', 'کارت بانکی', 'صندوق نقدی', 'صندوق نقد', 'صندوق', 'به اسم', 'به نام', 'بنام',
      'یه', 'یک', 'را', 'رو', 'با', 'موجودی', 'اولیه', 'تومانی', 'تومنی', 'تومان', 'تومن',
      'دلاری', 'دلار', 'تتر', 'باز کن', 'بساز', 'اضافه کن', 'اضافه کنی', 'تعریف کن', 'ایجاد کن',
      'ثبت کن', 'ثبت کنی', 'جدید', 'دارم', 'میلیارد', 'میلیونی', 'میلیون', 'هزار',
    ]);
    const guessedName =
      namedMatch?.[1]?.trim() ||
      cleanedAccName ||
      (accountType === 'wallet'
        ? tLabel(lang, 'کیف پول دلاری', 'USD Wallet')
        : accountType === 'cash'
        ? tLabel(lang, 'صندوق نقدی', 'Cash Fund')
        : tLabel(lang, 'حساب بانکی جدید', 'New Bank Account'));

    return {
      mode: 'propose_action',
      reply:
        lang === 'fa'
          ? `پیش‌نویس تعریف حساب «${guessedName}» آماده شد؛ در صورت نیاز نام یا موجودی اولیه را ویرایش و تأیید کنید:`
          : `Account draft for "${guessedName}" prepared — verify name and initial balance below:`,
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'add_bank_account',
        title: lang === 'fa' ? `تعریف حساب: ${guessedName}` : `Create Account: ${guessedName}`,
        name: guessedName,
        accountType,
        currency,
        balance: parsedAmt > 0 ? parsedAmt : 0,
        note: '',
      },
      isOfflineFallback: true,
    };
  }

  // 3) Goal creation (Check BEFORE Add Person & Expense so aspirational buy/reach goals ALWAYS hit Goal!)
  const isGoalCreateIntent =
    !/(به هدف|برای هدف)\s+.*(واریز|اختصاص|پس.?انداز)/.test(lower) &&
    ((/(هدف|اهداف|goal|goals)/.test(lower) &&
      /(ثبت|بساز|تعریف|اضافه|ایجاد|بذار|بگذار|جدید|دوست دارم|میخوام|می‌خوام|میخواهم|create|add|save)/.test(lower)) ||
      (/(دوست دارم|قصد دارم|برنامه دارم|آرزو دارم|می‌خواهم|میخوام)/.test(lower) &&
        /(بخرم|برسم|تهیه کنم|جمع کنم)/.test(lower) &&
        !/(خریدم|پرداخت کردم|واریز کردم|خرج کردم|حساب کردم)/.test(lower) &&
        (/(بودجه|سررسید|مهمه|اولویت|ماه|هفته|سال|دلار|تومن|تومان)/.test(lower))));

  if (isGoalCreateIntent) {
    const { goalTitle, goalKind } = extractCleanGoalDraft(userText, lang);
    const goalPriority = extractGoalPriority(userText);
    const { deadlineMode, targetDate, weeksEstimate } = extractGoalDeadline(userText);
    const { budgetSource, sourceAccountId } = extractGoalBudgetSource(userText, state.bankAccounts);
    const weeklyBudgetAmount = parsedAmt > 0 ? Math.max(1, Math.round(parsedAmt / weeksEstimate)) : 0;

    const deadlineSummaryFa =
      deadlineMode === 'open_until_funded'
        ? 'باز تا تأمین کامل بودجه'
        : `سررسید ${targetDate ? formatJalaliDate(targetDate, 'fa') : 'تعیین‌شده'}`;

    return {
      mode: 'propose_action',
      reply:
        parsedAmt > 0
          ? lang === 'fa'
            ? `پیش‌نویس ${goalKind === 'item' ? 'هدف خرید' : 'هدف مالی'} «${goalTitle}» با اولویت P${goalPriority} (${deadlineSummaryFa}) آماده شد؛ بررسی و تأیید کنید:`
            : `Draft ready for "${goalTitle}" (P${goalPriority}, ${deadlineMode}) — review and confirm:`
          : lang === 'fa'
          ? `پیش‌نویس هدف «${goalTitle}» با عنوان دقیق آماده شد؛ مبلغ تخمینی هدف را وارد کرده و تأیید کنید:`
          : `Draft ready for "${goalTitle}" — enter target amount below and confirm:`,
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'add_goal',
        title:
          lang === 'fa'
            ? `${goalKind === 'item' ? 'هدف خرید' : 'هدف مالی'}: ${goalTitle}`
            : `${goalKind === 'item' ? 'Purchase Goal' : 'Goal'}: ${goalTitle}`,
        goalTitle,
        targetAmount: parsedAmt > 0 ? parsedAmt : 0,
        currency: parsedCurrency,
        goalKind,
        deadlineMode,
        targetDate,
        budgetSource,
        sourceAccountId,
        weeklyBudgetAmount,
        priority: goalPriority,
        activateImmediately: true,
      },
      isOfflineFallback: true,
    };
  }

  // 4) Add Person / Counterparty (Strict: NEVER match "دوست دارم" or non-person contexts!)
  const hasPersonKeyword =
    /(شخص|مخاطب|طرف.?حساب|همکار|مشتری|شریک|رفیق|خانواده|به دفتر حساب|به اشخاص)/.test(lower) ||
    (/(?:^|[\s،,.])(دوستم|دوست)(?=$|[\s،,.])/.test(lower) && !/(دوست\s*دارم|دوست\s*داشتم)/.test(lower));
  const hasNonPersonTopic =
    /(هدف|اهداف|وام|تسهیلات|حساب بانکی|خط اعتبار|دیجی.?پی|اسنپ.?پی|تارا|بخرم|خرید|گوشی)/.test(lower);

  if (
    hasPersonKeyword &&
    !hasNonPersonTopic &&
    /(اضافه|تعریف|بساز|ثبت|ایجاد|add|create)/.test(lower)
  ) {
    const role: PersonRole = /(همکار|شریک|colleague|partner)/.test(lower)
      ? 'partner'
      : /(خانواده|فامیل|پدر|مادر|برادر|خواهر|همسر|family)/.test(lower)
      ? 'family'
      : /(مشتری|کارفرما|client)/.test(lower)
      ? 'client'
      : 'friend';
    const guessedName = stripBoundaryWords(userText, [
      'سلام', 'لطفاً', 'لطفا', 'برام', 'میتونی', 'می‌تونی', 'میشه',
      'شخص', 'مخاطب', 'طرف حساب', 'جدید', 'همکار', 'دوستم', 'دوست', 'رفیقم', 'شریک', 'مشتری', 'خانواده',
      'به نام', 'به اسم', 'بنام', 'را', 'رو', 'به', 'در', 'توی',
      'به دفتر حساب', 'دفتر حساب', 'اشخاص', 'دفتر اشخاص',
      'اضافه کنی', 'اضافه کن', 'تعریف کنی', 'تعریف کن', 'بساز', 'بسازی', 'ثبت کنی', 'ثبت کن', 'ایجاد کن',
      'یه', 'یک',
    ]);
    if (!guessedName || guessedName.length < 2) {
      return {
        mode: 'clarify',
        reply:
          lang === 'fa'
            ? 'نام کامل شخصی که می‌خواهید به دفتر حساب اضافه شود را بفرمایید.'
            : 'Please share the full name of the person to add to your ledger.',
        suggestions: [],
        quickReplies: lang === 'fa' ? ['شخص علی محمدی را اضافه کن'] : ['Add contact Alex'],
        isOfflineFallback: true,
      };
    }
    return {
      mode: 'propose_action',
      reply:
        lang === 'fa'
          ? `پیش‌نویس افزودن «${guessedName}» به دفتر حساب اشخاص آماده شد:`
          : `Draft ready to add "${guessedName}" to People Ledger:`,
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'add_person',
        title: lang === 'fa' ? `افزودن شخص: ${guessedName}` : `Add Person: ${guessedName}`,
        name: guessedName,
        role,
        note: '',
      },
      isOfflineFallback: true,
    };
  }

  // 5) Add Loan / Debt Schedule
  if (
    /(وام|تسهیلات|بدهی قسطی)/.test(lower) &&
    /(ثبت|تعریف|بساز|اضافه|ایجاد|دارم|گرفتم|create|add)/.test(lower) &&
    !/پرداخت قسط/.test(lower)
  ) {
    const instMatch = norm.match(/(\d+)\s*(قسطه|قسط|ماهه|installment)/i);
    const totalInstallments = instMatch ? Math.min(120, Math.max(1, Number(instMatch[1]))) : 12;
    if (parsedAmt <= 0) {
      return {
        mode: 'clarify',
        reply:
          lang === 'fa'
            ? 'برای ثبت وام یا بدهی اقساطی، مبلغ کل وام و تعداد اقساط را بفرمایید (مثلاً: وام ۵۰ میلیونی ۱۲ قسطه).'
            : 'Please provide total loan amount and number of installments.',
        suggestions: [],
        quickReplies: lang === 'fa' ? ['وام ۵۰ میلیون تومانی ۱۲ قسطه ثبت کن'] : ['Add 50M IRT 12-installment loan'],
        isOfflineFallback: true,
      };
    }
    const instAmt = Math.round(parsedAmt / totalInstallments);
    const cleanedLoanSubject = stripBoundaryWords(
      stripAmountPhrases(userText).replace(/\d+\s*(?:قسطه|قسط|ماهه)/gi, ' '),
      [
        'سلام', 'لطفاً', 'لطفا', 'برام', 'میتونی', 'می‌تونی', 'ثبت کنی', 'ثبت کن', 'تعریف کن',
        'بساز', 'اضافه کن', 'ایجاد کن', 'دارم', 'گرفتم', 'جدید', 'بدهی قسطی',
        'میلیارد', 'میلیونی', 'میلیون', 'ملیون', 'هزار', 'تومانی', 'تومنی', 'تومان', 'تومن',
        'قسطه', 'قسط', 'ماهه', 'را', 'رو', 'یه', 'یک',
      ]
    );
    const loanTitle =
      cleanedLoanSubject && cleanedLoanSubject.length >= 2
        ? /^(وام|تسهیلات|بدهی)/.test(cleanedLoanSubject)
          ? cleanedLoanSubject
          : `وام ${cleanedLoanSubject}`
        : lang === 'fa'
        ? 'وام / تسهیلات جدید'
        : 'New Loan';

    return {
      mode: 'propose_action',
      reply:
        lang === 'fa'
          ? `پیش‌نویس ثبت «${loanTitle}» (${totalInstallments} قسط) آماده شد؛ بررسی و تأیید کنید:`
          : `Loan draft for "${loanTitle}" prepared — verify amount and installment count:`,
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'add_loan',
        title: lang === 'fa' ? `ثبت وام: ${loanTitle}` : `Create Loan: ${loanTitle}`,
        loanTitle,
        loanKind: 'loan',
        totalAmount: parsedAmt,
        currency: parsedCurrency,
        totalInstallments,
        installmentAmount: instAmt,
        dueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
        periodLabel: lang === 'fa' ? `${totalInstallments} قسط ماهانه` : `${totalInstallments} monthly`,
        priorityRate: 18,
      },
      isOfflineFallback: true,
    };
  }

  // 6) Fixed Monthly Expense
  if (/(هزینه ثابت|قبض ماهانه|اشتراک ماهانه|اجاره ماهانه|fixed expense)/.test(lower)) {
    if (parsedAmt <= 0) {
      return {
        mode: 'clarify',
        reply:
          lang === 'fa'
            ? 'لطفاً عنوان هزینه ثابت و مبلغ ماهانه آن را بفرمایید (مثلاً: هزینه ثابت اینترنت ۵۰۰ هزار تومان روز ۵ ماه).'
            : 'Please share the fixed expense title and monthly amount.',
        suggestions: [],
        quickReplies: lang === 'fa' ? ['هزینه ثابت سرور ۳۰ دلاری روز اول ماه'] : ['Fixed expense VPS $30 day 1'],
        isOfflineFallback: true,
      };
    }
    const dayMatch = norm.match(/روز\s*(\d+)/);
    const dayOfMonth = dayMatch ? Math.min(30, Math.max(1, Number(dayMatch[1]))) : 1;
    const titleGuess =
      stripBoundaryWords(
        stripAmountPhrases(userText).replace(/روز\s*\d+(?:\s*ماه)?/gi, ' '),
        [
          'سلام', 'لطفاً', 'لطفا', 'برام', 'هزینه ثابت', 'قبض ماهانه', 'اشتراک ماهانه', 'ماهانه',
          'ثبت کنی', 'ثبت کن', 'تعریف کن', 'بساز', 'اضافه کن', 'روز', 'هر ماه', 'ماه',
          'میلیارد', 'میلیون', 'هزار', 'تومانی', 'تومنی', 'تومان', 'تومن', 'دلاری', 'دلار',
          'را', 'رو', 'به', 'در', 'یه', 'یک',
        ]
      ) || (lang === 'fa' ? 'هزینه ثابت ماهانه' : 'Fixed Expense');

    return {
      mode: 'propose_action',
      reply:
        lang === 'fa'
          ? `پیش‌نویس هزینه ثابت «${titleGuess}» آماده شد؛ بررسی و تأیید کنید:`
          : `Fixed monthly expense draft for "${titleGuess}" prepared:`,
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'add_fixed_expense',
        title: lang === 'fa' ? `هزینه ثابت: ${titleGuess}` : `Fixed Expense: ${titleGuess}`,
        expenseTitle: titleGuess,
        amount: parsedAmt,
        currency: parsedCurrency,
        dayOfMonth,
        recurringMonthly: true,
      },
      isOfflineFallback: true,
    };
  }

  // 7) Budget Cap
  if (/(سقف بودجه|بودجه دسته|budget cap)/.test(lower) && /(تعریف|بساز|اضافه|تعیین|بذار|ثبت|create|add)/.test(lower)) {
    const pctMatch = norm.match(/(\d+)\s*(?:%|درصد)/);
    const pct = pctMatch ? Math.min(100, Math.max(1, Number(pctMatch[1]))) : 15;
    const src = state.bankAccounts[0];
    if (!src) {
      return {
        mode: 'clarify',
        reply:
          lang === 'fa'
            ? 'برای تعریف سقف بودجه ابتدا حداقل یک حساب بانکی تعریف کنید.'
            : 'Create a bank account first before setting a percentage budget cap.',
        suggestions: [],
        quickReplies: lang === 'fa' ? ['یه حساب بانکی با موجودی ۲۰ میلیون باز کن'] : ['Create a bank account'],
        isOfflineFallback: true,
      };
    }
    const categoryName =
      stripBoundaryWords(userText.replace(/\d+\s*(?:%|درصد)/gi, ' '), [
        'سلام', 'لطفاً', 'لطفا', 'برام', 'سقف بودجه', 'بودجه دسته', 'بودجه',
        'تعریف کن', 'بساز', 'اضافه کن', 'تعیین کن', 'بذار', 'ثبت کن', 'از مانده حساب', 'برای',
      ]) || (lang === 'fa' ? 'هزینه‌های عمومی' : 'General Expenses');
    return {
      mode: 'propose_action',
      reply: lang === 'fa' ? `پیش‌نویس سقف بودجه «${categoryName}» آماده شد:` : 'Budget cap draft prepared:',
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'add_budget_cap',
        title: lang === 'fa' ? `سقف بودجه: ${categoryName} (${pct}%)` : `Budget Cap: ${categoryName} (${pct}%)`,
        categoryName,
        sourceAccountId: src.id,
        percentOfBalance: pct,
        rolloverUnused: true,
      },
      isOfflineFallback: true,
    };
  }

  // 8) Custom Mission
  if (/(ماموریت|مأموریت|چالش)/.test(lower) && /(بساز|تعریف|اضافه|ایجاد|جدید|ثبت|create|add)/.test(lower)) {
    const missionTitle =
      stripBoundaryWords(stripAmountPhrases(userText), [
        'سلام', 'لطفاً', 'لطفا', 'برام', 'ماموریت', 'مأموریت', 'چالش', 'سفارشی', 'جدید',
        'بساز', 'تعریف کن', 'اضافه کن', 'ایجاد کن', 'ثبت کن', 'یه', 'یک', 'را', 'رو',
      ]) || (lang === 'fa' ? 'مأموریت مالی جدید' : 'New Custom Mission');
    return {
      mode: 'propose_action',
      reply: lang === 'fa' ? `پیش‌نویس مأموریت «${missionTitle}» آماده شد:` : 'Custom mission draft prepared:',
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'add_custom_mission',
        title: lang === 'fa' ? `مأموریت سفارشی: ${missionTitle}` : `Mission: ${missionTitle}`,
        missionTitle,
        source: 'manual',
        metric: 'income',
        targetValue: parsedAmt > 0 ? parsedAmt : 10_000_000,
        stars: 2,
        xp: 100,
      },
      isOfflineFallback: true,
    };
  }

  // 9) FX Rate / Panel Risk Settings
  if (/(نرخ دلار|قیمت دلار)/.test(lower) && /(آپدیت|به‌روز|بروز|بگیر|تنظیم|بذار|refresh|update)/.test(lower)) {
    const isManual = parsedAmt > 10000;
    return {
      mode: 'propose_action',
      reply:
        lang === 'fa'
          ? isManual
            ? `پیش‌نویس ثبت دستی نرخ دلار روی ${parsedAmt.toLocaleString('en-US')} تومان آماده شد:`
            : 'درخواست به‌روزرسانی لحظه‌ای نرخ دلار از منبع آنلاین آماده است:'
          : 'FX rate update ready:',
      suggestions: [],
      quickReplies: [],
      action: {
        kind: 'update_fx_rate',
        title: isManual
          ? lang === 'fa'
            ? `تنظیم نرخ دلار: ${parsedAmt.toLocaleString('en-US')} تومان`
            : `Set USD Rate: ${parsedAmt.toLocaleString('en-US')}`
          : lang === 'fa'
          ? 'به‌روزرسانی آنلاین نرخ دلار'
          : 'Refresh Live USD Rate',
        mode: isManual ? 'manual' : 'live',
        usdToman: isManual ? parsedAmt : undefined,
      },
      isOfflineFallback: true,
    };
  }

  // 10) Free Economic Calendar / News Auto-Fetch (Zero API Key Needed)
  if (
    /(اخبار.*اقتصادی|رویداد.*اقتصادی|تقویم.*اقتصادی|خبر.*مهم|فارکس.?فکتوری|اخبار.*بگیر|اخبار.*اپدیت|اخبار.*آپدیت|بروزرسانی.*اخبار|به‌روزرسانی.*اخبار|economic news|economic calendar|forex factory|nfp|fomc|cpi)/.test(
      lower
    )
  ) {
    const wantsUsd = /(دلار|طلا|xau|usd)/.test(lower);
    const wantsHighOnly = /(فقط مهم|قرمز|high impact|تأثیر زیاد|تاثیر زیاد)/.test(lower);
    return {
      mode: 'propose_action',
      reply:
        lang === 'fa'
          ? 'بله، بدون نیاز به هیچ کلید API پولی، دستیار مستقیماً از فید رایگان عمومی Forex Factory (FairEconomy) تقویم رویدادهای اقتصادی این هفته را دریافت و در تقویم ترید پنل به‌روزرسانی می‌کند. فیلتر دلخواه را بررسی و تأیید کنید:'
          : 'Yes — without any paid News API key, I can fetch this week’s live economic calendar for free from the public Forex Factory / FairEconomy feed and update your panel:',
      suggestions:
        snap.trading.upcomingEvents.length > 0
          ? [
              lang === 'fa'
                ? `نزدیک‌ترین رویداد فعلی: ${snap.trading.upcomingEvents[0].title} (${snap.trading.upcomingEvents[0].currency})`
                : `Current next event: ${snap.trading.upcomingEvents[0].title} (${snap.trading.upcomingEvents[0].currency})`,
            ]
          : [],
      quickReplies: [],
      action: {
        kind: 'refresh_economic_news',
        title:
          lang === 'fa'
            ? 'دریافت رایگان رویدادهای اقتصادی این هفته'
            : 'Fetch Free Weekly Economic Calendar',
        currencyFilter: wantsUsd ? 'USD' : 'ALL',
        impactFilter: wantsHighOnly ? 'high' : 'high_medium',
      },
      isOfflineFallback: true,
    };
  }

  // 11) Statistical / analytical question (also prioritized if user explicitly chose "analysis" mode!)
  const hasExplicitTxVerb = /(ثبت کن|اضافه کن|بنویس|پرداخت کردم|واریز کردم|خریدم|خرج کردم|انتقال دادم|log|pay)/.test(
    lower
  );
  if (
    (assistantMode === 'analysis' && parsedAmt <= 0 && !hasExplicitTxVerb) ||
    (/(تحلیل|آنالیز|آمار|عملکرد|وضعیت|گزارش|پیشنهاد|بهترین|سشن|سود|زیان|نقدینگی|بدهی|وین.?ریت|پرافیت|analyze|analysis|stat|report|summary|winrate|profit factor|session|cashflow)/.test(
      lower
    ) &&
      !/(ثبت|اضافه|بنویس|بخر|خرید|خرج|پرداخت|واریز|انتقال|قسط|هدف بساز|add|log|create|pay)/.test(lower))
  ) {
    const brief = buildLocalStatisticalBrief(snap, userText, lang);
    return {
      mode: 'analysis',
      reply: brief.reply,
      suggestions: brief.suggestions,
      quickReplies: brief.quickReplies,
      isOfflineFallback: true,
    };
  }

  // 12) Pay loan installment
  if (/(پرداخت قسط|قسط.*پرداخت|pay.*installment)/.test(lower)) {
    const openLoan = state.loans.find((l) => l.status === 'open');
    const acc =
      state.bankAccounts.find((a) => a.currency === (openLoan?.currency ?? 'IRT')) ??
      state.bankAccounts[0];
    if (openLoan && acc) {
      return {
        mode: 'propose_action',
        reply: lang === 'fa' ? `آماده پرداخت قسط بعدی «${openLoan.title}» هستم:` : `Ready to pay next installment for "${openLoan.title}":`,
        suggestions: [],
        quickReplies: [],
        action: {
          kind: 'pay_loan_installment',
          title: lang === 'fa' ? `پرداخت قسط «${openLoan.title}»` : `Pay "${openLoan.title}"`,
          loanId: openLoan.id,
          loanTitle: openLoan.title,
          accountId: acc.id,
          installmentAmount: openLoan.installmentAmount,
          currency: openLoan.currency,
        },
        isOfflineFallback: true,
      };
    }
  }

  // 13) Contribute to goal
  if (/(به هدف|برای هدف)/.test(lower) && /(واریز|اختصاص|پس.?انداز|اضافه)/.test(lower) && parsedAmt > 0) {
    const activeGoal = state.goals.find((g) => g.status === 'active') ?? state.goals[0];
    if (activeGoal) {
      return {
        mode: 'propose_action',
        reply: lang === 'fa' ? `پیش‌نویس واریز به هدف «${activeGoal.title}» آماده شد:` : `Draft ready to contribute to "${activeGoal.title}":`,
        suggestions: [],
        quickReplies: [],
        action: {
          kind: 'contribute_goal',
          title: lang === 'fa' ? `واریز به «${activeGoal.title}»` : `Fund "${activeGoal.title}"`,
          goalId: activeGoal.id,
          goalTitle: activeGoal.title,
          amount: parsedAmt,
          currency: activeGoal.currency,
          sourceAccountId: state.bankAccounts.find((a) => a.currency === activeGoal.currency)?.id,
        },
        isOfflineFallback: true,
      };
    }
  }

  // 14) Transaction fallback + clarification if missing amount
  const draft = parseCommandLocally(userText, {
    accounts: state.bankAccounts,
    creditLines: state.creditLines ?? [],
    people: state.people ?? [],
    budgetCaps: state.budgetCaps ?? [],
  });

  if (draft.amount <= 0) {
    return {
      mode: 'clarify',
      reply:
        lang === 'fa'
          ? 'منظور یا مبلغ دقیق درخواست شما مشخص نبود. لطفاً دقیق‌تر بفرمایید چه کاری انجام دهم یا از گزینه‌های زیر انتخاب کنید:'
          : 'Could you clarify what action or analysis you want, or pick a quick prompt?',
      suggestions: [],
      quickReplies:
        lang === 'fa'
          ? [
              'تحلیل آماری ترید و سشن‌ها',
              'خط اعتبار دیجی‌پی ۱۵ میلیونی ۴ قسطه باز کن',
              'ثبت ۵۰۰ هزار تومن قهوه از بلوبانک',
            ]
          : [
              'Analyze trading & sessions',
              'Open Digipay 15M IRT 4-installment credit line',
              'Spent $20 from Tether for VPS',
            ],
      isOfflineFallback: true,
    };
  }

  const txTitle =
    draft.type === 'in'
      ? lang === 'fa'
        ? `ثبت درآمد: ${draft.note}`
        : `Income: ${draft.note}`
      : draft.type === 'transfer'
      ? lang === 'fa'
        ? `انتقال وجه: ${draft.note}`
        : `Transfer: ${draft.note}`
      : lang === 'fa'
      ? `ثبت هزینه: ${draft.note}`
      : `Expense: ${draft.note}`;

  return {
    mode: 'propose_action',
    reply:
      lang === 'fa'
        ? `پیش‌نویس «${txTitle}» آماده شد؛ بررسی و تأیید کنید:`
        : `Draft "${txTitle}" prepared — review and confirm:`,
    suggestions: [],
    quickReplies: [],
    action: {
      kind: 'add_transaction',
      title: txTitle,
      draft,
    },
    isOfflineFallback: true,
  };
}

function tLabel(lang: 'fa' | 'en', fa: string, en: string): string {
  return lang === 'fa' ? fa : en;
}

function parseAssistantModelOutput(
  rawText: string,
  lastUserMsg: string,
  state: FundTrackState,
  modelUsed: string,
  latencyMs?: number
): CopilotTurnResponse {
  const lang = state.settings.language;
  const parsed = extractJsonFromLlmText(rawText);
  if (parsed) {
    const modeRaw = parsed.mode;
    const mode: CopilotTurnResponse['mode'] =
      modeRaw === 'clarify' ||
      modeRaw === 'propose_action' ||
      modeRaw === 'analysis' ||
      modeRaw === 'chat'
        ? modeRaw
        : parsed.action
        ? 'propose_action'
        : 'chat';

    const reply =
      typeof parsed.reply === 'string' && parsed.reply.trim()
        ? parsed.reply.trim()
        : lang === 'fa'
        ? 'پاسخ آماده شد.'
        : 'Response ready.';

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 3)
      : [];

    const quickReplies = Array.isArray(parsed.quickReplies)
      ? parsed.quickReplies.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 4)
      : [];

    const memoryFact =
      typeof parsed.memoryNote === 'string' && parsed.memoryNote.trim().length >= 4
        ? parsed.memoryNote.trim()
        : undefined;

    const action =
      mode === 'propose_action'
        ? normalizeActionFromJson(
            parsed.action as Record<string, unknown> | undefined,
            lastUserMsg,
            state
          )
        : undefined;

    return {
      mode: mode === 'propose_action' && !action ? 'chat' : mode,
      reply,
      suggestions,
      quickReplies,
      action,
      memoryFact,
      modelUsed,
      latencyMs,
    };
  }

  return {
    mode: 'analysis',
    reply: rawText.trim(),
    suggestions: [],
    quickReplies: [],
    modelUsed,
    latencyMs,
  };
}

export async function runAssistantCopilotTurn(
  history: CopilotChatTurnMessage[],
  state: FundTrackState,
  config?: LocalAiConfig,
  contextOpts?: CopilotContextOptions
): Promise<CopilotTurnResponse> {
  const lang = state.settings.language;
  const profile = resolveActiveModelProfile(config);
  const snap = buildAssistantPanelSnapshot(state);
  const lastUserMsg = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const activeMode: AssistantChatMode = contextOpts?.assistantMode ?? config?.assistantMode ?? 'auto';
  const effectiveDepth =
    activeMode === 'fast'
      ? 'fast'
      : activeMode === 'analysis'
      ? 'deep'
      : config?.thinkingDepth ?? 'deep';

  if (config && !config.enabled) {
    return runLocalOfflineCopilotFallback(lastUserMsg, state, snap, activeMode);
  }

  const systemInstruction = buildCopilotSystemInstruction(snap, lang, {
    ...contextOpts,
    assistantMode: activeMode,
  });
  const meta = PROVIDER_META[profile.provider] ?? PROVIDER_META.gemini;
  const effectiveEndpoint = (profile.endpoint || meta.defaultEndpoint || '').replace(/\/+$/, '');
  const trimmedHistory = history.slice(-14);

  try {
    const res = await fetch('/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: profile.provider,
        endpoint: effectiveEndpoint,
        model: profile.model || meta.defaultModel,
        envKeyName: profile.envKeyName || meta.defaultEnvKey,
        apiKey: config?.apiKey ?? '',
        thinkingDepth: effectiveDepth,
        systemInstruction,
        messages: trimmedHistory,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        rawText?: string;
        modelUsed?: string;
        latencyMs?: number;
        code?: string;
        error?: string;
      };

      if (data.ok && data.rawText) {
        return parseAssistantModelOutput(
          data.rawText,
          lastUserMsg,
          state,
          data.modelUsed || profile.model,
          data.latencyMs
        );
      }

      // Surface genuine cloud API errors cleanly
      if (!data.ok && meta.isCloud) {
        return {
          mode: 'chat',
          reply:
            data.error ||
            (lang === 'fa'
              ? 'ارتباط با مدل API با خطا مواجه شد.'
              : 'Upstream AI API request failed.'),
          suggestions: [],
          quickReplies:
            lang === 'fa'
              ? ['تغییر به تحلیل‌گر لوکال', 'تحلیل آماری ترید و سشن‌ها']
              : ['Switch to Local Analyzer'],
          error: data.error,
        };
      }
    }
  } catch (err) {
    if (meta.isCloud) {
      return {
        mode: 'chat',
        reply: (err as Error).message || 'Network error reaching AI backend',
        suggestions: [],
        quickReplies: [],
        error: (err as Error).message,
      };
    }
  }

  // If local AI (Jan / Ollama / llama-server / LM Studio) failed on server proxy
  // (e.g. web preview runs in cloud while Jan Desktop runs on user's PC 127.0.0.1:1337),
  // attempt direct browser call once when CORS is enabled on the local runner.
  if (!meta.isCloud && effectiveEndpoint) {
    try {
      const started = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14000);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config?.apiKey?.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;

      const directRes = await fetch(`${effectiveEndpoint}/chat/completions`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: profile.model || meta.defaultModel,
          temperature: 0.2,
          max_tokens: 1400,
          messages: [{ role: 'system', content: systemInstruction }, ...trimmedHistory],
        }),
      }).finally(() => clearTimeout(timer));

      if (directRes.ok) {
        const payload = (await directRes.json()) as {
          model?: string;
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawText = payload.choices?.[0]?.message?.content ?? '';
        if (rawText) {
          return parseAssistantModelOutput(
            rawText,
            lastUserMsg,
            state,
            payload.model || profile.model,
            Math.round(performance.now() - started)
          );
        }
      }
    } catch {
      // Local runner is offline or CORS disabled -> fall back cleanly to smart offline analyzer
    }
  }

  return runLocalOfflineCopilotFallback(lastUserMsg, state, snap, activeMode);
}

export async function testAssistantProfileConnection(
  profile: AiModelProfile
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const meta = PROVIDER_META[profile.provider] ?? PROVIDER_META.gemini;
  try {
    const res = await fetch('/api/assistant/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: profile.provider,
        endpoint: profile.endpoint || meta.defaultEndpoint,
        model: profile.model || meta.defaultModel,
        envKeyName: profile.envKeyName || meta.defaultEnvKey,
      }),
    });
    if (res.ok) {
      return (await res.json()) as { ok: boolean; models: string[]; error?: string };
    }
    return { ok: false, models: [], error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, models: [], error: (err as Error).message };
  }
}
