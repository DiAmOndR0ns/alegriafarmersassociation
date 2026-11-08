import { AssociationActivity, FinancialTransaction, HogRaisingState, OrganizationFund } from '../types';

export interface TreasurerAnalyticsMonth {
  monthKey: string;
  monthLabel: string;
  shortMonth: string;
  income: number;
  expenses: number;
  net: number;
  associationIncome: number;
  igpIncome: number;
  associationExpenses: number;
  igpExpenses: number;
}

export interface TreasurerAnalytics {
  months: TreasurerAnalyticsMonth[];
  totalIncome: number;
  totalExpenses: number;
  associationIncome: number;
  igpIncome: number;
  associationExpenses: number;
  igpExpenses: number;
  eventExpenses: Array<{ name: string; expenses: number }>;
  livestockExpenses: Array<{ name: string; expenses: number }>;
  fundSources: Array<{
    id: string;
    name: string;
    registered: boolean;
    category?: string;
    source?: string;
    balance?: number;
    allocated?: number;
    income: number;
    expenses: number;
  }>;
}

const isInSelectedYear = (date: string | undefined, year: string) =>
  Boolean(date) && (year === 'all' || date!.startsWith(year));

export function getTreasurerAnalytics(
  transactions: FinancialTransaction[],
  hogRaising: HogRaisingState | undefined,
  activities: AssociationActivity[],
  funds: OrganizationFund[],
  year = 'all'
): TreasurerAnalytics {
  const months = new Map<string, TreasurerAnalyticsMonth>();
  const getMonth = (date: string) => {
    const monthKey = date.substring(0, 7);
    let month = months.get(monthKey);
    if (!month) {
      const [monthYear, monthNumber] = monthKey.split('-');
      const monthDate = new Date(Number(monthYear), Number(monthNumber) - 1, 1);
      const monthLabel = monthDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      month = {
        monthKey,
        monthLabel,
        shortMonth: monthDate.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        income: 0,
        expenses: 0,
        net: 0,
        associationIncome: 0,
        igpIncome: 0,
        associationExpenses: 0,
        igpExpenses: 0
      };
      months.set(monthKey, month);
    }
    return month;
  };

  let associationIncome = 0;
  let associationExpenses = 0;
  let igpIncome = 0;
  let igpExpenses = 0;
  const eventExpenseTotals = new Map<string, { name: string; expenses: number }>();
  const livestockExpenseTotals = new Map<string, number>();
  const fundSourceTotals = new Map<string, TreasurerAnalytics['fundSources'][number]>();

  funds.forEach(fund => {
    fundSourceTotals.set(fund.id, {
      id: fund.id,
      name: `${fund.code} · ${fund.name}`,
      registered: true,
      category: fund.category,
      source: fund.source,
      balance: Number(fund.currentBalance) || 0,
      allocated: Number(fund.allocatedAmount) || 0,
      income: 0,
      expenses: 0
    });
  });

  const recordFundSource = (source: string | undefined, isIncome: boolean, amount: number) => {
    if (!source?.trim()) return;
    const normalizedSource = source.trim().toLowerCase();
    const registeredFund = funds.find(fund => {
      const code = fund.code.trim().toLowerCase();
      const name = fund.name.trim().toLowerCase();
      return normalizedSource === code || normalizedSource === name ||
        normalizedSource.startsWith(`${code} (`);
    });
    const sourceId = registeredFund?.id || `source:${normalizedSource}`;
    const sourceEntry = fundSourceTotals.get(sourceId) || {
      id: sourceId,
      name: source.trim(),
      registered: false,
      income: 0,
      expenses: 0
    };
    sourceEntry[isIncome ? 'income' : 'expenses'] += amount;
    fundSourceTotals.set(sourceId, sourceEntry);
  };

  transactions.forEach(transaction => {
    if (!isInSelectedYear(transaction.date, year)) return;
    const amount = Number(transaction.amount) || 0;
    const isIncome = transaction.type === 'income';
    const month = getMonth(transaction.date);
    month[isIncome ? 'income' : 'expenses'] += amount;
    month[isIncome ? 'associationIncome' : 'associationExpenses'] += amount;
    if (isIncome) associationIncome += amount;
    else associationExpenses += amount;

    if (!isIncome && transaction.activityId) {
      const activity = activities.find(item => item.id === transaction.activityId);
      const event = eventExpenseTotals.get(transaction.activityId) || {
        name: activity?.title || 'Activity no longer listed',
        expenses: 0
      };
      event.expenses += amount;
      eventExpenseTotals.set(transaction.activityId, event);
    }

    recordFundSource(transaction.fundSource, isIncome, amount);
  });

  (hogRaising?.sales || []).forEach(sale => {
    if (!isInSelectedYear(sale.date, year)) return;
    const amount = Number(sale.revenue) || 0;
    getMonth(sale.date).income += amount;
    getMonth(sale.date).igpIncome += amount;
    igpIncome += amount;
  });

  (hogRaising?.expenses || []).forEach(expense => {
    if (!isInSelectedYear(expense.date, year)) return;
    const amount = Number(expense.amount) || 0;
    getMonth(expense.date).expenses += amount;
    getMonth(expense.date).igpExpenses += amount;
    igpExpenses += amount;
    const label = `${expense.produce || 'Livestock'} · ${expense.category}`;
    livestockExpenseTotals.set(label, (livestockExpenseTotals.get(label) || 0) + amount);
    recordFundSource(expense.fundSource, false, amount);
  });

  const monthData = Array.from(months.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  monthData.forEach(month => { month.net = month.income - month.expenses; });

  const fundSources = Array.from(fundSourceTotals.values()).sort((a, b) => {
    if (a.registered !== b.registered) return a.registered ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    months: monthData,
    totalIncome: associationIncome + igpIncome,
    totalExpenses: associationExpenses + igpExpenses,
    associationIncome,
    igpIncome,
    associationExpenses,
    igpExpenses,
    eventExpenses: Array.from(eventExpenseTotals.values()).sort((a, b) => b.expenses - a.expenses),
    livestockExpenses: Array.from(livestockExpenseTotals, ([name, expenses]) => ({ name, expenses }))
      .sort((a, b) => b.expenses - a.expenses),
    fundSources
  };
}
