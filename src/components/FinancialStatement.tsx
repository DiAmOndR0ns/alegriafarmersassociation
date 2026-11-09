import React from 'react';
import { AssociationActivity, FinancialTransaction, HogRaisingState, InventoryItem, OrganizationFund, User } from '../types';
import { resolveOfficerName } from '../utils/officers';
import { getInitialFund } from '../utils/fundBalance';

interface FinancialStatementProps {
  transactions?: FinancialTransaction[];
  activities?: AssociationActivity[];
  funds?: OrganizationFund[];
  hogRaising?: HogRaisingState;
  inventory?: InventoryItem[];
  users?: User[];
  year?: number;
}

const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const peso = (value: number) => `PHP ${money(value)}`;

function Line({
  label,
  value,
  bold = false,
  indent = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
}) {
  return (
    <div className={`line ${bold ? 'bold' : ''} ${indent ? 'indent' : ''}`}>
      <span>{label}</span>
      <span className="amount">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function FinancialStatement({
  transactions = [],
  activities = [],
  funds = [],
  hogRaising,
  inventory = [],
  users = [],
  year: yearProp,
}: FinancialStatementProps) {
  const year = yearProp ?? new Date().getFullYear();
  const treasurer = resolveOfficerName(users, 'Treasurer');
  const auditor = resolveOfficerName(users, 'Auditor');
  const president = resolveOfficerName(users, 'President');

  const yearTransactions = transactions.filter(transaction => transaction.date?.startsWith(String(year)));
  const totalIncome = yearTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalExpense = yearTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const netSurplus = totalIncome - totalExpense;

  const totalFundBalance = funds.reduce((sum, fund) => sum + Number(fund.currentBalance || 0), 0);
  const totalAllocated = funds.reduce((sum, fund) => sum + getInitialFund(fund), 0);

  const incomeCategoryTotals: Record<string, number> = {};
  const expenseCategoryTotals: Record<string, number> = {};

  yearTransactions.forEach((transaction) => {
    if (transaction.type === 'income') {
      incomeCategoryTotals[transaction.category] = (incomeCategoryTotals[transaction.category] || 0) + Number(transaction.amount || 0);
    } else {
      expenseCategoryTotals[transaction.category] = (expenseCategoryTotals[transaction.category] || 0) + Number(transaction.amount || 0);
    }
  });
  const activityTotals = new Map<string, { title: string; income: number; expense: number }>();
  yearTransactions.forEach(transaction => {
    const activityId = transaction.activityId || 'unassigned';
    const activity = activities.find(item => item.id === transaction.activityId);
    const totals = activityTotals.get(activityId) || {
      title: activity?.title || (transaction.activityId ? 'Activity no longer listed' : 'Not linked to an activity'),
      income: 0,
      expense: 0
    };
    totals[transaction.type] += Number(transaction.amount || 0);
    activityTotals.set(activityId, totals);
  });

  const hogExpenses = (hogRaising?.expenses || []).filter((expense) => expense.date?.startsWith(String(year))).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const hogSales = (hogRaising?.sales || []).filter((sale) => sale.date?.startsWith(String(year))).reduce((sum, sale) => sum + Number(sale.revenue || 0), 0);
  const hogNet = hogSales - hogExpenses;

  const inventoryCount = inventory.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalIncomeWithHog = totalIncome + hogSales;
  const totalExpenseWithHog = totalExpense + hogExpenses;
  const netPosition = netSurplus + hogNet;

  return (
    <main className="document financial-statement-root">
      <style>{`
        @page { size: letter; margin: 0.65in; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #ececec; color: #171717; font-family: Arial, Helvetica, sans-serif; }
        .document { width: 8.5in; margin: 24px auto; }
        .page { min-height: 9.7in; padding: 0.25in 0.3in; background: white; margin-bottom: 24px; page-break-after: always; }
        .financial-statement-root { color: #171717; background: #fff; }
        .financial-statement-root * { color: inherit; }
        .page:last-child { page-break-after: auto; }
        .org-header { text-align: center; line-height: 1.35; font-size: 12px; font-weight: 700; }
        .org-name { margin-top: 22px; font-size: 13px; }
        .registration { margin-top: 5px; font-size: 12px; }
        .report-title { margin: 26px 0 20px; text-align: center; font-weight: 700; font-size: 14px; }
        .section { margin: 18px 0 24px; break-inside: avoid; }
        .section h2 { font-size: 13px; font-weight: 700; margin: 0 0 12px; }
        .line { display: grid; grid-template-columns: 1fr 2.25in; gap: 12px; align-items: baseline; font-size: 12px; line-height: 1.75; color: #171717; }
        .line .amount { white-space: nowrap; }
        .line.bold { font-weight: 700; }
        .line.indent { padding-left: 20px; }
        .subheading { margin: 13px 0 4px; font-size: 12px; font-weight: 700; }
        .rule { border-top: 1px solid #555; margin: 8px 0; }
        .inventory { margin-top: 18px; }
        .inventory-row { display: grid; grid-template-columns: 1.1in 0.3in 1fr; gap: 10px; font-size: 12px; line-height: 2; }
        .signatures { display: flex; justify-content: space-between; gap: 40px; margin-top: 68px; font-size: 11px; }
        .signature { width: 42%; border-top: 1px solid #555; padding-top: 7px; }
        .note { font-size: 9px; color: #555; margin-top: 22px; }
        @media print {
          @page { size: letter; margin: 0.65in; }
          html, body, #root { width: auto !important; height: auto !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .financial-statement-root, .financial-statement-root * { visibility: visible !important; }
          .financial-statement-root { position: absolute !important; inset: 0 auto 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; color: #171717 !important; }
          .financial-statement-root .no-print { display: none !important; }
          .financial-statement-root .page { min-height: 9.7in; margin: 0; padding: 0; box-shadow: none; }
        }
      `}</style>

      <div className="no-print" style={{ padding: '10px 0', fontSize: 12, color: '#555' }}>
        Printable financial statement · Use Ctrl/Cmd + P to print
      </div>

      <article className="page">
        <header className="org-header">
          Republic of the Philippines<br />
          Province of Cebu<br />
          Municipality of Tuburan<br />
          Barangay Alegria
          <div className="org-name">Alegria Farmers Association (AFA)</div>
          <div className="registration">DOLE Registration No. 2315</div>
          <div className="report-title">FINANCIAL STATEMENT (Year Ended: Dec. 31, {year})</div>
        </header>

        <Section title="I. CASH POSITION">
          <p className="note">
            Cash balances and allocated capital are current account snapshots; historical year-end balances are not stored.
          </p>
          {funds.length === 0 ? (
            <Line label="No treasury accounts registered." value="—" indent />
          ) : funds.map((fund) => (
            <Line key={fund.id} label={`${fund.code} — ${fund.name}`} value={peso(fund.currentBalance)} indent />
          ))}
          <div className="rule" />
          <Line label="TOTAL CASH BALANCE, ALL ACCOUNTS" value={peso(totalFundBalance)} bold />
          <Line label="TOTAL ALLOCATED CAPITAL, ALL FUNDS" value={peso(totalAllocated)} indent />
        </Section>

        <Section title="II. INCOME / RECEIPTS">
          {Object.keys(incomeCategoryTotals).length === 0 ? (
            <Line label="No income recorded for the period." value="—" indent />
          ) : Object.entries(incomeCategoryTotals).map(([category, amount]) => (
            <Line key={category} label={category} value={peso(amount)} indent />
          ))}
          {hogSales > 0 && (
            <>
              <div className="subheading">Hog Raising IGP (Fiscal Year {year})</div>
              <Line label="IGP Sales" value={peso(hogSales)} indent />
            </>
          )}
          <div className="rule" />
          <Line label="TOTAL INCOME / RECEIPTS" value={peso(totalIncomeWithHog)} bold />
        </Section>

        <Section title="III. EXPENDITURES">
          {Object.keys(expenseCategoryTotals).length === 0 ? (
            <Line label="No expenditures recorded for the period." value="—" indent />
          ) : Object.entries(expenseCategoryTotals).map(([category, amount]) => (
            <Line key={category} label={category} value={peso(amount)} indent />
          ))}
          {hogExpenses > 0 && (
            <>
              <div className="subheading">Hog Raising IGP (Fiscal Year {year})</div>
              <Line label="IGP Expenses (feeds, stock, medication)" value={peso(hogExpenses)} indent />
            </>
          )}
          <div className="rule" />
          <Line label="TOTAL EXPENDITURES" value={peso(totalExpenseWithHog)} bold />
        </Section>

        <Section title="IV. FINANCIAL SUMMARY BY ACTIVITY">
          {activityTotals.size === 0 ? (
            <Line label="No ledger transactions recorded for this year." value="—" indent />
          ) : Array.from(activityTotals.entries()).map(([activityId, item]) => (
            <div key={activityId}>
              <div className="subheading">{item.title}</div>
              <Line label="Income" value={peso(item.income)} indent />
              <Line label="Expenses" value={peso(item.expense)} indent />
              <Line label="Net" value={peso(item.income - item.expense)} bold indent />
            </div>
          ))}
        </Section>

        <Section title="V. NET FINANCIAL POSITION">
          <Line label="Total Income / Receipts" value={peso(totalIncomeWithHog)} indent />
          <Line label="Less: Total Expenditures" value={`(${peso(totalExpenseWithHog)})`} indent />
          <div className="rule" />
          <Line label="NET SURPLUS / (DEFICIT)" value={peso(netPosition)} bold />
        </Section>
      </article>

      <article className="page">
        <header className="org-header">
          Republic of the Philippines<br />
          Province of Cebu<br />
          Municipality of Tuburan<br />
          Barangay Alegria
          <div className="org-name">Alegria Farmers Association (AFA)</div>
          <div className="registration">DOLE Registration No. 2315</div>
          <div className="report-title">APPENDIX A — PROPERTY &amp; EQUIPMENT INVENTORY</div>
        </header>

        <Section title="V. PROPERTY & EQUIPMENT INVENTORY">
          <div className="inventory">
            {inventory.length === 0 ? (
              <div className="inventory-row"><span>No items recorded.</span><span></span><span></span></div>
            ) : inventory.map((item) => (
              <div className="inventory-row" key={item.id}>
                <span>{item.name}</span>
                <span>{item.quantity} {item.unit}</span>
                <span>{item.condition} — {item.location || 'AFA Center'}</span>
              </div>
            ))}
          </div>
          <div className="rule" />
          <Line label="TOTAL ITEMS ON REGISTRY" value={String(inventory.length)} bold />
          <Line label="TOTAL QUANTITY / UNITS" value={String(inventoryCount)} indent />
        </Section>

        <p className="note">
          Prepared from the live association ledger, treasury accounts, and inventory registry. This statement is generated from the current system records and is subject to auditor verification.
        </p>

        <div className="signatures">
          <div className="signature">
            <strong>{treasurer.toUpperCase()}</strong><br />
            Treasurer, AFA — Prepared by
          </div>
          <div className="signature">
            <strong>{auditor.toUpperCase()}</strong><br />
            Auditor, AFA — Verified
          </div>
          <div className="signature">
            <strong>{president.toUpperCase()}</strong><br />
            President, AFA — Attested
          </div>
        </div>
      </article>
    </main>
  );
}
