import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Calendar,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  AppLanguage,
  BankAccount,
  BankAccountType,
  CreditLine,
  CreditProvider,
  CurrencyCode,
  FinanceSubTab,
  FundTrackState,
  LoanItem,
  LoanKind,
  PaymentMethod,
  PersianCalendarHoliday,
  PersonContact,
  PersonLedgerDirection,
  PersonLedgerEntry,
  PersonRole,
  Transaction,
  TransactionType,
} from '../types';
import {
  computeDebtPayoffPlan,
  computeFinanceSummary,
  computePersonLedgers,
  computeUpcomingObligations,
  convertCurrency,
  formatMoney,
} from '../utils/domain';
import {
  formatJalaliDate,
  formatJalaliDateTime,
  getJalaliMonthLength,
  getJalaliMonthName,
  getJalaliWeekdayIndex,
  toJalali,
  toLocalIsoDate,
} from '../utils/jalali';
import { t } from '../i18n/translations';
import {
  CashflowRunwayChart,
  HorizontalCompareBars,
  RadialGauge,
  StripedProgressBar,
} from './Charts';
import {
  computeCashflowRunway30d,
  computeDebtWhatIfSimulation,
} from '../utils/intelligence';
import { GlassSelect, GlassSwitch } from './GlassControls';
import { MaterialInput } from './MaterialInputs';
import { JalaliDatePicker } from './JalaliDatePicker';
import {
  M3AccordionCard,
  M3CarouselItem,
  M3SnapCarousel,
  ResponsiveModalSheet,
} from './M3MobilePrimitives';

interface FinanceViewProps {
  state: FundTrackState;
  subTab: FinanceSubTab;
  setSubTab: (tab: FinanceSubTab) => void;
  onAddOrUpdateTransaction: (tx: Omit<Transaction, 'id'>, editId?: string) => void;
  onDeleteTransaction: (id: string) => void;
  onAddOrUpdateBankAccount: (acc: Omit<BankAccount, 'id'>, editId?: string) => void;
  onDeleteBankAccount: (id: string) => void;
  onAddOrUpdateCreditLine: (line: Omit<CreditLine, 'id'>, editId?: string) => void;
  onDeleteCreditLine: (id: string) => void;
  onAddOrUpdatePerson: (person: Omit<PersonContact, 'id' | 'createdAt'>, editId?: string) => void;
  onDeletePerson: (id: string) => void;
  onAddPersonEntry: (entry: Omit<PersonLedgerEntry, 'id' | 'linkedTransactionId'>) => void;
  onDeletePersonEntry: (id: string) => void;
  onAddBudgetCap: (
    categoryName: string,
    sourceAccountId: string,
    percentOfBalance: number,
    rolloverUnused: boolean
  ) => void;
  onAddFixedExpense: (
    title: string,
    amount: number,
    currency: CurrencyCode,
    recurringMonthly: boolean,
    dayOfMonth: number,
    categoryId?: string
  ) => void;
  onRunMonthlySync: () => void;
  onAddLoan: (loan: Omit<LoanItem, 'id' | 'paidInstallments' | 'status'>) => void;
  onPayLoanInstallment: (loanId: string, accountId: string) => void;
  onPayTopPriorityDebt?: (accountId: string) => void;
  onRefreshFxRate: (force: boolean) => void;
  onUpdateSettings: (patch: Partial<FundTrackState['settings']>) => void;
  onConfirmBudgetDay: () => void;
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  state,
  subTab,
  setSubTab,
  onAddOrUpdateTransaction,
  onDeleteTransaction,
  onAddOrUpdateBankAccount,
  onDeleteBankAccount,
  onAddOrUpdateCreditLine,
  onDeleteCreditLine,
  onAddOrUpdatePerson,
  onDeletePerson,
  onAddPersonEntry,
  onDeletePersonEntry,
  onAddBudgetCap,
  onAddFixedExpense,
  onRunMonthlySync,
  onAddLoan,
  onPayLoanInstallment,
  onPayTopPriorityDebt,
  onRefreshFxRate,
  onUpdateSettings,
  onConfirmBudgetDay,
  onShowToast,
}) => {
  const lang: AppLanguage = state.settings.language;
  const usdToman = state.settings.usdToman;
  const isPrivate = Boolean(state.settings.privateMode);
  const summary = useMemo(
    () =>
      computeFinanceSummary(
        state.bankAccounts,
        state.mt5Accounts,
        state.transactions,
        state.fixedExpenses,
        state.budgetCaps,
        state.loans,
        state.goals,
        usdToman,
        state.people ?? [],
        state.personEntries ?? [],
        state.creditLines ?? []
      ),
    [state, usdToman]
  );
  const upcomingObligations = useMemo(
    () =>
      computeUpcomingObligations(
        state.fixedExpenses,
        state.loans,
        state.creditLines ?? [],
        state.people ?? [],
        state.personEntries ?? [],
        usdToman
      ),
    [state.fixedExpenses, state.loans, state.creditLines, state.people, state.personEntries, usdToman]
  );
  const peopleOverview = useMemo(
    () => computePersonLedgers(state.people ?? [], state.personEntries ?? [], usdToman),
    [state.people, state.personEntries, usdToman]
  );

  // Transaction filter & modal
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | TransactionType>('all');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | undefined>(undefined);
  const [txType, setTxType] = useState<TransactionType>('out');
  const [txPaymentMethod, setTxPaymentMethod] = useState<PaymentMethod>('bank');
  const [txCreditLineId, setTxCreditLineId] = useState(state.creditLines?.[0]?.id ?? '');
  const [txInstallments, setTxInstallments] = useState('4');
  const [txPersonId, setTxPersonId] = useState(state.people?.[0]?.id ?? '');
  const [txCategoryLabel, setTxCategoryLabel] = useState('خوراک و کافه');
  const [txAmount, setTxAmount] = useState('');
  const [txCurrency, setTxCurrency] = useState<CurrencyCode>('IRT');
  const [txAccountId, setTxAccountId] = useState(state.bankAccounts[0]?.id ?? '');
  const [txToAccountId, setTxToAccountId] = useState(state.bankAccounts[1]?.id ?? '');
  const [txBudgetId, setTxBudgetId] = useState('');
  const [txDate, setTxDate] = useState(toLocalIsoDate(new Date()));
  const [txNote, setTxNote] = useState('');

  // Unified Bank Account & Credit Line modal state
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [accModalMode, setAccModalMode] = useState<'bank_wallet' | 'credit'>('bank_wallet');
  const [editingAccId, setEditingAccId] = useState<string | undefined>(undefined);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<BankAccountType>('bank');
  const [accCurrency, setAccCurrency] = useState<CurrencyCode>('IRT');
  const [accBalance, setAccBalance] = useState('');
  const [accNote, setAccNote] = useState('');
  const [historyAccount, setHistoryAccount] = useState<BankAccount | null>(null);

  // Credit Line fields inside unified modal
  const [editingCreditId, setEditingCreditId] = useState<string | undefined>(undefined);
  const [crTitle, setCrTitle] = useState('');
  const [crProvider, setCrProvider] = useState<CreditProvider>('digipay');
  const [crLimit, setCrLimit] = useState('');
  const [crCurrency, setCrCurrency] = useState<CurrencyCode>('IRT');
  const [crDefaultInst, setCrDefaultInst] = useState('4');
  const [crDueDay, setCrDueDay] = useState('5');
  const [crNote, setCrNote] = useState('');
  const [crActive, setCrActive] = useState(true);

  // People & Counterparty Ledgers state
  const [selectedPersonId, setSelectedPersonId] = useState<string>(
    () => state.people?.[0]?.id ?? ''
  );
  const [personSearch, setPersonSearch] = useState('');
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | undefined>(undefined);
  const [pName, setPName] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pRole, setPRole] = useState<PersonRole>('partner');
  const [pNote, setPNote] = useState('');

  const [personEntryModalOpen, setPersonEntryModalOpen] = useState(false);
  const [pePersonId, setPePersonId] = useState('');
  const [peDirection, setPeDirection] = useState<PersonLedgerDirection>('give');
  const [peAmount, setPeAmount] = useState('');
  const [peCurrency, setPeCurrency] = useState<CurrencyCode>('IRT');
  const [peAccountId, setPeAccountId] = useState<string>(state.bankAccounts[0]?.id ?? '');
  const [peDate, setPeDate] = useState(new Date().toISOString().slice(0, 10));
  const [peNote, setPeNote] = useState('');

  // Planning modals (Budget / Fixed Expense / Loan / Pay Installment)
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [bName, setBName] = useState('');
  const [bAccountId, setBAccountId] = useState(state.bankAccounts[0]?.id ?? '');
  const [bPercent, setBPercent] = useState('10');
  const [bRollover, setBRollover] = useState(true);

  const [feModalOpen, setFeModalOpen] = useState(false);
  const [feTitle, setFeTitle] = useState('');
  const [feAmount, setFeAmount] = useState('');
  const [feCurrency, setFeCurrency] = useState<CurrencyCode>('IRT');
  const [feRecurring, setFeRecurring] = useState(true);
  const [feDay, setFeDay] = useState('1');
  const [feCategoryId, setFeCategoryId] = useState('');

  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [lKind, setLKind] = useState<LoanKind>('loan');
  const [lTitle, setLTitle] = useState('');
  const [lTotalAmount, setLTotalAmount] = useState('');
  const [lCurrency, setLCurrency] = useState<CurrencyCode>('IRT');
  const [lPeriod, setLPeriod] = useState('ماهانه');
  const [lDueDate, setLDueDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [lInstallments, setLInstallments] = useState('12');
  const [lInstallmentAmount, setLInstallmentAmount] = useState('');
  const [lPriorityRate, setLPriorityRate] = useState('18');

  const [payoffStrategy, setPayoffStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const payoffPlan = useMemo(
    () =>
      computeDebtPayoffPlan(
        state.loans,
        payoffStrategy,
        usdToman,
        state.people ?? [],
        state.personEntries ?? []
      ),
    [state.loans, payoffStrategy, usdToman, state.people, state.personEntries]
  );

  const [payingLoan, setPayingLoan] = useState<LoanItem | null>(null);
  const [payAccountId, setPayAccountId] = useState(state.bankAccounts[0]?.id ?? '');
  const [priorityPayModalOpen, setPriorityPayModalOpen] = useState(false);
  const [priorityPayAccId, setPriorityPayAccId] = useState(state.bankAccounts[0]?.id ?? '');
  const [extraMonthlyDebtIrt, setExtraMonthlyDebtIrt] = useState<number>(5000000);

  const cashflowRunway = useMemo(
    () =>
      computeCashflowRunway30d(
        state.bankAccounts,
        state.fixedExpenses,
        state.loans,
        usdToman,
        state.settings.monthlyExpectedIncomeIrt ?? 0
      ),
    [
      state.bankAccounts,
      state.fixedExpenses,
      state.loans,
      usdToman,
      state.settings.monthlyExpectedIncomeIrt,
    ]
  );

  const debtWhatIf = useMemo(
    () =>
      computeDebtWhatIfSimulation(
        state.loans,
        state.people ?? [],
        state.personEntries ?? [],
        payoffStrategy,
        usdToman,
        extraMonthlyDebtIrt
      ),
    [
      state.loans,
      state.people,
      state.personEntries,
      payoffStrategy,
      usdToman,
      extraMonthlyDebtIrt,
    ]
  );

  // Persian Calendar State
  const todayJalali = toJalali(new Date());
  const [calYear, setCalYear] = useState(todayJalali.jy);
  const [calMonth, setCalMonth] = useState(todayJalali.jm);
  const [selectedCalDay, setSelectedCalDay] = useState(todayJalali.jd);
  const [calHolidays, setCalHolidays] = useState<PersianCalendarHoliday[]>([]);

  useEffect(() => {
    let active = true;
    fetch(`/api/persian-calendar/holidays/${calYear}`)
      .then((res) => res.json())
      .then((payload) => {
        if (!active) return;
        const arr = Array.isArray(payload.holidays) ? payload.holidays : [];
        setCalHolidays(arr);
      })
      .catch(() => {
        // Silent fallback handled by local Jalali
      });
    return () => {
      active = false;
    };
  }, [calYear]);

  // Budget warning preview inside Transaction Modal
  const selectedBudgetPreview = useMemo(() => {
    if (txType !== 'out' || !txBudgetId) return null;
    const status = summary.budgetStatuses.find((b) => b.budget.id === txBudgetId);
    if (!status) return null;
    const amt = Number(txAmount) || 0;
    const amtInBudgetCurrency = convertCurrency(amt, txCurrency, status.currency, usdToman);
    const projectedSpent = status.spentAmount + amtInBudgetCurrency;
    const projectedPct =
      status.capAmount > 0 ? Math.round((projectedSpent / status.capAmount) * 100) : 0;
    return { status, projectedPct };
  }, [txType, txBudgetId, txAmount, txCurrency, summary.budgetStatuses, usdToman]);

  const filteredTransactions = useMemo(() => {
    return state.transactions
      .filter((tx) => txTypeFilter === 'all' || tx.type === txTypeFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.transactions, txTypeFilter]);

  const openNewTransaction = (preset?: {
    type?: TransactionType;
    paymentMethod?: PaymentMethod;
    creditLineId?: string;
  }) => {
    const pm = preset?.paymentMethod ?? 'bank';
    const credId = preset?.creditLineId ?? state.creditLines?.[0]?.id ?? '';
    const cred = (state.creditLines ?? []).find((c) => c.id === credId);
    setEditingTxId(undefined);
    setTxType(preset?.type ?? 'out');
    setTxPaymentMethod(pm);
    setTxCreditLineId(credId);
    setTxInstallments(String(cred?.defaultInstallments ?? 4));
    setTxPersonId(state.people?.[0]?.id ?? '');
    setTxCategoryLabel(pm === 'credit' ? 'خرید کالا' : 'خوراک و کافه');
    setTxAmount('');
    setTxCurrency(pm === 'usd' ? 'USD' : cred?.currency ?? 'IRT');
    setTxAccountId(state.bankAccounts[0]?.id ?? '');
    setTxToAccountId(state.bankAccounts[1]?.id ?? '');
    setTxBudgetId('');
    setTxDate(toLocalIsoDate(new Date()));
    setTxNote('');
    setTxModalOpen(true);
  };

  const openEditTransaction = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setTxType(tx.type);
    setTxPaymentMethod(
      tx.paymentMethod ?? (tx.currency === 'USD' ? 'usd' : 'bank')
    );
    setTxCreditLineId(tx.creditLineId ?? state.creditLines?.[0]?.id ?? '');
    setTxInstallments(String(tx.installmentCount ?? 4));
    setTxPersonId(tx.personId ?? state.people?.[0]?.id ?? '');
    setTxCategoryLabel(tx.categoryLabel ?? 'سایر');
    setTxAmount(String(tx.amount));
    setTxCurrency(tx.currency);
    setTxAccountId(tx.accountId);
    setTxToAccountId(tx.toAccountId ?? '');
    setTxBudgetId(tx.budgetCategoryId ?? '');
    setTxDate(tx.date.slice(0, 10));
    setTxNote(tx.note);
    setTxModalOpen(true);
  };

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(txAmount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      onShowToast(t(lang, 'مبلغ تراکنش باید بزرگ‌تر از صفر باشد', 'Amount must be greater than zero'), 'error');
      return;
    }

    const effectiveMethod: PaymentMethod =
      txType === 'out' ? txPaymentMethod : txCurrency === 'USD' ? 'usd' : 'bank';

    if (txType === 'out' && effectiveMethod === 'credit') {
      if (!txCreditLineId) {
        onShowToast(t(lang, 'خط اعتبار را انتخاب کنید', 'Please select a credit line'), 'error');
        return;
      }
      const inst = Number(txInstallments);
      if (!Number.isFinite(inst) || inst < 1) {
        onShowToast(t(lang, 'تعداد اقساط معتبر نیست', 'Invalid installment count'), 'error');
        return;
      }
      const clStatus = summary.creditLinesStatus.find((s) => s.line.id === txCreditLineId);
      if (clStatus && numeric > clStatus.availableAmount) {
        onShowToast(
          t(lang, 'هشدار: مبلغ خرید از اعتبار آزاد باقی‌مانده بیشتر است', 'Warning: exceeds available credit'),
          'info'
        );
      }
      onAddOrUpdateTransaction(
        {
          type: 'out',
          amount: numeric,
          currency: txCurrency,
          accountId: '',
          paymentMethod: 'credit',
          creditLineId: txCreditLineId,
          installmentCount: Math.round(inst),
          categoryLabel: txCategoryLabel.trim() || undefined,
          budgetCategoryId: txBudgetId || undefined,
          date: new Date(`${txDate}T12:00:00`).toISOString(),
          note: txNote.trim(),
          source: 'manual',
        },
        editingTxId
      );
      setTxModalOpen(false);
      return;
    }

    if (txType === 'out' && effectiveMethod === 'person_debt') {
      if (!txPersonId) {
        onShowToast(t(lang, 'شخص قرض‌دهنده را انتخاب کنید', 'Please select a person'), 'error');
        return;
      }
      onAddOrUpdateTransaction(
        {
          type: 'out',
          amount: numeric,
          currency: txCurrency,
          accountId: '',
          paymentMethod: 'person_debt',
          personId: txPersonId,
          categoryLabel: txCategoryLabel.trim() || undefined,
          budgetCategoryId: txBudgetId || undefined,
          date: new Date(`${txDate}T12:00:00`).toISOString(),
          note: txNote.trim(),
          source: 'manual',
        },
        editingTxId
      );
      setTxModalOpen(false);
      return;
    }

    if (!txAccountId) {
      onShowToast(t(lang, 'حساب مبدأ را انتخاب کنید', 'Please select a source account'), 'error');
      return;
    }
    if (txType === 'transfer') {
      if (!txToAccountId || txToAccountId === txAccountId) {
        onShowToast(t(lang, 'حساب مقصد باید متفاوت از مبدأ باشد', 'Destination account must differ'), 'error');
        return;
      }
    }
    onAddOrUpdateTransaction(
      {
        type: txType,
        amount: numeric,
        currency: txCurrency,
        accountId: txAccountId,
        toAccountId: txType === 'transfer' ? txToAccountId : undefined,
        paymentMethod: effectiveMethod,
        categoryLabel: txType === 'out' ? txCategoryLabel.trim() || undefined : undefined,
        budgetCategoryId: txType === 'out' && txBudgetId ? txBudgetId : undefined,
        date: new Date(`${txDate}T12:00:00`).toISOString(),
        note: txNote.trim(),
        source: 'manual',
      },
      editingTxId
    );
    setTxModalOpen(false);
  };

  const openUnifiedAccountModal = (
    mode: 'bank_wallet' | 'credit' = 'bank_wallet',
    existingAcc?: BankAccount,
    existingCredit?: CreditLine
  ) => {
    setAccModalMode(mode);
    if (existingAcc) {
      setEditingAccId(existingAcc.id);
      setAccName(existingAcc.name);
      setAccType(existingAcc.type);
      setAccCurrency(existingAcc.currency);
      setAccBalance(String(existingAcc.balance));
      setAccNote(existingAcc.note);
    } else {
      setEditingAccId(undefined);
      setAccName('');
      setAccType('bank');
      setAccCurrency('IRT');
      setAccBalance('');
      setAccNote('');
    }

    if (existingCredit) {
      setEditingCreditId(existingCredit.id);
      setCrTitle(existingCredit.title);
      setCrProvider(existingCredit.provider);
      setCrLimit(String(existingCredit.creditLimit));
      setCrCurrency(existingCredit.currency);
      setCrDefaultInst(String(existingCredit.defaultInstallments));
      setCrDueDay(String(existingCredit.dueDayOfMonth));
      setCrNote(existingCredit.note);
      setCrActive(existingCredit.active);
    } else {
      setEditingCreditId(undefined);
      setCrTitle('');
      setCrProvider('digipay');
      setCrLimit('');
      setCrCurrency('IRT');
      setCrDefaultInst('4');
      setCrDueDay('5');
      setCrNote('');
      setCrActive(true);
    }

    setAccModalOpen(true);
  };

  const handleSaveCreditLine = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = Number(crLimit);
    const inst = Number(crDefaultInst);
    const dueDay = Number(crDueDay);
    if (!crTitle.trim() || !Number.isFinite(limit) || limit <= 0 || inst < 1 || dueDay < 1 || dueDay > 30) {
      onShowToast(
        t(lang, 'عنوان، سقف اعتبار (>۰)، تعداد قسط و روز سررسید (۱ تا ۳۰) معتبر وارد کنید', 'Invalid credit line inputs'),
        'error'
      );
      return;
    }
    onAddOrUpdateCreditLine(
      {
        title: crTitle.trim(),
        provider: crProvider,
        creditLimit: limit,
        currency: crCurrency,
        defaultInstallments: Math.round(inst),
        dueDayOfMonth: Math.round(dueDay),
        note: crNote.trim(),
        active: crActive,
      },
      editingCreditId
    );
    setAccModalOpen(false);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) {
      onShowToast(t(lang, 'نام حساب الزامی است', 'Account name is required'), 'error');
      return;
    }
    const bal = Number(accBalance);
    if (!Number.isFinite(bal) || bal < 0) {
      onShowToast(t(lang, 'موجودی معتبر وارد کنید', 'Enter a valid balance'), 'error');
      return;
    }
    onAddOrUpdateBankAccount(
      {
        name: accName.trim(),
        type: accType,
        currency: accCurrency,
        balance: bal,
        note: accNote.trim(),
      },
      editingAccId
    );
    setAccModalOpen(false);
  };

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const pct = Number(bPercent);
    if (!bName.trim() || !bAccountId || !Number.isFinite(pct) || pct <= 0) {
      onShowToast(t(lang, 'اطلاعات بودجه را کامل و معتبر وارد کنید', 'Enter valid budget details'), 'error');
      return;
    }
    onAddBudgetCap(bName.trim(), bAccountId, pct, bRollover);
    setBudgetModalOpen(false);
  };

  const handleSaveFixedExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(feAmount);
    const day = Number(feDay);
    if (!feTitle.trim() || !Number.isFinite(amt) || amt <= 0 || day < 1 || day > 30) {
      onShowToast(t(lang, 'عنوان، مبلغ (>۰) و روز ماه (۱ تا ۳۰) معتبر وارد کنید', 'Invalid fixed expense inputs'), 'error');
      return;
    }
    onAddFixedExpense(feTitle.trim(), amt, feCurrency, feRecurring, day, feCategoryId || undefined);
    setFeModalOpen(false);
  };

  const handleSaveLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const total = Number(lTotalAmount);
    const instCount = Number(lInstallments);
    const instAmt = Number(lInstallmentAmount);
    if (!lTitle.trim() || total <= 0 || instCount < 1 || instAmt <= 0) {
      onShowToast(t(lang, 'مبالغ و تعداد اقساط باید معتبر باشند', 'Invalid loan values'), 'error');
      return;
    }
    onAddLoan({
      kind: lKind,
      title: lTitle.trim(),
      totalAmount: total,
      currency: lCurrency,
      periodLabel: lPeriod,
      dueDate: new Date(lDueDate).toISOString(),
      totalInstallments: instCount,
      installmentAmount: instAmt,
      priorityRate: Number(lPriorityRate) || 0,
    });
    setLoanModalOpen(false);
  };

  // People Ledger helpers
  const activePersonLedger = useMemo(() => {
    return (
      peopleOverview.ledgers.find((l) => l.person.id === selectedPersonId) ??
      peopleOverview.ledgers[0] ??
      null
    );
  }, [peopleOverview.ledgers, selectedPersonId]);

  const filteredPersonLedgers = useMemo(() => {
    if (!personSearch.trim()) return peopleOverview.ledgers;
    const q = personSearch.toLowerCase();
    return peopleOverview.ledgers.filter((l) =>
      `${l.person.name} ${l.person.phone ?? ''} ${l.person.note}`.toLowerCase().includes(q)
    );
  }, [peopleOverview.ledgers, personSearch]);

  const openPersonModal = (existing?: PersonContact) => {
    if (existing) {
      setEditingPersonId(existing.id);
      setPName(existing.name);
      setPPhone(existing.phone ?? '');
      setPRole(existing.role);
      setPNote(existing.note);
    } else {
      setEditingPersonId(undefined);
      setPName('');
      setPPhone('');
      setPRole('partner');
      setPNote('');
    }
    setPersonModalOpen(true);
  };

  const handleSavePerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) {
      onShowToast(t(lang, 'نام شخص الزامی است', 'Person name is required'), 'error');
      return;
    }
    onAddOrUpdatePerson(
      {
        name: pName.trim(),
        phone: pPhone.trim() || undefined,
        role: pRole,
        note: pNote.trim(),
      },
      editingPersonId
    );
    setPersonModalOpen(false);
  };

  const openPersonEntryModal = (
    personId?: string,
    presetDirection: PersonLedgerDirection = 'give',
    presetAmount?: number,
    presetNote?: string
  ) => {
    setPePersonId(personId ?? activePersonLedger?.person.id ?? state.people?.[0]?.id ?? '');
    setPeDirection(presetDirection);
    setPeAmount(presetAmount ? String(Math.round(presetAmount)) : '');
    setPeCurrency('IRT');
    setPeAccountId(state.bankAccounts[0]?.id ?? '');
    setPeDate(new Date().toISOString().slice(0, 10));
    setPeNote(presetNote ?? '');
    setPersonEntryModalOpen(true);
  };

  const handleSavePersonEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(peAmount);
    if (!pePersonId) {
      onShowToast(t(lang, 'شخص مورد نظر را انتخاب کنید', 'Please select a person'), 'error');
      return;
    }
    if (!Number.isFinite(numeric) || numeric <= 0) {
      onShowToast(t(lang, 'مبلغ معتبر بزرگ‌تر از صفر وارد کنید', 'Amount must be greater than zero'), 'error');
      return;
    }
    onAddPersonEntry({
      personId: pePersonId,
      direction: peDirection,
      amount: numeric,
      currency: peCurrency,
      accountId: peAccountId || undefined,
      date: new Date(peDate).toISOString(),
      note: peNote.trim(),
    });
    setSelectedPersonId(pePersonId);
    setPersonEntryModalOpen(false);
  };

  // Calendar days calculation
  const monthDays = getJalaliMonthLength(calYear, calMonth);
  const startOffset = getJalaliWeekdayIndex(calYear, calMonth, 1);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Material Design 3 Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-2xl glass-surface overflow-x-auto no-scrollbar max-w-full flex-nowrap">
          {(
            [
              ['summary', t(lang, 'خلاصه', 'Summary')],
              ['transactions', t(lang, 'تراکنش‌ها', 'Ledger')],
              ['accounts', t(lang, 'حساب‌ها', 'Accounts')],
              ['people', t(lang, 'اشخاص', 'People')],
              ['planning', t(lang, 'اعتبارات', 'Credits')],
              ['fx', t(lang, 'نرخ ارز', 'FX')],
            ] as Array<[FinanceSubTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`min-h-[38px] px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === id
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => openNewTransaction()}
          className="min-h-[38px] px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{t(lang, 'ثبت تراکنش', 'Log Entry')}</span>
        </button>
      </div>

      {/* 1. Summary & Net Worth & Safe-to-Spend */}
      {subTab === 'summary' && (() => {
        const grossAssetsIrt = Math.max(1, summary.totalBankIrt + summary.totalTradingIrt);
        const totalFootprintIrt = Math.max(1, grossAssetsIrt + summary.totalDebtIrt);
        const bankSharePct = Math.round((summary.totalBankIrt / totalFootprintIrt) * 100);
        const tradingSharePct = Math.round((summary.totalTradingIrt / totalFootprintIrt) * 100);
        const debtSharePct = Math.max(0, 100 - bankSharePct - tradingSharePct);

        const safeCashPct =
          summary.bankIrt > 0
            ? Math.max(0, Math.min(100, (summary.safeToSpendIrtOnly / summary.bankIrt) * 100))
            : summary.bankUsd > 0
            ? Math.max(0, Math.min(100, (summary.safeToSpendUsdOnly / summary.bankUsd) * 100))
            : 0;
        const debtRatioPct =
          grossAssetsIrt > 0
            ? Math.max(0, Math.min(100, (summary.totalDebtIrt / grossAssetsIrt) * 100))
            : 0;
        const maxFlowIrtOnly = Math.max(1, summary.monthlyInIrtOnly, summary.monthlyOutIrtOnly);
        const inflowBarPct = Math.max(6, Math.round((summary.monthlyInIrtOnly / maxFlowIrtOnly) * 100));
        const outflowBarPct = Math.max(6, Math.round((summary.monthlyOutIrtOnly / maxFlowIrtOnly) * 100));
        const netFlowIrtOnly = summary.monthlyInIrtOnly - summary.monthlyOutIrtOnly;
        const netFlowUsdOnly = Number((summary.monthlyInUsdOnly - summary.monthlyOutUsdOnly).toFixed(2));
        const totalObligationsIrtOnly =
          summary.upcomingBillsIrtOnly + summary.upcomingInstallmentsIrtOnly;
        const totalObligationsUsdOnly = Number(
          (summary.upcomingBillsUsdOnly + summary.upcomingInstallmentsUsdOnly).toFixed(2)
        );
        const coverageRatio =
          summary.totalDebtIrt > 0
            ? (grossAssetsIrt / summary.totalDebtIrt).toFixed(1)
            : '∞';

        return (
          <div className="space-y-6">
            {/* Hero Translucent Gradient Summary Section */}
            <section className="relative overflow-hidden rounded-3xl p-5 sm:p-6 backdrop-blur-xl bg-[rgba(var(--ft-surface-rgb),0.44)] border border-[var(--ft-border-strong)] shadow-[var(--ft-shadow)]">
              {/* Ambient Gradient Orbs inside Translucent Glass */}
              <div
                className="pointer-events-none absolute -top-24 -start-20 w-72 h-72 rounded-full blur-3xl opacity-25"
                style={{ background: 'var(--ft-accent)' }}
              />
              <div
                className="pointer-events-none absolute -bottom-28 -end-20 w-80 h-80 rounded-full blur-3xl opacity-20"
                style={{ background: 'var(--ft-accent-secondary, var(--ft-positive))' }}
              />

              {/* Top 3 Visual Bento Cards */}
              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                {/* 1. Hero Net Worth Gradient Card */}
                <div className="lg:col-span-5 relative overflow-hidden rounded-2xl p-5 ft-accent-gradient flex flex-col justify-between gap-4 shadow-md">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/15" />
                  <div className="relative z-10 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
                        <Wallet className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-semibold opacity-95">
                        {t(lang, 'ارزش خالص ترکیبی', 'Consolidated Net Worth')}
                      </span>
                    </div>
                    <span className="font-num text-[11px] font-bold px-2 py-1 rounded-lg bg-black/15 backdrop-blur-sm">
                      ≈ {formatMoney(summary.netWorthUsd, 'USD', lang, false, isPrivate)}
                    </span>
                  </div>

                  <div className="relative z-10 space-y-1">
                    <div className="font-num text-2xl sm:text-3xl font-extrabold tracking-tight">
                      {formatMoney(summary.netWorthIrt, 'IRT', lang, false, isPrivate)}
                    </div>
                    <div className="text-[11px] opacity-85 font-num flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        {t(lang, 'بانک تومان:', 'Bank IRT:')}{' '}
                        {formatMoney(summary.bankIrt, 'IRT', lang, true, isPrivate)}
                      </span>
                      {summary.bankUsd > 0 && (
                        <span>
                          · {t(lang, 'بانک $:', 'Bank $:')} {formatMoney(summary.bankUsd, 'USD', lang, true, isPrivate)}
                        </span>
                      )}
                      <span>
                        · MT5: {formatMoney(summary.totalTradingUsd, 'USD', lang, true, isPrivate)}
                      </span>
                    </div>
                  </div>

                  {/* Visual Asset vs Debt Composition Strip */}
                  <div className="relative z-10 space-y-1.5 pt-2 border-t border-white/20">
                    <div className="flex items-center justify-between text-[11px] font-num opacity-90">
                      <span>
                        {t(lang, 'بانک', 'Bank')} {bankSharePct}%
                      </span>
                      <span>
                        {t(lang, 'ترید', 'MT5')} {tradingSharePct}%
                      </span>
                      <span>
                        {t(lang, 'بدهی', 'Debt')} {debtSharePct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-black/20 overflow-hidden flex gap-0.5 p-0.5">
                      <div
                        className="h-full rounded-s-full bg-white/95 transition-all duration-300"
                        style={{ width: `${Math.max(4, bankSharePct)}%` }}
                      />
                      <div
                        className="h-full bg-white/60 transition-all duration-300"
                        style={{ width: `${Math.max(4, tradingSharePct)}%` }}
                      />
                      {debtSharePct > 0 && (
                        <div
                          className="h-full rounded-e-full bg-black/45 transition-all duration-300"
                          style={{ width: `${Math.max(4, debtSharePct)}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Safe-to-Spend Frosted Glass Card */}
                <div className="lg:col-span-4 rounded-2xl p-5 backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.36)] border border-[var(--ft-border-strong)] flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="p-2 rounded-xl border border-[var(--ft-border)]"
                        style={{ backgroundColor: 'var(--ft-accent-soft)', color: 'var(--ft-accent)' }}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-semibold text-[var(--ft-text-secondary)]">
                        {t(lang, 'قابل خرج آزاد', 'Safe-to-Spend')}
                      </span>
                    </div>
                    <span className="font-num text-xs font-bold text-[var(--ft-accent)]">
                      {Math.round(safeCashPct)}%
                    </span>
                  </div>

                  <div>
                    <div className="font-num text-2xl font-bold text-[var(--ft-accent)]">
                      {formatMoney(summary.safeToSpendIrtOnly, 'IRT', lang, false, isPrivate)}
                    </div>
                    {(summary.bankUsd > 0 || summary.safeToSpendUsdOnly > 0) && (
                      <div className="font-num text-xs font-semibold text-[var(--ft-positive)] mt-0.5">
                        {t(lang, 'آزاد دلاری:', 'USD Safe:')}{' '}
                        {formatMoney(summary.safeToSpendUsdOnly, 'USD', lang, false, isPrivate)}
                      </div>
                    )}
                    <div className="text-[11px] text-[var(--ft-text-muted)] mt-1">
                      {t(lang, 'پس از کسر تعهدات تومانی و اهداف', 'Separated strictly by currency')}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[var(--ft-border)]">
                    <div className="h-2.5 w-full rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(4, Math.round(safeCashPct))}%`,
                          background: 'var(--ft-accent-grad)',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-num text-[var(--ft-text-muted)]">
                      <span>
                        {t(lang, 'تعهدات:', 'Reserved:')}{' '}
                        {formatMoney(totalObligationsIrtOnly, 'IRT', lang, true, isPrivate)}
                        {totalObligationsUsdOnly > 0
                          ? ` · ${formatMoney(totalObligationsUsdOnly, 'USD', lang, true, isPrivate)}`
                          : ''}
                      </span>
                      <span>
                        {t(lang, 'از نقد بانکی', 'of Bank')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. 30d Cashflow & Savings Rate Frosted Card */}
                <div className="lg:col-span-3 rounded-2xl p-5 backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.36)] border border-[var(--ft-border-strong)] flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="p-2 rounded-xl border border-[var(--ft-border)]"
                        style={{ backgroundColor: 'var(--ft-positive-soft)', color: 'var(--ft-positive)' }}
                      >
                        <TrendingUp className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-semibold text-[var(--ft-text-secondary)]">
                        {t(lang, 'نرخ پس‌انداز این ماه', 'Monthly Savings Rate')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-num text-2xl sm:text-3xl font-extrabold text-[var(--ft-positive)]">
                      {summary.savingsRateIrtPct}%
                    </span>
                    <span
                      className={`font-num text-xs font-semibold ${
                        netFlowIrtOnly >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                      }`}
                    >
                      {netFlowIrtOnly >= 0 && !isPrivate ? '+' : ''}
                      {formatMoney(netFlowIrtOnly, 'IRT', lang, true, isPrivate)}
                    </span>
                  </div>

                  {/* Dual Inflow vs Outflow Gradient Mini Bars (Pure IRT + optional USD row) */}
                  <div className="space-y-2 pt-2 border-t border-[var(--ft-border)]">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-num">
                        <span className="text-[var(--ft-text-muted)]">{t(lang, 'ورودی تومانی', 'IRT Inflow')}</span>
                        <span className="text-[var(--ft-positive)] font-semibold">
                          {formatMoney(summary.monthlyInIrtOnly, 'IRT', lang, true, isPrivate)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--ft-surface-subtle)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${inflowBarPct}%`,
                            background: 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))',
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-num">
                        <span className="text-[var(--ft-text-muted)]">{t(lang, 'خروجی تومانی', 'IRT Outflow')}</span>
                        <span className="text-[var(--ft-warning)] font-semibold">
                          {formatMoney(summary.monthlyOutIrtOnly, 'IRT', lang, true, isPrivate)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--ft-surface-subtle)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${outflowBarPct}%`,
                            background: 'linear-gradient(90deg, var(--ft-warning), var(--ft-danger))',
                          }}
                        />
                      </div>
                    </div>

                    {(summary.monthlyInUsdOnly > 0 || summary.monthlyOutUsdOnly > 0) && (
                      <div className="flex items-center justify-between text-[11px] font-num pt-1 text-[var(--ft-text-muted)]">
                        <span>{t(lang, 'جریان $:', 'USD Flow:')}</span>
                        <span className={netFlowUsdOnly >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'}>
                          +{formatMoney(summary.monthlyInUsdOnly, 'USD', lang, true, isPrivate)} / -
                          {formatMoney(summary.monthlyOutUsdOnly, 'USD', lang, true, isPrivate)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom 4 Frosted Glass Breakdown Tiles (Pure Native Currencies) */}
              <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4">
                <div className="p-3.5 rounded-2xl backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.34)] border border-[var(--ft-border)] hover:border-[var(--ft-accent)]/60 transition-colors space-y-2">
                  <div className="flex items-center justify-between text-xs text-[var(--ft-text-muted)]">
                    <span>{t(lang, 'نقدینگی بانک', 'Bank Liquidity')}</span>
                    <Landmark className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
                  </div>
                  <div className="font-num text-base sm:text-lg font-bold text-[var(--ft-text-primary)]">
                    {formatMoney(summary.bankIrt, 'IRT', lang, true, isPrivate)}
                  </div>
                  {summary.bankUsd > 0 && (
                    <div className="font-num text-xs font-semibold text-[var(--ft-accent)]">
                      + {formatMoney(summary.bankUsd, 'USD', lang, true, isPrivate)}
                    </div>
                  )}
                  <div className="h-1 rounded-full bg-[var(--ft-surface-subtle)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(8, bankSharePct)}%`, background: 'var(--ft-accent-grad)' }}
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.34)] border border-[var(--ft-border)] hover:border-[var(--ft-positive)]/60 transition-colors space-y-2">
                  <div className="flex items-center justify-between text-xs text-[var(--ft-text-muted)]">
                    <span>{t(lang, 'اکوئیتی MT5 (دلاری)', 'Trading Equity ($)')}</span>
                    <TrendingUp className="w-3.5 h-3.5 text-[var(--ft-positive)]" />
                  </div>
                  <div className="font-num text-base sm:text-lg font-bold text-[var(--ft-text-primary)]">
                    {formatMoney(summary.totalTradingUsd, 'USD', lang, false, isPrivate)}
                  </div>
                  {state.settings.showTomanEquivalent && (
                    <div className="font-num text-[11px] text-[var(--ft-text-muted)]">
                      ≈ {formatMoney(summary.totalTradingIrt, 'IRT', lang, true, isPrivate)}
                    </div>
                  )}
                  <div className="h-1 rounded-full bg-[var(--ft-surface-subtle)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(8, tradingSharePct)}%`,
                        background: 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))',
                      }}
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.34)] border border-[var(--ft-border)] hover:border-[var(--ft-danger)]/60 transition-colors space-y-2">
                  <div className="flex items-center justify-between text-xs text-[var(--ft-text-muted)]">
                    <span>{t(lang, 'بدهی و وام', 'Remaining Debt')}</span>
                    <CreditCard className="w-3.5 h-3.5 text-[var(--ft-danger)]" />
                  </div>
                  <div className="font-num text-base sm:text-lg font-bold text-[var(--ft-danger)]">
                    {formatMoney(summary.totalDebtIrtOnly, 'IRT', lang, true, isPrivate)}
                  </div>
                  {summary.totalDebtUsdOnly > 0 && (
                    <div className="font-num text-xs font-semibold text-[var(--ft-danger)]">
                      + {formatMoney(summary.totalDebtUsdOnly, 'USD', lang, true, isPrivate)}
                    </div>
                  )}
                  <div className="h-1 rounded-full bg-[var(--ft-surface-subtle)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, Math.round(debtRatioPct))}%`,
                        background: 'linear-gradient(90deg, var(--ft-danger), var(--ft-warning))',
                      }}
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.34)] border border-[var(--ft-border)] hover:border-[var(--ft-warning)]/60 transition-colors space-y-2">
                  <div className="flex items-center justify-between text-xs text-[var(--ft-text-muted)]">
                    <span>{t(lang, 'تعهدات این ماه', 'Monthly Obligations')}</span>
                    <Calendar className="w-3.5 h-3.5 text-[var(--ft-warning)]" />
                  </div>
                  <div className="font-num text-base sm:text-lg font-bold text-[var(--ft-warning)]">
                    {formatMoney(totalObligationsIrtOnly, 'IRT', lang, true, isPrivate)}
                  </div>
                  {totalObligationsUsdOnly > 0 && (
                    <div className="font-num text-xs font-semibold text-[var(--ft-warning)]">
                      + {formatMoney(totalObligationsUsdOnly, 'USD', lang, true, isPrivate)}
                    </div>
                  )}
                  <div className="h-1 rounded-full bg-[var(--ft-surface-subtle)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${
                          summary.bankIrt > 0
                            ? Math.min(100, Math.max(6, Math.round((totalObligationsIrtOnly / summary.bankIrt) * 100)))
                            : 10
                        }%`,
                        background: 'linear-gradient(90deg, var(--ft-warning), var(--ft-accent-secondary, var(--ft-accent)))',
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Mobile M3 Quick Action Grid + Horizontal Accounts & Credit Carousel */}
            <div className="md:hidden space-y-4">
              {/* 4 M3 Circular Quick Action Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => openNewTransaction({ type: 'out' })}
                  className="p-2.5 rounded-2xl glass-surface flex flex-col items-center justify-center gap-1.5 min-h-[68px] cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span className="w-9 h-9 rounded-full ft-accent-gradient flex items-center justify-center shadow-sm">
                    <Plus className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--ft-text-primary)] truncate max-w-full">
                    {t(lang, 'ثبت', 'Log')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openNewTransaction({ type: 'transfer' })}
                  className="p-2.5 rounded-2xl glass-surface flex flex-col items-center justify-center gap-1.5 min-h-[68px] cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span className="w-9 h-9 rounded-full bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] flex items-center justify-center">
                    <ArrowLeftRight className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--ft-text-primary)] truncate max-w-full">
                    {t(lang, 'انتقال', 'Transfer')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (payoffPlan.priorityQueue[0] && onPayTopPriorityDebt) {
                      setPriorityPayAccId(state.bankAccounts[0]?.id ?? '');
                      setPriorityPayModalOpen(true);
                    } else {
                      setSubTab('planning');
                    }
                  }}
                  className="p-2.5 rounded-2xl glass-surface flex flex-col items-center justify-center gap-1.5 min-h-[68px] cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--ft-danger-soft)',
                      color: 'var(--ft-danger)',
                    }}
                  >
                    <CreditCard className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--ft-text-primary)] truncate max-w-full">
                    {t(lang, 'تسویه', 'Pay Debt')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('fx')}
                  className="p-2.5 rounded-2xl glass-surface flex flex-col items-center justify-center gap-1.5 min-h-[68px] cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: 'var(--ft-positive-soft)',
                      color: 'var(--ft-positive)',
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--ft-text-primary)] truncate max-w-full">
                    {t(lang, 'نرخ ارز', 'FX Rate')}
                  </span>
                </button>
              </div>

              {/* M3 Horizontal Accounts & Credit Lines Snap Carousel */}
              {(state.bankAccounts.length > 0 || summary.creditLinesStatus.length > 0) && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-[var(--ft-text-primary)]">
                      {t(lang, 'کارت حساب‌ها و اعتبارات', 'Accounts & Credit Lines')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSubTab('accounts')}
                      className="text-[11px] font-semibold text-[var(--ft-accent)] cursor-pointer"
                    >
                      {t(lang, 'مدیریت همه', 'Manage all')}
                    </button>
                  </div>
                  <M3SnapCarousel
                    ariaLabel={t(lang, 'کارت حساب‌ها', 'Accounts Carousel')}
                    slideClassName="w-[82%] sm:w-[56%] shrink-0 snap-center"
                    showDots
                    items={[
                      ...state.bankAccounts.map((acc): M3CarouselItem => ({
                        id: `mob_acc_${acc.id}`,
                        content: (
                          <button
                            type="button"
                            onClick={() => setHistoryAccount(acc)}
                            className="w-full h-full text-start p-4 rounded-2xl glass-surface border border-[var(--ft-border-strong)] flex flex-col justify-between gap-3 cursor-pointer hover:border-[var(--ft-accent)] transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--ft-text-muted)]">
                                {acc.type === 'bank' ? (
                                  <Landmark className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
                                ) : acc.type === 'wallet' ? (
                                  <Wallet className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
                                ) : (
                                  <CreditCard className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
                                )}
                                <span>
                                  {acc.type === 'bank'
                                    ? t(lang, 'بانکی', 'Bank')
                                    : acc.type === 'wallet'
                                    ? t(lang, 'کیف پول', 'Wallet')
                                    : t(lang, 'نقد', 'Cash')}
                                </span>
                              </span>
                              <span className="font-num text-[11px] font-bold text-[var(--ft-accent)]">
                                {acc.currency}
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <div className="text-sm font-bold text-[var(--ft-text-primary)] truncate">
                                {acc.name}
                              </div>
                              <div className="font-num text-lg font-extrabold text-[var(--ft-text-primary)]">
                                {formatMoney(acc.balance, acc.currency, lang, false, isPrivate)}
                              </div>
                            </div>
                          </button>
                        ),
                      })),
                      ...summary.creditLinesStatus.map(({ line, availableAmount, utilizationPct }): M3CarouselItem => ({
                        id: `mob_cred_${line.id}`,
                        content: (
                          <button
                            type="button"
                            onClick={() => openNewTransaction({ type: 'out', paymentMethod: 'credit', creditLineId: line.id })}
                            className="w-full h-full text-start p-4 rounded-2xl glass-surface border border-[var(--ft-border-strong)] flex flex-col justify-between gap-2.5 cursor-pointer hover:border-[var(--ft-positive)] transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 w-full text-[11px]">
                              <span className="font-semibold text-[var(--ft-accent)]">
                                {t(lang, 'اعتبار اقساطی', 'Credit Line')}
                              </span>
                              <span className="font-num text-[var(--ft-text-muted)]">
                                {line.defaultInstallments} {t(lang, 'قسط', 'inst')}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="text-sm font-bold text-[var(--ft-text-primary)] truncate">
                                {line.title}
                              </div>
                              <div className="font-num text-base font-extrabold text-[var(--ft-positive)]">
                                {formatMoney(availableAmount, line.currency, lang, true, isPrivate)}{' '}
                                <span className="text-[11px] font-normal text-[var(--ft-text-muted)]">
                                  {t(lang, 'آزاد', 'avail')}
                                </span>
                              </div>
                            </div>
                            <StripedProgressBar
                              valuePct={utilizationPct}
                              tone={utilizationPct > 85 ? 'danger' : utilizationPct > 60 ? 'warning' : 'accent'}
                              heightClass="h-1.5"
                            />
                          </button>
                        ),
                      })),
                    ]}
                  />
                </div>
              )}
            </div>

            {/* Visual Asset Mix & Cashflow Breakdown */}
            {(() => {
              const assetMixCard = (
                <section className="lg:col-span-5 h-full relative overflow-hidden rounded-3xl p-5 sm:p-6 backdrop-blur-xl bg-[rgba(var(--ft-surface-rgb),0.44)] border border-[var(--ft-border-strong)] shadow-[var(--ft-shadow)] flex flex-col justify-between gap-5">
                  <div
                    className="pointer-events-none absolute -top-20 -end-16 w-56 h-56 rounded-full blur-3xl opacity-20"
                    style={{ background: 'var(--ft-accent)' }}
                  />

                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-[var(--ft-text-primary)]">
                        {t(lang, 'تراز دارایی و نقدینگی', 'Asset Balance & Liquidity')}
                      </h3>
                      <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                        {t(lang, 'شاخص‌های تومانی مجزا از دلار', 'Currency-separated health')}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="text-[11px] text-[var(--ft-text-muted)]">
                        {t(lang, 'پوشش بدهی', 'Coverage')}
                      </div>
                      <div className="font-num text-sm font-bold text-[var(--ft-positive)]">
                        {coverageRatio}x
                      </div>
                    </div>
                  </div>

                  {/* 3 Substantial Gradient Radial Gauge Tiles */}
                  <div className="relative z-10 grid grid-cols-3 gap-2.5 sm:gap-3">
                    <div className="p-2.5 sm:p-3 rounded-2xl backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.36)] border border-[var(--ft-border)] flex flex-col items-center justify-center">
                      <RadialGauge
                        pct={safeCashPct}
                        label={t(lang, 'نقد آزاد', 'Safe Cash')}
                        sublabel={formatMoney(summary.safeToSpendIrtOnly, 'IRT', lang, true, isPrivate)}
                        color="var(--ft-accent)"
                        gradientTo="var(--ft-accent-secondary, var(--ft-positive))"
                        size={92}
                        strokeWidth={9}
                      />
                    </div>
                    <div className="p-2.5 sm:p-3 rounded-2xl backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.36)] border border-[var(--ft-border)] flex flex-col items-center justify-center">
                      <RadialGauge
                        pct={Math.max(0, summary.savingsRateIrtPct)}
                        label={t(lang, 'نرخ پس‌انداز', 'Savings Rate')}
                        sublabel={formatMoney(Math.max(0, netFlowIrtOnly), 'IRT', lang, true, isPrivate)}
                        color="var(--ft-positive)"
                        gradientTo="var(--ft-accent)"
                        size={92}
                        strokeWidth={9}
                      />
                    </div>
                    <div className="p-2.5 sm:p-3 rounded-2xl backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.36)] border border-[var(--ft-border)] flex flex-col items-center justify-center">
                      <RadialGauge
                        pct={debtRatioPct}
                        label={t(lang, 'نسبت بدهی', 'Debt Ratio')}
                        sublabel={formatMoney(summary.totalDebtIrtOnly, 'IRT', lang, true, isPrivate)}
                        color="var(--ft-danger)"
                        gradientTo="var(--ft-warning)"
                        size={92}
                        strokeWidth={9}
                      />
                    </div>
                  </div>

                  {/* Asset Mix & Balance Distribution Footer Block */}
                  <div className="relative z-10 p-4 rounded-2xl backdrop-blur-md bg-[rgba(var(--ft-surface-rgb),0.36)] border border-[var(--ft-border)] space-y-3">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-[var(--ft-text-secondary)]">
                        {t(lang, 'ترکیب دارایی و بدهی', 'Capital & Liability Mix')}
                      </span>
                      <span className="font-num font-bold text-[var(--ft-text-primary)] truncate">
                        {formatMoney(summary.bankIrt, 'IRT', lang, true, isPrivate)} +{' '}
                        {formatMoney(summary.totalTradingUsd + summary.bankUsd, 'USD', lang, true, isPrivate)}
                      </span>
                    </div>

                    <div className="h-3.5 w-full rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-hidden flex gap-0.5 p-0.5">
                      <div
                        className="h-full rounded-s-full transition-all duration-300"
                        style={{
                          width: `${Math.max(6, bankSharePct)}%`,
                          background: 'var(--ft-accent-grad)',
                        }}
                      />
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${Math.max(6, tradingSharePct)}%`,
                          background: 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))',
                        }}
                      />
                      {debtSharePct > 0 && (
                        <div
                          className="h-full rounded-e-full transition-all duration-300"
                          style={{
                            width: `${Math.max(4, debtSharePct)}%`,
                            background: 'linear-gradient(90deg, var(--ft-warning), var(--ft-danger))',
                          }}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: 'var(--ft-accent)' }}
                        />
                        <span className="text-[var(--ft-text-muted)] truncate">
                          {t(lang, 'بانکی', 'Bank')}
                        </span>
                        <span className="font-num font-bold text-[var(--ft-text-primary)] ms-auto">
                          {bankSharePct}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: 'var(--ft-positive)' }}
                        />
                        <span className="text-[var(--ft-text-muted)] truncate">
                          {t(lang, 'ترید MT5', 'MT5')}
                        </span>
                        <span className="font-num font-bold text-[var(--ft-text-primary)] ms-auto">
                          {tradingSharePct}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: 'var(--ft-danger)' }}
                        />
                        <span className="text-[var(--ft-text-muted)] truncate">
                          {t(lang, 'بدهی', 'Debt')}
                        </span>
                        <span className="font-num font-bold text-[var(--ft-danger)] ms-auto">
                          {debtSharePct}%
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              );

              const cashflowCompareCard = (
                <section className="lg:col-span-7 h-full glass-surface rounded-3xl p-5 sm:p-6 space-y-4">
                  <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'مقایسه دارایی و جریان ماه جاری', 'Assets & Monthly Cashflow')}
                  </h3>
                  <HorizontalCompareBars
                    items={[
                      {
                        label: t(lang, 'نقدینگی بانک (تومان)', 'Bank Liquidity (IRT)'),
                        value: summary.bankIrt,
                        formattedValue: formatMoney(summary.bankIrt, 'IRT', lang, true, isPrivate),
                        tone: 'accent',
                      },
                      {
                        label: t(lang, 'اکوئیتی MT5 (دلار)', 'MT5 Equity (USD)'),
                        value: summary.totalTradingIrt,
                        formattedValue: formatMoney(summary.totalTradingUsd, 'USD', lang, true, isPrivate),
                        tone: 'positive',
                      },
                      {
                        label: t(lang, 'ورودی این ماه (تومان)', 'Monthly Inflow (IRT)'),
                        value: summary.monthlyInIrtOnly,
                        formattedValue: formatMoney(summary.monthlyInIrtOnly, 'IRT', lang, true, isPrivate),
                        tone: 'positive',
                      },
                      {
                        label: t(lang, 'مخارج این ماه (تومان)', 'Monthly Outflow (IRT)'),
                        value: summary.monthlyOutIrtOnly,
                        formattedValue: formatMoney(summary.monthlyOutIrtOnly, 'IRT', lang, true, isPrivate),
                        tone: 'warning',
                      },
                      {
                        label: t(lang, 'بدهی / اقساط کل (تومان)', 'Remaining Debt (IRT)'),
                        value: summary.totalDebtIrtOnly,
                        formattedValue: formatMoney(summary.totalDebtIrtOnly, 'IRT', lang, true, isPrivate),
                        tone: 'danger',
                      },
                    ]}
                  />
                </section>
              );

              return (
                <>
                  {/* Mobile Swipeable Analytics Carousel */}
                  <div className="md:hidden">
                    <M3SnapCarousel
                      ariaLabel={t(lang, 'نمودارهای خلاصه مالی', 'Finance Summary Analytics')}
                      showTabs
                      showDots
                      items={[
                        {
                          id: 'asset_mix',
                          label: t(lang, 'تراز و ترکیب دارایی', 'Asset Health'),
                          content: assetMixCard,
                        },
                        {
                          id: 'cashflow_compare',
                          label: t(lang, 'مقایسه جریان نقدینگی', 'Cashflow'),
                          content: cashflowCompareCard,
                        },
                      ]}
                    />
                  </div>

                  {/* Desktop Bento Grid */}
                  <div className="hidden md:grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                    {assetMixCard}
                    {cashflowCompareCard}
                  </div>
                </>
              );
            })()}

            {/* Debt-First Budget Allocation Waterfall (Accordion on Mobile, Open on Desktop) */}
            <M3AccordionCard
              title={t(lang, 'آبشار بودجه‌بندی (اولویت #۱ بدهی)', 'Debt-First Budget Waterfall')}
              icon={<ShieldCheck className="w-4 h-4 text-[var(--ft-danger)]" />}
              defaultOpenMobile={false}
              defaultOpenDesktop={true}
              summaryText={`${t(lang, 'پوشش بدهی:', 'Tier-1:')} ${summary.debtFirstWaterfall.tier1CoveredPct}% · ${t(lang, 'استخر بودجه:', 'Pool:')} ${formatMoney(summary.debtFirstWaterfall.tier3GoalAndBudgetPoolIrt, 'IRT', lang, true, isPrivate)}`}
              headerBadge={
                <span className="font-num text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] text-[var(--ft-text-primary)]">
                  {summary.debtFirstWaterfall.tier1CoveredPct}%
                </span>
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-4">
                <p className="text-xs text-[var(--ft-text-muted)]">
                  {t(
                    lang,
                    'نقدینگی بانکی ابتدا برای پوشش کامل اقساط، وام‌ها و بدهی به اشخاص رزرو می‌شود؛ سپس هزینه‌های ثابت و در نهایت بودجه و اهداف.',
                    'Bank liquidity reserves Tier-1 installments & personal debts first, then fixed bills, then budgets & goals.'
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {payoffPlan.priorityQueue[0] && onPayTopPriorityDebt && (
                    <button
                      type="button"
                      onClick={() => {
                        setPriorityPayAccId(state.bankAccounts[0]?.id ?? '');
                        setPriorityPayModalOpen(true);
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>
                        {t(lang, 'پرداخت فوری اولویت #1:', 'Pay #1:')} {payoffPlan.priorityQueue[0].title}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSubTab('planning')}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer shrink-0"
                  >
                    {t(lang, 'مدیریت صف بدهی‌ها', 'Debt Queue')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Tier 1 */}
                <div className="p-4 rounded-2xl glass-tile border-s-4 border-s-[var(--ft-danger)] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--ft-danger)]">
                      {t(lang, '۱. اقساط، بدهی و قرض (اولویت اول)', 'Tier 1 · Installments & Debts')}
                    </span>
                    <span className="font-num font-bold text-[var(--ft-text-primary)]">
                      {summary.debtFirstWaterfall.tier1CoveredPct}%
                    </span>
                  </div>
                  <div className="font-num text-xl font-extrabold text-[var(--ft-text-primary)]">
                    {formatMoney(summary.debtFirstWaterfall.tier1TotalIrt, 'IRT', lang, true, isPrivate)}
                  </div>
                  <StripedProgressBar
                    valuePct={summary.debtFirstWaterfall.tier1CoveredPct}
                    tone={summary.debtFirstWaterfall.isDebtProtected ? 'positive' : 'danger'}
                    heightClass="h-2"
                  />
                  <div className="text-[11px] font-num text-[var(--ft-text-muted)] space-y-0.5">
                    <div>
                      {t(lang, 'اقساط وام/تعهد:', 'Installments:')}{' '}
                      {formatMoney(summary.debtFirstWaterfall.tier1InstallmentsAndLoansIrt, 'IRT', lang, true, isPrivate)}
                    </div>
                    <div>
                      {t(lang, 'بدهی به اشخاص:', 'People Payables:')}{' '}
                      {formatMoney(summary.debtFirstWaterfall.tier1PersonalDebtsIrt, 'IRT', lang, true, isPrivate)}
                    </div>
                  </div>
                </div>

                {/* Tier 2 */}
                <div className="p-4 rounded-2xl glass-tile border-s-4 border-s-[var(--ft-warning)] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--ft-warning)]">
                      {t(lang, '۲. هزینه‌های ثابت ماه (پس از بدهی)', 'Tier 2 · Fixed Monthly Bills')}
                    </span>
                    <span className="font-num font-bold text-[var(--ft-text-primary)]">
                      {summary.debtFirstWaterfall.tier2CoveredPct}%
                    </span>
                  </div>
                  <div className="font-num text-xl font-extrabold text-[var(--ft-text-primary)]">
                    {formatMoney(summary.debtFirstWaterfall.tier2FixedBillsIrt, 'IRT', lang, true, isPrivate)}
                  </div>
                  <StripedProgressBar
                    valuePct={summary.debtFirstWaterfall.tier2CoveredPct}
                    tone={summary.debtFirstWaterfall.tier2CoveredPct >= 100 ? 'accent' : 'warning'}
                    heightClass="h-2"
                  />
                  <div className="text-[11px] text-[var(--ft-text-muted)]">
                    {t(lang, 'تأمین از مانده نقدینگی پس از کسر رزرو اقساط و بدهی‌های Tier 1', 'Funded from remaining bank cash after Tier-1 debt reserve')}
                  </div>
                </div>

                {/* Tier 3 */}
                <div className="p-4 rounded-2xl glass-tile border-s-4 border-s-[var(--ft-positive)] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--ft-positive)]">
                      {t(lang, '۳. استخر مجاز بودجه و اهداف', 'Tier 3 · Budgets & Goals Pool')}
                    </span>
                    <span className="font-num font-bold text-[var(--ft-positive)]">
                      {summary.debtFirstWaterfall.isDebtProtected
                        ? t(lang, 'ایمن', 'Protected')
                        : t(lang, 'محدود', 'Capped')}
                    </span>
                  </div>
                  <div className="font-num text-xl font-extrabold text-[var(--ft-positive)]">
                    {formatMoney(summary.debtFirstWaterfall.tier3GoalAndBudgetPoolIrt, 'IRT', lang, true, isPrivate)}
                  </div>
                  <StripedProgressBar
                    valuePct={
                      summary.totalBankIrt > 0
                        ? Math.round((summary.debtFirstWaterfall.tier3GoalAndBudgetPoolIrt / summary.totalBankIrt) * 100)
                        : 0
                    }
                    tone="positive"
                    heightClass="h-2"
                  />
                  <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
                    {t(lang, 'قابل خرج آزاد نهایی:', 'Discretionary Free Cash:')}{' '}
                    {formatMoney(summary.debtFirstWaterfall.discretionaryLeftAfterGoalsIrt, 'IRT', lang, true, isPrivate)}
                  </div>
                </div>
              </div>
            </M3AccordionCard>

            {/* Budget Pacing Overview (Accordion on Mobile, Open on Desktop) */}
            <M3AccordionCard
              title={t(lang, 'پایش بودجه‌ها', 'Budget Pacing')}
              defaultOpenMobile={false}
              defaultOpenDesktop={true}
              summaryText={`${summary.budgetStatuses.length} ${t(lang, 'دسته فعال ماه جاری', 'active caps')}`}
            >
              <div className="flex items-center justify-end pt-2 pb-4">
                <button
                  type="button"
                  onClick={onConfirmBudgetDay}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
                >
                  {t(lang, 'تایید انضباط بودجه امروز (+XP کمبو)', 'Confirm Under-Budget Day (+Combo)')}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                {summary.budgetStatuses.map((bs) => (
                  <div
                    key={bs.budget.id}
                    className="p-4 rounded-2xl glass-tile space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--ft-text-primary)]">
                        {bs.budget.categoryName}
                      </span>
                      <span
                        className={`font-num text-xs font-semibold ${
                          bs.paceStatus === 'exceeded'
                            ? 'text-[var(--ft-danger)]'
                            : bs.paceStatus === 'warning'
                            ? 'text-[var(--ft-warning)]'
                            : 'text-[var(--ft-positive)]'
                        }`}
                      >
                        {bs.utilizationPct}%
                      </span>
                    </div>
                    <StripedProgressBar
                      valuePct={bs.utilizationPct}
                      tone={
                        bs.paceStatus === 'exceeded'
                          ? 'danger'
                          : bs.paceStatus === 'warning'
                          ? 'warning'
                          : 'positive'
                      }
                      heightClass="h-2.5"
                    />
                    <div className="flex items-center justify-between text-xs text-[var(--ft-text-muted)] font-num">
                      <span>
                        {formatMoney(bs.spentAmount, bs.currency, lang, true, isPrivate)} /{' '}
                        {formatMoney(bs.capAmount, bs.currency, lang, true, isPrivate)}
                      </span>
                      <span>
                        {t(lang, 'سپری‌شده ماه:', 'Month pace:')} {bs.pacePct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </M3AccordionCard>
          </div>
        );
      })()}

      {/* 2. Transactions Ledger */}
      {subTab === 'transactions' && (
        <section className="glass-surface rounded-3xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--ft-border)]">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
              {(
                [
                  ['all', t(lang, 'همه', 'All')],
                  ['in', t(lang, 'واریز', 'Income')],
                  ['out', t(lang, 'هزینه / برداشت', 'Expense')],
                  ['transfer', t(lang, 'انتقال داخلی', 'Transfer')],
                ] as Array<['all' | TransactionType, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTxTypeFilter(id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                    txTypeFilter === id
                      ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)]'
                      : 'text-[var(--ft-text-secondary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="font-num text-xs text-[var(--ft-text-muted)]">
              {filteredTransactions.length} {t(lang, 'رکورد', 'entries')}
            </span>
          </div>

          <div className="divide-y divide-[var(--ft-border)]">
            {filteredTransactions.map((tx) => {
              const accName =
                state.bankAccounts.find((a) => a.id === tx.accountId)?.name ?? '';
              const toAccName = tx.toAccountId
                ? state.bankAccounts.find((a) => a.id === tx.toAccountId)?.name ?? '—'
                : null;
              const creditLineName = tx.creditLineId
                ? (state.creditLines ?? []).find((c) => c.id === tx.creditLineId)?.title
                : null;
              const personName = tx.personId
                ? (state.people ?? []).find((p) => p.id === tx.personId)?.name
                : null;
              const budName = tx.budgetCategoryId
                ? state.budgetCaps.find((b) => b.id === tx.budgetCategoryId)?.categoryName
                : null;

              const originLabel =
                tx.paymentMethod === 'credit'
                  ? `${t(lang, 'اعتبار', 'Credit')}: ${creditLineName ?? t(lang, 'اقساطی', 'BNPL')}${
                      tx.installmentCount ? ` (${tx.installmentCount} ${t(lang, 'قسطه', 'inst')})` : ''
                    }`
                  : tx.paymentMethod === 'person_debt'
                  ? `${t(lang, 'قرض از', 'Borrowed from')} ${personName ?? t(lang, 'شخص', 'Person')}`
                  : tx.paymentMethod === 'cash'
                  ? `${t(lang, 'نقدی', 'Cash')}${accName ? ` · ${accName}` : ''}`
                  : tx.paymentMethod === 'usd'
                  ? `${t(lang, 'حساب دلاری', 'USD Wallet')}${accName ? ` · ${accName}` : ''}`
                  : accName || t(lang, 'حساب بانکی', 'Bank');

              return (
                <div
                  key={tx.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ft-text-primary)]">
                      <span>{tx.note || (tx.type === 'in' ? t(lang, 'واریز وجه', 'Deposit') : tx.type === 'transfer' ? t(lang, 'انتقال بین حساب', 'Transfer') : t(lang, 'هزینه', 'Expense'))}</span>
                      {tx.categoryLabel && (
                        <span className="text-xs text-[var(--ft-accent)]">· {tx.categoryLabel}</span>
                      )}
                      {budName && !tx.categoryLabel && (
                        <span className="text-xs text-[var(--ft-accent)]">· {budName}</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--ft-text-muted)]">
                      {originLabel}
                      {toAccName ? ` → ${toAccName}` : ''} · {formatJalaliDate(tx.date, lang)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div
                      className={`font-num text-sm font-semibold ${
                        tx.type === 'in'
                          ? 'text-[var(--ft-positive)]'
                          : tx.type === 'transfer'
                          ? 'text-[var(--ft-accent)]'
                          : 'text-[var(--ft-danger)]'
                      }`}
                    >
                      {!isPrivate && (tx.type === 'in' ? '+' : tx.type === 'out' ? '-' : '')}
                      {formatMoney(tx.amount, tx.currency, lang, false, isPrivate)}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditTransaction(tx)}
                        className="p-2 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-muted)] hover:text-[var(--ft-text-primary)] cursor-pointer"
                        aria-label="Edit transaction"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(tx.id)}
                        className="p-2 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                        aria-label="Delete transaction"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Bank Accounts, Wallets & Credit Lines */}
      {subTab === 'accounts' && (
        <section className="glass-surface rounded-3xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--ft-border)]">
            <div>
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                {t(lang, 'حساب‌های بانکی، کیف پول و اعتبارات اقساطی', 'Bank, Wallet & Credit Accounts')}
              </h3>
              <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                {t(
                  lang,
                  'تعریف منابع مالی (بانکی، نقدی، دلاری) و خطوط اعتبار اقساطی برای ثبت هزینه و مدیریت مانده',
                  'Manage liquid accounts and BNPL credit lines from one unified workflow'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openUnifiedAccountModal('bank_wallet')}
              className="px-4 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t(lang, 'افزودن حساب / اعتبار', 'Add Account / Credit')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {state.bankAccounts.map((acc) => (
              <div
                key={acc.id}
                className="p-5 rounded-2xl glass-tile flex flex-col justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--ft-text-muted)] flex items-center gap-1.5">
                      {acc.type === 'bank' ? (
                        <Landmark className="w-3.5 h-3.5" />
                      ) : acc.type === 'wallet' ? (
                        <Wallet className="w-3.5 h-3.5" />
                      ) : (
                        <CreditCard className="w-3.5 h-3.5" />
                      )}
                      {acc.type === 'bank'
                        ? t(lang, 'بانکی', 'Bank')
                        : acc.type === 'wallet'
                        ? t(lang, 'کیف پول', 'Wallet')
                        : t(lang, 'نقد', 'Cash')}
                    </span>
                    <span className="font-num text-xs text-[var(--ft-accent)]">{acc.currency}</span>
                  </div>
                  <h4 className="text-base font-semibold text-[var(--ft-text-primary)]">{acc.name}</h4>
                  <p className="text-xs text-[var(--ft-text-muted)]">{acc.note || '—'}</p>
                </div>

                <div className="space-y-3">
                  <div className="font-num text-xl font-bold text-[var(--ft-text-primary)]">
                    {formatMoney(acc.balance, acc.currency, lang, false, isPrivate)}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--ft-border)]">
                    <button
                      type="button"
                      onClick={() => setHistoryAccount(acc)}
                      className="text-xs font-medium text-[var(--ft-accent)] hover:underline cursor-pointer"
                    >
                      {t(lang, 'تاریخچه تراکنش‌ها', 'View Ledger')}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openUnifiedAccountModal('bank_wallet', acc)}
                        className="p-1.5 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-muted)] cursor-pointer"
                        aria-label="Edit account"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteBankAccount(acc.id)}
                        className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                        aria-label="Delete account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Credit Lines subsection inside Accounts */}
          <div className="pt-5 border-t border-[var(--ft-border)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[var(--ft-accent)]" />
                <h4 className="text-sm font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'خطوط اعتبار اقساطی تعریف‌شده (BNPL)', 'Defined Credit Lines (BNPL)')}
                </h4>
              </div>
              <span className="font-num text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'اعتبار آزاد کل:', 'Total Available:')}{' '}
                <strong className="text-[var(--ft-positive)]">
                  {formatMoney(summary.creditAvailableIrt, 'IRT', lang, true, isPrivate)}
                </strong>
              </span>
            </div>

            {summary.creditLinesStatus.length === 0 ? (
              <div className="p-5 rounded-2xl glass-tile flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--ft-text-muted)]">
                <span>
                  {t(
                    lang,
                    'هنوز اعتبار اقساطی (دیجی‌پی، اسنپ‌پی، تارا...) تعریف نکرده‌اید.',
                    'No BNPL credit lines defined yet.'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => openUnifiedAccountModal('credit')}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-primary)] font-semibold cursor-pointer"
                >
                  + {t(lang, 'تعریف اعتبار اقساطی', 'Add Credit Line')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {summary.creditLinesStatus.map(({ line, usedAmount, availableAmount, utilizationPct }) => {
                  const providerLabel =
                    line.provider === 'digipay'
                      ? t(lang, 'دیجی‌پی', 'Digipay')
                      : line.provider === 'snapppay'
                      ? t(lang, 'اسنپ‌پی', 'SnappPay')
                      : line.provider === 'tara'
                      ? t(lang, 'تارا', 'Tara')
                      : line.provider === 'card'
                      ? t(lang, 'کارت اعتباری', 'Credit Card')
                      : t(lang, 'سایر', 'Other');

                  return (
                    <div
                      key={line.id}
                      className="p-5 rounded-2xl glass-tile flex flex-col justify-between gap-3.5"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--ft-accent)] font-medium">
                            {providerLabel} · {line.defaultInstallments} {t(lang, 'قسط', 'inst')}
                          </span>
                          <span className="font-num text-[var(--ft-text-muted)]">
                            {t(lang, `سررسید ${line.dueDayOfMonth}ام`, `Day ${line.dueDayOfMonth}`)}
                          </span>
                        </div>
                        <h4 className="text-base font-semibold text-[var(--ft-text-primary)] truncate">
                          {line.title}
                        </h4>
                        <p className="text-xs text-[var(--ft-text-muted)] truncate">{line.note || '—'}</p>
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-baseline justify-between font-num">
                          <div className="text-base font-bold text-[var(--ft-positive)]">
                            {formatMoney(availableAmount, line.currency, lang, true, isPrivate)}
                          </div>
                          <div className="text-xs text-[var(--ft-text-muted)]">
                            / {formatMoney(line.creditLimit, line.currency, lang, true, isPrivate)}
                          </div>
                        </div>
                        <StripedProgressBar
                          valuePct={utilizationPct}
                          tone={utilizationPct > 85 ? 'danger' : utilizationPct > 60 ? 'warning' : 'accent'}
                          heightClass="h-2"
                        />
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)] text-xs">
                          <span className="font-num text-[var(--ft-text-muted)]">
                            {t(lang, 'مصرف:', 'Used:')} {formatMoney(usedAmount, line.currency, lang, true, isPrivate)}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openUnifiedAccountModal('credit', undefined, line)}
                              className="p-1.5 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-muted)] cursor-pointer"
                              aria-label="Edit credit line"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteCreditLine(line.id)}
                              className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                              aria-label="Delete credit line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3b. People & Counterparty Ledgers */}
      {subTab === 'people' && (
        <div className="space-y-6">
          {/* Top Overview Strip */}
          <section className="glass-surface rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[var(--ft-border)]">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-[var(--ft-accent)]" />
                <div>
                  <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'دفتر حساب اشخاص', 'People Ledgers')}
                  </h3>
                  <p className="text-xs text-[var(--ft-text-muted)]">
                    {t(
                      lang,
                      'مدیریت طلب و بدهی اشخاص با تفکیک دقیق تومانی و دلاری',
                      'Track per-person receivables & payables by currency'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openPersonModal()}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t(lang, 'شخص جدید', 'Add Person')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => openPersonEntryModal()}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>{t(lang, 'ثبت نقل‌وانتقال', 'Log Transfer')}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-5">
              <div className="p-4 rounded-2xl glass-tile space-y-1">
                <span className="text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'طلب ما از اشخاص', 'Total Receivables')}
                </span>
                <div className="font-num text-xl font-bold text-[var(--ft-positive)]">
                  {isPrivate
                    ? formatMoney(peopleOverview.totalReceivableIrtOnly, 'IRT', lang, false, true)
                    : `+${formatMoney(peopleOverview.totalReceivableIrtOnly, 'IRT', lang)}`}
                </div>
                {peopleOverview.totalReceivableUsdOnly > 0 && (
                  <div className="font-num text-xs font-semibold text-[var(--ft-positive)]">
                    + {formatMoney(peopleOverview.totalReceivableUsdOnly, 'USD', lang, false, isPrivate)}
                  </div>
                )}
              </div>
              <div className="p-4 rounded-2xl glass-tile space-y-1">
                <span className="text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'بدهی ما به اشخاص', 'Total Payables')}
                </span>
                <div className="font-num text-xl font-bold text-[var(--ft-danger)]">
                  {isPrivate
                    ? formatMoney(peopleOverview.totalPayableIrtOnly, 'IRT', lang, false, true)
                    : `-${formatMoney(peopleOverview.totalPayableIrtOnly, 'IRT', lang)}`}
                </div>
                {peopleOverview.totalPayableUsdOnly > 0 && (
                  <div className="font-num text-xs font-semibold text-[var(--ft-danger)]">
                    - {formatMoney(peopleOverview.totalPayableUsdOnly, 'USD', lang, false, isPrivate)}
                  </div>
                )}
              </div>
              <div className="p-4 rounded-2xl glass-tile space-y-1">
                <span className="text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'تراز خالص اشخاص', 'Net People Balance')}
                </span>
                {(() => {
                  const netIrt = peopleOverview.totalReceivableIrtOnly - peopleOverview.totalPayableIrtOnly;
                  const netUsd = Number(
                    (peopleOverview.totalReceivableUsdOnly - peopleOverview.totalPayableUsdOnly).toFixed(2)
                  );
                  return (
                    <>
                      <div
                        className={`font-num text-xl font-bold ${
                          netIrt >= 0 ? 'text-[var(--ft-accent)]' : 'text-[var(--ft-warning)]'
                        }`}
                      >
                        {!isPrivate && netIrt >= 0 ? '+' : ''}
                        {formatMoney(netIrt, 'IRT', lang, false, isPrivate)}
                      </div>
                      {(peopleOverview.totalReceivableUsdOnly > 0 || peopleOverview.totalPayableUsdOnly > 0) && (
                        <div className="font-num text-xs font-semibold text-[var(--ft-text-secondary)]">
                          {!isPrivate && netUsd >= 0 ? '+' : ''}
                          {formatMoney(netUsd, 'USD', lang, false, isPrivate)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* Master-Detail Split: Left (People Directory) & Right (Selected Person Statement) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 5 cols: Searchable Counterparties */}
            <section className="lg:col-span-5 glass-surface rounded-2xl p-5 space-y-4">
              <MaterialInput
                type="text"
                fieldSize="sm"
                startIcon={<Search className="w-3.5 h-3.5" />}
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                placeholder={t(lang, 'جستجوی نام یا یادداشت شخص...', 'Search people...')}
              />

              {filteredPersonLedgers.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'هنوز شخصی تعریف نشده است. دکمه «تعریف شخص جدید» را بزنید.', 'No people found. Add a person to begin.')}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredPersonLedgers.map((item) => {
                    const isSelected = activePersonLedger?.person.id === item.person.id;
                    const roleLabels: Record<PersonRole, string> = {
                      partner: t(lang, 'شریک / هم‌تیم', 'Partner'),
                      client: t(lang, 'مشتری / صرافی', 'Client / Exchange'),
                      friend: t(lang, 'دوست', 'Friend'),
                      family: t(lang, 'خانواده', 'Family'),
                      other: t(lang, 'سایر', 'Other'),
                    };

                    return (
                      <div
                        key={item.person.id}
                        onClick={() => setSelectedPersonId(item.person.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                          isSelected
                            ? 'border-[var(--ft-accent)] bg-[var(--ft-accent-soft)]'
                            : 'border-[var(--ft-border)] bg-[var(--ft-surface-subtle)] hover:border-[var(--ft-border-strong)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--ft-text-primary)] truncate">
                              {item.person.name}
                            </div>
                            <div className="text-[11px] text-[var(--ft-text-muted)]">
                              {roleLabels[item.person.role]}
                              {item.person.phone ? ` · ${item.person.phone}` : ''}
                            </div>
                          </div>
                          <div className="text-end shrink-0">
                            <div
                              className={`font-num text-sm font-bold ${
                                item.status === 'receivable'
                                  ? 'text-[var(--ft-positive)]'
                                  : item.status === 'payable'
                                  ? 'text-[var(--ft-danger)]'
                                  : 'text-[var(--ft-text-muted)]'
                              }`}
                            >
                              {item.netIrtOnly !== 0 || item.netUsdOnly === 0 ? (
                                <>
                                  {!isPrivate && item.netIrtOnly > 0 ? '+' : ''}
                                  {formatMoney(item.netIrtOnly, 'IRT', lang, true, isPrivate)}
                                </>
                              ) : null}
                            </div>
                            {item.netUsdOnly !== 0 && (
                              <div className="font-num text-xs font-semibold text-[var(--ft-text-secondary)]">
                                {!isPrivate && item.netUsdOnly > 0 ? '+' : ''}
                                {formatMoney(item.netUsdOnly, 'USD', lang, true, isPrivate)}
                              </div>
                            )}
                            <div className="text-[10px] text-[var(--ft-text-muted)]">
                              {item.status === 'receivable'
                                ? t(lang, 'طلبکاریم', 'Owes us')
                                : item.status === 'payable'
                                ? t(lang, 'بدهکاریم', 'We owe')
                                : t(lang, 'تسویه', 'Settled')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)] text-[11px]">
                          <span className="font-num text-[var(--ft-text-muted)]">
                            {item.entryCount} {t(lang, 'گردش', 'entries')}
                          </span>
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.status !== 'settled' && (
                              <button
                                type="button"
                                onClick={() =>
                                  openPersonEntryModal(
                                    item.person.id,
                                    item.status === 'receivable' ? 'receive' : 'give',
                                    Math.abs(item.netBalanceIrt),
                                    t(lang, `تسویه کامل حساب ${item.person.name}`, `Full settlement with ${item.person.name}`)
                                  )
                                }
                                className="px-2 py-1 rounded-lg bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] font-semibold cursor-pointer"
                              >
                                {t(lang, 'تسویه', 'Settle')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openPersonModal(item.person)}
                              className="p-1.5 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-muted)] cursor-pointer"
                              aria-label="Edit person"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeletePerson(item.person.id)}
                              className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                              aria-label="Delete person"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Right 7 cols: Active Person Detailed Ledger & Chronological Running Statement */}
            <section className="lg:col-span-7 glass-surface rounded-2xl p-6 space-y-5">
              {!activePersonLedger ? (
                <div className="py-16 text-center text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'یک شخص را انتخاب کنید یا شخص جدید بسازید تا دفتر حساب نمایش داده شود.', 'Select or add a person to view their running ledger.')}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
                    <div>
                      <h3 className="text-lg font-bold text-[var(--ft-text-primary)]">
                        {t(lang, 'دفتر حساب:', 'Ledger:')} {activePersonLedger.person.name}
                      </h3>
                      <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                        {activePersonLedger.person.note || t(lang, 'تاریخچه کامل نقل‌وانتقال و مانده‌گیری', 'Full transfer & running balance history')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPersonEntryModal(activePersonLedger.person.id, 'give')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5 text-[var(--ft-positive)]" />
                        <span>{t(lang, 'پرداخت / ثبت طلب', 'Give / Paid')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openPersonEntryModal(activePersonLedger.person.id, 'receive')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--ft-danger)]" />
                        <span>{t(lang, 'دریافت / ثبت بدهی', 'Receive')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Person Balance & Totals Strip */}
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
                      <span className="text-[var(--ft-text-muted)] block">
                        {t(lang, 'مجموع پرداختی ما', 'Total Given')}
                      </span>
                      <span className="font-num text-sm font-bold text-[var(--ft-positive)]">
                        {isPrivate ? formatMoney(activePersonLedger.totalGivenIrt, 'IRT', lang, true, true) : `+${formatMoney(activePersonLedger.totalGivenIrt, 'IRT', lang, true)}`}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
                      <span className="text-[var(--ft-text-muted)] block">
                        {t(lang, 'مجموع دریافتی ما', 'Total Received')}
                      </span>
                      <span className="font-num text-sm font-bold text-[var(--ft-danger)]">
                        {isPrivate ? formatMoney(activePersonLedger.totalReceivedIrt, 'IRT', lang, true, true) : `-${formatMoney(activePersonLedger.totalReceivedIrt, 'IRT', lang, true)}`}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
                      <span className="text-[var(--ft-text-muted)] block">
                        {t(lang, 'مانده نهایی حساب', 'Net Balance')}
                      </span>
                      <span
                        className={`font-num text-sm font-bold ${
                          activePersonLedger.status === 'receivable'
                            ? 'text-[var(--ft-positive)]'
                            : activePersonLedger.status === 'payable'
                            ? 'text-[var(--ft-danger)]'
                            : 'text-[var(--ft-text-primary)]'
                        }`}
                      >
                        {!isPrivate && activePersonLedger.netBalanceIrt > 0 ? '+' : ''}
                        {formatMoney(activePersonLedger.netBalanceIrt, 'IRT', lang, false, isPrivate)}
                      </span>
                    </div>
                  </div>

                  {/* Running Balance History Table */}
                  {activePersonLedger.statement.length === 0 ? (
                    <div className="py-10 text-center text-xs text-[var(--ft-text-muted)]">
                      {t(lang, 'هنوز هیچ نقل‌وانتقالی برای این شخص ثبت نشده است.', 'No ledger entries recorded for this person yet.')}
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards (< sm) */}
                      <div className="sm:hidden space-y-2.5">
                        {activePersonLedger.statement.map(({ entry, runningBalanceIrt }) => {
                          const accName = entry.accountId
                            ? state.bankAccounts.find((a) => a.id === entry.accountId)?.name
                            : null;
                          const isGive = entry.direction === 'give';
                          return (
                            <div key={`mob_ent_${entry.id}`} className="p-3.5 rounded-2xl glass-tile space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                                    {entry.note ||
                                      (isGive
                                        ? t(lang, 'پرداخت / انتقال به شخص', 'Paid to person')
                                        : t(lang, 'دریافت از شخص', 'Received from person'))}
                                  </div>
                                  <div className="text-[11px] text-[var(--ft-text-muted)]">
                                    {accName
                                      ? `${t(lang, 'حساب:', 'Account:')} ${accName}`
                                      : t(lang, 'ثبت دفتری بدون حساب بانکی', 'Ledger-only entry')}
                                  </div>
                                </div>
                                <div
                                  className={`text-xs font-num font-bold whitespace-nowrap shrink-0 ${
                                    isGive ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                                  }`}
                                >
                                  {!isPrivate && (isGive ? '+' : '-')}
                                  {formatMoney(entry.amount, entry.currency, lang, false, isPrivate)}
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)] text-[11px] font-num">
                                <span className="text-[var(--ft-text-muted)]">
                                  {formatJalaliDate(entry.date, lang)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-[var(--ft-text-primary)]">
                                    {t(lang, 'مانده:', 'Bal:')}{' '}
                                    {!isPrivate && runningBalanceIrt > 0 ? '+' : ''}
                                    {formatMoney(runningBalanceIrt, 'IRT', lang, true, isPrivate)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onDeletePersonEntry(entry.id)}
                                    className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                                    aria-label="Delete ledger entry"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table (>= sm) */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[var(--ft-text-muted)] bg-[var(--ft-surface-subtle)]">
                              <th className="py-2.5 px-3 text-start font-medium rounded-s-xl">
                                {t(lang, 'تاریخ', 'Date')}
                              </th>
                              <th className="py-2.5 px-3 text-start font-medium">
                                {t(lang, 'شرح و حساب متصل', 'Description & Account')}
                              </th>
                              <th className="py-2.5 px-3 text-start font-medium">
                                {t(lang, 'مبلغ گردش', 'Amount')}
                              </th>
                              <th className="py-2.5 px-3 text-start font-medium">
                                {t(lang, 'مانده لحظه‌ای', 'Running Bal')}
                              </th>
                              <th className="py-2.5 px-3 text-end font-medium rounded-e-xl" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--ft-border)]">
                            {activePersonLedger.statement.map(({ entry, runningBalanceIrt }) => {
                              const accName = entry.accountId
                                ? state.bankAccounts.find((a) => a.id === entry.accountId)?.name
                                : null;
                              const isGive = entry.direction === 'give';
                              return (
                                <tr key={entry.id} className="hover:bg-[var(--ft-surface-hover)]">
                                  <td className="py-3 px-3 font-num text-[var(--ft-text-muted)] whitespace-nowrap">
                                    {formatJalaliDate(entry.date, lang)}
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="font-medium text-[var(--ft-text-primary)]">
                                      {entry.note ||
                                        (isGive
                                          ? t(lang, 'پرداخت / انتقال به شخص', 'Paid to person')
                                          : t(lang, 'دریافت از شخص', 'Received from person'))}
                                    </div>
                                    <div className="text-[11px] text-[var(--ft-text-muted)]">
                                      {accName
                                        ? `${t(lang, 'حساب:', 'Account:')} ${accName}`
                                        : t(lang, 'ثبت دفتری بدون حساب بانکی', 'Ledger-only entry')}
                                    </div>
                                  </td>
                                  <td
                                    className={`py-3 px-3 font-num font-bold whitespace-nowrap ${
                                      isGive ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                                    }`}
                                  >
                                    {!isPrivate && (isGive ? '+' : '-')}
                                    {formatMoney(entry.amount, entry.currency, lang, false, isPrivate)}
                                  </td>
                                  <td className="py-3 px-3 font-num font-semibold text-[var(--ft-text-primary)] whitespace-nowrap">
                                    {!isPrivate && runningBalanceIrt > 0 ? '+' : ''}
                                    {formatMoney(runningBalanceIrt, 'IRT', lang, true, isPrivate)}
                                  </td>
                                  <td className="py-3 px-3 text-end">
                                    <button
                                      type="button"
                                      onClick={() => onDeletePersonEntry(entry.id)}
                                      className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                                      aria-label="Delete ledger entry"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {/* 4. Credits, Installments, Bills & Jalali Financial Calendar */}
      {subTab === 'planning' && (
        <div className="space-y-6">
          {/* SECTION 1: Credit Lines & BNPL Manager (Digipay, SnappPay, Tara...) */}
          <section className="glass-surface rounded-3xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[var(--ft-accent)]" />
                  <span>{t(lang, 'اعتبارات خرید اقساطی (دیجی‌پی، اسنپ‌پی، تارا و...)', 'Credit Lines & BNPL')}</span>
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                  {t(
                    lang,
                    'با ثبت خرید از هر خط اعتبار، میزان اعتبار آزاد به‌روزرسانی شده و اقساط ماهانه خودکار زمان‌بندی می‌شوند.',
                    'Credit expenses automatically reduce available limit and schedule monthly installments.'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-num">
                <div>
                  <span className="text-[var(--ft-text-muted)]">{t(lang, 'سقف کل:', 'Total Limit:')} </span>
                  <span className="font-bold text-[var(--ft-text-primary)]">
                    {formatMoney(summary.creditTotalLimitIrt, 'IRT', lang, true, isPrivate)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--ft-text-muted)]">{t(lang, 'مصرف‌شده:', 'Used:')} </span>
                  <span className="font-bold text-[var(--ft-warning)]">
                    {formatMoney(summary.creditUsedIrt, 'IRT', lang, true, isPrivate)}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--ft-text-muted)]">{t(lang, 'اعتبار آزاد:', 'Available:')} </span>
                  <span className="font-bold text-[var(--ft-positive)]">
                    {formatMoney(summary.creditAvailableIrt, 'IRT', lang, true, isPrivate)}
                  </span>
                </div>
              </div>
            </div>

            {summary.creditLinesStatus.length === 0 ? (
              <div className="py-8 text-center space-y-2.5">
                <p className="text-xs text-[var(--ft-text-muted)]">
                  {t(
                    lang,
                    'هنوز خط اعتباری تعریف نکرده‌اید. می‌توانید از بخش «حساب‌ها» خط اعتبار جدید (دیجی‌پی، اسنپ‌پی...) اضافه کنید.',
                    'No credit lines configured yet. Define BNPL credit lines inside the Accounts tab.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setSubTab('accounts')}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer"
                >
                  {t(lang, 'مدیریت در بخش حساب‌ها', 'Go to Accounts')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {summary.creditLinesStatus.map(({ line, usedAmount, availableAmount, utilizationPct, activePlansCount }) => {
                  const providerLabel =
                    line.provider === 'digipay'
                      ? t(lang, 'دیجی‌پی', 'Digipay')
                      : line.provider === 'snapppay'
                      ? t(lang, 'اسنپ‌پی', 'SnappPay')
                      : line.provider === 'tara'
                      ? t(lang, 'تارا', 'Tara')
                      : line.provider === 'card'
                      ? t(lang, 'کارت اعتباری', 'Credit Card')
                      : t(lang, 'سایر', 'Other');

                  return (
                    <div
                      key={line.id}
                      className="p-4 rounded-2xl glass-tile flex flex-col justify-between gap-3.5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-[var(--ft-accent)]">
                              {providerLabel} · {line.defaultInstallments} {t(lang, 'قسط پیش‌فرض', 'inst. default')} ·{' '}
                              {t(lang, `سررسید روز ${line.dueDayOfMonth}`, `Due day ${line.dueDayOfMonth}`)}
                            </div>
                            <h4 className="text-sm font-bold text-[var(--ft-text-primary)] truncate mt-0.5">
                              {line.title}
                            </h4>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openUnifiedAccountModal('credit', undefined, line)}
                              className="p-1.5 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-muted)] cursor-pointer"
                              aria-label="Edit credit line"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteCreditLine(line.id)}
                              className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer"
                              aria-label="Delete credit line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-baseline justify-between font-num text-xs">
                          <div>
                            <div className="text-[10px] text-[var(--ft-text-muted)]">
                              {t(lang, 'اعتبار آزاد قابل استفاده', 'Available Credit')}
                            </div>
                            <div className="text-base font-extrabold text-[var(--ft-positive)]">
                              {formatMoney(availableAmount, line.currency, lang, true, isPrivate)}
                            </div>
                          </div>
                          <div className="text-end">
                            <div className="text-[10px] text-[var(--ft-text-muted)]">
                              {t(lang, 'سقف کل اعتبار', 'Credit Limit')}
                            </div>
                            <div className="text-xs font-semibold text-[var(--ft-text-secondary)]">
                              {formatMoney(line.creditLimit, line.currency, lang, true, isPrivate)}
                            </div>
                          </div>
                        </div>

                        <StripedProgressBar
                          valuePct={utilizationPct}
                          tone={utilizationPct > 85 ? 'danger' : utilizationPct > 60 ? 'warning' : 'accent'}
                          heightClass="h-2"
                        />

                        <div className="flex items-center justify-between text-[11px] font-num text-[var(--ft-text-muted)]">
                          <span>
                            {t(lang, 'بدهی اقساطی فعال:', 'Used:')}{' '}
                            {formatMoney(usedAmount, line.currency, lang, true, isPrivate)} ({utilizationPct}%)
                          </span>
                          <span>
                            {activePlansCount} {t(lang, 'خرید باز', 'open')}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openNewTransaction({ paymentMethod: 'credit', creditLineId: line.id })}
                        className="w-full py-2 text-xs font-semibold rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-accent)] hover:text-[var(--ft-accent-fg)] hover:border-transparent transition-colors cursor-pointer"
                      >
                        + {t(lang, 'ثبت خرید با این اعتبار', 'Spend from this Credit')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SECTION 2: Installments, Loans & Debt Payoff Planner */}
          <section className="glass-surface rounded-3xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'اقساط اعتبارات، وام‌ها و بدهی‌های فعال', 'Installments & Debt Payoff Queue')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)] font-num mt-0.5">
                  {t(lang, 'کل تعهد باقی‌مانده (وام + اقساط اعتباری + اشخاص):', 'Total remaining debt:')}{' '}
                  {formatMoney(payoffPlan.totalRemainingIrt, 'IRT', lang, false, isPrivate)} ·{' '}
                  {t(lang, 'تسویه کامل در', 'Debt-free in')} {payoffPlan.estimatedMonthsToDebtFree}{' '}
                  {t(lang, 'ماه جلالی', 'months')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLTitle('');
                    setLTotalAmount('');
                    setLInstallmentAmount('');
                    setLoanModalOpen(true);
                  }}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t(lang, 'ثبت وام / بدهی', 'Add Loan / Debt')}</span>
                </button>
                {payoffPlan.priorityQueue[0] && onPayTopPriorityDebt && (
                  <button
                    type="button"
                    onClick={() => {
                      setPriorityPayAccId(state.bankAccounts[0]?.id ?? '');
                      setPriorityPayModalOpen(true);
                    }}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>{t(lang, 'پرداخت یک‌کلیکی اولویت #1', 'Pay #1 Top Priority')}</span>
                  </button>
                )}
                <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
                  <button
                    type="button"
                    onClick={() => setPayoffStrategy('avalanche')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                      payoffStrategy === 'avalanche'
                        ? 'ft-accent-gradient font-semibold'
                        : 'text-[var(--ft-text-secondary)]'
                    }`}
                  >
                    {t(lang, 'بهمن (اولویت فشار)', 'Avalanche')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoffStrategy('snowball')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                      payoffStrategy === 'snowball'
                        ? 'ft-accent-gradient font-semibold'
                        : 'text-[var(--ft-text-secondary)]'
                    }`}
                  >
                    {t(lang, 'گلوله برفی (کمترین مانده)', 'Snowball')}
                  </button>
                </div>
              </div>
            </div>

            {payoffPlan.priorityQueue.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-[var(--ft-text-secondary)]">
                  {t(lang, 'ترتیب پیشنهادی پرداخت اقساط و بدهی‌ها:', 'Unified Debt-First Payment Queue:')}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {payoffPlan.priorityQueue.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-2xl glass-tile flex items-center justify-between gap-3 ${
                        idx === 0 ? 'border-[var(--ft-danger)] ring-1 ring-[var(--ft-danger)]/40' : ''
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`font-num font-bold ${
                              idx === 0 ? 'text-[var(--ft-danger)]' : 'text-[var(--ft-accent)]'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <span className="text-[var(--ft-text-muted)]">
                            {item.kind === 'loan_installment'
                              ? t(lang, 'قسط / تعهد', 'Installment')
                              : t(lang, 'بدهی به شخص', 'Personal Debt')}
                          </span>
                          {idx === 0 && (
                            <span className="text-[11px] font-semibold text-[var(--ft-danger)]">
                              · {t(lang, 'بالاترین اولویت', 'Highest Priority')}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-[var(--ft-text-primary)] truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
                          {t(lang, 'مبلغ سررسید:', 'Due:')}{' '}
                          {formatMoney(item.dueAmountIrt, 'IRT', lang, true, isPrivate)} ·{' '}
                          {t(lang, 'مانده کل:', 'Remaining:')}{' '}
                          {formatMoney(item.totalRemainingIrt, 'IRT', lang, true, isPrivate)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (item.kind === 'loan_installment' && item.loanId) {
                            const found = state.loans.find((l) => l.id === item.loanId);
                            if (found) {
                              setPayingLoan(found);
                              setPayAccountId(state.bankAccounts[0]?.id ?? '');
                            }
                          } else if (item.kind === 'personal_debt' && item.personId) {
                            openPersonEntryModal(
                              item.personId,
                              'give',
                              item.dueAmountIrt,
                              t(lang, `تسویه اولویت بدهی: ${item.title}`, `Debt settlement: ${item.title}`)
                            );
                          }
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl shrink-0 cursor-pointer ${
                          idx === 0
                            ? 'ft-accent-gradient'
                            : 'border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-primary)]'
                        }`}
                      >
                        {item.kind === 'loan_installment'
                          ? t(lang, 'پرداخت قسط', 'Pay')
                          : t(lang, 'تسویه بدهی', 'Settle')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {state.loans.map((loan) => {
                const pct = Math.round((loan.paidInstallments / Math.max(1, loan.totalInstallments)) * 100);
                const rankIndex = payoffPlan.orderedLoans.findIndex((o) => o.loan.id === loan.id);
                const linkedCredit = loan.creditLineId
                  ? (state.creditLines ?? []).find((c) => c.id === loan.creditLineId)
                  : null;

                return (
                  <div
                    key={loan.id}
                    className="p-5 rounded-2xl glass-tile space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-[var(--ft-text-muted)]">
                          {linkedCredit
                            ? `${t(lang, 'قسط اعتبار', 'Credit Plan')}: ${linkedCredit.title}`
                            : loan.kind === 'loan'
                            ? t(lang, 'وام بانکی', 'Loan')
                            : loan.kind === 'debt'
                            ? t(lang, 'قرض / تعهد', 'Debt')
                            : t(lang, 'طلب', 'Receivable')}{' '}
                          · {loan.periodLabel}
                          {rankIndex >= 0 && loan.status === 'open' && (
                            <span className="text-[var(--ft-accent)]">
                              {' '}
                              · {t(lang, `اولویت #${rankIndex + 1}`, `Payoff #${rankIndex + 1}`)}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-[var(--ft-text-primary)] mt-0.5">
                          {loan.title}
                        </h4>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          loan.status === 'closed' ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-warning)]'
                        }`}
                      >
                        {loan.status === 'closed' ? t(lang, 'تسویه شد', 'Closed') : t(lang, 'باز', 'Open')}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-num text-[var(--ft-text-muted)]">
                        <span>
                          {t(lang, 'هر قسط:', 'Installment:')} {formatMoney(loan.installmentAmount, loan.currency, lang, false, isPrivate)}
                        </span>
                        <span>
                          {loan.paidInstallments}/{loan.totalInstallments} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            loan.status === 'closed' ? 'bg-[var(--ft-positive)]' : 'bg-[var(--ft-accent)]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs font-num text-[var(--ft-text-muted)]">
                        {t(lang, 'سررسید بعدی:', 'Next due:')} {formatJalaliDate(loan.dueDate, lang)}
                      </span>
                      {loan.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => {
                            setPayingLoan(loan);
                            setPayAccountId(state.bankAccounts[0]?.id ?? '');
                          }}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
                        >
                          {t(lang, 'پرداخت قسط', 'Pay Installment')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {debtWhatIf.totalDebtIrt > 0 && (
              <div className="p-5 rounded-2xl glass-tile space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--ft-text-primary)]">
                      {t(
                        lang,
                        'شبیه‌ساز تسریع تسویه اقساط و بدهی («چه می‌شود اگر»)',
                        'Debt-Free Acceleration Simulator (What-If)'
                      )}
                    </h4>
                    <p className="text-xs text-[var(--ft-text-muted)]">
                      {t(
                        lang,
                        'تخصیص مازاد ماهانه چقدر تاریخ تسویه کامل را بر اساس تقویم جلالی جلو می‌اندازد؟',
                        'Slide extra monthly allocation to see exact months saved and Jalali payoff date'
                      )}
                    </p>
                  </div>
                  <div className="font-num text-xs font-bold text-[var(--ft-positive)]">
                    {debtWhatIf.monthsSaved > 0
                      ? t(lang, `${debtWhatIf.monthsSaved} ماه سریع‌تر`, `${debtWhatIf.monthsSaved} months saved`)
                      : t(lang, 'حالت پایه فعلی', 'Current baseline')}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-num">
                    <span className="text-[var(--ft-text-secondary)]">
                      {t(lang, 'تخصیص مازاد ماهانه:', 'Extra Monthly Allocation:')}
                    </span>
                    <span className="font-bold text-[var(--ft-accent)]">
                      +{formatMoney(extraMonthlyDebtIrt, 'IRT', lang, false, isPrivate)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40000000}
                    step={1000000}
                    value={extraMonthlyDebtIrt}
                    onChange={(e) => setExtraMonthlyDebtIrt(Number(e.target.value))}
                    className="w-full accent-[var(--ft-accent)] cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] space-y-1">
                    <div className="text-[var(--ft-text-muted)]">{t(lang, 'مسیر فعلی', 'Baseline Payoff')}</div>
                    <div className="font-num font-bold text-sm text-[var(--ft-text-primary)]">
                      {debtWhatIf.baselineMonths} {t(lang, 'ماه', 'mo')} · {formatJalaliDate(debtWhatIf.baselineDebtFreeIso, lang)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-accent)]/40 space-y-1">
                    <div className="text-[var(--ft-text-muted)]">{t(lang, 'مسیر شتاب‌گرفته', 'Accelerated Payoff')}</div>
                    <div className="font-num font-bold text-sm text-[var(--ft-positive)]">
                      {debtWhatIf.acceleratedMonths} {t(lang, 'ماه', 'mo')} · {formatJalaliDate(debtWhatIf.acceleratedDebtFreeIso, lang)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] space-y-1">
                    <div className="text-[var(--ft-text-muted)]">{t(lang, 'بودجه کل ماهانه بدهی', 'Monthly Debt Budget')}</div>
                    <div className="font-num font-bold text-sm text-[var(--ft-accent)]">
                      {formatMoney(debtWhatIf.monthlyAcceleratedBudgetIrt, 'IRT', lang, true, isPrivate)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* SECTION 3: Fixed Expenses + Interactive Jalali Financial Calendar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-5 glass-surface rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'هزینه‌های ثابت ماهانه', 'Recurring Fixed Bills')}
                  </h3>
                  <span className="font-num text-xs text-[var(--ft-text-muted)]">
                    ({state.fixedExpenses.filter((f) => f.active).length} {t(lang, 'فعال', 'active')})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFeTitle('');
                      setFeAmount('');
                      setFeDay('1');
                      setFeModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
                  >
                    + {t(lang, 'هزینه ثابت', 'Add Bill')}
                  </button>
                  <button
                    type="button"
                    onClick={onRunMonthlySync}
                    title={t(lang, 'ثبت سررسید هزینه‌های ثابت این ماه', 'Sync Monthly Fixed Bills')}
                    className="p-1.5 rounded-lg border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer text-[var(--ft-text-secondary)]"
                    aria-label={t(lang, 'همگام‌سازی ماه', 'Sync Monthly Fixed Bills')}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="divide-y divide-[var(--ft-border)]">
                {state.fixedExpenses.map((fe) => (
                  <div key={fe.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-[var(--ft-text-primary)]">{fe.title}</div>
                      <div className="text-xs text-[var(--ft-text-muted)] font-num">
                        {fe.recurringMonthly
                          ? t(lang, `تکرار در روز ${fe.dayOfMonth} هر ماه جلالی`, `Monthly on Jalali day ${fe.dayOfMonth}`)
                          : t(lang, 'یک‌بار', 'One-time')}
                      </div>
                    </div>
                    <div className="font-num text-sm font-semibold text-[var(--ft-text-primary)]">
                      {formatMoney(fe.amount, fe.currency, lang, false, isPrivate)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="lg:col-span-7 glass-surface rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--ft-accent)]" />
                  <span>
                    {t(lang, `تقویم مالی جلالی — ${getJalaliMonthName(calMonth)} ${calYear}`, `Jalali Financial Calendar`)}
                  </span>
                </h3>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (calMonth === 1) {
                        setCalYear(calYear - 1);
                        setCalMonth(12);
                      } else {
                        setCalMonth(calMonth - 1);
                      }
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-[var(--ft-border)] cursor-pointer"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCalYear(todayJalali.jy);
                      setCalMonth(todayJalali.jm);
                      setSelectedCalDay(todayJalali.jd);
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-[var(--ft-border)] cursor-pointer"
                  >
                    {t(lang, 'امروز', 'Today')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (calMonth === 12) {
                        setCalYear(calYear + 1);
                        setCalMonth(1);
                      } else {
                        setCalMonth(calMonth + 1);
                      }
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-[var(--ft-border)] cursor-pointer"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-[var(--ft-text-muted)]">
                {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((wd) => (
                  <div key={wd} className="py-1 font-medium">
                    {wd}
                  </div>
                ))}
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: monthDays }).map((_, idx) => {
                  const day = idx + 1;
                  const weekday = (startOffset + idx) % 7;
                  const isFriday = weekday === 6;
                  const holidayObj = calHolidays.find(
                    (h) => h.month === calMonth && h.day === day
                  );
                  const isHoliday = isFriday || Boolean(holidayObj?.isHoliday);
                  const isToday =
                    calYear === todayJalali.jy &&
                    calMonth === todayJalali.jm &&
                    day === todayJalali.jd;
                  const isSelected = day === selectedCalDay;

                  const fixedDueItems = state.fixedExpenses.filter(
                    (fe) => fe.active && fe.dayOfMonth === day
                  );
                  const loanDueItems = state.loans.filter((l) => {
                    if (l.status !== 'open') return false;
                    const j = toJalali(l.dueDate);
                    return j.jy === calYear && j.jm === calMonth && j.jd === day;
                  });
                  const hasDue = fixedDueItems.length > 0 || loanDueItems.length > 0;

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedCalDay(day)}
                      title={holidayObj?.title || (hasDue ? 'سررسید مالی' : '')}
                      className={`p-1.5 rounded-lg border text-xs font-num flex flex-col items-center justify-center min-h-[44px] cursor-pointer transition-colors ${
                        isSelected
                          ? 'ft-accent-gradient font-bold border-transparent shadow-sm'
                          : isToday
                          ? 'border-[var(--ft-accent)] bg-[var(--ft-accent-soft)] text-[var(--ft-text-primary)] font-bold'
                          : isHoliday
                          ? 'border-[var(--ft-border)] bg-[var(--ft-danger-soft)] text-[var(--ft-danger)]'
                          : 'border-[var(--ft-border)] bg-[var(--ft-surface-subtle)] text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)]'
                      }`}
                    >
                      <span>{day}</span>
                      {hasDue && (
                        <span
                          className={`text-[10px] leading-none mt-0.5 ${
                            isSelected ? 'opacity-95' : 'text-[var(--ft-warning)]'
                          }`}
                        >
                          {loanDueItems.length > 0
                            ? `${loanDueItems.length} ${t(lang, 'قسط', 'inst')}`
                            : `${fixedDueItems.length} ${t(lang, 'قبض', 'bill')}`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {(() => {
                const dayBills = state.fixedExpenses.filter(
                  (fe) => fe.active && fe.dayOfMonth === selectedCalDay
                );
                const dayLoans = state.loans.filter((l) => {
                  if (l.status !== 'open') return false;
                  const j = toJalali(l.dueDate);
                  return j.jy === calYear && j.jm === calMonth && j.jd === selectedCalDay;
                });
                const holiday = calHolidays.find((h) => h.month === calMonth && h.day === selectedCalDay);

                return (
                  <div className="p-3.5 rounded-2xl glass-tile space-y-2 text-xs">
                    <div className="flex items-center justify-between font-semibold text-[var(--ft-text-primary)]">
                      <span className="font-num">
                        {selectedCalDay} {getJalaliMonthName(calMonth)} {calYear}
                        {holiday ? ` · ${holiday.title}` : ''}
                      </span>
                      <span className="font-num text-[var(--ft-text-muted)]">
                        {dayBills.length + dayLoans.length} {t(lang, 'تعهد سررسید', 'due')}
                      </span>
                    </div>
                    {dayBills.length === 0 && dayLoans.length === 0 ? (
                      <div className="text-[var(--ft-text-muted)]">
                        {t(lang, 'در این روز سررسید قسط یا هزینه ثابتی ثبت نشده است.', 'No due obligations on this day.')}
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--ft-border)]">
                        {dayLoans.map((l) => (
                          <div key={l.id} className="py-2 flex items-center justify-between gap-2">
                            <span className="font-medium text-[var(--ft-text-primary)]">{l.title}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-num font-bold text-[var(--ft-warning)]">
                                {formatMoney(l.installmentAmount, l.currency, lang, false, isPrivate)}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPayingLoan(l);
                                  setPayAccountId(state.bankAccounts[0]?.id ?? '');
                                }}
                                className="text-[11px] font-semibold text-[var(--ft-accent)] hover:underline cursor-pointer"
                              >
                                {t(lang, 'پرداخت', 'Pay')}
                              </button>
                            </div>
                          </div>
                        ))}
                        {dayBills.map((fe) => (
                          <div key={fe.id} className="py-2 flex items-center justify-between gap-2">
                            <span className="text-[var(--ft-text-secondary)]">
                              {fe.title} ({t(lang, 'هزینه ثابت', 'Fixed')})
                            </span>
                            <span className="font-num font-semibold text-[var(--ft-text-primary)]">
                              {formatMoney(fe.amount, fe.currency, lang, false, isPrivate)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </section>
          </div>

          {/* SECTION 4: 30-Day Cashflow Runway & Category Budget Caps */}
          <section className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-[var(--ft-border)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'پیش‌بینی نقدینگی ۳۰ روزه (با تقویم جلالی)', '30-Day Cashflow Runway')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                  {t(
                    lang,
                    'اثر اقساط اعتبارات، وام‌ها و قبض‌های ماهانه بر موجودی ۳۰ روز آینده',
                    'Day-by-day liquidity forecast combining bills, credit installments and loan due dates'
                  )}
                </p>
              </div>

              <div className="w-56">
                <MaterialInput
                  type="number"
                  fieldSize="sm"
                  ltrNum
                  min={0}
                  step={1000000}
                  label={t(lang, 'درآمد ماهانه مورد انتظار (تومان)', 'Expected Income (IRT)')}
                  value={state.settings.monthlyExpectedIncomeIrt ?? 0}
                  onChange={(e) =>
                    onUpdateSettings({
                      monthlyExpectedIncomeIrt: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl glass-tile space-y-1">
                <div className="text-[var(--ft-text-muted)]">{t(lang, 'نقدینگی شروع', 'Starting Cash')}</div>
                <div className="font-num text-sm font-bold text-[var(--ft-text-primary)]">
                  {formatMoney(cashflowRunway.startingBalanceIrt, 'IRT', lang, true, isPrivate)}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl glass-tile space-y-1">
                <div className="text-[var(--ft-text-muted)]">{t(lang, 'تعهدات ۳۰ روز آینده', '30d Scheduled Out')}</div>
                <div className="font-num text-sm font-bold text-[var(--ft-warning)]">
                  {isPrivate ? formatMoney(cashflowRunway.totalScheduledOutflowIrt, 'IRT', lang, true, true) : `-${formatMoney(cashflowRunway.totalScheduledOutflowIrt, 'IRT', lang, true)}`}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl glass-tile space-y-1">
                <div className="text-[var(--ft-text-muted)]">{t(lang, 'کف نقدینگی پیش‌بینی‌شده', 'Lowest Projected Point')}</div>
                <div
                  className={`font-num text-sm font-bold ${
                    cashflowRunway.lowestBalanceIrt < 0
                      ? 'text-[var(--ft-danger)]'
                      : 'text-[var(--ft-positive)]'
                  }`}
                >
                  {formatMoney(cashflowRunway.lowestBalanceIrt, 'IRT', lang, true, isPrivate)} ·{' '}
                  {cashflowRunway.lowestDayLabel}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl glass-tile space-y-1">
                <div className="text-[var(--ft-text-muted)]">{t(lang, 'روزهای برخورد کسری', 'Deficit Collision Days')}</div>
                <div
                  className={`font-num text-sm font-bold ${
                    cashflowRunway.collisionDays.length > 0
                      ? 'text-[var(--ft-danger)]'
                      : 'text-[var(--ft-positive)]'
                  }`}
                >
                  {cashflowRunway.collisionDays.length > 0
                    ? `${cashflowRunway.collisionDays.length} ${t(lang, 'روز هشدار', 'days')}`
                    : t(lang, '۰ روز (ایمن)', '0 days (Safe)')}
                </div>
              </div>
            </div>

            <CashflowRunwayChart
              points={cashflowRunway.points}
              formatIrt={(v) => formatMoney(v, 'IRT', lang, true, isPrivate)}
              hoverHint={t(
                lang,
                'روی نقاط رنگی نمودار بروید یا کلیک کنید تا جزئیات سررسید آن روز نمایش داده شود',
                'Hover or click any node on the 30-day runway to inspect scheduled bills and balance'
              )}
              zeroLineLabel={t(lang, 'مرز کسری نقدینگی (۰)', 'Zero Liquidity Line')}
            />
          </section>

          <section className="glass-surface rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'سقف مخارج دسته‌بندی‌ها (ماه جلالی جاری)', 'Category Spending Caps (Jalali Month)')}
                </h3>
                <span className="text-xs font-num text-[var(--ft-text-muted)]">
                  {upcomingObligations.length} {t(lang, 'سررسید کل', 'total upcoming')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBName('');
                  setBAccountId(state.bankAccounts[0]?.id ?? '');
                  setBPercent('10');
                  setBudgetModalOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer whitespace-nowrap"
              >
                + {t(lang, 'افزودن سقف بودجه', 'Add Budget Cap')}
              </button>
            </div>
            {summary.budgetStatuses.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'هنوز سقف بودجه‌ای تعریف نشده است.', 'No spending caps defined yet.')}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {summary.budgetStatuses.map((bs) => (
                  <div key={bs.budget.id} className="p-4 rounded-2xl glass-tile space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--ft-text-primary)]">{bs.budget.categoryName}</span>
                      <span className="font-num font-bold text-[var(--ft-accent)]">{bs.utilizationPct}%</span>
                    </div>
                    <StripedProgressBar
                      valuePct={bs.utilizationPct}
                      tone={bs.paceStatus === 'exceeded' ? 'danger' : bs.paceStatus === 'warning' ? 'warning' : 'positive'}
                      heightClass="h-2"
                    />
                    <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
                      {formatMoney(bs.spentAmount, bs.currency, lang, true, isPrivate)} /{' '}
                      {formatMoney(bs.capAmount, bs.currency, lang, true, isPrivate)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 5. FX Rate & Accounting Settings */}
      {subTab === 'fx' && (
        <section className="glass-surface rounded-3xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
            <div>
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                {t(lang, 'نرخ دلار و ارز پایه', 'FX Rate & Base Currency')}
              </h3>
              <p className="text-xs text-[var(--ft-text-muted)] mt-0.5">
                {t(
                  lang,
                  'هر ۸ ساعت (روزی ۳ بار) از منبع ایران‌مارکت خوانده می‌شود و روی همه حساب‌های فعال اعمال می‌گردد.',
                  'Fetches every 8 hours (3x daily) when enabled and updates all active accounts.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRefreshFxRate(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t(lang, 'به‌روزرسانی نرخ', 'Refresh Rate Now')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-2xl glass-tile space-y-1">
              <div className="text-xs text-[var(--ft-text-muted)]">{t(lang, 'نرخ فعلی', 'Current Rate')}</div>
              <div className="font-num text-2xl font-bold text-[var(--ft-accent)]">
                {state.settings.usdToman.toLocaleString('en-US')} {t(lang, 'تومان', 'IRT')}
              </div>
              <div className="text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'منبع:', 'Source:')} {state.settings.fxSource}
              </div>
            </div>

            <div className="p-4 rounded-2xl glass-tile space-y-1">
              <div className="text-xs text-[var(--ft-text-muted)]">{t(lang, 'آخرین به‌روزرسانی', 'Last Updated')}</div>
              <div className="font-num text-sm font-semibold text-[var(--ft-text-primary)] pt-1">
                {formatJalaliDateTime(state.settings.fxUpdatedAt, lang)}
              </div>
            </div>

            <div className="p-4 rounded-2xl glass-tile flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--ft-text-primary)]">
                  {t(lang, 'به‌روزرسانی خودکار (روزی ۳ بار)', 'Auto-Update (3x/day)')}
                </div>
                <div className="text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'بازه ۸ ساعته پس‌زمینه', '8-hour background schedule')}
                </div>
              </div>
              <GlassSwitch
                checked={state.settings.fxAutoUpdate}
                onChange={(checked) => onUpdateSettings({ fxAutoUpdate: checked })}
                ariaLabel={t(lang, 'به‌روزرسانی خودکار', 'Auto-Update')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--ft-border)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--ft-text-primary)]">
                  {t(lang, 'ارز پایه نمایش پنل', 'Base Display Currency')}
                </div>
                <div className="text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'انتخاب واحد اصلی در KPIهای داشبورد', 'Primary currency for dashboard KPIs')}
                </div>
              </div>
              <GlassSelect<CurrencyCode>
                size="sm"
                align="end"
                value={state.settings.baseCurrency}
                onChange={(val) => onUpdateSettings({ baseCurrency: val })}
                ariaLabel={t(lang, 'ارز پایه نمایش پنل', 'Base Display Currency')}
                options={[
                  { value: 'USD', label: 'USD ($)' },
                  { value: 'IRT', label: 'IRT (تومان)' },
                ]}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--ft-text-primary)]">
                  {t(lang, 'نمایش معادل تومانی زیر مبالغ دلاری', 'Show Toman Equivalent')}
                </div>
                <div className="text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'تبدیل لحظه‌ای بر اساس نرخ USD_IRR_FREE', 'Live conversion using USD_IRR_FREE')}
                </div>
              </div>
              <GlassSwitch
                checked={state.settings.showTomanEquivalent}
                onChange={(checked) => onUpdateSettings({ showTomanEquivalent: checked })}
                ariaLabel={t(lang, 'نمایش معادل تومانی', 'Show Toman Equivalent')}
              />
            </div>
          </div>
        </section>
      )}

      {/* MODAL / SHEET: Add / Edit Transaction or Transfer */}
      <ResponsiveModalSheet
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        title={
          editingTxId
            ? t(lang, 'ویرایش تراکنش', 'Edit Transaction')
            : t(lang, 'ثبت تراکنش با منشاء و لیبل', 'Log Transaction with Origin')
        }
        maxWidthClass="md:max-w-lg"
        asForm
        onSubmit={handleSaveTransaction}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setTxModalOpen(false)}
              className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
            >
              {t(lang, 'انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
            >
              {t(lang, 'ذخیره', 'Save')}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
          {(
            [
              ['out', t(lang, 'هزینه / خرید', 'Expense')],
              ['in', t(lang, 'درآمد / واریز', 'Income')],
              ['transfer', t(lang, 'انتقال داخلی', 'Transfer')],
            ] as Array<[TransactionType, string]>
          ).map(([tp, lb]) => (
            <button
              key={tp}
              type="button"
              onClick={() => setTxType(tp)}
              className={`min-h-[38px] py-2 text-xs font-medium rounded-lg cursor-pointer ${
                txType === tp
                  ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)]'
                  : 'text-[var(--ft-text-secondary)]'
              }`}
            >
              {lb}
            </button>
          ))}
        </div>

        {txType === 'out' && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--ft-text-muted)] block">
              {t(lang, 'منشاء پرداخت هزینه', 'Payment Origin')}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {(
                [
                  ['bank', t(lang, 'حساب بانکی', 'Bank')],
                  ['cash', t(lang, 'نقدی', 'Cash')],
                  ['usd', t(lang, 'حساب دلاری', 'USD Wallet')],
                  ['credit', t(lang, 'اعتباری', 'Credit')],
                  ['person_debt', t(lang, 'قرض از فرد', 'Borrowed')],
                ] as Array<[PaymentMethod, string]>
              ).map(([pm, lb]) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => {
                    setTxPaymentMethod(pm);
                    if (pm === 'usd') {
                      setTxCurrency('USD');
                      const usdAcc = state.bankAccounts.find((a) => a.currency === 'USD');
                      if (usdAcc) setTxAccountId(usdAcc.id);
                    } else if (pm === 'cash') {
                      const cashAcc = state.bankAccounts.find((a) => a.type === 'cash');
                      if (cashAcc) setTxAccountId(cashAcc.id);
                    } else if (pm === 'bank') {
                      setTxCurrency('IRT');
                      const bankAcc = state.bankAccounts.find((a) => a.type === 'bank' && a.currency === 'IRT');
                      if (bankAcc) setTxAccountId(bankAcc.id);
                    } else if (pm === 'credit') {
                      const cl = (state.creditLines ?? []).find((c) => c.id === txCreditLineId) ?? state.creditLines?.[0];
                      if (cl) {
                        setTxCreditLineId(cl.id);
                        setTxCurrency(cl.currency);
                        setTxInstallments(String(cl.defaultInstallments));
                      }
                    }
                  }}
                  className={`min-h-[38px] py-2 px-1.5 text-[11px] font-medium rounded-xl border transition-colors cursor-pointer truncate ${
                    txPaymentMethod === pm
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

        <div className="grid grid-cols-2 gap-3 items-start">
          {(() => {
            const amtNum = Number(txAmount);
            const srcAcc = state.bankAccounts.find((a) => a.id === txAccountId);
            const isBankLike = txType !== 'out' || (txPaymentMethod !== 'credit' && txPaymentMethod !== 'person_debt');
            const txAmtInAccCurrency =
              isBankLike && srcAcc && txAmount !== '' && Number.isFinite(amtNum)
                ? convertCurrency(amtNum, txCurrency, srcAcc.currency, usdToman)
                : 0;
            const amountError =
              txAmount !== '' && (!Number.isFinite(amtNum) || amtNum <= 0)
                ? t(lang, 'مبلغ باید بزرگ‌تر از صفر باشد', 'Must be > 0')
                : undefined;
            const amountWarning =
              !amountError &&
              isBankLike &&
              txType !== 'in' &&
              srcAcc &&
              txAmount !== '' &&
              txAmtInAccCurrency > srcAcc.balance
                ? t(lang, 'مبلغ از موجودی حساب بیشتر است', 'Exceeds account balance')
                : !amountError && selectedBudgetPreview && selectedBudgetPreview.projectedPct >= 100
                ? t(lang, 'از سقف بودجه این ماه فراتر می‌رود', 'Exceeds monthly budget cap')
                : undefined;
            return (
              <MaterialInput
                type="number"
                step="any"
                required
                ltrNum
                label={t(lang, 'مبلغ', 'Amount')}
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                error={amountError}
                warning={amountWarning}
              />
            );
          })()}
          <div className="md-field">
            <label className="md-field-label">{t(lang, 'ارز', 'Currency')}</label>
            <GlassSelect<CurrencyCode>
              className="w-full"
              value={txCurrency}
              onChange={setTxCurrency}
              options={[
                { value: 'IRT', label: 'IRT (تومان)' },
                { value: 'USD', label: 'USD ($)' },
              ]}
            />
          </div>
        </div>

        {txType === 'out' && txPaymentMethod === 'credit' ? (
          <div className="grid grid-cols-3 gap-3 items-start">
            <div className="col-span-2">
              <label className="text-xs text-[var(--ft-text-muted)] block mb-1">
                {t(lang, 'خط اعتبار (دیجی‌پی / اسنپ‌پی...)', 'Credit Line')}
              </label>
              <GlassSelect
                className="w-full"
                value={txCreditLineId}
                onChange={(id) => {
                  setTxCreditLineId(id);
                  const cl = (state.creditLines ?? []).find((c) => c.id === id);
                  if (cl) {
                    setTxCurrency(cl.currency);
                    setTxInstallments(String(cl.defaultInstallments));
                  }
                }}
                options={(state.creditLines ?? []).map((c) => {
                  const st = summary.creditLinesStatus.find((s) => s.line.id === c.id);
                  return {
                    value: c.id,
                    label: c.title,
                    hint: formatMoney(st?.availableAmount ?? c.creditLimit, c.currency, lang, true, isPrivate),
                  };
                })}
              />
            </div>
            <MaterialInput
              type="number"
              fieldSize="sm"
              ltrNum
              min={1}
              max={36}
              label={t(lang, 'تعداد قسط', 'Installments')}
              value={txInstallments}
              onChange={(e) => setTxInstallments(e.target.value)}
              hint={
                Number(txAmount) > 0 && Number(txInstallments) > 0
                  ? `${formatMoney(Number(txAmount) / Number(txInstallments), txCurrency, lang, true, isPrivate)} / ${t(lang, 'قسط', 'mo')}`
                  : undefined
              }
            />
          </div>
        ) : txType === 'out' && txPaymentMethod === 'person_debt' ? (
          <div>
            <label className="text-xs text-[var(--ft-text-muted)] block mb-1">
              {t(lang, 'شخص قرض‌دهنده (ثبت خودکار در دفتر اشخاص)', 'Creditor Person')}
            </label>
            <GlassSelect
              className="w-full"
              value={txPersonId}
              onChange={setTxPersonId}
              options={(state.people ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </div>
        ) : (
          <div>
            <label className="text-xs text-[var(--ft-text-muted)] block mb-1">
              {txType === 'transfer' ? t(lang, 'حساب مبدأ', 'From Account') : t(lang, 'حساب بانکی / نقدی / دلاری', 'Account')}
            </label>
            <GlassSelect
              className="w-full"
              value={txAccountId}
              onChange={setTxAccountId}
              options={state.bankAccounts.map((a) => ({
                value: a.id,
                label: `${a.name} (${a.currency})`,
                hint: formatMoney(a.balance, a.currency, lang, false, isPrivate),
              }))}
            />
          </div>
        )}

        {txType === 'transfer' && (
          <div>
            <label className="text-xs text-[var(--ft-text-muted)] block mb-1 flex items-center gap-1">
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
              <span>{t(lang, 'حساب مقصد (تبدیل خودکار با نرخ دلار)', 'To Account (Auto-FX)')}</span>
            </label>
            <GlassSelect
              className="w-full"
              value={txToAccountId}
              onChange={setTxToAccountId}
              options={state.bankAccounts.map((a) => ({
                value: a.id,
                label: `${a.name} (${a.currency})`,
                hint: formatMoney(a.balance, a.currency, lang, false, isPrivate),
              }))}
            />
          </div>
        )}

        {txType === 'out' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div className="md-field">
              <label className="md-field-label">{t(lang, 'لیبل هزینه', 'Expense Label')}</label>
              <GlassSelect
                size="sm"
                className="w-full"
                value={txCategoryLabel}
                onChange={setTxCategoryLabel}
                options={[
                  { value: 'خوراک و کافه', label: t(lang, 'خوراک و کافه', 'Food & Cafe') },
                  { value: 'خرید کالا', label: t(lang, 'خرید کالا', 'Shopping') },
                  { value: 'مسکن و قبوض', label: t(lang, 'مسکن و قبوض', 'Housing & Bills') },
                  { value: 'حمل‌ونقل', label: t(lang, 'حمل‌ونقل', 'Transport') },
                  { value: 'ابزار و سرور', label: t(lang, 'ابزار و سرور', 'Tools & Server') },
                  { value: 'درمان', label: t(lang, 'درمان', 'Health') },
                  { value: 'سایر', label: t(lang, 'سایر', 'Other') },
                ]}
              />
            </div>
            {state.budgetCaps.length > 0 && (
              <div className="md-field">
                <label className="md-field-label">{t(lang, 'سقف بودجه (اختیاری)', 'Budget Cap (Opt.)')}</label>
                <GlassSelect
                  size="sm"
                  className="w-full"
                  value={txBudgetId}
                  onChange={setTxBudgetId}
                  options={[
                    { value: '', label: t(lang, 'بدون اتصال به بودجه', 'No Budget Cap') },
                    ...state.budgetCaps.map((b) => ({
                      value: b.id,
                      label: b.categoryName,
                    })),
                  ]}
                />
              </div>
            )}
          </div>
        )}

        {txType === 'out' && selectedBudgetPreview && (
          <div
            className={`text-xs flex items-center gap-1.5 ${
              selectedBudgetPreview.projectedPct >= 100
                ? 'text-[var(--ft-danger)]'
                : selectedBudgetPreview.projectedPct >= 80
                ? 'text-[var(--ft-warning)]'
                : 'text-[var(--ft-positive)]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t(
                lang,
                `مصرف جدید این بودجه: ${selectedBudgetPreview.projectedPct}%`,
                `Projected budget usage: ${selectedBudgetPreview.projectedPct}%`
              )}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <JalaliDatePicker
            lang={lang}
            fieldSize="sm"
            label={t(lang, 'تاریخ (جلالی)', 'Date')}
            value={txDate}
            onChange={setTxDate}
          />
          <MaterialInput
            type="text"
            fieldSize="sm"
            label={t(lang, 'یادداشت / شرح', 'Note')}
            placeholder={t(lang, 'مثلاً خرید، شام، قبض...', 'e.g. Purchase, Dinner...')}
            value={txNote}
            onChange={(e) => setTxNote(e.target.value)}
          />
        </div>
      </ResponsiveModalSheet>

      {/* MODAL / SHEET: Unified Add / Edit Account (Bank/Wallet/Cash OR BNPL Credit Line) */}
      <ResponsiveModalSheet
        open={accModalOpen}
        onClose={() => setAccModalOpen(false)}
        title={
          accModalMode === 'credit'
            ? editingCreditId
              ? t(lang, 'ویرایش خط اعتبار اقساطی', 'Edit Credit Line')
              : t(lang, 'افزودن خط اعتبار اقساطی', 'Add BNPL Credit Line')
            : editingAccId
            ? t(lang, 'ویرایش حساب مالی', 'Edit Account')
            : t(lang, 'افزودن حساب / اعتبار جدید', 'Add Account / Credit Line')
        }
        maxWidthClass="md:max-w-md"
        asForm
        onSubmit={accModalMode === 'credit' ? handleSaveCreditLine : handleSaveAccount}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAccModalOpen(false)}
              className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
            >
              {t(lang, 'انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer"
            >
              {t(lang, 'ذخیره', 'Save')}
            </button>
          </div>
        }
      >
        {/* Unified Mode Switcher when creating new entry */}
        {!editingAccId && !editingCreditId && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
            <button
              type="button"
              onClick={() => setAccModalMode('bank_wallet')}
              className={`min-h-[38px] py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                accModalMode === 'bank_wallet'
                  ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] font-semibold'
                  : 'text-[var(--ft-text-secondary)]'
              }`}
            >
              {t(lang, 'حساب بانکی / نقدی / کیف‌پول', 'Bank / Cash / Wallet')}
            </button>
            <button
              type="button"
              onClick={() => setAccModalMode('credit')}
              className={`min-h-[38px] py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                accModalMode === 'credit'
                  ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] font-semibold'
                  : 'text-[var(--ft-text-secondary)]'
              }`}
            >
              {t(lang, 'اعتبار اقساطی (دیجی‌پی...)', 'Credit Line (BNPL)')}
            </button>
          </div>
        )}

        {accModalMode === 'bank_wallet' ? (
          <>
            <MaterialInput
              type="text"
              required
              label={t(lang, 'نام حساب', 'Account Name')}
              placeholder={t(lang, 'مثلاً بانک ملت', 'e.g. Main Bank')}
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <GlassSelect<BankAccountType>
                className="w-full"
                value={accType}
                onChange={setAccType}
                options={[
                  { value: 'bank', label: t(lang, 'بانکی', 'Bank') },
                  { value: 'cash', label: t(lang, 'نقد', 'Cash') },
                  { value: 'wallet', label: t(lang, 'کیف پول', 'Wallet') },
                ]}
              />
              <GlassSelect<CurrencyCode>
                className="w-full"
                value={accCurrency}
                onChange={setAccCurrency}
                options={[
                  { value: 'IRT', label: 'IRT (تومان)' },
                  { value: 'USD', label: 'USD ($)' },
                ]}
              />
            </div>
            <MaterialInput
              type="number"
              step="any"
              required
              ltrNum
              label={t(lang, 'موجودی فعلی', 'Current Balance')}
              value={accBalance}
              onChange={(e) => setAccBalance(e.target.value)}
              error={
                accBalance !== '' && Number(accBalance) < 0
                  ? t(lang, 'موجودی نمی‌تواند منفی باشد', 'Balance cannot be negative')
                  : undefined
              }
            />
            <MaterialInput
              type="text"
              label={t(lang, 'یادداشت (اختیاری)', 'Note (optional)')}
              value={accNote}
              onChange={(e) => setAccNote(e.target.value)}
            />
          </>
        ) : (
          <>
            <MaterialInput
              type="text"
              required
              label={t(lang, 'عنوان اعتبار', 'Credit Title')}
              placeholder={t(lang, 'مثلاً اعتبار دیجی‌پی', 'e.g. Digipay Credit')}
              value={crTitle}
              onChange={(e) => setCrTitle(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3 items-start">
              <div className="md-field">
                <label className="md-field-label">{t(lang, 'ارائه‌دهنده', 'Provider')}</label>
                <GlassSelect<CreditProvider>
                  className="w-full"
                  value={crProvider}
                  onChange={setCrProvider}
                  options={[
                    { value: 'digipay', label: t(lang, 'دیجی‌پی', 'Digipay') },
                    { value: 'snapppay', label: t(lang, 'اسنپ‌پی', 'SnappPay') },
                    { value: 'tara', label: t(lang, 'تارا', 'Tara') },
                    { value: 'card', label: t(lang, 'کارت اعتباری بانکی', 'Bank Credit Card') },
                    { value: 'other', label: t(lang, 'سایر', 'Other') },
                  ]}
                />
              </div>
              <div className="md-field">
                <label className="md-field-label">{t(lang, 'ارز', 'Currency')}</label>
                <GlassSelect<CurrencyCode>
                  className="w-full"
                  value={crCurrency}
                  onChange={setCrCurrency}
                  options={[
                    { value: 'IRT', label: 'IRT (تومان)' },
                    { value: 'USD', label: 'USD ($)' },
                  ]}
                />
              </div>
            </div>
            <MaterialInput
              type="number"
              required
              ltrNum
              step="any"
              label={t(lang, 'سقف کل اعتبار', 'Total Credit Limit')}
              value={crLimit}
              onChange={(e) => setCrLimit(e.target.value)}
              error={
                crLimit !== '' && Number(crLimit) <= 0
                  ? t(lang, 'سقف اعتبار باید > ۰ باشد', 'Must be > 0')
                  : undefined
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <MaterialInput
                type="number"
                fieldSize="sm"
                ltrNum
                min={1}
                max={36}
                required
                label={t(lang, 'تعداد قسط پیش‌فرض', 'Default Installments')}
                value={crDefaultInst}
                onChange={(e) => setCrDefaultInst(e.target.value)}
              />
              <MaterialInput
                type="number"
                fieldSize="sm"
                ltrNum
                min={1}
                max={30}
                required
                label={t(lang, 'روز سررسید ماهانه (۱-۳۰)', 'Jalali Due Day (1-30)')}
                value={crDueDay}
                onChange={(e) => setCrDueDay(e.target.value)}
              />
            </div>
            <MaterialInput
              type="text"
              fieldSize="sm"
              label={t(lang, 'توضیح (اختیاری)', 'Note (Optional)')}
              value={crNote}
              onChange={(e) => setCrNote(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
              <span className="text-xs text-[var(--ft-text-secondary)]">
                {t(lang, 'اعتبار فعال و قابل انتخاب در ثبت هزینه', 'Active Credit Line')}
              </span>
              <GlassSwitch
                checked={crActive}
                onChange={setCrActive}
                ariaLabel={t(lang, 'اعتبار فعال', 'Active Credit Line')}
              />
            </div>
          </>
        )}
      </ResponsiveModalSheet>

      {/* DRAWER / SHEET: Bank Account Transaction History */}
      <ResponsiveModalSheet
        open={Boolean(historyAccount)}
        onClose={() => setHistoryAccount(null)}
        desktopVariant="side-drawer"
        title={historyAccount?.name}
        subtitle={
          historyAccount
            ? formatMoney(historyAccount.balance, historyAccount.currency, lang, false, isPrivate)
            : undefined
        }
        footer={
          <button
            type="button"
            onClick={() => setHistoryAccount(null)}
            className="w-full min-h-[44px] px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--ft-border)] hover:bg-[var(--ft-surface-hover)] cursor-pointer"
          >
            {t(lang, 'بستن', 'Close')}
          </button>
        }
      >
        {historyAccount && (
          <div className="divide-y divide-[var(--ft-border)]">
            {state.transactions.filter(
              (tx) => tx.accountId === historyAccount.id || tx.toAccountId === historyAccount.id
            ).length === 0 ? (
              <div className="py-10 text-center text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'تراکنشی برای این حساب ثبت نشده است.', 'No transactions recorded for this account.')}
              </div>
            ) : (
              state.transactions
                .filter((tx) => tx.accountId === historyAccount.id || tx.toAccountId === historyAccount.id)
                .map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--ft-text-primary)] truncate">{tx.note || tx.type}</div>
                      <div className="text-xs text-[var(--ft-text-muted)]">{formatJalaliDate(tx.date, lang)}</div>
                    </div>
                    <div className="font-num text-sm font-semibold shrink-0">
                      {formatMoney(tx.amount, tx.currency, lang, false, isPrivate)}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}
      </ResponsiveModalSheet>

      {/* MODAL / SHEET: Add Budget Cap */}
      <ResponsiveModalSheet
        open={budgetModalOpen}
        onClose={() => setBudgetModalOpen(false)}
        title={t(lang, 'افزودن سقف بودجه دسته‌بندی', 'Add Category Budget Cap')}
        maxWidthClass="md:max-w-md"
        asForm
        onSubmit={handleSaveBudget}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setBudgetModalOpen(false)}
              className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
            >
              {t(lang, 'انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
            >
              {t(lang, 'ذخیره', 'Save')}
            </button>
          </div>
        }
      >
        <MaterialInput
          type="text"
          required
          label={t(lang, 'نام دسته', 'Category Name')}
          placeholder={t(lang, 'مثلاً تفریح و سفر', 'e.g. Travel')}
          value={bName}
          onChange={(e) => setBName(e.target.value)}
        />
        <GlassSelect
          className="w-full"
          value={bAccountId}
          onChange={setBAccountId}
          options={state.bankAccounts.map((a) => ({
            value: a.id,
            label: a.name,
            hint: formatMoney(a.balance, a.currency, lang, false, isPrivate),
          }))}
        />
        <MaterialInput
          type="number"
          min="1"
          max="100"
          required
          ltrNum
          label={t(lang, 'درصد از موجودی حساب مبدأ', '% of Source Account')}
          value={bPercent}
          onChange={(e) => setBPercent(e.target.value)}
          error={
            bPercent !== '' && (Number(bPercent) <= 0 || Number(bPercent) > 100)
              ? t(lang, 'درصد باید بین ۱ تا ۱۰۰ باشد', 'Must be between 1 and 100')
              : undefined
          }
        />
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
          <span className="text-xs text-[var(--ft-text-secondary)]">
            {t(lang, 'انتقال مانده مصرف‌نشده به ماه بعد (Rollover)', 'Rollover unused balance')}
          </span>
          <GlassSwitch
            checked={bRollover}
            onChange={setBRollover}
            ariaLabel={t(lang, 'انتقال مانده مصرف‌نشده به ماه بعد', 'Rollover unused balance')}
          />
        </div>
      </ResponsiveModalSheet>

      {/* MODAL / SHEET: Add Fixed Expense */}
      <ResponsiveModalSheet
        open={feModalOpen}
        onClose={() => setFeModalOpen(false)}
        title={t(lang, 'افزودن هزینه ثابت ماهانه', 'Add Recurring Fixed Expense')}
        maxWidthClass="md:max-w-md"
        asForm
        onSubmit={handleSaveFixedExpense}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setFeModalOpen(false)}
              className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
            >
              {t(lang, 'انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
            >
              {t(lang, 'ذخیره', 'Save')}
            </button>
          </div>
        }
      >
        <MaterialInput
          type="text"
          required
          label={t(lang, 'عنوان هزینه', 'Title')}
          value={feTitle}
          onChange={(e) => setFeTitle(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3 items-start">
          <MaterialInput
            type="number"
            step="any"
            required
            ltrNum
            label={t(lang, 'مبلغ', 'Amount')}
            value={feAmount}
            onChange={(e) => setFeAmount(e.target.value)}
            error={
              feAmount !== '' && Number(feAmount) <= 0
                ? t(lang, 'مبلغ نامعتبر است', 'Must be > 0')
                : undefined
            }
          />
          <div className="md-field">
            <label className="md-field-label">{t(lang, 'ارز', 'Currency')}</label>
            <GlassSelect<CurrencyCode>
              className="w-full"
              value={feCurrency}
              onChange={setFeCurrency}
              options={[
                { value: 'IRT', label: 'IRT (تومان)' },
                { value: 'USD', label: 'USD ($)' },
              ]}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-center">
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
            <span className="text-xs text-[var(--ft-text-secondary)]">
              {t(lang, 'تکرار ماهانه', 'Monthly Recurring')}
            </span>
            <GlassSwitch
              checked={feRecurring}
              onChange={setFeRecurring}
              ariaLabel={t(lang, 'تکرار ماهانه', 'Monthly Recurring')}
            />
          </div>
          <MaterialInput
            type="number"
            fieldSize="sm"
            ltrNum
            min="1"
            max="30"
            label={t(lang, 'روز ماه (۱-۳۰)', 'Day (1-30)')}
            value={feDay}
            onChange={(e) => setFeDay(e.target.value)}
            error={
              feDay !== '' && (Number(feDay) < 1 || Number(feDay) > 30)
                ? t(lang, 'روز باید ۱ تا ۳۰ باشد', 'Day must be 1–30')
                : undefined
            }
          />
        </div>
        <GlassSelect
          className="w-full"
          size="sm"
          value={feCategoryId}
          onChange={setFeCategoryId}
          options={[
            { value: '', label: t(lang, 'بدون اتصال به بودجه', 'No Budget Link') },
            ...state.budgetCaps.map((b) => ({
              value: b.id,
              label: b.categoryName,
            })),
          ]}
        />
      </ResponsiveModalSheet>

      {/* MODAL / SHEET: Add Loan / Debt / Receivable */}
      <ResponsiveModalSheet
        open={loanModalOpen}
        onClose={() => setLoanModalOpen(false)}
        title={t(lang, 'ثبت وام / قرض / طلب', 'Add Loan / Debt / Receivable')}
        maxWidthClass="md:max-w-md"
        asForm
        onSubmit={handleSaveLoan}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setLoanModalOpen(false)}
              className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
            >
              {t(lang, 'انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
            >
              {t(lang, 'ثبت', 'Save')}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <GlassSelect<LoanKind>
            className="w-full"
            value={lKind}
            onChange={setLKind}
            options={[
              { value: 'loan', label: t(lang, 'وام', 'Loan') },
              { value: 'debt', label: t(lang, 'قرض / بدهی', 'Debt') },
              { value: 'receivable', label: t(lang, 'طلب', 'Receivable') },
            ]}
          />
          <GlassSelect<CurrencyCode>
            className="w-full"
            value={lCurrency}
            onChange={setLCurrency}
            options={[
              { value: 'IRT', label: 'IRT (تومان)' },
              { value: 'USD', label: 'USD ($)' },
            ]}
          />
        </div>
        <MaterialInput
          type="text"
          required
          label={t(lang, 'عنوان', 'Title')}
          value={lTitle}
          onChange={(e) => setLTitle(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <MaterialInput
            type="number"
            required
            ltrNum
            label={t(lang, 'مبلغ کل', 'Total Amount')}
            value={lTotalAmount}
            onChange={(e) => setLTotalAmount(e.target.value)}
            error={
              lTotalAmount !== '' && Number(lTotalAmount) <= 0
                ? t(lang, 'باید > ۰ باشد', 'Must be > 0')
                : undefined
            }
          />
          <MaterialInput
            type="number"
            required
            ltrNum
            label={t(lang, 'مبلغ هر قسط', 'Installment')}
            value={lInstallmentAmount}
            onChange={(e) => setLInstallmentAmount(e.target.value)}
            error={
              lInstallmentAmount !== '' && Number(lInstallmentAmount) <= 0
                ? t(lang, 'باید > ۰ باشد', 'Must be > 0')
                : undefined
            }
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MaterialInput
            type="number"
            fieldSize="sm"
            ltrNum
            min="1"
            required
            label={t(lang, 'تعداد اقساط', 'Installments')}
            value={lInstallments}
            onChange={(e) => setLInstallments(e.target.value)}
            error={
              lInstallments !== '' && Number(lInstallments) < 1
                ? t(lang, 'حداقل ۱', 'Min 1')
                : undefined
            }
          />
          <MaterialInput
            type="number"
            fieldSize="sm"
            ltrNum
            min="0"
            label={t(lang, 'نرخ بهره %', 'Rate %')}
            value={lPriorityRate}
            onChange={(e) => setLPriorityRate(e.target.value)}
          />
          <JalaliDatePicker
            lang={lang}
            fieldSize="sm"
            label={t(lang, 'سررسید', 'Due Date')}
            value={lDueDate}
            onChange={setLDueDate}
          />
        </div>
        <MaterialInput
          type="text"
          fieldSize="sm"
          label={t(lang, 'دوره', 'Period')}
          placeholder={t(lang, 'مثلاً ماهانه', 'e.g. Monthly')}
          value={lPeriod}
          onChange={(e) => setLPeriod(e.target.value)}
        />
      </ResponsiveModalSheet>

      {/* MODAL / SHEET: Pay Loan Installment */}
      <ResponsiveModalSheet
        open={Boolean(payingLoan)}
        onClose={() => setPayingLoan(null)}
        title={t(lang, 'پرداخت قسط وام', 'Pay Loan Installment')}
        subtitle={payingLoan?.title}
        maxWidthClass="md:max-w-md"
        footer={
          payingLoan ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayingLoan(null)}
                className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onPayLoanInstallment(payingLoan.id, payAccountId);
                  setPayingLoan(null);
                }}
                className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
              >
                {t(lang, 'تایید و پرداخت قسط', 'Confirm Payment')}
              </button>
            </div>
          ) : undefined
        }
      >
        {payingLoan && (
          <>
            <div>
              <label className="text-xs text-[var(--ft-text-muted)] block mb-1">
                {t(lang, 'انتخاب حساب بانکی مبدأ', 'Select Bank Account')}
              </label>
              <GlassSelect
                className="w-full"
                value={payAccountId}
                onChange={setPayAccountId}
                options={state.bankAccounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                  hint: formatMoney(a.balance, a.currency, lang, false, isPrivate),
                }))}
              />
            </div>

            {(() => {
              const selectedAcc = state.bankAccounts.find((a) => a.id === payAccountId);
              if (!selectedAcc) return null;
              const converted = convertCurrency(
                payingLoan.installmentAmount,
                payingLoan.currency,
                selectedAcc.currency,
                usdToman
              );
              const enough = selectedAcc.balance >= converted;
              return (
                <div className="p-3 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] space-y-1 text-xs">
                  <div className="font-medium text-[var(--ft-text-primary)]">
                    {t(
                      lang,
                      `کسر ${formatMoney(converted, selectedAcc.currency, lang, false, isPrivate)} از حساب «${selectedAcc.name}»؟`,
                      `Deduct ${formatMoney(converted, selectedAcc.currency, lang, false, isPrivate)} from "${selectedAcc.name}"?`
                    )}
                  </div>
                  {selectedAcc.currency !== payingLoan.currency && (
                    <div className="text-[var(--ft-text-muted)] font-num">
                      {t(lang, 'نرخ تبدیل:', 'FX Rate:')} 1 USD = {usdToman.toLocaleString('en-US')} IRT
                    </div>
                  )}
                  {!enough && (
                    <div className="text-[var(--ft-danger)] font-semibold pt-1">
                      {t(lang, 'موجودی کافی نیست', 'Insufficient balance')}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </ResponsiveModalSheet>

      {/* MODAL / SHEET: Add / Edit Person Contact */}
      <ResponsiveModalSheet
        open={personModalOpen}
        onClose={() => setPersonModalOpen(false)}
        title={
          editingPersonId
            ? t(lang, 'ویرایش مشخصات شخص', 'Edit Person')
            : t(lang, 'تعریف شخص جدید در دفتر حساب', 'Add New Person')
        }
        maxWidthClass="md:max-w-md"
        asForm
        onSubmit={handleSavePerson}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPersonModalOpen(false)}
              className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
            >
              {t(lang, 'انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer"
            >
              {t(lang, 'ذخیره شخص', 'Save Person')}
            </button>
          </div>
        }
      >
        <MaterialInput
          type="text"
          required
          label={t(lang, 'نام و نام خانوادگی', 'Full Name')}
          value={pName}
          onChange={(e) => setPName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3 items-start">
          <div className="md-field">
            <label className="md-field-label">{t(lang, 'نقش', 'Role')}</label>
            <GlassSelect<PersonRole>
              className="w-full"
              value={pRole}
              onChange={setPRole}
              options={[
                { value: 'partner', label: t(lang, 'شریک / هم‌تیم', 'Partner') },
                { value: 'client', label: t(lang, 'مشتری / صرافی', 'Client / Exchange') },
                { value: 'friend', label: t(lang, 'دوست', 'Friend') },
                { value: 'family', label: t(lang, 'خانواده', 'Family') },
                { value: 'other', label: t(lang, 'سایر', 'Other') },
              ]}
            />
          </div>
          <MaterialInput
            type="text"
            ltrNum
            label={t(lang, 'شماره تماس (اختیاری)', 'Phone (optional)')}
            value={pPhone}
            onChange={(e) => setPPhone(e.target.value)}
          />
        </div>
        <MaterialInput
          type="text"
          label={t(lang, 'توضیح یا زمینه همکاری', 'Note / Context')}
          value={pNote}
          onChange={(e) => setPNote(e.target.value)}
        />
      </ResponsiveModalSheet>

      {/* MODAL / SHEET: Log Person Transfer / Ledger Entry */}
      <ResponsiveModalSheet
        open={personEntryModalOpen}
        onClose={() => setPersonEntryModalOpen(false)}
        title={t(lang, 'ثبت نقل‌وانتقال و گردش حساب شخص', 'Log Person Transfer / Entry')}
        maxWidthClass="md:max-w-md"
        asForm
        onSubmit={handleSavePersonEntry}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPersonEntryModalOpen(false)}
              className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
            >
              {t(lang, 'انصراف', 'Cancel')}
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer"
            >
              {t(lang, 'ثبت در دفتر حساب', 'Save Entry')}
            </button>
          </div>
        }
      >
        <div>
          <label className="text-xs text-[var(--ft-text-muted)] block mb-1">
            {t(lang, 'انتخاب شخص', 'Select Person')}
          </label>
          <GlassSelect
            className="w-full"
            value={pePersonId}
            onChange={setPePersonId}
            options={(state.people ?? []).map((p) => ({
              value: p.id,
              label: p.name,
            }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
          <button
            type="button"
            onClick={() => setPeDirection('give')}
            className={`min-h-[38px] py-2 text-xs font-medium rounded-lg cursor-pointer ${
              peDirection === 'give'
                ? 'bg-[var(--ft-positive)] text-white'
                : 'text-[var(--ft-text-secondary)]'
            }`}
          >
            {t(lang, 'پرداخت به شخص (+طلب ما)', 'Paid to Person (+Owed)')}
          </button>
          <button
            type="button"
            onClick={() => setPeDirection('receive')}
            className={`min-h-[38px] py-2 text-xs font-medium rounded-lg cursor-pointer ${
              peDirection === 'receive'
                ? 'bg-[var(--ft-danger)] text-white'
                : 'text-[var(--ft-text-secondary)]'
            }`}
          >
            {t(lang, 'دریافت از شخص (+بدهی ما)', 'Received from Person')}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 items-start">
          {(() => {
            const peNum = Number(peAmount);
            const linkedAcc = state.bankAccounts.find((a) => a.id === peAccountId);
            const peErr =
              peAmount !== '' && (!Number.isFinite(peNum) || peNum <= 0)
                ? t(lang, 'مبلغ باید > ۰ باشد', 'Must be > 0')
                : undefined;
            const peWarn =
              !peErr &&
              peDirection === 'give' &&
              linkedAcc &&
              peAmount !== '' &&
              convertCurrency(peNum, peCurrency, linkedAcc.currency, usdToman) > linkedAcc.balance
                ? t(lang, 'از موجودی حساب بیشتر است', 'Exceeds bank balance')
                : undefined;
            return (
              <MaterialInput
                type="number"
                step="any"
                required
                ltrNum
                label={t(lang, 'مبلغ', 'Amount')}
                value={peAmount}
                onChange={(e) => setPeAmount(e.target.value)}
                error={peErr}
                warning={peWarn}
              />
            );
          })()}
          <div className="md-field">
            <label className="md-field-label">{t(lang, 'ارز', 'Currency')}</label>
            <GlassSelect<CurrencyCode>
              className="w-full"
              value={peCurrency}
              onChange={setPeCurrency}
              options={[
                { value: 'IRT', label: 'IRT (تومان)' },
                { value: 'USD', label: 'USD ($)' },
              ]}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-[var(--ft-text-muted)] block mb-1">
            {t(lang, 'اتصال به حساب بانکی (اختیاری)', 'Linked Bank Account (Optional)')}
          </label>
          <GlassSelect
            className="w-full"
            value={peAccountId}
            onChange={setPeAccountId}
            options={[
              { value: '', label: t(lang, 'بدون حساب بانکی (فقط ثبت دفتری)', 'Ledger-Only (No Bank Transfer)') },
              ...state.bankAccounts.map((a) => ({
                value: a.id,
                label: a.name,
                hint: formatMoney(a.balance, a.currency, lang, false, isPrivate),
              })),
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 items-start">
          <JalaliDatePicker
            lang={lang}
            fieldSize="sm"
            label={t(lang, 'تاریخ (جلالی)', 'Date')}
            value={peDate}
            onChange={setPeDate}
          />
          <MaterialInput
            type="text"
            fieldSize="sm"
            label={t(lang, 'شرح', 'Note')}
            placeholder={t(lang, 'مثلاً تسویه قرض', 'e.g. Settlement')}
            value={peNote}
            onChange={(e) => setPeNote(e.target.value)}
          />
        </div>
      </ResponsiveModalSheet>

      {/* MODAL / SHEET: Pay #1 Priority Debt (1-Click Debt-First Execution) */}
      <ResponsiveModalSheet
        open={Boolean(priorityPayModalOpen && payoffPlan.priorityQueue[0] && onPayTopPriorityDebt)}
        onClose={() => setPriorityPayModalOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--ft-danger)]" />
            <span>{t(lang, 'پرداخت بالاترین اولویت بدهی (#1)', 'Pay #1 Priority Debt')}</span>
          </span>
        }
        maxWidthClass="md:max-w-md"
        footer={
          payoffPlan.priorityQueue[0] && onPayTopPriorityDebt ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPriorityPayModalOpen(false)}
                className="min-h-[44px] px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border)] cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onPayTopPriorityDebt(priorityPayAccId);
                  setPriorityPayModalOpen(false);
                }}
                className="min-h-[44px] flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer"
              >
                {t(lang, 'تایید و پرداخت فوری', 'Confirm Priority Payment')}
              </button>
            </div>
          ) : undefined
        }
      >
        {payoffPlan.priorityQueue[0] && (
          <>
            <div className="p-3.5 rounded-2xl glass-tile space-y-1">
              <div className="text-xs text-[var(--ft-danger)] font-semibold">
                {payoffPlan.priorityQueue[0].kind === 'loan_installment'
                  ? t(lang, 'قسط وام / تعهد در بالاترین اولویت', 'Highest-Priority Loan Installment')
                  : t(lang, 'بدهی به شخص در بالاترین اولویت', 'Highest-Priority Personal Debt')}
              </div>
              <div className="text-sm font-bold text-[var(--ft-text-primary)]">
                {payoffPlan.priorityQueue[0].title}
              </div>
              <div className="font-num text-base font-extrabold text-[var(--ft-accent)]">
                {formatMoney(payoffPlan.priorityQueue[0].dueAmountIrt, 'IRT', lang, false, isPrivate)}
              </div>
            </div>

            <div>
              <label className="text-xs text-[var(--ft-text-muted)] block mb-1">
                {t(lang, 'حساب بانکی پرداخت‌کننده', 'Source Bank Account')}
              </label>
              <GlassSelect
                className="w-full"
                value={priorityPayAccId}
                onChange={setPriorityPayAccId}
                options={state.bankAccounts.map((a) => ({
                  value: a.id,
                  label: a.name,
                  hint: formatMoney(a.balance, a.currency, lang, false, isPrivate),
                }))}
              />
            </div>
          </>
        )}
      </ResponsiveModalSheet>
    </div>
  );
};
