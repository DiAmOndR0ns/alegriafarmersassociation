import bcrypt from 'bcryptjs';
import { sha256 } from './audit';

/**
 * Constant-time string comparison so hash verification does not leak how many
 * leading characters of a candidate hash matched the stored one.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const BCRYPT_COST = 12;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_HISTORY_LIMIT = 5;
export const PASSWORD_EXPIRY_DAYS = 90;

export interface PasswordHistoryEntry {
  hash: string;
  changedAt: string;
}

export function validatePasswordPolicy(
  password: string,
  username: string,
  role: string,
  history: PasswordHistoryEntry[] = []
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return 'Password must be at least 12 characters long.';
  }
  if (
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return 'Use uppercase and lowercase letters, a number, and a special character.';
  }

  const lowered = password.toLowerCase();
  const prohibited = [username, role, 'password'].filter((part) => part.trim().length > 0);
  if (prohibited.some((part) => lowered.includes(part.toLowerCase()))) {
    return 'Password cannot contain your username, role, or the word "password".';
  }
  if (
    /(?:01234|12345|23456|34567|45678|56789|67890|09876|98765|87654|76543|65432|54321|43210|qwerty|asdfgh|zxcvbn)/i.test(
      password
    )
  ) {
    return 'Password cannot contain common sequential or keyboard patterns.';
  }

  const recent = (Array.isArray(history) ? history : []).slice(-PASSWORD_HISTORY_LIMIT);
  if (
    recent.some((entry) =>
      entry.hash?.startsWith('$2')
        ? bcrypt.compareSync(password, entry.hash)
        : entry.hash?.startsWith('sha256$')
          ? constantTimeEquals(createLegacySha256(password), entry.hash)
          : entry.hash === password
    )
  ) {
    return 'You cannot reuse any of your last 5 passwords.';
  }
  return null;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_COST);
}

export function verifyPassword(
  password: string,
  hash?: string,
  legacyPassword?: string
): boolean {
  if (!password) return false;
  if (hash?.startsWith('$2')) {
    try {
      return bcrypt.compareSync(password, hash);
    } catch {
      return false;
    }
  }
  if (hash?.startsWith('sha256$')) {
    return constantTimeEquals(createLegacySha256(password), hash);
  }
  if (hash && constantTimeEquals(password.trim(), hash.trim())) {
    return true;
  }
  return Boolean(legacyPassword && constantTimeEquals(password.trim(), legacyPassword.trim()));
}

export function isLegacyPasswordHash(hash?: string): boolean {
  return Boolean(hash && !hash.startsWith('$2'));
}

export function needsInitialPasswordChange(_user: {
  id: string;
  role: string;
  passwordChangedAt?: string;
  mustChangePassword?: boolean;
}): boolean {
  return false;
}

// Lockout policy: after MAX_LOGIN_ATTEMPTS consecutive failures, sign-in is blocked for LOCKOUT_DURATION_MS.
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LockoutState {
  failedLoginAttempts?: number;
  lockedUntil?: string;
}

/**
 * Returns whether the account is currently locked, and how long remains (in ms).
 * A lock whose expiry has passed is treated as no longer active.
 */
export function getLockoutStatus(
  user: LockoutState,
  now: number = Date.now()
): { locked: boolean; remainingMs: number } {
  if (!user.lockedUntil) return { locked: false, remainingMs: 0 };
  const remaining = new Date(user.lockedUntil).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { locked: false, remainingMs: 0 };
  }
  return { locked: true, remainingMs: remaining };
}

/**
 * Produces the next lockout fields after a failed sign-in attempt.
 * The counter resets to zero and the lock is lifted once the account has been
 * successfully unlocked by an officer or after a successful sign-in.
 */
export function registerFailedLogin(
  user: LockoutState,
  now: number = Date.now()
): { failedLoginAttempts: number; lockedUntil?: string } {
  const nextAttempts = (user.failedLoginAttempts || 0) + 1;
  if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
    return {
      failedLoginAttempts: nextAttempts,
      lockedUntil: new Date(now + LOCKOUT_DURATION_MS).toISOString()
    };
  }
  return { failedLoginAttempts: nextAttempts };
}

/**
 * Legacy SHA-256 hash (browser-safe).
 * Uses the pure TypeScript implementation from audit.ts.
 * Format remains identical to the old Node version: "sha256$<hex>"
 */
function createLegacySha256(password: string): string {
  return `sha256$${sha256(`bafa_secure_salt_v1:${password.trim()}`)}`;
}

/**
 * Optional async Web Crypto version (if you later want to make callers async).
 * Kept here for reference / future migration.
 */
export async function createLegacySha256Async(password: string): Promise<string> {
  const data = new TextEncoder().encode(`bafa_secure_salt_v1:${password.trim()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256$${hex}`;
}

export function generateInitialPassword(username = '', role = ''): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-_';
  const pick = (set: string) => set[globalThis.crypto.getRandomValues(new Uint8Array(1))[0] % set.length];
  let password = '';
  do {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(20));
    password = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
    password = `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ')}${pick('abcdefghijkmnopqrstuvwxyz')}${pick('23456789')}${pick('!@#$%&*+-_')}${password.slice(4)}`;
  } while (validatePasswordPolicy(password, username, role));
  return password;
}

export function getPasswordExpiryStatus(passwordChangedAt?: string): {
  expired: boolean;
  warning: boolean;
  daysRemaining: number;
} {
  const changedAt = passwordChangedAt ? new Date(passwordChangedAt).getTime() : 0;
  if (!Number.isFinite(changedAt)) {
    return { expired: true, warning: false, daysRemaining: 0 };
  }
  const elapsedDays = Math.floor((Date.now() - changedAt) / 86_400_000);
  const daysRemaining = Math.max(0, PASSWORD_EXPIRY_DAYS - elapsedDays);
  return {
    expired: elapsedDays >= PASSWORD_EXPIRY_DAYS,
    warning: elapsedDays >= PASSWORD_EXPIRY_DAYS - 7 && elapsedDays < PASSWORD_EXPIRY_DAYS,
    daysRemaining,
  };
}
