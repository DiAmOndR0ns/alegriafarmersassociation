import { describe, expect, it } from 'vitest';
import { AssociationActivity, FinancialTransaction, HogRaisingState, OrganizationFund } from '../types';
import { getTreasurerAnalytics } from './treasurerAnalytics';

const activity: AssociationActivity = {
  id: 'harvest-event',
  title: 'Community Harvest Day',
  category: 'Harvest Fair',
  scheduledDate: '2026-03-10',
  scheduledTime: '08:00',
  location: 'Alegria',
  description: 'Harvest day',
  status: 'Completed',
  organizer: 'PIO'
};

const fund: OrganizationFund = {
  id: 'fund-dole',
  code: 'DOLE',
  name: 'DOLE Livelihood Fund',
  category: 'Grant',
  source: 'Department of Labor and Employment',
  initialFund: 10000,
  currentBalance: 8000,
  description: 'Livelihood support',
  custodian: 'Treasurer',
  lastUpdated: '2026-01-01'
};

const transaction = (
  id: string,
  type: FinancialTransaction['type'],
  amount: number,
  date: string,
  extra: Partial<FinancialTransaction> = {}
): FinancialTransaction => ({
  id,
  type,
  amount,
  date,
  category: type === 'income' ? 'Donation' : 'Event supplies',
  description: id,
  recordedBy: 'Treasurer',
  auditedStatus: 'Unaudited',
  ...extra
});

const livestock: HogRaisingState = {
  expenses: [{
    id: 'feed-cost',
    produce: 'Poultry Raising',
    category: 'Layer Feeds',
    description: 'Feed',
    amount: 300,
    date: '2026-03-12',
    recordedBy: 'Treasurer'
  }],
  sales: [{
    id: 'egg-income',
    produce: 'Poultry Raising',
    date: '2026-03-12',
    hogsCount: 0,
    revenue: 600,
    recordedBy: 'Treasurer'
  }],
  groups: []
};

describe('getTreasurerAnalytics', () => {
  it('combines association ledger and livestock IGP amounts into monthly analytics', () => {
    const analytics = getTreasurerAnalytics([
      transaction('event-expense', 'expense', 200, '2026-03-10', {
        activityId: activity.id,
        fundSource: 'DOLE (DOLE Livelihood Fund)'
      }),
      transaction('donation', 'income', 400, '2026-03-10')
    ], livestock, [activity], [fund], '2026');

    expect(analytics.totalIncome).toBe(1000);
    expect(analytics.totalExpenses).toBe(500);
    expect(analytics.months).toHaveLength(1);
    expect(analytics.months[0]).toMatchObject({
      income: 1000,
      expenses: 500,
      associationIncome: 400,
      igpIncome: 600,
      associationExpenses: 200,
      igpExpenses: 300,
      net: 500
    });
  });

  it('groups event expenses and livestock spending by project and category', () => {
    const analytics = getTreasurerAnalytics([
      transaction('event-expense', 'expense', 200, '2026-03-10', { activityId: activity.id })
    ], livestock, [activity], [], '2026');

    expect(analytics.eventExpenses).toEqual([{ name: 'Community Harvest Day', expenses: 200 }]);
    expect(analytics.livestockExpenses).toEqual([{ name: 'Poultry Raising · Layer Feeds', expenses: 300 }]);
  });

  it('shows balances for registered funds and tracks unregistered transaction sources', () => {
    const analytics = getTreasurerAnalytics([
      transaction('registered-income', 'income', 100, '2026-01-01', { fundSource: 'DOLE (DOLE Livelihood Fund)' }),
      transaction('other-expense', 'expense', 40, '2026-01-02', { fundSource: 'Municipal Assistance' })
    ], {
      ...livestock,
      expenses: livestock.expenses.map(expense => ({
        ...expense,
        fundSource: 'DOLE (DOLE Livelihood Fund)'
      }))
    }, [], [fund], 'all');

    expect(analytics.fundSources).toEqual([
      expect.objectContaining({
        id: 'fund-dole',
        registered: true,
        category: 'Grant',
        source: 'Department of Labor and Employment',
        balance: 8000,
        income: 100,
        expenses: 300
      }),
      expect.objectContaining({ id: 'source:municipal assistance', registered: false, expenses: 40 })
    ]);
  });

  it('filters both association and IGP analytics to the selected year', () => {
    const analytics = getTreasurerAnalytics([
      transaction('prior-year', 'income', 1000, '2025-03-10'),
      transaction('current-year', 'income', 200, '2026-03-10')
    ], livestock, [], [], '2026');

    expect(analytics.totalIncome).toBe(800);
    expect(analytics.totalExpenses).toBe(300);
  });
});
