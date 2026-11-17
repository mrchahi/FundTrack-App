import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface GlassSelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

interface GlassSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<GlassSelectOption<T>>;
  placeholder?: string;
  size?: 'sm' | 'md';
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'end';
  ariaLabel?: string;
  disabled?: boolean;
}

export function GlassSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  size = 'md',
  className = '',
  triggerClassName = '',
  align = 'start',
  ariaLabel,
  disabled = false,
}: GlassSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.value === value))
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) setHighlightIdx(idx);
  }, [value, options]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((prev) => (prev + 1) % Math.max(1, options.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((prev) => (prev - 1 + options.length) % Math.max(1, options.length));
      } else if (e.key === 'Enter' && options[highlightIdx]) {
        e.preventDefault();
        onChange(options[highlightIdx].value);
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, options, highlightIdx, onChange]);

  const paddingClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm';

  return (
    <div ref={rootRef} className={`relative inline-block ${open ? 'z-[95]' : 'z-10'} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`w-full ${paddingClass} rounded-xl ${
          triggerClassName.includes('glass-surface') ? '' : 'glass-surface-control'
        } flex items-center justify-between gap-2.5 text-start transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? 'border-[var(--ft-accent)] ring-1 ring-[var(--ft-accent)]' : ''
        } ${triggerClassName}`}
      >
        <span className="truncate text-[var(--ft-text-primary)] font-medium">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--ft-text-muted)] shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-[var(--ft-accent)]' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute top-full mt-1.5 ${
            align === 'end' ? 'end-0' : 'start-0'
          } min-w-full w-max max-w-[280px] max-h-64 overflow-y-auto z-[85] rounded-xl glass-surface-high p-1.5 space-y-0.5`}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightIdx;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightIdx(idx)}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-3 text-start transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] font-semibold'
                    : isHighlighted
                    ? 'bg-[var(--ft-surface-hover)] text-[var(--ft-text-primary)]'
                    : 'text-[var(--ft-text-secondary)] hover:bg-[var(--ft-surface-hover)]'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {opt.hint && (
                    <span className="font-num text-[11px] text-[var(--ft-text-muted)]">{opt.hint}</span>
                  )}
                  {isSelected && <Check className="w-3.5 h-3.5 text-[var(--ft-accent)] shrink-0" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface GlassSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}

export const GlassSwitch: React.FC<GlassSwitchProps> = ({ checked, onChange, ariaLabel }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer p-0.5 ${
        checked
          ? 'bg-[var(--ft-accent)] border-[var(--ft-accent)] justify-end'
          : 'bg-[var(--ft-surface-subtle)] border-[var(--ft-border-strong)] justify-start'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full transition-transform ${
          checked ? 'bg-[var(--ft-accent-fg)]' : 'bg-[var(--ft-text-muted)]'
        }`}
      />
    </button>
  );
};
