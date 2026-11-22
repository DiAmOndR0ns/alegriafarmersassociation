import { InventoryAssetType, InventoryItem, Product } from '../types';

const wholeNumber = (value: unknown) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

export function getInventoryAssetType(item: Pick<InventoryItem, 'assetType' | 'category' | 'catalogProductId'>): InventoryAssetType {
  if (item.assetType === 'rental' || item.assetType === 'usable') return item.assetType;
  if (item.category === 'Rental Assets' || Boolean(item.catalogProductId)) return 'rental';
  return 'usable';
}

export function getInventoryDamagedQuantity(item: InventoryItem): number {
  const quantity = wholeNumber(item.quantity);
  const damaged = Math.min(quantity, wholeNumber(item.damagedQuantity));
  if (damaged === 0 && (item.condition === 'Needs Repair' || item.condition === 'Damaged')) {
    return quantity;
  }
  return damaged;
}

export function getInventoryLostQuantity(item: InventoryItem): number {
  const quantity = wholeNumber(item.quantity);
  const lost = Math.min(quantity, wholeNumber(item.lostQuantity));
  if (lost === 0 && item.condition === 'Lost') {
    return quantity;
  }
  return lost;
}

export function getInventoryUsedQuantity(item: InventoryItem): number {
  if (getInventoryAssetType(item) === 'rental') return 0;
  const quantity = wholeNumber(item.quantity);
  return Math.min(quantity, wholeNumber(item.usedQuantity));
}

export function getAvailableInventoryQuantity(item: InventoryItem): number {
  const quantity = wholeNumber(item.quantity);
  const damaged = getInventoryDamagedQuantity(item);
  const lost = getInventoryLostQuantity(item);
  const used = getInventoryUsedQuantity(item);
  if (item.condition === 'Lost' && lost >= quantity) return 0;
  return Math.max(0, quantity - damaged - lost - used);
}

export function getInventoryConditionForCounts(
  quantity: number,
  damagedQuantity: number,
  lostQuantity = 0
): InventoryItem['condition'] {
  const total = wholeNumber(quantity);
  const damaged = Math.min(total, wholeNumber(damagedQuantity));
  const lost = Math.min(total, wholeNumber(lostQuantity));
  if (total > 0 && lost >= total) return 'Lost';
  if (damaged === 0 && lost === 0) return 'Good';
  if (total > 0 && damaged + lost >= total && damaged > 0) return 'Damaged';
  return 'Needs Repair';
}

export function getRentalStockStatus(item: InventoryItem): Product['stockStatus'] {
  const available = getAvailableInventoryQuantity(item);
  if (available === 0) return 'Out of Stock';
  if (available < wholeNumber(item.quantity)) return 'Limited Stock';
  return 'In Stock';
}
