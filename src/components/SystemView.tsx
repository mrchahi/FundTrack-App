import React, { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Clock,
  Cloud,
  Database,
  EyeOff,
  Lock,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import {
  AiModelProfile,
  AppLanguage,
  FundTrackState,
  LocalAiConfig,
  LocalAiProvider,
  SystemSubTab,
  ThemeId,
} from '../types';
import { formatJalaliDateTime } from '../utils/jalali';
import { BACKDROP_PRESETS, getBackdropStyle } from '../utils/backdrops';
import {
  PROVIDER_META,
  resolveActiveModelProfile,
  testAssistantProfileConnection,
} from '../utils/assistantCopilot';
import { t } from '../i18n/translations';
import { GlassSelect, GlassSwitch } from './GlassControls';
import { MaterialInput } from './MaterialInputs';
import { BackupAndInstallPanel } from './BackupAndInstallPanel';

interface SystemViewProps {
  state: FundTrackState;
  subTab: SystemSubTab;
  setSubTab: (tab: SystemSubTab) => void;
  onUpdateSettings: (patch: Partial<FundTrackState['settings']>) => void;
  onLockNow: () => void;
  onRefreshSystem: () => void;
  onResetDemoData: () => void;
  onWipeAllData: () => void;
  onRestoreState: (restored: FundTrackState, target: 'local' | 'gdrive') => void;
  onSyncEaFile?: () => Promise<void> | void;
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

const THEMES: Array<{
  id: ThemeId;
  nameFa: string;
  nameEn: string;
  mode: 'dark' | 'light';
  bg: string;
  accent: string;
  accentSecondary: string;
  text: string;
}> = [
  { id: 'obsidian', nameFa: 'اوبسیدین یخی', nameEn: 'Obsidian Sky', mode: 'dark', bg: '#090d14', accent: '#38bdf8', accentSecondary: '#6366f1', text: '#f8fafc' },
  { id: 'aurora', nameFa: 'شفق زمردی', nameEn: 'Aurora Mint', mode: 'dark', bg: '#071316', accent: '#2dd4bf', accentSecondary: '#0ea5e9', text: '#f0fdfa' },
  { id: 'midnight', nameFa: 'نیمه‌شب بنفش', nameEn: 'Midnight Indigo', mode: 'dark', bg: '#070c1b', accent: '#818cf8', accentSecondary: '#c084fc', text: '#f8fafc' },
  { id: 'emerald', nameFa: 'زمرد رویال', nameEn: 'Royal Emerald', mode: 'dark', bg: '#06130e', accent: '#10b981', accentSecondary: '#84cc16', text: '#ecfdf5' },
  { id: 'crimson', nameFa: 'یاقوت و رُز', nameEn: 'Crimson Rose', mode: 'dark', bg: '#13090e', accent: '#fb7185', accentSecondary: '#fb923c', text: '#fff1f2' },
  { id: 'royal', nameFa: 'طلای سلطنتی', nameEn: 'Royal Gold', mode: 'dark', bg: '#0e0b08', accent: '#eab308', accentSecondary: '#f97316', text: '#fefce8' },
  { id: 'cyberpunk', nameFa: 'سایبرپانک', nameEn: 'Cyberpunk', mode: 'dark', bg: '#0b0a10', accent: '#f59e0b', accentSecondary: '#ec4899', text: '#fafaf9' },
  { id: 'light', nameFa: 'مات یخی (روشن)', nameEn: 'Frosted Ice', mode: 'light', bg: '#f3f6fb', accent: '#2563eb', accentSecondary: '#0ea5e9', text: '#0f172a' },
  { id: 'coral', nameFa: 'مرجانی گرم (روشن)', nameEn: 'Warm Coral', mode: 'light', bg: '#f3f4f6', accent: '#e84e1b', accentSecondary: '#f59e0b', text: '#111827' },
  { id: 'lavender', nameFa: 'اسطوخودوس (روشن)', nameEn: 'Soft Lavender', mode: 'light', bg: '#f5f3ff', accent: '#7c3aed', accentSecondary: '#db2777', text: '#1e1b4b' },
];

export const SystemView: React.FC<SystemViewProps> = ({
  state,
  subTab,
  setSubTab,
  onUpdateSettings,
  onLockNow,
  onRefreshSystem,
  onResetDemoData,
  onWipeAllData,
  onRestoreState,
  onSyncEaFile,
  onShowToast,
}) => {
  const lang: AppLanguage = state.settings.language;
  const s = state.settings;
  const isLightTheme = s.theme === 'light' || s.theme === 'coral' || s.theme === 'lavender';

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPinCheck, setCurrentPinCheck] = useState('');
  const [aiTestingId, setAiTestingId] = useState<string | null>(null);
  const [aiModels, setAiModels] = useState<string[]>([]);
  const [aiStatusMap, setAiStatusMap] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // New Profile Form state
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [newProfName, setNewProfName] = useState('');
  const [newProfProvider, setNewProfProvider] = useState<LocalAiProvider>('openrouter');
  const [newProfEndpoint, setNewProfEndpoint] = useState(PROVIDER_META.openrouter.defaultEndpoint);
  const [newProfModel, setNewProfModel] = useState(PROVIDER_META.openrouter.defaultModel);
  const [newProfEnvKey, setNewProfEnvKey] = useState(PROVIDER_META.openrouter.defaultEnvKey);
  const [newProfPurpose, setNewProfPurpose] = useState<'analytics' | 'general' | 'fast'>('analytics');

  const defaultProfiles: AiModelProfile[] = useMemo(
    () => [
      {
        id: 'prof_gemini_4',
        name: 'Gemini 4 Hydrogen (تحلیل تخصصی و اجرا)',
        provider: 'gemini',
        endpoint: '',
        model: 'gemini-4-hydrogen',
        envKeyName: 'GEMINI_API_KEY',
        purpose: 'analytics',
      },
      {
        id: 'prof_jan_local',
        name: 'Jan Desktop — Gemma 4 (لوکال آفلاین)',
        provider: 'jan',
        endpoint: 'http://127.0.0.1:1337/v1',
        model: 'gemma-4-E2B-it-Q4_K_M',
        envKeyName: 'LOCAL_AI_API_KEY',
        purpose: 'fast',
      },
    ],
    []
  );

  const localAi: LocalAiConfig = useMemo(() => {
    const raw = s.localAi;
    const profiles = raw?.profiles && raw.profiles.length > 0 ? raw.profiles : defaultProfiles;
    const active =
      profiles.find((p) => p.id === raw?.activeProfileId) ??
      profiles[0] ??
      resolveActiveModelProfile(raw);
    return {
      enabled: raw?.enabled ?? true,
      provider: active.provider,
      endpoint: active.endpoint,
      model: active.model,
      activeProfileId: active.id,
      thinkingDepth: raw?.thinkingDepth ?? 'deep',
      profiles,
    };
  }, [s.localAi, defaultProfiles]);

  const updateLocalAi = (patch: Partial<LocalAiConfig>) => {
    onUpdateSettings({
      localAi: {
        ...localAi,
        ...patch,
      },
    });
  };

  const handleSelectProfile = (profile: AiModelProfile) => {
    updateLocalAi({
      activeProfileId: profile.id,
      provider: profile.provider,
      endpoint: profile.endpoint,
      model: profile.model,
    });
    onShowToast(
      t(lang, `مدل فعال روی «${profile.name}» تنظیم شد`, `Active AI set to "${profile.name}"`),
      'success'
    );
  };

  const handleTestProfile = async (profile: AiModelProfile) => {
    setAiTestingId(profile.id);
    const res = await testAssistantProfileConnection(profile);
    setAiTestingId(null);
    if (res.ok) {
      if (res.models.length > 0) setAiModels(res.models);
      setAiStatusMap((prev) => ({
        ...prev,
        [profile.id]: {
          ok: true,
          msg: t(
            lang,
            `متصل (${res.models.length} مدل شناسایی شد)`,
            `Connected (${res.models.length} models)`
          ),
        },
      }));
      onShowToast(t(lang, `اتصال به ${profile.name} برقرار است`, `${profile.name} connected`), 'success');
    } else {
      setAiStatusMap((prev) => ({
        ...prev,
        [profile.id]: {
          ok: false,
          msg: res.error || t(lang, 'عدم دسترسی', 'Unreachable'),
        },
      }));
      onShowToast(res.error || t(lang, 'اتصال برقرار نشد', 'Connection failed'), 'error');
    }
  };

  const handleAddProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanModel = newProfModel.trim();
    if (!cleanModel) {
      onShowToast(t(lang, 'شناسه مدل را وارد کنید', 'Enter a model ID'), 'error');
      return;
    }
    const meta = PROVIDER_META[newProfProvider];
    const cleanName = newProfName.trim() || `${meta.labelEn.split(' ')[0]} · ${cleanModel}`;
    const newId = `prof_${Date.now()}`;
    const created: AiModelProfile = {
      id: newId,
      name: cleanName,
      provider: newProfProvider,
      endpoint: meta.needsEndpoint ? newProfEndpoint.trim() || meta.defaultEndpoint : '',
      model: cleanModel,
      envKeyName: newProfEnvKey.trim() || meta.defaultEnvKey,
      purpose: newProfPurpose,
    };
    const nextProfiles = [...(localAi.profiles ?? []), created];
    updateLocalAi({
      profiles: nextProfiles,
      activeProfileId: newId,
      provider: created.provider,
      endpoint: created.endpoint,
      model: created.model,
    });
    setNewProfName('');
    setShowAddProfile(false);
    onShowToast(t(lang, 'پروفایل مدل جدید اضافه و فعال شد', 'New model profile added & activated'), 'success');
  };

  const handleDeleteProfile = (id: string) => {
    const current = localAi.profiles ?? [];
    if (current.length <= 1) return;
    const next = current.filter((p) => p.id !== id);
    const nextActive = localAi.activeProfileId === id ? next[0] : next.find((p) => p.id === localAi.activeProfileId) ?? next[0];
    updateLocalAi({
      profiles: next,
      activeProfileId: nextActive.id,
      provider: nextActive.provider,
      endpoint: nextActive.endpoint,
      model: nextActive.model,
    });
    onShowToast(t(lang, 'پروفایل مدل حذف شد', 'Model profile removed'), 'info');
  };

  const handleBackdropUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateSettings({
          backdropPreset: 'custom',
          backdropCustomUrl: reader.result,
        });
        onShowToast(t(lang, 'تصویر پس‌زمینه اعمال شد', 'Backdrop image applied'), 'success');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSetPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (s.pinEnabled && currentPinCheck !== s.pinCode) {
      onShowToast(t(lang, 'رمز PIN فعلی اشتباه است', 'Current PIN is incorrect'), 'error');
      return;
    }
    if (newPin.length < 4 || !/^\d+$/.test(newPin)) {
      onShowToast(t(lang, 'رمز PIN باید حداقل ۴ رقم عددی باشد', 'PIN must be at least 4 digits'), 'error');
      return;
    }
    if (newPin !== confirmPin) {
      onShowToast(t(lang, 'تکرار رمز PIN مطابقت ندارد', 'PIN confirmation does not match'), 'error');
      return;
    }
    onUpdateSettings({ pinEnabled: true, pinCode: newPin });
    setNewPin('');
    setConfirmPin('');
    setCurrentPinCheck('');
    onShowToast(t(lang, 'رمز PIN با موفقیت ذخیره شد', 'Security PIN saved'), 'success');
  };

  const handleDisablePin = () => {
    if (currentPinCheck !== s.pinCode) {
      onShowToast(t(lang, 'برای غیرفعال‌سازی، رمز PIN فعلی را صحیح وارد کنید', 'Enter current PIN to disable'), 'error');
      return;
    }
    onUpdateSettings({ pinEnabled: false, pinCode: '' });
    setCurrentPinCheck('');
    onShowToast(t(lang, 'قفل PIN غیرفعال شد', 'PIN lock disabled'), 'info');
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1.5 rounded-2xl glass-surface">
        {(
          [
            ['appearance', t(lang, 'ظاهر و تم', 'Appearance')],
            ['ai', t(lang, 'دستیار هوشمند (Jan)', 'Local AI (Jan)')],
            ['security', t(lang, 'امنیت و قفل', 'Security')],
            ['backup', t(lang, 'پشتیبان و نصب', 'Backup & Install')],
            ['health', t(lang, 'سلامت سیستم', 'System Health')],
          ] as Array<[SystemSubTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === id
                ? 'ft-accent-gradient font-semibold'
                : 'text-[var(--ft-text-secondary)] hover:text-[var(--ft-text-primary)] hover:bg-[var(--ft-surface-hover)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 1. Appearance & 10 Themes + Geometric Patterns */}
      {subTab === 'appearance' && (
        <div className="space-y-6">
          <section className="glass-surface rounded-3xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[var(--ft-accent)]" />
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, '۱۰ تم اختصاصی', '10 Curated Themes')}
                </h3>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)]">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ language: 'fa' })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                    lang === 'fa' ? 'ft-accent-gradient font-semibold' : ''
                  }`}
                >
                  فارسی (RTL)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ language: 'en' })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                    lang === 'en' ? 'ft-accent-gradient font-semibold' : ''
                  }`}
                >
                  English (LTR)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {THEMES.map((th) => {
                const active = s.theme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: th.id })}
                    className={`p-4 rounded-xl border text-start transition-all cursor-pointer space-y-3 ${
                      active
                        ? 'border-[var(--ft-accent)] ring-2 ring-[var(--ft-accent)]'
                        : 'border-[var(--ft-border)] hover:border-[var(--ft-border-strong)]'
                    }`}
                    style={{
                      background: `radial-gradient(circle at 100% 0%, ${th.accent}26, transparent 62%), ${th.bg}`,
                      color: th.text,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="w-10 h-5 rounded-lg inline-block"
                        style={{
                          background: `linear-gradient(135deg, ${th.accent}, ${th.accentSecondary})`,
                        }}
                      />
                      {active ? (
                        <span className="text-[11px] font-semibold">✓</span>
                      ) : (
                        <span className="text-[10px] opacity-65">
                          {th.mode === 'dark' ? t(lang, 'تیره', 'Dark') : t(lang, 'روشن', 'Light')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs sm:text-sm font-semibold truncate">
                      {lang === 'fa' ? th.nameFa : th.nameEn}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="glass-surface rounded-3xl p-6 space-y-6">
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
              {t(lang, 'پس‌زمینه و شیشه', 'Backdrops & Glass')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--ft-text-muted)]">{t(lang, 'شفافیت / مات کارت', 'Surface Opacity')}</span>
                  <span className="font-num">{Math.round(s.glassOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.38"
                  max="0.92"
                  step="0.02"
                  value={s.glassOpacity}
                  onChange={(e) => onUpdateSettings({ glassOpacity: Number(e.target.value) })}
                  className="w-full accent-[var(--ft-accent)] cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--ft-text-muted)]">{t(lang, 'شدت بلور شیشه‌ای', 'Glass Blur')}</span>
                  <span className="font-num">{s.glassBlur}px</span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="28"
                  step="2"
                  value={s.glassBlur}
                  onChange={(e) => onUpdateSettings({ glassBlur: Number(e.target.value) })}
                  className="w-full accent-[var(--ft-accent)] cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl glass-tile">
                <span className="text-xs font-medium text-[var(--ft-text-primary)]">
                  {t(lang, 'افزایش کنتراست کارت‌ها', 'High-Contrast Surfaces')}
                </span>
                <GlassSwitch
                  checked={s.highContrastCards}
                  onChange={(checked) => onUpdateSettings({ highContrastCards: checked })}
                  ariaLabel={t(lang, 'افزایش کنتراست کارت‌ها', 'High-Contrast Surfaces')}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--ft-border)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-[var(--ft-text-primary)]">
                  {t(lang, 'انتخاب الگوی پس‌زمینه هندسی و محیطی', 'Geometric & Atmospheric Backdrop Presets')}
                </span>
                <label className="px-3.5 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{t(lang, 'آپلود تصویر دلخواه', 'Upload Image')}</span>
                  <input type="file" accept="image/*" onChange={handleBackdropUpload} className="hidden" />
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {BACKDROP_PRESETS.map((preset) => {
                  const active = s.backdropPreset === preset.id;
                  const previewStyle = getBackdropStyle(preset.id, '', 0, 1, isLightTheme);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onUpdateSettings({ backdropPreset: preset.id })}
                      className={`p-3 rounded-xl border text-start space-y-2 transition-all cursor-pointer ${
                        active
                          ? 'border-[var(--ft-accent)] ring-1 ring-[var(--ft-accent)] bg-[var(--ft-accent-soft)]'
                          : 'border-[var(--ft-border)] bg-[var(--ft-surface-subtle)] hover:border-[var(--ft-border-strong)]'
                      }`}
                    >
                      <div
                        className="h-14 w-full rounded-lg border border-[var(--ft-border)] bg-[var(--ft-canvas)]"
                        style={previewStyle}
                      />
                      <div className="text-xs font-medium text-[var(--ft-text-primary)] truncate">
                        {lang === 'fa' ? preset.nameFa : preset.nameEn}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--ft-text-muted)]">{t(lang, 'بلور پس‌زمینه', 'Backdrop Blur')}</span>
                    <span className="font-num">{s.backdropBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="2"
                    value={s.backdropBlur}
                    onChange={(e) => onUpdateSettings({ backdropBlur: Number(e.target.value) })}
                    className="w-full accent-[var(--ft-accent)] cursor-pointer"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--ft-text-muted)]">{t(lang, 'روشنایی پس‌زمینه', 'Backdrop Brightness')}</span>
                    <span className="font-num">{Math.round(s.backdropBrightness * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.35"
                    max="1.15"
                    step="0.05"
                    value={s.backdropBrightness}
                    onChange={(e) => onUpdateSettings({ backdropBrightness: Number(e.target.value) })}
                    className="w-full accent-[var(--ft-accent)] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* 2. AI Copilot & Advanced API / Local Models */}
      {subTab === 'ai' && (
        <section className="glass-surface rounded-3xl p-6 max-w-4xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-[var(--ft-accent)] shrink-0" />
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'مدل‌های هوش مصنوعی، APIهای تخصصی و سرور لوکال', 'AI Copilot & Model Profiles (Cloud API + Local GGUF)')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)]">
                  {t(
                    lang,
                    'پروفایل‌های لوکال (Jan / Ollama) و مدل‌های ابری پیشرفته (Gemini 4 / OpenRouter / OpenAI / DeepSeek) را مدیریت و بین آن‌ها سوییچ کنید.',
                    'Manage and switch between local GGUF runners and advanced cloud APIs for quantitative trading & financial analysis.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--ft-surface-subtle)] border border-[var(--ft-border)] text-xs">
                <button
                  type="button"
                  onClick={() => updateLocalAi({ thinkingDepth: 'deep' })}
                  className={`px-2.5 py-1 rounded-lg cursor-pointer whitespace-nowrap ${
                    (localAi.thinkingDepth ?? 'deep') === 'deep'
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)]'
                  }`}
                >
                  {t(lang, 'تحلیل عمیق', 'Deep Reasoning')}
                </button>
                <button
                  type="button"
                  onClick={() => updateLocalAi({ thinkingDepth: 'fast' })}
                  className={`px-2.5 py-1 rounded-lg cursor-pointer whitespace-nowrap ${
                    localAi.thinkingDepth === 'fast'
                      ? 'ft-accent-gradient font-semibold'
                      : 'text-[var(--ft-text-secondary)]'
                  }`}
                >
                  {t(lang, 'پاسخ سریع', 'Fast')}
                </button>
              </div>
              <GlassSwitch
                checked={localAi.enabled}
                onChange={(checked) => updateLocalAi({ enabled: checked })}
                ariaLabel={t(lang, 'فعال‌سازی مدل‌های هوش مصنوعی', 'Enable AI Models')}
              />
            </div>
          </div>

          {/* Model Profiles List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-[var(--ft-text-secondary)]">
                {t(lang, 'فهرست مدل‌های تعریف‌شده (سوییچ سریع در بالای پنجره چت در دسترس است)', 'Configured Model Profiles')}
              </h4>
              <button
                type="button"
                onClick={() => setShowAddProfile((v) => !v)}
                className="px-3.5 py-1.5 rounded-xl ft-accent-gradient text-xs font-semibold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t(lang, 'افزودن مدل با API یا لوکال', 'Add Model Profile')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {(localAi.profiles ?? []).map((prof) => {
                const isActive = prof.id === localAi.activeProfileId;
                const meta = PROVIDER_META[prof.provider] ?? PROVIDER_META.custom;
                const status = aiStatusMap[prof.id];
                const isTesting = aiTestingId === prof.id;
                return (
                  <div
                    key={prof.id}
                    className={`p-4 rounded-2xl border transition-colors space-y-3 ${
                      isActive
                        ? 'border-[var(--ft-accent)] bg-[var(--ft-accent-soft)]/35'
                        : 'border-[var(--ft-border)] bg-[var(--ft-surface-subtle)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[var(--ft-text-primary)] truncate">
                          {prof.name}
                        </div>
                        <div className="text-[11px] text-[var(--ft-text-muted)] font-num truncate">
                          {meta.isCloud ? t(lang, 'API ابری', 'Cloud API') : t(lang, 'لوکال', 'Local')} · {prof.model}
                        </div>
                      </div>
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] text-[10px] font-bold shrink-0">
                          {t(lang, 'مدل فعال', 'Active')}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[var(--ft-text-secondary)] space-y-0.5 font-num truncate">
                      {prof.endpoint ? (
                        <div>URL: {prof.endpoint}</div>
                      ) : (
                        <div>{t(lang, 'موتور داخلی سرور پنل (@google/genai)', 'Built-in Server Engine')}</div>
                      )}
                      {prof.envKeyName && (
                        <div className="text-[var(--ft-text-muted)]">
                          {t(lang, 'متغیر کلید سرور (.env):', 'Server Env Key:')} {prof.envKeyName}
                        </div>
                      )}
                    </div>

                    {status && (
                      <div
                        className={`text-[11px] ${
                          status.ok ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                        }`}
                      >
                        {status.msg}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)]">
                      <div className="flex items-center gap-1.5">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => handleSelectProfile(prof)}
                            className="px-3 py-1.5 rounded-xl bg-[var(--ft-accent)] text-[var(--ft-accent-fg)] text-xs font-semibold cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{t(lang, 'انتخاب به عنوان فعال', 'Set Active')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleTestProfile(prof)}
                          disabled={isTesting}
                          className="px-3 py-1.5 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                          <span>{t(lang, 'تست اتصال', 'Test')}</span>
                        </button>
                      </div>

                      {(localAi.profiles?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProfile(prof.id)}
                          title={t(lang, 'حذف پروفایل', 'Delete Profile')}
                          className="p-1.5 rounded-lg text-[var(--ft-danger)] hover:bg-[var(--ft-danger-soft)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Custom API / Local Profile Drawer */}
          {showAddProfile && (
            <form
              onSubmit={handleAddProfile}
              className="p-5 rounded-2xl border border-[var(--ft-accent)]/50 bg-[var(--ft-surface-subtle)] space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[var(--ft-border)] pb-3">
                <h4 className="text-sm font-bold text-[var(--ft-text-primary)]">
                  {t(lang, 'افزودن مدل تخصصی جدید (API یا لوکال)', 'Add New Model Profile (API or Local)')}
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <MaterialInput
                  type="text"
                  fieldSize="sm"
                  label={t(lang, 'نام نمایشی مدل (مثلاً DeepSeek تحلیل ترید)', 'Profile Label')}
                  value={newProfName}
                  onChange={(e) => setNewProfName(e.target.value)}
                />

                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'سرویس‌دهنده / نوع API', 'Provider')}</label>
                  <GlassSelect<LocalAiProvider>
                    size="sm"
                    className="w-full"
                    value={newProfProvider}
                    onChange={(prov) => {
                      const meta = PROVIDER_META[prov];
                      setNewProfProvider(prov);
                      setNewProfEndpoint(meta.defaultEndpoint);
                      setNewProfModel(meta.defaultModel);
                      setNewProfEnvKey(meta.defaultEnvKey);
                    }}
                    options={(Object.keys(PROVIDER_META) as LocalAiProvider[]).map((k) => ({
                      value: k,
                      label: lang === 'fa' ? PROVIDER_META[k].labelFa : PROVIDER_META[k].labelEn,
                    }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                {PROVIDER_META[newProfProvider].needsEndpoint && (
                  <MaterialInput
                    type="text"
                    fieldSize="sm"
                    ltrNum
                    label={t(lang, 'آدرس API (OpenAI Compatible v1)', 'API Endpoint URL')}
                    value={newProfEndpoint}
                    onChange={(e) => setNewProfEndpoint(e.target.value)}
                  />
                )}

                {newProfProvider === 'gemini' ? (
                  <div className="md-field">
                    <label className="md-field-label">{t(lang, 'مدل Gemini', 'Gemini Model')}</label>
                    <GlassSelect<string>
                      size="sm"
                      className="w-full"
                      value={newProfModel}
                      onChange={(m) => setNewProfModel(m)}
                      options={[
                        { value: 'gemini-4-hydrogen', label: 'gemini-4-hydrogen (پیشنهادی تحلیل عمیق)' },
                        { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (فوق‌سریع)' },
                      ]}
                    />
                  </div>
                ) : (
                  <MaterialInput
                    type="text"
                    fieldSize="sm"
                    ltrNum
                    label={t(lang, 'شناسه دقیق مدل (مثلاً deepseek-reasoner یا gpt-4.1)', 'Model ID')}
                    value={newProfModel}
                    onChange={(e) => setNewProfModel(e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div className="md-field">
                  <label className="md-field-label">{t(lang, 'نقش پیشنهادی مدل', 'Primary Purpose')}</label>
                  <GlassSelect<'analytics' | 'general' | 'fast'>
                    size="sm"
                    className="w-full"
                    value={newProfPurpose}
                    onChange={(v) => setNewProfPurpose(v)}
                    options={[
                      { value: 'analytics', label: t(lang, 'تحلیل آماری و استراتژیک', 'Deep Analytics') },
                      { value: 'general', label: t(lang, 'دستیار همه‌کاره پنل', 'General Copilot') },
                      { value: 'fast', label: t(lang, 'ثبت سریع روزانه', 'Fast Entry') },
                    ]}
                  />
                </div>

                <MaterialInput
                  type="text"
                  fieldSize="sm"
                  ltrNum
                  label={t(lang, 'نام متغیر کلید در .env / Secrets سرور', 'Server Env Variable Name')}
                  hint={t(
                    lang,
                    'کلید واقعی برای امنیت در فایل .env یا Settings > Secrets سرور تعریف می‌شود.',
                    'Actual secret key stays server-side in .env or Settings > Secrets.'
                  )}
                  value={newProfEnvKey}
                  onChange={(e) => setNewProfEnvKey(e.target.value)}
                />
              </div>

              {aiModels.length > 0 && newProfProvider !== 'gemini' && (
                <div className="space-y-1">
                  <div className="text-[11px] text-[var(--ft-text-muted)]">
                    {t(lang, 'مدل‌های کشف‌شده از آخرین تست اتصال:', 'Recently discovered models:')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {aiModels.slice(0, 8).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setNewProfModel(m)}
                        className="px-2 py-1 rounded-lg border border-[var(--ft-border)] text-[11px] font-num hover:border-[var(--ft-accent)] cursor-pointer"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ft-border)]">
                <button
                  type="button"
                  onClick={() => setShowAddProfile(false)}
                  className="px-3.5 py-2 rounded-xl border border-[var(--ft-border)] text-xs cursor-pointer"
                >
                  {t(lang, 'انصراف', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl ft-accent-gradient text-xs font-bold cursor-pointer"
                >
                  {t(lang, 'ذخیره و فعال‌سازی مدل', 'Save & Activate')}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* 3. Security & PIN */}
      {subTab === 'security' && (
        <section className="glass-surface rounded-3xl p-6 max-w-xl space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--ft-border)]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[var(--ft-accent)]" />
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'امنیت و رمز PIN پنل', 'Panel Security & PIN Lock')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)]">
                  {s.pinEnabled
                    ? t(lang, 'قفل PIN فعال است و در ورود بعدی درخواست می‌شود.', 'PIN Lock is active.')
                    : t(lang, 'فعلاً رمزی تنظیم نشده است.', 'No PIN currently configured.')}
                </p>
              </div>
            </div>
            {s.pinEnabled && (
              <button
                type="button"
                onClick={onLockNow}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{t(lang, 'قفل فوری پنل', 'Lock Now')}</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSetPin} className="space-y-4">
            {s.pinEnabled && (
              <MaterialInput
                type="password"
                inputMode="numeric"
                ltrNum
                label={t(lang, 'رمز PIN فعلی', 'Current PIN')}
                success={
                  currentPinCheck.length > 0 && currentPinCheck === s.pinCode
                    ? t(lang, 'رمز فعلی صحیح است', 'Current PIN verified')
                    : undefined
                }
                warning={
                  currentPinCheck.length >= 4 && currentPinCheck !== s.pinCode
                    ? t(lang, 'با رمز فعلی تطابق ندارد', 'Does not match current PIN')
                    : undefined
                }
                value={currentPinCheck}
                onChange={(e) => setCurrentPinCheck(e.target.value)}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MaterialInput
                type="password"
                inputMode="numeric"
                maxLength={6}
                ltrNum
                label={t(lang, 'رمز PIN جدید (۴ تا ۶ رقم)', 'New PIN (4-6 digits)')}
                error={
                  newPin.length > 0 && !/^\d+$/.test(newPin)
                    ? t(lang, 'فقط ارقام مجاز است', 'Digits only')
                    : undefined
                }
                warning={
                  newPin.length > 0 && /^\d+$/.test(newPin) && newPin.length < 4
                    ? t(lang, 'حداقل ۴ رقم وارد کنید', 'Enter at least 4 digits')
                    : undefined
                }
                success={
                  newPin.length >= 4 && /^\d+$/.test(newPin)
                    ? t(lang, 'طول رمز استاندارد است', 'Valid PIN length')
                    : undefined
                }
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
              />
              <MaterialInput
                type="password"
                inputMode="numeric"
                maxLength={6}
                ltrNum
                label={t(lang, 'تکرار رمز PIN جدید', 'Confirm New PIN')}
                error={
                  confirmPin.length > 0 && confirmPin !== newPin
                    ? t(lang, 'تکرار رمز مطابقت ندارد', 'PIN mismatch')
                    : undefined
                }
                success={
                  confirmPin.length >= 4 && confirmPin === newPin
                    ? t(lang, 'تکرار رمز مطابقت دارد', 'PINs match')
                    : undefined
                }
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer"
              >
                {s.pinEnabled ? t(lang, 'تغییر رمز PIN', 'Update PIN') : t(lang, 'فعال‌سازی رمز PIN', 'Enable PIN')}
              </button>

              {s.pinEnabled && (
                <button
                  type="button"
                  onClick={handleDisablePin}
                  className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--ft-danger)] text-[var(--ft-danger)] cursor-pointer flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{t(lang, 'حذف قفل PIN', 'Disable PIN')}</span>
                </button>
              )}
            </div>
          </form>

          {/* Auto-Lock Timeout & Private Mode */}
          <div className="pt-5 border-t border-[var(--ft-border)] space-y-4">
            <div className="relative z-20 flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl glass-tile">
              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-[var(--ft-accent)] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'قفل خودکار پس از عدم فعالیت', 'Auto-Lock Inactivity Timeout')}
                  </div>
                  <div className="text-[11px] text-[var(--ft-text-muted)]">
                    {s.pinEnabled
                      ? t(lang, 'پس از اتمام این زمان بدون فعالیت، پنل قفل می‌شود.', 'Locks panel automatically after selected idle time.')
                      : t(lang, 'برای فعال‌سازی قفل خودکار ابتدا یک رمز PIN تنظیم کنید.', 'Enable a PIN above to activate idle auto-lock.')}
                  </div>
                </div>
              </div>
              <GlassSelect<string>
                size="sm"
                align="end"
                value={String(s.autoLockMinutes ?? 0)}
                onChange={(val) => {
                  const mins = Number(val) || 0;
                  onUpdateSettings({ autoLockMinutes: mins });
                  onShowToast(
                    mins === 0
                      ? t(lang, 'قفل خودکار زمانی غیرفعال شد (فقط قفل دستی)', 'Auto-lock timeout turned off (manual lock only)')
                      : t(lang, `قفل خودکار روی ${mins} دقیقه تنظیم شد`, `Auto-lock set to ${mins} min`),
                    'info'
                  );
                }}
                ariaLabel={t(lang, 'بازه قفل خودکار', 'Auto-Lock Timeout')}
                options={[
                  { value: '0', label: t(lang, 'فقط دستی / غیرفعال', 'Off / Manual Only') },
                  { value: '1', label: t(lang, '۱ دقیقه', '1 minute') },
                  { value: '5', label: t(lang, '۵ دقیقه', '5 minutes') },
                  { value: '15', label: t(lang, '۱۵ دقیقه', '15 minutes') },
                  { value: '30', label: t(lang, '۳۰ دقیقه', '30 minutes') },
                  { value: '60', label: t(lang, '۶۰ دقیقه', '60 minutes') },
                ]}
              />
            </div>

            <div className="relative z-10 flex items-center justify-between gap-4 p-4 rounded-2xl glass-tile">
              <div className="flex items-start gap-2.5">
                <EyeOff className="w-4 h-4 text-[var(--ft-accent)] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'حالت محرمانه داده‌ها (Private Mode)', 'Private Mode (Wallet-Style Mask)')}
                  </div>
                  <div className="text-[11px] text-[var(--ft-text-muted)]">
                    {t(lang, 'مخفی‌سازی موجودی‌ها، ارزش خالص، سود/زیان و شماره حساب‌ها با ستاره (••••••)', 'Mask all balances, net worth, P&L and account numbers with dots')}
                  </div>
                </div>
              </div>
              <GlassSwitch
                checked={Boolean(s.privateMode)}
                onChange={(checked) => onUpdateSettings({ privateMode: checked })}
                ariaLabel={t(lang, 'حالت محرمانه داده‌ها', 'Private Mode')}
              />
            </div>
          </div>
        </section>
      )}

      {/* 3. Backups, Google Drive & PWA App Install */}
      {subTab === 'backup' && (
        <BackupAndInstallPanel
          state={state}
          onUpdateSettings={onUpdateSettings}
          onRestoreState={onRestoreState}
          onShowToast={onShowToast}
        />
      )}

      {/* 4. System Health */}
      {subTab === 'health' && (
        <section className="glass-surface rounded-3xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[var(--ft-accent)]" />
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'سلامت سیستم و وضعیت همگام‌سازی', 'System Health & Diagnostics')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'آخرین بررسی:', 'Last checked:')} {formatJalaliDateTime(s.lastSyncAt, lang)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSubTab('backup')}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-[var(--ft-accent)] text-[var(--ft-accent)] hover:bg-[var(--ft-accent-soft)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{t(lang, 'پشتیبان‌گیری و گوگل درایو', 'Backups & Google Drive')}</span>
              </button>
              <button
                type="button"
                onClick={onRefreshSystem}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl ft-accent-gradient cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t(lang, 'رفرش وضعیت', 'Refresh')}</span>
              </button>
              <button
                type="button"
                onClick={onResetDemoData}
                className="px-3.5 py-2 text-xs font-medium rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t(lang, 'بازگردانی داده‌های نمونه', 'Reset Sample Data')}</span>
              </button>
              <button
                type="button"
                onClick={onWipeAllData}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-[var(--ft-danger)] text-[var(--ft-danger)] hover:bg-[var(--ft-danger-soft)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t(lang, 'پاک‌سازی کامل داده‌های پنل (شروع تمیز)', 'Wipe All Data (Clean Start)')}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-4 rounded-2xl glass-tile space-y-2">
              <div className="text-xs text-[var(--ft-text-muted)]">{t(lang, 'وضعیت اتصال فایل رویداد', 'Event File Connection')}</div>
              <div
                className={`text-sm font-semibold ${
                  s.eventFileConnected ? 'text-[var(--ft-positive)]' : 'text-[var(--ft-danger)]'
                }`}
              >
                {s.eventFileConnected
                  ? t(lang, 'فعال — فایل events.jsonl در دسترس است', 'Active — events.jsonl available')
                  : t(lang, 'غیرفعال — فایل رویداد یافت نشد', 'Inactive — event file missing')}
              </div>
              <button
                type="button"
                onClick={() => (onSyncEaFile ? onSyncEaFile() : onRefreshSystem())}
                className="text-xs text-[var(--ft-accent)] hover:underline cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t(lang, 'همگام‌سازی و بررسی فوری فایل رویداد', 'Sync & Test Event File Now')}</span>
              </button>
            </div>

            <div className="p-4 rounded-2xl glass-tile space-y-2">
              <div className="text-xs text-[var(--ft-text-muted)] flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>{t(lang, 'مسیر ذخیره‌سازی داده', 'Storage Engine')}</span>
              </div>
              <div className="font-num text-xs text-[var(--ft-text-primary)]">
                localStorage://fundtrack_v2_state
              </div>
              <div className="text-xs text-[var(--ft-text-muted)]">
                {t(lang, 'آخرین خطا:', 'Last Error:')} {s.lastSystemError ?? t(lang, 'بدون خطا', 'None')}
              </div>
            </div>

            <div className="p-4 rounded-2xl glass-tile space-y-2">
              <div className="text-xs text-[var(--ft-text-muted)]">{t(lang, 'شمارنده رکوردها', 'Entity Counters')}</div>
              <div className="grid grid-cols-2 gap-1 text-xs font-num">
                <span>Trades: {state.trades.length}</span>
                <span>MT5 Accs: {state.mt5Accounts.length}</span>
                <span>Bank Accs: {state.bankAccounts.length}</span>
                <span>Txns: {state.transactions.length}</span>
                <span>People: {state.people.length}</span>
                <span>Ledgers: {state.personEntries.length}</span>
                <span>Goals: {state.goals.length}</span>
                <span>Loans: {state.loans.length}</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
