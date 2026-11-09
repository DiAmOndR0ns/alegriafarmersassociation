import { describe, expect, it } from 'vitest';
import { FinancialTransaction, HogRaisingState } from '../types';
import { getTreasurerReportRange, getTreasurerReportRows } from './treasurerReport';

const transactions: FinancialTransaction[] = [
  {
    id: 'income-1', type: 'income', amount: 500, date: '2026-05-04', category: 'Membership Dues',
    description: 'Dues', fundSource: 'DUES (Member Dues)', recordedBy: 'Treasurer', auditedStatus: 'Unaudited'
  },
  {
    id: 'expense-1', type: 'expense', amount: 100, date: '2026-05-05', category: 'Supplies',
    description: 'Paper', fundSource: 'GENERAL (General Fund)', recordedBy: 'Treasurer', auditedStatus: 'Unaudited'
  },
  {
    id: 'igp-ledger-1', type: 'income', amount: 300, date: '2026-05-06', category: 'Poultry Project',
    description: '[Poultry Raising IGP] Revenue', recordedBy: 'Treasurer', auditedStatus: 'Unaudited'
  }
];

const livestock: HogRaisingState = {
  expenses: [{
    id: 'livestock-expense', produce: 'Poultry', category: 'Feed', description: 'Feed costs',
    amount: 80, date: '2026-05-05', recordedBy: 'Treasurer', fundSource: 'GENERAL (General Fund)'
  }],
  sales: [{
    id: 'livestock-sale', produce: 'Poultry', date: '2026-05-06', hogsCount: 0,
    revenue: 300, recordedBy: 'Treasurer', notes: 'Egg sales', fundSource: 'SALES (Sales Account)'
  }],
  groups: []
};

describe('Treasurer report filters', () => {
  it('creates daily, Monday-to-Sunday weekly, and monthly ranges', () => {
    expect(getTreasurerReportRange('2026-05-06', 'day')).toMatchObject({
      start: '2026-05-06', end: '2026-05-06'
    });
    expect(getTreasurerReportRange('2026-05-06', 'week')).toMatchObject({
      start: '2026-05-04', end: '2026-05-10'
    });
    expect(getTreasurerReportRange('2026-05-06', 'month')).toMatchObject({
      start: '2026-05-01', end: '2026-05-31'
    });
  });

  it('filters by category and does not double-count IGP rows that are represented by livestock records', () => {
    const range = getTreasurerReportRange('2026-05-06', 'week');
    const income = getTreasurerReportRows(transactions, livestock, range, 'income');
    expect(income.map(row => row.id)).toEqual(['income-1']);

    const expenses = getTreasurerReportRows(transactions, livestock, range, 'expenses', 'Poultry · Feed');
    expect(expenses.map(row => row.id)).toEqual(['livestock-expense']);
  });

  it('reports livestock sale proceeds separately from other income', () => {
    const rows = getTreasurerReportRows(
      transactions,
      livestock,
      getTreasurerReportRange('2026-05-06', 'day'),
      'livestock-sales'
    );
    expect(rows).toEqual([expect.objectContaining({
      id: 'livestock-sale',
      type: 'Livestock Sale',
      category: 'Poultry · Sale',
      fundSource: 'SALES (Sales Account)',
      amount: 300
    })]);
  });
});
