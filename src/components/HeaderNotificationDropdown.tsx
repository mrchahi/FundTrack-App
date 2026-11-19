import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  Calendar,
  Check,
  CheckCheck,
  CreditCard,
  Target,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  AppLanguage,
  FundTrackState,
  MainCategory,
  NotificationItem,
  SystemSettings,
} from '../types';
import { t } from '../i18n/translations';
import { buildUnifiedNotificationFeed, UnifiedFeedEntry } from '../utils/notifications';

interface HeaderNotificationDropdownProps {
  state: FundTrackState;
  onNavigate: (cat: MainCategory, sub?: string) => void;
  onMarkRead: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  onMarkAllRead: (ids: string[]) => void;
  onClearRead: (readIds: string[]) => void;
  onNotificationAction: (notif: NotificationItem) => void;
  onUpdateSettings?: (patch: Partial<SystemSettings>) => void;
  compactCircle?: boolean;
}

type DropdownCategory = 'all' | 'system' | 'debts' | 'news';

export const HeaderNotificationDropdown: React.FC<HeaderNotificationDropdownProps> = ({
  state,
  onNavigate,
  onMarkRead,
  onDeleteNotification,
  onMarkAllRead,
  onClearRead,
  onNotificationAction,
  onUpdateSettings,
  compactCircle = false,
}) => {
  const lang: AppLanguage = state.settings.language;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<DropdownCategory>('all');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const feed = useMemo(() => buildUnifiedNotificationFeed(state), [state]);

  const counts = useMemo(() => {
    const unreadItems = feed.filter((f) => f.unread);
    const readItems = feed.filter((f) => !f.unread);
    const systemCount = feed.filter((f) => f.category === 'system').length;
    const debtsCount = feed.filter((f) => f.category === 'debts').length;
    const newsCount = feed.filter((f) => f.category === 'news').length;
    return {
      all: feed.length,
      system: systemCount,
      debts: debtsCount,
      news: newsCount,
      unreadCount: unreadItems.length,
      readIds: readItems.map((i) => i.id),
      allIds: feed.map((i) => i.id),
    };
  }, [feed]);

  const visibleItems = useMemo(() => {
    if (filter === 'all') return feed;
    return feed.filter((item) => item.category === filter);
  }, [feed, filter]);

  const renderCategoryIcon = (cat: UnifiedFeedEntry['category'], tone: UnifiedFeedEntry['tone']) => {
    const colorClass =
      tone === 'danger'
        ? 'text-[var(--ft-danger)]'
        : tone === 'warning'
        ? 'text-[var(--ft-warning)]'
        : tone === 'positive'
        ? 'text-[var(--ft-positive)]'
        : 'text-[var(--ft-accent)]';

    if (cat === 'system') return <Activity className={`w-4 h-4 ${colorClass}`} />;
    if (cat === 'debts') return <CreditCard className={`w-4 h-4 ${colorClass}`} />;
    if (cat === 'news') return <Calendar className={`w-4 h-4 ${colorClass}`} />;
    return <Target className={`w-4 h-4 ${colorClass}`} />;
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t(lang, 'مرکز اعلان‌ها', 'Notifications')}
        title={t(lang, 'مرکز اعلان‌ها', 'Notifications')}
        className={
          compactCircle
            ? `relative w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                open
                  ? 'bg-[var(--ft-text-primary)] text-[var(--ft-surface-solid)] shadow-sm'
                  : 'text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] hover:text-[var(--ft-text-primary)]'
              }`
            : `min-h-[38px] px-3 py-1.5 rounded-xl glass-surface-control flex items-center gap-2 transition-all cursor-pointer ${
                open ? 'border-[var(--ft-accent)] ring-1 ring-[var(--ft-accent)]' : 'hover:border-[var(--ft-border-strong)]'
              }`
        }
      >
        <Bell
          className={`w-4 h-4 ${
            open && compactCircle
              ? 'text-[var(--ft-surface-solid)]'
              : counts.unreadCount > 0
              ? 'text-[var(--ft-accent)]'
              : 'text-current'
          }`}
        />
        {counts.unreadCount > 0 &&
          (compactCircle ? (
            <span
              className={`absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full font-num text-[10px] font-bold leading-none flex items-center justify-center shadow-sm ${
                feed.some((f) => f.unread && f.tone === 'danger')
                  ? 'bg-[var(--ft-danger)] text-white'
                  : 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)]'
              }`}
            >
              {counts.unreadCount > 9 ? '9+' : counts.unreadCount}
            </span>
          ) : (
            <span
              className={`font-num text-xs font-bold leading-none ${
                feed.some((f) => f.unread && f.tone === 'danger')
                  ? 'text-[var(--ft-danger)]'
                  : 'text-[var(--ft-accent)]'
              }`}
            >
              {counts.unreadCount}
            </span>
          ))}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t(lang, 'اعلان‌ها', 'Notifications')}
          className="absolute top-full end-0 mt-2 w-[min(92vw,420px)] max-h-[76vh] flex flex-col rounded-3xl glass-dropdown z-[95] overflow-hidden"
        >
          {/* Dropdown Header */}
          <div className="px-4 pt-4 pb-3 border-b border-[var(--ft-border)] space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[var(--ft-text-primary)]">
                  {t(lang, 'اعلان‌ها و رویدادها', 'Notifications')}
                </h3>
                <p className="text-[11px] font-num text-[var(--ft-text-muted)] mt-0.5">
                  {t(
                    lang,
                    `${counts.unreadCount} خوانده‌نشده · ${counts.debts} قسط · ${counts.news} خبر امروز`,
                    `${counts.unreadCount} unread · ${counts.debts} debts · ${counts.news} today news`
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {counts.unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onMarkAllRead(counts.allIds)}
                    title={t(lang, 'خواندن همه', 'Mark all read')}
                    className="p-1.5 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-accent)] cursor-pointer transition-colors"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                {counts.readIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onClearRead(counts.readIds)}
                    title={t(lang, 'حذف خوانده‌شده‌ها', 'Clear read')}
                    className="p-1.5 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl glass-tile">
              {(
                [
                  ['all', t(lang, 'همه', 'All'), counts.all],
                  ['system', t(lang, 'سیستم', 'System'), counts.system],
                  ['debts', t(lang, 'اقساط', 'Debts'), counts.debts],
                  ['news', t(lang, 'اخبار روز', 'Today News'), counts.news],
                ] as Array<[DropdownCategory, string, number]>
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`py-1.5 px-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer truncate flex items-center justify-center gap-1 ${
                    filter === id
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
                  }`}
                >
                  <span className="truncate">{label}</span>
                  <span className="font-num opacity-80">({count})</span>
                </button>
              ))}
            </div>

            {onUpdateSettings && (
              <div className="flex items-center justify-between gap-2 text-[11px] px-1">
                <div className="flex items-center gap-1.5 text-[var(--ft-text-muted)]">
                  <span>{t(lang, 'یادآور خبر امروز:', 'News alert:')}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const opts = [15, 30, 60, 5, 10];
                      const curr = state.settings.newsAlertLeadMinutes ?? 15;
                      const next = opts[(opts.indexOf(curr) + 1) % opts.length] ?? 15;
                      onUpdateSettings({ newsAlertLeadMinutes: next });
                    }}
                    className="px-2 py-0.5 rounded-full bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] font-num font-semibold cursor-pointer hover:opacity-90"
                    title={t(lang, 'تغییر زمان یادآوری قبل از خبر', 'Cycle alert lead time')}
                  >
                    {state.settings.newsAlertLeadMinutes ?? 15} {t(lang, 'دقیقه قبل', 'min before')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      newsAlertSoundEnabled: state.settings.newsAlertSoundEnabled === false,
                    })
                  }
                  className={`px-2 py-0.5 rounded-full border flex items-center gap-1 cursor-pointer transition-colors ${
                    state.settings.newsAlertSoundEnabled !== false
                      ? 'border-[var(--ft-accent)] text-[var(--ft-accent)]'
                      : 'border-[var(--ft-border)] text-[var(--ft-text-muted)]'
                  }`}
                  title={t(lang, 'قطع/وصل صدای هشدار خبر', 'Toggle news alarm sound')}
                >
                  {state.settings.newsAlertSoundEnabled !== false ? (
                    <Volume2 className="w-3 h-3" />
                  ) : (
                    <VolumeX className="w-3 h-3" />
                  )}
                  <span>{state.settings.newsAlertSoundEnabled !== false ? t(lang, 'صدا', 'Sound') : t(lang, 'بی‌صدا', 'Mute')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--ft-border)]">
            {visibleItems.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'موردی در این دسته وجود ندارد.', 'No notifications in this category.')}
              </div>
            ) : (
              visibleItems.map((item) => (
                <div
                  key={item.id}
                  className={`px-4 py-3.5 transition-colors hover:bg-[var(--ft-surface-hover)] ${
                    item.unread ? 'bg-[var(--ft-accent-soft)]/35' : 'opacity-75'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 p-2 rounded-xl glass-tile shrink-0">
                      {renderCategoryIcon(item.category, item.tone)}
                    </span>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span
                          className={`font-medium truncate ${
                            item.tone === 'danger'
                              ? 'text-[var(--ft-danger)]'
                              : item.tone === 'warning'
                              ? 'text-[var(--ft-warning)]'
                              : item.tone === 'positive'
                              ? 'text-[var(--ft-positive)]'
                              : 'text-[var(--ft-accent)]'
                          }`}
                        >
                          {item.metaLeft}
                        </span>
                        <span className="font-num text-[var(--ft-text-muted)] shrink-0">
                          {item.metaRight}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-[var(--ft-text-primary)] leading-snug">
                        {item.title}
                      </div>
                      <p className="text-[11px] text-[var(--ft-text-secondary)] leading-relaxed">
                        {item.detail}
                      </p>

                      <div className="flex items-center justify-between gap-2 pt-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onMarkRead(item.id);
                            if (item.persistedItem) {
                              onNotificationAction(item.persistedItem);
                            } else {
                              onNavigate(item.navigateTo.cat, item.navigateTo.sub);
                            }
                            setOpen(false);
                          }}
                          className="text-[11px] font-semibold text-[var(--ft-accent)] hover:underline cursor-pointer"
                        >
                          {item.actionLabel}
                        </button>

                        <div className="flex items-center gap-2">
                          {item.unread && (
                            <button
                              type="button"
                              onClick={() => onMarkRead(item.id)}
                              className="px-2 py-0.5 rounded-lg border border-[var(--ft-border)] hover:bg-[var(--ft-surface-subtle)] text-[11px] text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)] flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              <span>{t(lang, 'خوانده شد', 'Read')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteNotification(item.id)}
                            title={t(lang, 'حذف اعلان', 'Delete')}
                            aria-label={t(lang, 'حذف اعلان', 'Delete')}
                            className="p-1 rounded-lg hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="px-4 py-2.5 border-t border-[var(--ft-border)] flex items-center justify-between gap-2 bg-[var(--ft-surface-subtle)]">
            <button
              type="button"
              onClick={() => {
                onNavigate('overview', 'actions');
                setOpen(false);
              }}
              className="text-xs font-semibold text-[var(--ft-accent)] hover:underline cursor-pointer"
            >
              {t(lang, 'مرکز اقدام‌ها', 'Action Center')}
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('finance', 'planning');
                setOpen(false);
              }}
              className="text-xs font-medium text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)] cursor-pointer"
            >
              {t(lang, 'اولویت بدهی‌ها', 'Debt Queue')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
