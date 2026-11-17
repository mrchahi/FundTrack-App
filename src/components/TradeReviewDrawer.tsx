import React, { useState } from 'react';
import { X } from 'lucide-react';
import { AppLanguage, Trade } from '../types';
import { convertCurrency, formatMoney, maskText, PRIVATE_MASK } from '../utils/domain';
import { formatJalaliDateTime } from '../utils/jalali';
import { t } from '../i18n/translations';
import { MaterialInput, MaterialTextarea } from './MaterialInputs';

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

function formatHoldDuration(openIso: string, closeIso: string): string {
  const diffMin = Math.max(0, Math.round((new Date(closeIso).getTime() - new Date(openIso).getTime()) / 60000));
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
  const [reviewNote, setReviewNote] = useState(trade?.reviewNote ?? '');

  React.useEffect(() => {
    if (trade) {
      setSetupTag(trade.setupTag);
      setReviewNote(trade.reviewNote);
    }
  }, [trade]);

  if (!trade) return null;

  const holdDuration = formatHoldDuration(trade.openTime, trade.closeTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveReview(trade.id, {
      setupTag: setupTag.trim() || 'MT5 Deal',
      reviewNote: reviewNote.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
      <form
        onSubmit={handleSubmit}
        className="glass-surface-high w-full max-w-md h-full p-6 overflow-y-auto flex flex-col justify-between gap-6"
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--ft-border)]">
            <div>
              <div className="font-num text-xs text-[var(--ft-text-muted)]">
                #{maskText(trade.ticket, privateMode)} · {trade.session}
              </div>
              <h3 className="text-lg font-bold text-[var(--ft-text-primary)]">
                {trade.symbol} · {trade.direction}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-[var(--ft-surface-hover)] cursor-pointer"
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
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
                {formatMoney(convertCurrency(trade.profitUsd, 'USD', 'IRT', usdToman), 'IRT', lang, true, privateMode)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--ft-text-muted)]">{t(lang, 'ضریب ریسک به ریوارد', 'R-Multiple')}</div>
              <div className="font-num text-lg font-bold text-[var(--ft-accent)]">
                {trade.rMultiple >= 0 ? '+' : ''}
                {trade.rMultiple}R
              </div>
              <div className="font-num text-xs text-[var(--ft-text-muted)]">
                {formatJalaliDateTime(trade.closeTime, lang)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-num text-[var(--ft-text-secondary)]">
            <div>Open: {trade.openPrice}</div>
            <div>Close: {trade.closePrice}</div>
            <div>SL: {trade.sl || '—'}</div>
            <div>TP: {trade.tp || '—'}</div>
            <div>{t(lang, 'حجم (Lot):', 'Volume:')} {trade.volume}</div>
            <div>{t(lang, 'مدت نگهداری:', 'Duration:')} {holdDuration}</div>
            <div>Comm: {privateMode ? '••••' : `$${(trade.commissionUsd ?? 0).toFixed(2)}`}</div>
            <div>Swap: {privateMode ? '••••' : `$${(trade.swapUsd ?? 0).toFixed(2)}`}</div>
          </div>

          <div className="space-y-3 pt-3 border-t border-[var(--ft-border)]">
            <MaterialInput
              type="text"
              label={t(lang, 'برچسب معامله (اختیاری)', 'Trade Tag (Optional)')}
              value={setupTag}
              onChange={(e) => setSetupTag(e.target.value)}
            />

            <MaterialTextarea
              label={t(lang, 'یادداشت بازبینی پس از معامله', 'Post-Trade Review Notes')}
              rows={5}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder={t(lang, 'دلیل ورود، مدیریت پوزیشن و درس آموخته...', 'Entry rationale, management & lesson...')}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--ft-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-xl border border-[var(--ft-border)] cursor-pointer"
          >
            {t(lang, 'بستن', 'Cancel')}
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
          >
            {t(lang, 'ذخیره یادداشت', 'Save Notes')}
          </button>
        </div>
      </form>
    </div>
  );
};
