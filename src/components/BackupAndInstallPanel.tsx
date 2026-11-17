import React, { useCallback, useEffect, useState } from 'react';
import {
  Cloud,
  CloudUpload,
  Download,
  FileCode2,
  FileJson,
  HardDrive,
  LogOut,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { AppLanguage, FundTrackState } from '../types';
import { t } from '../i18n/translations';
import { formatJalaliDateTime } from '../utils/jalali';
import {
  deleteDriveBackup,
  downloadDriveBackup,
  downloadLocalBackup,
  DriveBackupFile,
  getCachedDriveToken,
  getCurrentGoogleUser,
  googleDriveSignIn,
  googleDriveSignOut,
  initGoogleDriveAuth,
  listDriveBackups,
  parseAndValidateBackup,
  uploadDriveBackup,
} from '../utils/googleDriveBackup';
import { PWAInstallButton } from './PWAInstallButton';

interface BackupAndInstallPanelProps {
  state: FundTrackState;
  onUpdateSettings: (patch: Partial<FundTrackState['settings']>) => void;
  onRestoreState: (restored: FundTrackState, target: 'local' | 'gdrive') => void;
  onShowToast: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

type PendingConfirmation =
  | {
      kind: 'upload_drive';
    }
  | {
      kind: 'delete_drive';
      file: DriveBackupFile;
    }
  | {
      kind: 'restore_drive';
      file: DriveBackupFile;
      parsedState: FundTrackState;
      stats: ReturnType<typeof parseAndValidateBackup>['stats'];
    }
  | {
      kind: 'restore_local';
      fileName: string;
      parsedState: FundTrackState;
      stats: ReturnType<typeof parseAndValidateBackup>['stats'];
    };

function formatFileSize(bytesStr?: string): string {
  const bytes = Number(bytesStr || 0);
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BackupAndInstallPanel: React.FC<BackupAndInstallPanelProps> = ({
  state,
  onUpdateSettings,
  onRestoreState,
  onShowToast,
}) => {
  const lang: AppLanguage = state.settings.language;
  const s = state.settings;

  const [googleUser, setGoogleUser] = useState<User | null>(() => getCurrentGoogleUser());
  const [accessToken, setAccessToken] = useState<string | null>(() => getCachedDriveToken());
  const [driveFiles, setDriveFiles] = useState<DriveBackupFile[]>([]);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [exportingSingleFile, setExportingSingleFile] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

  const loadDriveFiles = useCallback(
    async (token: string) => {
      setLoadingFiles(true);
      try {
        const files = await listDriveBackups(token);
        setDriveFiles(files);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        if (message === 'AUTH_EXPIRED') {
          setAccessToken(null);
          onShowToast(
            t(lang, 'نشست گوگل درایو منقضی شده است؛ دوباره وارد شوید.', 'Google Drive session expired. Please sign in again.'),
            'info'
          );
        } else {
          onShowToast(
            t(lang, 'خطا در دریافت لیست فایل‌های پشتیبان از گوگل درایو', 'Failed to list Google Drive backups'),
            'error'
          );
        }
      } finally {
        setLoadingFiles(false);
      }
    },
    [lang, onShowToast]
  );

  useEffect(() => {
    const unsubscribe = initGoogleDriveAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
      },
      (user) => {
        setGoogleUser(user);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (accessToken) {
      loadDriveFiles(accessToken);
    } else {
      setDriveFiles([]);
    }
  }, [accessToken, loadDriveFiles]);

  const handleGoogleSignIn = async () => {
    setLoadingAuth(true);
    try {
      const { user, accessToken: token } = await googleDriveSignIn();
      setGoogleUser(user);
      setAccessToken(token);
      onShowToast(
        t(lang, 'اتصال به Google Drive با موفقیت برقرار شد', 'Connected to Google Drive'),
        'success'
      );
    } catch {
      onShowToast(
        t(lang, 'اتصال به حساب گوگل لغو یا با خطا مواجه شد', 'Google sign-in was cancelled or failed'),
        'error'
      );
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await googleDriveSignOut();
    setGoogleUser(null);
    setAccessToken(null);
    setDriveFiles([]);
    onShowToast(t(lang, 'اتصال گوگل درایو قطع شد', 'Disconnected from Google Drive'), 'info');
  };

  const handleLocalDownload = () => {
    const fileName = downloadLocalBackup(state);
    onUpdateSettings({
      lastBackupAt: new Date().toISOString(),
      lastBackupTarget: 'local',
    });
    onShowToast(
      t(lang, `فایل پشتیبان (${fileName}) دانلود شد`, `Local backup (${fileName}) downloaded`),
      'success'
    );
  };

  const handleDownloadSingleFile = async (includeCurrentData: boolean) => {
    setExportingSingleFile(true);
    try {
      if (isFileProtocol) {
        onShowToast(
          t(
            lang,
            'شما هم‌اکنون در حال اجرای نسخه تک‌فایلی مستقل هستید. برای بکاپ داده‌ها از فایل JSON استفاده کنید.',
            'You are already running the standalone single-file app. Use JSON backup to export data.'
          ),
          'info'
        );
        return;
      }

      const res = await fetch('/api/export-singlefile', {
        method: includeCurrentData ? 'POST' : 'GET',
        headers: includeCurrentData ? { 'Content-Type': 'application/json' } : undefined,
        body: includeCurrentData ? JSON.stringify({ state }) : undefined,
      });

      if (!res.ok) {
        throw new Error('Export failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = includeCurrentData ? 'FundTrack-MyData-App.html' : 'FundTrack-App.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onShowToast(
        t(
          lang,
          'فایل مستقل FundTrack آماده و دانلود شد — کافی است روی آن دوبار کلیک کنید!',
          'Single-file FundTrack HTML downloaded — just double-click to run anywhere!'
        ),
        'success'
      );
    } catch {
      onShowToast(
        t(lang, 'خطا در ساخت نسخه تک‌فایلی برنامه', 'Failed to export single-file application'),
        'error'
      );
    } finally {
      setExportingSingleFile(false);
    }
  };

  const handleLocalFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || '{}'));
        const parsed = parseAndValidateBackup(raw);
        setPendingConfirm({
          kind: 'restore_local',
          fileName: file.name,
          parsedState: parsed.state,
          stats: parsed.stats,
        });
      } catch {
        onShowToast(
          t(lang, 'فایل انتخاب‌شده فرمت معتبر پشتیبان FundTrack ندارد', 'Selected file is not a valid FundTrack backup'),
          'error'
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePrepareDriveRestore = async (file: DriveBackupFile) => {
    if (!accessToken) return;
    setBusyAction(true);
    try {
      const parsed = await downloadDriveBackup(accessToken, file.id);
      setPendingConfirm({
        kind: 'restore_drive',
        file,
        parsedState: parsed.state,
        stats: parsed.stats,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'AUTH_EXPIRED') {
        setAccessToken(null);
      }
      onShowToast(
        t(lang, 'خطا در خواندن یا اعتبارسنجی فایل پشتیبان گوگل درایو', 'Failed to read or validate Google Drive backup'),
        'error'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm) return;
    setBusyAction(true);
    try {
      if (pendingConfirm.kind === 'upload_drive') {
        if (!accessToken) return;
        const created = await uploadDriveBackup(accessToken, state);
        setDriveFiles((prev) => [created, ...prev]);
        onUpdateSettings({
          lastBackupAt: new Date().toISOString(),
          lastBackupTarget: 'gdrive',
        });
        onShowToast(
          t(lang, `بکاپ «${created.name}» در Google Drive ذخیره شد`, `Backup "${created.name}" saved to Google Drive`),
          'success'
        );
      } else if (pendingConfirm.kind === 'delete_drive') {
        if (!accessToken) return;
        await deleteDriveBackup(accessToken, pendingConfirm.file.id);
        setDriveFiles((prev) => prev.filter((f) => f.id !== pendingConfirm.file.id));
        onShowToast(
          t(lang, `فایل «${pendingConfirm.file.name}» از Google Drive حذف شد`, `Deleted "${pendingConfirm.file.name}" from Google Drive`),
          'info'
        );
      } else if (pendingConfirm.kind === 'restore_drive') {
        onRestoreState(pendingConfirm.parsedState, 'gdrive');
        onShowToast(
          t(lang, 'داده‌های پنل از نسخه پشتیبان Google Drive بازیابی شد', 'Data restored from Google Drive backup'),
          'success'
        );
      } else if (pendingConfirm.kind === 'restore_local') {
        onRestoreState(pendingConfirm.parsedState, 'local');
        onShowToast(
          t(lang, 'داده‌های پنل از فایل محلی بازیابی شد', 'Data restored from local backup file'),
          'success'
        );
      }
      setPendingConfirm(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'AUTH_EXPIRED') {
        setAccessToken(null);
        onShowToast(
          t(lang, 'نشست گوگل درایو منقضی شد؛ لطفاً دوباره متصل شوید.', 'Session expired. Please reconnect Google Drive.'),
          'error'
        );
      } else {
        onShowToast(
          t(lang, 'عملیات پشتیبان‌گیری با خطا مواجه شد', 'Backup operation failed'),
          'error'
        );
      }
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 0. TRUE Single-File Zero-Server Portable App Download */}
      <section className="glass-surface rounded-3xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl ft-accent-gradient flex items-center justify-center shrink-0">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(
                    lang,
                    'نسخه تک‌فایلی مستقل (بدون نصب، بدون ترمینال، بدون سرور)',
                    'Single-File Portable App (Zero Install, Zero Server)'
                  )}
                </h3>
                {isFileProtocol && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[var(--ft-positive-soft)] text-[var(--ft-positive)] text-[11px] font-semibold">
                    {t(lang, 'در حال اجرای مستقل (file://)', 'Running Standalone (file://)')}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--ft-text-muted)] mt-1 leading-relaxed">
                {t(
                  lang,
                  'کل برنامه در یک فایل واحد (.html) بسته‌بندی می‌شود. کافی است فایل را دانلود کنید و با یک دوبار کلیک در هر کامپیوتر یا موبایل باز کنید — تمام اطلاعات شما به‌صورت محلی ذخیره می‌ماند.',
                  'Downloads the entire application as one self-contained .html file. Double-click it on any PC or phone with zero terminal setup or server required.'
                )}
              </p>
            </div>
          </div>

          {!isFileProtocol && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={exportingSingleFile}
                onClick={() => handleDownloadSingleFile(true)}
                className="px-4 py-2.5 rounded-full ft-accent-gradient text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 hover:opacity-95 transition-opacity disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {exportingSingleFile
                    ? t(lang, 'در حال ساخت فایل...', 'Packaging...')
                    : t(lang, 'دانلود تک‌فایلی (با داده‌های فعلی من)', 'Download Single-File (With My Data)')}
                </span>
              </button>
              <button
                type="button"
                disabled={exportingSingleFile}
                onClick={() => handleDownloadSingleFile(false)}
                className="px-4 py-2.5 rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-semibold text-[var(--ft-text-primary)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
                <span>{t(lang, 'نسخه تک‌فایلی خام', 'Clean Single-File')}</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl glass-tile space-y-1">
            <div className="font-semibold text-[var(--ft-text-primary)]">
              {t(lang, '۱. دانلود فقط یک فایل', '1. Download One File')}
            </div>
            <p className="text-[var(--ft-text-muted)]">
              {t(
                lang,
                'فایل FundTrack-App.html شامل کل رابط کاربری، نمودارها و ابزارهای حسابداری است.',
                'FundTrack-App.html bundles the entire UI, charts, and accounting tools in ~1.2 MB.'
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-2xl glass-tile space-y-1">
            <div className="font-semibold text-[var(--ft-text-primary)]">
              {t(lang, '۲. اجرا با دوبار کلیک', '2. Double-Click to Launch')}
            </div>
            <p className="text-[var(--ft-text-muted)]">
              {t(
                lang,
                'بدون نیاز به Node.js، ترمینال یا هاست؛ مستقیماً با مرورگر دسکتاپ یا موبایل باز می‌شود.',
                'No Node.js, terminal, or hosting required—opens directly in Chrome, Edge, or Safari.'
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-2xl glass-tile space-y-1">
            <div className="font-semibold text-[var(--ft-text-primary)]">
              {t(lang, '۳. ذخیره دائم + بکاپ JSON', '3. Persistent Local Storage')}
            </div>
            <p className="text-[var(--ft-text-muted)]">
              {t(
                lang,
                'تغییرات شما در حافظه مرورگر باقی می‌ماند و هر زمان می‌توانید خروجی JSON بگیرید.',
                'Your changes stay saved locally and can be exported/restored anytime via JSON backup.'
              )}
            </p>
          </div>
        </div>
      </section>

      {/* 1. One-Click App Install (PWA) */}
      <PWAInstallButton
        lang={lang}
        variant="card"
        onInstalledToast={(msg) => onShowToast(msg, 'success')}
      />

      {/* 2. Cloud & Local Backups Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Google Drive Backup */}
        <section className="lg:col-span-7 glass-surface rounded-3xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--ft-border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] flex items-center justify-center shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'پشتیبان‌گیری ابری در Google Drive', 'Google Drive Cloud Backup')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)]">
                  {t(
                    lang,
                    'ذخیره و بازیابی ایمن بکاپ‌ها در پوشه اختصاصی FundTrack Backups در گوگل درایو شما',
                    'Save and restore snapshots inside your dedicated FundTrack Backups Drive folder'
                  )}
                </p>
              </div>
            </div>

            {accessToken && googleUser && (
              <button
                type="button"
                onClick={handleGoogleSignOut}
                className="px-3 py-1.5 rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-danger-soft)] hover:text-[var(--ft-danger)] text-xs font-medium cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t(lang, 'قطع اتصال', 'Disconnect')}</span>
              </button>
            )}
          </div>

          {isFileProtocol ? (
            <div className="p-5 rounded-2xl glass-tile space-y-2 text-xs">
              <div className="font-semibold text-[var(--ft-text-primary)]">
                {t(lang, 'همگام‌سازی گوگل درایو در حالت فایل آفلاین (file://)', 'Google Drive in Offline Single-File Mode')}
              </div>
              <p className="text-[var(--ft-text-muted)] leading-relaxed">
                {t(
                  lang,
                  'مرورگرها برای ورود به حساب گوگل (Popup) نیازمند آدرس وب (http/https) هستند. در نسخه تک‌فایلی آفلاین از «پشتیبان محلی JSON» در کارت کناری استفاده کنید و هر زمان خواستید از نسخه وب به گوگل درایو بکاپ بگیرید.',
                  'Browser security requires an http/https origin for Google Sign-In popups. In offline file:// mode, use Local File Backup (JSON) on the right.'
                )}
              </p>
            </div>
          ) : !accessToken ? (
            <div className="p-5 rounded-2xl glass-tile flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-[var(--ft-text-primary)]">
                  {googleUser
                    ? t(lang, `تأیید مجدد دسترسی برای ${googleUser.email}`, `Reconnect Drive for ${googleUser.email}`)
                    : t(lang, 'اتصال حساب Google Drive', 'Connect your Google Drive')}
                </div>
                <p className="text-xs text-[var(--ft-text-muted)] leading-relaxed">
                  {t(
                    lang,
                    'برنامه فقط به فایل‌های پشتیبان اختصاصی خود دسترسی دارد و به سایر فایل‌های درایو شما وارد نمی‌شود.',
                    'FundTrack only accesses backup files it creates and never reads your other Google Drive files.'
                  )}
                </p>
              </div>

              {/* Official Google Sign-In Button Pattern */}
              <button
                type="button"
                disabled={loadingAuth}
                onClick={handleGoogleSignIn}
                className="gsi-material-button bg-white text-[#1f1f1f] border border-[#747775] rounded-full px-4 h-11 font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-sm hover:bg-[#f8fafd] transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>
                  {loadingAuth
                    ? t(lang, 'در حال اتصال...', 'Connecting...')
                    : t(lang, 'Sign in with Google', 'Sign in with Google')}
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl glass-tile">
                <div className="flex items-center gap-2.5 min-w-0">
                  {googleUser?.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt=""
                      className="w-8 h-8 rounded-full border border-[var(--ft-border)] shrink-0"
                    />
                  ) : (
                    <span className="w-8 h-8 rounded-full ft-accent-gradient flex items-center justify-center text-xs font-bold shrink-0">
                      G
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                      {googleUser?.displayName || t(lang, 'حساب گوگل متصل', 'Google Account')}
                    </div>
                    <div className="text-[11px] font-num text-[var(--ft-text-muted)] truncate">
                      {googleUser?.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={loadingFiles}
                    onClick={() => accessToken && loadDriveFiles(accessToken)}
                    className="p-2 rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer disabled:opacity-50"
                    title={t(lang, 'بروزرسانی لیست درایو', 'Refresh backups')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => setPendingConfirm({ kind: 'upload_drive' })}
                    className="px-4 py-2 rounded-full ft-accent-gradient text-xs font-semibold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>{t(lang, 'ذخیره بکاپ جدید در درایو', 'Backup to Drive')}</span>
                  </button>
                </div>
              </div>

              {/* Drive Backups List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[var(--ft-text-muted)] px-1">
                  <span>{t(lang, 'نسخه‌های پشتیبان ذخیره‌شده در Google Drive', 'Saved Google Drive Snapshots')}</span>
                  <span className="font-num">{driveFiles.length}</span>
                </div>

                {loadingFiles ? (
                  <div className="p-6 rounded-2xl glass-tile text-center text-xs text-[var(--ft-text-muted)]">
                    {t(lang, 'در حال بارگذاری نسخه‌های پشتیبان از Google Drive...', 'Loading Google Drive backups...')}
                  </div>
                ) : driveFiles.length === 0 ? (
                  <div className="p-6 rounded-2xl glass-tile text-center text-xs text-[var(--ft-text-muted)]">
                    {t(
                      lang,
                      'هنوز هیچ نسخه پشتیبانی در Google Drive ذخیره نشده است. دکمه «ذخیره بکاپ جدید» را بزنید.',
                      'No backups in Google Drive yet. Click "Backup to Drive" to create your first snapshot.'
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                    {driveFiles.map((file) => (
                      <div
                        key={file.id}
                        className="p-3 rounded-2xl glass-tile flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileJson className="w-4 h-4 text-[var(--ft-accent)] shrink-0" />
                          <div className="min-w-0">
                            <div className="font-num text-xs font-semibold text-[var(--ft-text-primary)] truncate">
                              {file.name}
                            </div>
                            <div className="text-[11px] font-num text-[var(--ft-text-muted)]">
                              {formatJalaliDateTime(file.modifiedTime, lang)} · {formatFileSize(file.size)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => handlePrepareDriveRestore(file)}
                            className="px-3 py-1.5 rounded-full bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] hover:opacity-90 text-xs font-semibold cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{t(lang, 'بازیابی', 'Restore')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => setPendingConfirm({ kind: 'delete_drive', file })}
                            className="p-1.5 rounded-full hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer transition-colors"
                            title={t(lang, 'حذف از گوگل درایو', 'Delete from Drive')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Local File Backup & Status */}
        <section className="lg:col-span-5 glass-surface rounded-3xl p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-[var(--ft-border)]">
              <div className="w-10 h-10 rounded-2xl bg-[var(--ft-positive-soft)] text-[var(--ft-positive)] flex items-center justify-center shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(lang, 'پشتیبان محلی (فایل JSON)', 'Local File Backup (JSON)')}
                </h3>
                <p className="text-xs text-[var(--ft-text-muted)]">
                  {t(lang, 'خروجی کامل یا بازگردانی فوری بدون نیاز به اینترنت', 'Instant offline export and restore')}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl glass-tile space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ft-text-muted)]">{t(lang, 'آخرین پشتیبان‌گیری:', 'Last Backup:')}</span>
                <span className="font-num font-semibold text-[var(--ft-text-primary)]">
                  {s.lastBackupAt
                    ? formatJalaliDateTime(s.lastBackupAt, lang)
                    : t(lang, 'ثبت نشده', 'Never')}
                </span>
              </div>
              {s.lastBackupTarget && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ft-text-muted)]">{t(lang, 'مقصد:', 'Destination:')}</span>
                  <span className="font-semibold text-[var(--ft-accent)]">
                    {s.lastBackupTarget === 'gdrive'
                      ? 'Google Drive'
                      : t(lang, 'فایل محلی (.json)', 'Local File (.json)')}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-[var(--ft-border)] font-num text-[11px] text-[var(--ft-text-muted)]">
                <span>Trades: {state.trades.length}</span>
                <span>Txns: {state.transactions.length}</span>
                <span>Goals: {state.goals.length}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 pt-2">
            <button
              type="button"
              onClick={handleLocalDownload}
              className="w-full px-4 py-3 rounded-2xl ft-accent-gradient text-xs sm:text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <Download className="w-4 h-4" />
              <span>{t(lang, 'دانلود فایل پشتیبان (JSON)', 'Download Backup (.json)')}</span>
            </button>

            <label className="w-full px-4 py-3 rounded-2xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)] cursor-pointer flex items-center justify-center gap-2 transition-colors">
              <Upload className="w-4 h-4 text-[var(--ft-accent)]" />
              <span>{t(lang, 'بازیابی از فایل محلی', 'Restore from Local File')}</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleLocalFilePick}
                className="hidden"
              />
            </label>
          </div>
        </section>
      </div>

      {/* Mandatory Explicit Confirmation Modal for Drive Upload / Delete / Restore */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl glass-surface-high p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--ft-text-primary)]">
                {pendingConfirm.kind === 'upload_drive' &&
                  t(lang, 'تأیید ذخیره در Google Drive', 'Confirm Google Drive Backup')}
                {pendingConfirm.kind === 'delete_drive' &&
                  t(lang, 'تأیید حذف فایل از Google Drive', 'Confirm Google Drive Deletion')}
                {(pendingConfirm.kind === 'restore_drive' || pendingConfirm.kind === 'restore_local') &&
                  t(lang, 'تأیید بازیابی نسخه پشتیبان', 'Confirm Data Restore')}
              </h3>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setPendingConfirm(null)}
                className="p-1.5 rounded-full hover:bg-[var(--ft-surface-hover)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pendingConfirm.kind === 'upload_drive' && (
              <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
                {t(
                  lang,
                  `آیا تأیید می‌کنید یک فایل پشتیبان جدید شامل ${state.trades.length} معامله، ${state.transactions.length} تراکنش، ${state.bankAccounts.length} حساب بانکی و ${state.goals.length} هدف در پوشه «FundTrack Backups» گوگل درایو ذخیره شود؟`,
                  `Create a new snapshot containing ${state.trades.length} trades, ${state.transactions.length} transactions, ${state.bankAccounts.length} bank accounts, and ${state.goals.length} goals inside "FundTrack Backups" on Google Drive?`
                )}
              </p>
            )}

            {pendingConfirm.kind === 'delete_drive' && (
              <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
                {t(
                  lang,
                  `آیا مطمئن هستید که می‌خواهید فایل پشتیبان «${pendingConfirm.file.name}» را برای همیشه از Google Drive حذف کنید؟ این عملیات قابل بازگشت نیست.`,
                  `Are you sure you want to permanently delete "${pendingConfirm.file.name}" from Google Drive? This action cannot be undone.`
                )}
              </p>
            )}

            {(pendingConfirm.kind === 'restore_drive' || pendingConfirm.kind === 'restore_local') && (
              <div className="space-y-3">
                <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
                  {t(
                    lang,
                    `با بازیابی «${
                      pendingConfirm.kind === 'restore_drive'
                        ? pendingConfirm.file.name
                        : pendingConfirm.fileName
                    }»، داده‌های فعلی پنل جایگزین این نسخه می‌شود:`,
                    `Restoring "${
                      pendingConfirm.kind === 'restore_drive'
                        ? pendingConfirm.file.name
                        : pendingConfirm.fileName
                    }" will replace your current panel data with:`
                  )}
                </p>
                <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl glass-tile text-[11px] font-num">
                  <span>Trades: {pendingConfirm.stats.trades}</span>
                  <span>Txns: {pendingConfirm.stats.transactions}</span>
                  <span>Banks: {pendingConfirm.stats.bankAccounts}</span>
                  <span>MT5: {pendingConfirm.stats.mt5Accounts}</span>
                  <span>Goals: {pendingConfirm.stats.goals}</span>
                  <span>Loans: {pendingConfirm.stats.loans}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={executeConfirmedAction}
                className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer ${
                  pendingConfirm.kind === 'delete_drive'
                    ? 'bg-[var(--ft-danger)] text-white'
                    : 'ft-accent-gradient'
                }`}
              >
                {busyAction
                  ? t(lang, 'در حال اجرا...', 'Processing...')
                  : pendingConfirm.kind === 'delete_drive'
                  ? t(lang, 'تأیید و حذف دائمی', 'Confirm Delete')
                  : pendingConfirm.kind === 'upload_drive'
                  ? t(lang, 'تأیید و ذخیره در درایو', 'Confirm Upload')
                  : t(lang, 'تأیید و جایگزینی داده‌ها', 'Confirm Restore')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
