const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

export function encodeBase32(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(str: string): Uint8Array {
  const clean = str.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return encodeBase32(bytes);
}

export function getTotpUri(secret: string, username: string, issuer = 'FAMS'): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function hmacSha1(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error('Web Crypto API is required for TOTP verification.');
  }

  const key = await cryptoObj.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await cryptoObj.subtle.sign('HMAC', key, message);
  return new Uint8Array(signature);
}

export async function generateTotpCode(secret: string, timestampMs = Date.now()): Promise<string> {
  const step = Math.floor(timestampMs / 1000 / STEP_SECONDS);
  const counterBuffer = new Uint8Array(8);
  let tempStep = BigInt(step);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = Number(tempStep & 0xffn);
    tempStep >>= 8n;
  }

  const keyBytes = decodeBase32(secret);
  const digest = await hmacSha1(keyBytes, counterBuffer);

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const code = (binary % 1_000_000).toString().padStart(6, '0');
  return code;
}

export async function verifyTotpCode(
  secret: string,
  code: string,
  timestampMs = Date.now()
): Promise<boolean> {
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) return false;

  // Check current window and +/- 1 window (90s tolerance)
  for (const delta of [0, -STEP_SECONDS * 1000, STEP_SECONDS * 1000]) {
    try {
      const expected = await generateTotpCode(secret, timestampMs + delta);
      if (expected === cleanCode) return true;
    } catch {
      return false;
    }
  }

  return false;
}
