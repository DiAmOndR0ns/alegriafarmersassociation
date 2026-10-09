import "./president-report.css";
import { useMemo } from "react";

import type {
  Member,
  OrganizationFund,
  FinancialTransaction,
  User,
  OfficerRole,
} from "../types";
import { splitName } from "../utils/names";

/* ---------- Data shape (fill from FAMS state/API, not hardcoded) ---------- */
export interface Money { label: string; amount: number; note?: string }
export interface FundSection { heading?: string; rows: Money[]; totalLabel?: string }
export interface Fund { name: string; balance: number; sections: FundSection[] }
export interface Officer { position: string; name: string; contact?: string }
/** One row of the printed member roster (split from the FAMS `Member`). */
export interface MemberRow {
  surname: string; first: string; mi?: string;
  sex: "F" | "M"; dob?: string /* ISO yyyy-mm-dd */; contact?: string;
}
export interface ReportData {
  year: number;
  org: {
    name: string; abbr: string; doleRegNo: string;
    province: string; municipality: string; barangay: string; logoSrc?: string;
  };
  highlights: string[];
  plans: string[];
  closingLine?: string;
  funds: Fund[];
  officers: Officer[];
  members: MemberRow[];
  secretary: string; // signs "Certified True and Correct". Take from the Secretary account.
  president: string; // signs "Attested by". Take from the President account.
}

/* ---------- Helpers ---------- */
const peso = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDob = (iso?: string) => {
  if (!iso) return "";
  const dt = new Date(iso + "T00:00:00");
  return Number.isNaN(dt.getTime())
    ? ""
    : dt.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};
const chunk = <T,>(a: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/* ---------- Page shell: letterhead + title + signature block on every page ---------- */
function Page({ d, title, children }: { d: ReportData; title?: string; children: React.ReactNode }) {
  const { org } = d;
  return (
    <section className="pr-page">
      <header className="pr-head">
        {org.logoSrc && <img className="pr-logo" src={org.logoSrc} alt={`${org.name} logo`} />}
        <div className="pr-gov">
          Republic of the Philippines<br />Province of {org.province}<br />
          Municipality of {org.municipality}<br />Barangay {org.barangay}
        </div>
        <div className="pr-org">
          {org.name} ({org.abbr})<br />DOLE Registration NO. {org.doleRegNo}
        </div>
      </header>
      {title && <h2 className="pr-title" style={{ fontWeight: 400 }}>{title}</h2>}
      <div className="pr-body">{children}</div>
      <footer className="pr-sign">
        <div>
          <div className="role">Certified True and Correct:</div>
          <div className="space" />
          <div className="name">{d.secretary}</div>
          <div>Secretary</div>
        </div>
        <div className="right">
          <div className="role">Attested by:</div>
          <div className="space" />
          <div className="name">{d.president}</div>
          <div>President</div>
        </div>
      </footer>
    </section>
  );
}

/* ---------- Sections ---------- */
function Highlights({ d }: { d: ReportData }) {
  return (
    <Page d={d} title={`Highlights of Programs and Activities in ${d.year}`}>
      {d.highlights.length > 0
        ? <ul className="pr-list">{d.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        : <p className="pr-empty">No highlights recorded for this year.</p>}
    </Page>
  );
}

function Plans({ d }: { d: ReportData }) {
  return (
    <Page d={d} title={`Plans and Programs for ${d.year + 1}`}>
      {d.plans.length > 0
        ? <ol className="pr-list pr-roman">{d.plans.map((p) => <li key={p}>{p}</li>)}</ol>
        : <p className="pr-empty">No plans recorded for this year.</p>}
      {d.closingLine && <p className="pr-closing">{d.closingLine}</p>}
    </Page>
  );
}

function Financials({ d }: { d: ReportData }) {
  const total = d.funds.reduce((s, f) => s + f.balance, 0); // computed, never typed in
  return (
    <>
      <Page d={d} title={`FINANCIAL STATEMENT (Year Ended: Dec. 31, ${d.year})`}>
        <div className="pr-fund">
          <h3>Summary</h3>
          {d.funds.map((f) => (
            <div className="pr-row" key={f.name}><span>{f.name}</span><span>:</span><span className="amt">{peso(f.balance)}</span></div>
          ))}
          <div className="pr-row total"><span>Total</span><span>:</span><span className="amt">{peso(total)}</span></div>
        </div>
        {d.funds.map((f) => (
          <div className="pr-fund" key={f.name}>
            <h3>{f.name}</h3>
            {f.sections.map((s, i) => {
              const sum = s.rows.reduce((t, r) => t + r.amount, 0);
              return (
                <div key={i}>
                  {s.heading && <div className="pr-sub">{s.heading}</div>}
                  {s.rows.map((r) => (
                    <div key={r.label}>
                      <div className="pr-row"><span>{r.label}</span><span>:</span><span className="amt">{peso(r.amount)}</span></div>
                      {r.note && <div className="pr-note">{r.note}</div>}
                    </div>
                  ))}
                  {s.totalLabel && (
                    <div className="pr-row total"><span>{s.totalLabel}</span><span>:</span><span className="amt">{peso(sum)}</span></div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </Page>
    </>
  );
}

function Officers({ d }: { d: ReportData }) {
  return (
    <Page d={d} title="List of Officers with Contact Information">
      <table className="pr-table">
        <thead><tr><th>Position</th><th>Names</th><th>Contact Number</th></tr></thead>
        <tbody>
          {d.officers.length === 0 ? (
            <tr><td colSpan={3} className="pr-empty">No officers on record.</td></tr>
          ) : d.officers.map((o) => (
            <tr key={o.position}><td>{o.position}</td><td>{o.name}</td><td>{o.contact ?? ""}</td></tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}

const ROWS_PER_PAGE = 26;
function MemberPages({ d, sex }: { d: ReportData; sex: "F" | "M" }) {
  const list = d.members
    .filter((m) => m.sex === sex)
    .sort((a, b) => a.surname.localeCompare(b.surname));
  return (
    <>
      {list.length === 0 ? (
        <Page d={d} title={`Updated List of Members: ${sex === "F" ? "Female" : "Male"}`}>
          <p className="pr-empty">No {sex === "F" ? "female" : "male"} members on record.</p>
        </Page>
      ) : chunk(list, ROWS_PER_PAGE).map((rows, p) => (
        <Page d={d} key={p} title={`Updated List of Members: ${sex === "F" ? "Female" : "Male"}`}>
          <table className="pr-table">
            <thead>
              <tr><th className="num" /><th>Surname</th><th>First name</th><th className="mi">MI</th><th>Date of Birth</th><th>Contact Number</th></tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={i}>
                  <td className="num">{p * ROWS_PER_PAGE + i + 1}.</td>
                  <td>{m.surname}</td><td>{m.first}</td><td>{m.mi}</td>
                  <td>{fmtDob(m.dob)}</td><td>{m.contact ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Page>
      ))}
    </>
  );
}

/* ---------- Report ---------- */
export default function PresidentReport({ data }: { data: ReportData }) {
  const exportPdf = () => {
    const prev = document.title;
    document.title = `${data.org.abbr}-President-Report-${data.year}`; // becomes the PDF filename
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
    };
    // Browsers capture the title when the print dialog opens; restore after it closes
    // (with a timeout fallback for browsers that don't fire afterprint).
    window.addEventListener("afterprint", restore);
    window.print();
    setTimeout(restore, 1000);
  };
  return (
    <div className="pr-root">
      <div className="pr-toolbar"><button onClick={exportPdf}>Export PDF</button></div>
      <Highlights d={data} />
      <Plans d={data} />
      <Financials d={data} />
      <Officers d={data} />
      <MemberPages d={data} sex="F" />
      <MemberPages d={data} sex="M" />
    </div>
  );
}

/* ---------- Mappers: real FAMS state/API → ReportData ---------- */
const DOLE_REG_NO = "2315"; // TODO: move to org settings once it's a configurable field

export function buildReportData(input: {
  year: number;
  members: Member[];
  funds?: OrganizationFund[];
  transactions?: FinancialTransaction[];
  users?: User[];
  highlights?: string[];
  plans?: string[];
  closingLine?: string;
  logoSrc?: string;
  doleRegNo?: string;
}): ReportData {
  const {
    year, members, funds = [], transactions = [], users = [],
    highlights = [], plans = [], closingLine, logoSrc, doleRegNo = DOLE_REG_NO,
  } = input;

  const activeMembers = members.filter((m) => (m.status ?? "Active") === "Active");

  // Never leave Officer signatories blank: prefer the live account, fall back to the role title.
  const signatory = (role: OfficerRole, fallback: string) =>
    users.find((u) => u.role === role)?.name || fallback;

  return {
    year,
    org: {
      name: "Alegria Farmers Association",
      abbr: "AFA",
      doleRegNo,
      province: "Cebu",
      municipality: "Tuburan",
      barangay: "Alegria",
      logoSrc: logoSrc ?? "/logo.svg",
    },
    highlights,
    plans,
    closingLine,
    funds: funds.map((f) => ({
      name: f.name,
      balance: f.currentBalance,
      sections: [
        { heading: "Allocations (Year to Date)", rows: [
          { label: "Allocated Amount", amount: f.allocatedAmount },
          { label: "Transactions Logged", amount: transactions.filter((t) => t.fundSource === f.code).length },
          { label: "Current Balance", amount: f.currentBalance, note: `Custodian: ${f.custodian}` },
        ] },
      ],
    })),
    officers: users
      .filter((u) => u.role !== "Member")
      .map((u) => ({
        position: u.role.replace("_", " "),
        name: u.name,
        contact: u.contactNumber,
      })),
    members: activeMembers.map((m) => {
      const { surname, first, mi } = splitName(m.name);
      return {
        surname,
        first,
        mi,
        // Report has only binary columns; "Other"/unset falls back to Female list.
        sex: m.gender === "Male" ? ("M" as const) : ("F" as const),
        dob: m.birthDate,
        contact: m.contactNumber,
      };
    }),
    secretary: signatory("Secretary", "Jennylyn S. Lumactao"),
    president: signatory("President", "Zenaida A. Elbiña"),
  };
}

/* ---------- Ready-to-use wiring component (maps FAMS state → report) ---------- */
export function PresidentReportContainer(props: {
  year: number;
  members: Member[];
  funds?: OrganizationFund[];
  transactions?: FinancialTransaction[];
  users?: User[];
  highlights?: string[];
  plans?: string[];
  closingLine?: string;
}) {
  const data = useMemo(() => buildReportData(props), [props]);
  return <PresidentReport data={data} />;
}

/* ---------- Sample data (kept for preview/Storybook use) ---------- */
export const sampleReport: ReportData = {
  year: 2025,
  org: { name: "Alegria Farmers Association", abbr: "AFA", doleRegNo: "2315", province: "Cebu", municipality: "Tuburan", barangay: "Alegria" },
  highlights: [
    "The association participated in the barangay Clean Up Drive, which is done twice a year.",
    "ATI RTC7 awarded 1.5 Million Pesos for the 40 Head Swine Fattening Project (SIRP).",
  ],
  plans: [
    "Follow up the Ready to Lay Chicken Project at the Department of Agriculture DA7",
    "Improve and increase the production of the DILEEP project of DOLE7",
    "Strengthen the bond of the members of the association.",
  ],
  closingLine: "MABUHAY ANG MGA MAG-UUMA, Welcome 2026!",
  funds: [
    { name: "DILEEP / DOLE", balance: 512935.85, sections: [
      { rows: [
        { label: "Gross Sales", amount: 1191865 }, { label: "Expenses", amount: 1153374 },
      ] },
      { heading: "Breakdown:", totalLabel: "Total", rows: [
        { label: "Savings Deposit (FCCT)", amount: 367441.95 },
        { label: "Cash on Hand", amount: 41947 },
        { label: "Collectibles", amount: 103547 },
      ] },
    ] },
  ],
  officers: [
    { position: "President", name: "Zenaida A. Elbina", contact: "09358282315" },
    { position: "Vice President", name: "Anselma B. Arnado", contact: "09193969362" },
  ],
  members: [
    { surname: "Arnado", first: "Anselma", mi: "B", sex: "F", dob: "1962-06-01", contact: "09193969362" },
    { surname: "Balen", first: "Jeffrey", mi: "D", sex: "M", dob: "1968-06-03" },
  ],
  secretary: "Joan A. Cebas",
  president: "Zenaida A. Elbina",
};
