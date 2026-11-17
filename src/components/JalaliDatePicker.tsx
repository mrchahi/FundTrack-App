import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppLanguage } from '../types';
import {
  formatJalaliDate,
  formatJalaliShort,
  getJalaliMonthLength,
  getJalaliMonthName,
  getJalaliWeekdayIndex,
  jalaliToIsoDate,
  toJalali,
  toLocalIsoDate,
} from '../utils/jalali';
import { t } from '../i18n/translations';
import { MaterialField } from './MaterialInputs';

interface JalaliDatePickerProps {
  value: string; // ISO YYYY-MM-DD or full ISO string
  onChange: (isoDate: string) => void;
  lang: AppLanguage;
  label?: string;
  hint?: string;
  error?: string;
  fieldSize?: 'sm' | 'md';
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const GREGORIAN_MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const JalaliDatePicker: React.FC<JalaliDatePickerProps> = ({
  value,
  onChange,
  lang,
  label,
  hint,
  error,
  fieldSize = 'sm',
  required = false,
  disabled = false,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedDate = useMemo(() => {
    if (!value) return new Date();
    const normalized = value.length === 10 ? `${value}T12:00:00` : value;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [value]);

  const selectedJalali = useMemo(() => toJalali(selectedDate), [selectedDate]);
  const todayJalali = useMemo(() => toJalali(new Date()), []);

  const [viewJy, setViewJy] = useState(selectedJalali.jy);
  const [viewJm, setViewJm] = useState(selectedJalali.jm);

  const [viewGy, setViewGy] = useState(selectedDate.getFullYear());
  const [viewGm, setViewGm] = useState(selectedDate.getMonth()); // 0..11

  useEffect(() => {
    setViewJy(selectedJalali.jy);
    setViewJm(selectedJalali.jm);
    setViewGy(selectedDate.getFullYear());
    setViewGm(selectedDate.getMonth());
  }, [selectedJalali.jy, selectedJalali.jm, selectedDate]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const displayValue = useMemo(() => {
    if (!value) return t(lang, 'انتخاب تاریخ...', 'Select date...');
    if (lang === 'fa') {
      return `${formatJalaliShort(selectedDate)} · ${formatJalaliDate(selectedDate, 'fa')}`;
    }
    return formatJalaliDate(selectedDate, 'en');
  }, [value, lang, selectedDate]);

  const jalaliDays = getJalaliMonthLength(viewJy, viewJm);
  const jalaliStartOffset = getJalaliWeekdayIndex(viewJy, viewJm, 1);

  const gregMonthDays = new Date(viewGy, viewGm + 1, 0).getDate();
  const gregStartOffset = new Date(viewGy, viewGm, 1).getDay();

  const shiftMonth = (delta: number) => {
    if (lang === 'fa') {
      let nextM = viewJm + delta;
      let nextY = viewJy;
      if (nextM < 1) {
        nextM = 12;
        nextY -= 1;
      } else if (nextM > 12) {
        nextM = 1;
        nextY += 1;
      }
      setViewJy(nextY);
      setViewJm(nextM);
    } else {
      const nextDt = new Date(viewGy, viewGm + delta, 1);
      setViewGy(nextDt.getFullYear());
      setViewGm(nextDt.getMonth());
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <MaterialField
        label={label}
        hint={hint}
        error={error}
        required={required}
        disabled={disabled}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          className={`md-field-box md-field-box--filled w-full flex items-center justify-between gap-2 text-start cursor-pointer ${
            fieldSize === 'sm' ? 'min-h-[38px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-3.5 py-2 text-sm'
          }`}
        >
          <span className="font-num text-[var(--ft-text-primary)] truncate">{displayValue}</span>
          <Calendar className="w-3.5 h-3.5 text-[var(--ft-accent)] shrink-0" />
        </button>
      </MaterialField>

      {open && (
        <div
          className="absolute z-[95] mt-1.5 start-0 w-72 p-3.5 rounded-2xl glass-surface-high border border-[var(--ft-border-strong)] shadow-2xl space-y-3"
          style={{ backdropFilter: 'blur(20px)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="p-1.5 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-secondary)] cursor-pointer"
              aria-label="Previous month"
            >
              {lang === 'fa' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            <div className="text-xs font-bold text-[var(--ft-text-primary)] font-num">
              {lang === 'fa'
                ? `${getJalaliMonthName(viewJm)} ${viewJy}`
                : `${GREGORIAN_MONTHS_EN[viewGm]} ${viewGy}`}
            </div>

            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="p-1.5 rounded-lg hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-secondary)] cursor-pointer"
              aria-label="Next month"
            >
              {lang === 'fa' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {lang === 'fa' ? (
            <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
              {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map((wd) => (
                <div key={wd} className="py-1 font-semibold text-[var(--ft-text-muted)]">
                  {wd}
                </div>
              ))}
              {Array.from({ length: jalaliStartOffset }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: jalaliDays }).map((_, idx) => {
                const day = idx + 1;
                const isSelected =
                  viewJy === selectedJalali.jy &&
                  viewJm === selectedJalali.jm &&
                  day === selectedJalali.jd;
                const isToday =
                  viewJy === todayJalali.jy &&
                  viewJm === todayJalali.jm &&
                  day === todayJalali.jd;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      onChange(jalaliToIsoDate(viewJy, viewJm, day));
                      setOpen(false);
                    }}
                    className={`h-8 rounded-lg font-num text-xs flex items-center justify-center transition-colors cursor-pointer ${
                      isSelected
                        ? 'ft-accent-gradient font-bold shadow-sm'
                        : isToday
                        ? 'border border-[var(--ft-accent)] text-[var(--ft-accent)] font-semibold'
                        : 'hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-primary)]'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((wd) => (
                <div key={wd} className="py-1 font-semibold text-[var(--ft-text-muted)]">
                  {wd}
                </div>
              ))}
              {Array.from({ length: gregStartOffset }).map((_, i) => (
                <div key={`g-empty-${i}`} />
              ))}
              {Array.from({ length: gregMonthDays }).map((_, idx) => {
                const day = idx + 1;
                const isSelected =
                  viewGy === selectedDate.getFullYear() &&
                  viewGm === selectedDate.getMonth() &&
                  day === selectedDate.getDate();
                const now = new Date();
                const isToday =
                  viewGy === now.getFullYear() &&
                  viewGm === now.getMonth() &&
                  day === now.getDate();

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      onChange(toLocalIsoDate(new Date(viewGy, viewGm, day)));
                      setOpen(false);
                    }}
                    className={`h-8 rounded-lg font-num text-xs flex items-center justify-center transition-colors cursor-pointer ${
                      isSelected
                        ? 'ft-accent-gradient font-bold shadow-sm'
                        : isToday
                        ? 'border border-[var(--ft-accent)] text-[var(--ft-accent)] font-semibold'
                        : 'hover:bg-[var(--ft-surface-hover)] text-[var(--ft-text-primary)]'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-[var(--ft-border)] flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => {
                onChange(toLocalIsoDate(new Date()));
                setOpen(false);
              }}
              className="text-[var(--ft-accent)] font-semibold hover:underline cursor-pointer"
            >
              {t(lang, 'انتخاب امروز', 'Today')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[var(--ft-text-muted)] hover:text-[var(--ft-text-primary)] cursor-pointer"
            >
              {t(lang, 'بستن', 'Close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
