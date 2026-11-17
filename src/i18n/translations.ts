import { AppLanguage, MainCategory } from '../types';

export const CATEGORY_LABELS: Record<
  MainCategory,
  { fa: string; en: string; descFa: string; descEn: string }
> = {
  overview: {
    fa: 'نمای کلی',
    en: 'Overview',
    descFa: 'وضعیت لحظه‌ای ترید، نقدینگی و مرکز اقدام',
    descEn: 'Live trading pulse, liquidity & action center',
  },
  trading: {
    fa: 'ترید',
    en: 'Trading',
    descFa: 'ژورنال، آنالیز، حساب‌های MT5 و اخبار',
    descEn: 'Journal, analytics, MT5 accounts & news',
  },
  finance: {
    fa: 'مالی',
    en: 'Finance',
    descFa: 'دارایی خالص، نقدینگی، بودجه و وام',
    descEn: 'Net worth, Safe-to-Spend, budgets & loans',
  },
  growth: {
    fa: 'اهداف',
    en: 'Goals',
    descFa: 'اهداف، مأموریت‌ها، استریک و نشان‌ها',
    descEn: 'Goals, quests, streaks & badges',
  },
  assistant: {
    fa: 'دستیار',
    en: 'Assistant',
    descFa: 'گفتگوی کامل، تاریخچه و حافظه دستیار هوشمند',
    descEn: 'Full workspace chat, history & persistent memory',
  },
  system: {
    fa: 'تنظیمات',
    en: 'Settings',
    descFa: 'ظاهر، امنیت PIN و سلامت اتصال',
    descEn: 'Themes, PIN security & system health',
  },
};

export function t(lang: AppLanguage, fa: string, en: string): string {
  return lang === 'fa' ? fa : en;
}
