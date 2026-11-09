import { FinancialTransaction, HogRaisingState } from '../types';

export type TreasurerReportPeriod = 'day' | 'week' | 'month';
export type TreasurerReportKind = 'all' | 'income' | 'expenses' | 'livestock-sales';

export interface TreasurerReportRange {
  start: string;
  end: string;
  label: string;
}

export interface TreasurerReportRow {
  id: string;
  date: string;
  type: 'Income' | 'Expense' | 'Livestock Sale';
  category: string;
  description: string;
  fundSource: string;
  recordedBy: string;
  amount: number;
}

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function getTreasurerReportRange(dateValue: string, period: TreasurerReportPeriod): TreasurerReportRange {
  const anchor = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) throw new Error(`Invalid report date: ${dateValue}`);

  const start = new Date(anchor);
  const end = new Date(anchor);
  if (period === 'week') {
    const daysFromMonday = (anchor.getDay() + 6) % 7;
    start.setDate(anchor.getDate() - daysFromMonday);
    end.setDate(start.getDate() + 6);
  } else if (period === 'month') {
    start.setDate(1);
    end.setMonth(anchor.getMonth() + 1, 0);
  }

  const startValue = formatDate(start);
  const endValue = formatDate(end);
  return {
    start: startValue,
    end: endValue,
    label: startValue === endValue ? startValue : `${startValue} to ${endValue}`
  };
}

const isLinkedIgpLedgerEntry = (transaction: FinancialTransaction) =>
  /\[[^\]]*\bIGP\b[^\]]*\]/i.test(transaction.description);

export function getTreasurerReportRows(
  transactions: FinancialTransaction[],
  hogRaising: HogRaisingState | undefined,
  range: TreasurerReportRange,
  kind: TreasurerReportKind,
  category = 'all'
): TreasurerReportRow[] {
  const rows: TreasurerReportRow[] = [];

  if (kind !== 'livestock-sales') {
    transactions.forEach(transaction => {
      if (transaction.date < range.start || transaction.date > range.end || isLinkedIgpLedgerEntry(transaction)) return;
      if (kind === 'income' && transaction.type !== 'income') return;
      if (kind === 'expenses' && transaction.type !== 'expense') return;
      rows.push({
        id: transaction.id,
        date: transaction.date,
        type: transaction.type === 'income' ? 'Income' : 'Expense',
        category: transaction.category,
        description: transaction.description,
        fundSource: transaction.fundSource || 'Not specified',
        recordedBy: transaction.recordedBy,
        amount: Number(transaction.amount) || 0
      });
    });
  }

  if (kind === 'all' || kind === 'expenses') {
    (hogRaising?.expenses || []).forEach(expense => {
      if (expense.date < range.start || expense.date > range.end) return;
      rows.push({
        id: expense.id,
        date: expense.date,
        type: 'Expense',
        category: `${expense.produce || 'Livestock'} · ${expense.category}`,
        description: expense.description,
        fundSource: expense.fundSource || 'Not specified',
        recordedBy: expense.recordedBy,
        amount: Number(expense.amount) || 0
      });
    });
  }

  if (kind === 'all' || kind === 'livestock-sales') {
    (hogRaising?.sales || []).forEach(sale => {
      if (sale.date < range.start || sale.date > range.end) return;
      rows.push({
        id: sale.id,
        date: sale.date,
        type: 'Livestock Sale',
        category: `${sale.produce || 'Livestock'} · ${sale.hogStage || 'Sale'}`,
        description: sale.notes || `${sale.produce || 'Livestock'} sale proceeds`,
        fundSource: sale.fundSource || 'Not specified',
        recordedBy: sale.recordedBy,
        amount: Number(sale.revenue) || 0
      });
    });
  }

  return rows
    .filter(row => category === 'all' || row.category === category)
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}
