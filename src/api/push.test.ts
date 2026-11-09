import { describe, it, expect } from 'vitest';
import {
  extractAuditorReview,
  extractPresidentFinancialApproval,
  separateEggHarvestsFromFinancialState
} from './push';

const transaction = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  type: 'income',
  category: 'Membership Dues',
  amount: 500,
  date: '2026-05-04',
  description: 'Dues',
  recordedBy: 'Treasurer',
  fundSource: 'DUES (Member Dues)',
  auditedStatus: 'Unaudited',
  ...overrides
});

describe('extractPresidentFinancialApproval', () => {
  it('keeps only the sign-off fields for an approved record', () => {
    const result = extractPresidentFinancialApproval(
      {
        financialTransactions: [
          transaction({
            presidentApprovalStatus: 'Approved',
            presidentApprovedBy: 'President (Maria)',
            presidentApprovedDate: '2026-05-06',
            presidentApprovalRemarks: 'Noted'
          })
        ]
      },
      'President'
    );

    expect(result).toEqual([
      {
        id: 'tx-1',
        presidentApprovalStatus: 'Approved',
        presidentApprovedBy: 'President (Maria)',
        presidentApprovedDate: '2026-05-06',
        presidentApprovalRemarks: 'Noted'
      }
    ]);
    // Financial data must never travel with an approval.
    expect(result?.[0]).not.toHaveProperty('amount');
    expect(result?.[0]).not.toHaveProperty('fundSource');
  });

  it('ignores records that carry no approval decision', () => {
    expect(
      extractPresidentFinancialApproval({ financialTransactions: [transaction()] }, 'President')
    ).toBeNull();
  });

  it('returns null for roles that may not approve', () => {
    const state = {
      financialTransactions: [transaction({ presidentApprovalStatus: 'Approved' })]
    };
    expect(extractPresidentFinancialApproval(state, 'Auditor')).toBeNull();
    expect(extractPresidentFinancialApproval(state, 'Treasurer')).toBeNull();
    expect(extractPresidentFinancialApproval(state, 'Member')).toBeNull();
  });
});

describe('extractAuditorReview', () => {
  it('keeps only the audit fields for a verified record', () => {
    const result = extractAuditorReview(
      {
        financialTransactions: [
          transaction({
            auditedStatus: 'Audited',
            auditedBy: 'Auditor (Jose)',
            auditedDate: '2026-05-05',
            auditNotes: 'Receipts complete'
          })
        ]
      },
      'Auditor'
    );

    expect(result).toEqual([
      {
        id: 'tx-1',
        auditedStatus: 'Audited',
        auditedBy: 'Auditor (Jose)',
        auditedDate: '2026-05-05',
        auditNotes: 'Receipts complete'
      }
    ]);
    expect(result?.[0]).not.toHaveProperty('amount');
    expect(result?.[0]).not.toHaveProperty('fundSource');
  });

  it('ignores records that are still unaudited', () => {
    expect(
      extractAuditorReview(
        { financialTransactions: [transaction({ auditedStatus: 'Unaudited' })] },
        'Auditor'
      )
    ).toBeNull();
  });

  it('returns null for roles that may not audit', () => {
    const state = { financialTransactions: [transaction({ auditedStatus: 'Audited' })] };
    expect(extractAuditorReview(state, 'President')).toBeNull();
    expect(extractAuditorReview(state, 'Treasurer')).toBeNull();
  });
});

describe('separateEggHarvestsFromFinancialState', () => {
  it('strips funds and transactions from a non-treasurer snapshot', () => {
    const safe = separateEggHarvestsFromFinancialState(
      {
        funds: [{ id: 'fund-1', name: 'DSWD SLP', code: 'DSWD' }],
        financialTransactions: [transaction()],
        members: [{ id: 'm-1' }]
      },
      'President'
    );

    expect(safe).not.toHaveProperty('funds');
    expect(safe).not.toHaveProperty('financialTransactions');
    expect(safe.members).toEqual([{ id: 'm-1' }]);
  });
});
