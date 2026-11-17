import { InventoryItem, Product } from '../types';

const wholeNumber = (value: unknown) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

export function getInventoryDamagedQuantity(item: InventoryItem): number {
  const quantity = wholeNumber(item.quantity);
  const damaged = Math.min(quantity, wholeNumber(item.damagedQuantity));
  if (damaged === 0 && (item.condition === 'Needs Repair' || item.condition === 'Damaged')) {
    return quantity;
  }
  return damaged;
}

export function getAvailableInventoryQuantity(item: InventoryItem): number {
  if (item.condition === 'Lost') return 0;
  return Math.max(0, wholeNumber(item.quantity) - getInventoryDamagedQuantity(item));
}

export function getInventoryConditionForCounts(quantity: number, damagedQuantity: number): InventoryItem['condition'] {
  const total = wholeNumber(quantity);
  const damaged = Math.min(total, wholeNumber(damagedQuantity));
  if (damaged === 0) return 'Good';
  return damaged >= total ? 'Damaged' : 'Needs Repair';
}

export function getRentalStockStatus(item: InventoryItem): Product['stockStatus'] {
  const available = getAvailableInventoryQuantity(item);
  if (available === 0) return 'Out of Stock';
  if (available < wholeNumber(item.quantity)) return 'Limited Stock';
  return 'In Stock';
}
