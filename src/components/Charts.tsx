import React, { useId, useState } from 'react';

export interface StackedBarDatum {
  label: string;
  primaryValue: number; // e.g., Profit or Inflow (top striped bar)
  secondaryValue: number; // e.g., Loss or Outflow (bottom solid bar)
  primaryFormatted: string;
  secondaryFormatted: string;
}

interface ProfitLossStackedBarChartProps {
  data: StackedBarDatum[];
  primaryLabel: string;
  secondaryLabel: string;
  height?: number;
}

export const ProfitLossStackedBarChart: React.FC<ProfitLossStackedBarChartProps> = ({
  data,
  primaryLabel,
  secondaryLabel,
  height = 190,
}) => {
  const patternId = useId().replace(/:/g, '');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxTotal = Math.max(
    1,
    ...data.map((d) => Math.max(0, d.primaryValue) + Math.max(0, d.secondaryValue))
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-4 text-xs text-[var(--ft-text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--ft-accent)] inline-block" />
          <span>{primaryLabel}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--ft-text-primary)] opacity-80 inline-block" />
          <span>{secondaryLabel}</span>
        </span>
      </div>

      <div className="relative" style={{ height }}>
        <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${Math.max(320, data.length * 46)} ${height}`}>
          <defs>
            <linearGradient id={`barGrad_${patternId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ft-accent-secondary, var(--ft-accent))" />
              <stop offset="100%" stopColor="var(--ft-accent)" />
            </linearGradient>
            <pattern
              id={`hatch_${patternId}`}
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill="var(--ft-accent)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.34)" strokeWidth="2.2" />
            </pattern>
          </defs>

          {/* Horizontal baseline grid */}
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = height - 24 - ratio * (height - 34);
            return (
              <line
                key={ratio}
                x1="0"
                y1={y}
                x2="100%"
                y2={y}
                stroke="var(--ft-border)"
                strokeDasharray="3 4"
                strokeWidth="1"
              />
            );
          })}

          {data.map((d, idx) => {
            const colW = Math.max(320, data.length * 46) / Math.max(1, data.length);
            const barW = Math.min(26, colW * 0.54);
            const x = idx * colW + (colW - barW) / 2;
            const plotH = height - 34;

            const secH = (Math.max(0, d.secondaryValue) / maxTotal) * plotH;
            const priH = (Math.max(0, d.primaryValue) / maxTotal) * plotH;

            const secY = height - 24 - secH;
            const priY = secY - priH - (secH > 0 && priH > 0 ? 2 : 0);

            return (
              <g
                key={`${d.label}_${idx}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                {/* Invisible hit box */}
                <rect x={idx * colW} y={0} width={colW} height={height} fill="transparent" />

                {/* Bottom Solid Segment */}
                {secH > 0 && (
                  <rect
                    x={x}
                    y={secY}
                    width={barW}
                    height={Math.max(3, secH)}
                    rx="5"
                    fill="var(--ft-text-primary)"
                    opacity={hoveredIdx === null || hoveredIdx === idx ? 0.85 : 0.4}
                  />
                )}

                {/* Top Striped Accent Segment */}
                {priH > 0 && (
                  <rect
                    x={x}
                    y={Math.max(4, priY)}
                    width={barW}
                    height={Math.max(4, priH)}
                    rx="5"
                    fill={`url(#hatch_${patternId})`}
                    opacity={hoveredIdx === null || hoveredIdx === idx ? 1 : 0.5}
                  />
                )}

                <text
                  x={idx * colW + colW / 2}
                  y={height - 6}
                  textAnchor="middle"
                  fill="var(--ft-text-muted)"
                  fontSize="10"
                  fontFamily="JetBrains Mono, Vazirmatn, sans-serif"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="absolute top-1 end-1 px-3 py-2 rounded-xl glass-surface-high text-xs font-num space-y-0.5 pointer-events-none">
            <div className="font-semibold text-[var(--ft-text-primary)]">{data[hoveredIdx].label}</div>
            <div className="text-[var(--ft-accent)]">
              {primaryLabel}: {data[hoveredIdx].primaryFormatted}
            </div>
            <div className="text-[var(--ft-text-secondary)]">
              {secondaryLabel}: {data[hoveredIdx].secondaryFormatted}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface StripedProgressBarProps {
  valuePct: number;
  tone?: 'accent' | 'positive' | 'warning' | 'danger';
  heightClass?: string;
}

export const StripedProgressBar: React.FC<StripedProgressBarProps> = ({
  valuePct,
  tone = 'accent',
  heightClass = 'h-6',
}) => {
  const clamped = Math.max(0, Math.min(100, valuePct));
  const fillGradient =
    tone === 'positive'
      ? 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))'
      : tone === 'warning'
      ? 'linear-gradient(90deg, var(--ft-warning), var(--ft-accent-secondary, var(--ft-accent)))'
      : tone === 'danger'
      ? 'linear-gradient(90deg, var(--ft-danger), var(--ft-warning))'
      : 'var(--ft-accent-grad)';

  return (
    <div
      className={`w-full ${heightClass} rounded-full striped-bar-track bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-hidden`}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${clamped}%`, background: fillGradient }}
      />
    </div>
  );
};

interface RadialGaugeProps {
  pct: number;
  label: string;
  sublabel?: string;
  centerText?: string;
  size?: number;
  color?: string;
  gradientTo?: string;
  strokeWidth?: number;
}

export const RadialGauge: React.FC<RadialGaugeProps> = ({
  pct,
  label,
  sublabel,
  centerText,
  size = 86,
  color = 'var(--ft-accent)',
  gradientTo,
  strokeWidth = 7,
}) => {
  const gaugeId = useId().replace(/:/g, '');
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const strokeRef = gradientTo ? `url(#rg_${gaugeId})` : color;

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 overflow-visible">
          {gradientTo && (
            <defs>
              <linearGradient id={`rg_${gaugeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor={gradientTo} />
              </linearGradient>
            </defs>
          )}
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
            stroke={strokeRef}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-num text-sm sm:text-base font-bold text-[var(--ft-text-primary)]">
          {centerText ?? `${Math.round(clamped)}%`}
        </div>
      </div>
      {label && <div className="text-xs font-medium text-[var(--ft-text-primary)]">{label}</div>}
      {sublabel && <div className="text-[11px] font-num text-[var(--ft-text-muted)]">{sublabel}</div>}
    </div>
  );
};

interface EquityAreaChartProps {
  points: Array<{
    label: string;
    dateLabel?: string;
    equity: number;
    cumPnl?: number;
    profit: number;
    tradesCount?: number;
  }>;
  mode?: 'equity' | 'pnl';
  height?: number;
  privateMode?: boolean;
}

export const EquityAreaChart: React.FC<EquityAreaChartProps> = ({
  points,
  mode = 'equity',
  height = 195,
  privateMode = false,
}) => {
  const gradId = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-[var(--ft-text-muted)]">
        داده کافی در این بازه برای رسم نمودار وجود ندارد
      </div>
    );
  }

  const w = 640;
  const padTop = 14;
  const padBottom = 24;
  const plotH = Math.max(60, height - padTop - padBottom);

  // Mode 'pnl': Period/Trade Realized Net P&L Bipolar Bar Chart (genuinely distinct from Equity Curve)
  if (mode === 'pnl') {
    const barPoints = points.slice(1);
    const vals = barPoints.map((p) => p.profit);
    const min = Math.min(0, ...vals);
    const max = Math.max(0, ...vals);
    const span = Math.max(1, max - min);
    const zeroY = padTop + plotH - ((0 - min) / span) * plotH;
    const stepW = (w - 16) / Math.max(1, barPoints.length);
    const barW = Math.min(28, Math.max(4, stepW * 0.62));

    const activeBar =
      hoverIdx !== null && barPoints[hoverIdx] ? barPoints[hoverIdx] : barPoints[barPoints.length - 1];

    const fmtSigned = (v: number) => {
      if (privateMode) return '••••';
      const rounded = Math.round(v);
      return `${rounded >= 0 ? '+' : '-'}$${Math.abs(rounded).toLocaleString('en-US')}`;
    };

    return (
      <div className="relative space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-num text-[var(--ft-text-muted)] px-1">
          <div className="flex items-center gap-3">
            <span>بیشترین سود: <strong className="text-[var(--ft-positive)]">{fmtSigned(max)}</strong></span>
            <span>بیشترین ضرر: <strong className="text-[var(--ft-danger)]">{fmtSigned(min)}</strong></span>
          </div>
          {activeBar && (
            <div className="flex items-center gap-2 text-[var(--ft-text-primary)]">
              <span className="text-[var(--ft-text-muted)]">{activeBar.dateLabel || activeBar.label}</span>
              <strong className={activeBar.profit >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'}>
                {fmtSigned(activeBar.profit)}
              </strong>
              {activeBar.tradesCount ? (
                <span className="text-[var(--ft-text-muted)]">· {activeBar.tradesCount} ترید</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="relative">
          <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-48 overflow-visible" preserveAspectRatio="none">
            <defs>
              <pattern
                id={`pnl_pos_${gradId}`}
                width="6"
                height="6"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <rect width="6" height="6" fill="var(--ft-positive)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
              </pattern>
            </defs>

            <line
              x1={8}
              y1={zeroY}
              x2={w - 8}
              y2={zeroY}
              stroke="var(--ft-border-strong)"
              strokeDasharray="4 4"
              strokeWidth="1.2"
            />

            {barPoints.map((p, idx) => {
              const xCenter = 8 + idx * stepW + stepW / 2;
              const valY = padTop + plotH - ((p.profit - min) / span) * plotH;
              const topY = p.profit >= 0 ? valY : zeroY;
              const barH = Math.max(3, Math.abs(valY - zeroY));
              const isActive = hoverIdx === idx;
              return (
                <g
                  key={`${p.label}_${idx}`}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={8 + idx * stepW}
                    y={0}
                    width={stepW}
                    height={height}
                    fill={isActive ? 'var(--ft-surface-hover)' : 'transparent'}
                    rx="4"
                  />
                  <rect
                    x={xCenter - barW / 2}
                    y={topY}
                    width={barW}
                    height={barH}
                    rx="3.5"
                    fill={p.profit >= 0 ? `url(#pnl_pos_${gradId})` : 'var(--ft-danger)'}
                    opacity={hoverIdx === null || isActive ? 0.96 : 0.45}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex items-center justify-between text-[10px] font-num text-[var(--ft-text-muted)] px-1">
          <span>{barPoints[0]?.label ?? ''}</span>
          {barPoints.length >= 3 && <span>{barPoints[Math.floor(barPoints.length / 2)]?.label ?? ''}</span>}
          <span>{barPoints[barPoints.length - 1]?.label ?? ''}</span>
        </div>
      </div>
    );
  }

  // Mode 'equity': Account Equity Curve + High-Water Mark (HWM) + Drawdown Context
  let runningPeak = -Infinity;
  const hwmVals = points.map((p) => {
    runningPeak = Math.max(runningPeak, p.equity);
    return runningPeak;
  });
  const vals = points.map((p) => p.equity);
  const min = Math.min(...vals);
  const max = Math.max(...hwmVals);
  const span = Math.max(1, max - min);

  const coords = points.map((p, idx) => {
    const val = p.equity;
    const hwm = hwmVals[idx];
    const ddUsd = Math.max(0, Number((hwm - val).toFixed(2)));
    const x = 8 + (idx / (points.length - 1)) * (w - 16);
    const y = padTop + plotH - ((val - min) / span) * plotH;
    const hwmY = padTop + plotH - ((hwm - min) / span) * plotH;
    return { x, y, hwmY, hwm, ddUsd, val, ...p };
  });

  const baseY = padTop + plotH;
  const linePts = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const hwmPts = coords.map((c) => `${c.x.toFixed(1)},${c.hwmY.toFixed(1)}`).join(' ');
  const areaPath = `M ${coords[0].x.toFixed(1)},${baseY} L ${coords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' L ')} L ${coords[coords.length - 1].x.toFixed(1)},${baseY} Z`;

  const formatY = (v: number) => {
    if (privateMode) return '••••';
    return `$${Math.round(v).toLocaleString('en-US')}`;
  };

  const active = hoverIdx !== null ? coords[hoverIdx] : null;
  const firstLabel = points[0]?.label ?? '';
  const midLabel = points.length >= 3 ? points[Math.floor(points.length / 2)]?.label ?? '' : '';
  const lastLabel = points[points.length - 1]?.label ?? '';

  return (
    <div className="relative space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-num text-[var(--ft-text-muted)] px-1">
        <div className="flex items-center gap-3">
          <span>سقف (HWM): <strong className="text-[var(--ft-warning)]">{formatY(max)}</strong></span>
          <span>کف: <strong className="text-[var(--ft-text-primary)]">{formatY(min)}</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-[var(--ft-accent)] inline-block" />
            <span>اکوئیتی</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 border-t border-dashed border-[var(--ft-warning)] inline-block" />
            <span>سقف تراز</span>
          </span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-48 overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`eq_${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ft-accent)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--ft-accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          <path d={areaPath} fill={`url(#eq_${gradId})`} />

          {/* High-Water Mark dashed line */}
          <polyline
            fill="none"
            stroke="var(--ft-warning)"
            strokeWidth="1.4"
            strokeDasharray="4 4"
            opacity="0.72"
            points={hwmPts}
          />

          <polyline
            fill="none"
            stroke="var(--ft-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={linePts}
          />
          {coords.map((c, idx) => (
            <g
              key={idx}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <circle cx={c.x} cy={c.y} r="11" fill="transparent" />
              <circle
                cx={c.x}
                cy={c.y}
                r={hoverIdx === idx ? 5 : points.length > 24 ? 2.2 : 3.2}
                fill={
                  idx === 0
                    ? 'var(--ft-text-muted)'
                    : c.profit >= 0
                    ? 'var(--ft-positive)'
                    : 'var(--ft-danger)'
                }
                stroke="var(--ft-surface-solid)"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </svg>

        {active && (
          <div className="absolute top-1 end-1 px-3 py-1.5 rounded-xl glass-surface-high text-xs font-num pointer-events-none shadow-md">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--ft-text-secondary)]">
                {active.dateLabel || active.label}
              </span>
              <span className="font-bold text-[var(--ft-text-primary)]">
                {privateMode ? '••••••' : `$${active.val.toLocaleString('en-US')}`}
              </span>
              {active.profit !== 0 && (
                <span
                  className={
                    active.profit >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                  }
                >
                  ({privateMode ? '••••' : `${active.profit >= 0 ? '+' : '-'}$${Math.abs(active.profit)}`})
                </span>
              )}
              {active.ddUsd > 0 && (
                <span className="text-[10px] text-[var(--ft-warning)]">
                  DD: {privateMode ? '••' : `-$${active.ddUsd}`}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] font-num text-[var(--ft-text-muted)] px-1">
        <span>{firstLabel}</span>
        {midLabel && <span>{midLabel}</span>}
        <span>{lastLabel}</span>
      </div>
    </div>
  );
};

export interface CompareBarItem {
  label: string;
  value: number;
  formattedValue: string;
  tone?: 'accent' | 'positive' | 'danger' | 'warning';
}

export const HorizontalCompareBars: React.FC<{ items: CompareBarItem[] }> = ({ items }) => {
  const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.value)));

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.max(4, Math.round((Math.abs(item.value) / maxAbs) * 100));
        const tone =
          item.tone ?? (item.value >= 0 ? 'positive' : 'danger');
        const barColor =
          tone === 'positive'
            ? 'var(--ft-positive)'
            : tone === 'danger'
            ? 'var(--ft-danger)'
            : tone === 'warning'
            ? 'var(--ft-warning)'
            : 'var(--ft-accent)';
        const barGradient =
          tone === 'positive'
            ? 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))'
            : tone === 'danger'
            ? 'linear-gradient(90deg, var(--ft-danger), var(--ft-warning))'
            : tone === 'warning'
            ? 'linear-gradient(90deg, var(--ft-warning), var(--ft-accent-secondary, var(--ft-accent)))'
            : 'var(--ft-accent-grad)';

        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--ft-text-secondary)] font-medium">{item.label}</span>
              <span className="font-num font-semibold" style={{ color: barColor }}>
                {item.formattedValue}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, background: barGradient }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ==========================================================================
   Trade Heatmap Grid (Weekday x Hour, ported from fundtrack-py)
   ========================================================================== */

interface TradeHeatmapGridProps {
  cells: Array<{
    weekday: number;
    weekdayLabel: string;
    hour: number;
    net: number;
    trades: number;
    winRate: number;
  }>;
  weekdays: string[];
  emptyText: string;
}

export const TradeHeatmapGrid: React.FC<TradeHeatmapGridProps> = ({
  cells,
  weekdays,
  emptyText,
}) => {
  const [hovered, setHovered] = useState<(typeof cells)[number] | null>(null);

  if (cells.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-[var(--ft-text-muted)]">
        {emptyText}
      </div>
    );
  }

  const activeHours = Array.from(new Set(cells.map((c) => c.hour))).sort((a, b) => a - b);
  const maxAbs = Math.max(1, ...cells.map((c) => Math.abs(c.net)));
  const cellMap = new Map(cells.map((c) => [`${c.weekday}_${c.hour}`, c]));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[420px] space-y-1.5">
          {/* Hour headers */}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `76px repeat(${activeHours.length}, minmax(34px, 1fr))` }}>
            <div />
            {activeHours.map((hr) => (
              <div key={hr} className="text-center font-num text-[10px] text-[var(--ft-text-muted)]">
                {String(hr).padStart(2, '0')}
              </div>
            ))}
          </div>

          {weekdays.map((wdLabel, wdIdx) => (
            <div
              key={wdLabel}
              className="grid gap-1.5 items-center"
              style={{ gridTemplateColumns: `76px repeat(${activeHours.length}, minmax(34px, 1fr))` }}
            >
              <div className="text-[11px] font-medium text-[var(--ft-text-secondary)] truncate">
                {wdLabel}
              </div>
              {activeHours.map((hr) => {
                const cell = cellMap.get(`${wdIdx}_${hr}`);
                if (!cell) {
                  return (
                    <div
                      key={hr}
                      className="h-8 rounded-lg bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] opacity-45"
                    />
                  );
                }
                const intensity = Math.min(0.92, 0.25 + (Math.abs(cell.net) / maxAbs) * 0.67);
                const bg =
                  cell.net >= 0
                    ? `color-mix(in srgb, var(--ft-positive) ${Math.round(intensity * 100)}%, transparent)`
                    : `color-mix(in srgb, var(--ft-danger) ${Math.round(intensity * 100)}%, transparent)`;

                return (
                  <button
                    key={hr}
                    type="button"
                    onMouseEnter={() => setHovered(cell)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ backgroundColor: bg }}
                    className="h-8 rounded-lg border border-[var(--ft-border-strong)] font-num text-[10px] font-bold text-[var(--ft-text-primary)] flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
                  >
                    {cell.net >= 0 ? '+' : ''}
                    {Math.round(cell.net)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--ft-text-muted)] min-h-[20px]">
        {hovered ? (
          <div className="font-num flex flex-wrap items-center gap-3 text-[var(--ft-text-primary)]">
            <span>
              {hovered.weekdayLabel} · {String(hovered.hour).padStart(2, '0')}:00
            </span>
            <span className={hovered.net >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'}>
              {hovered.net >= 0 ? '+' : ''}${hovered.net}
            </span>
            <span>
              {hovered.trades} tr · {hovered.winRate}% WR
            </span>
          </div>
        ) : (
          <span>برای جزئیات سود، تعداد معامله و نرخ برد روی خانه‌ها بروید</span>
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
   Duration Buckets Visual Bar Chart (0-15m .. >24h)
   ========================================================================== */

interface DurationBucketsChartProps {
  buckets: Array<{
    label: string;
    trades: number;
    wins: number;
    winRate: number;
    net: number;
  }>;
  emptyText: string;
  privateMode?: boolean;
  onSelectBucket?: (label: string) => void;
}

export const DurationBucketsChart: React.FC<DurationBucketsChartProps> = ({
  buckets,
  emptyText,
  privateMode = false,
  onSelectBucket,
}) => {
  if (buckets.length === 0) {
    return (
      <div className="h-36 flex items-center justify-center text-xs text-[var(--ft-text-muted)]">
        {emptyText}
      </div>
    );
  }

  const maxAbsNet = Math.max(1, ...buckets.map((b) => Math.abs(b.net)));

  return (
    <div className="space-y-3">
      {buckets.map((b) => {
        const widthPct = Math.max(6, Math.round((Math.abs(b.net) / maxAbsNet) * 100));
        const positive = b.net >= 0;
        const Wrapper = onSelectBucket ? 'button' : 'div';
        return (
          <Wrapper
            key={b.label}
            {...(onSelectBucket
              ? {
                  type: 'button' as const,
                  onClick: () => onSelectBucket(b.label),
                  className:
                    'w-full text-start space-y-1 p-1.5 -mx-1.5 rounded-xl hover:bg-[var(--ft-surface-hover)] transition-colors cursor-pointer block',
                }
              : { className: 'space-y-1' })}
          >
            <div className="flex items-center justify-between text-xs font-num">
              <span className="font-semibold text-[var(--ft-text-primary)]">{b.label}</span>
              <span className="text-[var(--ft-text-muted)]">
                {b.trades} tr · {b.winRate}% WR ·{' '}
                <strong className={positive ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'}>
                  {privateMode ? '••••••' : `${positive ? '+' : ''}$${b.net}`}
                </strong>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: positive ? 'var(--ft-positive)' : 'var(--ft-danger)',
                }}
              />
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
};

/* ==========================================================================
   Priority-Weighted Goal Budget Segmented Bar
   ========================================================================== */

interface PriorityAllocationBarProps {
  segments: Array<{
    goalId: string;
    title: string;
    priority: number;
    sharePct: number;
    formattedBudget: string;
  }>;
}

export const PriorityAllocationBar: React.FC<PriorityAllocationBarProps> = ({ segments }) => {
  if (segments.length === 0) return null;

  const opacities = [1, 0.78, 0.58, 0.42, 0.28];

  return (
    <div className="space-y-2.5">
      <div className="h-6 w-full rounded-full overflow-hidden flex gap-0.5 bg-[var(--ft-surface-subtle)] p-0.5 border border-[var(--ft-border)]">
        {segments.map((seg, idx) => (
          <div
            key={seg.goalId}
            title={`${seg.title} (P${seg.priority}): ${seg.sharePct}%`}
            className="h-full first:rounded-s-full last:rounded-e-full transition-all duration-300"
            style={{
              width: `${seg.sharePct}%`,
              backgroundColor: 'var(--ft-accent)',
              opacity: opacities[idx % opacities.length],
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
        {segments.map((seg, idx) => (
          <div key={seg.goalId} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{
                backgroundColor: 'var(--ft-accent)',
                opacity: opacities[idx % opacities.length],
              }}
            />
            <span className="font-num font-bold text-[var(--ft-accent)]">P{seg.priority}</span>
            <span className="text-[var(--ft-text-secondary)] truncate max-w-[140px]">{seg.title}</span>
            <span className="font-num text-[var(--ft-text-muted)]">
              ({seg.sharePct}% · {seg.formattedBudget})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ==========================================================================
   Visual Quantitative Edge Strip (Expectancy Meter + Avg W/L Ratio + Streak Sequence)
   ========================================================================== */

interface EdgeVisualStripProps {
  expectancyUsd: number;
  avgWinUsd: number;
  avgLossUsd: number;
  maxWinStreak: number;
  maxLossStreak: number;
  recentOutcomes: boolean[]; // chronological recent trade win/loss booleans
  privateMode?: boolean;
  labels: {
    expectancy: string;
    avgWL: string;
    streaks: string;
  };
}

export const EdgeVisualStrip: React.FC<EdgeVisualStripProps> = ({
  expectancyUsd,
  avgWinUsd,
  avgLossUsd,
  maxWinStreak,
  maxLossStreak,
  recentOutcomes,
  privateMode = false,
  labels,
}) => {
  // Expectancy Bipolar Meter (-$250..+$250 scale clamped smoothly)
  const maxExpScale = Math.max(120, Math.abs(expectancyUsd) * 1.35);
  const expPctHalf = Math.min(48, Math.round((Math.abs(expectancyUsd) / maxExpScale) * 48));
  const expPositive = expectancyUsd >= 0;

  // Avg Win / Avg Loss proportional bar
  const totalWL = Math.max(1, avgWinUsd + avgLossUsd);
  const winSharePct = Math.round((avgWinUsd / totalWL) * 100);
  const payoffRatio = avgLossUsd > 0 ? (avgWinUsd / avgLossUsd).toFixed(1) : avgWinUsd > 0 ? '∞' : '0';

  const sequence = recentOutcomes.slice(-8);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-[var(--ft-border)]">
      {/* 1. Expectancy Bipolar Visual Meter */}
      <div className="p-2.5 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] space-y-1.5 min-w-0">
        <div className="text-[10px] text-[var(--ft-text-muted)] truncate">{labels.expectancy}</div>
        <div
          className={`font-num text-xs font-bold whitespace-nowrap ${
            expPositive ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
          }`}
        >
          {privateMode ? '••••••' : `${expPositive ? '+' : ''}$${expectancyUsd}`}
        </div>
        <div className="relative h-2 rounded-full bg-black/20 border border-[var(--ft-border)] overflow-hidden">
          {/* Center Zero Axis */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--ft-text-muted)] opacity-50 z-10" />
          <div
            className="absolute top-0 bottom-0 rounded-full transition-all duration-300"
            style={{
              left: expPositive ? '50%' : `${50 - expPctHalf}%`,
              width: `${Math.max(4, expPctHalf)}%`,
              background: expPositive
                ? 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))'
                : 'linear-gradient(90deg, var(--ft-danger), var(--ft-warning))',
            }}
          />
        </div>
        <div className="flex justify-between font-num text-[9px] text-[var(--ft-text-muted)]">
          <span>-R</span>
          <span>0</span>
          <span>+Edge</span>
        </div>
      </div>

      {/* 2. Avg Win vs Avg Loss Split Ratio Bar */}
      <div className="p-2.5 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] space-y-1.5 min-w-0">
        <div className="text-[10px] text-[var(--ft-text-muted)] truncate">{labels.avgWL}</div>
        <div className="font-num text-xs font-bold text-[var(--ft-accent)] whitespace-nowrap">
          1:{payoffRatio}
        </div>
        <div className="h-2 rounded-full bg-black/20 border border-[var(--ft-border)] overflow-hidden flex gap-0.5 p-0.5">
          <div
            className="h-full rounded-s-full transition-all duration-300"
            style={{
              width: `${Math.max(8, winSharePct)}%`,
              background: 'linear-gradient(90deg, var(--ft-positive), var(--ft-accent))',
            }}
          />
          <div
            className="h-full rounded-e-full flex-1 transition-all duration-300"
            style={{ backgroundColor: 'var(--ft-danger)' }}
          />
        </div>
        <div className="flex justify-between font-num text-[9px] gap-1">
          <span className="text-[var(--ft-positive)] whitespace-nowrap">
            {privateMode ? '••••' : `+$${Math.round(avgWinUsd)}`}
          </span>
          <span className="text-[var(--ft-danger)] whitespace-nowrap">
            {privateMode ? '••••' : `-$${Math.round(avgLossUsd)}`}
          </span>
        </div>
      </div>

      {/* 3. Streak & Recent Outcome Sequence Tiles */}
      <div
        className="p-2.5 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] flex flex-col gap-1.5 min-w-0"
        title={`Max consecutive streak: ${maxWinStreak}W / ${maxLossStreak}L · Last ${sequence.length} trades`}
      >
        <div className="text-[10px] text-[var(--ft-text-muted)] truncate">{labels.streaks}</div>
        <div className="font-num text-xs font-bold text-[var(--ft-text-primary)] whitespace-nowrap">
          <span className="text-[var(--ft-positive)]">{maxWinStreak}W</span>
          <span className="text-[var(--ft-text-muted)]"> · </span>
          <span className="text-[var(--ft-danger)]">{maxLossStreak}L</span>
        </div>
        <div className="flex items-center gap-1 h-2">
          {sequence.length === 0 ? (
            <div className="w-full h-1.5 rounded-full bg-[var(--ft-border)]" />
          ) : (
            sequence.map((isWin, i) => (
              <span
                key={i}
                title={`Trade #${i + 1}: ${isWin ? 'Win' : 'Loss'}`}
                className="flex-1 h-full rounded-sm transition-transform hover:scale-y-125"
                style={{
                  background: isWin
                    ? 'linear-gradient(180deg, var(--ft-positive), var(--ft-accent))'
                    : 'var(--ft-danger)',
                }}
              />
            ))
          )}
        </div>
        <div className="flex justify-between font-num text-[9px] text-[var(--ft-text-muted)]">
          <span className="text-[var(--ft-positive)]">{sequence.filter(Boolean).length}W</span>
          <span>{sequence.length} last</span>
          <span className="text-[var(--ft-danger)]">{sequence.filter((v) => !v).length}L</span>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   Hour-of-Day x Day-of-Week Win Rate Density Heatmap (Custom 24h Matrix)
   ========================================================================== */

export interface WinRateDensityCell {
  weekday: number;
  weekdayLabel: string;
  hour: number;
  net: number;
  trades: number;
  wins: number;
  winRate: number;
}

interface TradeWinRateDensityHeatmapProps {
  cells: WinRateDensityCell[];
  weekdays: string[];
  emptyText: string;
  privateMode?: boolean;
  onSelectCell?: (cell: WinRateDensityCell) => void;
  labels: {
    allHours: string;
    activeHours: string;
    modeWinRate?: string;
    modePnl?: string;
    winRate: string;
    trades: string;
    netPnl: string;
    peakWindow: string;
    hoverHint: string;
    lowDensity: string;
    highDensity: string;
  };
}

export const TradeWinRateDensityHeatmap: React.FC<TradeWinRateDensityHeatmapProps> = ({
  cells,
  weekdays,
  emptyText,
  privateMode = false,
  onSelectCell,
  labels,
}) => {
  const [hourScope, setHourScope] = useState<'24h' | 'active'>('active');
  const [metricMode, setMetricMode] = useState<'winRate' | 'pnl'>('winRate');
  const [hovered, setHovered] = useState<WinRateDensityCell | null>(null);

  if (cells.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-[var(--ft-text-muted)]">
        {emptyText}
      </div>
    );
  }

  const maxTrades = Math.max(1, ...cells.map((c) => c.trades));
  const maxAbsNet = Math.max(1, ...cells.map((c) => Math.abs(c.net)));
  const cellMap = new Map(cells.map((c) => [`${c.weekday}_${c.hour}`, c]));
  const hoursToRender =
    hourScope === '24h'
      ? Array.from({ length: 24 }, (_, i) => i)
      : Array.from(new Set(cells.map((c) => c.hour))).sort((a, b) => a - b);

  // Peak cell depends on selected metric mode
  const peakCell = [...cells].sort((a, b) =>
    metricMode === 'pnl'
      ? b.net - a.net || b.winRate - a.winRate
      : b.winRate - a.winRate || b.trades - a.trades || b.net - a.net
  )[0];

  const getCellVisual = (cell: WinRateDensityCell) => {
    if (metricMode === 'pnl') {
      const intensity = Math.min(0.92, 0.3 + (Math.abs(cell.net) / maxAbsNet) * 0.62);
      const pct = Math.round(intensity * 100);
      return cell.net >= 0
        ? {
            bg: `color-mix(in srgb, var(--ft-positive) ${pct}%, transparent)`,
            border: 'var(--ft-positive)',
          }
        : {
            bg: `color-mix(in srgb, var(--ft-danger) ${pct}%, transparent)`,
            border: 'var(--ft-danger)',
          };
    }

    const densityAlpha = Math.min(0.95, 0.42 + (cell.trades / maxTrades) * 0.53);
    const pct = Math.round(densityAlpha * 100);
    if (cell.winRate >= 65) {
      return {
        bg: `color-mix(in srgb, var(--ft-positive) ${pct}%, transparent)`,
        border: 'var(--ft-positive)',
      };
    }
    if (cell.winRate >= 45) {
      return {
        bg: `color-mix(in srgb, var(--ft-accent) ${pct}%, transparent)`,
        border: 'var(--ft-accent)',
      };
    }
    if (cell.winRate >= 25) {
      return {
        bg: `color-mix(in srgb, var(--ft-warning) ${pct}%, transparent)`,
        border: 'var(--ft-warning)',
      };
    }
    return {
      bg: `color-mix(in srgb, var(--ft-danger) ${pct}%, transparent)`,
      border: 'var(--ft-danger)',
    };
  };

  return (
    <div className="space-y-4">
      {/* Controls & Peak Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
            <button
              type="button"
              onClick={() => setMetricMode('winRate')}
              className={`px-3 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                metricMode === 'winRate'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {labels.modeWinRate ?? labels.winRate}
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('pnl')}
              className={`px-3 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                metricMode === 'pnl'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {labels.modePnl ?? labels.netPnl}
            </button>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
            <button
              type="button"
              onClick={() => setHourScope('active')}
              className={`px-3 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                hourScope === 'active'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {labels.activeHours}
            </button>
            <button
              type="button"
              onClick={() => setHourScope('24h')}
              className={`px-3 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                hourScope === '24h'
                  ? 'ft-accent-gradient font-semibold'
                  : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
              }`}
            >
              {labels.allHours}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          {peakCell && (
            <span className="font-num text-[var(--ft-positive)]">
              {labels.peakWindow}: {peakCell.weekdayLabel} {String(peakCell.hour).padStart(2, '0')}:00 (
              {metricMode === 'pnl'
                ? privateMode
                  ? '••••'
                  : `${peakCell.net >= 0 ? '+' : ''}$${Math.round(peakCell.net)}`
                : `${peakCell.winRate}% · ${peakCell.wins}/${peakCell.trades}`}
              )
            </span>
          )}
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--ft-text-muted)]">
            <span>{labels.lowDensity}</span>
            <span
              className="w-24 h-2 rounded-full inline-block border border-[var(--ft-border)]"
              style={{
                background:
                  'linear-gradient(90deg, var(--ft-danger), var(--ft-warning), var(--ft-accent), var(--ft-positive))',
              }}
            />
            <span>{labels.highDensity}</span>
          </div>
        </div>
      </div>

      {/* Responsive Matrix Grid */}
      <div className="overflow-x-auto pb-1">
        <div
          className="space-y-1.5"
          style={{ minWidth: hourScope === '24h' ? '760px' : `${Math.max(420, hoursToRender.length * 46)}px` }}
        >
          {/* Hour-of-Day Axis Header */}
          <div
            className="grid gap-1 items-center"
            style={{
              gridTemplateColumns: `76px repeat(${hoursToRender.length}, minmax(26px, 1fr))`,
            }}
          >
            <div />
            {hoursToRender.map((hr) => (
              <div
                key={hr}
                className="text-center font-num text-[10px] text-[var(--ft-text-muted)]"
              >
                {String(hr).padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* 7 Weekday Rows */}
          {weekdays.map((wdLabel, wdIdx) => (
            <div
              key={wdLabel}
              className="grid gap-1 items-center"
              style={{
                gridTemplateColumns: `76px repeat(${hoursToRender.length}, minmax(26px, 1fr))`,
              }}
            >
              <div className="text-[11px] font-medium text-[var(--ft-text-secondary)] truncate pe-2">
                {wdLabel}
              </div>

              {hoursToRender.map((hr) => {
                const cell = cellMap.get(`${wdIdx}_${hr}`);
                if (!cell) {
                  return (
                    <div
                      key={hr}
                      className="h-8 rounded-lg bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] opacity-30"
                    />
                  );
                }

                const visual = getCellVisual(cell);
                const densityDotScale = Math.max(0.45, Math.min(1, cell.trades / maxTrades));

                return (
                  <button
                    key={hr}
                    type="button"
                    onClick={() => onSelectCell?.(cell)}
                    onMouseEnter={() => setHovered(cell)}
                    onFocus={() => setHovered(cell)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      backgroundColor: visual.bg,
                      borderColor: visual.border,
                    }}
                    className="h-8 rounded-lg border font-num text-[10px] font-bold text-[var(--ft-text-primary)] flex flex-col items-center justify-center leading-none cursor-pointer transition-transform hover:scale-105 relative"
                    aria-label={`${cell.weekdayLabel} ${hr}:00 ${cell.winRate}% win rate (${cell.trades} trades)`}
                  >
                    <span>
                      {metricMode === 'pnl'
                        ? privateMode
                          ? '••'
                          : `${cell.net >= 0 ? '+' : ''}${Math.round(cell.net)}`
                        : `${Math.round(cell.winRate)}%`}
                    </span>
                    <span
                      className="w-3 h-0.5 rounded-full bg-current mt-0.5 opacity-80"
                      style={{ transform: `scaleX(${densityDotScale})` }}
                    />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Live Cell Inspector */}
      <div className="p-3 rounded-2xl glass-tile flex flex-wrap items-center justify-between gap-3 text-xs min-h-[42px]">
        {hovered ? (
          <div className="font-num flex flex-wrap items-center gap-4 text-[var(--ft-text-primary)]">
            <span className="font-bold">
              {hovered.weekdayLabel} · {String(hovered.hour).padStart(2, '0')}:00
            </span>
            <span>
              {labels.winRate}:{' '}
              <strong
                className={
                  hovered.winRate >= 50 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                }
              >
                {hovered.winRate}%
              </strong>{' '}
              ({hovered.wins}W / {hovered.trades - hovered.wins}L)
            </span>
            <span>
              {labels.trades}: <strong>{hovered.trades}</strong>
            </span>
            <span>
              {labels.netPnl}:{' '}
              <strong
                className={
                  hovered.net >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                }
              >
                {privateMode ? '••••••' : `${hovered.net >= 0 ? '+' : ''}$${hovered.net}`}
              </strong>
            </span>
          </div>
        ) : (
          <span className="text-[var(--ft-text-muted)]">{labels.hoverHint}</span>
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
   Single-Symbol / Chronological Trade Performance Hybrid Chart
   (Cumulative P&L Curve + Individual Trade P&L Bars — Built for 1-Symbol Traders)
   ========================================================================== */

export interface SingleSymbolTradePoint {
  id: string;
  symbol: string;
  direction?: 'BUY' | 'SELL';
  ticket?: string;
  profitUsd: number;
  rMultiple?: number;
  cumNetUsd: number;
  timeLabel: string;
  dateLabel?: string;
  tradesCount?: number;
}

interface SingleSymbolPerformanceChartProps {
  points: SingleSymbolTradePoint[];
  height?: number;
  privateMode?: boolean;
  emptyText: string;
  legendCurveLabel: string;
  legendBarsLabel: string;
  labels?: {
    periodNet?: string;
    positiveLabel?: string;
    negativeLabel?: string;
    cumulativeLabel?: string;
    tradesWord?: string;
  };
}

export const SingleSymbolPerformanceChart: React.FC<SingleSymbolPerformanceChartProps> = ({
  points,
  height = 176,
  privateMode = false,
  emptyText,
  legendCurveLabel,
  legendBarsLabel,
  labels,
}) => {
  const uid = useId().replace(/:/g, '');
  const [chartView, setChartView] = useState<'cumulative' | 'bars'>('cumulative');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center text-xs text-[var(--ft-text-muted)] rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] px-4"
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }

  const fmtUsd = (val: number, signed = true) => {
    if (privateMode) return '••••';
    const absVal = Math.abs(Math.round(val)).toLocaleString('en-US');
    if (!signed) return `$${absVal}`;
    if (val > 0) return `+$${absVal}`;
    if (val < 0) return `-$${absVal}`;
    return '$0';
  };

  const totalNet = points[points.length - 1]?.cumNetUsd ?? 0;
  const winPeriods = points.filter((p) => p.profitUsd > 0).length;
  const lossPeriods = points.filter((p) => p.profitUsd < 0).length;

  const w = 440;
  const h = height;
  const padLeft = 46;
  const padRight = 12;
  const padTop = 16;
  const padBottom = 14;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const rawValues =
    chartView === 'cumulative' ? points.map((p) => p.cumNetUsd) : points.map((p) => p.profitUsd);
  const minVal = Math.min(0, ...rawValues);
  const maxVal = Math.max(0, ...rawValues);
  const span = Math.max(1, maxVal - minVal);

  const toY = (v: number) => padTop + plotH - ((v - minVal) / span) * plotH;
  const zeroY = toY(0);

  const stepW = plotW / Math.max(1, points.length);
  const barW = Math.min(24, Math.max(5, stepW * 0.58));

  const coords = points.map((p, idx) => {
    const cx =
      chartView === 'cumulative' && points.length > 1
        ? padLeft + (idx / (points.length - 1)) * plotW
        : padLeft + idx * stepW + stepW / 2;
    const val = chartView === 'cumulative' ? p.cumNetUsd : p.profitUsd;
    const cy = toY(val);
    const barTopY = p.profitUsd >= 0 ? cy : zeroY;
    const barH = Math.max(3, Math.abs(cy - zeroY));
    return { cx, cy, val, barTopY, barH, p };
  });

  const linePts = coords.map((c) => `${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(' ');
  const areaPath =
    coords.length >= 2
      ? `M ${coords[0].cx.toFixed(1)},${zeroY.toFixed(1)} L ${coords
          .map((c) => `${c.cx.toFixed(1)},${c.cy.toFixed(1)}`)
          .join(' L ')} L ${coords[coords.length - 1].cx.toFixed(1)},${zeroY.toFixed(1)} Z`
      : '';

  const hovered = hoverIdx !== null && coords[hoverIdx] ? coords[hoverIdx] : null;
  const positiveText = labels?.positiveLabel ?? 'مثبت';
  const negativeText = labels?.negativeLabel ?? 'منفی';
  const periodNetText = labels?.periodNet ?? 'خالص دوره';
  const cumulativeText = labels?.cumulativeLabel ?? 'تجمعی';
  const tradesWord = labels?.tradesWord ?? 'ترید';

  return (
    <div className="space-y-2.5">
      {/* Top Status Bar: Clear Summary at Rest / Exact Point Details on Hover + Clean View Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
        {hovered ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-num min-w-0">
            <span className="font-semibold text-[var(--ft-text-primary)] truncate">
              {hovered.p.dateLabel || hovered.p.timeLabel}
            </span>
            <span
              className={`font-bold ${
                hovered.p.profitUsd >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
              }`}
            >
              {fmtUsd(hovered.p.profitUsd)}
            </span>
            <span className="text-[11px] text-[var(--ft-text-muted)]">
              ({cumulativeText}: {fmtUsd(hovered.p.cumNetUsd)}
              {hovered.p.tradesCount ? ` · ${hovered.p.tradesCount} ${tradesWord}` : ''})
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-num min-w-0">
            <span className="text-[var(--ft-text-muted)]">{periodNetText}:</span>
            <span
              className={`text-sm font-extrabold ${
                totalNet >= 0 ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
              }`}
            >
              {fmtUsd(totalNet)}
            </span>
            <span className="text-[11px] text-[var(--ft-text-muted)]">
              ({winPeriods} {positiveText} · {lossPeriods} {negativeText})
            </span>
          </div>
        )}

        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] shrink-0">
          <button
            type="button"
            onClick={() => {
              setChartView('cumulative');
              setHoverIdx(null);
            }}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
              chartView === 'cumulative'
                ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] font-semibold'
                : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
            }`}
          >
            {legendCurveLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              setChartView('bars');
              setHoverIdx(null);
            }}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-md cursor-pointer transition-colors whitespace-nowrap ${
              chartView === 'bars'
                ? 'bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] font-semibold'
                : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
            }`}
          >
            {legendBarsLabel}
          </button>
        </div>
      </div>

      {/* Clear Single-Axis Chart Canvas with Explicit $0 Break-Even Line & Y-Axis Values */}
      <div className="relative rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] p-2">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible" style={{ height }}>
          <defs>
            <linearGradient id={`ss_eq_pos_${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ft-positive)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--ft-positive)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`ss_eq_neg_${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ft-danger)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--ft-danger)" stopOpacity="0.03" />
            </linearGradient>
            <pattern
              id={`ss_win_${uid}`}
              width="5"
              height="5"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="5" height="5" fill="var(--ft-positive)" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.28)" strokeWidth="1.8" />
            </pattern>
          </defs>

          {/* Left Y-Axis Scale References (Max, $0 Break-even, Min) */}
          {maxVal > 0 && (
            <text
              x={padLeft - 6}
              y={padTop + 4}
              textAnchor="end"
              fill="var(--ft-positive)"
              fontSize="9.5"
              fontFamily="JetBrains Mono, Vazirmatn, sans-serif"
            >
              {fmtUsd(maxVal)}
            </text>
          )}
          <text
            x={padLeft - 6}
            y={zeroY + 3}
            textAnchor="end"
            fill="var(--ft-text-muted)"
            fontSize="9.5"
            fontWeight="700"
            fontFamily="JetBrains Mono, Vazirmatn, sans-serif"
          >
            $0
          </text>
          {minVal < 0 && (
            <text
              x={padLeft - 6}
              y={h - padBottom + 3}
              textAnchor="end"
              fill="var(--ft-danger)"
              fontSize="9.5"
              fontFamily="JetBrains Mono, Vazirmatn, sans-serif"
            >
              {fmtUsd(minVal)}
            </text>
          )}

          {/* Explicit $0 Break-Even Baseline */}
          <line
            x1={padLeft}
            y1={zeroY}
            x2={w - padRight}
            y2={zeroY}
            stroke="var(--ft-border-strong)"
            strokeDasharray="4 4"
            strokeWidth="1.2"
          />

          {chartView === 'cumulative' ? (
            <>
              {areaPath && (
                <path
                  d={areaPath}
                  fill={`url(#${totalNet >= 0 ? `ss_eq_pos_${uid}` : `ss_eq_neg_${uid}`})`}
                />
              )}
              {coords.length >= 2 && (
                <polyline
                  fill="none"
                  stroke={totalNet >= 0 ? 'var(--ft-positive)' : 'var(--ft-danger)'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={linePts}
                />
              )}
              {coords.map((c, idx) => {
                const isActive = hoverIdx === idx;
                const hitW = coords.length > 1 ? plotW / coords.length : plotW;
                const hitX =
                  coords.length > 1
                    ? Math.max(padLeft, c.cx - hitW / 2)
                    : padLeft;
                return (
                  <g
                    key={c.p.id}
                    onMouseEnter={() => setHoverIdx(idx)}
                    onMouseLeave={() => setHoverIdx(null)}
                    className="cursor-pointer"
                  >
                    <rect x={hitX} y={0} width={hitW} height={h} fill="transparent" />
                    {isActive && (
                      <line
                        x1={c.cx}
                        y1={padTop}
                        x2={c.cx}
                        y2={h - padBottom}
                        stroke="var(--ft-border-strong)"
                        strokeDasharray="2 3"
                        strokeWidth="1"
                      />
                    )}
                    <circle
                      cx={c.cx}
                      cy={c.cy}
                      r={isActive ? 5 : points.length > 20 ? 2.4 : 3.2}
                      fill={c.p.profitUsd >= 0 ? 'var(--ft-positive)' : 'var(--ft-danger)'}
                      stroke="var(--ft-surface-solid)"
                      strokeWidth="1.5"
                    />
                  </g>
                );
              })}
            </>
          ) : (
            <>
              {coords.map((c, idx) => {
                const isActive = hoverIdx === idx;
                return (
                  <g
                    key={c.p.id}
                    onMouseEnter={() => setHoverIdx(idx)}
                    onMouseLeave={() => setHoverIdx(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={padLeft + idx * stepW}
                      y={0}
                      width={stepW}
                      height={h}
                      fill={isActive ? 'var(--ft-surface-hover)' : 'transparent'}
                      rx="4"
                    />
                    <rect
                      x={c.cx - barW / 2}
                      y={c.barTopY}
                      width={barW}
                      height={c.barH}
                      rx="3.5"
                      fill={c.p.profitUsd >= 0 ? `url(#ss_win_${uid})` : 'var(--ft-danger)'}
                      opacity={hoverIdx === null || isActive ? 0.96 : 0.45}
                    />
                  </g>
                );
              })}
            </>
          )}
        </svg>
      </div>

      {/* X-Axis Timeline Anchors */}
      <div className="flex items-center justify-between text-[10px] font-num text-[var(--ft-text-muted)] px-1">
        <span>{points[0]?.timeLabel ?? ''}</span>
        {points.length >= 3 && (
          <span>{points[Math.floor(points.length / 2)]?.timeLabel ?? ''}</span>
        )}
        <span>{points[points.length - 1]?.timeLabel ?? ''}</span>
      </div>
    </div>
  );
};

/* ==========================================================================
   30-Day Cashflow Runway & Bill-Collision Timeline Chart
   ========================================================================== */

export interface RunwayChartPoint {
  dayIndex: number;
  jalaliLabel: string;
  runningBalanceIrt: number;
  netDeltaIrt: number;
  isCollision: boolean;
  events: Array<{ title: string; amountIrt: number; kind: string }>;
}

interface CashflowRunwayChartProps {
  points: RunwayChartPoint[];
  formatIrt: (val: number) => string;
  hoverHint: string;
  zeroLineLabel: string;
}

export const CashflowRunwayChart: React.FC<CashflowRunwayChartProps> = ({
  points,
  formatIrt,
  hoverHint,
  zeroLineLabel,
}) => {
  const gradId = useId().replace(/:/g, '');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (points.length < 2) return null;

  const w = 720;
  const h = 190;
  const padX = 20;
  const padY = 20;

  const values = points.map((p) => p.runningBalanceIrt);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(1000000, ...values);
  const span = Math.max(1, maxVal - minVal);

  const toX = (idx: number) => padX + (idx / (points.length - 1)) * (w - padX * 2);
  const toY = (val: number) => padY + (1 - (val - minVal) / span) * (h - padY * 2);

  const coords = points.map((p, idx) => ({
    x: toX(idx),
    y: toY(p.runningBalanceIrt),
    point: p,
  }));

  const linePath = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const zeroY = toY(0);
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${zeroY} L ${coords[0].x} ${zeroY} Z`;

  const inspected = selectedIdx !== null ? points[selectedIdx] : null;

  return (
    <div className="space-y-3">
      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[190px] overflow-visible">
          <defs>
            <linearGradient id={`runway_${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ft-accent)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--ft-accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Zero Liquidity Warning Threshold */}
          <line
            x1={padX}
            y1={zeroY}
            x2={w - padX}
            y2={zeroY}
            stroke="var(--ft-danger)"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            opacity="0.7"
          />
          <text
            x={padX}
            y={Math.max(12, zeroY - 6)}
            fill="var(--ft-danger)"
            fontSize="9"
            className="font-num"
          >
            {zeroLineLabel}
          </text>

          <path d={areaPath} fill={`url(#runway_${gradId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="var(--ft-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Event & Collision Nodes */}
          {coords.map((c, idx) => {
            const hasEvents = c.point.events.length > 0;
            const isSelected = selectedIdx === idx;
            const fill = c.point.isCollision
              ? 'var(--ft-danger)'
              : c.point.netDeltaIrt > 0
              ? 'var(--ft-positive)'
              : hasEvents
              ? 'var(--ft-warning)'
              : 'var(--ft-accent)';

            return (
              <g
                key={c.point.dayIndex}
                className="cursor-pointer"
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => setSelectedIdx(idx)}
              >
                <circle cx={c.x} cy={c.y} r="10" fill="transparent" />
                {(hasEvents || c.point.isCollision || isSelected) && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={isSelected ? 5.5 : 4}
                    fill={fill}
                    stroke="var(--ft-surface-solid)"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Interactive Day Inspector */}
      <div className="p-3 rounded-2xl glass-tile flex flex-wrap items-center justify-between gap-3 text-xs min-h-[44px]">
        {inspected ? (
          <div className="flex flex-wrap items-center gap-3 w-full justify-between">
            <div className="font-num flex flex-wrap items-center gap-3">
              <span className="font-bold text-[var(--ft-text-primary)]">{inspected.jalaliLabel}</span>
              <span
                className={`font-bold ${
                  inspected.isCollision ? 'text-[var(--ft-danger)]' : 'text-[var(--ft-accent)]'
                }`}
              >
                {formatIrt(inspected.runningBalanceIrt)}
              </span>
              {inspected.netDeltaIrt !== 0 && (
                <span
                  className={
                    inspected.netDeltaIrt >= 0
                      ? 'text-[var(--ft-positive)]'
                      : 'text-[var(--ft-warning)]'
                  }
                >
                  ({inspected.netDeltaIrt >= 0 ? '+' : ''}
                  {formatIrt(inspected.netDeltaIrt)})
                </span>
              )}
            </div>
            {inspected.events.length > 0 && (
              <div className="text-[11px] text-[var(--ft-text-secondary)] truncate max-w-full">
                {inspected.events.map((ev) => `${ev.title} (${formatIrt(ev.amountIrt)})`).join(' · ')}
              </div>
            )}
          </div>
        ) : (
          <span className="text-[var(--ft-text-muted)]">{hoverHint}</span>
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
   Compact Bipolar Vertical Bar Chart (Weekdays, R-Distribution, Payoff Buckets)
   ========================================================================== */

export interface BipolarBarDatum {
  key: string;
  label: string;
  value: number;
  count?: number;
  winRate?: number;
  formattedValue: string;
  subText?: string;
}

interface BipolarVerticalBarChartProps {
  items: BipolarBarDatum[];
  height?: number;
  emptyText: string;
  mode?: 'signed' | 'positive-count';
  onSelectItem?: (item: BipolarBarDatum) => void;
}

export const BipolarVerticalBarChart: React.FC<BipolarVerticalBarChartProps> = ({
  items,
  height = 190,
  emptyText,
  mode = 'signed',
  onSelectItem,
}) => {
  const uid = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-[var(--ft-text-muted)]"
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }

  const w = Math.max(360, items.length * 56);
  const padTop = 18;
  const padBottom = 26;
  const plotH = Math.max(60, height - padTop - padBottom);

  const vals = items.map((i) => i.value);
  const min = mode === 'positive-count' ? 0 : Math.min(0, ...vals);
  const max = Math.max(mode === 'positive-count' ? 1 : 0, ...vals);
  const span = Math.max(1, max - min);
  const zeroY = padTop + plotH - ((0 - min) / span) * plotH;
  const stepW = (w - 16) / items.length;
  const barW = Math.min(34, Math.max(12, stepW * 0.56));

  const active = hoverIdx !== null ? items[hoverIdx] : null;

  return (
    <div className="space-y-2.5">
      <div className="relative rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] px-2 pt-2 pb-1">
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full overflow-visible" style={{ height }}>
          <defs>
            <pattern
              id={`bv_pos_${uid}`}
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill="var(--ft-positive)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            </pattern>
            <pattern
              id={`bv_acc_${uid}`}
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill="var(--ft-accent)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            </pattern>
          </defs>

          <line
            x1={8}
            y1={zeroY}
            x2={w - 8}
            y2={zeroY}
            stroke="var(--ft-border-strong)"
            strokeDasharray="3 4"
            strokeWidth="1"
          />

          {items.map((item, idx) => {
            const cx = 8 + idx * stepW + stepW / 2;
            const valY = padTop + plotH - ((item.value - min) / span) * plotH;
            const topY = item.value >= 0 ? valY : zeroY;
            const barH = Math.max(item.value === 0 ? 2 : 4, Math.abs(valY - zeroY));
            const isHovered = hoverIdx === idx;
            const isPositive = item.key.startsWith('+') || (item.value >= 0 && !item.key.startsWith('-'));

            const fill =
              mode === 'positive-count'
                ? item.key.includes('-')
                  ? 'var(--ft-danger)'
                  : `url(#bv_pos_${uid})`
                : isPositive
                ? `url(#bv_pos_${uid})`
                : 'var(--ft-danger)';

            return (
              <g
                key={`${item.key}_${idx}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => onSelectItem?.(item)}
                className="cursor-pointer"
              >
                <rect
                  x={8 + idx * stepW}
                  y={0}
                  width={stepW}
                  height={height - 16}
                  fill={isHovered ? 'var(--ft-surface-hover)' : 'transparent'}
                  rx="6"
                />
                <rect
                  x={cx - barW / 2}
                  y={topY}
                  width={barW}
                  height={barH}
                  rx="4"
                  fill={fill}
                  opacity={hoverIdx === null || isHovered ? 0.96 : 0.48}
                />
                <text
                  x={cx}
                  y={Math.max(10, topY - 4)}
                  textAnchor="middle"
                  fill={
                    mode === 'positive-count'
                      ? 'var(--ft-text-primary)'
                      : item.value >= 0
                      ? 'var(--ft-positive)'
                      : 'var(--ft-danger)'
                  }
                  fontSize="9.5"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, Vazirmatn, sans-serif"
                >
                  {item.formattedValue}
                </text>
                <text
                  x={cx}
                  y={height - 5}
                  textAnchor="middle"
                  fill="var(--ft-text-muted)"
                  fontSize="10"
                  fontFamily="JetBrains Mono, Vazirmatn, sans-serif"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="min-h-[24px] px-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-num">
        {active ? (
          <div className="flex flex-wrap items-center gap-3 text-[var(--ft-text-primary)]">
            <span className="font-bold">{active.label}</span>
            <span className={active.value >= 0 ? 'text-[var(--ft-positive)] font-bold' : 'text-[var(--ft-danger)] font-bold'}>
              {active.formattedValue}
            </span>
            {active.count !== undefined && (
              <span className="text-[var(--ft-text-muted)]">{active.count} ترید</span>
            )}
            {active.winRate !== undefined && (
              <span className="text-[var(--ft-accent)]">{active.winRate}% WR</span>
            )}
            {active.subText && <span className="text-[var(--ft-text-muted)]">{active.subText}</span>}
          </div>
        ) : (
          <span className="text-[var(--ft-text-muted)]">
            برای جزئیات روی هر ستون بروید
          </span>
        )}
      </div>
    </div>
  );
};

/* ==========================================================================
   Compact Hourly Performance Chart (4h Intervals vs Active Hours · Bar / Area)
   ========================================================================== */

export interface HourlyBarItem {
  hour: number;
  label: string;
  trades: number;
  wins: number;
  winRate: number;
  net: number;
}

interface HourlyPerformanceChartProps {
  hourly: HourlyBarItem[];
  privateMode?: boolean;
  emptyText: string;
  labels: {
    intervals: string;
    activeHours: string;
    bar: string;
    area: string;
    trades: string;
    winRate: string;
    hoverHint: string;
  };
}

export const HourlyPerformanceChart: React.FC<HourlyPerformanceChartProps> = ({
  hourly,
  privateMode = false,
  emptyText,
  labels,
}) => {
  const uid = useId().replace(/:/g, '');
  const [scope, setScope] = useState<'intervals' | 'hours'>('intervals');
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (hourly.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-[var(--ft-text-muted)]">
        {emptyText}
      </div>
    );
  }

  // Group into 6 compact 4-hour trading windows (00-04 .. 20-24)
  const intervalBuckets = [
    { key: '00-04', label: '00–04', start: 0, end: 4 },
    { key: '04-08', label: '04–08', start: 4, end: 8 },
    { key: '08-12', label: '08–12', start: 8, end: 12 },
    { key: '12-16', label: '12–16', start: 12, end: 16 },
    { key: '16-20', label: '16–20', start: 16, end: 20 },
    { key: '20-24', label: '20–24', start: 20, end: 24 },
  ]
    .map((b) => {
      const matching = hourly.filter((h) => h.hour >= b.start && h.hour < b.end);
      const trades = matching.reduce((s, h) => s + h.trades, 0);
      const wins = matching.reduce((s, h) => s + h.wins, 0);
      const net = Number(matching.reduce((s, h) => s + h.net, 0).toFixed(2));
      const winRate = trades > 0 ? Number(((wins / trades) * 100).toFixed(1)) : 0;
      return { key: b.key, label: b.label, trades, wins, winRate, net };
    })
    .filter((b) => b.trades > 0);

  const series =
    scope === 'intervals'
      ? intervalBuckets
      : hourly.map((h) => ({
          key: String(h.hour),
          label: `${String(h.hour).padStart(2, '0')}`,
          trades: h.trades,
          wins: h.wins,
          winRate: h.winRate,
          net: h.net,
        }));

  const height = 165;
  const w = Math.max(360, series.length * 46);
  const padTop = 16;
  const padBottom = 24;
  const plotH = height - padTop - padBottom;

  const vals = series.map((s) => s.net);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = Math.max(1, max - min);
  const zeroY = padTop + plotH - ((0 - min) / span) * plotH;
  const stepW = (w - 16) / Math.max(1, series.length);
  const barW = Math.min(30, Math.max(8, stepW * 0.56));

  const coords = series.map((item, idx) => {
    const cx = 8 + idx * stepW + stepW / 2;
    const cy = padTop + plotH - ((item.net - min) / span) * plotH;
    return { cx, cy, item };
  });

  const linePts = coords.map((c) => `${c.cx.toFixed(1)},${c.cy.toFixed(1)}`).join(' ');
  const areaPath =
    coords.length >= 2
      ? `M ${coords[0].cx.toFixed(1)},${zeroY} L ${coords
          .map((c) => `${c.cx.toFixed(1)},${c.cy.toFixed(1)}`)
          .join(' L ')} L ${coords[coords.length - 1].cx.toFixed(1)},${zeroY} Z`
      : '';

  const active = hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : null;
  const fmtNet = (v: number) =>
    privateMode ? '••••' : `${v >= 0 ? '+' : '-'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
          <button
            type="button"
            onClick={() => {
              setScope('intervals');
              setHoverIdx(null);
            }}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              scope === 'intervals'
                ? 'ft-accent-gradient font-semibold'
                : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
            }`}
          >
            {labels.intervals}
          </button>
          <button
            type="button"
            onClick={() => {
              setScope('hours');
              setHoverIdx(null);
            }}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              scope === 'hours'
                ? 'ft-accent-gradient font-semibold'
                : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
            }`}
          >
            {labels.activeHours}
          </button>
        </div>

        <div className="inline-flex items-center gap-1 p-1 rounded-xl glass-tile">
          <button
            type="button"
            onClick={() => setChartType('bar')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              chartType === 'bar'
                ? 'ft-accent-gradient font-semibold'
                : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
            }`}
          >
            {labels.bar}
          </button>
          <button
            type="button"
            onClick={() => setChartType('area')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              chartType === 'area'
                ? 'ft-accent-gradient font-semibold'
                : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)]'
            }`}
          >
            {labels.area}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] px-2 pt-2 pb-1">
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full overflow-visible" style={{ height }}>
          <defs>
            <linearGradient id={`hr_area_${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ft-accent)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--ft-accent)" stopOpacity="0.02" />
            </linearGradient>
            <pattern
              id={`hr_pos_${uid}`}
              width="6"
              height="6"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill="var(--ft-positive)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            </pattern>
          </defs>

          <line
            x1={8}
            y1={zeroY}
            x2={w - 8}
            y2={zeroY}
            stroke="var(--ft-border-strong)"
            strokeDasharray="3 4"
            strokeWidth="1"
          />

          {chartType === 'area' && areaPath && (
            <>
              <path d={areaPath} fill={`url(#hr_area_${uid})`} />
              <polyline
                fill="none"
                stroke="var(--ft-accent)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={linePts}
              />
            </>
          )}

          {coords.map((c, idx) => {
            const isHovered = hoverIdx === idx;
            const topY = c.item.net >= 0 ? c.cy : zeroY;
            const barH = Math.max(3, Math.abs(c.cy - zeroY));
            return (
              <g
                key={`${c.item.key}_${idx}`}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                className="cursor-pointer"
              >
                <rect
                  x={8 + idx * stepW}
                  y={0}
                  width={stepW}
                  height={height - 16}
                  fill={isHovered ? 'var(--ft-surface-hover)' : 'transparent'}
                  rx="5"
                />
                {chartType === 'bar' ? (
                  <rect
                    x={c.cx - barW / 2}
                    y={topY}
                    width={barW}
                    height={barH}
                    rx="4"
                    fill={c.item.net >= 0 ? `url(#hr_pos_${uid})` : 'var(--ft-danger)'}
                    opacity={hoverIdx === null || isHovered ? 0.96 : 0.45}
                  />
                ) : (
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={isHovered ? 5 : 3.2}
                    fill={c.item.net >= 0 ? 'var(--ft-positive)' : 'var(--ft-danger)'}
                    stroke="var(--ft-surface-solid)"
                    strokeWidth="1.5"
                  />
                )}
                <text
                  x={c.cx}
                  y={height - 5}
                  textAnchor="middle"
                  fill="var(--ft-text-muted)"
                  fontSize="10"
                  fontFamily="JetBrains Mono, Vazirmatn, sans-serif"
                >
                  {c.item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="min-h-[24px] px-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-num">
        {active ? (
          <div className="flex flex-wrap items-center gap-3 text-[var(--ft-text-primary)]">
            <span className="font-bold">
              {scope === 'intervals' ? active.label : `${active.label}:00`}
            </span>
            <span className={active.net >= 0 ? 'text-[var(--ft-positive)] font-bold' : 'text-[var(--ft-danger)] font-bold'}>
              {fmtNet(active.net)}
            </span>
            <span className="text-[var(--ft-text-muted)]">
              {active.trades} {labels.trades}
            </span>
            <span className="text-[var(--ft-accent)]">
              {active.winRate}% {labels.winRate}
            </span>
          </div>
        ) : (
          <span className="text-[var(--ft-text-muted)]">{labels.hoverHint}</span>
        )}
      </div>
    </div>
  );
};

