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
  return stages.reduce((total, stage) => {
    const baseline = Object.entries(breakdown)
      .find(([name]) => name.toLowerCase() === stage.toLowerCase())?.[1];
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
