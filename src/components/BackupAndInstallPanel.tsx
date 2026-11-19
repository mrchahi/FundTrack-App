import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  CloudUpload,
  Copy,
  Download,
  FileCode2,
  FileJson,
  HardDrive,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Network,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { AppLanguage, FundTrackState } from '../types';
import { t } from '../i18n/translations';
import { formatJalaliDateTime } from '../utils/jalali';
import {
  deleteDriveBackup,
  downloadDriveBackupRaw,
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
import {
  buildMobilePairingUrl,
  buildSyncEnvelope,
  checkHybridSyncSource,
  decodeSyncEnvelope,
  fetchHostPairingKey,
  fetchLanSyncInfo,
  LanSyncServerInfo,
  pullStateFromLanDb,
  pushStateHybrid,
  pushStateToLanDb,
  rotateHostPairingKey,
} from '../utils/lanSync';
import { isEncryptedSyncEnvelope } from '../utils/security';
import { GlassSwitch } from './GlassControls';
import { MaterialInput } from './MaterialInputs';
import { PWAInstallButton } from './PWAInstallButton';

interface BackupAndInstallPanelProps {
  state: FundTrackState;
  onUpdateSettings: (patch: Partial<FundTrackState['settings']>) => void;
  onRestoreState: (restored: FundTrackState, target: 'local' | 'gdrive' | 'lan') => void;
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
    }
  | {
      kind: 'restore_lan';
      channel: 'lan' | 'gdrive';
      sourceLabel: string;
      revision?: number;
      parsedState: FundTrackState;
      stats: ReturnType<typeof parseAndValidateBackup>['stats'];
    }
  | {
      kind: 'push_hybrid';
      targetChannel: 'lan' | 'gdrive';
    };

interface PendingDecryptRequest {
  source: 'local' | 'gdrive' | 'lan';
  raw: unknown;
  file?: DriveBackupFile;
  fileName?: string;
  revision?: number;
  updatedAt?: string;
}

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
  const [downloadingAndroid, setDownloadingAndroid] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmation | null>(null);

  // Hybrid LAN DB + E2E Security States (Passphrase held strictly in memory)
  const [lanInfo, setLanInfo] = useState<LanSyncServerInfo | null>(null);
  const [checkingLan, setCheckingLan] = useState(false);
  const [syncingLan, setSyncingLan] = useState(false);
  const [e2ePassphrase, setE2ePassphrase] = useState('');
  const [pendingDecrypt, setPendingDecrypt] = useState<PendingDecryptRequest | null>(null);
  const [decryptInput, setDecryptInput] = useState('');
  const [decryptError, setDecryptError] = useState('');

  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

  const checkLanStatus = useCallback(
    async (customUrl?: string) => {
      setCheckingLan(true);
      try {
        const info = await fetchLanSyncInfo(customUrl ?? s.lanSyncUrl);
        setLanInfo(info);
        return info;
      } finally {
        setCheckingLan(false);
      }
    },
    [s.lanSyncUrl]
  );

  useEffect(() => {
    void checkLanStatus();
  }, [checkLanStatus]);

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

  const handleDownloadAndroidProject = async () => {
    setDownloadingAndroid(true);
    try {
      const preferredUrl =
        s.lanSyncUrl?.trim() ||
        lanInfo?.lanUrls?.[0] ||
        (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)
          ? window.location.origin
          : 'http://192.168.1.100:3000');

      const res = await fetch(
        `/api/export-android-project?lanUrl=${encodeURIComponent(preferredUrl)}`
      );
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'FundTrack-Android-App.tar.gz';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast(
        t(
          lang,
          'سورس کامل پروژه اندروید (Android Studio + Gradle + اسکریپت APK) دانلود شد.',
          'Standalone Android Studio project exported successfully.'
        ),
        'success'
      );
    } catch {
      onShowToast(
        t(lang, 'خطا در دانلود پروژه اندروید', 'Failed to download Android Studio package'),
        'error'
      );
    } finally {
      setDownloadingAndroid(false);
    }
  };

  const openConfirmationForDecoded = (
    source: 'local' | 'gdrive' | 'lan',
    decoded: {
      state: FundTrackState;
      stats: ReturnType<typeof parseAndValidateBackup>['stats'];
      revision?: number;
    },
    extra?: { file?: DriveBackupFile; fileName?: string; channel?: 'lan' | 'gdrive' }
  ) => {
    if (source === 'local') {
      setPendingConfirm({
        kind: 'restore_local',
        fileName: extra?.fileName || 'backup.json',
        parsedState: decoded.state,
        stats: decoded.stats,
      });
    } else if (source === 'gdrive' && extra?.file) {
      setPendingConfirm({
        kind: 'restore_drive',
        file: extra.file,
        parsedState: decoded.state,
        stats: decoded.stats,
      });
    } else {
      const ch = extra?.channel ?? 'lan';
      setPendingConfirm({
        kind: 'restore_lan',
        channel: ch,
        sourceLabel:
          ch === 'lan'
            ? t(lang, 'دیتابیس محلی شبکه داخلی (LAN)', 'LAN Local Database')
            : t(lang, 'پشتیبان ابری گوگل درایو (Fallback)', 'Google Drive Cloud Fallback'),
        revision: decoded.revision,
        parsedState: decoded.state,
        stats: decoded.stats,
      });
    }
  };

  const handleLocalFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = JSON.parse(String(reader.result || '{}'));
        if (isEncryptedSyncEnvelope(raw)) {
          if (e2ePassphrase.trim().length >= 4) {
            try {
              const decoded = await decodeSyncEnvelope(raw, e2ePassphrase.trim());
              openConfirmationForDecoded('local', decoded, { fileName: file.name });
              return;
            } catch {
              // Fall through to passphrase prompt modal
            }
          }
          setDecryptInput('');
          setDecryptError('');
          setPendingDecrypt({ source: 'local', raw, fileName: file.name });
          return;
        }
        const parsed = parseAndValidateBackup(raw);
        openConfirmationForDecoded('local', parsed, { fileName: file.name });
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
      const raw = await downloadDriveBackupRaw(accessToken, file.id);
      if (isEncryptedSyncEnvelope(raw)) {
        if (e2ePassphrase.trim().length >= 4) {
          try {
            const decoded = await decodeSyncEnvelope(raw, e2ePassphrase.trim());
            openConfirmationForDecoded('gdrive', decoded, { file });
            return;
          } catch {
            // Ask user for matching passphrase
          }
        }
        setDecryptInput('');
        setDecryptError('');
        setPendingDecrypt({ source: 'gdrive', raw, file });
        return;
      }
      const parsed = parseAndValidateBackup(raw);
      openConfirmationForDecoded('gdrive', parsed, { file });
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

  const handleFetchHostKey = async () => {
    const key = await fetchHostPairingKey(s.lanSyncUrl);
    if (key) {
      onUpdateSettings({ lanSyncKey: key, lanSyncEnabled: true });
      onShowToast(
        t(lang, 'کلید جفت‌سازی امن از میزبان لوکال دریافت و ثبت شد', 'Host LAN sync key retrieved cleanly'),
        'success'
      );
    } else {
      onShowToast(
        t(
          lang,
          'دریافت خودکار کلید فقط از مرورگر میزبان (localhost) مجاز است؛ از روی گوشی کلید میزبان را دستی وارد کنید.',
          'Auto key read is restricted to localhost host browser; paste host key manually on mobile.'
        ),
        'info'
      );
    }
  };

  const handleRotateHostKey = async () => {
    const newKey = await rotateHostPairingKey(s.lanSyncUrl, s.lanSyncKey);
    if (newKey) {
      onUpdateSettings({ lanSyncKey: newKey, lanSyncEnabled: true });
      onShowToast(
        t(lang, 'کلید امنیتی LAN بازتولید شد — دستگاه‌های دیگر را با کلید جدید بروزرسانی کنید.', 'LAN sync key rotated. Update paired devices.'),
        'success'
      );
    } else {
      onShowToast(
        t(lang, 'بازتولید کلید ناموفق بود (کلید فعلی یا دسترسی میزبان لازم است)', 'Failed to rotate LAN key'),
        'error'
      );
    }
  };

  const handleCopyMobilePairingLink = async () => {
    setSyncingLan(true);
    try {
      let activeKey = s.lanSyncKey?.trim() || '';
      if (!activeKey) {
        activeKey = (await fetchHostPairingKey(s.lanSyncUrl)) || '';
      }
      if (!activeKey) {
        onShowToast(
          t(
            lang,
            'ابتدا کلید همگام‌سازی میزبان را دریافت یا وارد کنید.',
            'Please retrieve or enter the host pairing key first.'
          ),
          'error'
        );
        return;
      }

      const currentOrigin =
        typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)
          ? window.location.origin
          : '';
      const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(currentOrigin);
      const targetUrl =
        s.lanSyncUrl?.trim() ||
        (isLocalOrigin ? lanInfo?.lanUrls?.[0] || currentOrigin : currentOrigin);

      onUpdateSettings({
        lanSyncKey: activeKey,
        lanSyncUrl: targetUrl,
        lanSyncEnabled: true,
      });

      // Push real current state to server DB immediately if no E2E lock blocks auto-push
      if (!s.e2eEncryptionEnabled || e2ePassphrase.trim().length >= 4) {
        try {
          const pushed = await pushStateToLanDb(state, {
            url: targetUrl,
            syncKey: activeKey,
            e2ePassphrase: e2ePassphrase.trim() || undefined,
          });
          onUpdateSettings({
            lanSyncKey: activeKey,
            lanSyncUrl: targetUrl,
            lanSyncEnabled: true,
            lastLanSyncAt: pushed.updatedAt,
            lastSyncMode: 'lan',
            stateRevision: pushed.revision,
            stateUpdatedAt: pushed.updatedAt,
          });
          void checkLanStatus(targetUrl);
        } catch {
          // Link can still be copied even if remote host wasn't reachable right now
        }
      }

      const pairingUrl = buildMobilePairingUrl(targetUrl, activeKey);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pairingUrl);
      }
      onShowToast(
        t(
          lang,
          'همگام‌سازی فعال و لینک اختصاصی ورود موبایل کپی شد! لینک را در مرورگر گوشی باز کنید.',
          'Auto-sync enabled & 1-click mobile pairing link copied! Open it on your phone.'
        ),
        'success'
      );
    } finally {
      setSyncingLan(false);
    }
  };

  const handleSmartHybridPull = async () => {
    setSyncingLan(true);
    try {
      const check = await checkHybridSyncSource(s.lanSyncUrl);
      if (check.channel === 'lan') {
        setLanInfo(check.info);
        if (!check.info.hasData) {
          onShowToast(
            t(
              lang,
              'دیتابیس سرور LAN هنوز خالی است؛ ابتدا از گزینه «ارسال همگام‌سازی» داده‌ها را ذخیره کنید.',
              'LAN database is currently empty. Push your current state first.'
            ),
            'info'
          );
          return;
        }
        if (!s.lanSyncKey?.trim()) {
          onShowToast(
            t(lang, 'برای دریافت از دیتابیس LAN ابتدا کلید جفت‌سازی را وارد یا دریافت کنید.', 'Enter or retrieve LAN sync key first.'),
            'error'
          );
          return;
        }
        try {
          const decoded = await pullStateFromLanDb({
            url: s.lanSyncUrl,
            syncKey: s.lanSyncKey,
            e2ePassphrase: e2ePassphrase.trim() || undefined,
          });
          openConfirmationForDecoded('lan', decoded, { channel: 'lan' });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : '';
          if (msg === 'PASSPHRASE_REQUIRED' || msg === 'DECRYPTION_FAILED') {
            // Re-fetch raw payload via endpoint to display unlock dialog
            const base = (s.lanSyncUrl || window.location.origin).replace(/\/+$/, '');
            const rawRes = await fetch(`${base}/api/sync/state`, {
              headers: { 'X-FundTrack-Sync-Key': s.lanSyncKey.trim() },
            });
            const rawJson = (await rawRes.json()) as {
              payload?: unknown;
              revision?: number;
              updatedAt?: string;
            };
            setDecryptInput('');
            setDecryptError(msg === 'DECRYPTION_FAILED' ? t(lang, 'عبارت رمزنگاری اشتباه است', 'Wrong decryption passphrase') : '');
            setPendingDecrypt({
              source: 'lan',
              raw: rawJson.payload,
              revision: rawJson.revision,
              updatedAt: rawJson.updatedAt,
            });
          } else {
            throw err;
          }
        }
        return;
      }

      if (check.channel === 'gdrive') {
        if (!check.rawJson) {
          onShowToast(
            t(lang, 'سرور LAN در دسترس نبود و هیچ بکاپی در Google Drive یافت نشد.', 'Off-LAN and no snapshot found in Google Drive.'),
            'info'
          );
          return;
        }
        if (isEncryptedSyncEnvelope(check.rawJson)) {
          if (e2ePassphrase.trim().length >= 4) {
            try {
              const decoded = await decodeSyncEnvelope(check.rawJson, e2ePassphrase.trim());
              openConfirmationForDecoded('lan', decoded, { channel: 'gdrive' });
              return;
            } catch {
              // Ask user for passphrase
            }
          }
          setDecryptInput('');
          setDecryptError('');
          setPendingDecrypt({ source: 'lan', raw: check.rawJson });
          return;
        }
        const parsed = parseAndValidateBackup(check.rawJson);
        openConfirmationForDecoded('lan', parsed, { channel: 'gdrive' });
        return;
      }

      if (check.channel === 'gdrive_auth_needed') {
        onShowToast(
          t(
            lang,
            'خارج از شبکه داخلی هستید؛ برای دریافت آپدیت از گوگل درایو، ابتدا حساب گوگل را متصل کنید.',
            'Off-LAN: connect your Google Drive account below to pull cloud fallback sync.'
          ),
          'info'
        );
        return;
      }

      onShowToast(
        t(lang, 'سرور LAN و اینترنت هر دو در دسترس نیستند (حالت آفلاین).', 'Neither LAN server nor internet is reachable.'),
        'error'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      onShowToast(
        msg.includes('UNAUTHORIZED')
          ? t(lang, 'کلید امنیتی LAN نامعتبر است', 'Invalid LAN sync key')
          : t(lang, 'خطا در همگام‌سازی و دریافت اطلاعات', 'Hybrid sync pull failed'),
        'error'
      );
    } finally {
      setSyncingLan(false);
    }
  };

  const handlePrepareHybridPush = async () => {
    if (s.e2eEncryptionEnabled && e2ePassphrase.trim().length < 4) {
      onShowToast(
        t(
          lang,
          'رمزنگاری سرتاسری (E2E) روشن است؛ ابتدا عبارت رمز (حداقل ۴ کاراکتر) را وارد کنید.',
          'E2E encryption is enabled; enter a passphrase (min 4 chars) first.'
        ),
        'error'
      );
      return;
    }
    const info = await checkLanStatus();
    if (info.reachable && s.lanSyncKey?.trim()) {
      setPendingConfirm({ kind: 'push_hybrid', targetChannel: 'lan' });
      return;
    }
    if (s.lanAutoFallbackDrive !== false && accessToken) {
      setPendingConfirm({ kind: 'push_hybrid', targetChannel: 'gdrive' });
      return;
    }
    if (info.reachable && !s.lanSyncKey?.trim()) {
      onShowToast(
        t(lang, 'سرور LAN آنلاین است؛ ابتدا کلید امنیتی میزبان را وارد یا دریافت کنید.', 'LAN server reachable — please set your pairing key first.'),
        'error'
      );
      return;
    }
    onShowToast(
      t(lang, 'سرور LAN در دسترس نیست و حساب گوگل درایو نیز متصل نشده است.', 'LAN server unreachable and Google Drive is not connected.'),
      'error'
    );
  };

  const handleConfirmDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingDecrypt) return;
    try {
      const decoded = await decodeSyncEnvelope(pendingDecrypt.raw, decryptInput.trim(), {
        revision: pendingDecrypt.revision,
        updatedAt: pendingDecrypt.updatedAt,
      });
      setE2ePassphrase(decryptInput.trim());
      setPendingDecrypt(null);
      setDecryptInput('');
      setDecryptError('');
      openConfirmationForDecoded(pendingDecrypt.source, decoded, {
        file: pendingDecrypt.file,
        fileName: pendingDecrypt.fileName,
        channel: pendingDecrypt.source === 'lan' ? 'lan' : undefined,
      });
    } catch {
      setDecryptError(t(lang, 'عبارت رمزنگاری اشتباه است یا داده معتبر نیست.', 'Incorrect decryption passphrase.'));
    }
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm) return;
    setBusyAction(true);
    try {
      if (pendingConfirm.kind === 'upload_drive') {
        if (!accessToken) return;
        let customEnvelope: unknown;
        if (s.e2eEncryptionEnabled) {
          if (e2ePassphrase.trim().length < 4) {
            onShowToast(
              t(lang, 'برای بکاپ رمزنگاری‌شده، عبارت E2E را در بخش امنیت همگام‌سازی وارد کنید.', 'Enter your E2E passphrase in the Sync Security card first.'),
              'error'
            );
            setBusyAction(false);
            return;
          }
          const built = await buildSyncEnvelope(state, e2ePassphrase.trim());
          customEnvelope = built.payload;
        }
        const created = await uploadDriveBackup(accessToken, state, customEnvelope);
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
      } else if (pendingConfirm.kind === 'restore_lan') {
        onRestoreState(
          pendingConfirm.parsedState,
          pendingConfirm.channel === 'lan' ? 'lan' : 'gdrive'
        );
        onShowToast(
          pendingConfirm.channel === 'lan'
            ? t(lang, 'داده‌ها از دیتابیس شبکه داخلی (LAN) همگام‌سازی شدند', 'Synced from LAN local database')
            : t(lang, 'داده‌ها از نسخه پشتیبان Google Drive دریافت و جایگزین شدند', 'Synced from Google Drive cloud fallback'),
          'success'
        );
      } else if (pendingConfirm.kind === 'push_hybrid') {
        const res = await pushStateHybrid(state, {
          url: s.lanSyncUrl,
          syncKey: s.lanSyncKey,
          e2ePassphrase: e2ePassphrase.trim() || undefined,
          allowDriveFallback: s.lanAutoFallbackDrive !== false,
        });
        onUpdateSettings({
          lastLanSyncAt: res.updatedAt,
          lastSyncMode: res.channel,
          stateUpdatedAt: res.updatedAt,
          stateRevision: res.revision ?? (s.stateRevision ?? 0) + 1,
          lastBackupAt: res.updatedAt,
          lastBackupTarget: res.channel === 'lan' ? 'lan' : 'gdrive',
        });
        void checkLanStatus();
        onShowToast(
          res.channel === 'lan'
            ? t(
                lang,
                `وضعیت فعلی با موفقیت در دیتابیس LAN ذخیره شد (نسخه ${res.revision}${res.encrypted ? ' · رمزنگاری E2E' : ''})`,
                `Pushed to LAN DB cleanly (Rev ${res.revision}${res.encrypted ? ' · E2E Encrypted' : ''})`
              )
            : t(
                lang,
                `خارج از شبکه داخلی — بکاپ همگام‌سازی خودکار در Google Drive ذخیره شد`,
                `Off-LAN — snapshot automatically uploaded to Google Drive`
              ),
          'success'
        );
      }
      setPendingConfirm(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'AUTH_EXPIRED' || message === 'DRIVE_AUTH_REQUIRED') {
        setAccessToken(null);
        onShowToast(
          t(lang, 'نشست گوگل درایو منقضی یا قطع است؛ لطفاً دوباره متصل شوید.', 'Google Drive session expired. Please reconnect.'),
          'error'
        );
      } else {
        onShowToast(
          t(lang, 'عملیات پشتیبان‌گیری یا همگام‌سازی با خطا مواجه شد', 'Backup / Sync operation failed'),
          'error'
        );
      }
    } finally {
      setBusyAction(false);
    }
  };

  const detectedLanUrl =
    lanInfo?.lanUrls?.[0] ||
    (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)
      ? window.location.origin
      : 'http://192.168.1.100:3000');

  return (
    <div className="space-y-6">
      {/* 0. Hybrid LAN Local Database + Google Drive Fallback & E2E Security */}
      <section className="glass-surface rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl ft-accent-gradient flex items-center justify-center shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                  {t(
                    lang,
                    'دیتابیس لوکال شبکه داخلی (LAN) + آپدیت خودکار Google Drive و رمزنگاری E2E',
                    'Hybrid LAN Local Database + Google Drive Fallback & E2E Security'
                  )}
                </h3>
                {lanInfo?.reachable ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-[var(--ft-positive-soft)] text-[var(--ft-positive)] text-[11px] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {t(lang, `LAN متصل (Rev ${lanInfo.revision})`, `LAN Connected (Rev ${lanInfo.revision})`)}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-[var(--ft-warning-soft)] text-[var(--ft-warning)] text-[11px] font-semibold flex items-center gap-1">
                    <WifiOff className="w-3 h-3" />
                    {t(lang, 'خارج از شبکه داخلی — مسیر Drive فعال', 'Off-LAN — Cloud Fallback Ready')}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--ft-text-muted)] mt-1 leading-relaxed">
                {t(
                  lang,
                  'در شبکه داخلی (خانه/دفتر) داده‌ها با سرعت بالا و بدون اینترنت روی دیتابیس لوکال میزبان سینک می‌شوند؛ در صورت خروج از شبکه، آپدیت به‌صورت خودکار از Google Drive انجام می‌گیرد.',
                  'When on local Wi-Fi/LAN, devices sync directly with your host database. When outside the LAN, syncing falls back automatically to Google Drive.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={checkingLan}
              onClick={() => void checkLanStatus()}
              className="px-3.5 py-2 min-h-[44px] rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingLan ? 'animate-spin' : ''}`} />
              <span>{t(lang, 'بررسی شبکه', 'Check LAN')}</span>
            </button>
          </div>
        </div>

        {/* Detected Host LAN URLs */}
        {lanInfo?.lanUrls && lanInfo.lanUrls.length > 0 && (
          <div className="p-3.5 rounded-2xl glass-tile flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--ft-text-secondary)]">
              {t(lang, 'آدرس‌های قابل دسترس این سیستم در شبکه داخلی:', 'Host LAN Addresses for Mobile / Android App:')}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {lanInfo.lanUrls.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => {
                    onUpdateSettings({ lanSyncUrl: url });
                    onShowToast(t(lang, `آدرس ${url} انتخاب شد`, `Target LAN URL set to ${url}`), 'info');
                  }}
                  className="px-2.5 py-1 rounded-full bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] font-num text-[11px] font-semibold hover:opacity-85 cursor-pointer"
                >
                  {url}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <MaterialInput
              ltrNum
              label={t(lang, 'آدرس سرور شبکه داخلی (LAN Host URL)', 'LAN Sync Server URL')}
              placeholder={detectedLanUrl}
              value={s.lanSyncUrl ?? ''}
              onChange={(e) => onUpdateSettings({ lanSyncUrl: e.target.value })}
            />
            <p className="text-[11px] text-[var(--ft-text-muted)] px-1">
              {t(
                lang,
                'اگر از گوشی یا اپلیکیشن اندروید متصل می‌شوید، IP سیستم دسکتاپ را وارد کنید (مثال: http://192.168.1.10:3000).',
                'On phone or Android app, enter desktop LAN IP (e.g. http://192.168.1.10:3000).'
              )}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <MaterialInput
                  type="password"
                  ltrNum
                  label={t(lang, 'کلید احراز هویت شبکه (Pairing Key)', 'LAN Pairing Sync Key')}
                  placeholder={t(lang, 'کلید امنیتی سرور میزبان...', 'Host pairing key...')}
                  value={s.lanSyncKey ?? ''}
                  onChange={(e) => onUpdateSettings({ lanSyncKey: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={handleFetchHostKey}
                title={t(lang, 'دریافت کلید از همین میزبان (فقط روی localhost)', 'Fetch key from localhost host')}
                className="h-[46px] px-3 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <KeyRound className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
                <span className="hidden sm:inline">{t(lang, 'دریافت کلید', 'Get Host Key')}</span>
              </button>
              <button
                type="button"
                onClick={handleRotateHostKey}
                title={t(lang, 'چرخاندن کلید امنیتی (Rotate Key)', 'Rotate Security Key')}
                className="h-[46px] px-3 rounded-xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer flex items-center gap-1 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[var(--ft-warning)]" />
              </button>
            </div>
            <p className="text-[11px] text-[var(--ft-text-muted)] px-1">
              {t(
                lang,
                'هر درخواست با مقایسه زمانی ثابت (Timing-Safe Header) بررسی می‌شود تا هیچ دستگاه متفرقه در وای‌فای دسترسی نداشته باشد.',
                'Protected with X-FundTrack-Sync-Key + timing-safe validation on host.'
              )}
            </p>
          </div>
        </div>

        {/* E2E Encryption & Drive Auto-Fallback Security Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
          <div className="p-4 rounded-2xl glass-tile space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[var(--ft-positive)] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'رمزنگاری سرتاسری پیش از ذخیره (AES-256-GCM)', 'End-to-End Encryption (AES-256-GCM)')}
                  </div>
                  <div className="text-[11px] text-[var(--ft-text-muted)]">
                    {t(
                      lang,
                      'داده‌ها قبل از ارسال به LAN DB یا گوگل درایو روی دستگاه شما با PBKDF2-SHA256 قفل می‌شوند (کلید در حافظه رم می‌ماند و ذخیره نمی‌شود).',
                      'Encrypts backups client-side using PBKDF2-SHA256 before leaving the device. Passphrase is held in RAM only.'
                    )}
                  </div>
                </div>
              </div>
              <GlassSwitch
                checked={Boolean(s.e2eEncryptionEnabled)}
                onChange={(checked) => onUpdateSettings({ e2eEncryptionEnabled: checked })}
                ariaLabel="E2E Sync Encryption"
              />
            </div>

            {s.e2eEncryptionEnabled && (
              <MaterialInput
                type="password"
                ltrNum
                label={t(lang, 'عبارت رمز سرتاسری (فقط در حافظه جلسه فعلی)', 'E2E Passphrase (Session RAM Only)')}
                placeholder={t(lang, 'حداقل ۴ کاراکتر...', 'Min 4 characters...')}
                value={e2ePassphrase}
                onChange={(e) => setE2ePassphrase(e.target.value)}
                warning={
                  e2ePassphrase.length > 0 && e2ePassphrase.length < 4
                    ? t(lang, 'حداقل ۴ کاراکتر وارد کنید', 'At least 4 characters required')
                    : undefined
                }
                success={
                  e2ePassphrase.length >= 4
                    ? t(lang, 'رمزنگاری AES-256 آماده است', 'AES-256 encryption active for sync')
                    : undefined
                }
              />
            )}
          </div>

          <div className="p-4 rounded-2xl glass-tile flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Cloud className="w-4 h-4 text-[var(--ft-accent)] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)]">
                    {t(lang, 'مسیر خودکار Google Drive هنگام خروج از LAN', 'Automatic Google Drive Off-LAN Fallback')}
                  </div>
                  <div className="text-[11px] text-[var(--ft-text-muted)]">
                    {t(
                      lang,
                      'وقتی بیرون از شبکه داخلی هستید، دکمه همگام‌سازی به‌صورت خودکار آخرین نسخه رمزنگاری‌شده را از درایو می‌گیرد یا آپلود می‌کند.',
                      'When LAN host is unreachable, smart sync seamlessly pulls/pushes from Google Drive.'
                    )}
                  </div>
                </div>
              </div>
              <GlassSwitch
                checked={s.lanAutoFallbackDrive !== false}
                onChange={(checked) => onUpdateSettings({ lanAutoFallbackDrive: checked })}
                ariaLabel="Google Drive Auto Fallback"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--ft-border)] text-[11px] font-num text-[var(--ft-text-muted)]">
              <span>
                {t(lang, 'آخرین همگام‌سازی:', 'Last Sync:')}{' '}
                {s.lastLanSyncAt ? formatJalaliDateTime(s.lastLanSyncAt, lang) : t(lang, 'انجام نشده', 'Never')}
              </span>
              {s.lastSyncMode && (
                <span className="px-2 py-0.5 rounded-full bg-[var(--ft-surface-subtle)] text-[var(--ft-text-primary)]">
                  {s.lastSyncMode.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl glass-tile flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)]">
              {t(lang, 'همگام‌سازی زنده خودکار بین دستگاه‌ها (Auto-Sync)', 'Automatic Live Multi-Device Sync')}
            </div>
            <div className="text-[11px] text-[var(--ft-text-muted)]">
              {t(
                lang,
                'با روشن بودن این گزینه، تغییرات دسکتاپ به‌طور خودکار ذخیره شده و موبایل هنگام باز شدن آخرین داده‌های واقعی را دریافت می‌کند.',
                'When enabled, changes push automatically and mobile pulls real data on open/focus.'
              )}
            </div>
          </div>
          <GlassSwitch
            checked={Boolean(s.lanSyncEnabled)}
            onChange={(checked) => onUpdateSettings({ lanSyncEnabled: checked })}
            ariaLabel="Auto Live Sync"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={syncingLan || busyAction}
            onClick={() => void handleCopyMobilePairingLink()}
            className="px-4 py-2.5 min-h-[44px] rounded-full ft-accent-gradient text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-2 disabled:opacity-60"
          >
            <Link2 className="w-4 h-4" />
            <span>{t(lang, 'فعال‌سازی و کپی لینک اتصال موبایل', 'Sync & Copy Mobile Pairing Link')}</span>
            <Copy className="w-3.5 h-3.5 opacity-80" />
          </button>

          <button
            type="button"
            disabled={syncingLan || busyAction}
            onClick={() => void handleSmartHybridPull()}
            className="px-4 py-2.5 min-h-[44px] rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)] cursor-pointer flex items-center gap-2 disabled:opacity-60"
          >
            <Download className="w-4 h-4 text-[var(--ft-accent)]" />
            <span>
              {syncingLan
                ? t(lang, 'در حال بررسی و دریافت...', 'Checking LAN & Drive...')
                : t(lang, 'دریافت هوشمند (LAN ⟵ Drive Fallback)', 'Smart Pull (LAN ⟵ Drive)')}
            </span>
          </button>

          <button
            type="button"
            disabled={syncingLan || busyAction}
            onClick={() => void handlePrepareHybridPush()}
            className="px-4 py-2.5 min-h-[44px] rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)] cursor-pointer flex items-center gap-2 disabled:opacity-60"
          >
            <Upload className="w-4 h-4 text-[var(--ft-accent)]" />
            <span>{t(lang, 'ارسال وضعیت فعلی (LAN یا Drive)', 'Push State (LAN / Drive)')}</span>
          </button>
        </div>
      </section>

      {/* 1. Standalone Android Studio Native Wrapper Export */}
      <section className="glass-surface rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[var(--ft-positive-soft)] text-[var(--ft-positive)] flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
                {t(
                  lang,
                  'اپلیکیشن اندروید (نصب فوری روی گوشی + سورس پروژه Android Studio برای APK)',
                  'Android App (Instant Phone Install + Android Studio APK Source)'
                )}
              </h3>
              <p className="text-xs text-[var(--ft-text-muted)] mt-1 leading-relaxed">
                {t(
                  lang,
                  'برای نصب فوری بدون نیاز به کامپیوتر، کافیست آدرس برنامه را در Chrome گوشی باز کرده و «Install App / Add to Home screen» را بزنید تا به‌صورت اپلیکیشن تمام‌صفحه روی اندروید نصب شود. فایل .tar.gz زیر نیز سورس کد کامل Android Studio (Kotlin) است برای زمانی که بخواهید فایل .apk اختصاصی بسازید.',
                  'For instant installation with zero PC tools, open the app in Chrome on Android and tap "Install App / Add to Home Screen". The .tar.gz download below provides the full Android Studio (Kotlin) project when you want to compile a custom .apk.'
                )}
              </p>
            </div>
          </div>

          {!isFileProtocol && (
            <button
              type="button"
              disabled={downloadingAndroid}
              onClick={() => void handleDownloadAndroidProject()}
              className="px-4 py-2.5 min-h-[44px] rounded-full ft-accent-gradient text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>
                {downloadingAndroid
                  ? t(lang, 'در حال آماده‌سازی سورس...', 'Packaging Android Project...')
                  : t(lang, 'دانلود سورس Android Studio (.tar.gz)', 'Download Android Source (.tar.gz)')}
              </span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl glass-tile space-y-1">
            <div className="font-semibold text-[var(--ft-text-primary)]">
              {t(lang, '۱. نصب فوری بدون نیاز به APK (توصیه‌شده)', '1. Instant Install on Phone (No APK Needed)')}
            </div>
            <p className="text-[var(--ft-text-muted)] leading-relaxed">
              {t(
                lang,
                'لینک مستقیم برنامه را با Chrome اندروید باز کنید ⟵ منوی سه‌نقطه ⟵ Add to Home screen / Install App.',
                'Open the app URL in Android Chrome -> Menu -> Install App / Add to Home Screen.'
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-2xl glass-tile space-y-1">
            <div className="font-semibold text-[var(--ft-text-primary)]">
              {t(lang, '۲. ساخت فایل .apk از سورس دانلودی', '2. Build .apk from Source Archive')}
            </div>
            <p className="text-[var(--ft-text-muted)] leading-relaxed">
              {t(
                lang,
                'فایل .tar.gz را از حالت فشرده خارج کرده و در Android Studio باز کنید؛ سپس Build > Build APK(s) را بزنید.',
                'Extract the .tar.gz on your PC, open the folder in Android Studio, and click Build > Build APK(s).'
              )}
            </p>
          </div>
          <div className="p-3.5 rounded-2xl glass-tile space-y-1">
            <div className="font-semibold text-[var(--ft-text-primary)]">
              {t(lang, '۳. آدرس میزبان شبکه داخلی (LAN)', '3. Pre-Configured LAN Host URL')}
            </div>
            <p className="text-[var(--ft-text-muted)] font-num truncate" dir="ltr">
              {s.lanSyncUrl?.trim() || detectedLanUrl}
            </p>
          </div>
        </div>
      </section>

      {/* 2. TRUE Single-File Zero-Server Portable App Download */}
      <section className="glass-surface rounded-3xl p-5 sm:p-6 space-y-4">
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
                className="px-4 py-2.5 min-h-[44px] rounded-full ft-accent-gradient text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 hover:opacity-95 transition-opacity disabled:opacity-60"
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
                className="px-4 py-2.5 min-h-[44px] rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-semibold text-[var(--ft-text-primary)] cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60"
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
                'FundTrack-App.html bundles the entire UI, charts, and accounting tools.'
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

      {/* 3. One-Click App Install (PWA) */}
      <PWAInstallButton
        lang={lang}
        variant="card"
        onInstalledToast={(msg) => onShowToast(msg, 'success')}
      />

      {/* 4. Cloud & Local Backups Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Google Drive Backup */}
        <section className="lg:col-span-7 glass-surface rounded-3xl p-5 sm:p-6 space-y-5">
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
                className="px-3 py-1.5 min-h-[38px] rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-danger-soft)] hover:text-[var(--ft-danger)] text-xs font-medium cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
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
                    className="p-2 min-w-[38px] min-h-[38px] rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] cursor-pointer disabled:opacity-50 flex items-center justify-center"
                    title={t(lang, 'بروزرسانی لیست درایو', 'Refresh backups')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => setPendingConfirm({ kind: 'upload_drive' })}
                    className="px-4 py-2 min-h-[38px] rounded-full ft-accent-gradient text-xs font-semibold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>{t(lang, 'ذخیره بکاپ جدید در درایو', 'Backup to Drive')}</span>
                  </button>
                </div>
              </div>

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
                            className="px-3 py-1.5 min-h-[36px] rounded-full bg-[var(--ft-accent-soft)] text-[var(--ft-accent)] hover:opacity-90 text-xs font-semibold cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{t(lang, 'بازیابی', 'Restore')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => setPendingConfirm({ kind: 'delete_drive', file })}
                            className="p-2 rounded-full hover:bg-[var(--ft-danger-soft)] text-[var(--ft-text-muted)] hover:text-[var(--ft-danger)] cursor-pointer transition-colors"
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
        <section className="lg:col-span-5 glass-surface rounded-3xl p-5 sm:p-6 space-y-5 flex flex-col justify-between">
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
                      : s.lastBackupTarget === 'lan'
                      ? t(lang, 'دیتابیس شبکه داخلی (LAN)', 'LAN Database')
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
              className="w-full px-4 py-3 min-h-[44px] rounded-2xl ft-accent-gradient text-xs sm:text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <Download className="w-4 h-4" />
              <span>{t(lang, 'دانلود فایل پشتیبان (JSON)', 'Download Backup (.json)')}</span>
            </button>

            <label className="w-full px-4 py-3 min-h-[44px] rounded-2xl border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs sm:text-sm font-semibold text-[var(--ft-text-primary)] cursor-pointer flex items-center justify-center gap-2 transition-colors">
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

      {/* E2E Encrypted Payload Decrypt Modal */}
      {pendingDecrypt && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <form
            onSubmit={handleConfirmDecrypt}
            className="w-full max-w-md rounded-3xl glass-surface-high p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[var(--ft-accent)]" />
                <h3 className="text-base font-bold text-[var(--ft-text-primary)]">
                  {t(lang, 'رمزگشایی نسخه پشتیبان (AES-256)', 'Decrypt E2E Snapshot')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingDecrypt(null)}
                className="p-1.5 rounded-full hover:bg-[var(--ft-surface-hover)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
              {t(
                lang,
                'این نسخه پشتیبان با رمزنگاری سرتاسری قفل شده است. عبارت رمزنگاری خود را برای بازگشایی وارد کنید:',
                'This snapshot is protected with AES-256-GCM encryption. Enter your passphrase to unlock it:'
              )}
            </p>
            <MaterialInput
              type="password"
              autoFocus
              ltrNum
              label={t(lang, 'عبارت رمزگشایی', 'Decryption Passphrase')}
              value={decryptInput}
              error={decryptError || undefined}
              onChange={(e) => {
                setDecryptInput(e.target.value);
                if (decryptError) setDecryptError('');
              }}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingDecrypt(null)}
                className="px-4 py-2 min-h-[40px] rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 min-h-[40px] rounded-full ft-accent-gradient text-xs font-semibold cursor-pointer flex items-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>{t(lang, 'رمزگشایی و بررسی', 'Decrypt & Preview')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mandatory Explicit Confirmation Modal for Drive / LAN Upload / Delete / Restore */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl glass-surface-high p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--ft-text-primary)]">
                {pendingConfirm.kind === 'upload_drive' &&
                  t(lang, 'تأیید ذخیره در Google Drive', 'Confirm Google Drive Backup')}
                {pendingConfirm.kind === 'delete_drive' &&
                  t(lang, 'تأیید حذف فایل از Google Drive', 'Confirm Google Drive Deletion')}
                {pendingConfirm.kind === 'push_hybrid' &&
                  t(lang, 'تأیید همگام‌سازی و ارسال داده‌ها', 'Confirm Sync Upload')}
                {(pendingConfirm.kind === 'restore_drive' ||
                  pendingConfirm.kind === 'restore_local' ||
                  pendingConfirm.kind === 'restore_lan') &&
                  t(lang, 'تأیید بازیابی و جایگزینی داده‌ها', 'Confirm Data Restore')}
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

            {pendingConfirm.kind === 'push_hybrid' && (
              <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
                {pendingConfirm.targetChannel === 'lan'
                  ? t(
                      lang,
                      `وضعیت فعلی پنل (${state.trades.length} معامله، ${state.transactions.length} تراکنش و ${state.goals.length} هدف) روی دیتابیس لوکال شبکه داخلی (LAN) ثبت و همگام‌سازی شود؟`,
                      `Push your current panel state (${state.trades.length} trades, ${state.transactions.length} transactions, ${state.goals.length} goals) to the LAN local database?`
                    )
                  : t(
                      lang,
                      `سرور شبکه داخلی در دسترس نیست؛ آیا تأیید می‌کنید آخرین نسخه همگام‌سازی به‌صورت خودکار در Google Drive ذخیره شود؟`,
                      `LAN host is currently unreachable. Upload latest sync snapshot to Google Drive fallback instead?`
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

            {(pendingConfirm.kind === 'restore_drive' ||
              pendingConfirm.kind === 'restore_local' ||
              pendingConfirm.kind === 'restore_lan') && (
              <div className="space-y-3">
                <p className="text-xs text-[var(--ft-text-secondary)] leading-relaxed">
                  {t(
                    lang,
                    `با بازیابی از «${
                      pendingConfirm.kind === 'restore_drive'
                        ? pendingConfirm.file.name
                        : pendingConfirm.kind === 'restore_local'
                        ? pendingConfirm.fileName
                        : pendingConfirm.sourceLabel
                    }»، داده‌های فعلی پنل جایگزین این نسخه می‌شود:`,
                    `Restoring from "${
                      pendingConfirm.kind === 'restore_drive'
                        ? pendingConfirm.file.name
                        : pendingConfirm.kind === 'restore_local'
                        ? pendingConfirm.fileName
                        : pendingConfirm.sourceLabel
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
                className="px-4 py-2 min-h-[40px] rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={executeConfirmedAction}
                className={`px-4 py-2 min-h-[40px] rounded-full text-xs font-semibold cursor-pointer ${
                  pendingConfirm.kind === 'delete_drive'
                    ? 'bg-[var(--ft-danger)] text-white'
                    : 'ft-accent-gradient'
                }`}
              >
                {busyAction
                  ? t(lang, 'در حال اجرا...', 'Processing...')
                  : pendingConfirm.kind === 'delete_drive'
                  ? t(lang, 'تأیید و حذف دائمی', 'Confirm Delete')
                  : pendingConfirm.kind === 'upload_drive' || pendingConfirm.kind === 'push_hybrid'
                  ? t(lang, 'تأیید و ارسال', 'Confirm Push')
                  : t(lang, 'تأیید و جایگزینی داده‌ها', 'Confirm Restore')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
