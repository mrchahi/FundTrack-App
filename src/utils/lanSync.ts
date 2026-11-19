import { FundTrackState } from '../types';
import {
  createBackupEnvelope,
  fetchLatestDriveSyncSnapshot,
  getCachedDriveToken,
  parseAndValidateBackup,
  uploadDriveSyncSnapshot,
} from './googleDriveBackup';
import {
  decryptSyncPayload,
  encryptSyncPayload,
  isEncryptedSyncEnvelope,
} from './security';

export interface LanSyncServerInfo {
  reachable: boolean;
  lanUrls: string[];
  port: number;
  hasData: boolean;
  revision: number;
  updatedAt: string | null;
  encrypted: boolean;
  requiresKey: boolean;
  error?: string;
}

export interface DecodedSyncStateResult {
  state: FundTrackState;
  stats: ReturnType<typeof parseAndValidateBackup>['stats'];
  revision: number;
  updatedAt: string;
  wasEncrypted: boolean;
}

export function resolveLanBaseUrl(configuredUrl?: string): string {
  const trimmed = (configuredUrl || '').trim().replace(/\/+$/, '');
  if (trimmed) return trimmed;
  if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
    return window.location.origin;
  }
  return '';
}

const PAIR_HASH_PREFIX = 'ft_pair=';

function encodeBase64UrlUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlUtf8(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Generates a 1-click pairing URL using URL fragment (#ft_pair=...) so keys never touch HTTP logs/queries.
 */
export function buildMobilePairingUrl(baseUrl: string, syncKey: string): string {
  const cleanBase = resolveLanBaseUrl(baseUrl);
  const payload = JSON.stringify({ u: cleanBase, k: syncKey.trim() });
  const encoded = encodeBase64UrlUtf8(payload);
  return `${cleanBase}/#${PAIR_HASH_PREFIX}${encoded}`;
}

export function parseMobilePairingHash(): { url: string; syncKey: string } | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const rawHash = window.location.hash.replace(/^#/, '');
  const pairPart = rawHash
    .split('&')
    .find((part) => part.startsWith(PAIR_HASH_PREFIX));
  if (!pairPart) return null;
  try {
    const token = pairPart.slice(PAIR_HASH_PREFIX.length);
    const parsed = JSON.parse(decodeBase64UrlUtf8(token)) as { u?: string; k?: string };
    if (!parsed || typeof parsed.k !== 'string' || !parsed.k.trim()) return null;
    return {
      url: typeof parsed.u === 'string' && parsed.u.trim() ? parsed.u.trim().replace(/\/+$/, '') : window.location.origin,
      syncKey: parsed.k.trim(),
    };
  } catch {
    return null;
  }
}

export function clearMobilePairingHash(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

/**
 * Strip sensitive ephemeral secrets before syncing across LAN or Cloud Drive.
 */
export function sanitizeStateForSync(state: FundTrackState): FundTrackState {
  return {
    ...state,
    settings: {
      ...state.settings,
      // Keep pinHash, clear legacy plaintext pinCode if hashed
      pinCode: state.settings.pinHash ? '' : state.settings.pinCode,
      // Never leak raw AI API keys or LAN sync key inside synced database payload
      lanSyncKey: undefined,
      localAi: state.settings.localAi
        ? {
            ...state.settings.localAi,
            apiKey: undefined,
          }
        : undefined,
    },
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 2600
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLanSyncInfo(
  configuredUrl?: string
): Promise<LanSyncServerInfo> {
  const base = resolveLanBaseUrl(configuredUrl);
  if (!base) {
    return {
      reachable: false,
      lanUrls: [],
      port: 3000,
      hasData: false,
      revision: 0,
      updatedAt: null,
      encrypted: false,
      requiresKey: true,
      error: 'LAN_URL_MISSING',
    };
  }
  try {
    const res = await fetchWithTimeout(`${base}/api/sync/info`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return {
        reachable: false,
        lanUrls: [],
        port: 3000,
        hasData: false,
        revision: 0,
        updatedAt: null,
        encrypted: false,
        requiresKey: true,
        error: `HTTP_${res.status}`,
      };
    }
    const data = (await res.json()) as Partial<LanSyncServerInfo> & { ok?: boolean };
    return {
      reachable: Boolean(data.ok),
      lanUrls: Array.isArray(data.lanUrls) ? data.lanUrls : [],
      port: Number(data.port) || 3000,
      hasData: Boolean(data.hasData),
      revision: Number(data.revision) || 0,
      updatedAt: data.updatedAt ?? null,
      encrypted: Boolean(data.encrypted),
      requiresKey: data.requiresKey !== false,
    };
  } catch (err) {
    return {
      reachable: false,
      lanUrls: [],
      port: 3000,
      hasData: false,
      revision: 0,
      updatedAt: null,
      encrypted: false,
      requiresKey: true,
      error: (err as Error).message || 'LAN_UNREACHABLE',
    };
  }
}

export async function fetchHostPairingKey(configuredUrl?: string): Promise<string | null> {
  const base = resolveLanBaseUrl(configuredUrl);
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}/api/sync/host-key`);
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; syncKey?: string };
    return data.ok && typeof data.syncKey === 'string' ? data.syncKey : null;
  } catch {
    return null;
  }
}

export async function rotateHostPairingKey(
  configuredUrl: string | undefined,
  currentKey?: string
): Promise<string | null> {
  const base = resolveLanBaseUrl(configuredUrl);
  if (!base) return null;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentKey?.trim()) headers['X-FundTrack-Sync-Key'] = currentKey.trim();
    const res = await fetchWithTimeout(`${base}/api/sync/rotate-key`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; syncKey?: string };
    return data.ok && typeof data.syncKey === 'string' ? data.syncKey : null;
  } catch {
    return null;
  }
}

export async function buildSyncEnvelope(
  state: FundTrackState,
  e2ePassphrase?: string
): Promise<{ payload: unknown; encrypted: boolean; revision: number; updatedAt: string }> {
  const sanitized = sanitizeStateForSync(state);
  const revision = (state.settings.stateRevision ?? 0) + 1;
  const updatedAt = new Date().toISOString();
  const baseEnvelope = createBackupEnvelope({
    ...sanitized,
    settings: {
      ...sanitized.settings,
      stateRevision: revision,
      stateUpdatedAt: updatedAt,
    },
  });

  if (state.settings.e2eEncryptionEnabled && e2ePassphrase && e2ePassphrase.trim().length >= 4) {
    const encryptedEnv = await encryptSyncPayload(baseEnvelope, e2ePassphrase.trim(), {
      updatedAt,
      revision,
    });
    return { payload: encryptedEnv, encrypted: true, revision, updatedAt };
  }

  return { payload: baseEnvelope, encrypted: false, revision, updatedAt };
}

export async function decodeSyncEnvelope(
  rawPayload: unknown,
  e2ePassphrase?: string,
  meta?: { revision?: number; updatedAt?: string }
): Promise<DecodedSyncStateResult> {
  if (isEncryptedSyncEnvelope(rawPayload)) {
    const decrypted = await decryptSyncPayload<unknown>(rawPayload, e2ePassphrase || '');
    const parsed = parseAndValidateBackup(decrypted);
    return {
      state: parsed.state,
      stats: parsed.stats,
      revision: Number(meta?.revision ?? rawPayload.revision ?? parsed.state.settings.stateRevision ?? 1),
      updatedAt: meta?.updatedAt ?? rawPayload.updatedAt ?? parsed.exportedAt ?? new Date().toISOString(),
      wasEncrypted: true,
    };
  }
  const parsed = parseAndValidateBackup(rawPayload);
  return {
    state: parsed.state,
    stats: parsed.stats,
    revision: Number(meta?.revision ?? parsed.state.settings.stateRevision ?? 1),
    updatedAt: meta?.updatedAt ?? parsed.exportedAt ?? parsed.state.settings.stateUpdatedAt ?? new Date().toISOString(),
    wasEncrypted: false,
  };
}

export async function pushStateToLanDb(
  state: FundTrackState,
  opts: { url?: string; syncKey: string; e2ePassphrase?: string }
): Promise<{ ok: true; revision: number; updatedAt: string; encrypted: boolean }> {
  const base = resolveLanBaseUrl(opts.url || state.settings.lanSyncUrl);
  if (!base) throw new Error('LAN_URL_MISSING');
  if (!opts.syncKey.trim()) throw new Error('SYNC_KEY_REQUIRED');

  const built = await buildSyncEnvelope(state, opts.e2ePassphrase);
  const res = await fetchWithTimeout(
    `${base}/api/sync/state`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FundTrack-Sync-Key': opts.syncKey.trim(),
      },
      body: JSON.stringify({
        revision: built.revision,
        updatedAt: built.updatedAt,
        encrypted: built.encrypted,
        payload: built.payload,
      }),
    },
    5000
  );

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    revision?: number;
    updatedAt?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `LAN_PUSH_HTTP_${res.status}`);
  }
  return {
    ok: true,
    revision: Number(data.revision ?? built.revision),
    updatedAt: data.updatedAt ?? built.updatedAt,
    encrypted: built.encrypted,
  };
}

export async function pullStateFromLanDb(opts: {
  url?: string;
  syncKey: string;
  e2ePassphrase?: string;
}): Promise<DecodedSyncStateResult> {
  const base = resolveLanBaseUrl(opts.url);
  if (!base) throw new Error('LAN_URL_MISSING');
  if (!opts.syncKey.trim()) throw new Error('SYNC_KEY_REQUIRED');

  const res = await fetchWithTimeout(
    `${base}/api/sync/state`,
    {
      headers: {
        Accept: 'application/json',
        'X-FundTrack-Sync-Key': opts.syncKey.trim(),
      },
    },
    5000
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    revision?: number;
    updatedAt?: string;
    payload?: unknown;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `LAN_PULL_HTTP_${res.status}`);
  }
  return decodeSyncEnvelope(data.payload, opts.e2ePassphrase, {
    revision: data.revision,
    updatedAt: data.updatedAt,
  });
}

export type HybridSyncCheckResult =
  | {
      channel: 'lan';
      info: LanSyncServerInfo;
    }
  | {
      channel: 'gdrive';
      fileName: string;
      modifiedTime: string;
      rawJson: unknown;
    }
  | {
      channel: 'gdrive_auth_needed';
    }
  | {
      channel: 'offline';
    };

/**
 * Tries LAN Database first (fast 2.6s timeout).
 * If off-LAN and internet is online, automatically falls back to Google Drive.
 */
export async function checkHybridSyncSource(configuredUrl?: string): Promise<HybridSyncCheckResult> {
  const lanInfo = await fetchLanSyncInfo(configuredUrl);
  if (lanInfo.reachable) {
    return { channel: 'lan', info: lanInfo };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    const token = getCachedDriveToken();
    if (!token) {
      return { channel: 'gdrive_auth_needed' };
    }
    const latest = await fetchLatestDriveSyncSnapshot(token);
    if (latest) {
      return {
        channel: 'gdrive',
        fileName: latest.file.name,
        modifiedTime: latest.file.modifiedTime,
        rawJson: latest.rawJson,
      };
    }
    return { channel: 'gdrive', fileName: '', modifiedTime: '', rawJson: null };
  }

  return { channel: 'offline' };
}

export async function pushStateHybrid(
  state: FundTrackState,
  opts: {
    url?: string;
    syncKey?: string;
    e2ePassphrase?: string;
    allowDriveFallback?: boolean;
  }
): Promise<{ channel: 'lan' | 'gdrive'; revision?: number; updatedAt: string; encrypted: boolean }> {
  const lanInfo = await fetchLanSyncInfo(opts.url || state.settings.lanSyncUrl);
  if (lanInfo.reachable && opts.syncKey?.trim()) {
    const res = await pushStateToLanDb(state, {
      url: opts.url || state.settings.lanSyncUrl,
      syncKey: opts.syncKey.trim(),
      e2ePassphrase: opts.e2ePassphrase,
    });
    return {
      channel: 'lan',
      revision: res.revision,
      updatedAt: res.updatedAt,
      encrypted: res.encrypted,
    };
  }

  if (opts.allowDriveFallback !== false) {
    const token = getCachedDriveToken();
    if (!token) {
      throw new Error('DRIVE_AUTH_REQUIRED');
    }
    const built = await buildSyncEnvelope(state, opts.e2ePassphrase);
    await uploadDriveSyncSnapshot(token, built.payload);
    return {
      channel: 'gdrive',
      revision: built.revision,
      updatedAt: built.updatedAt,
      encrypted: built.encrypted,
    };
  }

  throw new Error('NO_SYNC_TARGET_REACHABLE');
}
