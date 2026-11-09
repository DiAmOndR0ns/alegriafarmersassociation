import type { FinancialTransaction, OrganizationFund } from '../types';

/**
 * The initial fund is the single source of truth for a fund account.
 * The live balance is always derived from it plus the ledger, so it can never
 * drift out of sync with the transactions that produced it.
 */
export function getInitialFund(fund: Pick<OrganizationFund, 'initialFund'> & { allocatedAmount?: number }): number {
  const initial = Number(fund.initialFund);
  if (Number.isFinite(initial)) return initial;
  // Legacy records only carried `allocatedAmount`.
  const legacy = Number(fund.allocatedAmount);
  return Number.isFinite(legacy) ? legacy : 0;
}

/** Matches a transaction's `fundSource` label ("CODE (Name)") to a registered fund. */
export function findFundForSource(funds: OrganizationFund[], fundSource?: string): OrganizationFund | undefined {
  if (!fundSource?.trim()) return undefined;
  const normalized = fundSource.trim().toLowerCase();
  return funds.find(fund => {
    const code = fund.code.trim().toLowerCase();
    const name = fund.name.trim().toLowerCase();
    return normalized === code || normalized === name || normalized.startsWith(`${code} (`);
  });
}

/**
 * Recomputes every fund's live balance from its initial fund and the ledger.
 * Income adds, expenses subtract. Overspending is shown as a negative balance
 * rather than being silently clamped to zero.
 */
export function computeFundBalances(
  funds: OrganizationFund[],
  transactions: FinancialTransaction[]
): OrganizationFund[] {
  const deltas = new Map<string, number>();
  for (const tx of transactions) {
    const fund = findFundForSource(funds, tx.fundSource);
    if (!fund) continue;
    const amount = Number(tx.amount) || 0;
    const signed = tx.type === 'income' ? amount : -amount;
    deltas.set(fund.id, (deltas.get(fund.id) || 0) + signed);
  }

  return funds.map(fund => {
    const initial = getInitialFund(fund);
    const balance = initial + (deltas.get(fund.id) || 0);
    return fund.currentBalance === balance ? fund : { ...fund, currentBalance: balance };
  });
}

/** Total of all initial funds — the association's starting capital. */
export function getTotalInitialFund(funds: OrganizationFund[]): number {
  return funds.reduce((total, fund) => total + getInitialFund(fund), 0);
}

/** Total of all live balances. */
export function getTotalCurrentBalance(funds: OrganizationFund[]): number {
  return funds.reduce((total, fund) => total + (Number(fund.currentBalance) || 0), 0);
}
