/**
 * Input hardening applied to every record written through the bulk sync API.
 *
 * The web client renders all stored records through React, but synced data also
 * feeds exports, printed documents and audit views. Stripping markup at the
 * write boundary keeps a compromised or scripted client from persisting active
 * content that any of those downstream surfaces could render as HTML.
 */

const MAX_TEXT_LENGTH = 20_000;

/**
 * Removes angle brackets (the characters that can open a markup context) and
 * drops `javascript:`/`vbscript:` schemes.
 * Plain text, digits, punctuation and Unicode characters are preserved.
 *
 * @param value raw value from a synced record
 * @param maxLength column-specific cap applied after cleaning
 */
const MARKUP_CHARS = /[<>]/g;
const HANDLER_NAME = /(?:onerror|onload|onclick|onmouseover|onfocus|onstart|onbegin|javascript|vbscript)/gi;

export function cleanText(value: unknown, maxLength: number = MAX_TEXT_LENGTH): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const limit = Math.min(Math.max(1, maxLength), MAX_TEXT_LENGTH);
  // Bracket removal alone leaves `onerror=` behind in SVG-ish payloads; strip
  // the event-handler/script keywords too, then keep the remaining text intact.
  return value
    .slice(0, MAX_TEXT_LENGTH)
    .replace(MARKUP_CHARS, '')
    .replace(/(?:java|vb)script\s*:/gi, '')
    .replace(HANDLER_NAME, '')
    .slice(0, limit);
}

/** Same as {@link cleanText} but keeps `undefined` for absent optional fields. */
export function cleanOptionalText(value: unknown, maxLength?: number): string | null {
  return value === undefined || value === null ? null : cleanText(value, maxLength);
}

/** Cleans every entry of a text array (e.g. `primaryCrops`) and drops duplicates. */
export function cleanTextList(value: unknown, maxItemLength = 80, maxItems = 30): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned: string[] = [];
  for (const entry of value) {
    const text = cleanText(entry, maxItemLength)?.trim();
    if (text && !cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned.slice(0, maxItems);
}

/**
 * Accepts only http(s) links and image data URLs of a safe media type.
 * Returns `null` for anything that could execute in a browser context.
 */
export function safeImageUrl(value: unknown, maxLength = 400_000): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim().slice(0, maxLength);
  if (!url) return null;
  if (/^https?:\/\/[^\s<>"]+$/i.test(url)) return url;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  return null;
}

/** ISO-like date strings, plain calendar dates and year labels only. */
export function cleanDateString(value: unknown, maxLength = 50): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().slice(0, maxLength);
  if (!text) return null;
  // Accept "2026-05-04", "2026-05-04T10:00:00.000Z", "05/04/2026" and a bare year.
  if (/^\d{4}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return text;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) return text;
  return null;
}

/** Money and counts: finite numbers only, never strings or NaN. */
export function cleanNumber(value: unknown, max = 1_000_000_000): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
}

/** Entry types an IGP money record may carry. */
const IGP_AMOUNT_KEYS: Record<string, string> = {
  expenses: 'amount',
  sales: 'revenue'
};

const MAX_IGP_ROWS = 5000;

function cleanIgpGroup(entry: unknown, index: number): Record<string, unknown> | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const members = Array.isArray(row.members)
    ? row.members.map((m) => cleanText(m, 200)?.trim()).filter((m): m is string => Boolean(m)).slice(0, 500)
    : [];
  const scheduleDays = Array.isArray(row.scheduleDays)
    ? row.scheduleDays.map((d) => cleanText(d, 20)?.trim()).filter((d): d is string => Boolean(d)).slice(0, 7)
    : [];
  return {
    id: typeof row.id === 'string' && row.id ? row.id : `group-${index}`,
    name: cleanText(row.name, 200) || `Group ${index + 1}`,
    members,
    scheduleDays
  };
}

/**
 * The IGP ledger (hog/poultry/cattle projects) arrives as JSON blobs on one
 * row. They are money records, so every row is bounded: an amount must be a
 * finite non-negative number, a date must look like a date, text is stripped of
 * markup, and the whole collection is capped. Rows without a usable id are
 * dropped rather than silently merged into the previous one.
 *
 * Harvest entries are deliberately *not* sanitised here — their approval
 * workflow is enforced in `push.ts` and stored separately.
 */
export function sanitizeIgpLedger(
  bucket: 'expenses' | 'sales',
  rows: unknown,
  defaults: { produce?: string; recordedBy?: string } = {}
): Array<Record<string, unknown>> | null {
  const amountKey = IGP_AMOUNT_KEYS[bucket];
  if (!amountKey) return null;
  if (!Array.isArray(rows)) return [];

  const clean: Array<Record<string, unknown>> = [];
  for (const entry of rows) {
    if (clean.length >= MAX_IGP_ROWS) break;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id.trim()) continue;

    const base: Record<string, unknown> = {
      id: row.id.trim().slice(0, 100),
      produce: cleanText(row.produce, 100) || cleanText(defaults.produce, 100) || bucket,
      date: cleanDateString(row.date, 50) || '',
      [amountKey]: cleanNumber(row[amountKey]),
      recordedBy: cleanText(row.recordedBy, 200) || cleanText(defaults.recordedBy, 200) || 'Officer'
    };

    if (bucket === 'expenses') {
      clean.push({
        ...base,
        category: cleanText(row.category, 100) || 'Other',
        quantity: cleanNumber(row.quantity, 1_000_000),
        description: cleanText(row.description, 2000) || '',
        hogStage: cleanText(row.hogStage, 50) || undefined,
        fundSource: cleanText(row.fundSource, 200) || undefined
      });
      continue;
    }

    clean.push({
      ...base,
      hogsCount: cleanNumber(row.hogsCount, 1_000_000),
      produceCount: cleanNumber(row.produceCount, 1_000_000),
      notes: cleanText(row.notes, 2000) || undefined,
      hogStage: cleanText(row.hogStage, 50) || undefined,
      fundSource: cleanText(row.fundSource, 200) || undefined
    });
  }
  return clean;
}

/** Sanitises the IGP `groups` roster: member names, schedules and labels. */
export function sanitizeIgpGroups(rows: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(rows)) return [];
  const clean: Array<Record<string, unknown>> = [];
  for (const [index, entry] of rows.entries()) {
    if (clean.length >= 500) break;
    const group = cleanIgpGroup(entry, index);
    if (group) clean.push(group);
  }
  return clean;
}

export function sanitizeIgpProduces(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const clean: string[] = [];
  for (const entry of rows) {
    const name = cleanText(entry, 100)?.trim();
    if (name && !clean.includes(name)) clean.push(name);
    if (clean.length >= 50) break;
  }
  return clean;
}

const FORGED_USER_FIELDS = [
  'password',
  'passwordHash',
  'password_history',
  'passwordHistory',
  'mfaEnabled',
  'mfa_enabled',
  'totpSecret',
  'pendingTotpSecret',
  'isApproved',
  'failedLoginAttempts',
  'lockedUntil',
  'resetRequested'
] as const;

/**
 * Bulk-sync user rows must never carry authentication or authorization state:
 * passwords and MFA are changed only through the dedicated auth endpoints, and
 * roles only through a President-issued `roleUpdate`. Those keys are removed
 * (and unauthorised roles flattened to Member) before a row is persisted.
 */
export function sanitizeUserRows(
  rows: unknown[],
  options: { roleAuthorized?: boolean } = {}
): Array<Record<string, unknown>> {
  const safeRows: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const clean: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    for (const key of FORGED_USER_FIELDS) delete clean[key];
    if (options.roleAuthorized) {
      clean.roleAuthorized = true;
    } else {
      if (clean.role !== undefined && clean.role !== 'Member') {
        clean.role = 'Member';
      }
      delete clean.roleAuthorized;
    }
    safeRows.push(clean);
  }
  return safeRows;
}
