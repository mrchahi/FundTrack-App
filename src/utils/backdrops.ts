import React from 'react';
import { SystemSettings } from '../types';

export type BackdropPresetId = SystemSettings['backdropPreset'];

export interface BackdropPresetMeta {
  id: BackdropPresetId;
  nameFa: string;
  nameEn: string;
  category: 'geometric' | 'atmospheric';
}

export const BACKDROP_PRESETS: BackdropPresetMeta[] = [
  { id: 'obsidian-grid', nameFa: 'شبکه هندسی کلاسیک', nameEn: 'Architectural Grid', category: 'geometric' },
  { id: 'hex-honeycomb', nameFa: 'شش‌ضلعی کندویی', nameEn: 'Hex Honeycomb', category: 'geometric' },
  { id: 'isometric-cubes', nameFa: 'مکعب ایزومتریک', nameEn: 'Isometric Cubes', category: 'geometric' },
  { id: 'diagonal-hatch', nameFa: 'خطوط مورب مدرن', nameEn: 'Diagonal Hatch', category: 'geometric' },
  { id: 'dot-matrix', nameFa: 'ماتریس نقطه‌ای', nameEn: 'Dot Matrix', category: 'geometric' },
  { id: 'circuit-nodes', nameFa: 'مدار و گره‌های شبکه', nameEn: 'Circuit Nodes', category: 'geometric' },
  { id: 'concentric-waves', nameFa: 'موج‌های هم‌مرکز', nameEn: 'Concentric Arcs', category: 'geometric' },
  { id: 'aurora-mesh', nameFa: 'هاله شفق', nameEn: 'Aurora Mesh', category: 'atmospheric' },
  { id: 'amber-horizon', nameFa: 'افق کهربایی', nameEn: 'Amber Horizon', category: 'atmospheric' },
  { id: 'none', nameFa: 'ساده (بدون الگو)', nameEn: 'Minimal Solid', category: 'atmospheric' },
];

function svgUrl(svgBody: string, viewBox: string): string {
  const encoded = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${svgBody}</svg>`
  );
  return `url("data:image/svg+xml,${encoded}")`;
}

export function getBackdropStyle(
  preset: BackdropPresetId,
  customUrl: string,
  blur: number,
  brightness: number,
  isLightTheme: boolean
): React.CSSProperties {
  const stroke = isLightTheme ? 'rgba(15,23,42,0.09)' : 'rgba(255,255,255,0.09)';
  const strokeSoft = isLightTheme ? 'rgba(15,23,42,0.045)' : 'rgba(255,255,255,0.045)';

  if (preset === 'custom' && customUrl) {
    return {
      backgroundImage: `url(${customUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      filter: `blur(${blur}px) brightness(${brightness})`,
    };
  }

  switch (preset) {
    case 'obsidian-grid':
      return {
        backgroundImage: `linear-gradient(to right, ${stroke} 1px, transparent 1px), linear-gradient(to bottom, ${stroke} 1px, transparent 1px)`,
        backgroundSize: '42px 42px',
        filter: `brightness(${brightness})`,
      };
    case 'hex-honeycomb':
      return {
        backgroundImage: svgUrl(
          `<path d="M28 66L0 50L0 16L28 0L56 16L56 50L28 66ZM28 100L0 84L0 50L28 34L56 50L56 84L28 100Z" fill="none" stroke="${stroke}" stroke-width="1"/>`,
          '0 0 56 100'
        ),
        backgroundSize: '56px 100px',
        filter: `brightness(${brightness})`,
      };
    case 'isometric-cubes':
      return {
        backgroundImage: svgUrl(
          `<path d="M30 0 L60 17.3 L60 52 L30 69.2 L0 52 L0 17.3 Z M30 0 L30 34.6 M60 17.3 L30 34.6 L0 17.3 M30 34.6 L30 69.2" fill="none" stroke="${stroke}" stroke-width="1"/>`,
          '0 0 60 69.2'
        ),
        backgroundSize: '60px 69.2px',
        filter: `brightness(${brightness})`,
      };
    case 'diagonal-hatch':
      return {
        backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 18px, ${strokeSoft} 18px, ${strokeSoft} 19.5px)`,
        filter: `brightness(${brightness})`,
      };
    case 'dot-matrix':
      return {
        backgroundImage: `radial-gradient(${stroke} 1.5px, transparent 1.5px)`,
        backgroundSize: '24px 24px',
        filter: `brightness(${brightness})`,
      };
    case 'circuit-nodes':
      return {
        backgroundImage: svgUrl(
          `<path d="M0 20 H30 L45 35 H80 M20 0 V20 M60 35 V60" fill="none" stroke="${strokeSoft}" stroke-width="1.1"/><circle cx="30" cy="20" r="2.2" fill="${stroke}"/><circle cx="45" cy="35" r="2.2" fill="${stroke}"/><circle cx="60" cy="60" r="2" fill="${stroke}"/>`,
          '0 0 80 80'
        ),
        backgroundSize: '80px 80px',
        filter: `brightness(${brightness})`,
      };
    case 'concentric-waves':
      return {
        backgroundImage: svgUrl(
          `<circle cx="40" cy="40" r="14" fill="none" stroke="${strokeSoft}" stroke-width="1"/><circle cx="40" cy="40" r="28" fill="none" stroke="${stroke}" stroke-width="1"/><circle cx="40" cy="40" r="42" fill="none" stroke="${strokeSoft}" stroke-width="1"/>`,
          '0 0 80 80'
        ),
        backgroundSize: '80px 80px',
        filter: `brightness(${brightness})`,
      };
    case 'aurora-mesh':
      return {
        backgroundImage:
          'radial-gradient(circle at 15% 15%, var(--ft-canvas-grad-1), transparent 45%), radial-gradient(circle at 85% 25%, var(--ft-canvas-grad-2), transparent 50%)',
        filter: `brightness(${brightness})`,
      };
    case 'amber-horizon':
      return {
        backgroundImage:
          'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.18), transparent 60%)',
        filter: `brightness(${brightness})`,
      };
    default:
      return {};
  }
}
