import {
  AppLanguage,
  FundTrackState,
  MainCategory,
  NotificationItem,
} from '../types';
import { computeDebtPayoffPlan, formatMoney } from './domain';
import { formatJalaliDate, formatJalaliDateTime, toJalali } from './jalali';
import { t } from '../i18n/translations';

export interface UnifiedFeedEntry {
  id: string;
  category: 'system' | 'debts' | 'news';
  title: string;
  detail: string;
  metaLeft: string;
  metaRight: string;
  tone: 'danger' | 'warning' | 'positive' | 'accent' | 'muted';
  unread: boolean;
  persistedId?: string;
  persistedItem?: NotificationItem;
  navigateTo: { cat: MainCategory; sub?: string };
  actionLabel: string;
  timestampMs: number;
}

function formatCountdown(targetIso: string, lang: AppLanguage): string {
  const diffMs = new Date(targetIso).getTime() - Date.now();
  const absMin = Math.round(Math.abs(diffMs) / 60000);
  if (diffMs < 0) {
    if (absMin < 60) return t(lang, `${absMin} دقیقه پیش`, `${absMin}m ago`);
    const h = Math.floor(absMin / 60);
    return t(lang, `${h} ساعت پیش`, `${h}h ago`);
  }
  if (absMin < 60) return t(lang, `${absMin} دقیقه دیگر`, `in ${absMin}m`);
  const hours = Math.floor(absMin / 60);
  const mins = absMin % 60;
  if (hours < 24) {
    return mins > 0
      ? t(lang, `${hours} ساعت و ${mins} دقیقه دیگر`, `in ${hours}h ${mins}m`)
      : t(lang, `${hours} ساعت دیگر`, `in ${hours}h`);
  }
  const days = Math.round(hours / 24);
  return t(lang, `${days} روز دیگر`, `in ${days}d`);
}

export function buildUnifiedNotificationFeed(state: FundTrackState): UnifiedFeedEntry[] {
  const lang: AppLanguage = state.settings.language;
  const isPrivate = Boolean(state.settings.privateMode);
  const readSet = new Set(state.settings.readAlertIds ?? []);
  const dismissedSet = new Set(state.settings.dismissedAlertIds ?? []);

  const entries: UnifiedFeedEntry[] = [];
  const nowMs = Date.now();

  // 1. Live System Health alert
  if (
    (!state.settings.eventFileConnected || state.settings.lastSystemError) &&
    !dismissedSet.has('live_sys_health')
  ) {
    entries.push({
      id: 'live_sys_health',
      category: 'system',
      title: !state.settings.eventFileConnected
        ? t(lang, 'قطع اتصال فایل رویداد MT5', 'MT5 Event File Disconnected')
        : t(lang, 'هشدار وضعیت سیستم', 'System Error Detected'),
      detail:
        state.settings.lastSystemError ??
        t(lang, 'اتصال فایل رویداد غیرفعال است؛ وضعیت را در سلامت سیستم بررسی کنید.', 'Event file is offline; inspect System Health.'),
      metaLeft: t(lang, 'سیستم · وضعیت فوری', 'System · Attention'),
      metaRight: formatJalaliDateTime(state.settings.lastSyncAt, lang),
      tone: 'danger',
      unread: !readSet.has('live_sys_health'),
      navigateTo: { cat: 'system', sub: 'health' },
      actionLabel: t(lang, 'سلامت سیستم', 'Inspect Health'),
      timestampMs: nowMs + 100000,
    });
  }

  // 2. Pending Debt / Loan Tasks
  const debtPlan = computeDebtPayoffPlan(
    state.loans,
    'avalanche',
    state.settings.usdToman,
    state.people ?? [],
    state.personEntries ?? []
  );

  const coveredLoanIds = new Set<string>();
  debtPlan.priorityQueue.forEach((item, idx) => {
    const id = `live_debt_${item.id}`;
    if (item.loanId) coveredLoanIds.add(item.loanId);
    if (dismissedSet.has(id)) return;

    const dueDaysLeft = item.dueDate
      ? Math.ceil((new Date(item.dueDate).getTime() - nowMs) / 86400000)
      : null;
    const isUrgent = idx === 0 || (dueDaysLeft !== null && dueDaysLeft <= 3);

    entries.push({
      id,
      category: 'debts',
      title: item.title,
      detail:
        item.kind === 'loan_installment'
          ? t(
              lang,
              `قسط پیش‌رو: ${formatMoney(item.dueAmountIrt, 'IRT', lang, true, isPrivate)} · مانده کل: ${formatMoney(item.totalRemainingIrt, 'IRT', lang, true, isPrivate)}`,
              `Next installment: ${formatMoney(item.dueAmountIrt, 'IRT', lang, true, isPrivate)} · Remaining: ${formatMoney(item.totalRemainingIrt, 'IRT', lang, true, isPrivate)}`
            )
          : t(
              lang,
              `بدهی قابل تسویه: ${formatMoney(item.dueAmountIrt, 'IRT', lang, true, isPrivate)}`,
              `Payable personal debt: ${formatMoney(item.dueAmountIrt, 'IRT', lang, true, isPrivate)}`
            ),
      metaLeft:
        item.kind === 'loan_installment'
          ? t(lang, `اولویت #${idx + 1} · قسط وام`, `Priority #${idx + 1} · Loan`)
          : t(lang, `اولویت #${idx + 1} · بدهی به شخص`, `Priority #${idx + 1} · Personal Debt`),
      metaRight:
        dueDaysLeft !== null
          ? dueDaysLeft <= 0
            ? t(lang, 'سررسید امروز / معوق', 'Due now')
            : t(lang, `${dueDaysLeft} روز مانده`, `${dueDaysLeft}d left`)
          : t(lang, 'در صف اولویت', 'Queued'),
      tone: isUrgent ? 'danger' : 'warning',
      unread: !readSet.has(id),
      navigateTo: {
        cat: 'finance',
        sub: item.kind === 'personal_debt' ? 'people' : 'planning',
      },
      actionLabel:
        item.kind === 'loan_installment'
          ? t(lang, 'پرداخت قسط', 'Pay Installment')
          : t(lang, 'تسویه با شخص', 'Settle Debt'),
      timestampMs: item.dueDate ? new Date(item.dueDate).getTime() : nowMs - idx * 1000,
    });
  });

  // 3. Upcoming Fixed Bills (next 7 days)
  const todayJ = toJalali(new Date());
  const coveredFixedIds = new Set<string>();
  state.fixedExpenses
    .filter((fe) => fe.active)
    .forEach((fe) => {
      const diffDays =
        fe.dayOfMonth >= todayJ.jd ? fe.dayOfMonth - todayJ.jd : 30 - todayJ.jd + fe.dayOfMonth;
      if (diffDays <= 7) {
        coveredFixedIds.add(fe.id);
        const id = `live_fe_${fe.id}`;
        if (dismissedSet.has(id)) return;
        entries.push({
          id,
          category: 'debts',
          title: `${t(lang, 'هزینه ثابت:', 'Fixed Bill:')} ${fe.title}`,
          detail: `${formatMoney(fe.amount, fe.currency, lang, false, isPrivate)} · ${t(
            lang,
            `روز ${fe.dayOfMonth} ماه`,
            `Day ${fe.dayOfMonth}`
          )}`,
          metaLeft: t(lang, 'تعهد ثابت ماهانه', 'Fixed Obligation'),
          metaRight:
            diffDays === 0
              ? t(lang, 'امروز', 'Today')
              : t(lang, `${diffDays} روز مانده`, `${diffDays}d left`),
          tone: diffDays <= 2 ? 'warning' : 'accent',
          unread: !readSet.has(id),
          navigateTo: { cat: 'finance', sub: 'planning' },
          actionLabel: t(lang, 'مدیریت تعهدات', 'Open Bills'),
          timestampMs: nowMs + diffDays * 60000,
        });
      }
    });

  // 4. Today's Economic News ONLY (filtered to same local calendar day)
  const nowDate = new Date(nowMs);
  const isSameLocalDay = (d: Date) =>
    !Number.isNaN(d.getTime()) &&
    d.getFullYear() === nowDate.getFullYear() &&
    d.getMonth() === nowDate.getMonth() &&
    d.getDate() === nowDate.getDate();

  const leadMinutes = Math.max(1, state.settings.newsAlertLeadMinutes ?? 15);
  const coveredNewsIds = new Set<string>();
  state.economicEvents
    .filter((ev) => {
      const evDate = new Date(ev.timestamp);
      const evMs = evDate.getTime();
      if (!isSameLocalDay(evDate)) return false;
      // Keep today's upcoming events and events released up to 60 minutes ago
      return evMs >= nowMs - 60 * 60 * 1000;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .forEach((ev) => {
      coveredNewsIds.add(ev.id);
      const id = `live_news_${ev.id}`;
      if (dismissedSet.has(id)) return;
      const evMs = new Date(ev.timestamp).getTime();
      const minsUntil = (evMs - nowMs) / 60000;
      const withinLeadWindow = minsUntil <= leadMinutes && minsUntil >= -5;
      const impactText =
        ev.impact === 'high'
          ? t(lang, 'اثر بالا', 'High Impact')
          : ev.impact === 'medium'
          ? t(lang, 'اثر متوسط', 'Medium Impact')
          : t(lang, 'اثر کم', 'Low Impact');

      entries.push({
        id,
        category: 'news',
        title: ev.title,
        detail: `${ev.currency} · ${t(lang, 'پیش‌بینی:', 'Forecast:')} ${ev.forecast} · ${t(
          lang,
          'قبلی:',
          'Prev:'
        )} ${ev.previous}`,
        metaLeft: `${ev.currency} · ${impactText}${
          withinLeadWindow
            ? ` · ${t(lang, `هشدار ${leadMinutes} دقیقه‌ای`, `${leadMinutes}m Alert`)}`
            : ev.alarmEnabled
            ? ` · ${t(lang, `زنگ ${leadMinutes}د قبل`, `${leadMinutes}m Alarm`)}`
            : ''
        }`,
        metaRight: formatCountdown(ev.timestamp, lang),
        tone: withinLeadWindow || ev.impact === 'high' ? 'danger' : 'warning',
        unread: !readSet.has(id),
        navigateTo: { cat: 'trading', sub: 'calendar' },
        actionLabel: t(lang, 'تقویم اخبار', 'News Calendar'),
        timestampMs: evMs,
      });
    });

  // 5. Persisted Notification History (restrict persisted news alerts to today only)
  state.notifications.forEach((n) => {
    if (dismissedSet.has(n.id)) return;
    if (n.source === 'news' && !isSameLocalDay(new Date(n.createdAt))) return;
    if (n.source === 'loan' && n.targetId && coveredLoanIds.has(n.targetId) && n.read) return;
    if (n.source === 'fixed_expense' && n.targetId && coveredFixedIds.has(n.targetId) && n.read) return;
    if (n.source === 'news' && n.targetId && coveredNewsIds.has(n.targetId) && n.read) return;

    const cat: UnifiedFeedEntry['category'] =
      n.source === 'news'
        ? 'news'
        : n.source === 'loan' || n.source === 'debt' || n.source === 'fixed_expense'
        ? 'debts'
        : 'system';

    const sourceLabel =
      n.source === 'system'
        ? t(lang, 'رویداد سیستم', 'System Event')
        : n.source === 'goal'
        ? t(lang, 'اهداف و پاداش', 'Goals & XP')
        : n.source === 'loan'
        ? t(lang, 'قسط و وام', 'Loan Alert')
        : n.source === 'debt'
        ? t(lang, 'بدهی اشخاص', 'Personal Debt')
        : n.source === 'fixed_expense'
        ? t(lang, 'هزینه ثابت', 'Fixed Bill')
        : t(lang, 'خبر اقتصادی امروز', "Today's News");

    const isUnread = !n.read && !readSet.has(n.id);
    const tone: UnifiedFeedEntry['tone'] =
      n.severity === 'danger' || (isUnread && n.daysLeft < 1 && cat !== 'system')
        ? 'danger'
        : n.severity === 'warning'
        ? 'warning'
        : n.severity === 'success'
        ? 'positive'
        : 'accent';

    const navigateTo: { cat: MainCategory; sub?: string } =
      n.source === 'system'
        ? { cat: 'system', sub: 'health' }
        : n.source === 'news'
        ? { cat: 'trading', sub: 'calendar' }
        : n.source === 'goal'
        ? { cat: 'growth', sub: 'goals' }
        : n.source === 'debt'
        ? { cat: 'finance', sub: 'people' }
        : { cat: 'finance', sub: 'planning' };

    entries.push({
      id: n.id,
      category: cat,
      title: n.title,
      detail: n.detail,
      metaLeft: sourceLabel,
      metaRight: formatJalaliDate(n.createdAt, lang),
      tone,
      unread: isUnread,
      persistedId: n.id,
      persistedItem: n,
      navigateTo,
      actionLabel:
        n.source === 'system'
          ? t(lang, 'سلامت سیستم', 'System Health')
          : n.source === 'news'
          ? t(lang, 'تقویم اخبار', 'Open News')
          : n.source === 'goal'
          ? t(lang, 'مشاهده اهداف', 'View Goals')
          : n.source === 'debt'
          ? t(lang, 'دفتر اشخاص', 'People Ledger')
          : t(lang, 'مشاهده و پرداخت', 'View & Pay'),
      timestampMs: new Date(n.createdAt).getTime(),
    });
  });

  return entries.sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    if (a.category === 'news' && b.category === 'news') {
      return a.timestampMs - b.timestampMs;
    }
    return b.timestampMs - a.timestampMs;
  });
}
