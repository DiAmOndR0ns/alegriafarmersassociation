import { cleanDateString, cleanText } from './sanitize';

/**
 * Regex-level validation for values that reach a typed column.
 *
 * `sanitize.ts` strips dangerous *content*; this module decides whether a value
 * is *acceptable at all* for its column. Validators return the normalised value
 * or `null`, so a caller can drop an invalid row instead of storing a guess.
 * Callers that have a sensible fallback (usually `null` for an optional column)
 * should use that; a required column should treat `null` as "reject the row".
 */

// --- Unset / placeholder handling -------------------------------------------

/** Values a CSV export or form leaves behind that mean "no value". */
const BLANK_PLACEHOLDERS = new Set([
  '',
  '-',
  '--',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'tbd',
  'n.a.',
  'not applicable'
]);

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return BLANK_PLACEHOLDERS.has(value.trim().toLowerCase());
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// --- Text -------------------------------------------------------------------

/**
 * Decision sign-off: `prefix` is a capitalised word ("Approved", "Flagged"),
 * an optional parenthetical, then optional free notes — e.g.
 * `Approved (Treasurer) - verified against receipt #12`.
 * Rejects stray digits or symbols where a status is expected and keeps the
 * status comparable across devices.
 */
const STATUS_WITH_NOTE = /^[A-Za-z][A-Za-z ]{0,40}(?:\s*\([A-Za-z .'-]{1,80}\))?(?:\s*[-:/]\s*[\w\s.,()'#/&%+-]{0,500})?$/;

/** A plain label: letters, digits, spaces and common punctuation, no markup. */
const LABEL = /^[\p{L}\p{N} .,'&()/#+:°_\-\u2013\u2014]{1,200}$/u;

/**
 * A display-only quantity such as "2", "1.5", "2 sacks" or "80/kl".
 * Use for text columns like `products.quantity_available`; numeric columns must
 * use {@link parseCount} or {@link parseMoney} instead.
 */
const QUANTITY_LABEL = /^\d{1,6}(?:\.\d{1,3})?(?:\s?[A-Za-z]{1,12})?(?:\s?\/\s?[A-Za-z]{1,12})?$/;

/**
 * Keeps text only if it matches `pattern` after sanitising. Returns `null` when
 * the value is blank or the shape is wrong, so optional columns can store NULL.
 */
export function matchText(
  value: unknown,
  pattern: RegExp,
  maxLength: number
): string | null {
  const cleaned = cleanText(value, maxLength)?.trim();
  if (!cleaned) return null;
  // A pattern with the global flag would advance lastIndex between calls.
  const safePattern = pattern.global ? new RegExp(pattern.source, pattern.flags.replace('g', '')) : pattern;
  return safePattern.test(cleaned) ? cleaned : null;
}

/** A status label with an optional parenthetical and note. */
export function cleanStatusText(value: unknown, maxLength = 100): string | null {
  return matchText(value, STATUS_WITH_NOTE, maxLength);
}

/** A human label (names, organisations, categories, locations). */
export function cleanLabel(value: unknown, maxLength = 200): string | null {
  return matchText(value, LABEL, maxLength);
}

export function cleanQuantityLabel(value: unknown): string | null {
  return matchText(value, QUANTITY_LABEL, 100);
}

// --- Numbers ----------------------------------------------------------------

const DECIMAL_WITH_SEPARATORS = /^-?(?:0|[1-9]\d{0,2}(?:,\d{3})*|[1-9]\d{0,14})(?:\.\d{1,4})?$/;
const INTEGER = /^-?(?:0|[1-9]\d{0,11})$/;

function parseNumeric(value: unknown, pattern: RegExp): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Round-trip through the string form so 1e21 and 0.30000000000000004 are
    // judged by the same rule as a value that arrived as text.
    return pattern.test(String(value)) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/[\u20B1\u20AC$]/g, '').trim();
  if (!text || !pattern.test(text)) return null;
  const parsed = Number(text.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Money. Accepts `1520`, `1520.50`, `1,520.50` and a leading currency symbol;
 * rejects `1e9`, `12abc`, `NaN`, `-5` (negative amounts must be modelled as an
 * expense type, not a sign) and anything above `max`.
 */
export function parseMoney(value: unknown, max = 1_000_000_000): number | null {
  const parsed = parseNumeric(value, DECIMAL_WITH_SEPARATORS);
  if (parsed === null || parsed < 0 || parsed > max) return null;
  // Money is stored at cent precision.
  return Math.round(parsed * 100) / 100;
}

/** A whole count (herd size, votes, egg count). Non-negative, bounded. */
export function parseCount(value: unknown, max = 1_000_000): number | null {
  const parsed = parseNumeric(value, INTEGER);
  if (parsed === null || parsed < 0 || parsed > max) return null;
  return parsed;
}

/** Coordinates of every calendar date, so 2026-02-31 is refused. */
export function isRealCalendarDate(text: string): boolean {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    [, year, month, day] = iso.map((part) => Number(part)) as unknown as number[];
  } else if (dmy) {
    [, month, day, year] = dmy.map((part) => Number(part)) as unknown as number[];
  } else {
    // A bare year or a time-only value carries no day to validate.
    return true;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** Shape + calendar validity. Returns the normalised date or `null`. */
export function parseDate(value: unknown, maxLength = 50): string | null {
  const text = cleanDateString(value, maxLength);
  if (!text) return null;
  return isRealCalendarDate(text) ? text : null;
}

// --- Time ----------------------------------------------------------------

/** `07:30`, `7:30 AM`, `19:45` — normalised to zero-padded 24-hour `HH:MM`. */
const CLOCK_24 = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const CLOCK_12 = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AaPp][Mm])$/;

export function normalizeClockTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const clock24 = CLOCK_24.exec(text);
  if (clock24) return `${clock24[1].padStart(2, '0')}:${clock24[2]}`;
  const clock12 = CLOCK_12.exec(text);
  if (clock12) {
    const hour = Number(clock12[1]) % 12 + (/pm/i.test(clock12[3]) ? 12 : 0);
    return `${String(hour).padStart(2, '0')}:${clock12[2]}`;
  }
  return null;
}

// --- Philippine contact numbers ----------------------------------------------

/**
 * PH mobile (`09XXXXXXXXX`, `+639XXXXXXXXX`, `+63 9XX XXX XXXX`) and landline
 * (`(02) 8XXX XXXX`). Stored in the international form `+63XXXXXXXXXX`.
 * Anything else (letters, extensions, too few digits) is refused.
 */
const PH_MOBILE = /^(?:\+?63|0)9\d{9}$/;
const PH_LANDLINE = /^(?:\+?63|0)\d{1,2}\d{7}$/;

export function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/[\s\-().]/g, '');
  if (!/^\+?\d{9,15}$/.test(digits)) return null;
  const national = PH_MOBILE.test(digits) || PH_LANDLINE.test(digits);
  if (!national) return null;
  const trimmed = digits.replace(/^\+?63/, '').replace(/^0/, '');
  // 10 digits for mobile (9XXXXXXXXX), 9-10 for landline area codes.
  if (digits.includes('9') && /^9\d{9}$/.test(trimmed)) return `+63${trimmed}`;
  return `+63${trimmed}`;
}

// --- Identifiers --------------------------------------------------------------

/** Members' local id, e.g. `AFA-2026-001`. Letters, digits and single dashes. */
const MEMBER_ID = /^[A-Za-z0-9](?:[A-Za-z0-9-]{2,30})[A-Za-z0-9]$/;

export function normalizeMemberId(value: unknown): string | null {
  const text = matchText(value, MEMBER_ID, 100);
  return text ? text.toUpperCase() : null;
}

/**
 * RSBSA reference number. The official layout is digits with optional dashes
 * and slashes (e.g. `071-2345-678`); a few regions append a short letter
 * suffix, which is allowed. Anything containing words is refused.
 */
// Digits-only references (`0712345678`) plus the grouped form
// (`071-2345-678`) and an optional short letter suffix (`-A`). The 2-14 digit
// bound applies inside each group; the column itself caps at 100 characters.
const RSBSA = /^\d{2,14}(?:-\d{2,6}){0,3}(?:-[A-Za-z]{1,3})?$/;

export function normalizeRsbsa(value: unknown): string | null {
  return matchText(value, RSBSA, 100);
}

/**
 * Account usernames. Deliberately narrow: no leading/trailing dot, dash or
 * underscore, no consecutive dots, 3-100 characters. Matching this makes the
 * username safe in logs, URLs and the `otpauth://` label.
 */
const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,98})[a-z0-9]$/;

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes('..')) return null;
  return USERNAME.test(trimmed) ? trimmed : null;
}

/**
 * A record id. Ids become primary keys, so they must survive a round trip
 * through JSON and SQL: no whitespace, quotes, slashes or control characters.
 */
const RECORD_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;

export function isValidRecordId(value: unknown): value is string {
  return typeof value === 'string' && RECORD_ID.test(value);
}
