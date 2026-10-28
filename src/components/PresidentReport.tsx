import "./president-report.css";
import { useEffect, useMemo, useRef } from "react";

import type {
  User,
  OfficerRole,
} from "../types";
import { OFFICER_ROLE_LABELS } from "../utils/officers";

/* ---------- Data shape (fill from FAMS state/API, not hardcoded) ----------
   Segregation of duties: the President's letterhead report carries the EXECUTIVE
   SUMMARY only — highlights, plans, and the officers directory. Financial
   statements are the Treasurer's report; member rosters are the Secretary's. */
export interface Officer { position: string; name: string; contact?: string }
export interface ReportData {
  year: number;
  org: {
    name: string; abbr: string; doleRegNo: string;
    province: string; municipality: string; barangay: string; logoSrc?: string;
  };
  highlights: string[];
  plans: string[];
  closingLine?: string;
  officers: Officer[];
  secretary: string; // signs "Certified True and Correct". Take from the Secretary account.
  president: string; // signs "Attested by". Take from the President account.
}

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
        ? <ul className="pr-list">{d.highlights.map((h, i) => <li key={`${i}-${h}`}>{h}</li>)}</ul>
        : <p className="pr-empty">No highlights recorded for this year.</p>}
    </Page>
  );
}

function Plans({ d }: { d: ReportData }) {
  return (
    <Page d={d} title={`Plans and Programs for ${d.year + 1}`}>
      {d.plans.length > 0
        ? <ol className="pr-list pr-roman">{d.plans.map((p, i) => <li key={`${i}-${p}`}>{p}</li>)}</ol>
        : <p className="pr-empty">No plans recorded for this year.</p>}
      {d.closingLine && <p className="pr-closing">{d.closingLine}</p>}
    </Page>
  );
}

/* Segregation of duties: the President's letterhead report is an EXECUTIVE SUMMARY only.
   - All financial statements belong to the Treasurer's report (OfficerReportModal → Treasurer).
   - All member roster pages belong to the Secretary's report (OfficerReportModal → Secretary).
   The President signs/attests; each department exports its own detailed report. */

function Officers({ d }: { d: ReportData }) {
  return (
    <Page d={d} title="List of Officers with Contact Information">
      <table className="pr-table">
        <thead><tr><th>Position</th><th>Names</th><th>Contact Number</th></tr></thead>
        <tbody>
          {d.officers.length === 0 ? (
            <tr><td colSpan={3} className="pr-empty">No officers on record.</td></tr>
          ) : d.officers.map((o, i) => (
            <tr key={`${i}-${o.position}`}><td>{o.position}</td><td>{o.name}</td><td>{o.contact ?? ""}</td></tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}


/* ---------- Report ---------- */
export default function PresidentReport({ data }: { data: ReportData }) {
  const resolvedData = data;

  const restoreTitleRef = useRef<(() => void) | null>(null);

  const exportPdf = () => {
    const prev = document.title;
    document.title = `${resolvedData.org.abbr}-Executive-Report-${resolvedData.year}`; // becomes the PDF filename
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      document.title = prev;
      window.removeEventListener("afterprint", restore);
      if (timer !== undefined) clearTimeout(timer);
    };
    restoreTitleRef.current = restore;
    // Browsers capture the title when the print dialog opens; restore once it closes.
    // The timeout fallback is cancelled by restore() if afterprint fires in time.
    window.addEventListener("afterprint", restore);
    window.print();
    timer = setTimeout(restore, 1000);
  };
  // Safety net: if the component unmounts mid-print, always restore the title.
  useEffect(() => () => {
    restoreTitleRef.current?.();
  }, []);
  return (
    <div className="pr-root">
      <div className="pr-toolbar"><button onClick={exportPdf}>Export PDF</button></div>
      <Highlights d={resolvedData} />
      <Plans d={resolvedData} />
      <Officers d={resolvedData} />
    </div>
  );
}

/* ---------- Mappers: real FAMS state/API → ReportData ---------- */
export const DEFAULT_ORG = {
  name: "Alegria Farmers Association",
  abbr: "AFA",
  doleRegNo: "2315", // TODO: move to org settings once it's a configurable field
  province: "Cebu",
  municipality: "Tuburan",
  barangay: "Alegria",
} as const;

export function buildReportData(input: {
  year: number;
  users?: User[];
  highlights?: string[];
  plans?: string[];
  closingLine?: string;
  logoSrc?: string;
  doleRegNo?: string;
}): ReportData {
  const {
    year, users = [],
    highlights = [], plans = [], closingLine, logoSrc, doleRegNo = DEFAULT_ORG.doleRegNo,
  } = input;

  // Never leave Officer signatories blank: prefer the live account, fall back to the role title.
  // No hardcoded officer names — documents always reflect the officers delegated in the system.
  const signatory = (role: OfficerRole, fallback: string) =>
    users.find((u) => u.role === role)?.name || fallback;

  // Display label for each officer role (shared single source of truth).
  const toOfficerRow = (u: User): Officer => ({
    position: OFFICER_ROLE_LABELS[u.role as OfficerRole] ?? String(u.role).replace(/_/g, " "),
    name: u.name,
    contact: u.contactNumber,
  });

  return {
    year,
    org: {
      ...DEFAULT_ORG,
      doleRegNo,
      logoSrc: logoSrc ?? "/logo.svg",
    },
    highlights,
    plans,
    closingLine,
    officers: users
      .filter((u) => u.role !== "Member")
      .map(toOfficerRow),
    secretary: signatory("Secretary", "AFA Secretary"),
    president: signatory("President", "AFA President"),
  };
}

/* ---------- Ready-to-use wiring component (maps FAMS state → report) ---------- */
export function PresidentReportContainer(props: {
  year: number;
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
  org: { ...DEFAULT_ORG },
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
  officers: [],
  secretary: "AFA Secretary",
  president: "AFA President",
};
