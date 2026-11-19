import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AppLanguage, EmotionTag, Trade } from '../types';
import { convertCurrency, formatMoney, maskText, PRIVATE_MASK } from '../utils/domain';
import { formatJalaliDateTime } from '../utils/jalali';
import { t } from '../i18n/translations';
import { MaterialInput, MaterialTextarea } from './MaterialInputs';
import { ResponsiveModalSheet } from './M3MobilePrimitives';

interface TradeReviewDrawerProps {
  trade: Trade | null;
  lang: AppLanguage;
  usdToman: number;
  privateMode?: boolean;
  onClose: () => void;
  onSaveReview: (
    tradeId: string,
    patch: Partial<Pick<Trade, 'setupTag' | 'emotionTag' | 'slRespected' | 'reviewNote'>>
  ) => void;
}

const EMOTION_CHOICES: Array<{ id: EmotionTag; fa: string; en: string }> = [
  { id: 'calm', fa: 'آرام', en: 'Calm' },
  { id: 'focused', fa: 'مطمئن / متمرکز', en: 'Focused' },
  { id: 'hesitant', fa: 'تردید', en: 'Hesitant' },
  { id: 'fomo', fa: 'FOMO', en: 'FOMO' },
  { id: 'revenge', fa: 'انتقامی', en: 'Revenge' },
];

function formatHoldDuration(openIso: string, closeIso: string): string {
  const diffMin = Math.max(
    0,
    Math.round((new Date(closeIso).getTime() - new Date(openIso).getTime()) / 60000)
  );
  if (diffMin < 60) return `${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export const TradeReviewDrawer: React.FC<TradeReviewDrawerProps> = ({
  trade,
  lang,
  usdToman,
  privateMode = false,
  onClose,
  onSaveReview,
}) => {
  const [setupTag, setSetupTag] = useState(trade?.setupTag ?? '');
  const [emotionTag, setEmotionTag] = useState<EmotionTag>(trade?.emotionTag ?? 'calm');
  const [slRespected, setSlRespected] = useState<boolean>(trade?.slRespected ?? true);
  const [reviewNote, setReviewNote] = useState(trade?.reviewNote ?? '');

  React.useEffect(() => {
    if (trade) {
      setSetupTag(trade.setupTag);
      setEmotionTag(trade.emotionTag ?? 'calm');
      setSlRespected(trade.slRespected ?? true);
      setReviewNote(trade.reviewNote);
    }
  }, [trade]);

  if (!trade) return null;

  const holdDuration = formatHoldDuration(trade.openTime, trade.closeTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveReview(trade.id, {
      setupTag: setupTag.trim() || 'MT5 Deal',
      emotionTag,
      slRespected,
      reviewNote: reviewNote.trim(),
    });
    onClose();
  };

  return (
    <ResponsiveModalSheet
      open={Boolean(trade)}
      onClose={onClose}
      desktopVariant="side-drawer"
      asForm
      onSubmit={handleSubmit}
      title={`${trade.symbol} · ${trade.direction}`}
      subtitle={
        <span className="font-num">
          #{maskText(trade.ticket, privateMode)} · {trade.session} · {holdDuration}
        </span>
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer"
          >
            {t(lang, 'بستن', 'Cancel')}
          </button>
          <button
            type="submit"
            className="min-h-[44px] flex-1 sm:flex-none px-5 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer"
          >
            {t(lang, 'ذخیره بازبینی معامله', 'Save Review')}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
        <div>
          <div className="text-xs text-[var(--ft-text-muted)]">{t(lang, 'سود/زیان', 'P&L')}</div>
          <div
            className={`font-num text-lg font-bold ${
              trade.profitUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
            }`}
          >
            {privateMode
              ? PRIVATE_MASK
              : `${trade.profitUsd >= 0 ? '+' : ''}${formatMoney(trade.profitUsd, 'USD', lang)}`}
          </div>
          <div className="font-num text-xs text-[var(--ft-text-muted)]">
            {formatMoney(
              convertCurrency(trade.profitUsd, 'USD', 'IRT', usdToman),
              'IRT',
              lang,
              true,
              privateMode
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--ft-text-muted)]">
            {t(lang, 'ضریب ریسک به ریوارد', 'R-Multiple')}
          </div>
          <div className="font-num text-lg font-bold text-[var(--ft-accent)]">
            {trade.rMultiple >= 0 ? '+' : ''}
            {trade.rMultiple}R
          </div>
          <div className="font-num text-xs text-[var(--ft-text-muted)]">
            {formatJalaliDateTime(trade.closeTime, lang)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 text-xs font-num text-[var(--ft-text-secondary)]">
        <div>Open: {trade.openPrice}</div>
        <div>Close: {trade.closePrice}</div>
        <div>SL: {trade.sl || '—'}</div>
        <div>TP: {trade.tp || '—'}</div>
        <div>
          {t(lang, 'حجم (Lot):', 'Volume:')} {trade.volume}
        </div>
        <div>
          {t(lang, 'مدت نگهداری:', 'Duration:')} {holdDuration}
        </div>
        <div>Comm: {privateMode ? '••••' : `$${(trade.commissionUsd ?? 0).toFixed(2)}`}</div>
        <div>Swap: {privateMode ? '••••' : `$${(trade.swapUsd ?? 0).toFixed(2)}`}</div>
      </div>

      {/* M3 Emotion Psychology Selector */}
      <div className="space-y-2 pt-3 border-t border-[var(--ft-border)]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--ft-text-secondary)]">
            {t(lang, 'وضعیت روانی و احساس حین معامله', 'Trade Emotion State')}
          </span>
          <button
            type="button"
            onClick={() => setSlRespected((v) => !v)}
            className={`min-h-[34px] px-3 rounded-xl text-[11px] font-semibold border flex items-center gap-1.5 cursor-pointer transition-colors ${
              slRespected
                ? 'bg-[var(--ft-positive-soft)] border-[var(--ft-positive)]/40 text-[var(--ft-positive)]'
                : 'bg-[var(--ft-danger-soft)] border-[var(--ft-danger)]/40 text-[var(--ft-danger)]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {slRespected
                ? t(lang, 'حد ضرر رعایت شد', 'SL Respected')
                : t(lang, 'نقض حد ضرر', 'SL Violated')}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EMOTION_CHOICES.map((em) => {
            const active = emotionTag === em.id;
            const isRisky = em.id === 'fomo' || em.id === 'revenge';
            return (
              <button
                key={em.id}
                type="button"
                onClick={() => setEmotionTag(em.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  active
                    ? isRisky
                      ? 'bg-[var(--ft-danger-soft)] border-[var(--ft-danger)] text-[var(--ft-danger)] font-semibold'
                      : 'ft-accent-gradient border-transparent font-semibold'
                    : 'border-[var(--ft-border)] text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)]'
                }`}
              >
                {lang === 'fa' ? em.fa : em.en}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <MaterialInput
          type="text"
          label={t(lang, 'برچسب ستاپ معامله', 'Setup Tag')}
          value={setupTag}
          onChange={(e) => setSetupTag(e.target.value)}
        />

        <MaterialTextarea
          label={t(lang, 'یادداشت بازبینی پس از معامله', 'Post-Trade Review Notes')}
          rows={4}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder={t(lang, 'دلیل ورود، مدیریت پوزیشن و درس آموخته...', 'Entry rationale, management & lesson...')}
        />
      </div>
    </ResponsiveModalSheet>
  );
};
