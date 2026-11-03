import { describe, expect, it } from 'vitest';
import { separateEggHarvestsFromFinancialState } from './push';

describe('separateEggHarvestsFromFinancialState', () => {
  const pendingEgg = {
    id: 'egg-new',
    date: '2026-11-03',
    time: '08:00',
    collectedBy: 'AFA Member',
    eggCount: 12,
    status: 'Pending Audit'
  };

  it('lets members submit their own pending eggs without syncing financial IGP state', () => {
    const result = separateEggHarvestsFromFinancialState({
      transactions: [{ id: 'tx-1' }],
      funds: [{ id: 'fund-1' }],
      deletedIds: {
        financialTransactions: ['tx-1'],
        funds: ['fund-1'],
        members: ['member-1']
      },
      deleteItem: { entity: 'organization_funds', id: 'fund-1' },
      hogRaising: {
        expenses: [{ id: 'expense-1' }],
        sales: [{ id: 'sale-1' }],
        eggHarvests: [
          pendingEgg,
          { ...pendingEgg, id: 'egg-other', collectedBy: 'Someone Else' },
          { ...pendingEgg, id: 'egg-audited', status: 'Audited' }
        ]
      }
    }, 'Member', 'AFA Member');

    expect(result).not.toHaveProperty('transactions');
    expect(result).not.toHaveProperty('funds');
    expect(result).not.toHaveProperty('hogRaising');
    expect(result.deleteItem).toBeUndefined();
    expect(result.deletedIds).toEqual({ members: ['member-1'] });
    expect(result.eggHarvests).toEqual([pendingEgg]);
    expect(result.appendEggHarvests).toBe(true);
  });

  it('allows the Auditor to sync egg workflow updates without financial fields', () => {
    const auditedEgg = { ...pendingEgg, status: 'Audited' };
    const result = separateEggHarvestsFromFinancialState({
      financialTransactions: [{ id: 'tx-1' }],
      hogRaising: { eggHarvests: [auditedEgg] }
    }, 'Auditor', 'AFA Auditor');

    expect(result).not.toHaveProperty('financialTransactions');
    expect(result).not.toHaveProperty('hogRaising');
    expect(result.eggHarvests).toEqual([auditedEgg]);
    expect(result.appendEggHarvests).toBeUndefined();
  });

  it('does not grant egg-workflow write access to unrelated roles', () => {
    const result = separateEggHarvestsFromFinancialState({
      eggHarvests: [pendingEgg]
    }, 'Secretary', 'AFA Secretary');

    expect(result.eggHarvests).toBeUndefined();
  });
});
