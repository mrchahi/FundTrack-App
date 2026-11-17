import React, { useMemo, useState } from 'react';
import {
  Bot,
  Brain,
  History,
  MessageSquarePlus,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  AssistantActionPayload,
  AssistantMemoryItem,
  AssistantThread,
  FundTrackState,
} from '../types';
import { formatJalaliDateTime } from '../utils/jalali';
import { t } from '../i18n/translations';
import { AssistantChatCore } from './AssistantChatCore';

interface AssistantViewProps {
  state: FundTrackState;
  activeThread: AssistantThread;
  onSelectThread: (threadId: string) => void;
  onCreateNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
  onUpdateThread: (threadId: string, updater: (prev: AssistantThread) => AssistantThread) => void;
  onMarkGreetedToday: (dateKey: string) => void;
  onAddMemoryFact: (fact: string, category?: AssistantMemoryItem['category']) => void;
  onDeleteMemoryFact: (id: string) => void;
  onClearMemory: () => void;
  onOpenAiSettings: () => void;
  onUpdateSettings: (patch: Partial<FundTrackState['settings']>) => void;
  onExecuteAction: (action: AssistantActionPayload) => { ok: boolean; summary?: string };
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const AssistantView: React.FC<AssistantViewProps> = ({
  state,
  activeThread,
  onSelectThread,
  onCreateNewThread,
  onDeleteThread,
  onUpdateThread,
  onMarkGreetedToday,
  onAddMemoryFact,
  onDeleteMemoryFact,
  onClearMemory,
  onOpenAiSettings,
  onUpdateSettings,
  onExecuteAction,
  onShowToast,
}) => {
  const lang = state.settings.language;
  const threads = state.assistantThreads ?? [];
  const memories = state.assistantMemory ?? [];

  const [sidebarTab, setSidebarTab] = useState<'threads' | 'memory'>('threads');
  const [searchQuery, setSearchQuery] = useState('');
  const [newFact, setNewFact] = useState('');
  const [newFactCategory, setNewFactCategory] = useState<AssistantMemoryItem['category']>('preference');

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...threads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (!q) return sorted;
    return sorted.filter(
      (th) =>
        th.title.toLowerCase().includes(q) ||
        th.messages.some((m) => m.text.toLowerCase().includes(q))
    );
  }, [threads, searchQuery]);

  const handleSaveNewMemory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFact.trim();
    if (!cleaned) return;
    onAddMemoryFact(cleaned, newFactCategory);
    setNewFact('');
    onShowToast(t(lang, 'در حافظه دستیار ذخیره شد', 'Saved to assistant memory'), 'success');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 lg:h-[calc(100vh-140px)] min-h-[580px]">
      {/* Start Sidebar: Conversation History & Long-Term Memory */}
      <aside className="glass-surface rounded-3xl flex flex-col overflow-hidden border border-[var(--ft-border)]">
        <div className="p-3.5 border-b border-[var(--ft-border)] space-y-3 shrink-0">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
            <button
              type="button"
              onClick={() => setSidebarTab('threads')}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                sidebarTab === 'threads'
                  ? 'bg-[var(--ft-text-primary)] text-[var(--ft-surface-solid)] font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{t(lang, 'تاریخچه', 'History')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('memory')}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                sidebarTab === 'memory'
                  ? 'bg-[var(--ft-text-primary)] text-[var(--ft-surface-solid)] font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>
                {t(lang, 'حافظه', 'Memory')}
                {memories.length > 0 ? ` (${memories.length})` : ''}
              </span>
            </button>
          </div>

          {sidebarTab === 'threads' && (
            <>
              <button
                type="button"
                onClick={onCreateNewThread}
                className="w-full py-2.5 px-3 rounded-xl ft-accent-gradient text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <MessageSquarePlus className="w-4 h-4" />
                <span>{t(lang, 'گفتگوی جدید', 'New Conversation')}</span>
              </button>

              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
                <Search className="w-3.5 h-3.5 text-[var(--ft-text-muted)] shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t(lang, 'جستجو در گفتگوها...', 'Search threads...')}
                  className="flex-1 bg-transparent text-xs text-[var(--ft-text-primary)] placeholder:text-[var(--ft-text-muted)] focus:outline-none min-w-0"
                />
              </div>
            </>
          )}
        </div>

        {/* Thread History List */}
        {sidebarTab === 'threads' ? (
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 max-h-[300px] lg:max-h-none">
            {filteredThreads.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'گفتگویی پیدا نشد.', 'No conversations found.')}
              </div>
            ) : (
              filteredThreads.map((th) => {
                const isActive = th.id === activeThread.id;
                const msgCount = th.messages.filter((m) => !m.id.startsWith('welcome_')).length;
                return (
                  <div
                    key={th.id}
                    className={`group rounded-2xl border transition-colors flex items-center justify-between gap-2 px-3 py-2.5 ${
                      isActive
                        ? 'border-[var(--ft-accent)] bg-[var(--ft-accent-soft)]/35'
                        : 'border-transparent hover:border-[var(--ft-border)] hover:bg-[var(--ft-surface-hover)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectThread(th.id)}
                      className="flex-1 min-w-0 text-start cursor-pointer space-y-0.5"
                    >
                      <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                        {th.title || t(lang, 'گفتگوی جدید', 'New Conversation')}
                      </div>
                      <div className="text-[11px] text-[var(--ft-text-muted)] font-num truncate">
                        {formatJalaliDateTime(th.updatedAt, lang)} · {msgCount} {t(lang, 'پیام', 'msgs')}
                      </div>
                    </button>
                    {threads.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteThread(th.id)}
                        title={t(lang, 'حذف گفتگو', 'Delete thread')}
                        aria-label={t(lang, 'حذف گفتگو', 'Delete thread')}
                        className="p-1.5 rounded-lg text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] hover:bg-[var(--ft-danger-soft)] opacity-70 group-hover:opacity-100 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Long-Term Persistent Memory Manager */
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            <p className="text-[11px] text-[var(--ft-text-muted)] leading-relaxed">
              {t(
                lang,
                'نکات و قوانین این بخش در تمام گفتگوهای روزهای آینده هم به دستیار منتقل می‌شوند تا پیوستگی گفتگو حفظ شود.',
                'Facts and rules saved here persist across all threads and days for seamless continuity.'
              )}
            </p>

            <form onSubmit={handleSaveNewMemory} className="space-y-2">
              <textarea
                rows={2}
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                placeholder={t(
                  lang,
                  'مثلاً: فقط طلا XAUUSD معامله می‌کنم یا خریدهای روزمره از بلوبانک است...',
                  'e.g. I trade XAUUSD only, daily coffee goes to BlueBank...'
                )}
                className="w-full rounded-xl border border-[var(--ft-border-strong)] bg-[var(--ft-surface-subtle)] p-2.5 text-xs text-[var(--ft-text-primary)] placeholder:text-[var(--ft-text-muted)] focus:outline-none focus:border-[var(--ft-accent)] resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <select
                  value={newFactCategory}
                  onChange={(e) => setNewFactCategory(e.target.value as AssistantMemoryItem['category'])}
                  aria-label={t(lang, 'نوع حافظه', 'Memory type')}
                  className="bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--ft-text-primary)] focus:outline-none"
                >
                  <option value="preference">{t(lang, 'ترجیح شخصی', 'Preference')}</option>
                  <option value="rule">{t(lang, 'قانون ترید/مالی', 'Rule')}</option>
                  <option value="context">{t(lang, 'زمینه', 'Context')}</option>
                </select>
                <button
                  type="submit"
                  disabled={!newFact.trim()}
                  className="px-3 py-1.5 rounded-lg ft-accent-gradient text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t(lang, 'افزودن به حافظه', 'Save Memory')}</span>
                </button>
              </div>
            </form>

            <div className="space-y-2 pt-2 border-t border-[var(--ft-border)]">
              {memories.length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'هنوز موردی در حافظه ذخیره نشده است.', 'No persistent memory items yet.')}
                </div>
              ) : (
                <>
                  {memories.map((mem) => (
                    <div
                      key={mem.id}
                      className="p-2.5 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs text-[var(--ft-text-primary)] leading-relaxed">
                          {mem.fact}
                        </div>
                        <div className="text-[10px] text-[var(--ft-text-muted)] font-num">
                          {mem.category === 'rule'
                            ? t(lang, 'قانون', 'Rule')
                            : mem.category === 'context'
                            ? t(lang, 'زمینه', 'Context')
                            : t(lang, 'ترجیح', 'Preference')}{' '}
                          · {formatJalaliDateTime(mem.createdAt, lang)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteMemoryFact(mem.id)}
                        title={t(lang, 'حذف از حافظه', 'Remove memory')}
                        className="p-1 rounded-lg text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={onClearMemory}
                    className="w-full py-1.5 text-[11px] text-[var(--ft-danger)] hover:bg-[var(--ft-danger-soft)] rounded-lg cursor-pointer"
                  >
                    {t(lang, 'پاک کردن کل حافظه دستیار', 'Clear all memory')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main Dedicated Conversation Workspace */}
      <section className="glass-surface rounded-3xl flex flex-col overflow-hidden border border-[var(--ft-border)] min-h-[540px]">
        <header className="px-5 py-3.5 border-b border-[var(--ft-border)] flex items-center justify-between gap-3 shrink-0 bg-[var(--ft-surface-solid)]/45">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-full ft-accent-gradient flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[var(--ft-text-primary)] truncate">
                {activeThread.title || t(lang, 'دستیار و تحلیل‌گر هوشمند پنل', 'Panel Copilot Workspace')}
              </h2>
              <p className="text-[11px] text-[var(--ft-text-muted)] truncate font-num">
                {t(lang, 'ذخیره خودکار تاریخچه و حافظه بلندمدت', 'Persistent history & cross-session memory')} ·{' '}
                {formatJalaliDateTime(activeThread.updatedAt, lang)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCreateNewThread}
              className="px-3 py-1.5 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t(lang, 'گفتگوی جدید', 'New Chat')}</span>
            </button>
            <button
              type="button"
              onClick={onOpenAiSettings}
              className="px-3 py-1.5 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t(lang, 'تنظیمات مدل‌ها', 'AI Models')}</span>
            </button>
          </div>
        </header>

        <AssistantChatCore
          state={state}
          thread={activeThread}
          compact={false}
          autoFocus
          onUpdateThread={onUpdateThread}
          onMarkGreetedToday={onMarkGreetedToday}
          onAddMemoryFact={onAddMemoryFact}
          onUpdateSettings={onUpdateSettings}
          onExecuteAction={onExecuteAction}
          onShowToast={onShowToast}
        />
      </section>
    </div>
  );
};
