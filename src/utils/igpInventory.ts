import { IgpExpense, IgpLivestockInventory, IgpSale, IgpStage } from '../types';

const STOCK_CATEGORIES = ['Piglets / Stock', 'Calves / Cattle Stock', 'RTL Pullets Stock'];

export const isIgpStockPurchaseCategory = (category: string) =>
  STOCK_CATEGORIES.includes(category) || /\b(?:stock|animal purchase|livestock purchase)\b/i.test(category);

const integerCount = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const signedCount = (value: unknown) => Math.trunc(Number(value) || 0);

function projectOf(record: { produce?: string }, defaultProduce?: string) {
  return record.produce || defaultProduce || '';
}

function stageDelta(
  produce: string,
  matchesStage: (stage?: IgpStage) => boolean,
  inventory: IgpLivestockInventory[],
  expenses: IgpExpense[],
  sales: IgpSale[],
  defaultProduce?: string
) {
  const added = expenses
    .filter((expense) =>
      projectOf(expense, defaultProduce) === produce
      && expense.quantity
      && isIgpStockPurchaseCategory(expense.category)
      && matchesStage(expense.stage)
    )
    .reduce((sum, expense) => sum + integerCount(expense.quantity), 0);
  const sold = sales
    .filter((sale) => projectOf(sale, defaultProduce) === produce && matchesStage(sale.stage))
    .reduce((sum, sale) => sum + integerCount(sale.quantity), 0);
  return added - sold;
}

export function deriveIgpLivestockInventory(
  expenses: IgpExpense[] = [],
  sales: IgpSale[] = [],
  defaultProduce?: string
): IgpLivestockInventory[] {
  const counts = new Map<string, Map<string, number>>();

  const ensureStage = (produce: string, stage: string) => {
    let stageMap = counts.get(produce);
    if (!stageMap) {
      stageMap = new Map<string, number>();
      counts.set(produce, stageMap);
    }
    if (!stageMap.has(stage)) {
      stageMap.set(stage, 0);
    }
    return stageMap;
  };

  for (const expense of expenses) {
    if (!expense?.quantity || !isIgpStockPurchaseCategory(expense.category || '')) continue;
    const produce = projectOf(expense, defaultProduce).trim();
    if (!produce) continue;
    const stage = String(expense.stage || 'General').trim() || 'General';
    const qty = integerCount(expense.quantity);
    if (qty <= 0) continue;
    const stageMap = ensureStage(produce, stage);
    stageMap.set(stage, (stageMap.get(stage) || 0) + qty);
  }

  for (const sale of sales) {
    const qty = integerCount(sale?.quantity);
    if (qty <= 0) continue;
    const stage = String(sale?.stage || 'General').trim() || 'General';
    // Egg sales deduct from egg harvest inventory, not from live poultry headcount.
    if (stage.toLowerCase() === 'eggs') continue;
    const produce = projectOf(sale, defaultProduce).trim();
    if (!produce) continue;
    const stageMap = counts.get(produce);
    if (!stageMap) continue;
    const matchedStage = Array.from(stageMap.keys()).find(
      (key) => key.toLowerCase() === stage.toLowerCase()
    );
    if (matchedStage) {
      stageMap.set(matchedStage, Math.max(0, (stageMap.get(matchedStage) || 0) - qty));
    }
  }

  return Array.from(counts.entries()).map(([produce, stageMap]) => ({
    produce,
    stageBreakdown: Object.fromEntries(stageMap.entries())
  }));
}

export function getIgpInventoryStageCount(
  produce: string,
  stages: string[],
  inventory: IgpLivestockInventory[],
  expenses: IgpExpense[],
  sales: IgpSale[],
  defaultProduce?: string
) {
  const projectInventory = inventory.find((item) => item.produce === produce);
  const breakdown = projectInventory?.stageBreakdown || {};
  const hasOpeningBaseline = projectInventory?.openingCount !== undefined;
  return stages.reduce((total, stage) => {
    const matchedEntry = Object.entries(breakdown)
      .find(([name]) => name.toLowerCase() === stage.toLowerCase());
    if (matchedEntry && !hasOpeningBaseline) {
      // Normalized afa_igp_livestocks rows store the reconciled live headcount
      // (already includes stock-purchase expenses minus livestock sales).
      return total + Math.max(0, signedCount(matchedEntry[1]));
    }
    const baseline = matchedEntry?.[1];
    const delta = stageDelta(
      produce,
      (value) => value?.toLowerCase() === stage.toLowerCase(),
      inventory,
      expenses,
      sales,
      defaultProduce
    );
    return total + Math.max(0, signedCount(baseline) + delta);
  }, 0);
}

export function getIgpInventoryTotal(
  produce: string,
  inventory: IgpLivestockInventory[],
  expenses: IgpExpense[],
  sales: IgpSale[],
  defaultProduce?: string
) {
  const projectInventory = inventory.find((item) => item.produce === produce);
  const stages = Object.keys(projectInventory?.stageBreakdown || {});
  if (stages.length > 0) {
    return stages.reduce(
      (total, stage) => total + getIgpInventoryStageCount(produce, [stage], inventory, expenses, sales, defaultProduce),
      0
    );
  }
  return Math.max(
    0,
    signedCount(projectInventory?.openingCount)
      + stageDelta(produce, () => true, inventory, expenses, sales, defaultProduce)
  );
}
