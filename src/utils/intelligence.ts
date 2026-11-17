import {
  BankAccount,
  EmotionTag,
  FixedExpense,
  FundTrackState,
  LoanItem,
  Mt5Account,
  PersonContact,
  PersonLedgerEntry,
  Trade,
} from '../types';
import {
  computePersonLedgers,
  computeTradingKpis,
  convertCurrency,
  isSameDay,
} from './domain';
import { addJalaliMonths, formatJalaliDate, getJalaliMonthBounds, toJalali } from './jalali';

/* ==========================================================================
   1. Trading Psychology & Setup Matrix + Click-to-Journal Matching
   ========================================================================== */

export interface EmotionStatRow {
  emotion: EmotionTag;
  trades: number;
  wins: number;
  winRate: number;
  netUsd: number;
  avgR: number;
  slCompliancePct: number;
}

export interface SetupStatRow {
  setupTag: string;
  trades: number;
  wins: number;
  winRate: number;
  netUsd: number;
  avgR: number;
  slCompliancePct: number;
}

export interface EmotionSetupMatrix {
  emotions: EmotionStatRow[];
  setups: SetupStatRow[];
  worstEmotion: EmotionStatRow | null;
  bestSetup: SetupStatRow | null;
}

export function computeEmotionSetupMatrix(trades: Trade[]): EmotionSetupMatrix {
  const emotionOrder: EmotionTag[] = ['calm', 'focused', 'hesitant', 'fomo', 'revenge'];
  const emoMap = new Map<EmotionTag, Trade[]>();
  emotionOrder.forEach((em) => emoMap.set(em, []));

  const setupMap = new Map<string, Trade[]>();

  for (const tr of trades) {
    const emList = emoMap.get(tr.emotionTag) ?? [];
    emList.push(tr);
    emoMap.set(tr.emotionTag, emList);

    const setupKey = (tr.setupTag || 'General').trim();
    const sList = setupMap.get(setupKey) ?? [];
    sList.push(tr);
    setupMap.set(setupKey, sList);
  }

  const emotions: EmotionStatRow[] = emotionOrder
    .map((emotion) => {
      const list = emoMap.get(emotion) ?? [];
      const n = list.length;
      if (n === 0) {
        return {
          emotion,
          trades: 0,
          wins: 0,
          winRate: 0,
          netUsd: 0,
          avgR: 0,
          slCompliancePct: 100,
        };
      }
      const wins = list.filter((t) => t.profitUsd > 0).length;
      const netUsd = Number(list.reduce((s, t) => s + t.profitUsd, 0).toFixed(2));
      const avgR = Number((list.reduce((s, t) => s + t.rMultiple, 0) / n).toFixed(2));
      const slCompliancePct = Math.round(
        (list.filter((t) => t.slRespected).length / n) * 100
      );
      return {
        emotion,
        trades: n,
        wins,
        winRate: Math.round((wins / n) * 100),
        netUsd,
        avgR,
        slCompliancePct,
      };
    })
    .filter((row) => row.trades > 0)
    .sort((a, b) => b.netUsd - a.netUsd);

  const setups: SetupStatRow[] = Array.from(setupMap.entries())
    .map(([setupTag, list]) => {
      const n = list.length;
      const wins = list.filter((t) => t.profitUsd > 0).length;
      const netUsd = Number(list.reduce((s, t) => s + t.profitUsd, 0).toFixed(2));
      const avgR = Number((list.reduce((s, t) => s + t.rMultiple, 0) / n).toFixed(2));
      const slCompliancePct = Math.round(
        (list.filter((t) => t.slRespected).length / n) * 100
      );
      return {
        setupTag,
        trades: n,
        wins,
        winRate: Math.round((wins / n) * 100),
        netUsd,
        avgR,
        slCompliancePct,
      };
    })
    .sort((a, b) => b.netUsd - a.netUsd);

  const worstEmotion =
    [...emotions].filter((e) => e.netUsd < 0).sort((a, b) => a.netUsd - b.netUsd)[0] ?? null;
  const bestSetup = setups.find((s) => s.netUsd > 0) ?? setups[0] ?? null;

  return { emotions, setups, worstEmotion, bestSetup };
}

export function getTradeDurationBucketLabel(tr: Trade): string {
  const mins = Math.max(
    1,
    Math.round((new Date(tr.closeTime).getTime() - new Date(tr.openTime).getTime()) / 60000)
  );
  if (mins < 15) return '< 15m';
  if (mins < 60) return '15-60m';
  if (mins < 240) return '1-4h';
  return '4h+';
}

export function getTradePersianWeekdayAndHour(tr: Trade): { weekday: number; hour: number } {
  const dt = new Date(tr.closeTime);
  const weekday = (dt.getDay() + 1) % 7; // 0 = Saturday .. 6 = Friday
  const hour = dt.getHours();
  return { weekday, hour };
}

/* ==========================================================================
   2. Daily Drawdown Circuit Breaker Guardrail
   ========================================================================== */

export interface DailyDrawdownStatus {
  totalEquityUsd: number;
  todayNetUsd: number;
  todayLossUsd: number;
  dailyMaxLossPct: number;
  limitUsd: number;
  usedPct: number;
  remainingBufferUsd: number;
  breached: boolean;
  warning: boolean;
  todayTradesCount: number;
}

export function computeDailyDrawdownStatus(
  trades: Trade[],
  mt5Accounts: Mt5Account[],
  dailyMaxLossPct = 3
): DailyDrawdownStatus {
  const now = new Date();
  const nonDemoActive = mt5Accounts.filter((a) => !a.isDemo && a.status === 'active');
  const nonDemoAll = mt5Accounts.filter((a) => !a.isDemo);
  const activeFallback = mt5Accounts.filter((a) => a.status === 'active');
  const pool =
    nonDemoActive.length > 0
      ? nonDemoActive
      : nonDemoAll.length > 0
      ? nonDemoAll
      : activeFallback.length > 0
      ? activeFallback
      : mt5Accounts;
  const totalEquityUsd = Math.max(
    100,
    Number(pool.reduce((s, a) => s + (a.equity || a.balance || 0), 0).toFixed(2))
  );
  const todayTrades = trades.filter((t) => isSameDay(new Date(t.closeTime), now));
  const todayNetUsd = Number(todayTrades.reduce((s, t) => s + t.profitUsd, 0).toFixed(2));
  const todayLossUsd = Math.max(0, Number((-todayNetUsd).toFixed(2)));
  const safeMaxPct = Math.max(0.5, Math.min(25, dailyMaxLossPct || 3));
  const limitUsd = Number(((totalEquityUsd * safeMaxPct) / 100).toFixed(2));
  const usedPct = limitUsd > 0 ? Math.min(200, Math.round((todayLossUsd / limitUsd) * 100)) : 0;
  const remainingBufferUsd = Math.max(0, Number((limitUsd - todayLossUsd).toFixed(2)));
  const breached = limitUsd > 0 && todayLossUsd >= limitUsd;
  const warning = !breached && usedPct >= 70;

  return {
    totalEquityUsd,
    todayNetUsd,
    todayLossUsd,
    dailyMaxLossPct: safeMaxPct,
    limitUsd,
    usedPct,
    remainingBufferUsd,
    breached,
    warning,
    todayTradesCount: todayTrades.length,
  };
}

/* ==========================================================================
   3. Pre-Trade Position Size & Risk/Reward Calculator
   ========================================================================== */

export type SymbolPresetId =
  | 'XAUUSD'
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'BTCUSD'
  | 'NAS100'
  | 'CUSTOM';

export const SYMBOL_CONTRACT_PRESETS: Record<
  SymbolPresetId,
  { label: string; usdPerUnitPerLot: number; defaultEntry: number; defaultSl: number; defaultTp: number }
> = {
  XAUUSD: { label: 'XAUUSD (Gold)', usdPerUnitPerLot: 100, defaultEntry: 2650, defaultSl: 2642, defaultTp: 2670 },
  EURUSD: { label: 'EURUSD', usdPerUnitPerLot: 100000, defaultEntry: 1.085, defaultSl: 1.0825, defaultTp: 1.091 },
  GBPUSD: { label: 'GBPUSD', usdPerUnitPerLot: 100000, defaultEntry: 1.272, defaultSl: 1.269, defaultTp: 1.279 },
  USDJPY: { label: 'USDJPY', usdPerUnitPerLot: 667, defaultEntry: 152.5, defaultSl: 152.0, defaultTp: 153.8 },
  BTCUSD: { label: 'BTCUSD', usdPerUnitPerLot: 1, defaultEntry: 88000, defaultSl: 86800, defaultTp: 91200 },
  NAS100: { label: 'NAS100', usdPerUnitPerLot: 1, defaultEntry: 20850, defaultSl: 20770, defaultTp: 21050 },
  CUSTOM: { label: 'Custom', usdPerUnitPerLot: 100, defaultEntry: 100, defaultSl: 98, defaultTp: 105 },
};

export interface PositionSizingInput {
  balanceUsd: number;
  riskPct: number;
  symbolPreset: SymbolPresetId;
  customUsdPerUnitPerLot?: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
}

export interface PositionSizingResult {
  isValid: boolean;
  errorFa?: string;
  errorEn?: string;
  direction: 'BUY' | 'SELL';
  riskAmountUsd: number;
  slDistance: number;
  tpDistance: number;
  rrRatio: number;
  recommendedLots: number;
  projectedRewardUsd: number;
  usdPerUnitPerLot: number;
}

export function computePositionSizing(input: PositionSizingInput): PositionSizingResult {
  const usdPerUnitPerLot =
    input.symbolPreset === 'CUSTOM'
      ? Math.max(0.01, input.customUsdPerUnitPerLot || 100)
      : SYMBOL_CONTRACT_PRESETS[input.symbolPreset].usdPerUnitPerLot;

  const balance = Math.max(0, input.balanceUsd);
  const riskPct = Math.max(0.1, Math.min(20, input.riskPct));
  const riskAmountUsd = Number(((balance * riskPct) / 100).toFixed(2));
  const slDistance = Math.abs(input.entryPrice - input.stopLoss);
  const tpDistance = Math.abs(input.takeProfit - input.entryPrice);
  const direction: 'BUY' | 'SELL' = input.stopLoss <= input.entryPrice ? 'BUY' : 'SELL';

  if (balance <= 0) {
    return {
      isValid: false,
      errorFa: 'موجودی حساب باید بزرگ‌تر از صفر باشد.',
      errorEn: 'Account balance must be greater than 0.',
      direction,
      riskAmountUsd: 0,
      slDistance: 0,
      tpDistance: 0,
      rrRatio: 0,
      recommendedLots: 0,
      projectedRewardUsd: 0,
      usdPerUnitPerLot,
    };
  }

  if (slDistance <= 0 || !Number.isFinite(slDistance)) {
    return {
      isValid: false,
      errorFa: 'قیمت ورود و حد ضرر نمی‌توانند یکسان باشند.',
      errorEn: 'Entry price and Stop Loss cannot be identical.',
      direction,
      riskAmountUsd,
      slDistance: 0,
      tpDistance,
      rrRatio: 0,
      recommendedLots: 0,
      projectedRewardUsd: 0,
      usdPerUnitPerLot,
    };
  }

  const tpAligned =
    direction === 'BUY' ? input.takeProfit >= input.entryPrice : input.takeProfit <= input.entryPrice;

  if (!tpAligned) {
    return {
      isValid: false,
      errorFa: 'جهت حد سود (TP) با جهت حد ضرر (SL) هم‌خوانی ندارد.',
      errorEn: 'Take Profit must sit on the opposite side of Entry from Stop Loss.',
      direction,
      riskAmountUsd,
      slDistance,
      tpDistance,
      rrRatio: 0,
      recommendedLots: 0,
      projectedRewardUsd: 0,
      usdPerUnitPerLot,
    };
  }

  const rawLots = riskAmountUsd / (slDistance * usdPerUnitPerLot);
  const recommendedLots = Number(Math.max(0.01, rawLots).toFixed(2));
  const rrRatio = Number((tpDistance / slDistance).toFixed(2));
  const projectedRewardUsd = Number((recommendedLots * tpDistance * usdPerUnitPerLot).toFixed(2));

  return {
    isValid: true,
    direction,
    riskAmountUsd,
    slDistance: Number(slDistance.toFixed(5)),
    tpDistance: Number(tpDistance.toFixed(5)),
    rrRatio,
    recommendedLots,
    projectedRewardUsd,
    usdPerUnitPerLot,
  };
}

/* ==========================================================================
   4. Broker CSV / MT5 History Importer
   ========================================================================== */

export interface CsvImportPreview {
  headers: string[];
  rows: Array<{ trade: Trade; isDuplicate: boolean }>;
  newTradesCount: number;
  duplicateCount: number;
  skippedCount: number;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseNumberLoose(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[$€,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateLoose(raw: string | undefined, fallbackOffsetMs = 0): string {
  if (!raw || !raw.trim()) return new Date(Date.now() + fallbackOffsetMs).toISOString();
  const normalized = raw.trim().replace(/\./g, '-').replace(' ', 'T');
  const dt = new Date(normalized);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  const dtRaw = new Date(raw.trim());
  if (!Number.isNaN(dtRaw.getTime())) return dtRaw.toISOString();
  return new Date(Date.now() + fallbackOffsetMs).toISOString();
}

export function parseTradesCsv(
  rawText: string,
  accountId: string,
  existingTickets: Set<string>
): CsvImportPreview {
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { headers: [], rows: [], newTradesCount: 0, duplicateCount: 0, skippedCount: 0 };
  }

  const first = lines[0];
  const delimiter =
    first.split(';').length > first.split(',').length
      ? ';'
      : first.split('\t').length > first.split(',').length
      ? '\t'
      : ',';

  const headers = splitCsvLine(first, delimiter);
  const lowerHeaders = headers.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));

  const findCol = (candidates: string[]) =>
    lowerHeaders.findIndex((h) => candidates.some((c) => h.includes(c)));

  const idxTicket = findCol(['ticket', 'order', 'deal', 'position', 'id']);
  const idxSymbol = findCol(['symbol', 'item', 'pair', 'instrument']);
  const idxDir = findCol(['direction', 'type', 'side', 'cmd', 'action']);
  const idxVol = findCol(['volume', 'lots', 'lot', 'size', 'qty']);
  const idxOpenTime = findCol(['opentime', 'open', 'entrytime']);
  const idxCloseTime = findCol(['closetime', 'close', 'exittime', 'time']);
  const idxOpenPrice = findCol(['openprice', 'entryprice', 'entry']);
  const idxClosePrice = findCol(['closeprice', 'exitprice', 'exit']);
  const idxSl = findCol(['sl', 'stoploss']);
  const idxTp = findCol(['tp', 'takeprofit']);
  const idxProfit = findCol(['profitusd', 'profit', 'pnl', 'net']);
  const idxComm = findCol(['commission', 'comm', 'fee']);
  const idxSwap = findCol(['swap']);
  const idxR = findCol(['rmultiple', 'rr']);
  const idxSetup = findCol(['setup', 'strategy', 'tag']);
  const idxNote = findCol(['note', 'comment', 'review']);

  const rows: Array<{ trade: Trade; isDuplicate: boolean }> = [];
  let skippedCount = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], delimiter);
    if (cols.length < 2) {
      skippedCount += 1;
      continue;
    }

    const symbol = (idxSymbol >= 0 ? cols[idxSymbol] : cols[1] || '').toUpperCase();
    if (!symbol || symbol === 'BALANCE' || symbol === 'DEPOSIT') {
      skippedCount += 1;
      continue;
    }

    const dirRaw = (idxDir >= 0 ? cols[idxDir] : 'BUY').toUpperCase();
    if (dirRaw.includes('BALANCE') || dirRaw.includes('CREDIT')) {
      skippedCount += 1;
      continue;
    }
    const direction: 'BUY' | 'SELL' =
      dirRaw.includes('SELL') || dirRaw.includes('SHORT') ? 'SELL' : 'BUY';

    const ticket =
      (idxTicket >= 0 && cols[idxTicket] ? cols[idxTicket] : `CSV${100000 + i}`).replace('#', '');
    const volume = Math.max(0.01, parseNumberLoose(idxVol >= 0 ? cols[idxVol] : '0.1') || 0.1);
    const profitUsd = Number(parseNumberLoose(idxProfit >= 0 ? cols[idxProfit] : '0').toFixed(2));
    const commissionUsd = Number(parseNumberLoose(idxComm >= 0 ? cols[idxComm] : '0').toFixed(2));
    const swapUsd = Number(parseNumberLoose(idxSwap >= 0 ? cols[idxSwap] : '0').toFixed(2));
    const openPrice = parseNumberLoose(idxOpenPrice >= 0 ? cols[idxOpenPrice] : '0');
    const closePrice = parseNumberLoose(idxClosePrice >= 0 ? cols[idxClosePrice] : '0');
    const sl = parseNumberLoose(idxSl >= 0 ? cols[idxSl] : '0');
    const tp = parseNumberLoose(idxTp >= 0 ? cols[idxTp] : '0');
    const closeTime = parseDateLoose(idxCloseTime >= 0 ? cols[idxCloseTime] : undefined);
    const openTime = parseDateLoose(
      idxOpenTime >= 0 ? cols[idxOpenTime] : undefined,
      -3600000
    );

    const riskGuess = Math.max(25, volume * 300);
    const rMultiple =
      idxR >= 0 && cols[idxR]
        ? Number(parseNumberLoose(cols[idxR]).toFixed(2))
        : Number((profitUsd / riskGuess).toFixed(2));

    const closeHour = new Date(closeTime).getHours();
    const session: Trade['session'] =
      closeHour >= 10 && closeHour < 16
        ? 'London'
        : closeHour >= 16 && closeHour < 23
        ? 'New York'
        : 'Asia';

    const trade: Trade = {
      id: `tr_csv_${ticket}_${i}_${Date.now().toString(36)}`,
      ticket,
      accountId,
      symbol,
      direction,
      volume,
      openTime,
      closeTime,
      openPrice,
      closePrice,
      sl,
      tp,
      slRespected: sl > 0 || profitUsd >= -riskGuess * 1.2,
      profitUsd,
      commissionUsd,
      swapUsd,
      rMultiple,
      session,
      setupTag: (idxSetup >= 0 && cols[idxSetup]) || 'CSV Import',
      emotionTag: 'calm',
      reviewNote: (idxNote >= 0 && cols[idxNote]) || '',
    };

    rows.push({
      trade,
      isDuplicate: existingTickets.has(ticket),
    });
  }

  const newTradesCount = rows.filter((r) => !r.isDuplicate).length;
  const duplicateCount = rows.filter((r) => r.isDuplicate).length;

  return {
    headers,
    rows,
    newTradesCount,
    duplicateCount,
    skippedCount,
  };
}

/* ==========================================================================
   5. 30-Day Cashflow Runway & Bill-Collision Forecast
   ========================================================================== */

export interface CashflowEventMarker {
  title: string;
  amountIrt: number; // positive = inflow, negative = outflow
  kind: 'bill' | 'loan' | 'income' | 'overdue';
}

export interface CashflowDayPoint {
  dayIndex: number;
  isoDate: string;
  jalaliLabel: string;
  runningBalanceIrt: number;
  netDeltaIrt: number;
  events: CashflowEventMarker[];
  isCollision: boolean;
}

export interface CashflowRunwayReport {
  startingBalanceIrt: number;
  endingBalanceIrt: number;
  lowestBalanceIrt: number;
  lowestDayLabel: string;
  totalScheduledOutflowIrt: number;
  totalExpectedInflowIrt: number;
  collisionDays: CashflowDayPoint[];
  points: CashflowDayPoint[];
}

export function computeCashflowRunway30d(
  bankAccounts: BankAccount[],
  fixedExpenses: FixedExpense[],
  loans: LoanItem[],
  usdToman: number,
  expectedMonthlyIncomeIrt = 0
): CashflowRunwayReport {
  const startingBalanceIrt = Math.round(
    bankAccounts.reduce(
      (sum, acc) => sum + convertCurrency(acc.balance, acc.currency, 'IRT', usdToman),
      0
    )
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueLoans = loans.filter((l) => {
    if (l.status !== 'open' || l.kind === 'receivable') return false;
    const due = new Date(l.dueDate);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  });

  let running = startingBalanceIrt;
  let lowestBalanceIrt = startingBalanceIrt;
  let lowestDayLabel = formatJalaliDate(today, 'fa');
  let totalScheduledOutflowIrt = 0;
  let totalExpectedInflowIrt = 0;

  const points: CashflowDayPoint[] = [];

  for (let i = 0; i < 30; i += 1) {
    const dt = new Date(today);
    dt.setDate(today.getDate() + i);
    const isoDate = dt.toISOString().slice(0, 10);
    const jalali = toJalali(dt);
    const jalaliLabel = `${jalali.jm}/${String(jalali.jd).padStart(2, '0')}`;
    const events: CashflowEventMarker[] = [];

    // Apply overdue installments on Day 1
    if (i === 1 && overdueLoans.length > 0) {
      for (const ol of overdueLoans) {
        const amtIrt = Math.round(convertCurrency(ol.installmentAmount, ol.currency, 'IRT', usdToman));
        events.push({
          title: ol.title,
          amountIrt: -amtIrt,
          kind: 'overdue',
        });
      }
    }

    // Apply open loans & credit installments due on this calendar date
    for (const loan of loans) {
      if (loan.status !== 'open' || loan.kind === 'receivable') continue;
      if (loan.dueDate.slice(0, 10) === isoDate && i > 0) {
        const amtIrt = Math.round(convertCurrency(loan.installmentAmount, loan.currency, 'IRT', usdToman));
        events.push({
          title: loan.creditLineId ? `قسط اعتبار: ${loan.title}` : loan.title,
          amountIrt: -amtIrt,
          kind: 'loan',
        });
      }
    }

    // Apply recurring fixed bills on matching Jalali day (days 1..29 ahead)
    if (i > 0) {
      for (const fe of fixedExpenses) {
        if (!fe.active || !fe.recurringMonthly) continue;
        if (fe.dayOfMonth === jalali.jd) {
          const amtIrt = Math.round(convertCurrency(fe.amount, fe.currency, 'IRT', usdToman));
          events.push({
            title: fe.title,
            amountIrt: -amtIrt,
            kind: 'bill',
          });
        }
      }
    }

    // Expected salary/payout on the 1st of the Jalali month (if > 0)
    if (i > 0 && expectedMonthlyIncomeIrt > 0 && jalali.jd === 1) {
      events.push({
        title: 'درآمد / برداشت ماهانه پیش‌بینی‌شده',
        amountIrt: Math.round(expectedMonthlyIncomeIrt),
        kind: 'income',
      });
    }

    const netDeltaIrt = events.reduce((s, e) => s + e.amountIrt, 0);
    events.forEach((e) => {
      if (e.amountIrt < 0) totalScheduledOutflowIrt += Math.abs(e.amountIrt);
      else totalExpectedInflowIrt += e.amountIrt;
    });

    running += netDeltaIrt;
    if (running < lowestBalanceIrt) {
      lowestBalanceIrt = running;
      lowestDayLabel = jalaliLabel;
    }

    points.push({
      dayIndex: i,
      isoDate,
      jalaliLabel,
      runningBalanceIrt: running,
      netDeltaIrt,
      events,
      isCollision: running < 0,
    });
  }

  return {
    startingBalanceIrt,
    endingBalanceIrt: running,
    lowestBalanceIrt,
    lowestDayLabel,
    totalScheduledOutflowIrt,
    totalExpectedInflowIrt,
    collisionDays: points.filter((p) => p.isCollision),
    points,
  };
}

/* ==========================================================================
   6. Interactive Debt Payoff "What-If" Simulator
   ========================================================================== */

export interface DebtWhatIfResult {
  totalDebtIrt: number;
  baselineMonths: number;
  acceleratedMonths: number;
  monthsSaved: number;
  baselineDebtFreeIso: string;
  acceleratedDebtFreeIso: string;
  monthlyMinimumIrt: number;
  monthlyAcceleratedBudgetIrt: number;
  timelineComparison: Array<{
    month: number;
    baselineRemainingIrt: number;
    acceleratedRemainingIrt: number;
  }>;
}

function runPayoffSimulation(
  initialItems: Array<{ id: string; remainingIrt: number; minMonthlyIrt: number; priorityRate: number }>,
  strategy: 'avalanche' | 'snowball',
  extraMonthlyIrt: number
): { months: number; series: number[] } {
  const items = initialItems.map((i) => ({ ...i }));
  if (items.length === 0) return { months: 0, series: [0] };

  const baseMonthlyPool =
    items.reduce((s, i) => s + i.minMonthlyIrt, 0) + Math.max(0, extraMonthlyIrt);
  const series: number[] = [Math.round(items.reduce((s, i) => s + i.remainingIrt, 0))];
  let months = 0;

  while (items.some((i) => i.remainingIrt > 100) && months < 120) {
    months += 1;
    let pool = baseMonthlyPool;

    // 1. Pay minimum installments first
    for (const item of items) {
      if (item.remainingIrt <= 0) continue;
      const pay = Math.min(item.remainingIrt, item.minMonthlyIrt, pool);
      item.remainingIrt -= pay;
      pool -= pay;
    }

    // 2. Roll leftover pool into #1 priority active debt
    const active = items.filter((i) => i.remainingIrt > 0);
    active.sort((a, b) =>
      strategy === 'avalanche'
        ? b.priorityRate - a.priorityRate
        : a.remainingIrt - b.remainingIrt
    );

    for (const target of active) {
      if (pool <= 0) break;
      const extraPay = Math.min(target.remainingIrt, pool);
      target.remainingIrt -= extraPay;
      pool -= extraPay;
    }

    series.push(Math.round(items.reduce((s, i) => s + Math.max(0, i.remainingIrt), 0)));
  }

  return { months, series };
}

export function computeDebtWhatIfSimulation(
  loans: LoanItem[],
  people: PersonContact[],
  personEntries: PersonLedgerEntry[],
  strategy: 'avalanche' | 'snowball',
  usdToman: number,
  extraMonthlyIrt: number
): DebtWhatIfResult {
  const openLoans = loans.filter((l) => l.status === 'open' && l.kind !== 'receivable');
  const loanItems = openLoans.map((l) => {
    const remInstallments = Math.max(1, l.totalInstallments - l.paidInstallments);
    const installmentIrt = Math.round(convertCurrency(l.installmentAmount, l.currency, 'IRT', usdToman));
    return {
      id: l.id,
      remainingIrt: installmentIrt * remInstallments,
      minMonthlyIrt: Math.max(100000, installmentIrt),
      priorityRate: l.priorityRate,
    };
  });

  const peopleOverview = computePersonLedgers(people, personEntries, usdToman);
  const personalPayables = peopleOverview.ledgers
    .filter((l) => l.status === 'payable')
    .map((l) => {
      const amt = Math.abs(l.netBalanceIrt);
      return {
        id: `person_${l.person.id}`,
        remainingIrt: amt,
        minMonthlyIrt: Math.min(amt, Math.max(1000000, Math.round(amt * 0.25))),
        priorityRate: 25,
      };
    });

  const combined = [...loanItems, ...personalPayables];
  const totalDebtIrt = Math.round(combined.reduce((s, i) => s + i.remainingIrt, 0));
  const monthlyMinimumIrt = Math.round(combined.reduce((s, i) => s + i.minMonthlyIrt, 0));

  const baseline = runPayoffSimulation(combined, strategy, 0);
  const accelerated = runPayoffSimulation(combined, strategy, extraMonthlyIrt);

  const now = new Date();
  const baseDt = addJalaliMonths(now, baseline.months);
  const accDt = addJalaliMonths(now, accelerated.months);

  const maxLen = Math.max(baseline.series.length, accelerated.series.length);
  const timelineComparison = Array.from({ length: maxLen }, (_, idx) => ({
    month: idx,
    baselineRemainingIrt: baseline.series[idx] ?? 0,
    acceleratedRemainingIrt: accelerated.series[idx] ?? 0,
  }));

  return {
    totalDebtIrt,
    baselineMonths: baseline.months,
    acceleratedMonths: accelerated.months,
    monthsSaved: Math.max(0, baseline.months - accelerated.months),
    baselineDebtFreeIso: baseDt.toISOString(),
    acceleratedDebtFreeIso: accDt.toISOString(),
    monthlyMinimumIrt,
    monthlyAcceleratedBudgetIrt: monthlyMinimumIrt + Math.max(0, extraMonthlyIrt),
    timelineComparison,
  };
}

/* ==========================================================================
   7. Weekly / Monthly Executive Digest Report
   ========================================================================== */

export interface SessionDigestStat {
  session: 'London' | 'New York' | 'Asia';
  trades: number;
  winRatePct: number;
  netUsd: number;
  avgR: number;
}

export interface PeriodDigestReport {
  period: 'week' | 'month';
  tradeCount: number;
  netTradingUsd: number;
  prevNetTradingUsd: number;
  winRatePct: number;
  expectancyUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  payoffRatio: number;
  maxDrawdownUsd: number;
  slCompliancePct: number;
  avgR: number;
  profitFactor: number;
  bestSession: SessionDigestStat | null;
  worstSession: SessionDigestStat | null;
  bestSetup: SetupStatRow | null;
  worstEmotion: EmotionStatRow | null;
  totalIncomeIrt: number;
  totalExpenseIrt: number;
  debtPaidIrt: number;
  savingsRatePct: number;
  activeGoalsCount: number;
  avgGoalProgressPct: number;
  insightFa: string;
  insightEn: string;
}

export function computePeriodDigest(
  state: FundTrackState,
  period: 'week' | 'month'
): PeriodDigestReport {
  const days = period === 'week' ? 7 : 30;
  const nowMs = Date.now();
  const curStartMs = nowMs - days * 86400000;
  const prevStartMs = curStartMs - days * 86400000;
  const usdToman = state.settings.usdToman || 69500;

  const periodTrades = state.trades.filter((tr) => new Date(tr.closeTime).getTime() >= curStartMs);
  const prevTrades = state.trades.filter((tr) => {
    const ms = new Date(tr.closeTime).getTime();
    return ms >= prevStartMs && ms < curStartMs;
  });

  const kpis = computeTradingKpis(periodTrades);
  const prevKpis = computeTradingKpis(prevTrades);
  const psych = computeEmotionSetupMatrix(periodTrades);

  const sessionRows: SessionDigestStat[] = (['London', 'New York', 'Asia'] as const)
    .map((session) => {
      const grp = periodTrades.filter((tr) => tr.session === session);
      const wins = grp.filter((tr) => tr.profitUsd > 0).length;
      const netUsd = Number(grp.reduce((s, tr) => s + tr.profitUsd, 0).toFixed(2));
      const avgR = grp.length > 0 ? Number((grp.reduce((s, tr) => s + tr.rMultiple, 0) / grp.length).toFixed(2)) : 0;
      return {
        session,
        trades: grp.length,
        winRatePct: grp.length > 0 ? Math.round((wins / grp.length) * 100) : 0,
        netUsd,
        avgR,
      };
    })
    .filter((s) => s.trades > 0)
    .sort((a, b) => b.netUsd - a.netUsd);

  const bestSession = sessionRows[0] ?? null;
  const worstSession =
    sessionRows.length > 1 && sessionRows[sessionRows.length - 1].netUsd < 0
      ? sessionRows[sessionRows.length - 1]
      : null;

  const payoffRatio =
    kpis.avgLossUsd > 0 ? Number((kpis.avgWinUsd / kpis.avgLossUsd).toFixed(2)) : kpis.avgWinUsd > 0 ? 9.99 : 0;

  const financeStartMs =
    period === 'month' ? getJalaliMonthBounds(new Date()).start.getTime() : curStartMs;
  const periodTx = state.transactions.filter((tx) => new Date(tx.date).getTime() >= financeStartMs);
  const totalIncomeIrt = Math.round(
    periodTx
      .filter((tx) => tx.type === 'in')
      .reduce((s, tx) => s + convertCurrency(tx.amount, tx.currency, 'IRT', usdToman), 0)
  );
  const totalExpenseIrt = Math.round(
    periodTx
      .filter((tx) => tx.type === 'out')
      .reduce((s, tx) => s + convertCurrency(tx.amount, tx.currency, 'IRT', usdToman), 0)
  );
  const debtPaidIrt = Math.round(
    periodTx
      .filter(
        (tx) =>
          tx.type === 'out' &&
          (tx.source === 'loan_installment' ||
            tx.source === 'credit_installment' ||
            tx.source === 'person_ledger')
      )
      .reduce((s, tx) => s + convertCurrency(tx.amount, tx.currency, 'IRT', usdToman), 0)
  );

  const savingsRatePct =
    totalIncomeIrt > 0
      ? Math.max(-100, Math.round(((totalIncomeIrt - totalExpenseIrt) / totalIncomeIrt) * 100))
      : 0;

  const activeGoals = state.goals.filter((g) => g.status === 'active');
  const avgGoalProgressPct =
    activeGoals.length > 0
      ? Math.round(
          activeGoals.reduce(
            (s, g) => s + Math.min(100, (g.savedAmount / Math.max(1, g.targetAmount)) * 100),
            0
          ) / activeGoals.length
        )
      : 0;

  let insightFa = 'عملکرد دوره متعادل است؛ مدیریت ریسک هر معامله و تخصیص بدهی‌پایه در جریان است.';
  let insightEn = 'Period performance is steady; per-trade risk control and Debt-First capital allocation remain active.';

  if (periodTrades.length === 0) {
    insightFa = 'در این بازه معامله‌ای از MT5 ثبت نشده است؛ با همگام‌سازی فایل رویداد اکسپرت، تحلیل دوره به‌روز می‌شود.';
    insightEn = 'No MT5 trades recorded in this window yet; sync your EA event file to populate live period analytics.';
  } else if (kpis.profitFactor < 1 && worstSession) {
    insightFa = `ضریب سود دوره (${kpis.profitFactor}) منفی است؛ بیشترین افت در سشن ${worstSession.session} با زیان $${Math.abs(
      worstSession.netUsd
    )} رخ داده است.`;
    insightEn = `Period Profit Factor (${kpis.profitFactor}) is below 1.0; heaviest drawdown occurred in ${worstSession.session} (-$${Math.abs(
      worstSession.netUsd
    )}).`;
  } else if (bestSession && kpis.netProfitUsd >= 0) {
    insightFa = `سشن ${bestSession.session} با نرخ برد ${bestSession.winRatePct}٪ و خالص +$${bestSession.netUsd}، برترین بازده دوره را ایجاد کرده (PF ${kpis.profitFactor}).`;
    insightEn = `${bestSession.session} led your period edge (${bestSession.winRatePct}% win rate, +$${bestSession.netUsd} net, PF ${kpis.profitFactor}).`;
  }

  return {
    period,
    tradeCount: kpis.tradeCount,
    netTradingUsd: kpis.netProfitUsd,
    prevNetTradingUsd: prevKpis.netProfitUsd,
    winRatePct: kpis.winRate,
    expectancyUsd: kpis.expectancyUsd,
    avgWinUsd: kpis.avgWinUsd,
    avgLossUsd: kpis.avgLossUsd,
    payoffRatio,
    maxDrawdownUsd: kpis.maxDrawdownUsd,
    slCompliancePct: kpis.slCompliancePct,
    avgR: kpis.avgR,
    profitFactor: kpis.profitFactor,
    bestSession,
    worstSession,
    bestSetup: psych.bestSetup,
    worstEmotion: psych.worstEmotion,
    totalIncomeIrt,
    totalExpenseIrt,
    debtPaidIrt,
    savingsRatePct,
    activeGoalsCount: activeGoals.length,
    avgGoalProgressPct,
    insightFa,
    insightEn,
  };
}
