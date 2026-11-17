import React from 'react';
import {
  Bot,
  ChevronDown,
  Maximize2,
  MessageCircle,
  MessageSquarePlus,
  Settings,
  X,
} from 'lucide-react';
import {
  AssistantActionPayload,
  AssistantMemoryItem,
  AssistantThread,
  FundTrackState,
} from '../types';
import { t } from '../i18n/translations';
import { resolveActiveModelProfile } from '../utils/assistantCopilot';
import { AssistantChatCore } from './AssistantChatCore';

interface LocalAiCommandModalProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onExpandToPage: () => void;
  onOpenSettings: () => void;
  state: FundTrackState;
  activeThread: AssistantThread;
  onCreateNewThread: () => void;
  onUpdateThread: (threadId: string, updater: (prev: AssistantThread) => AssistantThread) => void;
  onMarkGreetedToday: (dateKey: string) => void;
  onAddMemoryFact: (fact: string, category?: AssistantMemoryItem['category']) => void;
  onUpdateSettings: (patch: Partial<FundTrackState['settings']>) => void;
  onExecuteAction: (action: AssistantActionPayload) => { ok: boolean; summary?: string };
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const LocalAiCommandModal: React.FC<LocalAiCommandModalProps> = ({
  open,
  onToggle,
  onClose,
  onExpandToPage,
  onOpenSettings,
  state,
  activeThread,
  onCreateNewThread,
  onUpdateThread,
  onMarkGreetedToday,
  onAddMemoryFact,
  onUpdateSettings,
  onExecuteAction,
  onShowToast,
}) => {
  const lang = state.settings.language;
  const activeProfile = resolveActiveModelProfile(state.settings.localAi);
  const localAiEnabled = state.settings.localAi?.enabled ?? true;

  return (
    <>
      {open && (
        <section
          aria-label={t(lang, 'گفتگو با دستیار هوشمند', 'Assistant Chat Window')}
          className="fixed bottom-22 end-5 z-[72] w-[min(calc(100vw-2rem),430px)] h-[min(76vh,610px)] rounded-2xl glass-surface-high border border-[var(--ft-border-strong)] shadow-2xl flex flex-col overflow-hidden no-print"
        >
          {/* Compact Support Header */}
          <header className="px-4 py-3 border-b border-[var(--ft-border)] flex items-center justify-between gap-2 shrink-0 bg-[var(--ft-surface-solid)]/55">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-full ft-accent-gradient flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[var(--ft-text-primary)] truncate">
                  {t(lang, 'دستیار و تحلیل‌گر هوشمند پنل', 'Panel Copilot & Analyst')}
                </h3>
                <p className="text-[11px] text-[var(--ft-text-muted)] truncate font-num">
                  {localAiEnabled ? activeProfile.model : t(lang, 'حالت آفلاین پنل', 'Offline Panel Engine')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onExpandToPage}
                title={t(lang, 'باز کردن در صفحه کامل دستیار و تاریخچه', 'Open Full Assistant Page')}
                aria-label={t(lang, 'صفحه کامل دستیار', 'Open Full Page')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] hover:text-[var(--ft-text-primary)] transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                title={t(lang, 'مدیریت مدل‌ها و API در تنظیمات کلی', 'Manage Models & APIs')}
                aria-label={t(lang, 'مدیریت مدل‌ها و API', 'Manage Models')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] hover:text-[var(--ft-text-primary)] transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onCreateNewThread}
                title={t(lang, 'شروع گفتگوی جدید', 'New Conversation')}
                aria-label={t(lang, 'گفتگوی جدید', 'New Conversation')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] hover:text-[var(--ft-text-primary)] transition-colors cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                title={t(lang, 'بستن پنجره گفتگو', 'Minimize Chat')}
                aria-label={t(lang, 'بستن پنجره گفتگو', 'Minimize Chat')}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)] hover:text-[var(--ft-text-primary)] transition-colors cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </header>

          <AssistantChatCore
            state={state}
            thread={activeThread}
            compact
            autoFocus={open}
            onUpdateThread={onUpdateThread}
            onMarkGreetedToday={onMarkGreetedToday}
            onAddMemoryFact={onAddMemoryFact}
            onUpdateSettings={onUpdateSettings}
            onExecuteAction={onExecuteAction}
            onShowToast={onShowToast}
          />
        </section>
      )}

      {/* Standard Floating Trigger Button (FTB) */}
      <button
        type="button"
        onClick={onToggle}
        title={t(lang, 'گفتگو با دستیار هوشمند (Ctrl+J)', 'Open Assistant Chat (Ctrl+J)')}
        aria-label={t(lang, 'دستیار هوشمند', 'Open Assistant Chat')}
        className="fixed bottom-5 end-5 z-[73] w-14 h-14 rounded-full ft-accent-gradient shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center justify-center cursor-pointer no-print"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </>
  );
};
