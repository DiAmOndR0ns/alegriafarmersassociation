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
      value &= (1 << bits) - 1;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(str: string): Uint8Array {
  if (typeof str !== 'string') return new Uint8Array(0);
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
      value &= (1 << bits) - 1;
    }
  }

  return new Uint8Array(bytes);
}

export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (!cryptoObj?.getRandomValues) {
    // Never fall back to Math.random: predictable secrets would defeat MFA entirely.
    throw new Error('A secure cryptographic random source (crypto.getRandomValues) is required to generate TOTP secrets.');
  }
  cryptoObj.getRandomValues(bytes);
  return encodeBase32(bytes);
}

export function getTotpUri(secret: string, username: string, issuer = 'FAMS'): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Pure JavaScript SHA-1 implementation as standard fallback for non-secure HTTP contexts */
function sha1Fallback(bytes: Uint8Array): Uint8Array {
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const bitLen = bytes.length * 8;
  const newLen = ((bytes.length + 8) >> 6 << 6) + 64;
  const buf = new Uint8Array(newLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setBigUint64(newLen - 8, BigInt(bitLen), false);

  const w = new Uint32Array(80);
  for (let i = 0; i < newLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 80; j++) {
      const v = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (v << 1) | (v >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return out;
}

function hmacSha1Fallback(key: Uint8Array, message: Uint8Array): Uint8Array {
  let k = key;
  if (k.length > 64) k = sha1Fallback(k);
  const kPad = new Uint8Array(64);
  kPad.set(k);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = kPad[i] ^ 0x36;
    opad[i] = kPad[i] ^ 0x5c;
  }
  const innerMsg = new Uint8Array(64 + message.length);
  innerMsg.set(ipad);
  innerMsg.set(message, 64);
  const innerHash = sha1Fallback(innerMsg);

  const outerMsg = new Uint8Array(64 + 20);
  outerMsg.set(opad);
  outerMsg.set(innerHash, 64);
  return sha1Fallback(outerMsg);
}

async function hmacSha1(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (cryptoObj?.subtle) {
    try {
      const key = await cryptoObj.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      );
      const signature = await cryptoObj.subtle.sign('HMAC', key, message);
      return new Uint8Array(signature);
    } catch {
      // Fallback to pure JS if SubtleCrypto fails in restricted environments
      return hmacSha1Fallback(keyBytes, message);
    }
  }

  return hmacSha1Fallback(keyBytes, message);
}

export async function generateTotpCode(secret: string, timestampMs = Date.now()): Promise<string> {
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new Error('Secret must be a non-empty string.');
  }
  const step = Math.floor(timestampMs / 1000 / STEP_SECONDS);
  if (step < 0) {
    throw new Error('Timestamp must be non-negative.');
  }
  const counterBuffer = new Uint8Array(8);
  let tempStep = BigInt(step);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = Number(tempStep & 0xffn);
    tempStep >>= 8n;
  }

  const keyBytes = decodeBase32(secret);
  if (keyBytes.length === 0) {
    throw new Error('Invalid Base32 secret.');
  }
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

/** Constant-time string comparison to avoid leaking match position via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyTotpCode(
  secret: string,
  code: string,
  timestampMs = Date.now()
): Promise<boolean> {
  if (typeof secret !== 'string' || !secret.trim() || typeof code !== 'string') return false;
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) return false;

  // Check current window and +/- 1 window (90s tolerance)
  for (const delta of [0, -STEP_SECONDS * 1000, STEP_SECONDS * 1000]) {
    try {
      const expected = await generateTotpCode(secret, timestampMs + delta);
      if (safeEqual(expected, cleanCode)) return true;
    } catch {
      return false;
    }
  }

  return false;
}
