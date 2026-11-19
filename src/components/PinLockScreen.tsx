import React, { useEffect, useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { AppLanguage } from '../types';
import { t } from '../i18n/translations';
import { verifyPin } from '../utils/security';
import { MaterialInput } from './MaterialInputs';

interface PinLockScreenProps {
  expectedPin: string;
  expectedHash?: string;
  lang: AppLanguage;
  onUnlock: () => void;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  expectedPin,
  expectedHash,
  lang,
  onUnlock,
}) => {
  const [entered, setEntered] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);
  const [remainingSec, setRemainingSec] = useState<number>(0);

  useEffect(() => {
    if (!lockoutUntil) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      const diff = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setRemainingSec(diff);
      if (diff <= 0) {
        setLockoutUntil(0);
        setFailedCount(0);
        setError('');
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  const isCoolDown = remainingSec > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCoolDown || checking) return;
    if (!entered.trim()) return;

    setChecking(true);
    try {
      const valid = await verifyPin(entered, expectedHash, expectedPin);
      if (valid) {
        setError('');
        setFailedCount(0);
        onUnlock();
      } else {
        const nextFailed = failedCount + 1;
        setFailedCount(nextFailed);
        setEntered('');
        if (nextFailed >= MAX_ATTEMPTS) {
          setLockoutUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setError(
            t(
              lang,
              `تعداد تلاش‌های ناموفق بیش از حد مجاز است؛ ${LOCKOUT_SECONDS} ثانیه صبر کنید.`,
              `Too many failed attempts. Please wait ${LOCKOUT_SECONDS}s.`
            )
          );
        } else {
          setError(
            t(
              lang,
              `رمز PIN اشتباه است (${MAX_ATTEMPTS - nextFailed} تلاش باقیمانده)`,
              `Incorrect PIN (${MAX_ATTEMPTS - nextFailed} attempts left)`
            )
          );
        }
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--ft-canvas)]/90 backdrop-blur-xl flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="glass-surface-high rounded-2xl p-6 sm:p-8 w-full max-w-sm space-y-6 text-center"
      >
        <div
          className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center ${
            isCoolDown
              ? 'bg-[var(--ft-danger-soft)] text-[var(--ft-danger)]'
              : 'bg-[var(--ft-accent-soft)] text-[var(--ft-accent)]'
          }`}
        >
          {isCoolDown ? <ShieldAlert className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[var(--ft-text-primary)]">FundTrack</h2>
          <p className="text-xs text-[var(--ft-text-muted)]">
            {isCoolDown
              ? t(
                  lang,
                  `ورود موقتاً قفل شده است (${remainingSec} ثانیه تا تلاش مجدد)`,
                  `Temporarily locked (${remainingSec}s remaining)`
                )
              : t(lang, 'برای ورود به پنل، رمز PIN را وارد کنید', 'Enter your security PIN to unlock')}
          </p>
        </div>

        <MaterialInput
          type="password"
          inputMode="numeric"
          autoFocus
          ltrNum
          disabled={isCoolDown || checking}
          value={entered}
          error={error || undefined}
          onChange={(e) => {
            setEntered(e.target.value);
            if (error && !isCoolDown) setError('');
          }}
          placeholder="••••"
          className="text-center tracking-[0.4em] text-xl"
        />

        <button
          type="submit"
          disabled={isCoolDown || checking || !entered.trim()}
          className="w-full py-2.5 min-h-[44px] text-sm font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer disabled:opacity-50"
        >
          {checking
            ? t(lang, 'در حال بررسی...', 'Verifying...')
            : isCoolDown
            ? t(lang, `لطفاً ${remainingSec} ثانیه صبر کنید`, `Wait ${remainingSec}s`)
            : t(lang, 'باز کردن قفل', 'Unlock Panel')}
        </button>
      </form>
    </div>
  );
};
