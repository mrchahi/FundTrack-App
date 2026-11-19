import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { execFile } from 'child_process';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';
import zlib from 'zlib';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const calendarYearCache = new Map<string, CacheEntry<unknown>>();
const holidaysYearCache = new Map<string, CacheEntry<unknown>>();
let econCalendarCache: CacheEntry<Array<{
  id: string;
  title: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  timestamp: string;
  forecast: string;
  actual: string;
  previous: string;
  alarmEnabled: boolean;
  alarmTriggered: boolean;
}>> | null = null;
let fxCache: CacheEntry<{
  usdToToman: number;
  usdToRial: number;
  updatedAt: string;
  source: 'live' | 'cached' | 'fallback';
  symbol: string;
}> | null = null;

const CACHE_TTL_CALENDAR_MS = 12 * 60 * 60 * 1000; // 12 hours
const CACHE_TTL_ECON_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_TTL_FX_MS = 8 * 60 * 60 * 1000; // 8 hours (3x daily)

function buildFallbackHolidays(year: number) {
  return [
    { year, month: 1, day: 1, isHoliday: true, title: 'جشن نوروز / آغاز سال نو' },
    { year, month: 1, day: 2, isHoliday: true, title: 'عید نوروز' },
    { year, month: 1, day: 3, isHoliday: true, title: 'عید نوروز' },
    { year, month: 1, day: 4, isHoliday: true, title: 'عید نوروز' },
    { year, month: 1, day: 12, isHoliday: true, title: 'روز جمهوری اسلامی' },
    { year, month: 1, day: 13, isHoliday: true, title: 'روز طبیعت (سیزده بدر)' },
    { year, month: 3, day: 14, isHoliday: true, title: 'رحلت امام خمینی' },
    { year, month: 3, day: 15, isHoliday: true, title: 'قیام ۱۵ خرداد' },
    { year, month: 11, day: 22, isHoliday: true, title: 'پیروزی انقلاب اسلامی' },
    { year, month: 12, day: 29, isHoliday: true, title: 'روز ملی شدن صنعت نفت' },
  ];
}

async function fetchWithTimeout(url: string, timeoutMs = 3500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

const SYNC_DATA_DIR = path.join(__dirname, 'data');
const SYNC_DB_FILE = path.join(SYNC_DATA_DIR, 'fundtrack-lan-db.json');
const SYNC_KEY_FILE = path.join(SYNC_DATA_DIR, '.lan-sync-key');

interface LanStoredRecord {
  revision: number;
  updatedAt: string;
  encrypted: boolean;
  payload: unknown;
}

function ensureSyncDataDir() {
  if (!fs.existsSync(SYNC_DATA_DIR)) {
    fs.mkdirSync(SYNC_DATA_DIR, { recursive: true });
  }
}

function getOrCreateLanSyncKey(): string {
  ensureSyncDataDir();
  if (fs.existsSync(SYNC_KEY_FILE)) {
    const existing = fs.readFileSync(SYNC_KEY_FILE, 'utf8').trim();
    if (existing.length >= 16) return existing;
  }
  const fresh = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(SYNC_KEY_FILE, fresh, { encoding: 'utf8', mode: 0o600 });
  return fresh;
}

function isValidSyncKey(provided: unknown): boolean {
  if (typeof provided !== 'string') return false;
  const candidate = provided.trim();
  if (!candidate) return false;
  const expected = getOrCreateLanSyncKey();
  const bufA = Buffer.from(candidate, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isLoopbackIp(req: express.Request): boolean {
  const remote = req.socket?.remoteAddress || req.ip || '';
  return (
    remote === '127.0.0.1' ||
    remote === '::1' ||
    remote === '::ffff:127.0.0.1' ||
    remote.startsWith('127.')
  );
}

function getLanUrls(port: number): string[] {
  const nets = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return Array.from(new Set(urls));
}

function readLanStoredRecord(): LanStoredRecord | null {
  try {
    if (!fs.existsSync(SYNC_DB_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(SYNC_DB_FILE, 'utf8')) as Partial<LanStoredRecord>;
    if (!parsed || typeof parsed !== 'object' || parsed.payload === undefined) return null;
    return {
      revision: Number(parsed.revision) || 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      encrypted: Boolean(parsed.encrypted),
      payload: parsed.payload,
    };
  } catch {
    return null;
  }
}

function writeLanStoredRecord(record: LanStoredRecord) {
  ensureSyncDataDir();
  const tmpFile = `${SYNC_DB_FILE}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(record, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmpFile, SYNC_DB_FILE);
}

function createTarGzArchive(files: Array<{ name: string; content: Buffer; mode?: number }>): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of files) {
    const cleanName = entry.name.replace(/^\/+/, '');
    const header = Buffer.alloc(512, 0);
    // Split prefix/name if >100 chars
    let nameField = cleanName;
    let prefixField = '';
    if (Buffer.byteLength(cleanName, 'utf8') > 100) {
      const idx = cleanName.lastIndexOf('/');
      if (idx > 0) {
        prefixField = cleanName.slice(0, idx);
        nameField = cleanName.slice(idx + 1);
      }
    }
    header.write(nameField.slice(0, 100), 0, 100, 'utf8');
    header.write((entry.mode ?? 0o644).toString(8).padStart(7, '0') + '\0', 100, 8, 'ascii');
    header.write('0000000\0', 108, 8, 'ascii');
    header.write('0000000\0', 116, 8, 'ascii');
    header.write(entry.content.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii');
    header.fill(' ', 148, 156, 'ascii');
    header.write('0', 156, 1, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    if (prefixField) {
      header.write(prefixField.slice(0, 155), 345, 155, 'utf8');
    }

    let sum = 0;
    for (let i = 0; i < 512; i += 1) {
      sum += header[i];
    }
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    blocks.push(header);

    if (entry.content.length > 0) {
      blocks.push(entry.content);
      const rem = entry.content.length % 512;
      if (rem !== 0) {
        blocks.push(Buffer.alloc(512 - rem, 0));
      }
    }
  }
  blocks.push(Buffer.alloc(1024, 0));
  return zlib.gzipSync(Buffer.concat(blocks));
}

function collectFilesRecursive(dirPath: string, prefix: string): Array<{ name: string; content: Buffer; mode?: number }> {
  const out: Array<{ name: string; content: Buffer; mode?: number }> = [];
  if (!fs.existsSync(dirPath)) return out;
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    if (item.name === '.gradle' || item.name === 'build') continue;
    const full = path.join(dirPath, item.name);
    const rel = `${prefix}/${item.name}`;
    if (item.isDirectory()) {
      out.push(...collectFilesRecursive(full, rel));
    } else if (item.isFile()) {
      const stat = fs.statSync(full);
      out.push({
        name: rel,
        content: fs.readFileSync(full),
        mode: item.name.endsWith('.sh') ? 0o755 : stat.mode & 0o777,
      });
    }
  }
  return out;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/sync') || req.path === '/api/health') {
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-FundTrack-Sync-Key');
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
    }
    return next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'fundtrack-server',
      timestamp: new Date().toISOString(),
      fxCached: Boolean(fxCache),
      calendarYearsCached: Array.from(calendarYearCache.keys()),
    });
  });

  // Read MT5 FundTrack events.jsonl from local filesystem when running alongside MetaTrader 5
  app.post('/api/ea/read-events', (req, res) => {
    try {
      const requested = typeof req.body?.filePath === 'string' ? req.body.filePath.trim() : '';
      const home = os.homedir();
      const candidates = [
        requested,
        path.join(process.cwd(), 'events.jsonl'),
        path.join(process.env.APPDATA || '', 'MetaQuotes', 'Terminal', 'Common', 'Files', 'FundTrack', 'events.jsonl'),
        path.join(home, 'AppData', 'Roaming', 'MetaQuotes', 'Terminal', 'Common', 'Files', 'FundTrack', 'events.jsonl'),
        path.join(home, '.wine', 'drive_c', 'users', os.userInfo().username || 'user', 'AppData', 'Roaming', 'MetaQuotes', 'Terminal', 'Common', 'Files', 'FundTrack', 'events.jsonl'),
      ].filter((p) => Boolean(p));

      const matched = candidates.find((p) => {
        try {
          return fs.existsSync(p) && fs.statSync(p).isFile();
        } catch {
          return false;
        }
      });

      if (!matched) {
        return res.status(404).json({
          ok: false,
          error: 'events.jsonl not found on server host',
          checkedPaths: candidates.slice(0, 3),
        });
      }

      const content = fs.readFileSync(matched, 'utf8');
      return res.json({ ok: true, filePath: matched, content });
    } catch (err) {
      return res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  // Live USD/USDT -> Toman proxy (primary: https://api.zipodo.ir/usdt/) with 8h cache & fallback
  app.get('/api/fx-rate', async (req, res) => {
    const force = req.query.force === 'true';
    const now = Date.now();

    if (!force && fxCache && now - fxCache.fetchedAt < CACHE_TTL_FX_MS) {
      return res.json({ ...fxCache.data, source: 'cached' });
    }

    const candidates = [
      'https://api.zipodo.ir/usdt/',
      'https://api.iranmarket.ir/api/v1/rates/USD_IRR_FREE',
      'https://brsapi.ir/Api/Market/Gold_Currency.php?key=Free',
    ];

    for (const url of candidates) {
      try {
        const response = await fetchWithTimeout(url, 4000);
        if (response.ok) {
          const payload = (await response.json()) as Record<string, unknown>;
          const rawPrice =
            Number(payload?.price) ||
            Number((payload?.data as Record<string, unknown> | undefined)?.price) ||
            Number((payload?.currency as Array<Record<string, unknown>> | undefined)?.[0]?.price);
          if (Number.isFinite(rawPrice) && rawPrice > 10000) {
            // zipodo.ir/usdt/ returns Toman directly (e.g. {"price":270090,"Ex-name":"Ompfinex"});
            // only convert from Rial to Toman when value is clearly Rial (> 1,000,000)
            const usdToToman = rawPrice > 1000000 ? Math.round(rawPrice / 10) : Math.round(rawPrice);
            const exName =
              typeof payload?.['Ex-name'] === 'string' && payload['Ex-name'].trim()
                ? payload['Ex-name'].trim()
                : '';
            const result = {
              usdToToman,
              usdToRial: usdToToman * 10,
              updatedAt: new Date().toISOString(),
              source: 'live' as const,
              symbol: exName ? `USDT (${exName})` : 'USDT_IRT',
            };
            fxCache = { data: result, fetchedAt: now };
            return res.json(result);
          }
        }
      } catch {
        // Continue to next source or fallback
      }
    }

    // Fallback when external feed is unreachable
    const baseRate = fxCache?.data.usdToToman ?? 69500;
    const jitter = force ? Math.round((Math.random() - 0.5) * 400) : 0;
    const usdToToman = Math.max(50000, baseRate + jitter);
    const fallbackResult = {
      usdToToman,
      usdToRial: usdToToman * 10,
      updatedAt: new Date().toISOString(),
      source: 'fallback' as const,
      symbol: 'USDT_IRT',
    };
    fxCache = { data: fallbackResult, fetchedAt: now };
    return res.json(fallbackResult);
  });

  // Free Live Economic Calendar Feed (Forex Factory / FairEconomy JSON — zero API key required)
  app.get('/api/economic-calendar', async (req, res) => {
    const force = req.query.force === 'true';
    const currencyFilter = typeof req.query.currency === 'string' ? req.query.currency.trim().toUpperCase() : '';
    const impactFilter = typeof req.query.impact === 'string' ? req.query.impact.trim().toLowerCase() : 'all';
    const now = Date.now();

    const filterEvents = (list: NonNullable<typeof econCalendarCache>['data']) => {
      const allowedCurrencies =
        currencyFilter && currencyFilter !== 'ALL'
          ? new Set(currencyFilter.split(',').map((c) => c.trim()).filter(Boolean))
          : null;
      return list.filter((ev) => {
        if (allowedCurrencies && !allowedCurrencies.has(ev.currency)) return false;
        if (impactFilter === 'high' && ev.impact !== 'high') return false;
        if (impactFilter === 'high_medium' && ev.impact === 'low') return false;
        return true;
      });
    };

    if (!force && econCalendarCache && now - econCalendarCache.fetchedAt < CACHE_TTL_ECON_MS) {
      return res.json({
        ok: true,
        source: 'cache',
        updatedAt: new Date(econCalendarCache.fetchedAt).toISOString(),
        events: filterEvents(econCalendarCache.data),
      });
    }

    const freeFeeds = [
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      'https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.json',
    ];

    for (const url of freeFeeds) {
      try {
        const response = await fetchWithTimeout(url, 6000);
        if (!response.ok) continue;
        const raw = (await response.json()) as Array<{
          title?: string;
          country?: string;
          date?: string;
          impact?: string;
          forecast?: string;
          actual?: string;
          previous?: string;
        }>;
        if (!Array.isArray(raw) || raw.length === 0) continue;

        const normalized = raw
          .map((item) => {
            const title = String(item.title || '').trim();
            const currency = String(item.country || '').trim().toUpperCase();
            const dt = new Date(String(item.date || '').trim());
            if (!title || !currency || Number.isNaN(dt.getTime())) return null;
            const rawImpact = String(item.impact || '').trim().toLowerCase();
            const impact: 'high' | 'medium' | 'low' =
              rawImpact === 'high' ? 'high' : rawImpact === 'medium' ? 'medium' : 'low';
            const slug = title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')
              .replace(/^_|_$/g, '')
              .slice(0, 36);
            return {
              id: `ff_${currency}_${dt.getTime()}_${slug}`,
              title,
              currency,
              impact,
              timestamp: dt.toISOString(),
              forecast: String(item.forecast || '').trim() || '—',
              actual: String(item.actual || '').trim() || '—',
              previous: String(item.previous || '').trim() || '—',
              alarmEnabled: false,
              alarmTriggered: false,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x))
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        if (normalized.length > 0) {
          econCalendarCache = { data: normalized, fetchedAt: now };
          return res.json({
            ok: true,
            source: 'faireconomy',
            updatedAt: new Date(now).toISOString(),
            events: filterEvents(normalized),
          });
        }
      } catch {
        // Try next free mirror
      }
    }

    // Optional free backup via Gemini Google Search Grounding if GEMINI_API_KEY is present
    const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const todayIso = new Date().toISOString().slice(0, 10);
        const gRes = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `List the top 10 major scheduled high/medium-impact macroeconomic releases (USD, EUR, GBP, JPY) around ${todayIso} this week as a raw JSON array: [{"title":"...","currency":"USD","impact":"high","timestamp":"ISO-8601 UTC","forecast":"...","previous":"...","actual":"—"}]. Output JSON array only.`,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: 'application/json',
            },
          }),
          15000,
          'Gemini economic news search'
        );
        const parsed = JSON.parse(gRes.text || '[]') as Array<{
          title?: string;
          currency?: string;
          impact?: string;
          timestamp?: string;
          forecast?: string;
          actual?: string;
          previous?: string;
        }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed
            .map((item, idx) => {
              const title = String(item.title || '').trim();
              const currency = String(item.currency || 'USD').trim().toUpperCase();
              const dt = new Date(String(item.timestamp || '').trim());
              if (!title || Number.isNaN(dt.getTime())) return null;
              const rawImp = String(item.impact || 'high').toLowerCase();
              const impact: 'high' | 'medium' | 'low' =
                rawImp === 'high' ? 'high' : rawImp === 'medium' ? 'medium' : 'low';
              return {
                id: `gs_${currency}_${dt.getTime()}_${idx}`,
                title,
                currency,
                impact,
                timestamp: dt.toISOString(),
                forecast: String(item.forecast || '—'),
                actual: String(item.actual || '—'),
                previous: String(item.previous || '—'),
                alarmEnabled: false,
                alarmTriggered: false,
              };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x));

          if (normalized.length > 0) {
            econCalendarCache = { data: normalized, fetchedAt: now };
            return res.json({
              ok: true,
              source: 'gemini-search',
              updatedAt: new Date(now).toISOString(),
              events: filterEvents(normalized),
            });
          }
        }
      } catch {
        // Return cached or error below
      }
    }

    if (econCalendarCache) {
      return res.json({
        ok: true,
        source: 'cache',
        updatedAt: new Date(econCalendarCache.fetchedAt).toISOString(),
        events: filterEvents(econCalendarCache.data),
      });
    }

    return res.status(503).json({
      ok: false,
      events: [],
      error: 'Could not reach free Forex Factory calendar feed',
    });
  });

  // Proxy for persian-calendar.ir: get-year
  app.get('/api/persian-calendar/year/:year', async (req, res) => {
    const year = String(req.params.year || '1405').replace(/[^0-9]/g, '') || '1405';
    const now = Date.now();
    const cached = calendarYearCache.get(year);

    if (cached && now - cached.fetchedAt < CACHE_TTL_CALENDAR_MS) {
      return res.json({ source: 'cache', year: Number(year), data: cached.data });
    }

    try {
      const response = await fetchWithTimeout(
        `https://api.persian-calendar.ir/api/v1/calendar/get-year/${year}`,
        4000
      );
      if (response.ok) {
        const data = await response.json();
        calendarYearCache.set(year, { data, fetchedAt: now });
        return res.json({ source: 'persian-calendar.ir', year: Number(year), data });
      }
    } catch {
      // Fallback handled below
    }

    return res.json({
      source: 'local-fallback',
      year: Number(year),
      data: buildFallbackHolidays(Number(year)),
    });
  });

  // Proxy for persian-calendar.ir: holidays
  app.get('/api/persian-calendar/holidays/:year', async (req, res) => {
    const year = String(req.params.year || '1405').replace(/[^0-9]/g, '') || '1405';
    const now = Date.now();
    const cached = holidaysYearCache.get(year);

    if (cached && now - cached.fetchedAt < CACHE_TTL_CALENDAR_MS) {
      return res.json({ source: 'cache', year: Number(year), holidays: cached.data });
    }

    try {
      const response = await fetchWithTimeout(
        `https://api.persian-calendar.ir/api/v1/calendar/${year}/holidays`,
        4000
      );
      if (response.ok) {
        const data = await response.json();
        holidaysYearCache.set(year, { data, fetchedAt: now });
        return res.json({ source: 'persian-calendar.ir', year: Number(year), holidays: data });
      }
    } catch {
      // Fallback handled below
    }

    const fallback = buildFallbackHolidays(Number(year));
    return res.json({ source: 'local-fallback', year: Number(year), holidays: fallback });
  });

  // Proxy for persian-calendar.ir: is-holiday
  app.get('/api/persian-calendar/is-holiday/:date', async (req, res) => {
    const dateParam = String(req.params.date || '').replace(/[^0-9-]/g, '');
    try {
      const response = await fetchWithTimeout(
        `https://api.persian-calendar.ir/api/v1/calendar/${dateParam}/is-holiday`,
        3500
      );
      if (response.ok) {
        const data = await response.json();
        return res.json({ source: 'persian-calendar.ir', date: dateParam, isHoliday: Boolean(data) });
      }
    } catch {
      // Fallback
    }
    return res.json({ source: 'local-fallback', date: dateParam, isHoliday: false });
  });

  // Local AI Server Proxy (Jan on 127.0.0.1:1337/v1, llama-server, Ollama, LM Studio)
  const sanitizeLocalAiBase = (raw?: string): string | null => {
    const candidate = (raw || process.env.LOCAL_AI_ENDPOINT || 'http://127.0.0.1:1337/v1')
      .trim()
      .replace(/\/+$/, '');
    try {
      const u = new URL(candidate);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString().replace(/\/+$/, '');
    } catch {
      return null;
    }
  };

  app.post('/api/local-ai/models', async (req, res) => {
    const base = sanitizeLocalAiBase(req.body?.endpoint);
    if (!base) {
      return res.status(400).json({ ok: false, models: [], error: 'Invalid endpoint URL' });
    }
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const upstream = await fetch(`${base}/models`, { headers, signal: controller.signal });
      if (!upstream.ok) {
        return res.json({ ok: false, endpoint: base, models: [], error: `HTTP ${upstream.status}` });
      }
      const data = (await upstream.json()) as { data?: Array<{ id?: string }> };
      const models = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id));
      return res.json({ ok: true, endpoint: base, models });
    } catch (err) {
      return res.json({
        ok: false,
        endpoint: base,
        models: [],
        error: (err as Error).message || 'Local AI server unreachable',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post('/api/local-ai/parse', async (req, res) => {
    const base = sanitizeLocalAiBase(req.body?.endpoint);
    if (!base) {
      return res.status(400).json({ ok: false, error: 'Invalid Local AI endpoint URL' });
    }
    const requestedModel =
      typeof req.body?.model === 'string' && req.body.model.trim()
        ? req.body.model.trim()
        : 'gemma-4-E2B-it-Q4_K_M';
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const systemPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt : '';
    const userPrompt = typeof req.body?.userPrompt === 'string' ? req.body.userPrompt : '';

    if (!userPrompt) {
      return res.status(400).json({ ok: false, error: 'Empty command' });
    }

    const callCompletions = async (modelId: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        return await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model: modelId,
            temperature: 0.1,
            max_tokens: 420,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
        });
      } finally {
        clearTimeout(timer);
      }
    };

    const started = Date.now();
    try {
      let upstream = await callCompletions(requestedModel);

      // If exact model ID was not found in Jan, auto-discover loaded model from /models once
      if (!upstream.ok && (upstream.status === 400 || upstream.status === 404)) {
        try {
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
          const modelsRes = await fetch(`${base}/models`, { headers });
          if (modelsRes.ok) {
            const modelsData = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
            const firstModel = modelsData.data?.[0]?.id;
            if (firstModel && firstModel !== requestedModel) {
              upstream = await callCompletions(firstModel);
            }
          }
        } catch {
          // Keep original upstream response
        }
      }

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        return res.json({
          ok: false,
          error: `Local AI HTTP ${upstream.status}${errText ? `: ${errText.slice(0, 140)}` : ''}`,
        });
      }

      const payload = (await upstream.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = payload.choices?.[0]?.message?.content ?? '';
      return res.json({
        ok: true,
        rawText,
        modelUsed: payload.model || requestedModel,
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      return res.json({
        ok: false,
        error: (err as Error).message || 'Could not reach Local AI server (check Jan Local API Server)',
      });
    }
  });

  // Unified AI Copilot & Analytical Engine Endpoint (Gemini 4 Server-Side + OpenAI-Compatible APIs + Local GGUF)
  const PROVIDER_DEFAULT_ENDPOINTS: Record<string, string> = {
    jan: 'http://127.0.0.1:1337/v1',
    llama_server: 'http://127.0.0.1:8080/v1',
    ollama: 'http://127.0.0.1:11434/v1',
    lmstudio: 'http://127.0.0.1:1234/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    openai: 'https://api.openai.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
  };

  const PROVIDER_DEFAULT_ENV_KEYS: Record<string, string> = {
    gemini: 'GEMINI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    jan: 'LOCAL_AI_API_KEY',
    llama_server: 'LOCAL_AI_API_KEY',
    ollama: 'LOCAL_AI_API_KEY',
    lmstudio: 'LOCAL_AI_API_KEY',
    custom: 'CUSTOM_AI_API_KEY',
  };

  const resolveServerEnvKey = (provider: string, requestedEnvName?: string, legacyInlineKey?: string): string => {
    const safeName =
      typeof requestedEnvName === 'string' && /^[A-Z][A-Z0-9_]{1,48}$/.test(requestedEnvName.trim())
        ? requestedEnvName.trim()
        : PROVIDER_DEFAULT_ENV_KEYS[provider] || '';
    const fromEnv = safeName ? (process.env[safeName] || '').trim() : '';
    if (fromEnv && !fromEnv.startsWith('MY_')) return fromEnv;
    const fallbackEnv = PROVIDER_DEFAULT_ENV_KEYS[provider] ? (process.env[PROVIDER_DEFAULT_ENV_KEYS[provider]] || '').trim() : '';
    if (fallbackEnv && !fallbackEnv.startsWith('MY_')) return fallbackEnv;
    return typeof legacyInlineKey === 'string' ? legacyInlineKey.trim() : '';
  };

  app.post('/api/assistant/test', async (req, res) => {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider.trim() : 'gemini';
    const envKeyName = typeof req.body?.envKeyName === 'string' ? req.body.envKeyName.trim() : '';
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';

    if (provider === 'gemini') {
      const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        return res.json({
          ok: false,
          provider: 'gemini',
          models: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
          error: 'GEMINI_API_KEY is not configured in Settings > Secrets / .env',
        });
      }
      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const targetModel = model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
        await withTimeout(
          ai.models.generateContent({
            model: targetModel,
            contents: 'Reply with OK',
            config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
          }),
          15000,
          'Gemini connection test'
        );
        return res.json({
          ok: true,
          provider: 'gemini',
          models: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
        });
      } catch (err) {
        return res.json({
          ok: false,
          provider: 'gemini',
          models: ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
          error: (err as Error).message || 'Gemini connection failed',
        });
      }
    }

    const base = sanitizeLocalAiBase(req.body?.endpoint || PROVIDER_DEFAULT_ENDPOINTS[provider]);
    if (!base) {
      return res.status(400).json({ ok: false, models: [], error: 'Invalid API endpoint URL' });
    }
    const bearer = resolveServerEnvKey(provider, envKeyName, req.body?.apiKey);
    const isCloud = provider === 'openrouter' || provider === 'openai' || provider === 'deepseek';
    if (isCloud && !bearer) {
      const expectedVar = envKeyName || PROVIDER_DEFAULT_ENV_KEYS[provider] || 'CUSTOM_AI_API_KEY';
      return res.json({
        ok: false,
        endpoint: base,
        models: [],
        error: `Server environment key "${expectedVar}" is not set in .env / Secrets`,
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      const upstream = await fetch(`${base}/models`, { headers, signal: controller.signal });
      if (!upstream.ok) {
        return res.json({ ok: false, endpoint: base, models: [], error: `HTTP ${upstream.status}` });
      }
      const data = (await upstream.json()) as { data?: Array<{ id?: string }> };
      const models = (data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
      return res.json({ ok: true, endpoint: base, models });
    } catch (err) {
      return res.json({
        ok: false,
        endpoint: base,
        models: [],
        error: (err as Error).message || 'Provider endpoint unreachable',
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.post('/api/assistant/chat', async (req, res) => {
    const provider = typeof req.body?.provider === 'string' ? req.body.provider.trim() : 'gemini';
    const requestedModel = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
    const envKeyName = typeof req.body?.envKeyName === 'string' ? req.body.envKeyName.trim() : '';
    const thinkingDepth = req.body?.thinkingDepth === 'fast' ? 'fast' : 'deep';
    const systemInstruction =
      typeof req.body?.systemInstruction === 'string' ? req.body.systemInstruction : '';
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const cleanMessages: Array<{ role: 'user' | 'assistant'; content: string }> = rawMessages
      .filter(
        (m: unknown): m is { role: 'user' | 'assistant'; content: string } =>
          Boolean(m && typeof m === 'object' && typeof (m as { content?: unknown }).content === 'string')
      )
      .slice(-14)
      .map((m: { role: 'user' | 'assistant'; content: string }) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content.trim(),
      }))
      .filter((m: { role: 'user' | 'assistant'; content: string }) => m.content.length > 0);

    if (cleanMessages.length === 0) {
      return res.status(400).json({ ok: false, error: 'Empty conversation' });
    }

    const started = Date.now();

    // Branch A: Server-Side Gemini Engine (@google/genai)
    if (provider === 'gemini') {
      const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
        return res.json({
          ok: false,
          code: 'MISSING_KEY',
          error:
            'کلید سرور GEMINI_API_KEY در تنظیمات Secrets / .env تنظیم نشده است. می‌توانید در تنظیمات دستیار مدل لوکال Jan را انتخاب کنید.',
        });
      }

      const safeModel =
        requestedModel === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const contents = cleanMessages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

        const response = await withTimeout(
          ai.models.generateContent({
            model: safeModel,
            contents,
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              thinkingConfig: {
                thinkingLevel:
                  safeModel === 'gemini-3.1-flash-lite'
                    ? ThinkingLevel.MINIMAL
                    : thinkingDepth === 'deep'
                    ? ThinkingLevel.HIGH
                    : ThinkingLevel.MEDIUM,
              },
            },
          }),
          35000,
          'Gemini chat'
        );

        const rawText = response.text ?? '';
        return res.json({
          ok: true,
          rawText,
          modelUsed: safeModel,
          latencyMs: Date.now() - started,
        });
      } catch (err) {
        return res.json({
          ok: false,
          code: 'UPSTREAM_ERROR',
          error: (err as Error).message || 'Gemini API request failed',
        });
      }
    }

    // Branch B: OpenAI-Compatible Local (Jan / Ollama / llama-server / LM Studio) or Cloud API (OpenRouter / OpenAI / DeepSeek / Custom)
    const base = sanitizeLocalAiBase(req.body?.endpoint || PROVIDER_DEFAULT_ENDPOINTS[provider]);
    if (!base) {
      return res.status(400).json({ ok: false, error: 'Invalid AI endpoint URL' });
    }
    const bearer = resolveServerEnvKey(provider, envKeyName, req.body?.apiKey);
    const isCloud = provider === 'openrouter' || provider === 'openai' || provider === 'deepseek';
    if (isCloud && !bearer) {
      const expectedVar = envKeyName || PROVIDER_DEFAULT_ENV_KEYS[provider] || 'CUSTOM_AI_API_KEY';
      return res.json({
        ok: false,
        code: 'MISSING_KEY',
        error: `کلید API سرور (${expectedVar}) در فایل .env / Secrets تنظیم نشده است.`,
      });
    }

    const fallbackModel = requestedModel || 'gemma-4-E2B-it-Q4_K_M';

    const callOpenAiCompat = async (modelId: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), isCloud ? 40000 : 25000);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (bearer) headers.Authorization = `Bearer ${bearer}`;
        return await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            model: modelId,
            temperature: 0.2,
            max_tokens: 1400,
            messages: [
              { role: 'system', content: systemInstruction },
              ...cleanMessages,
            ],
          }),
        });
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      let upstream = await callOpenAiCompat(fallbackModel);
      if (!upstream.ok && (upstream.status === 400 || upstream.status === 404) && !isCloud) {
        try {
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (bearer) headers.Authorization = `Bearer ${bearer}`;
          const modelsRes = await fetch(`${base}/models`, { headers });
          if (modelsRes.ok) {
            const modelsData = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
            const firstModel = modelsData.data?.[0]?.id;
            if (firstModel && firstModel !== fallbackModel) {
              upstream = await callOpenAiCompat(firstModel);
            }
          }
        } catch {
          // keep original upstream error
        }
      }

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        return res.json({
          ok: false,
          code: 'UPSTREAM_ERROR',
          error: `AI HTTP ${upstream.status}${errText ? `: ${errText.slice(0, 160)}` : ''}`,
        });
      }

      const payload = (await upstream.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawText = payload.choices?.[0]?.message?.content ?? '';
      return res.json({
        ok: true,
        rawText,
        modelUsed: payload.model || fallbackModel,
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      return res.json({
        ok: false,
        code: 'UNREACHABLE',
        error: (err as Error).message || 'Could not reach AI provider endpoint',
      });
    }
  });

  // Export 100% self-contained single-file FundTrack-App.html (zero server / zero terminal needed)
  const serveSingleFileHtml = async (embeddedState: unknown, res: express.Response) => {
    try {
      const singleFilePath = path.join(__dirname, 'dist-single', 'index.html');
      if (!fs.existsSync(singleFilePath)) {
        const viteBin = path.join(__dirname, 'node_modules', '.bin', 'vite');
        await execFileAsync(viteBin, ['build', '--config', 'vite.singlefile.config.ts'], {
          cwd: __dirname,
          env: { ...process.env },
        });
      }

      if (!fs.existsSync(singleFilePath)) {
        return res.status(500).json({ ok: false, error: 'Failed to generate single-file bundle' });
      }

      let html = fs.readFileSync(singleFilePath, 'utf8');
      html = html.replace(/<script type="module" crossorigin/g, '<script type="module"');

      // Inline SVG icon as data URI so there are zero external relative file dependencies
      const svgPath = path.join(__dirname, 'public', 'icon.svg');
      if (fs.existsSync(svgPath)) {
        const svgB64 = fs.readFileSync(svgPath).toString('base64');
        html = html.replace(/href="\.\/icon\.svg"/g, `href="data:image/svg+xml;base64,${svgB64}"`);
      }

      const appleIconPath = path.join(__dirname, 'public', 'apple-touch-icon.png');
      if (fs.existsSync(appleIconPath)) {
        const pngB64 = fs.readFileSync(appleIconPath).toString('base64');
        html = html.replace(/href="\.\/apple-touch-icon\.png"/g, `href="data:image/png;base64,${pngB64}"`);
      }

      if (embeddedState && typeof embeddedState === 'object') {
        const safeJson = JSON.stringify(embeddedState).replace(/<\//g, '<\\/');
        const seedScript = `<script>window.__FUNDTRACK_EMBEDDED_STATE__=${safeJson};</script>`;
        if (html.includes('<div id="root"></div>')) {
          html = html.replace('<div id="root"></div>', `${seedScript}<div id="root"></div>`);
        } else {
          html = html.replace('<body>', `<body>${seedScript}`);
        }
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="FundTrack-App.html"');
      return res.send(html);
    } catch (err) {
      return res.status(500).json({ ok: false, error: (err as Error).message });
    }
  };

  app.get('/api/export-singlefile', async (_req, res) => {
    await serveSingleFileHtml(null, res);
  });

  app.post('/api/export-singlefile', async (req, res) => {
    await serveSingleFileHtml(req.body?.state ?? null, res);
  });

  // --- Hybrid LAN Local Sync Database (Protected with Timing-Safe Sync Key) ---
  app.get('/api/sync/info', (_req, res) => {
    const existing = readLanStoredRecord();
    res.json({
      ok: true,
      port: PORT,
      lanUrls: getLanUrls(PORT),
      hasData: Boolean(existing),
      revision: existing?.revision ?? 0,
      updatedAt: existing?.updatedAt ?? null,
      encrypted: existing?.encrypted ?? false,
      requiresKey: true,
    });
  });

  app.get('/api/sync/host-key', (req, res) => {
    const existing = readLanStoredRecord();
    if (!isLoopbackIp(req) && existing) {
      return res.status(403).json({
        ok: false,
        error: 'Host pairing key can only be read directly from the host machine (localhost) once data exists.',
      });
    }
    return res.json({
      ok: true,
      syncKey: getOrCreateLanSyncKey(),
    });
  });

  app.post('/api/sync/rotate-key', (req, res) => {
    const provided = req.header('X-FundTrack-Sync-Key');
    if (!isLoopbackIp(req) && !isValidSyncKey(provided)) {
      return res.status(403).json({ ok: false, error: 'Unauthorized key rotation' });
    }
    ensureSyncDataDir();
    const fresh = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(SYNC_KEY_FILE, fresh, { encoding: 'utf8', mode: 0o600 });
    return res.json({ ok: true, syncKey: fresh });
  });

  app.get('/api/sync/state', (req, res) => {
    const provided = req.header('X-FundTrack-Sync-Key');
    if (!isValidSyncKey(provided)) {
      return res.status(401).json({ ok: false, error: 'INVALID_SYNC_KEY' });
    }
    const existing = readLanStoredRecord();
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'NO_LAN_DATA_YET' });
    }
    return res.json({
      ok: true,
      revision: existing.revision,
      updatedAt: existing.updatedAt,
      encrypted: existing.encrypted,
      payload: existing.payload,
    });
  });

  app.post('/api/sync/state', (req, res) => {
    const provided = req.header('X-FundTrack-Sync-Key');
    if (!isValidSyncKey(provided)) {
      return res.status(401).json({ ok: false, error: 'INVALID_SYNC_KEY' });
    }
    const body = req.body as {
      revision?: number;
      updatedAt?: string;
      encrypted?: boolean;
      payload?: unknown;
    };
    if (!body || typeof body !== 'object' || !body.payload || typeof body.payload !== 'object') {
      return res.status(400).json({ ok: false, error: 'INVALID_SYNC_PAYLOAD' });
    }
    const prev = readLanStoredRecord();
    const nextRevision = Math.max((prev?.revision ?? 0) + 1, Number(body.revision) || 1);
    const updatedAt =
      typeof body.updatedAt === 'string' && body.updatedAt ? body.updatedAt : new Date().toISOString();
    const record: LanStoredRecord = {
      revision: nextRevision,
      updatedAt,
      encrypted: Boolean(body.encrypted),
      payload: body.payload,
    };
    writeLanStoredRecord(record);
    return res.json({
      ok: true,
      revision: record.revision,
      updatedAt: record.updatedAt,
      encrypted: record.encrypted,
    });
  });

  // --- Export Standalone Android Studio Kotlin Project (.tar.gz) ---
  app.get('/api/export-android-project', (req, res) => {
    try {
      const androidDir = path.join(__dirname, 'android-app');
      if (!fs.existsSync(androidDir)) {
        return res.status(404).json({ ok: false, error: 'Android project template not found' });
      }
      const files = collectFilesRecursive(androidDir, 'FundTrack-Android');
      const lanQuery = typeof req.query.lanUrl === 'string' ? req.query.lanUrl.trim() : '';
      const detectedUrl = getLanUrls(PORT)[0] || `http://192.168.1.100:${PORT}`;
      const targetServerUrl = /^https?:\/\//i.test(lanQuery) ? lanQuery : detectedUrl;

      const safeUrl = targetServerUrl
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const patchedFiles = files.map((f) => {
        if (f.name.endsWith('/strings.xml')) {
          const updatedXml = f.content
            .toString('utf8')
            .replace(
              /<string name="default_server_url">[^<]*<\/string>/,
              `<string name="default_server_url">${safeUrl}</string>`
            );
          return { ...f, content: Buffer.from(updatedXml, 'utf8') };
        }
        return f;
      });

      const archive = createTarGzArchive(patchedFiles);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="FundTrack-Android-App.tar.gz"');
      return res.send(archive);
    } catch (err) {
      return res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FundTrack server running on http://localhost:${PORT}`);
  });
}

startServer();
