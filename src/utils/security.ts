// Client-side Web Crypto utilities for PIN hashing and AES-256-GCM E2E sync encryption

export interface EncryptedSyncEnvelope {
  app: 'FundTrack';
  encrypted: true;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  updatedAt: string;
  revision?: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return toHex(new Uint8Array(digest));
  }
  // Fallback deterministic mixing if running on insecure non-localhost HTTP without subtle
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export async function hashPin(pin: string, existingSalt?: string): Promise<string> {
  const saltBytes =
    existingSalt && /^[0-9a-f]+$/i.test(existingSalt)
      ? fromHex(existingSalt)
      : typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(16))
      : new TextEncoder().encode(String(Date.now()));
  const saltHex = toHex(saltBytes);
  const digest = await sha256Hex(`fundtrack:pin:v1:${saltHex}:${pin}`);
  return `sha256$${saltHex}$${digest}`;
}

export async function verifyPin(
  enteredPin: string,
  storedHash?: string,
  legacyPlainPin?: string
): Promise<boolean> {
  if (storedHash && storedHash.startsWith('sha256$')) {
    const parts = storedHash.split('$');
    if (parts.length === 3) {
      const candidate = await hashPin(enteredPin, parts[1]);
      return constantTimeStringEqual(candidate, storedHash);
    }
  }
  if (typeof legacyPlainPin === 'string' && legacyPlainPin.length > 0) {
    return constantTimeStringEqual(enteredPin, legacyPlainPin);
  }
  return false;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WEB_CRYPTO_UNAVAILABLE');
  }
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptSyncPayload(
  payload: unknown,
  passphrase: string,
  meta?: { updatedAt?: string; revision?: number }
): Promise<EncryptedSyncEnvelope> {
  const cleanPass = passphrase.trim();
  if (cleanPass.length < 4) {
    throw new Error('Passphrase must be at least 4 characters.');
  }
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(cleanPass, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext
  );
  return {
    app: 'FundTrack',
    encrypted: true,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encryptedBuf)),
    updatedAt: meta?.updatedAt ?? new Date().toISOString(),
    revision: meta?.revision,
  };
}

export async function decryptSyncPayload<T = unknown>(
  envelope: EncryptedSyncEnvelope,
  passphrase: string
): Promise<T> {
  const cleanPass = passphrase.trim();
  if (!cleanPass) {
    throw new Error('PASSPHRASE_REQUIRED');
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const key = await deriveAesKey(cleanPass, salt, envelope.iterations || 100_000);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return JSON.parse(new TextDecoder().decode(plainBuf)) as T;
  } catch {
    throw new Error('DECRYPTION_FAILED');
  }
}

export function isEncryptedSyncEnvelope(raw: unknown): raw is EncryptedSyncEnvelope {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    o.app === 'FundTrack' &&
    o.encrypted === true &&
    typeof o.salt === 'string' &&
    typeof o.iv === 'string' &&
    typeof o.ciphertext === 'string'
  );
}
