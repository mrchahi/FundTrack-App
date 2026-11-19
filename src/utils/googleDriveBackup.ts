import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { FundTrackState } from '../types';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));

// Mandatory security rule: access token is cached in memory ONLY (never localStorage/sessionStorage).
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedFolderId: string | null = null;

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime: string;
}

export interface FundTrackBackupEnvelope {
  app: 'FundTrack';
  schemaVersion: number;
  exportedAt: string;
  stats: {
    trades: number;
    transactions: number;
    bankAccounts: number;
    mt5Accounts: number;
    goals: number;
    loans: number;
  };
  state: FundTrackState;
}

export function initGoogleDriveAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthSignedOut?: (user: User | null) => void
) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (!user) {
        cachedAccessToken = null;
        cachedFolderId = null;
      } else if (!isSigningIn) {
        // Firebase session persisted across reload, but OAuth access token is memory-only.
        cachedAccessToken = null;
      }
      if (onAuthSignedOut) onAuthSignedOut(user);
    }
  });
}

export async function googleDriveSignIn(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google Drive access token');
    }
    cachedAccessToken = credential.accessToken;
    cachedFolderId = null;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function googleDriveSignOut(): Promise<void> {
  await auth.signOut();
  cachedAccessToken = null;
  cachedFolderId = null;
}

export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGoogleUser(): User | null {
  return auth.currentUser;
}

export function createBackupEnvelope(state: FundTrackState): FundTrackBackupEnvelope {
  return {
    app: 'FundTrack',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    stats: {
      trades: state.trades.length,
      transactions: state.transactions.length,
      bankAccounts: state.bankAccounts.length,
      mt5Accounts: state.mt5Accounts.length,
      goals: state.goals.length,
      loans: state.loans.length,
    },
    state,
  };
}

export function parseAndValidateBackup(raw: unknown): {
  state: FundTrackState;
  exportedAt?: string;
  stats: FundTrackBackupEnvelope['stats'];
} {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid JSON backup file.');
  }
  const obj = raw as Record<string, unknown>;
  const candidate =
    obj.app === 'FundTrack' && obj.state && typeof obj.state === 'object'
      ? (obj.state as Record<string, unknown>)
      : obj;

  if (
    !Array.isArray(candidate.trades) ||
    !Array.isArray(candidate.bankAccounts) ||
    !Array.isArray(candidate.transactions) ||
    !candidate.settings ||
    typeof candidate.settings !== 'object'
  ) {
    throw new Error('File does not match FundTrack backup format.');
  }

  const validState = candidate as unknown as FundTrackState;
  return {
    state: validState,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : undefined,
    stats: {
      trades: validState.trades.length,
      transactions: validState.transactions.length,
      bankAccounts: validState.bankAccounts.length,
      mt5Accounts: Array.isArray(validState.mt5Accounts) ? validState.mt5Accounts.length : 0,
      goals: Array.isArray(validState.goals) ? validState.goals.length : 0,
      loans: Array.isArray(validState.loans) ? validState.loans.length : 0,
    },
  };
}

export function downloadLocalBackup(state: FundTrackState): string {
  const envelope = createBackupEnvelope(state);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  const fileName = `fundtrack-backup-${stamp}.json`;
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
}

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('AUTH_EXPIRED');
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Google Drive request failed (${res.status})`);
  }
  return res;
}

async function ensureBackupFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  const q = encodeURIComponent(
    "name = 'FundTrack Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
  );
  const listRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=5`,
    accessToken
  );
  const listJson = (await listRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (listJson.files && listJson.files.length > 0) {
    cachedFolderId = listJson.files[0].id;
    return cachedFolderId;
  }

  const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'FundTrack Backups',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const created = (await createRes.json()) as { id: string };
  cachedFolderId = created.id;
  return created.id;
}

export async function listDriveBackups(accessToken: string): Promise<DriveBackupFile[]> {
  const q = encodeURIComponent(
    "mimeType != 'application/vnd.google-apps.folder' and name contains 'fundtrack-backup-' and trashed = false"
  );
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,size,modifiedTime)&pageSize=20`,
    accessToken
  );
  const data = (await res.json()) as { files?: DriveBackupFile[] };
  return data.files ?? [];
}

export async function uploadDriveBackup(
  accessToken: string,
  state: FundTrackState,
  customEnvelope?: unknown
): Promise<DriveBackupFile> {
  const folderId = await ensureBackupFolder(accessToken);
  const envelope = customEnvelope ?? createBackupEnvelope(state);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  const fileName = `fundtrack-backup-${stamp}.json`;

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
  };

  const boundary = '-------FundTrackBackupBoundary' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(envelope, null, 2)}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime',
    accessToken,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    }
  );

  return (await res.json()) as DriveBackupFile;
}

export async function downloadDriveBackupRaw(
  accessToken: string,
  fileId: string
): Promise<unknown> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    accessToken
  );
  return await res.json();
}

export async function downloadDriveBackup(
  accessToken: string,
  fileId: string
): Promise<ReturnType<typeof parseAndValidateBackup>> {
  const json = await downloadDriveBackupRaw(accessToken, fileId);
  return parseAndValidateBackup(json);
}

export async function uploadDriveSyncSnapshot(
  accessToken: string,
  payload: unknown
): Promise<DriveBackupFile> {
  const folderId = await ensureBackupFolder(accessToken);
  const q = encodeURIComponent(
    `'${folderId}' in parents and name = 'fundtrack-sync-latest.json' and trashed = false`
  );
  const existingRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=2`,
    accessToken
  );
  const existingJson = (await existingRes.json()) as { files?: Array<{ id: string }> };
  const existingId = existingJson.files?.[0]?.id;

  const boundary = '-------FundTrackSyncBoundary' + Math.random().toString(36).slice(2);
  const metadata = existingId
    ? { name: 'fundtrack-sync-latest.json', mimeType: 'application/json' }
    : { name: 'fundtrack-sync-latest.json', parents: [folderId], mimeType: 'application/json' };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(payload)}\r\n` +
    `--${boundary}--`;

  const uploadUrl = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id,name,size,modifiedTime`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime';

  const res = await driveFetch(uploadUrl, accessToken, {
    method: existingId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  });

  return (await res.json()) as DriveBackupFile;
}

export async function fetchLatestDriveSyncSnapshot(
  accessToken: string
): Promise<{ file: DriveBackupFile; rawJson: unknown } | null> {
  const qSync = encodeURIComponent(
    "mimeType != 'application/vnd.google-apps.folder' and name = 'fundtrack-sync-latest.json' and trashed = false"
  );
  const syncRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${qSync}&orderBy=modifiedTime desc&fields=files(id,name,size,modifiedTime)&pageSize=1`,
    accessToken
  );
  const syncData = (await syncRes.json()) as { files?: DriveBackupFile[] };
  let targetFile = syncData.files?.[0];
  if (!targetFile) {
    const backups = await listDriveBackups(accessToken);
    targetFile = backups[0];
  }
  if (!targetFile) return null;
  const rawJson = await downloadDriveBackupRaw(accessToken, targetFile.id);
  return { file: targetFile, rawJson };
}

export async function deleteDriveBackup(accessToken: string, fileId: string): Promise<void> {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, accessToken, {
    method: 'DELETE',
  });
}
