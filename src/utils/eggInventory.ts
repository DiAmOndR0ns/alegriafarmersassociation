import { EggHarvestLog, IgpSale } from '../types';

export const isEggCatalogProduct = (product: { name: string; cebName?: string }) =>
  /\beggs?\b|\bitlog\b/i.test(`${product.name} ${product.cebName || ''}`);

const isVerifiedHarvest = (harvest: EggHarvestLog) =>
  harvest.status === 'Audited' || harvest.status === 'Signed';

const isEggSale = (sale: IgpSale) =>
  sale.stage === 'Eggs' || sale.stage === 'General' || sale.stage === undefined;

export function getAvailableEggCount(
  harvests: EggHarvestLog[],
  sales: IgpSale[],
  produce: string,
  excludeSaleId?: string
): number {
  const collected = harvests
    .filter((harvest) =>
      isVerifiedHarvest(harvest) &&
      (harvest.produce || 'Poultry Raising (RTL)') === produce
    )
    .reduce((total, harvest) => total + Math.max(0, Math.floor(Number(harvest.eggCount) || 0)), 0);

  const sold = sales
    .filter((sale) =>
      sale.id !== excludeSaleId &&
      (sale.produce || 'Poultry Raising (RTL)') === produce &&
      isEggSale(sale)
    )
    .reduce((total, sale) => total + Math.max(0, Math.floor(Number(sale.quantity) || 0)), 0);

  return Math.max(0, collected - sold);
}
