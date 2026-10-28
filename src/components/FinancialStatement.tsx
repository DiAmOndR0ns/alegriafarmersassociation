import React from "react";

/**
 * Printable transcription of the two photographed Alegria Farmers Association
 * financial-statement pages. Save as FinancialStatement.tsx in a React app.
 *
 * Print from the browser (Ctrl/Cmd + P). The print stylesheet creates two
 * clean, letter-sized pages. Review the transcription against the originals
 * before using it as an official financial record; a few labels are partly
 * obscured in the photographs and some figures appear internally inconsistent.
 */

const money = (value: string) => value;

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
    <div className={`line ${bold ? "bold" : ""} ${indent ? "indent" : ""}`}>
      <span>{label}</span>
      <span className="amount">{money(value)}</span>
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

export default function FinancialStatement() {
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

      <div className="no-print" style={{ padding: "10px 0", fontSize: 12, color: "#555" }}>
        Printable transcription · Use Ctrl/Cmd + P to print
      </div>

      <article className="page">
        <header className="org-header">
          Republic of the Philippines<br />
          Province of Cebu<br />
          Municipality of Tuburan<br />
          Barangay Alegria
          <div className="org-name">Alegria Farmers Association (AFA)</div>
          <div className="registration">DOLE Registration No. 2315</div>
          <div className="report-title">FINANCIAL STATEMENT (Year Ended: Dec. 31, 2025)</div>
        </header>

        <Section title="I. CASH POSITION">
          <div className="subheading">General Fund</div>
          <Line label="Cash in bank — FCCT Cooperative Bank" value="PHP 40,000.00" indent />
          <Line label="Petty cash / revolving liquid balance" value="PHP 12,450.00" indent />
          <div className="rule" />
          <Line label="Total Cash Position" value="PHP 52,450.00" bold />

          <div className="subheading">Restricted Fund Allocations</div>
          <Line label="GF-SLP (DSWD Sustainable Livelihood Program)" value="PHP 50,000.00" indent />
          <Line label="DOLE-DILP (Integrated Livelihood Program)" value="PHP 85,000.00" indent />
          <Line label="CBU — Member Capital Build-Up" value="PHP 25,000.00" indent />
          <Line label="ATI-TRG (Training & Capacity Building)" value="PHP 15,000.00" indent />
          <div className="rule" />
          <Line label="Total Restricted Fund Allocations" value="PHP 175,000.00" bold />
        </Section>

        <Section title="II. INCOME">
          <Line label="Membership dues (42 members, annual)" value="PHP 4,200.00" indent />
          <Line label="Chairs & sacks rental income" value="PHP 18,600.00" indent />
          <Line label="Produce sales (coffee, corn, coconut)" value="PHP 31,850.00" indent />
          <Line label="Hog raising IGP — sales" value="PHP 96,400.00" indent />
          <Line label="Donations & grants" value="PHP 15,000.00" indent />
          <div className="rule" />
          <Line label="Total Income" value="PHP 166,050.00" bold />
        </Section>

        <Section title="III. EXPENDITURES">
          <Line label="Feeds, vitamins & veterinary supplies" value="PHP 54,300.00" indent />
          <Line label="Piglets / livestock stock purchases" value="PHP 38,000.00" indent />
          <Line label="Meeting snacks & logistics" value="PHP 6,240.00" indent />
          <Line label="Equipment purchase & maintenance" value="PHP 9,860.00" indent />
          <Line label="Honorarium & training" value="PHP 12,000.00" indent />
          <Line label="Other operating expenses" value="PHP 4,315.00" indent />
          <div className="rule" />
          <Line label="Total Expenditures" value="PHP 124,715.00" bold />
        </Section>

        <Section title="IV. SUMMARY">
          <Line label="Total Income" value="PHP 166,050.00" indent />
          <Line label="Less: Total Expenditures" value="(PHP 124,715.00)" indent />
          <div className="rule" />
          <Line label="NET SURPLUS" value="PHP 41,335.00" bold />
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
          <div className="report-title">APPENDIX A — PROPERTY & EQUIPMENT INVENTORY</div>
        </header>

        <Section title="V. PROPERTY & EQUIPMENT">
          <div className="inventory">
            <div className="inventory-row">
              <span>Item</span>
              <span>Qty</span>
              <span>Description / Condition</span>
            </div>
            <div className="inventory-row">
              <span>Monobloc chairs</span>
              <span>100</span>
              <span>White & beige, rental assets — Good condition</span>
            </div>
            <div className="inventory-row">
              <span>Woven sacks (50kg)</span>
              <span>250</span>
              <span>Harvest & storage — Good condition</span>
            </div>
            <div className="inventory-row">
              <span>Knapsack sprayers</span>
              <span>4</span>
              <span>1 unit with solar charging battery — Good</span>
            </div>
            <div className="inventory-row">
              <span>Communal corn storage</span>
              <span>1</span>
              <span>Solar dryer facility, Sitio Tapon — Good</span>
            </div>
            <div className="inventory-row">
              <span>Hog pens (communal)</span>
              <span>3</span>
              <span>Sitio Pundok 1 & 2 — 1 unit needs roof repair</span>
            </div>
          </div>
          <div className="rule" />
          <Line label="Total Items on Registry" value="358" bold />
        </Section>

        <div className="signatures">
          <div className="signature">
            Treasurer
          </div>
          <div className="signature">
            President
          </div>
        </div>

        <p className="note">
          Note: This is a transcription of the association's photographed financial-statement
          pages. A few labels are partly obscured in the photographs and some figures appear
          internally inconsistent; review against the originals before using as an official
          financial record.
        </p>
      </article>
    </main>
  );
}
