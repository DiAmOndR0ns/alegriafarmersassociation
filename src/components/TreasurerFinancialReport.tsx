/**
 * TREASURER'S OFFICIAL FINANCIAL STATEMENT (print / PDF).
 *
 * Uses the ASSOCIATION'S OFFICIAL FINANCIAL-STATEMENT FORMAT (traditional
 * ledger-style letter pages, as used by AFA for its financial exports):
 * letterhead header → "FINANCIAL STATEMENT (Year Ended Dec. 31, YYYY)" →
 * ledger line sections (Cash Balance, Income, Expenditures, Property &
 * Equipment inventory) → signature block.
 *
 * SEGREGATION OF DUTIES: ALL financial exports belong EXCLUSIVELY to the
 * Treasurer's dashboard. The President's letterhead report is an executive
 * summary only and carries no treasury figures; the Treasurer signs the
 * statement and the President attests.
 *
 * All officer names resolve LIVE from the accounts delegated in the system —
 * no hardcoded officer names. All figures come from the system ledger.
 */
import { useEffect, useRef } from 'react';
import { FinancialTransaction, HogRaisingState, InventoryItem, OfficerRole, OrganizationFund, User } from '../types';
import { resolveOfficerName } from '../utils/officers';

interface TreasurerFinancialReportProps {
  /** Fiscal year of the statement — defaults to the CURRENT year when omitted. */
  year?: number;
  transactions: FinancialTransaction[];
  funds: OrganizationFund[];
  hogRaising?: HogRaisingState;
  inventory?: InventoryItem[];
  users?: User[];
  onClose?: () => void;
}

const peso = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Ledger primitives (association's official format) ---------- */
function Line({ label, value, bold = false, indent = false }: {
  label: string; value: string; bold?: boolean; indent?: boolean;
}) {
  return (
    <div className={`line ${bold ? 'bold' : ''} ${indent ? 'indent' : ''}`}>
      <span>{label}</span>
      <span className="amount">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export default function TreasurerFinancialReport({
  year: yearProp,
  transactions,
  funds,
  hogRaising,
  inventory = [],
  users = [],
  onClose
}: TreasurerFinancialReportProps) {
  // Always reflect the CURRENT year unless an explicit fiscal year is passed.
  const year = yearProp ?? new Date().getFullYear();
  const treasurer = resolveOfficerName(users, 'Treasurer' as OfficerRole);
  const auditor = resolveOfficerName(users, 'Auditor' as OfficerRole);
  const president = resolveOfficerName(users, 'President' as OfficerRole);
  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  /* ----- Figures from the system ledger (no hardcoded amounts) ----- */
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netBalance = totalIncome - totalExpense;

  // Fund accounts: cash on hand per treasury account
  const totalFundBalance = funds.reduce((s, f) => s + f.currentBalance, 0);
  const totalAllocated = funds.reduce((s, f) => s + f.allocatedAmount, 0);

  // Income & expenditure by category (per association ledger categories)
  const incomeCategoryTotals: Record<string, number> = {};
  const expenseCategoryTotals: Record<string, number> = {};
  transactions.forEach(t => {
    if (t.type === 'income') {
      incomeCategoryTotals[t.category] = (incomeCategoryTotals[t.category] || 0) + t.amount;
    } else {
      expenseCategoryTotals[t.category] = (expenseCategoryTotals[t.category] || 0) + t.amount;
    }
  });

  // Hog Raising IGP (fiscal year)
  const hogExpenses = (hogRaising?.expenses || [])
    .filter(e => e.date?.startsWith(String(year)))
    .reduce((s, e) => s + e.amount, 0);
  const hogSales = (hogRaising?.sales || [])
    .filter(s => s.date?.startsWith(String(year)))
    .reduce((s, e) => s + e.revenue, 0);
  const hogNet = hogSales - hogExpenses;

  // Property & Equipment inventory (Auditor custody, reported by Treasurer)
  const inventoryCount = inventory.reduce((s, i) => s + (i.quantity || 0), 0);

  const restoreTitleRef = useRef<(() => void) | null>(null);

  const exportPdf = () => {
    const prev = document.title;
    document.title = `AFA-Financial-Statement-${year}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      document.title = prev;
      window.removeEventListener('afterprint', restore);
      if (timer !== undefined) clearTimeout(timer);
    };
    restoreTitleRef.current = restore;
    window.addEventListener('afterprint', restore);
    window.print();
    timer = setTimeout(restore, 1000);
  };

  useEffect(() => () => { restoreTitleRef.current?.(); }, []);

  return (
    <main className="document">
      <style>{`
        @page { size: letter; margin: 0.65in; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #ececec; color: #171717; font-family: Arial, Helvetica, sans-serif; }
        .document { width: 8.5in; margin: 24px auto; }
        .page { min-height: 9.7in; padding: 0.25in 0.3in; background: white; margin-bottom: 24px; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        .org-header { text-align: center; line-height: 1.35; font-size: 12px; font-weight: 700; }
        .org-name { margin-top: 22px; font-size: 13px; }
        .registration { margin-top: 5px; font-size: 12px; }
        .report-title { margin: 26px 0 20px; text-align: center; font-weight: 700; font-size: 14px; }
        .section { margin: 18px 0 24px; break-inside: avoid; }
        .section h2 { font-size: 13px; font-weight: 700; margin: 0 0 12px; }
        .line { display: grid; grid-template-columns: 1fr 2.25in; gap: 12px; align-items: baseline; font-size: 12px; line-height: 1.75; }
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
          body { background: white; }
          .document { width: auto; margin: 0; }
          .page { min-height: 9.7in; margin: 0; padding: 0; }
          .no-print { display: none; }
        }
      `}</style>

      <div className="no-print" style={{ padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, color: '#555' }}>
          Printable financial statement · Ctrl/Cmd + P to print, or Export PDF.
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          {onClose && (
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl border border-slate-400 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer">
              ✕ Close
            </button>
          )}
          <button type="button" onClick={exportPdf} className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black cursor-pointer">
            Export PDF
          </button>
        </span>
      </div>

      {/* ================= PAGE 1 — CASH & RECEIPTS ================= */}
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

        <Section title="I. CASH BALANCE">
          {funds.length === 0 ? (
            <Line label="No treasury accounts registered." value="—" indent />
          ) : funds.map(f => (
            <Line key={f.id} label={`${f.code} — ${f.name}`} value={peso(f.currentBalance)} indent />
          ))}
          <div className="rule" />
          <Line label="TOTAL CASH BALANCE, ALL ACCOUNTS" value={peso(totalFundBalance)} bold />
        </Section>

        <Section title="II. INCOME / RECEIPTS">
          {Object.entries(incomeCategoryTotals).length === 0 ? (
            <Line label="No income recorded for the period." value="—" indent />
          ) : Object.entries(incomeCategoryTotals).map(([cat, amt]) => (
            <Line key={cat} label={cat} value={peso(amt)} indent />
          ))}
          <div className="subheading">Hog Raising IGP (Fiscal Year {year})</div>
          <Line label="IGP Sales" value={peso(hogSales)} indent />
          <div className="rule" />
          <Line label="TOTAL INCOME / RECEIPTS" value={peso(totalIncome + hogSales)} bold />
        </Section>

        <Section title="III. EXPENDITURES">
          {Object.entries(expenseCategoryTotals).length === 0 ? (
            <Line label="No expenditures recorded for the period." value="—" indent />
          ) : Object.entries(expenseCategoryTotals).map(([cat, amt]) => (
            <Line key={cat} label={cat} value={peso(amt)} indent />
          ))}
          <div className="subheading">Hog Raising IGP (Fiscal Year {year})</div>
          <Line label="IGP Expenses (feeds, stock, medication)" value={peso(hogExpenses)} indent />
          <div className="rule" />
          <Line label="TOTAL EXPENDITURES" value={peso(totalExpense + hogExpenses)} bold />
        </Section>

        <Section title="IV. NET FINANCIAL POSITION">
          <Line label="Total Income / Receipts" value={peso(totalIncome + hogSales)} indent />
          <Line label="Less: Total Expenditures" value={`(${peso(totalExpense + hogExpenses)})`} indent />
          <div className="rule" />
          <Line label="NET SURPLUS / (DEFICIT)" value={peso(netBalance + hogNet)} bold />
          <Line label="Total Allocated Capital, All Funds" value={peso(totalAllocated)} indent />
        </Section>

        <p className="note">
          Prepared from the association's official ledger as recorded in the FAMS treasury module.
          Figures are subject to the Auditor's verification. Financial Statement generated {reportDate}.
        </p>
      </article>

      {/* ================= PAGE 2 — PROPERTY, EQUIPMENT & SIGNATORIES ================= */}
      <article className="page">
        <header className="org-header">
          Republic of the Philippines<br />
          Province of Cebu<br />
          Municipality of Tuburan<br />
          Barangay Alegria
          <div className="org-name">Alegria Farmers Association (AFA)</div>
          <div className="registration">DOLE Registration No. 2315</div>
          <div className="report-title">FINANCIAL STATEMENT — PROPERTY &amp; EQUIPMENT (Year Ended: Dec. 31, {year})</div>
        </header>

        <Section title="V. PROPERTY & EQUIPMENT INVENTORY">
          <div className="inventory">
            {inventory.length === 0 ? (
              <div className="inventory-row"><span>No items recorded.</span><span></span><span></span></div>
            ) : inventory.map(i => (
              <div className="inventory-row" key={i.id}>
                <span>{i.name}</span>
                <span>{i.quantity} {i.unit}</span>
                <span>{i.condition} — {i.location || 'AFA Center'}</span>
              </div>
            ))}
          </div>
          <div className="rule" />
          <Line label="TOTAL ITEMS ON REGISTRY" value={String(inventory.length)} bold />
          <Line label="TOTAL QUANTITY / UNITS" value={String(inventoryCount)} indent />
        </Section>

        <p className="note">
          Custodial notes are maintained by the Auditor; this registry is presented by the Treasurer
          for the completeness of the financial statement.
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

        <p className="note" style={{ textAlign: 'center', marginTop: 30 }}>
          *** Certified Official Financial Record of the Alegria Farmers Association (AFA) —
          Barangay Alegria, Tuburan, Cebu — segregated to the Treasurer's Dashboard ***
        </p>
      </article>
    </main>
  );
}
