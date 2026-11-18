import { describe, expect, it } from 'vitest';
import { IgpExpense, IgpLivestockInventory, IgpSale } from '../types';
import { getIgpInventoryStageCount, getIgpInventoryTotal } from './igpInventory';

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
});
