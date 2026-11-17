import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { AppLanguage } from '../types';
import { t } from '../i18n/translations';
import { MaterialInput } from './MaterialInputs';

interface PinLockScreenProps {
  expectedPin: string;
  lang: AppLanguage;
  onUnlock: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  expectedPin,
  lang,
  onUnlock,
}) => {
  const [entered, setEntered] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (entered === expectedPin) {
      setError('');
      onUnlock();
    } else {
      setError(t(lang, 'رمز PIN اشتباه است', 'Incorrect PIN'));
      setEntered('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--ft-canvas)]/90 backdrop-blur-xl flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="glass-surface-high rounded-2xl p-8 w-full max-w-sm space-y-6 text-center"
      >
        <div className="w-12 h-12 mx-auto rounded-2xl bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[var(--ft-text-primary)]">FundTrack</h2>
          <p className="text-xs text-[var(--ft-text-muted)]">
            {t(lang, 'برای ورود به پنل، رمز PIN را وارد کنید', 'Enter your security PIN to unlock')}
          </p>
        </div>

        <MaterialInput
          type="password"
          inputMode="numeric"
          autoFocus
          ltrNum
          value={entered}
          error={error || undefined}
          onChange={(e) => {
            setEntered(e.target.value);
            if (error) setError('');
          }}
          placeholder="••••"
          className="text-center tracking-[0.4em] text-xl"
        />

        <button
          type="submit"
          className="w-full py-2.5 text-sm font-semibold rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] cursor-pointer"
        >
          {t(lang, 'باز کردن قفل', 'Unlock Panel')}
        </button>
      </form>
    </div>
  );
};
