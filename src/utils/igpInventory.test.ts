import { describe, expect, it } from 'vitest';
import { IgpExpense, IgpLivestockInventory, IgpSale } from '../types';
import { deriveIgpLivestockInventory, getIgpInventoryStageCount, getIgpInventoryTotal } from './igpInventory';

const inventory: IgpLivestockInventory[] = [
  { produce: 'Swine Raising', openingCount: 5, stageBreakdown: { Fattening: 5 } },
  { produce: 'Goat Raising', openingCount: 10, stageBreakdown: { Growing: 10 } }
];

const expenses: IgpExpense[] = [{
  id: 'goat-stock',
  produce: 'Goat Raising',
  stage: 'Growing',
  category: 'Goat Stock',
  quantity: 2,
  description: 'Purchase',
  amount: 100,
  date: '2026-01-01',
  recordedBy: 'Treasurer'
}];

const sales: IgpSale[] = [{
  id: 'goat-sale',
  produce: 'Goat Raising',
  stage: 'Growing',
  quantity: 3,
  revenue: 150,
  date: '2026-01-02',
  recordedBy: 'Treasurer'
}];

describe('per-produce IGP inventory', () => {
  it('reconciles stock and sales only against the matching produce and stage', () => {
    expect(getIgpInventoryStageCount('Goat Raising', ['Growing'], inventory, expenses, sales)).toBe(9);
    expect(getIgpInventoryTotal('Goat Raising', inventory, expenses, sales)).toBe(9);
    expect(getIgpInventoryStageCount('Swine Raising', ['Fattening'], inventory, expenses, sales)).toBe(5);
  });

  it('uses the opening count when a project has no stage breakdown', () => {
    expect(getIgpInventoryTotal(
      'Rabbit Raising',
      [{ produce: 'Rabbit Raising', openingCount: 6, stageBreakdown: {} }],
      [],
      []
    )).toBe(6);
  });

  it('counts new-project stock purchases before an opening inventory row exists', () => {
    expect(getIgpInventoryTotal('Goat Raising', [], expenses, [])).toBe(2);
  });

  it('derives normalized livestock rows from stock expenses minus non-egg sales without double-counting', () => {
    const mixedExpenses: IgpExpense[] = [
      {
        id: 'exp-1',
        produce: 'Swine Raising',
        stage: 'Fattening',
        category: 'Piglets / Stock',
        quantity: 10,
        description: 'Bought piglets',
        amount: 35000,
        date: '2026-03-01',
        recordedBy: 'Treasurer'
      },
      {
        id: 'exp-2',
        produce: 'Swine Raising',
        stage: 'Fattening',
        category: 'Feeds',
        quantity: 20,
        description: 'Starter feeds',
        amount: 24000,
        date: '2026-03-02',
        recordedBy: 'Treasurer'
      },
      {
        id: 'exp-3',
        produce: 'RTL Chickens',
        stage: 'RTL',
        category: 'RTL Pullets Stock',
        quantity: 50,
        description: 'Bought pullets',
        amount: 25000,
        date: '2026-03-03',
        recordedBy: 'Treasurer'
      }
    ];
    const mixedSales: IgpSale[] = [
      {
        id: 'sale-1',
        produce: 'Swine Raising',
        stage: 'Fattening',
        quantity: 3,
        revenue: 21000,
        date: '2026-04-01',
        recordedBy: 'Treasurer'
      },
      {
        id: 'sale-2',
        produce: 'RTL Chickens',
        stage: 'Eggs',
        quantity: 30,
        revenue: 300,
        date: '2026-04-02',
        recordedBy: 'Treasurer'
      }
    ];

    const derived = deriveIgpLivestockInventory(mixedExpenses, mixedSales);
    expect(derived).toEqual([
      { produce: 'Swine Raising', stageBreakdown: { Fattening: 7 } },
      { produce: 'RTL Chickens', stageBreakdown: { RTL: 50 } }
    ]);

    // When reloaded alongside the same expenses & sales, live counts must not double-count.
    expect(getIgpInventoryStageCount('Swine Raising', ['Fattening'], derived, mixedExpenses, mixedSales)).toBe(7);
    expect(getIgpInventoryTotal('Swine Raising', derived, mixedExpenses, mixedSales)).toBe(7);
    expect(getIgpInventoryStageCount('RTL Chickens', ['RTL'], derived, mixedExpenses, mixedSales)).toBe(50);
  });
});
