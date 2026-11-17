/**
 * FundTrack Standalone Design System Tokens
 * Single source of truth for typography, spacing, radii, elevation layers,
 * semantic states, and Material Design input behaviors across all 10 themes.
 */

export type DesignInputState =
  | 'default'
  | 'hover'
  | 'focus'
  | 'filled'
  | 'error'
  | 'warning'
  | 'success'
  | 'disabled';

export const DESIGN_TOKENS = {
  typography: {
    fontFa: '"Vazirmatn", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    fontEn: '"Plus Jakarta Sans", "Vazirmatn", system-ui, -apple-system, sans-serif',
    fontMono: '"JetBrains Mono", "Vazirmatn", monospace',
    scale: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
    },
  },
  spacing: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
  },
  radius: {
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    pill: '9999px',
  },
  elevation: {
    base: 0,
    tile: 10,
    tileFocused: 40,
    stickyHeader: 30,
    dropdown: 95,
    modal: 50,
    commandPalette: 96,
    toast: 98,
    lockScreen: 100,
  },
  motion: {
    durationFast: '150ms',
    durationNormal: '200ms',
    durationSlow: '300ms',
    easingStandard: 'cubic-bezier(0.2, 0, 0, 1)',
    easingDecelerate: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  inputStates: {
    default: {
      borderVar: 'var(--ft-border-strong)',
      textVar: 'var(--ft-text-primary)',
      labelVar: 'var(--ft-text-muted)',
      bgVar: 'var(--ft-surface-subtle)',
    },
    focus: {
      borderVar: 'var(--ft-accent)',
      ringVar: 'var(--ft-accent-soft)',
      labelVar: 'var(--ft-accent)',
    },
    error: {
      borderVar: 'var(--ft-danger)',
      ringVar: 'var(--ft-danger-soft)',
      labelVar: 'var(--ft-danger)',
    },
    warning: {
      borderVar: 'var(--ft-warning)',
      ringVar: 'var(--ft-warning-soft)',
      labelVar: 'var(--ft-warning)',
    },
    success: {
      borderVar: 'var(--ft-positive)',
      ringVar: 'var(--ft-positive-soft)',
      labelVar: 'var(--ft-positive)',
    },
    disabled: {
      borderVar: 'var(--ft-border)',
      labelVar: 'var(--ft-text-muted)',
      opacity: 0.55,
    },
  },
} as const;
