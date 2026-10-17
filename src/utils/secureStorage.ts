const STORAGE_PREFIX = 'bafa:v1:';
const LEGACY_STORAGE_PREFIX = 'bafa:legacy:';
const STORAGE_KEY_NAME = 'bafa_storage_key_v1';

let keyPromise: Promise<CryptoKey> | null = null;

function getOrCreateKey(): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    return Promise.reject(new Error('Secure local storage requires Web Crypto (HTTPS or localhost).'));
  }

  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = localStorage.getItem(STORAGE_KEY_NAME);
      if (existing) {
        const rawKey = Uint8Array.from(atob(existing), (char) => char.charCodeAt(0));
        return crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
      }

      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const importedKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
      const encodedKey = btoa(Array.from(rawKey, (byte) => String.fromCharCode(byte)).join(''));
      localStorage.setItem(STORAGE_KEY_NAME, encodedKey);
      return importedKey;
    })().catch((error) => {
      keyPromise = null;
      throw error;
    });
  }

  return keyPromise;
}

function encodeBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function getSecureItem<T = unknown>(key: string): Promise<T | null> {
  const stored = localStorage.getItem(key);
  if (stored === null) return null;

  if (!stored.startsWith(STORAGE_PREFIX)) {
    // Retain a one-time legacy copy until migration can be verified after reload.
    try {
      const plaintext = stored.startsWith(LEGACY_STORAGE_PREFIX) ? stored.slice(LEGACY_STORAGE_PREFIX.length) : stored;
      const parsed = JSON.parse(plaintext) as T;
      await setSecureItem(key, parsed);
      return parsed;
    } catch (error) {
      throw error;
    }
  }

  try {
    const encrypted = JSON.parse(stored.slice(STORAGE_PREFIX.length)) as { iv: string; data: string };
    if (typeof encrypted?.iv !== 'string' || typeof encrypted?.data !== 'string') {
      throw new Error('Encrypted storage record has an invalid format.');
    }
    const iv = decodeBase64(encrypted.iv);
    const ciphertext = decodeBase64(encrypted.data);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await getOrCreateKey(), ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch (error) {
    // Preserve unreadable ciphertext for recovery; callers must not treat it as missing data.
    throw new Error(`Unable to decrypt local storage item "${key}". The saved data was preserved.`, { cause: error });
  }
}

export async function setSecureItem(key: string, value: unknown): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getOrCreateKey(), plaintext);
  const serialized = `${STORAGE_PREFIX}${JSON.stringify({ iv: encodeBase64(iv), data: encodeBase64(new Uint8Array(ciphertext)) })}`;
  localStorage.setItem(key, serialized);
}

export function removeSecureItem(key: string): void {
  localStorage.removeItem(key);
}

export async function migrateSecureItems(keys: string[]): Promise<void> {
  await getOrCreateKey();
  for (const key of keys) {
    const stored = localStorage.getItem(key);
    if (stored === null || stored.startsWith(STORAGE_PREFIX)) continue;
    if (!stored.startsWith(LEGACY_STORAGE_PREFIX)) {
      // Keep plaintext backup until the new ciphertext has passed decryption verification.
      localStorage.setItem(key, `${LEGACY_STORAGE_PREFIX}${stored}`);
    }
    const migrated = await getSecureItem(key);
    if (migrated === null) throw new Error(`Failed to migrate local storage key ${key}`);
    const encrypted = localStorage.getItem(key);
    if (!encrypted?.startsWith(STORAGE_PREFIX)) throw new Error(`Encryption verification failed for ${key}`);
  }
}

export function clearSecureItems(keys: string[]): void {
  for (const key of keys) localStorage.removeItem(key);
}
