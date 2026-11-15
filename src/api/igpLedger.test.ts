// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sanitizeIgpGroups, sanitizeIgpLedger, sanitizeIgpProduces } from './sanitize';

/**
 * The IGP ledger is stored as JSON blobs on a single row, so this is the only
 * place where its shape is enforced. These tests pin the guarantees the writer
 * relies on in `saveFullStateToPostgres`.
 */

describe('IGP expenses', () => {
  it('keeps a well-formed expense intact', () => {
    const [row] = sanitizeIgpLedger('expenses', [
      {
        id: 'exp-1',
        produce: 'Hog Raising',
        category: 'Feeds',
        quantity: 2,
        description: 'Grower pellets',
        amount: 1850.5,
        date: '2026-05-04',
        recordedBy: 'Treasurer'
      }
    ])!;
    expect(row).toMatchObject({
      id: 'exp-1',
      produce: 'Hog Raising',
      category: 'Feeds',
      amount: 1850.5,
      date: '2026-05-04',
      recordedBy: 'Treasurer'
    });
  });

  it('drops rows with no id instead of silently merging them', () => {
    const rows = sanitizeIgpLedger('expenses', [
      { id: 'exp-1', amount: 10 },
      { amount: 999 }, // no id
      null,
      'not-an-object',
      { id: ' ', amount: 5 }
    ])!;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('exp-1');
  });

  it('coerces amounts to safe numbers', () => {
    const rows = sanitizeIgpLedger('expenses', [
      { id: 'a', amount: '125' },
      { id: 'b', amount: Number.POSITIVE_INFINITY },
      { id: 'c', amount: -50 },
      { id: 'd', amount: 'NaN' },
      { id: 'e', amount: 1e18 }
    ])!;
    expect(rows.map((r) => r.amount)).toEqual([125, 0, 0, 0, 1_000_000_000]);
  });

  it('rejects dates that are not dates', () => {
    const rows = sanitizeIgpLedger('expenses', [
      { id: 'a', date: '2026-05-04' },
      { id: 'b', date: 'yesterday' },
      { id: 'c', date: '<script>alert(1)</script>' }
    ])!;
    expect(rows[0].date).toBe('2026-05-04');
    expect(rows[1].date).toBe('');
    expect(rows[2].date).toBe('');
  });

  it('strips markup from descriptions and fund sources', () => {
    const [row] = sanitizeIgpLedger('expenses', [
      {
        id: 'a',
        description: '<img src=x onerror=alert(document.cookie)>Feeds',
        fundSource: 'javascript:alert(1)'
      }
    ])!;
    expect(String(row.description)).not.toMatch(/[<>]/);
    expect(String(row.description).toLowerCase()).not.toContain('onerror');
    expect(String(row.fundSource).toLowerCase()).not.toContain('javascript');
  });

  it('falls back to the request defaults for missing produce/recordedBy', () => {
    const [row] = sanitizeIgpLedger('expenses', [{ id: 'a', amount: 1 }], {
      produce: 'Poultry Raising',
      recordedBy: 'Treasurer (Ana)'
    })!;
    expect(row.produce).toBe('Poultry Raising');
    expect(row.recordedBy).toBe('Treasurer (Ana)');
  });

  it('caps the number of rows', () => {
    const flood = Array.from({ length: 6000 }, (_, i) => ({ id: `e-${i}`, amount: 1 }));
    expect(sanitizeIgpLedger('expenses', flood)!.length).toBe(5000);
  });

  it('treats a non-array as empty', () => {
    expect(sanitizeIgpLedger('expenses', undefined)).toEqual([]);
    expect(sanitizeIgpLedger('expenses', { id: 'a' })).toEqual([]);
  });
});

describe('IGP sales', () => {
  it('uses revenue and keeps the counts', () => {
    const [row] = sanitizeIgpLedger('sales', [
      {
        id: 'sale-1',
        date: '2026-05-04',
        hogsCount: 3,
        produceCount: 3,
        revenue: 24000,
        recordedBy: 'Treasurer',
        notes: 'Sold to Tuburan buyer'
      }
    ])!;
    expect(row).toMatchObject({ id: 'sale-1', revenue: 24000, hogsCount: 3, produceCount: 3 });
    expect(row).not.toHaveProperty('amount');
  });

  it('does not copy unrelated keys supplied by the caller', () => {
    const [row] = sanitizeIgpLedger('sales', [
      { id: 'sale-1', revenue: 1, amount: 999999, auditedStatus: 'Audited', __proto__: { admin: true } }
    ])!;
    expect(row).not.toHaveProperty('amount');
    expect(row).not.toHaveProperty('auditedStatus');
    expect(({} as any).admin).toBeUndefined();
  });
});

describe('IGP groups and produce list', () => {
  it('cleans group labels, member names and schedule days', () => {
    const [group] = sanitizeIgpGroups([
      { id: 'g1', name: '<b>Batch 1</b>', members: ['Ana', '<script>x</script>Boy'], scheduleDays: ['Monday', 'Thursday'] }
    ])!;
    expect(group.name).toBe('bBatch 1/b');
    expect(group.members).toEqual(['Ana', 'scriptx/scriptBoy']);
    expect(group.scheduleDays).toEqual(['Monday', 'Thursday']);
  });

  it('ignores malformed groups', () => {
    expect(sanitizeIgpGroups([null, 'x', { name: 'ok' }])).toEqual([
      { id: 'group-2', name: 'ok', members: [], scheduleDays: [] }
    ]);
  });

  it('de-duplicates and shortens the produce list', () => {
    // Numeric entries are kept as text; a blank or object entry is dropped.
    expect(sanitizeIgpProduces(['Hog Raising', 'Hog Raising', ' Poultry ', 42, null])).toEqual([
      'Hog Raising',
      'Poultry',
      '42'
    ]);
  });
});
