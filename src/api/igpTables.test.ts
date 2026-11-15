// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mapIgpExpenseRow, mapIgpGroups, mapIgpHarvestRow, mapIgpSaleRow, IGP_HARVEST_STATUSES } from './db';

/**
 * The IGP ledger now lives in typed tables. These tests pin the row -> client
 * mapping, including the NUMERIC-as-string behaviour `pg` returns, so the SPA
 * keeps receiving the same `HogRaisingState` shape it always did.
 */

describe('expense rows', () => {
  it('maps snake_case columns to the client shape and coerces NUMERIC strings', () => {
    expect(
      mapIgpExpenseRow({
        id: 'exp-1',
        produce: 'Hog Raising',
        date: '2026-05-04',
        category: 'Feeds',
        quantity: '2',
        description: 'Grower pellets',
        amount: '1850.50', // pg returns NUMERIC as a string
        recorded_by: 'Treasurer',
        fund_source: 'DOLE-DILP Program',
        hog_stage: 'Fattening'
      })
    ).toEqual({
      id: 'exp-1',
      produce: 'Hog Raising',
      category: 'Feeds',
      quantity: 2,
      description: 'Grower pellets',
      amount: 1850.5,
      date: '2026-05-04',
      recordedBy: 'Treasurer',
      fundSource: 'DOLE-DILP Program',
      hogStage: 'Fattening'
    });
  });

  it('fills required fields for a minimal row', () => {
    const row = mapIgpExpenseRow({ id: 'exp-2', produce: 'Hog Raising', amount: null });
    expect(row.amount).toBe(0);
    expect(row.category).toBe('Other');
    expect(row.recordedBy).toBe('Officer');
    expect(row.description).toBe('');
    expect(row.fundSource).toBeUndefined();
  });
});

describe('sale rows', () => {
  it('keeps both counts and the revenue', () => {
    const row = mapIgpSaleRow({
      id: 'sale-1',
      produce: 'Hog Raising',
      date: '2026-05-04',
      hogs_count: 3,
      produce_count: 3,
      revenue: '24000',
      recorded_by: 'Treasurer',
      hog_stage: 'Fattening'
    });
    expect(row.revenue).toBe(24000);
    expect(row.hogsCount).toBe(3);
    expect(row.produceCount).toBe(3);
    expect(row).not.toHaveProperty('amount');
  });

  it('backfills hogsCount from produceCount for older records', () => {
    const row = mapIgpSaleRow({ id: 'sale-2', hogs_count: 0, produce_count: 5, revenue: 100 });
    expect(row.hogsCount).toBe(5);
    expect(row.produceCount).toBe(5);
  });
});

describe('harvest rows', () => {
  it('maps the full approval chain', () => {
    const row = mapIgpHarvestRow({
      id: 'h-1',
      produce: 'Poultry Raising (RTL)',
      date: '2026-05-04',
      time: '07:30',
      collected_by: 'Ana',
      egg_count: 42,
      notes: 'coops 1-3',
      status: 'Signed',
      audited_by: 'Auditor',
      audited_date: '2026-05-04',
      audit_remarks: 'Verified',
      signed_by: 'President',
      signed_date: '2026-05-05',
      signature_remarks: 'Noted'
    });
    expect(row).toMatchObject({
      id: 'h-1',
      collectedBy: 'Ana',
      eggCount: 42,
      status: 'Signed',
      auditedBy: 'Auditor',
      signedBy: 'President',
      signatureRemarks: 'Noted'
    });
  });

  it('never surfaces an unknown workflow status', () => {
    expect(mapIgpHarvestRow({ id: 'h-2', status: 'Approved!!' }).status).toBe('Pending Audit');
    expect(mapIgpHarvestRow({ id: 'h-3', status: 'Audited' }).status).toBe('Audited');
    expect(IGP_HARVEST_STATUSES).toEqual(['Pending Audit', 'Audited', 'Signed', 'Returned']);
  });
});

describe('groups', () => {
  it('reassembles rosters from the join table in position order', () => {
    const groups = mapIgpGroups(
      [
        { id: 'g1', name: 'Batch 1', schedule_days: ['Monday', 'Thursday'] },
        { id: 'g2', name: 'Batch 2', schedule_days: null }
      ],
      [
        { group_id: 'g1', member_name: 'Ana' },
        { group_id: 'g1', member_name: 'Boy' },
        { group_id: 'g2', member_name: 'Cita' }
      ]
    );
    expect(groups).toEqual([
      { id: 'g1', name: 'Batch 1', members: ['Ana', 'Boy'], scheduleDays: ['Monday', 'Thursday'] },
      { id: 'g2', name: 'Batch 2', members: ['Cita'], scheduleDays: [] }
    ]);
  });

  it('returns an empty roster when no members were stored', () => {
    expect(mapIgpGroups([{ id: 'g1', name: 'Batch 1' }], [])[0].members).toEqual([]);
  });
});
