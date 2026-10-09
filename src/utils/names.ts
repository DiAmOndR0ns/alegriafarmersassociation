/**
 * Member name parsing shared across reports.
 *
 * FAMS stores each farmer/member as a single `name` string (e.g. "Arnado, Anselma B"
 * or "Anselma B. Arnado"). The consolidated report of the members needs the SURNAME
 * broken out — it is used to alphabetise the roster and to identify each farmer on
 * official documents. These helpers take the surname (and the other personal-data
 * parts) from that stored full name.
 */

export interface ParsedName {
  surname: string;
  first: string;
  mi?: string;
}

/**
 * Split a stored member full name into surname / first name / middle initial.
 *
 * Handles both formats used in AFA records:
 *   - "Arnado, Anselma B"   (comma-separated: surname first)
 *   - "Anselma B. Arnado"   (natural order: surname last)
 *
 * For a single-word name the whole value is treated as the surname.
 */
export function splitName(name: string): ParsedName {
  const clean = (name || '').trim();
  if (!clean) return { surname: '', first: '' };

  // "Surname, First M." form.
  if (clean.includes(',')) {
    const [surn, rest = ''] = clean.split(',');
    const [first = '', mi] = rest.trim().split(/\s+/);
    return {
      surname: surn.trim(),
      first,
      mi: mi?.replace('.', '') || undefined,
    };
  }

  // "First M. Surname" form — the surname is the last token.
  const parts = clean.split(/\s+/);
  const surname = parts.length > 1 ? parts[parts.length - 1] : clean;
  const first = parts[0];
  const mi = parts.slice(1, -1).find((p) => /^[A-Za-z]$/.test(p.replace('.', '')));
  return { surname, first, mi: mi?.replace('.', '') || undefined };
}

/**
 * Take only the surname from a stored member full name.
 * This is the value required on the consolidated report of the members.
 */
export function getSurname(name: string): string {
  return splitName(name).surname;
}
