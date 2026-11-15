// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  cleanLabel,
  cleanQuantityLabel,
  cleanStatusText,
  isEmptyValue,
  isValidRecordId,
  isRealCalendarDate,
  matchText,
  normalizeClockTime,
  normalizeMemberId,
  normalizePhone,
  normalizeRsbsa,
  normalizeUsername,
  parseCount,
  parseDate,
  parseMoney
} from './validation';

describe('parseMoney', () => {
  it('accepts plain, decimal and thousand-separated amounts', () => {
    expect(parseMoney('1520')).toBe(1520);
    expect(parseMoney('1520.5')).toBe(1520.5);
    expect(parseMoney('1,520.50')).toBe(1520.5);
    expect(parseMoney(' 250 ')).toBe(250);
    expect(parseMoney(250.456)).toBe(250.46);
  });

  it('accepts a leading currency symbol', () => {
    expect(parseMoney('₱1,520.50')).toBe(1520.5);
    expect(parseMoney('$99')).toBe(99);
  });

  it('rejects exponents, words, NaN and negatives', () => {
    expect(parseMoney('1e9')).toBeNull();
    expect(parseMoney('12abc')).toBeNull();
    expect(parseMoney('NaN')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(-5)).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney(Infinity)).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });

  it('rejects amounts above the cap', () => {
    expect(parseMoney('1000000001')).toBeNull();
    expect(parseMoney('1000000000')).toBe(1_000_000_000);
  });

  it('rejects malformed separators', () => {
    expect(parseMoney('15,20')).toBeNull();
    expect(parseMoney('1.520,50')).toBeNull();
    expect(parseMoney('01')).toBeNull();
  });
});

describe('parseCount', () => {
  it('accepts whole numbers only', () => {
    expect(parseCount('12')).toBe(12);
    expect(parseCount(0)).toBe(0);
    expect(parseCount('1.5')).toBeNull();
    expect(parseCount('12 hogs')).toBeNull();
    expect(parseCount(-1)).toBeNull();
    expect(parseCount('1e3')).toBeNull();
    expect(parseCount('1,000')).toBeNull();
  });

  it('enforces the upper bound', () => {
    expect(parseCount('100001', 100_000)).toBeNull();
    expect(parseCount('100000', 100_000)).toBe(100_000);
  });
});

describe('dates', () => {
  it('accepts ISO dates, datetimes and DMY', () => {
    expect(parseDate('2026-05-04')).toBe('2026-05-04');
    expect(parseDate('2026-05-04T10:00:00.000Z')).toBe('2026-05-04T10:00:00.000Z');
    expect(parseDate('05/04/2026')).toBe('05/04/2026');
  });

  it('rejects impossible calendar days', () => {
    expect(parseDate('2026-02-31')).toBeNull();
    expect(parseDate('2025-02-29')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
    expect(parseDate('32/01/2026')).toBeNull();
    expect(isRealCalendarDate('2024-02-29')).toBe(true); // leap year
  });

  it('rejects non-date text', () => {
    expect(parseDate('yesterday')).toBeNull();
    expect(parseDate('2026-5')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('normalizeClockTime', () => {
  it('normalises 24-hour and 12-hour input', () => {
    expect(normalizeClockTime('7:30')).toBe('07:30');
    expect(normalizeClockTime('7:30 AM')).toBe('07:30');
    expect(normalizeClockTime('7:30 pm')).toBe('19:30');
    expect(normalizeClockTime('12:05 AM')).toBe('00:05');
    expect(normalizeClockTime('12:05 PM')).toBe('12:05');
  });

  it('rejects impossible times', () => {
    expect(normalizeClockTime('24:00')).toBeNull();
    expect(normalizeClockTime('13:00 PM')).toBeNull();
    expect(normalizeClockTime('7.30')).toBeNull();
    expect(normalizeClockTime('')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('normalises PH mobile numbers to +63', () => {
    expect(normalizePhone('09171234567')).toBe('+639171234567');
    expect(normalizePhone('+639171234567')).toBe('+639171234567');
    expect(normalizePhone('63 917 123 4567')).toBe('+639171234567');
    expect(normalizePhone('0917-123-4567')).toBe('+639171234567');
    expect(normalizePhone('(0917) 123 4567')).toBe('+639171234567');
  });

  it('accepts a landline', () => {
    expect(normalizePhone('032 123 4567')).toBe('+63321234567');
  });

  it('refuses anything that is not a phone number', () => {
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('0917 123 4567 ext 12')).toBeNull();
    expect(normalizePhone('<script>')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('1234567890123456')).toBeNull();
  });
});

describe('identifier formats', () => {
  it('normalises member ids to upper case', () => {
    expect(normalizeMemberId('AFA-2026-001')).toBe('AFA-2026-001');
    expect(normalizeMemberId('afa-2026-001')).toBe('AFA-2026-001');
    expect(normalizeMemberId('-AFA-001')).toBeNull();
    expect(normalizeMemberId('AFA 001')).toBeNull();
  });

  it('accepts an RSBSA reference of digits and separators only', () => {
    expect(normalizeRsbsa('071-2345-678')).toBe('071-2345-678');
    expect(normalizeRsbsa('0712345678')).toBe('0712345678');
    expect(normalizeRsbsa('RSBSA-071')).toBeNull();
    expect(normalizeRsbsa('071 abc')).toBeNull();
  });

  it('accepts only safe, well-formed usernames', () => {
    expect(normalizeUsername('  Treasurer ')).toBe('treasurer');
    expect(normalizeUsername('member.one')).toBe('member.one');
    expect(normalizeUsername('a')).toBeNull();
    expect(normalizeUsername('.treasurer')).toBeNull();
    expect(normalizeUsername('treasurer.')).toBeNull();
    expect(normalizeUsername('treas..urer')).toBeNull();
    expect(normalizeUsername('treas urer')).toBeNull();
    expect(normalizeUsername('treas/urer')).toBeNull();
  });

  it('accepts only safe record ids for primary keys', () => {
    expect(isValidRecordId('tx-1720000000000')).toBe(true);
    expect(isValidRecordId('user_1')).toBe(true);
    expect(isValidRecordId("id'; DROP TABLE users;--")).toBe(false);
    expect(isValidRecordId('has space')).toBe(false);
    expect(isValidRecordId('')).toBe(false);
    expect(isValidRecordId('-leading')).toBe(false);
  });
});

describe('text helpers', () => {
  it('returns null instead of throwing for non-strings', () => {
    expect(cleanLabel({ evil: true })).toBeNull();
    expect(cleanStatusText(42)).toBeNull();
    expect(matchText(undefined, /^a$/, 10)).toBeNull();
  });

  it('validates a status label with an optional note', () => {
    expect(cleanStatusText('Approved')).toBe('Approved');
    expect(cleanStatusText('Approved (Treasurer) - verified')).toBe('Approved (Treasurer) - verified');
    expect(cleanStatusText('<img src=x onerror=alert(1)>')).toBeNull();
  });

  it('keeps a name but refuses markup', () => {
    expect(cleanLabel("Ma. Cita O'Neil-Lim")).toBe("Ma. Cita O'Neil-Lim");
    expect(cleanLabel('Brgy. Tuburan, Cebu (Poblacion)')).toBe('Brgy. Tuburan, Cebu (Poblacion)');
    expect(cleanLabel('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('accepts a quantity label only in the documented shape', () => {
    expect(cleanQuantityLabel('2')).toBe('2');
    expect(cleanQuantityLabel('1.5 kg')).toBe('1.5 kg');
    expect(cleanQuantityLabel('80/kl')).toBe('80/kl');
    expect(cleanQuantityLabel('plenty')).toBeNull();
  });

  it('recognises the blank values a spreadsheet export leaves behind', () => {
    for (const blank of ['', '  ', '-', 'N/A', 'n/a', 'none', 'NULL', null, undefined]) {
      expect(isEmptyValue(blank)).toBe(true);
    }
    expect(isEmptyValue('0')).toBe(false);
    expect(isEmptyValue('Ana')).toBe(false);
  });
});
