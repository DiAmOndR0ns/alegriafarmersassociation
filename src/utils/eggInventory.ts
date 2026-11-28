import { EGG_SIZES, EggHarvestLog, EggSize, EggSizeBreakdown, IgpSale } from '../types';

const LEGACY_POULTRY_PRODUCE = 'Poultry Raising (RTL)';

export { EGG_SIZES };

export const EGG_SIZE_SHORT_LABELS: Record<EggSize, string> = {
  'Small': 'S',
  'Medium': 'M',
  'Large': 'L',
  'Extra Large (XL)': 'XL',
  'Jumbo': 'Jumbo',
};

export function normalizeEggSize(value: unknown): EggSize | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().toLowerCase();
  if (!clean) return undefined;
  if (clean === 'small' || clean === 's') return 'Small';
  if (clean === 'medium' || clean === 'm') return 'Medium';
  if (clean === 'large' || clean === 'l') return 'Large';
  if (clean === 'extra large (xl)' || clean === 'extra large' || clean === 'xl' || clean === 'x-large') return 'Extra Large (XL)';
  if (clean === 'jumbo') return 'Jumbo';
  return EGG_SIZES.find((size) => size.toLowerCase() === clean);
}

export function sanitizeEggSizeBreakdown(raw: unknown): EggSizeBreakdown | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: EggSizeBreakdown = {};
  let hasPositive = false;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const size = normalizeEggSize(key);
    if (!size) continue;
    const count = Math.max(0, Math.floor(Number(val) || 0));
    if (count > 0) {
      result[size] = (result[size] || 0) + count;
      hasPositive = true;
    }
  }
  return hasPositive ? result : undefined;
}

export function sumEggSizeBreakdown(breakdown?: EggSizeBreakdown): number {
  if (!breakdown) return 0;
  return EGG_SIZES.reduce((sum, size) => sum + Math.max(0, Math.floor(Number(breakdown[size]) || 0)), 0);
}

export function formatEggSizeBreakdown(breakdown?: EggSizeBreakdown): string {
  if (!breakdown) return '';
  const parts: string[] = [];
  for (const size of EGG_SIZES) {
    const count = Math.max(0, Math.floor(Number(breakdown[size]) || 0));
    if (count > 0) {
      parts.push(`${EGG_SIZE_SHORT_LABELS[size]}: ${count}`);
    }
  }
  return parts.join(' • ');
}

export function extractEggSizeFromStage(stage?: string): EggSize | undefined {
  if (!stage) return undefined;
  const match = stage.match(/^Eggs\s*\((.+)\)$/i);
  if (match) return normalizeEggSize(match[1]);
  return undefined;
}

export function resolveSaleEggSize(sale: IgpSale): EggSize | undefined {
  return normalizeEggSize(sale.eggSize) || extractEggSizeFromStage(sale.stage);
}

export const isEggCatalogProduct = (product: { name: string; cebName?: string }) =>
  /\beggs?\b|\bitlog\b/i.test(`${product.name} ${product.cebName || ''}`);

export const isPoultryProduceName = (produce?: string) =>
  Boolean(produce && /poultry|rtl|manok|chicken|egg|layer/i.test(produce));

const isVerifiedHarvest = (harvest: EggHarvestLog) =>
  harvest.status === 'Signed';

export const isEggSaleStage = (stage?: string) =>
  stage === 'Eggs' || stage === 'General' || stage === undefined || Boolean(stage && /^Eggs\s*\(.+\)$/i.test(stage));

const isEggSale = (sale: IgpSale) =>
  isEggSaleStage(sale.stage);

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

export function getAvailableEggsBySize(
  harvests: EggHarvestLog[],
  sales: IgpSale[],
  produce: string = '',
  excludeSaleId?: string
): { bySize: Record<EggSize, number>; unsegregated: number; total: number } {
  const bySize: Record<EggSize, number> = {
    'Small': 0,
    'Medium': 0,
    'Large': 0,
    'Extra Large (XL)': 0,
    'Jumbo': 0,
  };
  let unsegregated = 0;
  const hasTargetProduce = Boolean(produce && produce.trim());

  for (const harvest of harvests) {
    if (!isVerifiedHarvest(harvest)) continue;
    if (hasTargetProduce && !matchesEggProduce(harvest.produce, produce)) continue;
    const totalHarvest = Math.max(0, Math.floor(Number(harvest.eggCount) || 0));
    const breakdown = sanitizeEggSizeBreakdown(harvest.sizeBreakdown);
    if (breakdown) {
      let categorized = 0;
      for (const size of EGG_SIZES) {
        const c = Math.max(0, Math.floor(Number(breakdown[size]) || 0));
        bySize[size] += c;
        categorized += c;
      }
      if (totalHarvest > categorized) {
        unsegregated += totalHarvest - categorized;
      }
    } else {
      unsegregated += totalHarvest;
    }
  }

  let unsegregatedSold = 0;
  for (const sale of sales) {
    if (sale.id === excludeSaleId || !isEggSale(sale)) continue;
    if (hasTargetProduce) {
      if (!matchesEggProduce(sale.produce, produce)) continue;
    } else if (sale.produce && !isPoultryProduceName(sale.produce)) {
      continue;
    }
    const qty = Math.max(0, Math.floor(Number(sale.quantity) || 0));
    if (qty <= 0) continue;
    const saleSize = resolveSaleEggSize(sale);
    if (saleSize) {
      if (bySize[saleSize] >= qty) {
        bySize[saleSize] -= qty;
      } else {
        const deficit = qty - bySize[saleSize];
        bySize[saleSize] = 0;
        unsegregatedSold += deficit;
      }
    } else {
      unsegregatedSold += qty;
    }
  }

  if (unsegregated >= unsegregatedSold) {
    unsegregated -= unsegregatedSold;
  } else {
    let remainingToDeduct = unsegregatedSold - unsegregated;
    unsegregated = 0;
    for (const size of EGG_SIZES) {
      if (remainingToDeduct <= 0) break;
      const deduct = Math.min(bySize[size], remainingToDeduct);
      bySize[size] -= deduct;
      remainingToDeduct -= deduct;
    }
  }

  const total = EGG_SIZES.reduce((sum, size) => sum + bySize[size], 0) + unsegregated;
  return { bySize, unsegregated, total };
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
