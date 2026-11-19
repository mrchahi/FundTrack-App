import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

interface ResponsiveModalSheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
  desktopVariant?: 'center' | 'side-drawer';
  zIndexClass?: string;
  asForm?: boolean;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  children: React.ReactNode;
}

export const ResponsiveModalSheet: React.FC<ResponsiveModalSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  footer,
  maxWidthClass = 'md:max-w-lg',
  desktopVariant = 'center',
  zIndexClass = 'z-50',
  asForm = false,
  onSubmit,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isSide = desktopVariant === 'side-drawer';

  const containerAlignment = isSide
    ? 'items-end md:items-stretch justify-center md:justify-end p-0'
    : 'items-end md:items-center justify-center p-0 md:p-4';

  const sheetGeometry = isSide
    ? 'w-full rounded-t-[28px] max-h-[90dvh] md:rounded-none md:rounded-s-3xl md:max-w-md md:h-full md:max-h-full'
    : `w-full rounded-t-[28px] max-h-[90dvh] md:rounded-3xl ${maxWidthClass} md:max-h-[88vh]`;

  const innerContent = (
    <>
      {/* M3 Bottom Sheet Drag Handle (Mobile Only) */}
      <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
        <span className="w-10 h-1.5 rounded-full bg-[var(--ft-border-strong)]" />
      </div>

      {/* Sheet Header */}
      {(title || headerExtra) && (
        <div className="px-5 sm:px-6 pt-2 md:pt-5 pb-3.5 border-b border-[var(--ft-border)] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 space-y-0.5">
            {title && (
              <div className="text-base font-bold text-[var(--ft-text-primary)] truncate">
                {title}
              </div>
            )}
            {subtitle && (
              <div className="text-xs text-[var(--ft-text-muted)] truncate">{subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="min-w-[44px] min-h-[44px] -me-2 rounded-full flex items-center justify-center text-[var(--ft-text-muted)] hover:text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 space-y-4">
        {children}
      </div>

      {/* Sticky Thumb-Zone Footer */}
      {footer && (
        <div className="shrink-0 px-5 sm:px-6 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] border-t border-[var(--ft-border)] bg-[rgba(var(--ft-surface-rgb),0.72)] backdrop-blur-md">
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} bg-black/60 backdrop-blur-sm flex ${containerAlignment}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      {asForm ? (
        <form
          onSubmit={onSubmit}
          onClick={(e) => e.stopPropagation()}
          className={`glass-surface-high ft-sheet-enter flex flex-col overflow-hidden ${sheetGeometry}`}
        >
          {innerContent}
        </form>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`glass-surface-high ft-sheet-enter flex flex-col overflow-hidden ${sheetGeometry}`}
        >
          {innerContent}
        </div>
      )}
    </div>
  );
};

export interface M3CarouselItem {
  id: string;
  label?: string;
  content: React.ReactNode;
}

interface M3SnapCarouselProps {
  items: M3CarouselItem[];
  className?: string;
  slideClassName?: string;
  showDots?: boolean;
  showTabs?: boolean;
  ariaLabel?: string;
}

export const M3SnapCarousel: React.FC<M3SnapCarouselProps> = ({
  items,
  className = '',
  slideClassName = 'w-full shrink-0 snap-center',
  showDots = true,
  showTabs = false,
  ariaLabel = 'Carousel',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || items.length <= 1) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= bestRatio) {
            const idxAttr = entry.target.getAttribute('data-slide-idx');
            const parsed = idxAttr ? Number(idxAttr) : -1;
            if (parsed >= 0) {
              bestRatio = entry.intersectionRatio;
              bestIdx = parsed;
            }
          }
        }
        if (bestIdx >= 0) {
          setActiveIndex(bestIdx);
        }
      },
      { root, threshold: [0.55, 0.75] }
    );

    slideRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items.length]);

  const scrollToSlide = (idx: number) => {
    const target = slideRefs.current[idx];
    if (!target) return;
    setActiveIndex(idx);
    target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  if (items.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`} aria-label={ariaLabel}>
      {showTabs && items.some((it) => Boolean(it.label)) && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {items.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSlide(idx)}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeIndex === idx
                  ? 'ft-accent-gradient font-semibold'
                  : 'glass-tile text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="flex items-stretch gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth"
      >
        {items.map((item, idx) => (
          <div
            key={item.id}
            data-slide-idx={idx}
            ref={(el) => {
              slideRefs.current[idx] = el;
            }}
            className={slideClassName}
          >
            {item.content}
          </div>
        ))}
      </div>

      {showDots && items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-0.5">
          {items.map((item, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={`dot_${item.id}`}
                type="button"
                aria-label={item.label || `Slide ${idx + 1}`}
                onClick={() => scrollToSlide(idx)}
                className="min-w-[24px] min-h-[24px] flex items-center justify-center cursor-pointer"
              >
                <span
                  className={`h-2 rounded-full transition-all duration-200 ${
                    isActive
                      ? 'w-5 bg-[var(--ft-accent)]'
                      : 'w-2 bg-[var(--ft-border-strong)] hover:bg-[var(--ft-text-muted)]'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface M3AccordionCardProps {
  title: React.ReactNode;
  summaryText?: React.ReactNode;
  icon?: React.ReactNode;
  headerBadge?: React.ReactNode;
  defaultOpenMobile?: boolean;
  defaultOpenDesktop?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const M3AccordionCard: React.FC<M3AccordionCardProps> = ({
  title,
  summaryText,
  icon,
  headerBadge,
  defaultOpenMobile = false,
  defaultOpenDesktop = true,
  className = '',
  children,
}) => {
  const [expanded, setExpanded] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      return defaultOpenDesktop;
    }
    return defaultOpenMobile;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const handleChange = () => {
      setExpanded(mq.matches ? defaultOpenDesktop : defaultOpenMobile);
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [defaultOpenDesktop, defaultOpenMobile]);

  return (
    <section className={`glass-surface rounded-3xl overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full min-h-[56px] px-5 sm:px-6 py-4 flex items-center justify-between gap-3 text-start hover:bg-[var(--ft-surface-hover)]/45 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="w-9 h-9 rounded-2xl bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] flex items-center justify-center shrink-0">
              {icon}
            </span>
          )}
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm sm:text-base font-semibold text-[var(--ft-text-primary)] truncate">
              {title}
            </div>
            {summaryText && (
              <div className="text-[11px] sm:text-xs text-[var(--ft-text-muted)] font-num truncate">
                {summaryText}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {headerBadge}
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center text-[var(--ft-text-secondary)] transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-2 border-t border-[var(--ft-border)]">
          {children}
        </div>
      )}
    </section>
  );
};

interface M3CircularProgressProps {
  pct: number;
  size?: number;
  strokeWidth?: number;
  tone?: 'accent' | 'positive' | 'warning' | 'danger';
  centerLabel?: React.ReactNode;
  centerSublabel?: React.ReactNode;
  className?: string;
}

export const M3CircularProgress: React.FC<M3CircularProgressProps> = ({
  pct,
  size = 76,
  strokeWidth = 7,
  tone = 'accent',
  centerLabel,
  centerSublabel,
  className = '',
}) => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor =
    tone === 'positive'
      ? 'var(--ft-positive)'
      : tone === 'warning'
      ? 'var(--ft-warning)'
      : tone === 'danger'
      ? 'var(--ft-danger)'
      : 'var(--ft-accent)';

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ft-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 280ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight pointer-events-none">
        <span className="font-num text-sm font-extrabold text-[var(--ft-text-primary)]">
          {centerLabel ?? `${Math.round(clamped)}%`}
        </span>
        {centerSublabel && (
          <span className="font-num text-[10px] text-[var(--ft-text-muted)]">{centerSublabel}</span>
        )}
      </div>
    </div>
  );
};
