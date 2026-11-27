import { describe, expect, it } from 'vitest';
import { buildSyncPayload, filterOutConfirmedPendingMembers } from './App';

/**
 * Contract tests for `/api/sync/push` payloads.
 *
 * The production bug: a Secretary's "add member" (and every announcement,
 * activity, meeting, resolution and login change) was uploaded as a FULL
 * snapshot, which included `financialTransactions`. `src/api/push.ts` answers
 * 403 for financial fields from anyone who is not the Treasurer and discards the
 * entire request, so nothing the Secretary saved ever reached the database.
 */

const FINANCIAL_KEYS = ['financialTransactions', 'funds', 'livestockIgp', 'membershipPayments', 'membershipYearSnapshots'];

function snapshot(overrides: Record<string, any> = {}) {
  return {
    users: [{ id: 'u1' }],
    members: [{ id: 'm-old' }],
    meetings: [{ id: 'mt1' }],
    resolutions: [{ id: 'r1' }],
    transactions: [{ id: 't1' }],
    announcements: [{ id: 'a-old' }],
    products: [{ id: 'p1' }],
    activities: [{ id: 'act-old' }],
    achievements: [{ id: 'ach1' }],
    livestockIgp: { eggHarvests: [{ id: 'e1' }] },
    funds: [{ id: 'f1' }],
    inventory: [{ id: 'i1' }],
    logs: [{ id: 'l1' }],
    ...overrides,
  };
}

const base = { deletedIds: {}, canWriteFinancials: false };

describe('partial writes send only their own entities', () => {
  it('add member from a Secretary carries no financial fields', () => {
    const payload = buildSyncPayload({
      ...base,
      overrides: { members: [{ id: 'm-new' }, { id: 'm-old' }], users: [{ id: 'u1' }] },
      snapshot: snapshot(),
    });

    expect(payload.members).toEqual([{ id: 'm-new' }, { id: 'm-old' }]);
    expect(payload.users).toEqual([{ id: 'u1' }]);
    // The regression: these used to be filled from the snapshot and caused a 403.
    for (const key of FINANCIAL_KEYS) expect(payload).not.toHaveProperty(key);
    expect(payload).not.toHaveProperty('announcements');
    expect(payload).not.toHaveProperty('activities');
    expect(payload).not.toHaveProperty('meetings');
  });

  it('announcement and activity saves carry only their own entity', () => {
    const announcement = buildSyncPayload({
      ...base,
      overrides: { announcements: [{ id: 'a-new' }] },
      snapshot: snapshot(),
    });
    expect(announcement).toMatchObject({ announcements: [{ id: 'a-new' }] });
    expect(announcement).not.toHaveProperty('members');
    for (const key of FINANCIAL_KEYS) expect(announcement).not.toHaveProperty(key);

    const activity = buildSyncPayload({
      ...base,
      overrides: { activities: [{ id: 'act-new' }] },
      snapshot: snapshot(),
    });
    expect(activity).toMatchObject({ activities: [{ id: 'act-new' }] });
    for (const key of FINANCIAL_KEYS) expect(activity).not.toHaveProperty(key);
  });

  it('uses the override value, never the stale snapshot array', () => {
    // appDataRef still held the pre-save arrays; both are supplied deliberately.
    const payload = buildSyncPayload({
      ...base,
      overrides: { members: [{ id: 'm-new' }] },
      snapshot: snapshot({ members: [{ id: 'm-old' }] }),
    });
    expect(payload.members).toEqual([{ id: 'm-new' }]);
  });

  it('still lets the Treasurer write the ledger', () => {
    const payload = buildSyncPayload({
      ...base,
      canWriteFinancials: true,
      overrides: { financialTransactions: [{ id: 't-new' }] },
      snapshot: snapshot(),
    });
    expect(payload.financialTransactions).toEqual([{ id: 't-new' }]);
  });

  it('drops financial fields a non-Treasurer tried to send', () => {
    const payload = buildSyncPayload({
      ...base,
      overrides: {
        financialTransactions: [{ id: 't-forged' }],
        funds: [{ id: 'f-forged' }],
        members: [{ id: 'm-new' }],
      },
      snapshot: snapshot(),
    });
    expect(payload.members).toEqual([{ id: 'm-new' }]);
    for (const key of FINANCIAL_KEYS) expect(payload).not.toHaveProperty(key);
  });

  it('carries pending deletions so the queue can be cleared', () => {
    const payload = buildSyncPayload({
      ...base,
      overrides: { members: [] },
      snapshot: snapshot(),
      deletedIds: { members: ['m-gone'] },
    });
    expect(payload.members).toEqual([]);
    expect(payload.deletedIds).toEqual({ members: ['m-gone'] });
  });
});

describe('full snapshots respect the role', () => {
  it('omits financial and inventory entities for a Secretary so auto-sync can succeed', () => {
    const payload = buildSyncPayload({ ...base, snapshot: snapshot() });
    for (const key of FINANCIAL_KEYS) expect(payload).not.toHaveProperty(key);
    expect(payload).not.toHaveProperty('inventory');
    expect(payload.members).toEqual([{ id: 'm-old' }]);
    expect(payload.announcements).toEqual([{ id: 'a-old' }]);
  });

  it('omits inventory and membershipPayments even when passed in Boot Sync overrides for a Secretary', () => {
    const payload = buildSyncPayload({
      ...base,
      overrides: {
        members: [{ id: 'm-1' }],
        pendingMembers: [{ id: 'pm-1' }],
        inventory: [{ id: 'i-1' }],
        membershipPayments: [{ id: 'mp-1' }],
        membershipYearSnapshots: [{ year: 2026 }],
      },
      deletedIds: {
        members: ['m-del'],
        inventory: ['i-del'],
        membershipPayments: ['mp-del'],
      },
      snapshot: snapshot(),
    });
    expect(payload.members).toEqual([{ id: 'm-1' }]);
    expect(payload.pendingMembers).toEqual([{ id: 'pm-1' }]);
    expect(payload).not.toHaveProperty('inventory');
    expect(payload).not.toHaveProperty('membershipPayments');
    expect(payload).not.toHaveProperty('membershipYearSnapshots');
    expect(payload.deletedIds).toEqual({ members: ['m-del'] });
  });

  it('includes them for the Treasurer', () => {
    const payload = buildSyncPayload({ ...base, canWriteFinancials: true, snapshot: snapshot() });
    expect(payload.financialTransactions).toEqual([{ id: 't1' }]);
    expect(payload.funds).toEqual([{ id: 'f1' }]);
    expect(payload.livestockIgp).toEqual({ eggHarvests: [{ id: 'e1' }] });
    expect(payload.inventory).toEqual([{ id: 'i1' }]);
  });
});

describe('filterOutConfirmedPendingMembers', () => {
  it('removes pending applicants who are already confirmed in the official members table by id or name', () => {
    const pending = [
      {
        id: 'pm-1',
        name: 'Shoyo, Hinata K.',
        farmLocation: 'Sitio Pundok 1',
        primaryCrops: ['Vegetables', 'Corn'],
        contactNumber: '09977885521',
        joinedDate: '2026-11-26',
        isRsbsaRegistered: true,
        registrationStatus: 'Awaiting Treasurer Fee' as const
      },
      {
        id: 'pm-2',
        name: 'Tetsurō, Kuroo N.',
        farmLocation: 'Sitio Pundok 2',
        primaryCrops: ['Vegetables', 'Cassava'],
        contactNumber: '112202596',
        joinedDate: '2026-11-26',
        isRsbsaRegistered: false,
        registrationStatus: 'Awaiting Treasurer Fee' as const
      }
    ];
    const confirmed = [
      {
        id: 'mem-99',
        name: 'shoyo, hinata k.',
        memberIdNumber: 'AFA-2026-001',
        farmLocation: 'Sitio Pundok 1',
        primaryCrops: ['Vegetables', 'Corn'],
        contactNumber: '09977885521',
        status: 'Active' as const,
        joinedDate: '2026-11-26',
        isRsbsaRegistered: true
      }
    ];

    const filtered = filterOutConfirmedPendingMembers(pending, confirmed);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Tetsurō, Kuroo N.');
  });
});

describe('scoped writes stay minimal', () => {
  it('president approval sends only the sign-off', () => {
    const payload = buildSyncPayload({
      ...base,
      options: { scope: 'presidentApproval' },
      overrides: { financialTransactions: [{ id: 't1', presidentApprovalStatus: 'Approved' }] },
      snapshot: snapshot(),
    });
    expect(payload).toEqual({
      financialTransactions: [{ id: 't1', presidentApprovalStatus: 'Approved' }],
      presidentApprovalOnly: true,
    });
  });

  it('auditor review sends only the reviewed record', () => {
    const payload = buildSyncPayload({
      ...base,
      options: { scope: 'auditorReview' },
      overrides: { financialTransactions: [{ id: 't1', auditedStatus: 'Audited' }] },
      snapshot: snapshot(),
    });
    expect(payload).toEqual({
      financialTransactions: [{ id: 't1', auditedStatus: 'Audited' }],
      auditorReviewOnly: true,
    });
  });

  it('egg harvest sends only the harvest list', () => {
    const payload = buildSyncPayload({
      ...base,
      options: { scope: 'eggHarvests' },
      overrides: {},
      snapshot: snapshot(),
    });
    expect(payload).toEqual({ eggHarvests: [{ id: 'e1' }] });
  });
});
