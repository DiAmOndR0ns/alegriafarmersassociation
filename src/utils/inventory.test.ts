import { describe, expect, it } from 'vitest';
import { InventoryItem } from '../types';
import {
  getAvailableInventoryQuantity,
  getInventoryConditionForCounts,
  getInventoryDamagedQuantity,
  getRentalStockStatus
} from './inventory';

const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'inventory-1',
  name: 'Folding chairs',
  category: 'Rental Assets',
  quantity: 10,
  damagedQuantity: 0,
  unit: 'pieces',
  condition: 'Good',
  recordedBy: 'Auditor',
  dateRecorded: '2026-01-01',
  lastUpdated: '2026-01-01',
  ...overrides
});

describe('inventory count helpers', () => {
  it('calculates available units and derives the overall condition', () => {
    const inventoryItem = item({ damagedQuantity: 3, condition: 'Needs Repair' });

    expect(getInventoryDamagedQuantity(inventoryItem)).toBe(3);
    expect(getAvailableInventoryQuantity(inventoryItem)).toBe(7);
    expect(getInventoryConditionForCounts(10, 3)).toBe('Needs Repair');
    expect(getInventoryConditionForCounts(10, 10)).toBe('Damaged');
    expect(getInventoryConditionForCounts(10, 0)).toBe('Good');
  });

  it('treats legacy repair or damage records without counts as fully damaged', () => {
    expect(getInventoryDamagedQuantity(item({ condition: 'Damaged', damagedQuantity: undefined }))).toBe(10);
    expect(getAvailableInventoryQuantity(item({ condition: 'Needs Repair', damagedQuantity: undefined }))).toBe(0);
  });

  it('marks lost or fully damaged rental assets out of stock', () => {
    expect(getAvailableInventoryQuantity(item({ condition: 'Lost', damagedQuantity: 0 }))).toBe(0);
    expect(getRentalStockStatus(item({ damagedQuantity: 10 }))).toBe('Out of Stock');
    expect(getRentalStockStatus(item({ damagedQuantity: 2 }))).toBe('Limited Stock');
    expect(getRentalStockStatus(item())).toBe('In Stock');
  });
});
