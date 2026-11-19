import React, { useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Laptop, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { AppLanguage } from '../types';
import { t } from '../i18n/translations';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  lang: AppLanguage;
  variant?: 'header' | 'card' | 'icon';
  onInstalledToast?: (msg: string) => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  lang,
  variant = 'header',
  onInstalledToast,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const handleInstallClick = async () => {
    const accepted = await install();
    if (accepted && onInstalledToast) {
      onInstalledToast(
        t(lang, 'اپلیکیشن FundTrack با موفقیت نصب شد', 'FundTrack installed as a standalone app')
      );
    }
  };

  if (variant === 'icon') {
    if (isInstalled) return null;
    if (isInstallable) {
      return (
        <button
          type="button"
          onClick={handleInstallClick}
          title={t(lang, 'نصب اپلیکیشن', 'Install App')}
          aria-label={t(lang, 'نصب اپلیکیشن', 'Install App')}
          className="h-11 flex-1 min-w-[44px] rounded-2xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)] flex items-center justify-center text-[var(--ft-accent)] transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
        </button>
      );
    }
    if (isIOS) {
      return (
        <>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            title={t(lang, 'نصب روی آیفون', 'Install iOS')}
            aria-label={t(lang, 'نصب روی آیفون', 'Install iOS')}
            className="h-11 flex-1 min-w-[44px] rounded-2xl bg-[var(--ft-surface-subtle)] hover:bg-[var(--ft-surface-hover)] border border-[var(--ft-border)] flex items-center justify-center text-[var(--ft-accent)] transition-colors cursor-pointer"
          >
            <Smartphone className="w-4 h-4" />
          </button>
          {showGuide && <InstallGuideModal lang={lang} isIOS isInIframe={isInIframe} onClose={() => setShowGuide(false)} />}
        </>
      );
    }
    return null;
  }

  if (variant === 'header') {
    if (isInstalled) return null;

    if (isInstallable) {
      return (
        <button
          type="button"
          onClick={handleInstallClick}
          title={t(lang, 'نصب اپلیکیشن با یک کلیک', 'Install App (1-Click)')}
          className="h-11 px-3.5 rounded-full glass-surface text-xs font-semibold text-[var(--ft-text-primary)] hover:border-[var(--ft-accent)] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
          <span className="hidden md:inline">{t(lang, 'نصب اپ', 'Install App')}</span>
        </button>
      );
    }

    if (isIOS) {
      return (
        <>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="h-11 px-3.5 rounded-full glass-surface text-xs font-medium text-[var(--ft-text-primary)] hover:border-[var(--ft-accent)] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Smartphone className="w-3.5 h-3.5 text-[var(--ft-accent)]" />
            <span className="hidden md:inline">{t(lang, 'نصب روی آیفون', 'Install iOS')}</span>
          </button>
          {showGuide && <InstallGuideModal lang={lang} isIOS isInIframe={isInIframe} onClose={() => setShowGuide(false)} />}
        </>
      );
    }

    return null;
  }

  // Full Card Variant (System Settings -> Backup & App Install)
  return (
    <div className="glass-surface rounded-3xl p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--ft-border)]">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl ft-accent-gradient flex items-center justify-center shrink-0">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[var(--ft-text-primary)]">
              {t(lang, 'نصب تک‌کلیکی اپلیکیشن (PWA بدون نیاز به ترمینال)', 'One-Click App Installation (PWA)')}
            </h3>
            <p className="text-xs text-[var(--ft-text-muted)] mt-0.5 leading-relaxed">
              {t(
                lang,
                'برنامه را مانند یک نرم‌افزار مستقل روی ویندوز، مک، اندروید یا آیفون نصب کنید؛ بدون نیاز به دستورهای فنی و با پشتیبانی از اجرای آفلاین.',
                'Install FundTrack as a standalone desktop or mobile app with offline cache support—no terminal commands needed.'
              )}
            </p>
          </div>
        </div>

        {isInstalled ? (
          <span className="px-3.5 py-2 rounded-full bg-[var(--ft-positive-soft)] text-[var(--ft-positive)] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <CheckCircle2 className="w-4 h-4" />
            {t(lang, 'نصب‌شده (حالت اپلیکیشن)', 'Installed (Standalone)')}
          </span>
        ) : isInstallable ? (
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-5 py-2.5 rounded-full ft-accent-gradient text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0 hover:opacity-95 transition-opacity"
          >
            <Download className="w-4 h-4" />
            <span>{t(lang, 'نصب اپلیکیشن با یک کلیک', 'Install App Now')}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="px-4 py-2.5 rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-semibold text-[var(--ft-text-primary)] cursor-pointer flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            {isIOS ? <Share className="w-4 h-4 text-[var(--ft-accent)]" /> : <Download className="w-4 h-4 text-[var(--ft-accent)]" />}
            <span>{t(lang, 'راهنمای نصب تک‌کلیکی مرورگر', 'How to Install App')}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-2xl glass-tile space-y-1.5">
          <div className="font-semibold text-[var(--ft-text-primary)]">
            {t(lang, '۱. ویندوز، مک و اندروید (Chrome / Edge)', '1. Desktop & Android (Chrome / Edge)')}
          </div>
          <p className="text-[var(--ft-text-muted)] leading-relaxed">
            {t(
              lang,
              'در صورت باز کردن لینک مستقیم اپ در مرورگر، دکمه «نصب اپلیکیشن» همین‌جا فعال می‌شود یا آیکون نصب در انتهای نوار آدرس ظاهر می‌گردد.',
              'Open the app URL directly in Chrome or Edge and click the 1-click Install button or address bar install icon.'
            )}
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-tile space-y-1.5">
          <div className="font-semibold text-[var(--ft-text-primary)]">
            {t(lang, '۲. آیفون و آیپد (Safari)', '2. iPhone & iPad (Safari)')}
          </div>
          <p className="text-[var(--ft-text-muted)] leading-relaxed">
            {t(
              lang,
              'دکمه Share سافاری را بزنید و گزینه Add to Home Screen را انتخاب کنید تا آیکون اختصاصی روی صفحه اصلی قرار بگیرد.',
              'Tap Share in Safari toolbar, then choose Add to Home Screen.'
            )}
          </p>
        </div>

        <div className="p-4 rounded-2xl glass-tile space-y-1.5">
          <div className="font-semibold text-[var(--ft-text-primary)]">
            {t(lang, '۳. اجرای بدون نیاز به اینترنت (Offline Cache)', '3. Offline-Ready Engine')}
          </div>
          <p className="text-[var(--ft-text-muted)] leading-relaxed">
            {t(
              lang,
              'فایل‌های اصلی برنامه در حافظه دستگاه کش می‌شوند تا بدون اینترنت هم داده‌ها و ژورنال شما فوراً باز شود.',
              'Core assets and fonts are cached automatically via Service Worker for instant offline access.'
            )}
          </p>
        </div>
      </div>

      {isInIframe && !isInstalled && !isInstallable && (
        <div className="p-3.5 rounded-2xl bg-[var(--ft-accent-soft)] border border-[var(--ft-accent)]/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-[var(--ft-text-primary)]">
            {t(
              lang,
              'نکته: مرورگرها اجازه نصب مستقیم از داخل پیش‌نمایش قاب‌دار (iframe) را نمی‌دهند. با باز کردن آدرس مستقیم برنامه در تب جدید، نصب تک‌کلیکی بلافاصله فعال می‌شود.',
              'Note: Browsers disable 1-click install prompts inside embedded iframes. Open the app in its own browser tab to enable the 1-click install prompt.'
            )}
          </span>
          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-full ft-accent-gradient font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t(lang, 'باز کردن در تب مستقل', 'Open Standalone Tab')}</span>
          </a>
        </div>
      )}

      {showGuide && (
        <InstallGuideModal
          lang={lang}
          isIOS={isIOS}
          isInIframe={isInIframe}
          onClose={() => setShowGuide(false)}
        />
      )}
    </div>
  );
};

const InstallGuideModal: React.FC<{
  lang: AppLanguage;
  isIOS: boolean;
  isInIframe: boolean;
  onClose: () => void;
}> = ({ lang, isIOS, isInIframe, onClose }) => {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl glass-surface-high p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--ft-text-primary)]">
            {isIOS
              ? t(lang, 'نصب اپلیکیشن روی آیفون / آیپد', 'Install on iPhone / iPad')
              : t(lang, 'نصب اپلیکیشن روی دسکتاپ یا موبایل', 'Install FundTrack App')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--ft-surface-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <ol className="space-y-2 text-xs text-[var(--ft-text-secondary)] leading-relaxed list-decimal ps-5">
            <li>{t(lang, 'در مرورگر Safari دکمه اشتراک‌گذاری (Share) را لمس کنید.', 'Tap the Share button in the Safari toolbar.')}</li>
            <li>{t(lang, 'به پایین اسکرول کرده و گزینه Add to Home Screen را انتخاب کنید.', 'Scroll down and tap Add to Home Screen.')}</li>
            <li>{t(lang, 'روی Add بزنید تا آیکون FundTrack روی صفحه اصلی ظاهر شود.', 'Tap Add to finish installation.')}</li>
          </ol>
        ) : (
          <ol className="space-y-2 text-xs text-[var(--ft-text-secondary)] leading-relaxed list-decimal ps-5">
            {isInIframe && (
              <li>
                {t(
                  lang,
                  'ابتدا برنامه را با لینک مستقیم در یک تب جدید مرورگر باز کنید.',
                  'First open the app URL in its own browser tab (outside embedded preview).'
                )}
              </li>
            )}
            <li>
              {t(
                lang,
                'در نوار آدرس Chrome یا Edge روی آیکون «نصب (Install)» کلیک کنید یا از منوی مرورگر گزینه Install FundTrack را بزنید.',
                'Click the Install icon in the Chrome/Edge address bar, or choose Install FundTrack from the browser menu.'
              )}
            </li>
            <li>
              {t(
                lang,
                'اپلیکیشن بدون نیاز به ترمینال و کدنویسی با یک کلیک روی دسکتاپ یا موبایل نصب می‌شود.',
                'The app installs immediately with one click—no terminal required.'
              )}
            </li>
          </ol>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          {isInIframe && (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-full ft-accent-gradient text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t(lang, 'باز کردن تب مستقل', 'Open Tab')}</span>
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-[var(--ft-border-strong)] hover:bg-[var(--ft-surface-hover)] text-xs font-medium cursor-pointer"
          >
            {t(lang, 'متوجه شدم', 'Got it')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const OfflineIndicator: React.FC<{ lang: AppLanguage }> = ({ lang }) => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 start-3 sm:start-4 z-[90] flex items-center gap-2 rounded-full bg-[var(--ft-warning)] px-3.5 py-2 text-xs font-semibold text-black shadow-lg no-print">
      <WifiOff className="w-3.5 h-3.5" />
      <span>{t(lang, 'حالت آفلاین — داده‌های محلی فعال است', 'Offline Mode — Using cached data')}</span>
    </div>
  );
};
