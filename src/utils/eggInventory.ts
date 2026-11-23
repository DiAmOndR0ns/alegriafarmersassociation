import { EggHarvestLog, IgpSale } from '../types';

const LEGACY_POULTRY_PRODUCE = 'Poultry Raising (RTL)';

export const isEggCatalogProduct = (product: { name: string; cebName?: string }) =>
  /\beggs?\b|\bitlog\b/i.test(`${product.name} ${product.cebName || ''}`);

export const isPoultryProduceName = (produce?: string) =>
  Boolean(produce && /poultry|rtl|manok|chicken|egg|layer/i.test(produce));

const isVerifiedHarvest = (harvest: EggHarvestLog) =>
  harvest.status === 'Audited' || harvest.status === 'Signed';

const isEggSale = (sale: IgpSale) =>
  sale.stage === 'Eggs' || sale.stage === 'General' || sale.stage === undefined;

function matchesEggProduce(recordProduce: string | undefined, targetProduce: string): boolean {
  const cleanRecord = (recordProduce || '').trim();
  const cleanTarget = (targetProduce || '').trim();
  if (!cleanTarget) return true;
  if (cleanRecord && cleanRecord.toLowerCase() === cleanTarget.toLowerCase()) return true;
  // Legacy harvests/sales saved with blank produce (or the old default 'Poultry Raising (RTL)')
  // belong to the active poultry/RTL project when the association uses a custom poultry name.
  if (isPoultryProduceName(cleanTarget) && (!cleanRecord || cleanRecord === LEGACY_POULTRY_PRODUCE)) {
    return true;
  }
  return false;
}

export function getAvailableEggCount(
  harvests: EggHarvestLog[],
  sales: IgpSale[],
  produce: string,
  excludeSaleId?: string
): number {
  const collected = harvests
    .filter((harvest) =>
      isVerifiedHarvest(harvest) &&
      matchesEggProduce(harvest.produce, produce)
    )
    .reduce((total, harvest) => total + Math.max(0, Math.floor(Number(harvest.eggCount) || 0)), 0);

  const sold = sales
    .filter((sale) =>
      sale.id !== excludeSaleId &&
      matchesEggProduce(sale.produce, produce) &&
      isEggSale(sale)
    )
    .reduce((total, sale) => total + Math.max(0, Math.floor(Number(sale.quantity) || 0)), 0);

  return Math.max(0, collected - sold);
}

export function getTotalAvailableEggCount(
  harvests: EggHarvestLog[],
  sales: IgpSale[],
  excludeSaleId?: string
): number {
  const collected = harvests
    .filter(isVerifiedHarvest)
    .reduce((total, harvest) => total + Math.max(0, Math.floor(Number(harvest.eggCount) || 0)), 0);

  const sold = sales
    .filter((sale) =>
      sale.id !== excludeSaleId &&
      isEggSale(sale) &&
      (!sale.produce || isPoultryProduceName(sale.produce))
    )
    .reduce((total, sale) => total + Math.max(0, Math.floor(Number(sale.quantity) || 0)), 0);

  return Math.max(0, collected - sold);
}
