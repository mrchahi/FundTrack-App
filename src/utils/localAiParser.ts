import {
  BankAccount,
  BudgetCap,
  CreditLine,
  CurrencyCode,
  LocalAiConfig,
  LocalAiProvider,
  ParsedTransactionDraft,
  PaymentMethod,
  PersonContact,
  TransactionType,
} from '../types';
import { toLocalIsoDate } from './jalali';

export type { ParsedTransactionDraft };

export interface LocalAiParseResult {
  draft: ParsedTransactionDraft;
  engine: 'llm' | 'offline_parser';
  modelUsed?: string;
  latencyMs?: number;
  warning?: string;
}

export interface LocalAiContextInput {
  accounts: BankAccount[];
  creditLines: CreditLine[];
  people: PersonContact[];
  budgetCaps: BudgetCap[];
  todayIso?: string;
}

export const LOCAL_AI_PRESETS: Record<
  LocalAiProvider,
  { labelFa: string; labelEn: string; defaultEndpoint: string; defaultModel: string }
> = {
  gemini: {
    labelFa: 'Gemini Cloud (سرور داخلی پنل)',
    labelEn: 'Gemini Cloud (Built-in Server)',
    defaultEndpoint: '',
    defaultModel: 'gemini-4-hydrogen',
  },
  jan: {
    labelFa: 'Jan (پیشنهادی — پورت 1337)',
    labelEn: 'Jan Desktop (Port 1337)',
    defaultEndpoint: 'http://127.0.0.1:1337/v1',
    defaultModel: 'gemma-4-E2B-it-Q4_K_M',
  },
  llama_server: {
    labelFa: 'llama-server / llama.cpp (پورت 8080)',
    labelEn: 'llama-server (Port 8080)',
    defaultEndpoint: 'http://127.0.0.1:8080/v1',
    defaultModel: 'gemma-4-E2B-it-Q4_K_M',
  },
  ollama: {
    labelFa: 'Ollama (پورت 11434)',
    labelEn: 'Ollama (Port 11434)',
    defaultEndpoint: 'http://127.0.0.1:11434/v1',
    defaultModel: 'gemma4:e2b',
  },
  lmstudio: {
    labelFa: 'LM Studio (پورت 1234)',
    labelEn: 'LM Studio (Port 1234)',
    defaultEndpoint: 'http://127.0.0.1:1234/v1',
    defaultModel: 'gemma-4-E2B-it-Q4_K_M',
  },
  openrouter: {
    labelFa: 'OpenRouter API (Claude / GPT / DeepSeek)',
    labelEn: 'OpenRouter API',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4',
  },
  openai: {
    labelFa: 'OpenAI API (GPT-4.1 / GPT-4o)',
    labelEn: 'OpenAI API',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
  },
  deepseek: {
    labelFa: 'DeepSeek API (Reasoner / Chat)',
    labelEn: 'DeepSeek API',
    defaultEndpoint: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-reasoner',
  },
  custom: {
    labelFa: 'سرور دلخواه (OpenAI Compatible)',
    labelEn: 'Custom OpenAI-Compatible URL',
    defaultEndpoint: 'http://127.0.0.1:1337/v1',
    defaultModel: 'gemma-4-E2B-it-Q4_K_M',
  },
};

export const EXPENSE_CATEGORIES = [
  'خوراک و کافه',
  'خرید کالا',
  'مسکن و قبوض',
  'حمل‌ونقل',
  'ابزار و سرور',
  'درمان',
  'سایر',
] as const;

export function normalizeDigitsAndSeparators(input: string): string {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  let out = '';
  for (const ch of input) {
    const pIdx = persian.indexOf(ch);
    if (pIdx >= 0) {
      out += String(pIdx);
      continue;
    }
    const aIdx = arabic.indexOf(ch);
    if (aIdx >= 0) {
      out += String(aIdx);
      continue;
    }
    if (ch === '٫' || ch === '/') {
      out += '.';
      continue;
    }
    out += ch;
  }
  return out.replace(/[،,]/g, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips filler/stop words strictly at Unicode whitespace & punctuation boundaries
 * so Persian words are never damaged mid-word (e.g. "کنی" never turns into "ی").
 */
export function stripBoundaryWords(input: string, words: string[]): string {
  if (!input.trim() || words.length === 0) return input.trim();
  const sorted = [...words].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(
    `(^|[\\s،,.؛:!?()«»"'\\-]+)(?:${sorted.join('|')})(?=$|[\\s،,.؛:!?()«»"'\\-]+)`,
    'gi'
  );
  let prev = input;
  // Run twice in case adjacent stop-words shared a single whitespace separator
  for (let i = 0; i < 3; i += 1) {
    const next = prev.replace(pattern, '$1');
    if (next === prev) break;
    prev = next;
  }
  return prev.replace(/[،,.؛:!?()«»"']+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildCleanTransactionNote(command: string, categoryLabel: string): string {
  let cleaned = normalizeDigitsAndSeparators(command.trim());
  // Strip currency amount expressions without damaging product model numbers like S26 or 16 Pro
  cleaned = cleaned
    .replace(/\$\s*\d+(?:\.\d+)?/gi, ' ')
    .replace(
      /(?<![a-zA-Z])\d+(?:\.\d+)?\s*(?:میلیارد|میلیون|ملیون|هزار|تومانی|تومنی|تومان|تومن|ریال|دلاری|دلار|تتر|usd|usdt|irt|m|k)(?![a-zA-Z])/gi,
      ' '
    )
    .replace(/(?<![a-zA-Z])\d{5,}(?:\.\d+)?(?![a-zA-Z])/g, ' ')
    .replace(/(?:با|از)\s+(?:حساب|کارت|کیف پول|صندوق)\s+[^\s،,.]+/gi, ' ');

  const stopWords = [
    'سلام', 'درود', 'لطفاً', 'لطفا', 'میتونی', 'می‌تونی', 'میشه', 'لطفا برام',
    'برام', 'برای من', 'امروز', 'دیروز', 'پریروز', 'الان', 'همین الان',
    'ثبت کنی', 'ثبت کن', 'ثبتش کن', 'وارد کنی', 'وارد کن', 'اضافه کنی', 'اضافه کن',
    'بنویس', 'حساب کن', 'لحاظ کن', 'در نظر بگیر',
    'تراکنش', 'هزینه', 'خرج کردم', 'خرج شد', 'پرداخت کردم', 'پرداخت شد', 'واریز شد', 'واریز کردم',
    'دریافت کردم', 'خریدم', 'گرفتم', 'زدم', 'انتقال دادم', 'کارت به کارت کردم',
    'میلیارد', 'میلیونی', 'میلیون', 'ملیون', 'هزار', 'تومانی', 'تومنی', 'تومان', 'تومن', 'دلاری', 'دلار', 'تتر',
    'نقدی', 'نقد', 'بانکی', 'اعتباری', 'اقساطی', 'قسطی', 'قسطه', 'قسط', 'ماهه',
    'دیجی‌پی', 'دیجی پی', 'دیجیپی', 'اسنپ‌پی', 'اسنپ پی', 'اسنپپی', 'تارا',
    'بلوبانک', 'بلو', 'ملت', 'ملی', 'صادرات', 'سامان', 'پاسارگاد', 'بانک',
    'از', 'با', 'به', 'در', 'توی', 'رو', 'را', 'یه', 'یک', 'این', 'اون', 'و',
  ];

  cleaned = stripBoundaryWords(cleaned, stopWords);
  if (!cleaned || cleaned.length < 2) {
    return categoryLabel && categoryLabel !== 'سایر' ? categoryLabel : command.trim().slice(0, 40);
  }
  if (/^(?:قهوه|غذا|شام|ناهار|گوشی|لپ.?تاپ|لباس|کتاب|بلیت|بلیط)/.test(cleaned) && /(?:خریدم|گرفتم)/.test(command)) {
    return cleaned.startsWith('خرید') ? cleaned : `خرید ${cleaned}`;
  }
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trim()}…` : cleaned;
}

function detectCategoryLabel(text: string): string {
  const lower = text.toLowerCase();
  if (/(غذا|شام|ناهار|صبحانه|قهوه|کافه|رستوران|فست|سوپرمارکت|خوراک|میوه|نان|food|cafe|coffee|dinner|lunch)/i.test(lower)) {
    return 'خوراک و کافه';
  }
  if (/(سرور|vps|هاست|دامنه|ابزار|نرم.?افزار|اشتراک|تریدینگ|tradingview|مانیتور|لپ.?تاپ|کیبورد|موس|server|tool|software)/i.test(lower)) {
    return 'ابزار و سرور';
  }
  if (/(تاکسی|اسنپ|تپسی|مترو|اتوبوس|بنزین|پمپ|کرایه|هواپیما|قطار|سفر|بلیط|uber|taxi|fuel|transport)/i.test(lower)) {
    return 'حمل‌ونقل';
  }
  if (/(اجاره|شارژ|قبض|برق|آب|گاز|اینترنت|موبایل|تلفن|شارژ ساختمان|rent|bill|internet|wifi)/i.test(lower)) {
    return 'مسکن و قبوض';
  }
  if (/(دارو|دکتر|پزشک|دندان|بیمارستان|آزمایش|ویزیت|درمان|pharmacy|doctor|clinic|health)/i.test(lower)) {
    return 'درمان';
  }
  if (/(خرید|کالا|لباس|کفش|گوشی|دیجی.?کالا|لوازم|تجهیزات|shop|buy|purchase)/i.test(lower)) {
    return 'خرید کالا';
  }
  return 'سایر';
}

export function extractAmountAndCurrency(rawText: string): { amount: number; currency: CurrencyCode } {
  const norm = normalizeDigitsAndSeparators(rawText);
  const lower = norm.toLowerCase();

  const isUsd = /(\$|usd|usdt|دلار|تتر)/i.test(lower);
  const currency: CurrencyCode = isUsd ? 'USD' : 'IRT';

  // Prefer explicit money expressions; avoid model tokens like "S26", "M4", "iPhone 16"
  const explicitMatch = norm.match(
    /(?:\$\s*(\d+(?:\.\d+)?))|(?<![a-zA-Z])(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|ملیون|هزار|تومانی|تومنی|تومان|تومن|ریال|دلاری|دلار|تتر|usd|usdt|irt|m|k)(?![a-zA-Z])/i
  );
  const fallbackLargeMatch = !explicitMatch
    ? norm.match(/(?<![a-zA-Z])(\d{4,}(?:\.\d+)?)(?![a-zA-Z])/)
    : null;
  const fallbackUsdMatch =
    !explicitMatch && !fallbackLargeMatch && isUsd
      ? norm.match(/(?<![a-zA-Z])(\d+(?:\.\d+)?)(?![a-zA-Z])/)
      : null;

  const match = explicitMatch ?? fallbackLargeMatch ?? fallbackUsdMatch;
  if (!match) return { amount: 0, currency };

  const rawNum = match[1] ?? match[2] ?? '';
  const base = Number(rawNum);
  if (!Number.isFinite(base) || base <= 0) return { amount: 0, currency };

  const unit = (explicitMatch ? match[3] || '' : '').toLowerCase();
  let multiplier = 1;
  if (unit === 'میلیارد') multiplier = 1_000_000_000;
  else if (unit === 'میلیون' || unit === 'ملیون' || unit === 'm') multiplier = 1_000_000;
  else if (unit === 'هزار' || unit === 'k') multiplier = 1_000;
  else if (unit === 'ریال') multiplier = 0.1;
  else if (!isUsd && base < 5000 && /(میلیون|ملیون)/i.test(lower)) multiplier = 1_000_000;
  else if (!isUsd && base < 5000 && /هزار/i.test(lower)) multiplier = 1_000;

  // Handle combined forms like "2 میلیون و 500 هزار"
  let total = base * multiplier;
  const secondPart = norm
    .slice((match.index ?? 0) + match[0].length)
    .match(/^\s*و?\s*(\d+(?:\.\d+)?)\s*(هزار|میلیون)?/);
  if (secondPart) {
    const extraNum = Number(secondPart[1]);
    const extraUnit = secondPart[2] || '';
    if (Number.isFinite(extraNum) && extraNum > 0) {
      if (extraUnit === 'هزار' || (!extraUnit && multiplier === 1_000_000 && extraNum < 1000)) {
        total += extraNum * 1_000;
      }
    }
  }

  return {
    amount: currency === 'USD' ? Number(total.toFixed(2)) : Math.round(total),
    currency,
  };
}

function matchBestAccount(
  text: string,
  currency: CurrencyCode,
  preferredType: 'bank' | 'cash' | 'wallet' | undefined,
  accounts: BankAccount[]
): BankAccount | undefined {
  const lower = text.toLowerCase();
  const byName = accounts.find((a) => {
    const tokens = a.name
      .toLowerCase()
      .split(/[\s()\-_/]+/)
      .filter((tok) => tok.length >= 2);
    return tokens.some((tok) => lower.includes(tok));
  });
  if (byName) return byName;

  if (preferredType) {
    const byTypeAndCur = accounts.find((a) => a.type === preferredType && a.currency === currency);
    if (byTypeAndCur) return byTypeAndCur;
    const byType = accounts.find((a) => a.type === preferredType);
    if (byType) return byType;
  }

  return accounts.find((a) => a.currency === currency) ?? accounts[0];
}

export function parseCommandLocally(
  command: string,
  ctx: LocalAiContextInput
): ParsedTransactionDraft {
  const norm = normalizeDigitsAndSeparators(command.trim());
  const lower = norm.toLowerCase();
  const todayIso = ctx.todayIso ?? toLocalIsoDate(new Date());

  // 1. Amount & Currency
  const { amount, currency: detectedCurrency } = extractAmountAndCurrency(norm);

  // 2. Date offset
  let targetDate = todayIso;
  if (/(پریروز|2 روز پیش|دو روز پیش)/.test(lower)) {
    targetDate = toLocalIsoDate(new Date(Date.now() - 2 * 86400000));
  } else if (/(دیروز|yesterday)/.test(lower)) {
    targetDate = toLocalIsoDate(new Date(Date.now() - 86400000));
  }

  // 3. Transaction Type
  let type: TransactionType = 'out';
  if (/(انتقال|کارت به کارت|جابه.?جایی|جابجا|تبدیل|transfer)/.test(lower)) {
    type = 'transfer';
  } else if (/(درآمد|واریز|حقوق|دریافت کردم|پاداش|سود ترید|برداشت سود|فروختم|income|deposit|salary)/.test(lower)) {
    type = 'in';
  }

  // 4. Credit Line matching
  const matchedCredit = (ctx.creditLines ?? []).find((c) => {
    const titleWords = c.title
      .toLowerCase()
      .split(/[\s()\-_/]+/)
      .filter((w) => w.length >= 2);
    if (titleWords.some((w) => lower.includes(w))) return true;
    if (c.provider === 'digipay' && /(دیجی.?پی|digipay)/.test(lower)) return true;
    if (c.provider === 'snapppay' && /(اسنپ.?پی|snapppay)/.test(lower)) return true;
    if (c.provider === 'tara' && /(تارا|tara)/.test(lower)) return true;
    return false;
  });

  const instMatch = norm.match(/(\d+)\s*(قسطه|قسط|ماهه|installment)/i);
  const installmentCount = instMatch
    ? Math.min(36, Math.max(1, Number(instMatch[1])))
    : matchedCredit?.defaultInstallments ?? 4;

  // 5. Person matching (borrowed / person_debt)
  const matchedPerson = (ctx.people ?? []).find((p) => {
    const parts = p.name
      .toLowerCase()
      .split(/[\s()\-_/]+/)
      .filter((w) => w.length >= 2);
    return parts.some((w) => lower.includes(w));
  });

  // 6. Payment Method
  let paymentMethod: PaymentMethod = detectedCurrency === 'USD' ? 'usd' : 'bank';
  if (type === 'out') {
    if (matchedCredit || /(اعتباری|دیجی.?پی|اسنپ.?پی|تارا|اقساطی|قسطی|bnpl)/.test(lower)) {
      paymentMethod = 'credit';
    } else if (/(قرض|بدهی از|قرض گرفتم|borrowed)/.test(lower) || (matchedPerson && /از\s+/.test(lower) && !/درآمد|واریز/.test(lower))) {
      paymentMethod = 'person_debt';
    } else if (/(نقدی|نقد|کیف پول نقد|صندوق|cash)/.test(lower)) {
      paymentMethod = 'cash';
    } else if (detectedCurrency === 'USD') {
      paymentMethod = 'usd';
    } else {
      paymentMethod = 'bank';
    }
  }

  const finalCurrency: CurrencyCode =
    paymentMethod === 'credit' && matchedCredit
      ? matchedCredit.currency
      : paymentMethod === 'usd'
      ? 'USD'
      : detectedCurrency;

  const preferredAccType =
    paymentMethod === 'cash'
      ? 'cash'
      : paymentMethod === 'usd'
      ? 'wallet'
      : 'bank';

  const sourceAcc = matchBestAccount(norm, finalCurrency, preferredAccType, ctx.accounts);
  const otherAcc =
    ctx.accounts.find((a) => a.id !== sourceAcc?.id) ?? ctx.accounts[0];

  const categoryLabel = type === 'out' ? detectCategoryLabel(norm) : 'سایر';
  const matchedBudget = (ctx.budgetCaps ?? []).find(
    (b) =>
      lower.includes(b.categoryName.toLowerCase()) ||
      b.categoryName.includes(categoryLabel.split(' ')[0])
  );

  return {
    type,
    amount,
    currency: finalCurrency,
    paymentMethod,
    accountId:
      paymentMethod === 'credit' || paymentMethod === 'person_debt'
        ? ''
        : sourceAcc?.id ?? '',
    toAccountId: type === 'transfer' ? otherAcc?.id ?? '' : '',
    creditLineId:
      paymentMethod === 'credit'
        ? matchedCredit?.id ?? ctx.creditLines?.[0]?.id ?? ''
        : '',
    installmentCount,
    personId:
      paymentMethod === 'person_debt'
        ? matchedPerson?.id ?? ctx.people?.[0]?.id ?? ''
        : '',
    budgetCategoryId: type === 'out' ? matchedBudget?.id ?? '' : '',
    categoryLabel,
    date: targetDate,
    note: buildCleanTransactionNote(command, categoryLabel),
  };
}

export function buildLocalAiPromptPayload(command: string, ctx: LocalAiContextInput) {
  const accountsList = ctx.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
  }));
  const creditsList = ctx.creditLines.map((c) => ({
    id: c.id,
    title: c.title,
    provider: c.provider,
    currency: c.currency,
    defaultInstallments: c.defaultInstallments,
  }));
  const peopleList = ctx.people.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  const systemPrompt = [
    'You are a strict financial transaction parser for a Persian/English personal accounting app (FundTrack).',
    'Convert the user natural-language command into ONE valid JSON object ONLY. No markdown fences, no commentary.',
    'Rules:',
    '- Currency: "IRT" for Toman/تومان/تومن (convert میلیون to *1000000, هزار to *1000). Use "USD" for Dollar/دلار/تتر/USDT/$.',
    '- type: "out" (expense/purchase), "in" (income/deposit), or "transfer" (between own accounts).',
    '- paymentMethod (when type="out"): "bank", "cash", "usd", "credit" (BNPL like دیجی‌پی/اسنپ‌پی/تارا), or "person_debt" (borrowed from a person).',
    '- Pick accountId, creditLineId, personId strictly from the provided context IDs when matched, else "".',
    '- categoryLabel must be one of: "خوراک و کافه", "خرید کالا", "مسکن و قبوض", "حمل‌ونقل", "ابزار و سرور", "درمان", "سایر".',
    '- dateOffsetDays: 0 for today, -1 for دیروز/yesterday, -2 for پریروز.',
    'Examples:',
    'Input: "امروز ۲.۵ میلیون پول ابزار از بلوبانک خرج کردم" -> {"type":"out","amount":2500000,"currency":"IRT","paymentMethod":"bank","accountId":"bank_1","toAccountId":"","creditLineId":"","installmentCount":null,"personId":"","categoryLabel":"ابزار و سرور","dateOffsetDays":0,"note":"خرید ابزار"}',
    'Input: "خرید ۶ میلیونی از دیجی‌پی ۴ قسطه" -> {"type":"out","amount":6000000,"currency":"IRT","paymentMethod":"credit","accountId":"","toAccountId":"","creditLineId":"cred_1","installmentCount":4,"personId":"","categoryLabel":"خرید کالا","dateOffsetDays":0,"note":"خرید اقساطی دیجی‌پی"}',
    'Input: "دیروز ۳ میلیون از علی قرض گرفتم" -> {"type":"out","amount":3000000,"currency":"IRT","paymentMethod":"person_debt","accountId":"","toAccountId":"","creditLineId":"","installmentCount":null,"personId":"per_1","categoryLabel":"سایر","dateOffsetDays":-1,"note":"قرض از علی"}',
    `Context JSON: ${JSON.stringify({ accounts: accountsList, creditLines: creditsList, people: peopleList })}`,
  ].join('\n');

  return { systemPrompt, userPrompt: command.trim() };
}

export function extractJsonFromLlmText(rawText: string): Record<string, unknown> | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const direct = JSON.parse(cleaned);
    if (direct && typeof direct === 'object') return direct as Record<string, unknown>;
  } catch {
    // Try substring extraction
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const slice = cleaned.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(slice);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function reconcileLlmJsonWithFallback(
  rawJson: Record<string, unknown>,
  command: string,
  ctx: LocalAiContextInput
): ParsedTransactionDraft {
  const fallback = parseCommandLocally(command, ctx);

  const validType: TransactionType =
    rawJson.type === 'in' || rawJson.type === 'out' || rawJson.type === 'transfer'
      ? rawJson.type
      : fallback.type;

  const validCurrency: CurrencyCode =
    rawJson.currency === 'USD' || rawJson.currency === 'IRT'
      ? rawJson.currency
      : fallback.currency;

  const rawAmt = Number(rawJson.amount);
  const amount =
    Number.isFinite(rawAmt) && rawAmt > 0
      ? validCurrency === 'USD'
        ? Number(rawAmt.toFixed(2))
        : Math.round(rawAmt)
      : fallback.amount;

  const allowedMethods: PaymentMethod[] = ['bank', 'cash', 'usd', 'credit', 'person_debt'];
  const paymentMethod: PaymentMethod =
    validType !== 'out'
      ? validCurrency === 'USD'
        ? 'usd'
        : 'bank'
      : allowedMethods.includes(rawJson.paymentMethod as PaymentMethod)
      ? (rawJson.paymentMethod as PaymentMethod)
      : fallback.paymentMethod;

  const accountExists = (id: unknown) =>
    typeof id === 'string' && ctx.accounts.some((a) => a.id === id);
  const creditExists = (id: unknown) =>
    typeof id === 'string' && ctx.creditLines.some((c) => c.id === id);
  const personExists = (id: unknown) =>
    typeof id === 'string' && ctx.people.some((p) => p.id === id);

  const accountId =
    paymentMethod === 'credit' || paymentMethod === 'person_debt'
      ? ''
      : accountExists(rawJson.accountId)
      ? (rawJson.accountId as string)
      : fallback.accountId || ctx.accounts.find((a) => a.currency === validCurrency)?.id || ctx.accounts[0]?.id || '';

  const toAccountId =
    validType === 'transfer'
      ? accountExists(rawJson.toAccountId) && rawJson.toAccountId !== accountId
        ? (rawJson.toAccountId as string)
        : fallback.toAccountId
      : '';

  const creditLineId =
    paymentMethod === 'credit'
      ? creditExists(rawJson.creditLineId)
        ? (rawJson.creditLineId as string)
        : fallback.creditLineId || ctx.creditLines[0]?.id || ''
      : '';

  const rawInst = Number(rawJson.installmentCount);
  const installmentCount =
    Number.isFinite(rawInst) && rawInst >= 1 && rawInst <= 36
      ? Math.round(rawInst)
      : fallback.installmentCount;

  const personId =
    paymentMethod === 'person_debt'
      ? personExists(rawJson.personId)
        ? (rawJson.personId as string)
        : fallback.personId || ctx.people[0]?.id || ''
      : '';

  const catRaw = typeof rawJson.categoryLabel === 'string' ? rawJson.categoryLabel.trim() : '';
  const categoryLabel = (EXPENSE_CATEGORIES as readonly string[]).includes(catRaw)
    ? catRaw
    : fallback.categoryLabel;

  const offset = Number(rawJson.dateOffsetDays);
  const date =
    Number.isFinite(offset) && offset <= 0 && offset >= -30
      ? toLocalIsoDate(new Date(Date.now() + Math.round(offset) * 86400000))
      : fallback.date;

  const note =
    typeof rawJson.note === 'string' && rawJson.note.trim().length > 0
      ? rawJson.note.trim()
      : fallback.note;

  return {
    type: validType,
    amount,
    currency: validCurrency,
    paymentMethod,
    accountId,
    toAccountId,
    creditLineId,
    installmentCount,
    personId,
    budgetCategoryId: fallback.budgetCategoryId,
    categoryLabel,
    date,
    note,
  };
}

export async function fetchLocalAiModels(
  config: Pick<LocalAiConfig, 'endpoint' | 'apiKey'>
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const endpoint = (config.endpoint || 'http://127.0.0.1:1337/v1').replace(/\/+$/, '');
  try {
    const res = await fetch('/api/local-ai/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, apiKey: config.apiKey ?? '' }),
    });
    if (res.ok) {
      const payload = (await res.json()) as { ok: boolean; models?: string[]; error?: string };
      if (payload.ok) {
        return { ok: true, models: payload.models ?? [] };
      }
      return { ok: false, models: [], error: payload.error };
    }
  } catch {
    // Fallback to direct browser call (e.g. standalone file:// HTML mode)
  }

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (config.apiKey?.trim()) {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const directRes = await fetch(`${endpoint}/models`, {
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!directRes.ok) {
      return { ok: false, models: [], error: `HTTP ${directRes.status}` };
    }
    const data = (await directRes.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    return { ok: true, models };
  } catch (err) {
    return { ok: false, models: [], error: (err as Error).message };
  }
}

export async function interpretQuickCommand(
  command: string,
  ctx: LocalAiContextInput,
  config?: LocalAiConfig
): Promise<LocalAiParseResult> {
  const effective: LocalAiConfig = config ?? {
    enabled: true,
    provider: 'jan',
    endpoint: 'http://127.0.0.1:1337/v1',
    model: 'gemma-4-E2B-it-Q4_K_M',
    apiKey: '',
  };

  if (!effective.enabled) {
    return {
      draft: parseCommandLocally(command, ctx),
      engine: 'offline_parser',
    };
  }

  const endpoint = (effective.endpoint || 'http://127.0.0.1:1337/v1').replace(/\/+$/, '');
  const { systemPrompt, userPrompt } = buildLocalAiPromptPayload(command, ctx);

  // 1. Try server-side proxy (/api/local-ai/parse) to bypass browser CORS
  try {
    const proxyRes = await fetch('/api/local-ai/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        model: effective.model,
        apiKey: effective.apiKey ?? '',
        systemPrompt,
        userPrompt,
      }),
    });

    if (proxyRes.ok) {
      const payload = (await proxyRes.json()) as {
        ok: boolean;
        rawText?: string;
        parsedJson?: Record<string, unknown> | null;
        modelUsed?: string;
        latencyMs?: number;
        error?: string;
      };
      if (payload.ok) {
        const json = payload.parsedJson ?? extractJsonFromLlmText(payload.rawText ?? '');
        if (json) {
          return {
            draft: reconcileLlmJsonWithFallback(json, command, ctx),
            engine: 'llm',
            modelUsed: payload.modelUsed || effective.model,
            latencyMs: payload.latencyMs,
          };
        }
      } else if (payload.error) {
        return {
          draft: parseCommandLocally(command, ctx),
          engine: 'offline_parser',
          warning: payload.error,
        };
      }
    }
  } catch {
    // Proxy unavailable (e.g. single-file mode) — fall through to direct browser fetch
  }

  // 2. Direct browser fallback (works when Jan has "Allow CORS" enabled)
  try {
    const started = performance.now();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effective.apiKey?.trim()) {
      headers.Authorization = `Bearer ${effective.apiKey.trim()}`;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const directRes = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: effective.model || 'gemma-4-E2B-it-Q4_K_M',
        temperature: 0.1,
        max_tokens: 420,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    }).finally(() => clearTimeout(timer));

    if (directRes.ok) {
      const data = (await directRes.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = data.choices?.[0]?.message?.content ?? '';
      const json = extractJsonFromLlmText(rawText);
      if (json) {
        return {
          draft: reconcileLlmJsonWithFallback(json, command, ctx),
          engine: 'llm',
          modelUsed: data.model || effective.model,
          latencyMs: Math.round(performance.now() - started),
        };
      }
    }
  } catch (err) {
    return {
      draft: parseCommandLocally(command, ctx),
      engine: 'offline_parser',
      warning: (err as Error).message,
    };
  }

  return {
    draft: parseCommandLocally(command, ctx),
    engine: 'offline_parser',
  };
}
