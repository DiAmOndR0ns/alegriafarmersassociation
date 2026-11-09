import { describe, it, expect } from 'vitest';
import type { FinancialTransaction, OrganizationFund } from '../types';
import {
  computeFundBalances,
  findFundForSource,
  getInitialFund,
  getTotalCurrentBalance,
  getTotalInitialFund
} from './fundBalance';

const fund = (overrides: Partial<OrganizationFund> = {}): OrganizationFund => ({
  id: 'fund-1',
  name: 'DSWD SLP',
  code: 'DSWD',
  category: 'Grant',
  source: 'DSWD',
  initialFund: 50000,
  currentBalance: 50000,
  description: 'Seed capital',
  custodian: 'Treasurer',
  lastUpdated: '2026-01-01',
  ...overrides
});

const tx = (overrides: Partial<FinancialTransaction> = {}): FinancialTransaction => ({
  id: 'tx-1',
  type: 'expense',
  category: 'Supplies',
  amount: 1000,
  date: '2026-02-01',
  description: 'test',
  recordedBy: 'Treasurer',
  fundSource: 'DSWD (DSWD SLP)',
  auditedStatus: 'Unaudited',
  ...overrides
});

describe('getInitialFund', () => {
  it('returns the initial fund', () => {
    expect(getInitialFund(fund())).toBe(50000);
  });

  it('falls back to the legacy allocatedAmount for old records', () => {
    expect(getInitialFund({ initialFund: undefined as unknown as number, allocatedAmount: 12000 })).toBe(12000);
  });

  it('returns 0 when neither value is present', () => {
    expect(getInitialFund({ initialFund: undefined as unknown as number })).toBe(0);
  });
});

describe('findFundForSource', () => {
  it('matches the "CODE (Name)" label used by the transaction form', () => {
    expect(findFundForSource([fund()], 'DSWD (DSWD SLP)')?.id).toBe('fund-1');
  });

  it('matches a bare code or bare name', () => {
    expect(findFundForSource([fund()], 'DSWD')?.id).toBe('fund-1');
    expect(findFundForSource([fund()], 'dswd slp')?.id).toBe('fund-1');
  });

  it('returns undefined for an unknown or empty source', () => {
    expect(findFundForSource([fund()], 'UNKNOWN')).toBeUndefined();
    expect(findFundForSource([fund()], '')).toBeUndefined();
  });
});

describe('computeFundBalances', () => {
  it('derives the balance from the initial fund and the ledger', () => {
    const [result] = computeFundBalances(
      [fund()],
      [
        tx({ id: 'a', type: 'expense', amount: 29995 }),
        tx({ id: 'b', type: 'income', amount: 5000 })
      ]
    );
    // 50,000 - 29,995 + 5,000
    expect(result.currentBalance).toBe(25005);
  });

  it('reproduces the reported 20,005 case', () => {
    const [result] = computeFundBalances([fund()], [tx({ amount: 29995 })]);
    expect(result.currentBalance).toBe(20005);
  });

  it('shows overspending as a negative balance instead of clamping to zero', () => {
    const [result] = computeFundBalances([fund()], [tx({ amount: 60000 })]);
    expect(result.currentBalance).toBe(-10000);
  });

  it('ignores transactions that belong to another fund source', () => {
    const [result] = computeFundBalances(
      [fund()],
      [tx({ fundSource: 'OTHER (Other Fund)', amount: 9999 })]
    );
    expect(result.currentBalance).toBe(50000);
  });

  it('is idempotent — recomputing does not compound', () => {
    const once = computeFundBalances([fund()], [tx({ amount: 1000 })]);
    const twice = computeFundBalances(once, [tx({ amount: 1000 })]);
    expect(twice[0].currentBalance).toBe(49000);
  });

  it('returns the same object when the balance is already correct', () => {
    const original = fund({ currentBalance: 50000 });
    const [result] = computeFundBalances([original], []);
    expect(result).toBe(original);
  });
});

describe('totals', () => {
  it('sums initial funds and live balances separately', () => {
    const funds = [
      fund({ id: 'f1', initialFund: 50000, currentBalance: 20005 }),
      fund({ id: 'f2', code: 'DOLE', name: 'DOLE', initialFund: 10000, currentBalance: 12000 })
    ];
    expect(getTotalInitialFund(funds)).toBe(60000);
    expect(getTotalCurrentBalance(funds)).toBe(32005);
  });
});
