# FundTrack — داشبورد معاملات اک‌سپرت MT5

پروژه سبک‌سازی اک‌سپرت: محاسبات و تحلیل‌ها از داخل اک‌سپرت به بیرون منتقل می‌شوند.
اک‌سپرت فقط «رویداد» می‌نویسد و داشبورد (پایتون + فرانت وب) همه کار را انجام می‌دهد.

## معماری

```
MT5 Expert Advisor (TradePanel_RR.mq5)
   └─ می‌نویسد:  Common\Files\FundTrack\events.jsonl   (رویدادهای meta / deal / snap / positions)
                       │
                       ▼
Python backend (FastAPI + SQLite)  ←─ اینجا همه تحلیل و ژورنالینگ انجام می‌شود
   ├─ خواندن افزایشی (incremental) رویدادها از فایل
   ├─ ساخت ترید از دیل‌ها (باز/بسته، R، کارمزد، سواپ، …)
   ├─ آنالیز: بازه روز/هفته/ماه/سال/کل، سشن‌ها، ساعت‌ها، هیت‌مپ، بهترین/بدترین
   ├─ چند حساب (هر لاگین خودکار شناسایی می‌شود + مدیریت)
   └─ تنظیمات نمایش (دلار / تومان، بازه پیش‌فرض)
                       │   REST API /api/...
                       ▼
Frontend (React + Vite + Tailwind v4 + Recharts) — UI با زبان فارسی، راست‌به‌چپ
   ├─ داشبورد: KPI، منحنی سود، عملکرد دوره‌ای، آخرین تریدها
   ├─ ژورنال: جدول کامل + فیلتر + خروجی CSV + بهترین/بدترین
   ├─ آنالیز: نقشه حرارتی روز×ساعت، سشن‌ها، مدت نگه‌داری
   ├─ حساب‌ها: مشاهده/ویرایش نرخ تومان و یادداشت
   └─ تنظیمات و وضعیت سیستم
```

## اجرا (توسعه)

### بک‌اند + داشبورد یک‌جا
```powershell
cd fundtrack-py
.\.venv\Scripts\python.exe -m fundtrack        # آدرس: http://127.0.0.1:8787
```
(محیط مجازی: `py -3.13 -m venv .venv` + `.\.venv\Scripts\python.exe -m pip install -e ".[dev]"`)

### فقط فرانت (توسعه UI با hot reload)
```powershell
cd fundtrack-py\web
npm install
npm run dev        # http://127.0.0.1:5173 (پراکسی /api به 8787)
```

## ساخت تک‌فایل exe

```powershell
cd fundtrack-py
powershell -ExecutionPolicy Bypass -File packaging\build_exe.ps1
# خروجی: dist\FundTrack.exe  (یک فایل، بدون نیاز به نصب)
```

## API اصلی

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/status` | وضعیت فایل رویداد و دیتابیس |
| POST | `/api/sync` | خواندن فوری رویدادها |
| GET | `/api/accounts` | فهرست حساب‌ها |
| PATCH | `/api/accounts/{login}` | ویرایش نرخ/یادداشت/آرشیو |
| GET/PUT | `/api/settings` | تنظیمات نمایش |
| GET | `/api/filter-options` | مقادیر قابل فیلتر |
| GET | `/api/summary` | آمار + منحنی سود |
| GET | `/api/trades` | تریدها |
| GET | `/api/breakdown?by=hour` | تفکیک با ساعت/روز/سشن/نماد/… |
| GET | `/api/heatmap` | نقشه حرارتی روز×ساعت |
| GET | `/api/top` | بهترین/بدترین تریدها |
| GET | `/api/net-by-period?period=month` | عملکرد دوره‌ای |
| GET | `/api/durations` | توزیع مدت نگه‌داری |
| GET | `/api/journal.csv` | خروجی CSV ژورنال |

## نکته درباره اک‌سپرت

اک‌سپرت (TradePanel_RR.mq5) با گزینه `InpFtEvents` رویدادها را در
`Terminal\Common\Files\FundTrack\events.jsonl` می‌نویسد و یک‌بار از تاریخ `InpBackfillFrom`
(پیش‌فرض 2026.07.23) تاریخچه را پر می‌کند. برای حساب‌های دیگر کافی است EA روی همان حساب اجرا شود.
